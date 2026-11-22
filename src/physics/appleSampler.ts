import { SampledApple, ZONE_ID } from './types';

function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Parametric 3D apple silhouette radius at polar angle phi [0..PI] and azimuth theta.
 * Produces crisp top stem dimple, full rounded upper shoulders, subtle 5-lobe symmetry,
 * and tapered bottom calyx indentation.
 */
export function evaluateAppleRadius(phi: number, theta: number, scale: number): number {
  const sinPhi = Math.sin(phi);
  const sin2Phi = Math.sin(2 * phi);
  const profile = 0.52 + 0.54 * sinPhi + 0.095 * sin2Phi;
  const lobe = 1 + 0.042 * Math.cos(5 * theta) * (0.35 + 0.65 * sinPhi);
  return scale * profile * lobe;
}

function normalizedAppleDepth(
  x: number,
  y: number,
  z: number,
  centerY: number,
  scale: number
): number {
  const dy = y - centerY;
  const sy = dy / 1.04;
  const r = Math.sqrt(x * x + sy * sy + z * z);
  if (r < 1e-6) return 0;
  const phi = Math.acos(Math.max(-1, Math.min(1, sy / r)));
  const theta = Math.atan2(z, x);
  const surfR = evaluateAppleRadius(phi, theta, scale);
  return r / surfR;
}

/**
 * Generates a volumetric multi-tissue particle apple inside a sealed cube of width `boxSize` (nm):
 * - Cuticle & Epidermis (crimson-gold striped skin, higher tensile cohesion)
 * - Parenchyma Cortex (hydrated cream flesh, faster enzymatic oxidation & slumping)
 * - Central Core & dark seeds
 * - Lignified woody stem & orchard green leaf (highest structural resistance)
 */
