import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AppleBoxEngine } from '../physics/engine';
import {
  CameraPreset,
  TelemetrySnapshot,
  ThermodynamicStage,
  WallFace,
} from '../physics/types';
import { buildRealisticAppleMesh, RealisticAppleAssembly } from './appleMesh';
import { buildContainmentBox, ContainmentBoxAssembly } from './containmentBox';

export interface SceneVisualState {
  coreView: boolean;
  showVelocityVectors: boolean;
}

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  isometric: { pos: [7.6, 5.2, 8.8], target: [0, -0.15, 0] },
  front: { pos: [0, 0.2, 11.4], target: [0, -0.1, 0] },
  top: { pos: [0.01, 11.8, 1.8], target: [0, 0, 0] },
  inside: { pos: [2.6, 1.3, 2.8], target: [0, 0.15, 0] },
};

const WALL_FACES: WallFace[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

// Pre-allocated scratch helpers (zero GC inside render loop)
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _gasColor = new THREE.Color();
const _rotColor = new THREE.Color(0x52361c);
const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class AppleBoxSceneController {
  public readonly engine: AppleBoxEngine;
  private readonly container: HTMLElement;
  private readonly onTelemetry: (snapshot: TelemetrySnapshot) => void;
  private readonly onContextLost?: (lost: boolean) => void;

  private readonly isSoftwareGl: boolean;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly boxAssembly: ContainmentBoxAssembly;
  private readonly appleMesh: RealisticAppleAssembly;
  private readonly envRT: THREE.WebGLRenderTarget;

  private particleMesh!: THREE.InstancedMesh;
  private particleGeo!: THREE.SphereGeometry;
  private particleMat!: THREE.MeshStandardMaterial;

  private vectorLines!: THREE.LineSegments;
  private vectorPositions!: Float32Array;
  private vectorColors!: Float32Array;
  private vectorGeo!: THREE.BufferGeometry;
  private vectorMat!: THREE.LineBasicMaterial;

  private visualState: SceneVisualState = {
    coreView: false,
    showVelocityVectors: true,
  };

  private paused = false;
  private disposed = false;
  private frameId = 0;
  private lastTimestamp = 0;
  private telemetryTimer = 0;
  private transitioningCamera = false;

  private readonly handleResizeBound: () => void;
  private readonly handleContextLostBound: (e: Event) => void;
  private readonly handleContextRestoredBound: () => void;

  constructor(
    container: HTMLElement,
    onTelemetry: (snapshot: TelemetrySnapshot) => void,
    onContextLost?: (lost: boolean) => void
  ) {
    this.container = container;
    this.onTelemetry = onTelemetry;
    this.onContextLost = onContextLost;

    this.engine = new AppleBoxEngine({
      particleCount: 680,
      boxSize: 6.0,
      temperatureK: 310,
      stage: 'solid', // Starts peacefully on the fresh realistic glossy 3D apple!
    });
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(320, container.clientWidth || window.innerWidth);
    const height = Math.max(240, container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'apple-box-canvas');
    container.appendChild(this.renderer.domElement);

    // Clean clinical light studio laboratory backdrop matching reference images (#F4F7FB)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf4f7fb);

    // Studio RoomEnvironment for glossy apple clearcoat & metallic chamber highlights
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRT = pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRT.texture;
    roomEnv.dispose();
    pmrem.dispose();

    // Camera & OrbitControls
    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    const initialPreset = CAMERA_PRESETS.isometric;
    this.camera.position.set(...initialPreset.pos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...initialPreset.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 2.6;
    this.controls.maxDistance = 20;
    this.controls.maxPolarAngle = Math.PI * 0.56;
    this.controls.update();

    this.controls.addEventListener('start', () => {
      this.transitioningCamera = false;
    });

    // Balanced Light Studio 3-Point Rig (Warm Key + Cool Fill + Soft Rim)
    const hemiLight = new THREE.HemisphereLight(0xf8fbff, 0xcbd5e1, 0.95);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.05);
    keyLight.position.set(7.5, 11.5, 8.5);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 30;
      const d = 6.0;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.9);
    rimLight.position.set(-8, 5, -7);
    this.scene.add(rimLight);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // 1. Sealed Laboratory Containment Chamber + Frosted Pedestal
    this.boxAssembly = buildContainmentBox(
      this.engine.params.boxSize,
      this.engine.appleCenterY,
      this.engine.appleScale,
      this.isSoftwareGl,
      maxAniso
    );
    this.scene.add(this.boxAssembly.group);

    // 2. Photorealistic Sculpted 3D Striped Apple Shell (morphs cleanly into microscopic atoms)
    this.appleMesh = buildRealisticAppleMesh(
      this.engine.appleScale,
      this.engine.appleCenterY,
      this.isSoftwareGl,
      maxAniso
    );
    this.scene.add(this.appleMesh.group);

    // 3. Microscopic Volumetric Multi-Tissue Atom InstancedMesh + Velocity Vectors
    this.rebuildParticleMeshes();
    this.syncVisuals();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.handleResizeBound = this.handleResize.bind(this);
    this.handleContextLostBound = (e: Event) => {
      e.preventDefault();
      this.onContextLost?.(true);
    };
    this.handleContextRestoredBound = () => {
      this.onContextLost?.(false);
    };
    window.addEventListener('resize', this.handleResizeBound);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLostBound);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestoredBound);

    this.onTelemetry(this.engine.getTelemetry());
    this.lastTimestamp = performance.now();
    this.scheduleNextFrame();
  }

  private rebuildParticleMeshes(): void {
    if (this.particleMesh) {
      this.scene.remove(this.particleMesh);
      this.particleGeo.dispose();
      this.particleMat.dispose();
    }
    if (this.vectorLines) {
      this.scene.remove(this.vectorLines);
      this.vectorGeo.dispose();
      this.vectorMat.dispose();
    }

    const count = this.engine.count;
    // Fine microscopic sphere geometry for molecular atoms
    this.particleGeo = new THREE.SphereGeometry(1, 10, 8);
    this.particleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.05,
    });

    this.particleMesh = new THREE.InstancedMesh(this.particleGeo, this.particleMat, count);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.castShadow = !this.isSoftwareGl;
    this.particleMesh.receiveShadow = !this.isSoftwareGl;
    this.particleMesh.renderOrder = 2;

    for (let i = 0; i < count; i++) {
      _color.setRGB(
        this.engine.baseColor[i * 3],
        this.engine.baseColor[i * 3 + 1],
        this.engine.baseColor[i * 3 + 2],
        THREE.SRGBColorSpace
      );
      this.particleMesh.setColorAt(i, _color);
    }
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.particleMesh);

    // Per-atom velocity vector tails (matching reference gas visualization!)
    this.vectorPositions = new Float32Array(count * 6);
    this.vectorColors = new Float32Array(count * 6);
    this.vectorGeo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this.vectorPositions, 3);
    const colAttr = new THREE.BufferAttribute(this.vectorColors, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    this.vectorGeo.setAttribute('position', posAttr);
    this.vectorGeo.setAttribute('color', colAttr);

    this.vectorMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.vectorLines = new THREE.LineSegments(this.vectorGeo, this.vectorMat);
    this.vectorLines.frustumCulled = false;
    this.vectorLines.renderOrder = 2;
    this.scene.add(this.vectorLines);
  }

  private syncVisuals(): void {
    const count = this.engine.count;
    const pos = this.engine.pos;
    const vel = this.engine.vel;
    const baseColor = this.engine.baseColor;
    const gasColor = this.engine.gasColor;
    const radius = this.engine.particleRadius;
    const solidAlpha = this.engine.solidShellAlpha;
    const decay = this.engine.decayProgress;
    const coreView = this.visualState.coreView;

    // 1. Update Photorealistic Glossy 3D Apple Shell (solid, decaying/slumping, or X-ray Core View)
    this.appleMesh.setAppearance(solidAlpha, decay, coreView);
    if (decay < 0.05 && solidAlpha > 0.8) {
      const breathe = 1.0 + Math.sin(this.engine.simTime * 2.8) * 0.0025;
      this.appleMesh.group.scale.setScalar(breathe);
    }

    // Show tiny microscopic atoms whenever apple begins decaying, in Core View, or in Gas/Reversal
    const showAtoms = coreView || solidAlpha < 0.96 || decay > 0.04;
    this.particleMesh.visible = showAtoms;

    // Show crisp velocity vector arrows during gas / reversal / vigorous decay motion
    const showVectors =
      this.visualState.showVelocityVectors && showAtoms && (solidAlpha < 0.55 || decay > 0.35);
    this.vectorLines.visible = showVectors;

    if (showAtoms) {
      // Blend atom appearance smoothly:
      // Solid/Core View -> anatomical tissue colors (crimson skin, cream flesh, dark seeds)
      // Decay -> enzymatic oxidation brown
      // Ergodic Gas -> crisp amber-orange & ice-cyan molecular species (matching reference!)
      const isGasLike = decay > 0.78 && !coreView;
      const gasMix = isGasLike ? Math.min(1, (decay - 0.78) / 0.22) : 0;
      const oxMix = !isGasLike ? Math.min(0.8, decay * 0.85) : 0;

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const x = pos[i3];
        const y = pos[i3 + 1];
        const z = pos[i3 + 2];

        _pos.set(x, y, z);
        // Tiny microscopic atom spheres!
        const r = radius * (isGasLike ? 1.1 : 0.96);
        _scale.set(r, r, r);
        _mat4.compose(_pos, _quat, _scale);
        this.particleMesh.setMatrixAt(i, _mat4);

        _color.setRGB(baseColor[i3], baseColor[i3 + 1], baseColor[i3 + 2], THREE.SRGBColorSpace);
        if (oxMix > 0.01) {
          _color.lerp(_rotColor, oxMix);
        }
        if (gasMix > 0.01) {
          _gasColor.setRGB(gasColor[i3], gasColor[i3 + 1], gasColor[i3 + 2], THREE.SRGBColorSpace);
          _color.lerp(_gasColor, gasMix);
        }
        this.particleMesh.setColorAt(i, _color);

        if (showVectors) {
          const i6 = i * 6;
          const vx = vel[i3];
          const vy = vel[i3 + 1];
          const vz = vel[i3 + 2];
          const tailScale = 0.042;
          this.vectorPositions[i6] = x;
          this.vectorPositions[i6 + 1] = y;
          this.vectorPositions[i6 + 2] = z;
          this.vectorPositions[i6 + 3] = x + vx * tailScale;
          this.vectorPositions[i6 + 4] = y + vy * tailScale;
          this.vectorPositions[i6 + 5] = z + vz * tailScale;

          // Match vector stroke color to atom color (or cool cyan during time-reversal)
          const cr = this.engine.isReversed ? 0.14 : _color.r;
          const cg = this.engine.isReversed ? 0.65 : _color.g;
          const cb = this.engine.isReversed ? 0.95 : _color.b;
          this.vectorColors[i6] = cr;
          this.vectorColors[i6 + 1] = cg;
          this.vectorColors[i6 + 2] = cb;
          this.vectorColors[i6 + 3] = cr;
          this.vectorColors[i6 + 4] = cg;
          this.vectorColors[i6 + 5] = cb;
        }
      }

      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }

      if (showVectors) {
        (this.vectorGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (this.vectorGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      }
    }

    // Subtle wall elastic bounce shimmer
    for (const face of WALL_FACES) {
      const mat = this.boxAssembly.wallFlashMeshes[face].material as THREE.MeshBasicMaterial;
      mat.opacity = this.engine.wallImpacts[face] * 0.08;
      mat.color.setHex(this.engine.isReversed ? 0x06b6d4 : 0x3b82f6);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private readonly tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastTimestamp) / 1000));
    this.lastTimestamp = now;

    if (!this.paused) {
      this.engine.advance(rawDt);
      this.syncVisuals();
    }

    if (this.transitioningCamera) {
      const k = 6.5;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camTargetPos.x, k, rawDt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camTargetPos.y, k, rawDt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camTargetPos.z, k, rawDt);

      this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, _camTargetLook.x, k, rawDt);
      this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, _camTargetLook.y, k, rawDt);
      this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, _camTargetLook.z, k, rawDt);

      if (
        this.camera.position.distanceToSquared(_camTargetPos) < 0.002 &&
        this.controls.target.distanceToSquared(_camTargetLook) < 0.002
      ) {
        this.camera.position.copy(_camTargetPos);
        this.controls.target.copy(_camTargetLook);
        this.transitioningCamera = false;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    this.telemetryTimer += rawDt;
    if (this.telemetryTimer >= 0.12) {
      this.telemetryTimer = 0;
      this.onTelemetry(this.engine.getTelemetry());
    }

    this.scheduleNextFrame();
  };

  // --- Imperative Public API ---

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public setStage(stage: ThermodynamicStage): void {
    this.paused = false;
    this.engine.setStage(stage);
    this.syncVisuals();
    this.onTelemetry(this.engine.getTelemetry());
  }

  public seekCycle(progress01: number): void {
    this.engine.seekCycleProgress(progress01);
    this.syncVisuals();
    this.onTelemetry(this.engine.getTelemetry());
  }

  public setTemperatureK(tempK: number): void {
    this.engine.setTemperatureK(tempK);
    this.onTelemetry(this.engine.getTelemetry());
  }

  public setTimeScale(scale: number): void {
    this.engine.params.timeScale = scale;
  }

  public reverseVelocities(): void {
    this.paused = false;
    this.engine.reverseVelocities();
    this.syncVisuals();
    this.onTelemetry(this.engine.getTelemetry());
  }

  public reset(): void {
    this.paused = false;
    this.engine.reset(this.engine.params.particleCount);
    this.engine.params.stage = 'solid';
    this.syncVisuals();
    this.onTelemetry(this.engine.getTelemetry());
  }

  public setVisualState(patch: Partial<SceneVisualState>): void {
    this.visualState = { ...this.visualState, ...patch };
    this.syncVisuals();
  }

  public setCameraPreset(preset: CameraPreset): void {
    const def = CAMERA_PRESETS[preset];
    _camTargetPos.set(...def.pos);
    _camTargetLook.set(...def.target);
    this.transitioningCamera = true;
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(320, this.container.clientWidth || window.innerWidth);
    const height = Math.max(240, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResizeBound);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLostBound);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestoredBound);

    this.controls.dispose();
    this.boxAssembly.dispose();
    this.appleMesh.dispose();
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.vectorGeo.dispose();
    this.vectorMat.dispose();
    this.envRT.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
