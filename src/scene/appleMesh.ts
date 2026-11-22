import * as THREE from 'three';
import { evaluateAppleRadius } from '../physics/appleSampler';

export interface RealisticAppleAssembly {
  group: THREE.Group;
  skinMesh: THREE.Mesh;
  skinMaterial: THREE.MeshPhysicalMaterial;
  stemMaterial: THREE.MeshStandardMaterial;
  setAppearance: (
    solidAlpha: number,
    decayProgress: number,
    puddleProgress: number,
    dustProgress: number,
    coreView: boolean
  ) => void;
  dispose: () => void;
}

/**
 * Draws the photorealistic fresh mottled Gala/Fuji apple skin onto an offscreen canvas.
 */
function paintFreshAppleSkin(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  let seed = 884217;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Base vertical ripeness gradient
  const baseGrad = ctx.createLinearGradient(0, 0, 0, h);
  baseGrad.addColorStop(0.0, '#c29246');
  baseGrad.addColorStop(0.09, '#e7b97c');
  baseGrad.addColorStop(0.18, '#dc6858');
  baseGrad.addColorStop(0.35, '#c22220');
  baseGrad.addColorStop(0.7, '#991318');
  baseGrad.addColorStop(0.89, '#720b10');
  baseGrad.addColorStop(1.0, '#552b18');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  // Broad organic golden-ochre & deep crimson blush mottling
  for (let i = 0; i < 65; i++) {
    const cx = rand() * w;
    const cy = h * (0.14 + rand() * 0.64);
    const rx = (18 + rand() * 58) * (w / 1024);
    const ry = (32 + rand() * 96) * (h / 512);
    const maxR = Math.max(rx, ry);
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, maxR);
    if (rand() < 0.52) {
      grad.addColorStop(0, `rgba(238, 178, 86, ${(0.18 + rand() * 0.2).toFixed(2)})`);
      grad.addColorStop(0.6, `rgba(220, 120, 52, ${(0.08 + rand() * 0.1).toFixed(2)})`);
      grad.addColorStop(1, 'rgba(196, 40, 32, 0)');
    } else {
      grad.addColorStop(0, `rgba(128, 12, 18, ${(0.22 + rand() * 0.22).toFixed(2)})`);
      grad.addColorStop(0.65, `rgba(154, 18, 22, ${(0.1 + rand() * 0.1).toFixed(2)})`);
      grad.addColorStop(1, 'rgba(154, 18, 22, 0)');
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx / maxR, ry / maxR);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, maxR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Fine feathery longitudinal vascular streaks
  for (let i = 0; i < 600; i++) {
    const x = rand() * w;
    const yStart = h * (0.08 + rand() * 0.35);
    const len = h * (0.16 + rand() * 0.55);
    const width = (0.7 + rand() * 2.2) * (w / 1024);
    const grad = ctx.createLinearGradient(x, yStart, x, yStart + len);
    if (rand() < 0.44) {
      const a = 0.12 + rand() * 0.2;
      grad.addColorStop(0, 'rgba(246, 206, 128, 0)');
      grad.addColorStop(0.35, `rgba(244, 194, 108, ${a.toFixed(2)})`);
      grad.addColorStop(1, 'rgba(210, 92, 54, 0)');
    } else {
      const a = 0.14 + rand() * 0.26;
      grad.addColorStop(0, 'rgba(128, 12, 18, 0)');
      grad.addColorStop(0.3, `rgba(144, 14, 22, ${a.toFixed(2)})`);
      grad.addColorStop(1, 'rgba(92, 8, 14, 0)');
    }
    ctx.strokeStyle = grad;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, yStart);
    ctx.bezierCurveTo(
      x + (rand() - 0.5) * 6,
      yStart + len * 0.35,
      x + (rand() - 0.5) * 6,
      yStart + len * 0.7,
      x + (rand() - 0.5) * 4,
      yStart + len
    );
    ctx.stroke();
  }

  // Realistic golden-cream lenticel pores & micro-speckling
  for (let i = 0; i < 3000; i++) {
    const px = rand() * w;
    const py = h * (0.09 + rand() * 0.82);
    const r = (0.45 + rand() * 1.35) * (w / 1024);
    const roll = rand();
    if (roll < 0.62) {
      ctx.fillStyle = `rgba(250, 226, 174, ${(0.22 + rand() * 0.36).toFixed(2)})`;
    } else if (roll < 0.85) {
      ctx.fillStyle = `rgba(236, 158, 72, ${(0.18 + rand() * 0.24).toFixed(2)})`;
    } else {
      ctx.fillStyle = `rgba(96, 10, 14, ${(0.2 + rand() * 0.24).toFixed(2)})`;
    }
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle russet inside stem basin
  const russetGrad = ctx.createLinearGradient(0, 0, 0, h * 0.14);
  russetGrad.addColorStop(0, 'rgba(134, 96, 46, 0.78)');
  russetGrad.addColorStop(0.55, 'rgba(196, 158, 92, 0.32)');
  russetGrad.addColorStop(1, 'rgba(215, 176, 112, 0)');
  ctx.fillStyle = russetGrad;
  ctx.fillRect(0, 0, w, h * 0.15);
}

