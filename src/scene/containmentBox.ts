import * as THREE from 'three';
import { WallFace } from '../physics/types';

export interface ContainmentBoxAssembly {
  group: THREE.Group;
  wallFlashMeshes: Record<WallFace, THREE.Mesh>;
  glassMaterial: THREE.MeshPhysicalMaterial;
  dispose: () => void;
}

/**
 * Generates a subtle radial studio contact shadow beneath the containment chamber
 * for clean grounding against the bright clinical alabaster laboratory floor.
 */
function createStudioShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 30, 128, 128, 124);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.22)');
  grad.addColorStop(0.65, 'rgba(15, 23, 42, 0.08)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates a crisp recessed laboratory floor grid texture (10x10 calibration divisions)
 * seated flush inside the dark slate chamber base plate.
 */
function createFloorGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Matte slate-gray inner chamber base
  ctx.fillStyle = '#5c6678';
  ctx.fillRect(0, 0, size, size);

  // Subtle recessed inner bevel shadow
  const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.22, size / 2, size / 2, size * 0.68);
  vignette.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
  vignette.addColorStop(1, 'rgba(15, 23, 42, 0.26)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  // Crisp 10x10 coordinate grid lines
  const divisions = 10;
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= divisions; i++) {
    const p = (i / divisions) * size;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Outer perimeter calibration border
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.45)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Builds the precision light-studio sealed containment chamber matching the user's reference:
 * - Solid dark slate-graphite top cap plate with luminous cyan vacuum seal valve
 * - 4 slender machined dark steel corner columns with square base mounting collars
 * - Solid dark slate-graphite base plinth with recessed 10x10 calibration floor grid
 * - Translucent frosted-glass tapered cylindrical specimen pedestal centered below the apple
 * - Crystal-clear optical quartz glass panels + elastic impact shimmer planes
 */
