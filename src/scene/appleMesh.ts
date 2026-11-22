import * as THREE from 'three';
import { evaluateAppleRadius } from '../physics/appleSampler';

export interface RealisticAppleAssembly {
  group: THREE.Group;
  skinMesh: THREE.Mesh;
  skinMaterial: THREE.MeshPhysicalMaterial;
  stemMaterial: THREE.MeshStandardMaterial;
  leafMaterial: THREE.MeshStandardMaterial;
  setAppearance: (solidAlpha: number, decayProgress: number, coreView: boolean) => void;
  dispose: () => void;
}

/**
 * Generates a high-DPI procedural Honeycrisp/Gala striped red-and-golden-yellow
 * orchard apple skin albedo texture with subtle lenticel speckles.
 */
function createAppleSkinTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Base warm golden-yellow flesh undercoat (visible near top dimple & between crimson stripes)
  const baseGrad = ctx.createLinearGradient(0, 0, 0, h);
  baseGrad.addColorStop(0.0, '#c8b85c');
  baseGrad.addColorStop(0.16, '#e2a83c');
  baseGrad.addColorStop(0.52, '#d83a2c');
  baseGrad.addColorStop(0.85, '#b82022');
  baseGrad.addColorStop(1.0, '#8d5b34');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  // Longitudinal organic crimson & golden Honeycrisp striping
  for (let x = 0; x < w; x += 2) {
    const u = (x / w) * Math.PI * 2;
    const wave =
      Math.sin(u * 13) * 0.45 +
      Math.sin(u * 29 + 1.3) * 0.3 +
      Math.cos(u * 7 - 0.6) * 0.25;
    const isCrimson = wave > -0.1;

    const stripeGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (isCrimson) {
      const alpha = Math.min(0.88, 0.42 + Math.abs(wave) * 0.45);
      stripeGrad.addColorStop(0.0, `rgba(148, 128, 52, ${alpha * 0.4})`);
      stripeGrad.addColorStop(0.14, `rgba(196, 36, 38, ${alpha})`);
      stripeGrad.addColorStop(0.55, `rgba(176, 20, 28, ${alpha})`);
      stripeGrad.addColorStop(0.88, `rgba(146, 16, 24, ${alpha})`);
      stripeGrad.addColorStop(1.0, `rgba(112, 70, 38, ${alpha * 0.7})`);
    } else {
      const alpha = Math.min(0.75, 0.3 + Math.abs(wave) * 0.45);
      stripeGrad.addColorStop(0.0, `rgba(196, 178, 86, ${alpha})`);
      stripeGrad.addColorStop(0.22, `rgba(236, 184, 72, ${alpha})`);
      stripeGrad.addColorStop(0.6, `rgba(222, 112, 48, ${alpha * 0.85})`);
      stripeGrad.addColorStop(0.9, `rgba(198, 92, 42, ${alpha * 0.7})`);
      stripeGrad.addColorStop(1.0, `rgba(146, 118, 56, ${alpha * 0.6})`);
    }
    ctx.fillStyle = stripeGrad;
    ctx.fillRect(x, 0, 3, h);
  }

  // Subtle organic lenticel dots across the apple skin
  let seed = 918273;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 1600; i++) {
    const px = rand() * w;
    const py = h * 0.1 + rand() * h * 0.8;
    const r = 0.7 + rand() * 1.3;
    ctx.fillStyle = rand() > 0.35 ? 'rgba(248, 232, 186, 0.24)' : 'rgba(105, 22, 18, 0.2)';
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Generates a subtle procedural organic micro-bump map for glossy waxed apple cuticle.
 */
function createAppleBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  let seed = 445566;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 2000; i++) {
    const v = 116 + Math.floor(rand() * 24);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(rand() * size, rand() * size, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Generates a botanical green leaf texture with midrib & lateral veins.
 */
function createLeafTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#3f8c2d');
  grad.addColorStop(0.55, '#4da336');
  grad.addColorStop(1, '#2f6e22');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Midrib & lateral veins
  ctx.strokeStyle = 'rgba(176, 224, 128, 0.52)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.5);
  ctx.lineTo(w, h * 0.5);
  ctx.stroke();

  ctx.lineWidth = 2;
  for (let i = 1; i <= 6; i++) {
    const x = (i / 7) * w;
    ctx.beginPath();
    ctx.moveTo(x, h * 0.5);
    ctx.quadraticCurveTo(x + 22, h * 0.25, x + 46, h * 0.1);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, h * 0.5);
    ctx.quadraticCurveTo(x + 22, h * 0.75, x + 46, h * 0.9);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Builds a smooth parametric 3D apple BufferGeometry matching the exact mathematical
 * volume sampled by `generateAppleParticles` so the glossy skin shell aligns 1:1
 * with the underlying microscopic atoms!
 */
function createSculptedAppleGeometry(scale: number): THREE.BufferGeometry {
  const radialSegs = 56;
  const heightSegs = 40;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= heightSegs; iy++) {
    const v = iy / heightSegs; // 0 (top stem cavity) -> 1 (bottom calyx)
    const phi = v * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    for (let ix = 0; ix <= radialSegs; ix++) {
      const u = ix / radialSegs;
      const theta = u * Math.PI * 2;
      const r = evaluateAppleRadius(phi, theta, scale);

      const x = r * sinPhi * Math.cos(theta);
      const y = r * cosPhi * 1.04;
      const z = r * sinPhi * Math.sin(theta);

      positions.push(x, y, z);
      uvs.push(u, 1 - v);
    }
  }

  const stride = radialSegs + 1;
  for (let iy = 0; iy < heightSegs; iy++) {
    for (let ix = 0; ix < radialSegs; ix++) {
      const a = iy * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a composite realistic 3D apple (glossy striped Honeycrisp body + curved woody stem
 * + sculpted botanical leaf + bottom calyx tuft) that morphs smoothly into the volumetric
 * microscopic particle system during decay and re-crystallizes upon Poincaré Recurrence.
 */
export function buildRealisticAppleMesh(
  appleScale: number,
  appleCenterY: number,
  isSoftwareGl: boolean,
  maxAnisotropy: number
): RealisticAppleAssembly {
  const group = new THREE.Group();
  group.position.set(0, appleCenterY, 0);

  const disposables: Array<{ dispose: () => void }> = [];

  const skinTex = createAppleSkinTexture(maxAnisotropy);
  const bumpTex = createAppleBumpTexture(maxAnisotropy);
  const leafTex = createLeafTexture(maxAnisotropy);
  disposables.push(skinTex, bumpTex, leafTex);

  // 1. Sculpted Glossy Striped Apple Body
  const bodyGeo = createSculptedAppleGeometry(appleScale * 1.02);
  const skinMaterial = new THREE.MeshPhysicalMaterial({
    map: skinTex,
    bumpMap: bumpTex,
    bumpScale: 0.006,
    color: 0xffffff,
    roughness: 0.24,
    metalness: 0.02,
    clearcoat: 0.9,
    clearcoatRoughness: 0.14,
    transparent: true,
    opacity: 1.0,
    side: THREE.FrontSide,
  });
  const skinMesh = new THREE.Mesh(bodyGeo, skinMaterial);
  skinMesh.castShadow = !isSoftwareGl;
  skinMesh.receiveShadow = !isSoftwareGl;
  skinMesh.renderOrder = 3;
  group.add(skinMesh);
  disposables.push(bodyGeo, skinMaterial);

  // 2. Curved Lignified Woody Stem (TubeGeometry)
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, appleScale * 0.46, 0),
    new THREE.Vector3(appleScale * 0.03, appleScale * 0.72, appleScale * 0.02),
    new THREE.Vector3(appleScale * 0.14, appleScale * 0.96, appleScale * 0.04),
  ]);
  const stemGeo = new THREE.TubeGeometry(stemCurve, 14, appleScale * 0.045, 8, false);
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c381c,
    roughness: 0.82,
    metalness: 0.02,
    transparent: true,
    opacity: 1.0,
  });
  const stemMesh = new THREE.Mesh(stemGeo, stemMaterial);
  stemMesh.castShadow = !isSoftwareGl;
  group.add(stemMesh);
  disposables.push(stemGeo, stemMaterial);

  // 3. Sculpted Botanical Leaf with Natural Camber
  const leafShape = new THREE.Shape();
  const lLen = appleScale * 0.62;
  const lWid = appleScale * 0.26;
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(lLen * 0.28, lWid, lLen * 0.74, lWid * 0.92, lLen, 0);
  leafShape.bezierCurveTo(lLen * 0.74, -lWid * 0.92, lLen * 0.28, -lWid, 0, 0);

  const leafGeo = new THREE.ShapeGeometry(leafShape, 12);
  // Normalize UVs [0..1] and add gentle organic arch across the leaf blade
  const posAttr = leafGeo.attributes.position as THREE.BufferAttribute;
  const uvAttr = leafGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const lx = posAttr.getX(i);
    const ly = posAttr.getY(i);
    const u = Math.max(0, Math.min(1, lx / lLen));
    const v = Math.max(0, Math.min(1, ly / (lWid * 2) + 0.5));
    const camberZ = Math.sin(u * Math.PI) * appleScale * 0.09 - Math.abs(v - 0.5) * appleScale * 0.06;
    posAttr.setZ(i, camberZ);
    uvAttr.setXY(i, u, v);
  }
  leafGeo.computeVertexNormals();

  const leafMaterial = new THREE.MeshStandardMaterial({
    map: leafTex,
    color: 0xffffff,
    roughness: 0.48,
    metalness: 0.02,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1.0,
  });
  const leafMesh = new THREE.Mesh(leafGeo, leafMaterial);
  leafMesh.position.set(appleScale * 0.02, appleScale * 0.76, appleScale * 0.02);
  leafMesh.rotation.set(-0.32, Math.PI * 0.88, -0.24);
  leafMesh.castShadow = !isSoftwareGl;
  group.add(leafMesh);
  disposables.push(leafGeo, leafMaterial);

  // 4. Subtle Dark Calyx Crown at Bottom Pole
  const calyxGeo = new THREE.CylinderGeometry(appleScale * 0.055, appleScale * 0.03, appleScale * 0.06, 6);
  const calyxMesh = new THREE.Mesh(calyxGeo, stemMaterial);
  calyxMesh.position.set(0, -appleScale * 0.54, 0);
  group.add(calyxMesh);
  disposables.push(calyxGeo);

  const freshTint = new THREE.Color(0xffffff);
  const rotTint = new THREE.Color(0x5c3e20);
  const freshLeafTint = new THREE.Color(0xffffff);
  const rotLeafTint = new THREE.Color(0x6b5628);

  const setAppearance = (solidAlpha: number, decayProgress: number, coreView: boolean) => {
    // Keep the real 3D apple visible through early decay (slumping, browning, dulling)
    // before dissolving completely into the microscopic atom cloud!
    const decayFade = Math.max(0, 1 - Math.max(0, decayProgress - 0.15) / 0.58);
    const effectiveShell = Math.max(solidAlpha, decayFade * (1 - decayProgress * 0.45));

    if (effectiveShell < 0.02) {
      group.visible = false;
      return;
    }
    group.visible = true;

    // Realistic enzymatic softening & gravitational slump during decay
    const slump = Math.max(0, Math.min(1, decayProgress));
    group.position.y = appleCenterY - slump * appleScale * 0.55;
    group.scale.set(
      1 + slump * 0.12,
      Math.max(0.55, 1 - slump * 0.38),
      1 + slump * 0.12
    );

    // Glossy waxed cuticle turns dull matte oxidized brown as enzymes break cell walls
    skinMaterial.roughness = 0.22 + slump * 0.68;
    skinMaterial.clearcoat = Math.max(0, 0.92 * (1 - slump * 1.4));
    skinMaterial.color.copy(freshTint).lerp(rotTint, Math.min(0.82, slump * 1.15));

    leafMaterial.color.copy(freshLeafTint).lerp(rotLeafTint, Math.min(0.85, slump * 1.1));

    const effectiveSkinOpacity = coreView ? effectiveShell * 0.22 : effectiveShell;
    skinMaterial.opacity = effectiveSkinOpacity;
    skinMaterial.depthWrite = effectiveSkinOpacity > 0.85;

    const stemOpacity = coreView ? effectiveShell * 0.55 : effectiveShell;
    stemMaterial.opacity = stemOpacity;
    leafMaterial.opacity = stemOpacity;
    stemMaterial.depthWrite = stemOpacity > 0.85;
    leafMaterial.depthWrite = stemOpacity > 0.85;
  };

  return {
    group,
    skinMesh,
    skinMaterial,
    stemMaterial,
    leafMaterial,
    setAppearance,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
