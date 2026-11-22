import * as THREE from 'three';

export interface SpaceBackdropAssembly {
  group: THREE.Group;
  update: (dt: number) => void;
  dispose: () => void;
}

/**
 * Generates a completely smooth, ultra-clean deep-space cosmic nebula sky dome
 * (zero painted pixels so magnification never produces blocky squares!).
 */
function createCosmicNebulaTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Rich astronomical midnight void gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0.0, '#010207');
  bgGrad.addColorStop(0.42, '#020510');
  bgGrad.addColorStop(0.58, '#040818');
  bgGrad.addColorStop(1.0, '#010206');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  let seed = 420819;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Smooth diagonal Milky Way cosmic dust band & muted astronomical nebulae
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 36; i++) {
    const t = i / 36;
    const cx = t * w + (rand() - 0.5) * 90;
    const cy = h * (0.28 + 0.42 * Math.sin(t * Math.PI * 1.15 - 0.35)) + (rand() - 0.5) * 60;
    const r = 85 + rand() * 165;

    const grad = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
    const paletteRoll = rand();
    if (paletteRoll < 0.58) {
      grad.addColorStop(0, 'rgba(34, 62, 118, 0.13)');
      grad.addColorStop(0.55, 'rgba(18, 34, 72, 0.055)');
      grad.addColorStop(1, 'rgba(2, 5, 16, 0)');
    } else if (paletteRoll < 0.85) {
      grad.addColorStop(0, 'rgba(62, 42, 96, 0.10)');
      grad.addColorStop(0.55, 'rgba(28, 22, 56, 0.045)');
      grad.addColorStop(1, 'rgba(2, 5, 16, 0)');
    } else {
      grad.addColorStop(0, 'rgba(72, 60, 56, 0.075)');
      grad.addColorStop(0.55, 'rgba(30, 30, 44, 0.032)');
      grad.addColorStop(1, 'rgba(2, 5, 16, 0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Generates a crisp circular radial pinpoint star sprite whose alpha drops strictly to 0
 * well inside the quad edge so stars ALWAYS look like pinpoint astronomical light points.
 */
function createPinpointStarTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half * 0.86);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.20, 'rgba(250, 253, 255, 0.96)');
  grad.addColorStop(0.42, 'rgba(205, 228, 255, 0.36)');
  grad.addColorStop(0.70, 'rgba(145, 190, 255, 0.06)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStarLayer(
  count: number,
  minR: number,
  maxR: number,
  pointSize: number,
  seedInit: number,
  starTex: THREE.CanvasTexture
): { points: THREE.Points; geo: THREE.BufferGeometry; mat: THREE.PointsMaterial } {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  let seed = seedInit;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const sinPhi = Math.sqrt(Math.max(0, 1 - u * u));
    const r = minR + rand() * (maxR - minR);

    positions[i * 3] = r * sinPhi * Math.cos(theta);
    positions[i * 3 + 1] = r * u;
    positions[i * 3 + 2] = r * sinPhi * Math.sin(theta);

    const tint = rand();
    if (tint < 0.26) {
      c.setRGB(0.76, 0.88, 1.0, THREE.SRGBColorSpace); // Cool blue-white O/B star
    } else if (tint < 0.48) {
      c.setRGB(1.0, 0.91, 0.78, THREE.SRGBColorSpace); // Warm amber-gold K/G star
    } else {
      c.setRGB(0.97, 0.99, 1.0, THREE.SRGBColorSpace); // Pure white A/F star
    }
    const brightness = 0.55 + Math.pow(rand(), 1.6) * 0.45;
    colors[i * 3] = c.r * brightness;
    colors[i * 3 + 1] = c.g * brightness;
    colors[i * 3 + 2] = c.b * brightness;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: pointSize,
    map: starTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  return { points, geo, mat };
}

/**
 * Builds an immersive, razor-sharp deep-space cosmic environment (smooth Milky Way
 * nebula sky dome + 2 crisp multi-scale 3D pinpoint starfield shells).
 */
export function buildSpaceBackdrop(): SpaceBackdropAssembly {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // 1. Smooth Deep-Space Nebula Sky Dome (zero blocky pixel artifacts)
  const skyTex = createCosmicNebulaTexture();
  const skyGeo = new THREE.SphereGeometry(62, 36, 24);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  group.add(skyMesh);
  disposables.push(skyTex, skyGeo, skyMat);

  // 2. Crisp Pinpoint 3D Starfield (fine distant star dust + bright astronomical stars)
  const starTex = createPinpointStarTexture();
  disposables.push(starTex);

  const fineStars = createStarLayer(2600, 32, 54, 0.38, 991231, starTex);
  const brightStars = createStarLayer(420, 24, 46, 0.72, 447812, starTex);

  group.add(fineStars.points, brightStars.points);
  disposables.push(fineStars.geo, fineStars.mat, brightStars.geo, brightStars.mat);

  return {
    group,
    update: (dt: number) => {
      fineStars.points.rotation.y += dt * 0.005;
      brightStars.points.rotation.y += dt * 0.008;
      skyMesh.rotation.y += dt * 0.002;
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