export function buildContainmentBox(
  boxSize: number,
  appleCenterY: number,
  appleScale: number,
  isSoftwareGl: boolean,
  maxAnisotropy: number
): ContainmentBoxAssembly {
  const group = new THREE.Group();
  const half = boxSize * 0.5;
  const disposables: Array<{ dispose: () => void }> = [];

  const floorTex = createFloorGridTexture(maxAnisotropy);
  const shadowTex = createStudioShadowTexture();
  disposables.push(floorTex, shadowTex);

  // Calibrated PBR Materials
  const slateCapMat = new THREE.MeshStandardMaterial({
    color: 0x3b4454,
    metalness: 0.45,
    roughness: 0.42,
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x262e3d,
    metalness: 0.65,
    roughness: 0.34,
  });

  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x2c3545,
    metalness: 0.78,
    roughness: 0.28,
  });

  const valveGlowMat = new THREE.MeshStandardMaterial({
    color: 0x93e6fb,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.75,
    roughness: 0.18,
    metalness: 0.1,
  });

  const pedestalMat = new THREE.MeshPhysicalMaterial({
    color: 0xdbeafe,
    roughness: 0.25,
    metalness: 0.02,
    transmission: isSoftwareGl ? 0 : 0.72,
    transparent: true,
    opacity: isSoftwareGl ? 0.36 : 0.46,
    ior: 1.48,
    thickness: 0.4,
    depthWrite: false,
  });

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe2efff,
    metalness: 0.02,
    roughness: 0.06,
    transmission: isSoftwareGl ? 0 : 0.92,
    ior: 1.5,
    thickness: 0.15,
    transparent: true,
    opacity: isSoftwareGl ? 0.06 : 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  disposables.push(
    slateCapMat,
    darkTrimMat,
    pillarMat,
    valveGlowMat,
    pedestalMat,
    glassMaterial
  );

  // 1. Solid Dark Slate-Graphite Top Lid Plate + Beveled Rim
  const capThickness = 0.2;
  const capWidth = boxSize + 0.36;
  const topCapGeo = new THREE.BoxGeometry(capWidth, capThickness, capWidth);
  const topCap = new THREE.Mesh(topCapGeo, slateCapMat);
  topCap.position.set(0, half + capThickness * 0.5 + 0.02, 0);
  topCap.castShadow = !isSoftwareGl;
  topCap.receiveShadow = !isSoftwareGl;
  group.add(topCap);
  disposables.push(topCapGeo);

  // Top Luminous Vacuum Seal Valve / Pressure Cap (iconic reference detail!)
  const valveRingGeo = new THREE.CylinderGeometry(0.24, 0.29, 0.14, 24);
  const valveRing = new THREE.Mesh(valveRingGeo, darkTrimMat);
  valveRing.position.set(-boxSize * 0.18, half + capThickness + 0.08, -boxSize * 0.14);
  group.add(valveRing);

  const valveLensGeo = new THREE.CylinderGeometry(0.17, 0.18, 0.06, 24);
  const valveLens = new THREE.Mesh(valveLensGeo, valveGlowMat);
  valveLens.position.set(-boxSize * 0.18, half + capThickness + 0.15, -boxSize * 0.14);
  group.add(valveLens);
  disposables.push(valveRingGeo, valveLensGeo);

  // 2. Solid Dark Slate Base Plinth + Recessed 10x10 Calibration Grid Floor
  const baseHeight = 0.36;
  const baseGeo = new THREE.BoxGeometry(capWidth, baseHeight, capWidth);
  const baseMesh = new THREE.Mesh(baseGeo, darkTrimMat);
  baseMesh.position.set(0, -half - baseHeight * 0.5 - 0.02, 0);
  baseMesh.receiveShadow = !isSoftwareGl;
  group.add(baseMesh);
  disposables.push(baseGeo);

  const floorPlaneGeo = new THREE.PlaneGeometry(boxSize - 0.08, boxSize - 0.08);
  const floorPlaneMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0.12,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const floorPlane = new THREE.Mesh(floorPlaneGeo, floorPlaneMat);
  floorPlane.rotation.x = -Math.PI / 2;
  floorPlane.position.set(0, -half + 0.005, 0);
  floorPlane.receiveShadow = !isSoftwareGl;
  group.add(floorPlane);
  disposables.push(floorPlaneGeo, floorPlaneMat);

  // 3. Four Slender Corner Support Pillars + Base & Top Mounting Collars
  const pillarRadius = 0.075;
  const pillarGeo = new THREE.CylinderGeometry(pillarRadius, pillarRadius, boxSize + 0.08, 12);
  const collarGeo = new THREE.BoxGeometry(0.28, 0.14, 0.28);
  disposables.push(pillarGeo, collarGeo);

  const cornerOff = half + 0.06;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(sx * cornerOff, 0, sz * cornerOff);
      pillar.castShadow = !isSoftwareGl;
      group.add(pillar);

      const botCollar = new THREE.Mesh(collarGeo, darkTrimMat);
      botCollar.position.set(sx * cornerOff, -half + 0.06, sz * cornerOff);
      group.add(botCollar);

      const topCollar = new THREE.Mesh(collarGeo, darkTrimMat);
      topCollar.position.set(sx * cornerOff, half - 0.05, sz * cornerOff);
      group.add(topCollar);
    }
  }

  // 4. Translucent Frosted-Glass Tapered Cylindrical Specimen Pedestal in Center
  // Sits cleanly from chamber floor (-half) up to just beneath the apple's bottom calyx!
  const appleBottomY = appleCenterY - appleScale * 0.62;
  const pedHeight = Math.max(0.8, appleBottomY - (-half) - 0.08);
  const pedGeo = new THREE.CylinderGeometry(0.4, 0.56, pedHeight, 32);
  const pedestal = new THREE.Mesh(pedGeo, pedestalMat);
  pedestal.position.set(0, -half + pedHeight * 0.5 + 0.015, 0);
  pedestal.renderOrder = 2;
  group.add(pedestal);

  // Crisp subtle top rim ring on the translucent pedestal
  const pedRimGeo = new THREE.RingGeometry(0.36, 0.4, 32);
  const pedRimMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const pedRim = new THREE.Mesh(pedRimGeo, pedRimMat);
  pedRim.rotation.x = -Math.PI / 2;
  pedRim.position.set(0, -half + pedHeight + 0.02, 0);
  pedRim.renderOrder = 3;
  group.add(pedRim);
  disposables.push(pedGeo, pedRimGeo, pedRimMat);

  // 5. Crisp Subtle Glass Cube Edge Outline
  const innerBoxGeo = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
  const innerEdgesGeo = new THREE.EdgesGeometry(innerBoxGeo);
  const innerEdgesMat = new THREE.LineBasicMaterial({
    color: 0x64748b,
    transparent: true,
    opacity: 0.38,
  });
  group.add(new THREE.LineSegments(innerEdgesGeo, innerEdgesMat));
  disposables.push(innerBoxGeo, innerEdgesGeo, innerEdgesMat);

  // 6. Optical Glass Containment Walls + Elastic Bounce Shimmer Overlays
  const panelGeo = new THREE.PlaneGeometry(boxSize - 0.04, boxSize - 0.04);
  const flashGeo = new THREE.PlaneGeometry(boxSize - 0.1, boxSize - 0.1);
  disposables.push(panelGeo, flashGeo);

  const faceDefs: Array<{
    face: WallFace;
    pos: [number, number, number];
    rot: [number, number, number];
    inward: [number, number, number];
  }> = [
    { face: 'px', pos: [half + 0.01, 0, 0], rot: [0, Math.PI / 2, 0], inward: [-0.02, 0, 0] },
    { face: 'nx', pos: [-half - 0.01, 0, 0], rot: [0, -Math.PI / 2, 0], inward: [0.02, 0, 0] },
    { face: 'py', pos: [0, half + 0.01, 0], rot: [-Math.PI / 2, 0, 0], inward: [0, -0.02, 0] },
    { face: 'ny', pos: [0, -half - 0.01, 0], rot: [Math.PI / 2, 0, 0], inward: [0, 0.02, 0] },
    { face: 'pz', pos: [0, 0, half + 0.01], rot: [0, 0, 0], inward: [0, 0, -0.02] },
    { face: 'nz', pos: [0, 0, -half - 0.01], rot: [0, Math.PI, 0], inward: [0, 0, 0.02] },
  ];

  const wallFlashMeshes = {} as Record<WallFace, THREE.Mesh>;

  for (const def of faceDefs) {
    // Only render transparent glass on the 4 vertical side walls (top & bottom are solid plates)
    if (def.face !== 'py' && def.face !== 'ny') {
      const glass = new THREE.Mesh(panelGeo, glassMaterial);
      glass.position.set(...def.pos);
      glass.rotation.set(...def.rot);
      glass.renderOrder = 6;
      group.add(glass);
    }

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    disposables.push(flashMat);

    const flashMesh = new THREE.Mesh(flashGeo, flashMat);
    flashMesh.position.set(
      def.pos[0] + def.inward[0],
      def.pos[1] + def.inward[1],
      def.pos[2] + def.inward[2]
    );
    flashMesh.rotation.set(...def.rot);
    flashMesh.renderOrder = 5;
    group.add(flashMesh);
    wallFlashMeshes[def.face] = flashMesh;
  }

  // 7. Soft Contact Grounding Shadow Disc beneath the Base Plinth
  const shadowGeo = new THREE.CircleGeometry(boxSize * 0.88, 48);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.set(0, -half - baseHeight - 0.03, 0);
  group.add(shadowDisc);
  disposables.push(shadowGeo, shadowMat);

  return {
    group,
    wallFlashMeshes,
    glassMaterial,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