interface RotSpot {
  x: number;
  y: number;
  maxR: number;
  startAt: number;
  hasMold: boolean;
}

/**
 * Generates deterministic organic rot lesion & Penicillium mold colony sites
 * that grow steadily across the apple skin as decayProgress advances from 0 -> 1.
 */
function createRotSites(w: number, h: number): RotSpot[] {
  let seed = 314159;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const spots: RotSpot[] = [];
  for (let i = 0; i < 34; i++) {
    spots.push({
      x: rand() * w,
      y: h * (0.14 + rand() * 0.72),
      maxR: (26 + rand() * 64) * (w / 512),
      startAt: rand() * 0.55,
      hasMold: rand() < 0.55,
    });
  }
  return spots;
}

function createMicroBumpAndRoughness(maxAnisotropy: number): {
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 256;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 512, 256);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 512;
  roughCanvas.height = 256;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#505050';
  rCtx.fillRect(0, 0, 512, 256);

  let seed = 445566;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 4200; i++) {
    const bx = rand() * 512;
    const by = rand() * 256;
    const v = 104 + Math.floor(rand() * 48);
    bCtx.fillStyle = `rgb(${v},${v},${v})`;
    bCtx.fillRect(bx, by, 1.5, 1.5);

    const rv = 64 + Math.floor(rand() * 46);
    rCtx.fillStyle = `rgb(${rv},${rv},${rv})`;
    rCtx.fillRect(bx, by, 2.2, 2.2);
  }

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  roughnessMap.anisotropy = maxAnisotropy;

  return { bumpMap, roughnessMap };
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 124);
  grad.addColorStop(0.0, 'rgba(0, 0, 0, 0.85)');
  grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.45)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createDustTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3d352e';
  ctx.fillRect(0, 0, size, size);
  let seed = 771122;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 6500; i++) {
    const shade = 36 + Math.floor(rand() * 58);
    ctx.fillStyle = `rgb(${shade + 8}, ${shade + 3}, ${shade - 4})`;
    ctx.fillRect(rand() * size, rand() * size, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds an irregular organic 2D puddle shape for the viscous decomposition fluid on the chamber floor.
 */
function createOrganicPuddleGeometry(baseRadius: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const pts = 40;
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const r =
      baseRadius *
      (1 +
        0.16 * Math.sin(a * 3 + 0.5) +
        0.1 * Math.cos(a * 5 - 0.8) +
        0.06 * Math.sin(a * 7 + 1.2));
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geo = new THREE.ShapeGeometry(shape, 24);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/**
 * Builds a low-profile organic powdery ash/dust mound resting directly on the chamber floor.
 */
function createDustMoundGeometry(radius: number, maxHeight: number): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(radius, maxHeight, 36, 12, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + z * z) / radius;
    const ang = Math.atan2(z, x);
    // Smooth bell-shaped organic ash mound with natural granular ripples
    if (y > -maxHeight * 0.45) {
      const bell = Math.exp(-r * r * 2.6);
      const ripple = 1 + 0.14 * Math.sin(ang * 4 + r * 5) + 0.08 * Math.cos(ang * 7 - r * 3);
      pos.setY(i, Math.max(0.01, bell * maxHeight * ripple));
    } else {
      pos.setY(i, 0);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the complete floor-grounded photorealistic Apple-in-a-Box physical assembly:
 * - Sculpted mottled Gala/Fuji 3D apple seated directly on the sealed chamber floor
 * - Live real-time vertex wrinkling, bruising craters & gravitational collapse during decay
 * - Live dynamic rot & fuzzy Penicillium mold colony texture growth
 * - Spreading glossy dark viscous organic puddle beneath the decaying apple
 * - Dehydrated powdery ash/dust mound before sublimation into subatomic soup
 */
export function buildRealisticAppleMesh(
  appleScale: number,
  _appleCenterY: number,
  boxSize: number,
  isSoftwareGl: boolean,
  maxAnisotropy: number
): RealisticAppleAssembly {
  const floorY = -boxSize * 0.5 + 0.014;
  const group = new THREE.Group();
  group.position.set(0, floorY, 0);

  const disposables: Array<{ dispose: () => void }> = [];

  // Offscreen fresh canvas + live dynamic composited canvas for real rot/mold growth
  const texW = 512;
  const texH = 256;
  const freshCanvas = document.createElement('canvas');
  freshCanvas.width = texW;
  freshCanvas.height = texH;
  paintFreshAppleSkin(freshCanvas.getContext('2d')!, texW, texH);

  const liveCanvas = document.createElement('canvas');
  liveCanvas.width = texW;
  liveCanvas.height = texH;
  const liveCtx = liveCanvas.getContext('2d')!;
  liveCtx.drawImage(freshCanvas, 0, 0);

  const liveSkinTex = new THREE.CanvasTexture(liveCanvas);
  liveSkinTex.colorSpace = THREE.SRGBColorSpace;
  liveSkinTex.wrapS = THREE.RepeatWrapping;
  liveSkinTex.wrapT = THREE.ClampToEdgeWrapping;
  liveSkinTex.anisotropy = maxAnisotropy;

  const rotSites = createRotSites(texW, texH);
  const { bumpMap, roughnessMap } = createMicroBumpAndRoughness(maxAnisotropy);
  const shadowTex = createContactShadowTexture();
  const dustTex = createDustTexture();
  disposables.push(liveSkinTex, bumpMap, roughnessMap, shadowTex, dustTex);

  // 1. Sculpted Photorealistic Apple Body seated flush at local y = 0 (resting directly on floor!)
  const radialSegs = 56;
  const heightSegs = 40;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let minY = Infinity;
  const rawPts: Array<[number, number, number]> = [];
  for (let iy = 0; iy <= heightSegs; iy++) {
    const v = iy / heightSegs;
    const phi = v * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    for (let ix = 0; ix <= radialSegs; ix++) {
      const u = ix / radialSegs;
      const theta = u * Math.PI * 2;
      const r = evaluateAppleRadius(phi, theta, appleScale * 1.01);
      const asym = 1 + 0.016 * Math.sin(theta * 2 + 0.7) * sinPhi;
      const x = r * asym * sinPhi * Math.cos(theta);
      const y = r * cosPhi * 1.15;
      const z = r * asym * sinPhi * Math.sin(theta);
      if (y < minY) minY = y;
      rawPts.push([x, y, z]);
      uvs.push(u, 1 - v);
    }
  }

  // Shift vertices up so the lowest bottom lobe touches local y = 0 flush on the chamber floor!
  const yLift = -minY;
  for (const [x, y, z] of rawPts) {
    positions.push(x, y + yLift, z);
  }
  const basePositions = new Float32Array(positions);

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

  const bodyGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.Float32BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  bodyGeo.setAttribute('position', posAttr);
  bodyGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  bodyGeo.setIndex(indices);
  bodyGeo.computeVertexNormals();

  const skinMaterial = new THREE.MeshPhysicalMaterial({
    map: liveSkinTex,
    bumpMap,
    bumpScale: 0.011,
    roughnessMap,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.01,
    clearcoat: 0.52,
    clearcoatRoughness: 0.24,
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

  // 2. Curved Woody Stem anchored relative to the lifted apple top basin
  const stemGroup = new THREE.Group();
  stemGroup.position.set(0, yLift, 0);
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, appleScale * 0.52, 0),
    new THREE.Vector3(appleScale * 0.03, appleScale * 0.78, appleScale * 0.01),
    new THREE.Vector3(appleScale * 0.11, appleScale * 0.99, appleScale * 0.03),
    new THREE.Vector3(appleScale * 0.21, appleScale * 1.13, appleScale * 0.04),
  ]);
  const stemGeo = new THREE.TubeGeometry(stemCurve, 16, appleScale * 0.034, 10, false);
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: 0x7b4c24,
    roughness: 0.86,
    metalness: 0.02,
    transparent: true,
    opacity: 1.0,
  });
  const stemMesh = new THREE.Mesh(stemGeo, stemMaterial);
  stemGroup.add(stemMesh);

  const tipGeo = new THREE.CylinderGeometry(appleScale * 0.038, appleScale * 0.032, appleScale * 0.03, 10);
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xb68652,
    roughness: 0.9,
    transparent: true,
    opacity: 1.0,
  });
  const tipMesh = new THREE.Mesh(tipGeo, tipMat);
  tipMesh.position.set(appleScale * 0.21, appleScale * 1.13, appleScale * 0.04);
  tipMesh.rotation.z = -0.62;
  stemGroup.add(tipMesh);
  group.add(stemGroup);
  disposables.push(stemGeo, stemMaterial, tipGeo, tipMat);

  // 3. Grounded Soft Contact Shadow directly beneath the fresh/decaying apple
  const shadowGeo = new THREE.CircleGeometry(appleScale * 1.18, 36);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.set(0, 0.004, 0);
  shadowMesh.renderOrder = 1;
  group.add(shadowMesh);
  disposables.push(shadowGeo, shadowMat);

  // 4. Spreading Glossy Dark Viscous Organic Decomposition Puddle (Stage 2)
  const puddleGeo = createOrganicPuddleGeometry(appleScale * 1.55);
  const puddleMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a1a0e,
    roughness: 0.14,
    metalness: 0.08,
    clearcoat: 0.92,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const puddleMesh = new THREE.Mesh(puddleGeo, puddleMat);
  puddleMesh.position.set(0, 0.009, 0);
  puddleMesh.scale.set(0.01, 1, 0.01);
  puddleMesh.visible = false;
  puddleMesh.renderOrder = 2;
  group.add(puddleMesh);
  disposables.push(puddleGeo, puddleMat);

  // 5. Dehydrated Powdery Ash/Dust Mound resting on chamber floor (Stage 3)
  const dustGeo = createDustMoundGeometry(appleScale * 1.48, appleScale * 0.36);
  const dustMat = new THREE.MeshStandardMaterial({
    map: dustTex,
    color: 0x8b7e72,
    roughness: 0.98,
    metalness: 0.0,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const dustMesh = new THREE.Mesh(dustGeo, dustMat);
  dustMesh.position.set(0, 0.008, 0);
  dustMesh.visible = false;
  dustMesh.renderOrder = 2;
  group.add(dustMesh);
  disposables.push(dustGeo, dustMat);

  let lastBakedDecay = -1;
  let lastDeformedDecay = -1;

  /**
   * Paints live enzymatic browning, wet necrotic lesions, and fuzzy pale sage/white
   * Penicillium mold colonies onto the apple skin canvas as decay advances!
   */
  const updateLiveRotTexture = (decay: number) => {
    liveCtx.clearRect(0, 0, texW, texH);
    liveCtx.drawImage(freshCanvas, 0, 0);

    if (decay > 0.03) {
      // Overall enzymatic oxidation darkening
      liveCtx.fillStyle = `rgba(68, 42, 18, ${(Math.min(0.76, decay * 0.85)).toFixed(2)})`;
      liveCtx.fillRect(0, 0, texW, texH);

      // Growing organic bruised rot lesions & fuzzy pale mold rings
      for (const spot of rotSites) {
        if (decay <= spot.startAt) continue;
        const local = Math.min(1, (decay - spot.startAt) / (1 - spot.startAt));
        const r = spot.maxR * Math.pow(local, 0.72);
        if (r < 2) continue;

        // Dark necrotic wet brown bruise
        const rotGrad = liveCtx.createRadialGradient(spot.x, spot.y, 1, spot.x, spot.y, r);
        rotGrad.addColorStop(0.0, `rgba(34, 20, 10, ${(0.88 * local).toFixed(2)})`);
        rotGrad.addColorStop(0.6, `rgba(62, 38, 16, ${(0.72 * local).toFixed(2)})`);
        rotGrad.addColorStop(1.0, 'rgba(62, 38, 16, 0)');
        liveCtx.fillStyle = rotGrad;
        liveCtx.beginPath();
        liveCtx.arc(spot.x, spot.y, r, 0, Math.PI * 2);
        liveCtx.fill();

        // Fuzzy pale sage-green & white mold colonies sprouting inside mature rot patches
        if (spot.hasMold && local > 0.25) {
          const mLocal = (local - 0.25) / 0.75;
          const mr = r * 0.62 * mLocal;
          const moldGrad = liveCtx.createRadialGradient(spot.x, spot.y, 0.5, spot.x, spot.y, mr);
          moldGrad.addColorStop(0.0, `rgba(116, 134, 102, ${(0.88 * mLocal).toFixed(2)})`);
          moldGrad.addColorStop(0.55, `rgba(176, 188, 162, ${(0.74 * mLocal).toFixed(2)})`);
          moldGrad.addColorStop(0.85, `rgba(218, 222, 208, ${(0.42 * mLocal).toFixed(2)})`);
          moldGrad.addColorStop(1.0, 'rgba(218, 222, 208, 0)');
          liveCtx.fillStyle = moldGrad;
          liveCtx.beginPath();
          liveCtx.arc(spot.x, spot.y, mr, 0, Math.PI * 2);
          liveCtx.fill();
        }
      }
    }
    liveSkinTex.needsUpdate = true;
  };

  /**
   * Real-time vertex-level wrinkling, rot crater caving & gravitational slumping onto the floor!
   */
  const deformAppleVertices = (decay: number) => {
    const arr = posAttr.array as Float32Array;
    const count = posAttr.count;
    const slump = Math.max(0, Math.min(1, decay));
    const maxH = appleScale * 2.1;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const bx = basePositions[i3];
      const by = basePositions[i3 + 1];
      const bz = basePositions[i3 + 2];

      if (slump < 0.01) {
        arr[i3] = bx;
        arr[i3 + 1] = by;
        arr[i3 + 2] = bz;
        continue;
      }

      const hNorm = Math.max(0, Math.min(1, by / maxH));
      const ang = Math.atan2(bz, bx);

      // Dehydration wrinkles + sunken organic rot dimples on sides & upper shoulder
      const wrinkle =
        (Math.sin(ang * 9 + by * 5.2) * 0.055 +
          Math.cos(ang * 15 - by * 7.8) * 0.035 +
          Math.sin(bx * 6.5 + bz * 6.5) * 0.04) *
        slump *
        (0.35 + hNorm * 0.65);

      // Asymmetric soft collapse crater on front-right cheek
      const crater =
        Math.max(0, Math.sin(ang - 0.6) * Math.sin(hNorm * Math.PI)) * 0.24 * slump;

      // Gravity squashing downward toward floor (y = 0) while base widens into a soft slumped mound
      const radialSpread = 1 + slump * (0.28 * (1 - hNorm * 0.55)) - crater + wrinkle;
      const collapsedY = by * (1 - slump * 0.62) * (1 - crater * 0.45);

      arr[i3] = bx * Math.max(0.45, radialSpread);
      arr[i3 + 1] = Math.max(0.006, collapsedY);
      arr[i3 + 2] = bz * Math.max(0.45, radialSpread);
    }

    posAttr.needsUpdate = true;
    bodyGeo.computeVertexNormals();
  };

  const setAppearance = (
    solidAlpha: number,
    decayProgress: number,
    puddleProgress: number,
    dustProgress: number,
    coreView: boolean
  ) => {
    // 1. Update live mold/rot canvas & vertex wrinkling smoothly when decay changes
    if (Math.abs(decayProgress - lastBakedDecay) > 0.035 || (decayProgress === 0 && lastBakedDecay !== 0)) {
      lastBakedDecay = decayProgress;
      updateLiveRotTexture(decayProgress);
    }
    if (Math.abs(decayProgress - lastDeformedDecay) > 0.015 || (decayProgress === 0 && lastDeformedDecay !== 0)) {
      lastDeformedDecay = decayProgress;
      deformAppleVertices(decayProgress);
    }

    // 2. Apple Mesh Visibility & Gloss/Roughness Breakdown
    const effectiveShell = Math.max(0, Math.min(1, solidAlpha));
    skinMesh.visible = effectiveShell > 0.015;
    stemGroup.visible = effectiveShell > 0.04;

    if (skinMesh.visible) {
      const slump = Math.max(0, Math.min(1, decayProgress));
      skinMaterial.roughness = 0.9 + slump * 0.55;
      skinMaterial.clearcoat = Math.max(0, 0.52 * (1 - slump * 1.45));
      skinMaterial.bumpScale = 0.011 + slump * 0.038;

      const skinOpacity = coreView ? effectiveShell * 0.16 : effectiveShell;
      skinMaterial.opacity = skinOpacity;
      skinMaterial.depthWrite = skinOpacity > 0.85;

      // Stem collapses & leans naturally as the apple rots downward
      stemGroup.position.y = yLift * (1 - slump * 0.62);
      stemGroup.rotation.z = -slump * 0.68;
      stemGroup.rotation.x = slump * 0.25;
      const stemOpacity = coreView ? effectiveShell * 0.45 : effectiveShell;
      stemMaterial.opacity = stemOpacity;
      tipMat.opacity = stemOpacity;
      stemMaterial.depthWrite = stemOpacity > 0.85;
      tipMat.depthWrite = stemOpacity > 0.85;
    }

    // Contact shadow tracks the apple/dust presence
    const shadowVis = Math.max(effectiveShell, dustProgress * 0.85, puddleProgress * 0.5);
    shadowMesh.visible = shadowVis > 0.04;
    shadowMat.opacity = 0.72 * shadowVis;

    // 3. Spreading Glossy Dark Organic Decomposition Puddle (Stage 2)
    if (puddleProgress > 0.02) {
      puddleMesh.visible = true;
      const pScale = 0.35 + Math.pow(puddleProgress, 0.7) * 0.82;
      puddleMesh.scale.set(pScale, 1, pScale);
      puddleMat.opacity = Math.min(0.92, puddleProgress * 1.15);
      // Wet glossy specular sheen when fresh puddle, dulling slightly if drying into dust
      puddleMat.roughness = 0.14 + dustProgress * 0.65;
      puddleMat.clearcoat = Math.max(0, 0.92 * (1 - dustProgress));
    } else {
      puddleMesh.visible = false;
    }

    // 4. Flattened Powdery Ash/Dust Mound (Stage 3)
    if (dustProgress > 0.02) {
      dustMesh.visible = true;
      const dScale = 0.75 + dustProgress * 0.35;
      dustMesh.scale.set(dScale, Math.max(0.25, 1.1 - dustProgress * 0.45), dScale);
      dustMat.opacity = Math.min(0.95, dustProgress * 1.2);
    } else {
      dustMesh.visible = false;
    }
  };

  return {
    group,
    skinMesh,
    skinMaterial,
    stemMaterial,
    setAppearance,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