export function generateAppleParticles(
  targetCount: number,
  boxSize: number,
  seed = 2026
): SampledApple {
  const rng = createRng(seed);
  const count = Math.max(120, Math.round(targetCount));

  // Apple floats cleanly above the translucent pedestal in the upper-middle chamber
  const appleScale = boxSize * 0.215;
  const appleCenterY = boxSize * 0.055;

  const stemCount = Math.max(6, Math.min(16, Math.round(count * 0.024)));
  const leafCount = Math.max(10, Math.min(28, Math.round(count * 0.048)));
  const bodyCount = count - stemCount - leafCount;

  const positions = new Float64Array(count * 3);
  const zones = new Uint8Array(count);
  const colors = new Float32Array(count * 3);
  const gasColors = new Float32Array(count * 3);
  const masses = new Float64Array(count);
  const tissueResistance = new Float32Array(count);

  // Close-packed FCC lattice sampling inside parametric apple volume
  let low = appleScale * 0.12;
  let high = appleScale * 0.68;
  let latticeSpacing = appleScale * 0.26;
  let bestPoints: Array<{ x: number; y: number; z: number; depth: number; theta: number; yNorm: number }> = [];

  const collectBodyLattice = (spacing: number) => {
    const pts: Array<{ x: number; y: number; z: number; depth: number; theta: number; yNorm: number }> = [];
    const extent = appleScale * 1.24;
    const dz = spacing * 0.8660254;
    const dy = spacing * 0.8164966;
    let iy = 0;
    for (let y = appleCenterY - extent; y <= appleCenterY + extent; y += dy, iy++) {
      let iz = 0;
      const zOff = (iy % 2) * (spacing * 0.288675);
      for (let z = -extent; z <= extent; z += dz, iz++) {
        const xOff = ((iz + iy) % 2) * (spacing * 0.5);
        for (let x = -extent; x <= extent; x += spacing) {
          const px = x + xOff;
          const pz = z + zOff;
          const depth = normalizedAppleDepth(px, y, pz, appleCenterY, appleScale);
          if (depth <= 1.0) {
            pts.push({
              x: px,
              y,
              z: pz,
              depth,
              theta: Math.atan2(pz, px),
              yNorm: (y - appleCenterY) / appleScale,
            });
          }
        }
      }
    }
    return pts;
  };

  for (let iter = 0; iter < 18; iter++) {
    const mid = (low + high) * 0.5;
    const pts = collectBodyLattice(mid);
    bestPoints = pts;
    latticeSpacing = mid;
    if (pts.length > bodyCount) {
      low = mid;
    } else {
      high = mid;
    }
  }
  if (bestPoints.length < bodyCount) {
    latticeSpacing = low;
    bestPoints = collectBodyLattice(low);
  }

  bestPoints.sort((a, b) => b.depth - a.depth);
  const selectedBody: typeof bestPoints = [];
  if (bestPoints.length <= bodyCount) {
    selectedBody.push(...bestPoints);
  } else {
    const skinReserve = Math.min(Math.floor(bodyCount * 0.58), bestPoints.length);
    for (let i = 0; i < skinReserve; i++) {
      selectedBody.push(bestPoints[i]);
    }
    const remaining = bodyCount - selectedBody.length;
    const rest = bestPoints.slice(skinReserve);
    for (let i = 0; i < remaining; i++) {
      selectedBody.push(rest[Math.floor((i * rest.length) / remaining)]);
    }
  }

  // Top up any deficit
  let guard = 0;
  while (selectedBody.length < bodyCount && guard < 12000) {
    guard++;
    const px = (rng() * 2 - 1) * appleScale * 1.1;
    const py = appleCenterY + (rng() * 2 - 1) * appleScale * 1.1;
    const pz = (rng() * 2 - 1) * appleScale * 1.1;
    const depth = normalizedAppleDepth(px, py, pz, appleCenterY, appleScale);
    if (depth <= 1.0) {
      selectedBody.push({
        x: px,
        y: py,
        z: pz,
        depth,
        theta: Math.atan2(pz, px),
        yNorm: (py - appleCenterY) / appleScale,
      });
    }
  }

  let idx = 0;
  for (let i = 0; i < selectedBody.length && idx < bodyCount; i++) {
    const p = selectedBody[i];
    const jitter = latticeSpacing * 0.03;
    const x = p.x + (rng() - 0.5) * jitter;
    const y = p.y + (rng() - 0.5) * jitter;
    const z = p.z + (rng() - 0.5) * jitter;

    positions[idx * 3] = x;
    positions[idx * 3 + 1] = y;
    positions[idx * 3 + 2] = z;
    masses[idx] = 1.0;

    const rXZ = Math.sqrt(x * x + z * z);
    const isCore = rXZ < appleScale * 0.27 && Math.abs(p.yNorm) < 0.42 && p.depth < 0.58;
    const isSkin = p.depth > 0.74;

    if (isSkin) {
      zones[idx] = ZONE_ID.skin;
      tissueResistance[idx] = 0.72 + rng() * 0.14; // Cuticle resists collapse longer than soft flesh
      // Striped Honeycrisp / Gala red & golden-yellow vertical striping
      const stripe = Math.sin(p.theta * 14 + Math.sin(p.yNorm * 3.5) * 1.2) * 0.5 + 0.5;
      if (stripe > 0.68) {
        colors[idx * 3] = 0.92;
        colors[idx * 3 + 1] = 0.62 + (stripe - 0.68) * 0.45;
        colors[idx * 3 + 2] = 0.22;
      } else {
        colors[idx * 3] = 0.82 + (rng() - 0.5) * 0.06;
        colors[idx * 3 + 1] = 0.14 + stripe * 0.1;
        colors[idx * 3 + 2] = 0.14;
      }
      // In Ergodic Gas phase: warm amber-orange molecular species (matches reference image)
      gasColors[idx * 3] = 0.93;
      gasColors[idx * 3 + 1] = 0.56 + (rng() - 0.5) * 0.12;
      gasColors[idx * 3 + 2] = 0.2;
    } else if (isCore) {
      zones[idx] = ZONE_ID.core;
      tissueResistance[idx] = 0.58 + rng() * 0.12;
      const isSeed = rng() < 0.48;
      if (isSeed) {
        colors[idx * 3] = 0.26;
        colors[idx * 3 + 1] = 0.14;
        colors[idx * 3 + 2] = 0.08;
      } else {
        colors[idx * 3] = 0.88;
        colors[idx * 3 + 1] = 0.8;
        colors[idx * 3 + 2] = 0.58;
      }
      gasColors[idx * 3] = 0.9;
      gasColors[idx * 3 + 1] = 0.52;
      gasColors[idx * 3 + 2] = 0.18;
    } else {
      zones[idx] = ZONE_ID.flesh;
      tissueResistance[idx] = 0.28 + rng() * 0.24; // Hydrated parenchyma cortex oxidizes & slumps first
      const shade = (rng() - 0.5) * 0.04;
      colors[idx * 3] = 0.96 + shade;
      colors[idx * 3 + 1] = 0.91 + shade;
      colors[idx * 3 + 2] = 0.76 + shade;
      // In Ergodic Gas phase: crisp pale ice-blue/white volatile species (matches reference image)
      gasColors[idx * 3] = 0.78 + (rng() - 0.5) * 0.1;
      gasColors[idx * 3 + 1] = 0.89 + (rng() - 0.5) * 0.06;
      gasColors[idx * 3 + 2] = 0.95;
    }
    idx++;
  }

  // Woody stem rising cleanly from top dimple (total height = 0.42 * appleScale, well inside ceiling)
  const stemStartY = appleCenterY + appleScale * 0.54;
  const stemTotalH = appleScale * 0.44;
  for (let i = 0; i < stemCount && idx < count; i++) {
    const t = stemCount > 1 ? i / (stemCount - 1) : 0.5;
    positions[idx * 3] = appleScale * (0.04 * t + 0.14 * t * t);
    positions[idx * 3 + 1] = stemStartY + t * stemTotalH;
    positions[idx * 3 + 2] = appleScale * (0.02 * t + 0.04 * t * t);
    zones[idx] = ZONE_ID.stem;
    masses[idx] = 0.95;
    tissueResistance[idx] = 0.92; // Lignified stem resists decay longest
    colors[idx * 3] = 0.42;
    colors[idx * 3 + 1] = 0.26;
    colors[idx * 3 + 2] = 0.14;
    gasColors[idx * 3] = 0.88;
    gasColors[idx * 3 + 1] = 0.54;
    gasColors[idx * 3 + 2] = 0.24;
    idx++;
  }

  // Compact sculpted botanical green leaf emerging beside the stem crown
  const leafBaseX = appleScale * 0.06;
  const leafBaseY = stemStartY + stemTotalH * 0.52;
  const leafLen = appleScale * 0.54;
  const leafWidth = appleScale * 0.26;
  const rows = Math.max(3, Math.ceil(Math.sqrt(leafCount * 1.8)));
  let placedLeaf = 0;
  for (let r = 0; r < rows && placedLeaf < leafCount && idx < count; r++) {
    const u = (r + 0.5) / rows;
    const cols = Math.max(1, Math.round(Math.sin(Math.PI * u) * (rows * 0.6)));
    const halfW = leafWidth * 0.5 * Math.sin(Math.PI * u);
    for (let c = 0; c < cols && placedLeaf < leafCount && idx < count; c++) {
      const side = cols > 1 ? (c / (cols - 1)) * 2 - 1 : 0;
      positions[idx * 3] = leafBaseX - u * leafLen;
      positions[idx * 3 + 1] =
        leafBaseY + Math.sin(u * Math.PI * 0.8) * appleScale * 0.16 - Math.abs(side) * 0.05;
      positions[idx * 3 + 2] = side * halfW + u * leafLen * 0.16;
      zones[idx] = ZONE_ID.leaf;
      masses[idx] = 0.85;
      tissueResistance[idx] = 0.88;
      colors[idx * 3] = 0.24;
      colors[idx * 3 + 1] = 0.64 + u * 0.08;
      colors[idx * 3 + 2] = 0.22;
      gasColors[idx * 3] = 0.76;
      gasColors[idx * 3 + 1] = 0.88;
      gasColors[idx * 3 + 2] = 0.94;
      placedLeaf++;
      idx++;
    }
  }

  const finalCount = idx;

  // Pairwise minimum-distance relaxation so zero particles overlap at initialization
  const minSep = latticeSpacing * 0.86;
  const minSepSq = minSep * minSep;
  const halfSafe = boxSize * 0.46;
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < finalCount; i++) {
      const i3 = i * 3;
      for (let j = i + 1; j < finalCount; j++) {
        const j3 = j * 3;
        const dx = positions[i3] - positions[j3];
        const dy = positions[i3 + 1] - positions[j3 + 1];
        const dz = positions[i3 + 2] - positions[j3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < minSepSq && d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = (minSep - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          const nz = dz / d;
          positions[i3] = Math.max(-halfSafe, Math.min(halfSafe, positions[i3] + nx * push));
          positions[i3 + 1] = Math.max(-halfSafe, Math.min(halfSafe, positions[i3 + 1] + ny * push));
          positions[i3 + 2] = Math.max(-halfSafe, Math.min(halfSafe, positions[i3 + 2] + nz * push));
          positions[j3] = Math.max(-halfSafe, Math.min(halfSafe, positions[j3] - nx * push));
          positions[j3 + 1] = Math.max(-halfSafe, Math.min(halfSafe, positions[j3 + 1] - ny * push));
          positions[j3 + 2] = Math.max(-halfSafe, Math.min(halfSafe, positions[j3 + 2] - nz * push));
        }
      }
    }
  }

  const particleRadius = Math.max(0.036, Math.min(0.052, latticeSpacing * 0.2));

  return {
    count: finalCount,
    positions: positions.subarray(0, finalCount * 3),
    zones: zones.subarray(0, finalCount),
    colors: colors.subarray(0, finalCount * 3),
    gasColors: gasColors.subarray(0, finalCount * 3),
    masses: masses.subarray(0, finalCount),
    tissueResistance: tissueResistance.subarray(0, finalCount),
    nearestNeighborDist: latticeSpacing,
    particleRadius,
    appleCenterY,
    appleScale,
  };
}
