import * as THREE from 'three';
import { WallFace } from '../physics/types';

export interface ContainmentBoxAssembly {
  group: THREE.Group;
  wallFlashMeshes: Record<WallFace, THREE.Mesh>;
  glassMaterial: THREE.MeshPhysicalMaterial;
  dispose: () => void;
}

/**
 * Generates a realistic brushed obsidian-slate sealed chamber floor plate with a
 * faint precision calibration grid so the resting apple, wet decomposition puddle,
 * and dehydrated ash mound look physically grounded inside the indestructible space box.
 */
function createChamberFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Rich matte dark slate-charcoal floor surface (lets apple shadow & glossy puddle pop!)
  const bg = ctx.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size * 0.72);
  bg.addColorStop(0.0, '#1e2532');
  bg.addColorStop(0.65, '#131823');
  bg.addColorStop(1.0, '#0c1018');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Fine brushed stone/metal micro-grain
  let seed = 551199;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 4000; i++) {
    const v = 22 + Math.floor(rand() * 24);
    ctx.fillStyle = `rgba(${v + 4}, ${v + 8}, ${v + 16}, 0.22)`;
    ctx.fillRect(rand() * size, rand() * size, 2, 1.5);
  }

  // Subtle etched 10x10 coordinate grid
  const divisions = 10;
  ctx.strokeStyle = 'rgba(148, 197, 255, 0.11)';
  ctx.lineWidth = 1.2;
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

  // Crisp hermetically sealed perimeter border
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.34)';
  ctx.lineWidth = 3.5;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Builds an indestructible, hermetically sealed transparent quartz-glass box floating
 * weightlessly in deep outer space, with a solid dark brushed-slate base plate where the
 * apple sits, rots into a puddle, turns to dust, dissolves into subatomic soup, and reforms.
 */
