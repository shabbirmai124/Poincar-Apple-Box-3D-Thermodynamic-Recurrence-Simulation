import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AppleBoxEngine } from '../physics/engine';
import {
  CameraPreset,
  SPECIES_ID,
  TelemetrySnapshot,
  ThermodynamicStage,
  WallFace,
} from '../physics/types';
import { buildRealisticAppleMesh, RealisticAppleAssembly } from './appleMesh';
import { buildContainmentBox, ContainmentBoxAssembly } from './containmentBox';
import { buildSpaceBackdrop, SpaceBackdropAssembly } from './spaceBackdrop';

export interface SceneVisualState {
  coreView: boolean;
  showVelocityVectors: boolean;
}

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  isometric: { pos: [6.4, 3.2, 12.6], target: [0, -0.35, 0] },
  front: { pos: [0, -0.1, 13.0], target: [0, -0.25, 0] },
  top: { pos: [0.01, 13.4, 2.2], target: [0, -0.1, 0] },
  inside: { pos: [2.2, -0.4, 2.6], target: [0, -1.6, 0] },
};

const WALL_FACES: WallFace[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

// Pre-allocated scratch helpers (zero GC inside render loop)
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _targetColor = new THREE.Color();
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

function createAtomHaloTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(0.24, 'rgba(255, 255, 255, 0.52)');
  grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.1)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  private readonly spaceBackdrop: SpaceBackdropAssembly;
  private readonly boxAssembly: ContainmentBoxAssembly;
  private readonly appleMesh: RealisticAppleAssembly;
  private readonly envRT: THREE.WebGLRenderTarget;
  private readonly atomHaloTex: THREE.CanvasTexture;

  private particleMesh!: THREE.InstancedMesh;
  private particleGeo!: THREE.SphereGeometry;
  private particleMat!: THREE.MeshStandardMaterial;

  private atomHalos!: THREE.Points;
  private haloPositions!: Float32Array;
  private haloColors!: Float32Array;
  private haloGeo!: THREE.BufferGeometry;
  private haloMat!: THREE.PointsMaterial;

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

    // 1,100 ultra-fine fundamental particles, slow 0.5x observation of all 6 Apple-in-a-Box stages
    this.engine = new AppleBoxEngine({
      particleCount: 1100,
      boxSize: 6.0,
      temperatureK: 310,
      stage: 'full_cycle',
      timeScale: 0.5,
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
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'apple-box-canvas');
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x010308);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRT = pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.42;
    roomEnv.dispose();
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 140);
    const initialPreset = CAMERA_PRESETS.isometric;
    this.camera.position.set(...initialPreset.pos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...initialPreset.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 2.6;
    this.controls.maxDistance = 22;
    this.controls.update();

    this.controls.addEventListener('start', () => {
      this.transitioningCamera = false;
    });

    // Cinema Space-Studio 3-Point Lighting focused on the floor-resting apple & sealed glass cube
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x161925, 0.72);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.5);
    keyLight.position.set(5.2, 9.6, 8.0);
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

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.35);
    rimLight.position.set(-7.5, 4.5, -7.5);
    this.scene.add(rimLight);

    const fillLight = new THREE.PointLight(0xffd6b3, 1.1, 16);
    fillLight.position.set(2.4, -0.8, 4.2);
    this.scene.add(fillLight);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.atomHaloTex = createAtomHaloTexture();

    // 1. Deep Outer Space Nebula + Crisp Pinpoint Starfields
    this.spaceBackdrop = buildSpaceBackdrop();
    this.scene.add(this.spaceBackdrop.group);

    // 2. Sealed Indestructible Space Box with Brushed-Slate Floor
    this.boxAssembly = buildContainmentBox(
      this.engine.params.boxSize,
      this.isSoftwareGl,
      maxAniso
    );
    this.scene.add(this.boxAssembly.group);

    // 3. Floor-Grounded Photorealistic Deforming Apple + Mold + Wet Puddle + Dust Mound
    this.appleMesh = buildRealisticAppleMesh(
      this.engine.appleScale,
      this.engine.appleCenterY,
      this.engine.params.boxSize,
      this.isSoftwareGl,
      maxAniso
    );
    this.scene.add(this.appleMesh.group);

    // 4. 1,100 Fundamental Subatomic Particles (Protons, Neutrons, Electrons, Photons)
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
    if (this.atomHalos) {
      this.scene.remove(this.atomHalos);
      this.haloGeo.dispose();
      this.haloMat.dispose();
    }
    if (this.vectorLines) {
      this.scene.remove(this.vectorLines);
      this.vectorGeo.dispose();
      this.vectorMat.dispose();
    }

    const count = this.engine.count;

    this.particleGeo = new THREE.SphereGeometry(1, 8, 6);
    this.particleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.24,
      metalness: 0.14,
      emissive: 0x1e293b,
      emissiveIntensity: 0.32,
    });

    this.particleMesh = new THREE.InstancedMesh(this.particleGeo, this.particleMat, count);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
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

    // Soft glowing quantum halo sprites (strong for protons/electrons/photons, muted for matte dust!)
    this.haloPositions = new Float32Array(count * 3);
    this.haloColors = new Float32Array(count * 3);
    this.haloGeo = new THREE.BufferGeometry();
    const hPosAttr = new THREE.BufferAttribute(this.haloPositions, 3);
    const hColAttr = new THREE.BufferAttribute(this.haloColors, 3);
    hPosAttr.setUsage(THREE.DynamicDrawUsage);
    hColAttr.setUsage(THREE.DynamicDrawUsage);
    this.haloGeo.setAttribute('position', hPosAttr);
    this.haloGeo.setAttribute('color', hColAttr);

    this.haloMat = new THREE.PointsMaterial({
      size: 0.15,
      map: this.atomHaloTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.atomHalos = new THREE.Points(this.haloGeo, this.haloMat);
    this.atomHalos.frustumCulled = false;
    this.atomHalos.renderOrder = 3;
    this.scene.add(this.atomHalos);

    // Delicate momentum / photon light trails
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
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
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
    const dustColor = this.engine.dustColor;
    const gasColor = this.engine.gasColor;
    const species = this.engine.species;
    const radius = this.engine.particleRadius;
    const solidAlpha = this.engine.solidShellAlpha;
    const decay = this.engine.decayProgress;
    const puddle = this.engine.puddleProgress;
    const dust = this.engine.dustProgress;
    const coreView = this.visualState.coreView;

    // 1. Update Floor-Resting Photorealistic Apple + Mold/Rot + Wet Puddle + Dust Mound
    this.appleMesh.setAppearance(solidAlpha, decay, puddle, dust, coreView);

    const isQuantumSoup = !coreView && decay > 0.9 && puddle < 0.08 && dust < 0.15 && solidAlpha < 0.1;
    const isDustStage = !coreView && dust >= 0.15;
    const isDecayStage = !coreView && decay > 0.06 && !isDustStage && !isQuantumSoup;

    // Show particles whenever in Core View, Decay (volatile vapors), Dust, Quantum Soup, or Reversal
    const showAtoms = coreView || solidAlpha < 0.92 || decay > 0.08 || dust > 0.05 || this.engine.isReversed;
    this.particleMesh.visible = showAtoms;
    // Halos glow strongly in Quantum Soup / Reversal / Core View, muted in matte organic dust/decay
    this.atomHalos.visible = showAtoms && (isQuantumSoup || this.engine.isReversed || coreView);

    const showVectors =
      this.visualState.showVelocityVectors &&
      showAtoms &&
      (isQuantumSoup || this.engine.isReversed || (isDustStage && dust > 0.55));
    this.vectorLines.visible = showVectors;

    if (showAtoms) {
      this.haloMat.opacity = this.engine.isReversed ? 0.92 : isQuantumSoup ? 0.86 : 0.62;
      this.haloMat.size = isQuantumSoup || this.engine.isReversed ? 0.16 : 0.11;

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const x = pos[i3];
        const y = pos[i3 + 1];
        const z = pos[i3 + 2];

        // During early Decay & Puddle (while solid apple still sits on floor), show primarily
        // the rising volatile decomposition vapor & detached specks so the rotting apple stays clear!
        let r = radius;
        if (isDecayStage && solidAlpha > 0.25 && i % 4 !== 0) {
          r = 0; // Hide bulk interior atoms inside the opaque rotting apple shell
        } else if (isQuantumSoup) {
          // Differentiate species radii: protons/neutrons slightly crisper, electrons & photons ultra-fine
          const sp = species[i];
          r =
            sp === SPECIES_ID.proton || sp === SPECIES_ID.neutron
              ? radius * 1.1
              : sp === SPECIES_ID.electron
                ? radius * 0.78
                : radius * 0.68;
        } else if (isDustStage) {
          r = radius * 0.85;
        }

        _pos.set(x, y, z);
        _scale.set(r, r, r);
        _mat4.compose(_pos, _quat, _scale);
        this.particleMesh.setMatrixAt(i, _mat4);

        if (isQuantumSoup) {
          // Authentic fundamental subatomic soup colors: Protons, Neutrons, Electrons, Photons!
          _color.setRGB(gasColor[i3], gasColor[i3 + 1], gasColor[i3 + 2], THREE.SRGBColorSpace);
        } else if (isDustStage) {
          // Matte powdery ash & organic dust grains transitioning gradually into subatomic hues
          _color.setRGB(dustColor[i3], dustColor[i3 + 1], dustColor[i3 + 2], THREE.SRGBColorSpace);
        } else {
          // Anatomical tissue or rising pale volatile decay gas
          _color.setRGB(baseColor[i3], baseColor[i3 + 1], baseColor[i3 + 2], THREE.SRGBColorSpace);
          if (isDecayStage) {
            if (i % 5 === 0) {
              // Subtle misty olive-beige decomposition gas (CO2 / CH4 vapor)
              _targetColor.setRGB(0.66, 0.72, 0.62, THREE.SRGBColorSpace);
              _color.lerp(_targetColor, 0.78);
            } else {
              _color.lerp(_rotColor, Math.min(0.85, decay));
            }
          }
        }

        if (this.engine.isReversed) {
          _targetColor.setRGB(0.38, 0.86, 1.0, THREE.SRGBColorSpace);
          _color.lerp(_targetColor, 0.34);
        }
        this.particleMesh.setColorAt(i, _color);

        if (this.atomHalos.visible) {
          this.haloPositions[i3] = x;
          this.haloPositions[i3 + 1] = y;
          this.haloPositions[i3 + 2] = z;
          // Photons & electrons radiate extra quantum halo luminescence
          const sp = species[i];
          const boost =
            isQuantumSoup && (sp === SPECIES_ID.photon || sp === SPECIES_ID.electron) ? 1.15 : 0.72;
          this.haloColors[i3] = Math.min(1, _color.r * boost);
          this.haloColors[i3 + 1] = Math.min(1, _color.g * boost);
          this.haloColors[i3 + 2] = Math.min(1, _color.b * boost);
        }

        if (showVectors) {
          const i6 = i * 6;
          const vx = vel[i3];
          const vy = vel[i3 + 1];
          const vz = vel[i3 + 2];
          // Photons leave slightly longer luminous light streaks!
          const tailScale =
            isQuantumSoup && species[i] === SPECIES_ID.photon ? 0.068 : 0.032;
          this.vectorPositions[i6] = x;
          this.vectorPositions[i6 + 1] = y;
          this.vectorPositions[i6 + 2] = z;
          this.vectorPositions[i6 + 3] = x + vx * tailScale;
          this.vectorPositions[i6 + 4] = y + vy * tailScale;
          this.vectorPositions[i6 + 5] = z + vz * tailScale;

          const cr = this.engine.isReversed ? 0.32 : _color.r;
          const cg = this.engine.isReversed ? 0.82 : _color.g;
          const cb = this.engine.isReversed ? 1.0 : _color.b;
          this.vectorColors[i6] = cr;
          this.vectorColors[i6 + 1] = cg;
          this.vectorColors[i6 + 2] = cb;
          this.vectorColors[i6 + 3] = cr * 0.2;
          this.vectorColors[i6 + 4] = cg * 0.2;
          this.vectorColors[i6 + 5] = cb * 0.2;
        }
      }

      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }

      if (this.atomHalos.visible) {
        (this.haloGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (this.haloGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      }

      if (showVectors) {
        (this.vectorGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (this.vectorGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      }
    }

    for (const face of WALL_FACES) {
      const mat = this.boxAssembly.wallFlashMeshes[face].material as THREE.MeshBasicMaterial;
      mat.opacity = this.engine.wallImpacts[face] * 0.14;
      mat.color.setHex(this.engine.isReversed ? 0x22d3ee : 0x60a5fa);
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
      this.spaceBackdrop.update(rawDt);
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
    this.engine.params.stage = 'full_cycle';
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
    this.spaceBackdrop.dispose();
    this.boxAssembly.dispose();
    this.appleMesh.dispose();
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.haloGeo.dispose();
    this.haloMat.dispose();
    this.atomHaloTex.dispose();
    this.vectorGeo.dispose();
    this.vectorMat.dispose();
    this.envRT.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