export function buildContainmentBox(
  boxSize: number,
  isSoftwareGl: boolean,
  maxAnisotropy: number
): ContainmentBoxAssembly {
  const group = new THREE.Group();
  const half = boxSize * 0.5;
  const disposables: Array<{ dispose: () => void }> = [];

  const floorTex = createChamberFloorTexture(maxAnisotropy);
  disposables.push(floorTex);

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.84,
    roughness: 0.26,
  });

  const basePlinthMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.65,
    roughness: 0.42,
  });

  const valveGlowMat = new THREE.MeshStandardMaterial({
    color: 0xbae6fd,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.1,
    roughness: 0.16,
    metalness: 0.1,
  });

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd0ebff,
    metalness: 0.03,
    roughness: 0.05,
    transmission: isSoftwareGl ? 0 : 0.94,
    ior: 1.5,
    thickness: 0.12,
    transparent: true,
    opacity: isSoftwareGl ? 0.05 : 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  disposables.push(frameMat, basePlinthMat, valveGlowMat, glassMaterial);

  // 1. Sleek Indestructible Titanium-Obsidian Edge Frame
  const railThickness = 0.085;
  const railLen = boxSize + railThickness * 2;
  const railXGeo = new THREE.BoxGeometry(railLen, railThickness, railThickness);
  const railZGeo = new THREE.BoxGeometry(railThickness, railThickness, railLen);
  const pillarGeo = new THREE.CylinderGeometry(0.05, 0.05, boxSize + railThickness, 12);
  const cornerNodeGeo = new THREE.BoxGeometry(0.19, 0.19, 0.19);
  disposables.push(railXGeo, railZGeo, pillarGeo, cornerNodeGeo);

  const edgeOff = half + railThickness * 0.5;
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const rx = new THREE.Mesh(railXGeo, frameMat);
      rx.position.set(0, sy * edgeOff, sz * edgeOff);
      group.add(rx);
    }
    for (const sx of [-1, 1]) {
      const rz = new THREE.Mesh(railZGeo, frameMat);
      rz.position.set(sx * edgeOff, sy * edgeOff, 0);
      group.add(rz);
    }
  }

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, frameMat);
      pillar.position.set(sx * edgeOff, 0, sz * edgeOff);
      group.add(pillar);

      for (const sy of [-1, 1]) {
        const node = new THREE.Mesh(cornerNodeGeo, basePlinthMat);
        node.position.set(sx * edgeOff, sy * edgeOff, sz * edgeOff);
        group.add(node);
      }
    }
  }

  // Subtle hermetic vacuum-seal sensor cap on top rear-left corner
  const valveBaseGeo = new THREE.CylinderGeometry(0.15, 0.19, 0.09, 20);
  const valveBase = new THREE.Mesh(valveBaseGeo, basePlinthMat);
  valveBase.position.set(-half + 0.45, edgeOff + 0.06, -half + 0.45);
  group.add(valveBase);

  const valveLensGeo = new THREE.CylinderGeometry(0.1, 0.11, 0.04, 20);
  const valveLens = new THREE.Mesh(valveLensGeo, valveGlowMat);
  valveLens.position.set(-half + 0.45, edgeOff + 0.11, -half + 0.45);
  group.add(valveLens);
  disposables.push(valveBaseGeo, valveLensGeo);

  // 2. Solid Dark Brushed-Slate Chamber Base Slab (physically grounds the apple, puddle & dust!)
  const baseThick = 0.24;
  const baseSlabGeo = new THREE.BoxGeometry(boxSize + 0.16, baseThick, boxSize + 0.16);
  const baseSlab = new THREE.Mesh(baseSlabGeo, basePlinthMat);
  baseSlab.position.set(0, -half - baseThick * 0.5, 0);
  baseSlab.receiveShadow = !isSoftwareGl;
  group.add(baseSlab);
  disposables.push(baseSlabGeo);

  const floorGeo = new THREE.PlaneGeometry(boxSize - 0.02, boxSize - 0.02);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.74,
    metalness: 0.22,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(0, -half + 0.004, 0);
  floorMesh.receiveShadow = !isSoftwareGl;
  group.add(floorMesh);
  disposables.push(floorGeo, floorMat);

  // 3. Crisp Inner Optical Edge Lines
  const innerBoxGeo = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
  const innerEdgesGeo = new THREE.EdgesGeometry(innerBoxGeo);
  const innerEdgesMat = new THREE.LineBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.28,
  });
  group.add(new THREE.LineSegments(innerEdgesGeo, innerEdgesMat));
  disposables.push(innerBoxGeo, innerEdgesGeo, innerEdgesMat);

  // 4. Sealed Optical Glass Panels + Elastic Impact Shimmers
  const panelGeo = new THREE.PlaneGeometry(boxSize - 0.04, boxSize - 0.04);
  const flashGeo = new THREE.PlaneGeometry(boxSize - 0.1, boxSize - 0.1);
  disposables.push(panelGeo, flashGeo);

  const faceDefs: Array<{
    face: WallFace;
    pos: [number, number, number];
    rot: [number, number, number];
    inward: [number, number, number];
  }> = [
    { face: 'px', pos: [half + 0.008, 0, 0], rot: [0, Math.PI / 2, 0], inward: [-0.02, 0, 0] },
    { face: 'nx', pos: [-half - 0.008, 0, 0], rot: [0, -Math.PI / 2, 0], inward: [0.02, 0, 0] },
    { face: 'py', pos: [0, half + 0.008, 0], rot: [-Math.PI / 2, 0, 0], inward: [0, -0.02, 0] },
    { face: 'ny', pos: [0, -half - 0.008, 0], rot: [Math.PI / 2, 0, 0], inward: [0, 0.02, 0] },
    { face: 'pz', pos: [0, 0, half + 0.008], rot: [0, 0, 0], inward: [0, 0, -0.02] },
    { face: 'nz', pos: [0, 0, -half - 0.008], rot: [0, Math.PI, 0], inward: [0, 0, 0.02] },
  ];

  const wallFlashMeshes = {} as Record<WallFace, THREE.Mesh>;

  for (const def of faceDefs) {
    if (def.face !== 'ny') {
      const glass = new THREE.Mesh(panelGeo, glassMaterial);
      glass.position.set(...def.pos);
      glass.rotation.set(...def.rot);
      glass.renderOrder = 6;
      group.add(glass);
    }

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
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

  return {
    group,
    wallFlashMeshes,
    glassMaterial,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
