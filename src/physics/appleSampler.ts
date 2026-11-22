import { SampledApple, SPECIES_ID, ZONE_ID } from './types';

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
 * Parametric 3D Fuji/Gala apple silhouette radius at polar angle phi [0..PI] and azimuth theta.
 * Classic upright orchard proportions: full rounded shoulders tapering gently toward a flat-bottomed base.
 */
export function evaluateAppleRadius(phi: number, theta: number, scale: number): number {
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sin2Phi = Math.sin(2 * phi);
  const bottomTaper = 1 - 0.15 * Math.pow(Math.max(0, -cosPhi), 1.35);
  const profile = (0.52 + 0.48 * sinPhi + 0.125 * sin2Phi) * bottomTaper;
  const lobe = 1 + 0.022 * Math.cos(5 * theta) * (0.3 + 0.7 * sinPhi);
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
  const sy = dy / 1.15;
  const r = Math.sqrt(x * x + sy * sy + z * z);
  if (r < 1e-6) return 0;
  const phi = Math.acos(Math.max(-1, Math.min(1, sy / r)));
  const theta = Math.atan2(z, x);
  const surfR = evaluateAppleRadius(phi, theta, scale);
  return r / surfR;
}

/**
 * Generates a volumetric multi-tissue particle apple resting naturally on the floor of the
 * sealed chamber (y = -boxSize/2), tagged with:
 * - Organic tissue colors (mottled skin, cream flesh, core/seeds, woody stem)
 * - Dried organic dust/ash colors (Stage 3: Dust Collapse)
 * - Fundamental subatomic particle species (Stage 4–5: Protons, Neutrons, Electrons, Photons)
 */
export function generateAppleParticles(
  targetCount: number,
  boxSize: number,
  seed = 2026
): SampledApple {
  const rng = createRng(seed);
  const count = Math.max(120, Math.round(targetCount));

  // Apple rests naturally on the floor of the sealed box (-half = -3.0)
  const appleScale = boxSize * 0.215; // 1.29 nm
  const appleCenterY = -boxSize * 0.5 + appleScale * 0.94; // ~ -1.787 (bottom rests right above floor!)

  const stemCount = Math.max(6, Math.min(16, Math.round(count * 0.02)));
  const leafCount = Math.max(10, Math.min(20, Math.round(count * 0.025)));
  const bodyCount = count - stemCount - leafCount;

  const positions = new Float64Array(count * 3);
  const zones = new Uint8Array(count);
  const species = new Uint8Array(count);
  const colors = new Float32Array(count * 3);
  const dustColors = new Float32Array(count * 3);
  const gasColors = new Float32Array(count * 3);
  const masses = new Float64Array(count);
  const tissueResistance = new Float32Array(count);

  // Close-packed FCC lattice sampling inside parametric apple volume
  let low = appleScale * 0.1;
  let high = appleScale * 0.68;
  let latticeSpacing = appleScale * 0.24;
  let bestPoints: Array<{ x: number; y: number; z: number; depth: number; theta: number; yNorm: number }> = [];

  const collectBodyLattice = (spacing: number) => {
    const pts: Array<{ x: number; y: number; z: number; depth: number; theta: number; yNorm: number }> = [];
    const extent = appleScale * 1.28;
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
          if (depth <= 0.99 && y > -boxSize * 0.5 + 0.09) {
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
    const skinReserve = Math.min(Math.floor(bodyCount * 0.56), bestPoints.length);
    for (let i = 0; i < skinReserve; i++) {
      selectedBody.push(bestPoints[i]);
    }
    const remaining = bodyCount - selectedBody.length;
    const rest = bestPoints.slice(skinReserve);
    for (let i = 0; i < remaining; i++) {
      selectedBody.push(rest[Math.floor((i * rest.length) / remaining)]);
    }
  }

  let guard = 0;
  while (selectedBody.length < bodyCount && guard < 14000) {
    guard++;
    const px = (rng() * 2 - 1) * appleScale * 1.1;
    const py = appleCenterY + (rng() * 2 - 1) * appleScale * 1.15;
    const pz = (rng() * 2 - 1) * appleScale * 1.1;
    const depth = normalizedAppleDepth(px, py, pz, appleCenterY, appleScale);
    if (depth <= 0.99 && py > -boxSize * 0.5 + 0.09) {
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

  const assignFundamentalSpecies = (index: number, roll: number) => {
    // Realistic mix of Protons (34%), Neutrons (26%), Electrons (26%), Photons (14%)
    if (roll < 0.34) {
      species[index] = SPECIES_ID.proton;
      // Luminous warm crimson-orange (Proton)
      gasColors[index * 3] = 0.96;
      gasColors[index * 3 + 1] = 0.34 + (rng() - 0.5) * 0.1;
      gasColors[index * 3 + 2] = 0.24;
    } else if (roll < 0.6) {
      species[index] = SPECIES_ID.neutron;
      // Cool silver-slate (Neutron)
      gasColors[index * 3] = 0.72 + (rng() - 0.5) * 0.08;
      gasColors[index * 3 + 1] = 0.78 + (rng() - 0.5) * 0.08;
      gasColors[index * 3 + 2] = 0.86;
    } else if (roll < 0.86) {
      species[index] = SPECIES_ID.electron;
      // Crisp electric ice-cyan (Electron)
      gasColors[index * 3] = 0.28;
      gasColors[index * 3 + 1] = 0.84 + (rng() - 0.5) * 0.1;
      gasColors[index * 3 + 2] = 1.0;
    } else {
      species[index] = SPECIES_ID.photon;
      // Brilliant warm starlight gold-white (Photon quantum)
      gasColors[index * 3] = 1.0;
      gasColors[index * 3 + 1] = 0.92;
      gasColors[index * 3 + 2] = 0.62;
    }

    // Dried organic ash/dust color for Stage 3 (Dust Collapse)
    const dShade = 0.22 + rng() * 0.18;
    dustColors[index * 3] = dShade + 0.06;
    dustColors[index * 3 + 1] = dShade + 0.03;
    dustColors[index * 3 + 2] = dShade * 0.92;
  };

  let idx = 0;
  for (let i = 0; i < selectedBody.length && idx < bodyCount; i++) {
    const p = selectedBody[i];
    const jitter = latticeSpacing * 0.03;
    const x = p.x + (rng() - 0.5) * jitter;
    const y = Math.max(-boxSize * 0.5 + 0.1, p.y + (rng() - 0.5) * jitter);
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
      tissueResistance[idx] = 0.72 + rng() * 0.14;
      const mottle = rng();
      if (mottle > 0.74) {
        colors[idx * 3] = 0.9;
        colors[idx * 3 + 1] = 0.64;
        colors[idx * 3 + 2] = 0.32;
      } else {
        colors[idx * 3] = 0.76 + (rng() - 0.5) * 0.1;
        colors[idx * 3 + 1] = 0.14 + rng() * 0.08;
        colors[idx * 3 + 2] = 0.13;
      }
    } else if (isCore) {
      zones[idx] = ZONE_ID.core;
      tissueResistance[idx] = 0.58 + rng() * 0.12;
      const isSeed = rng() < 0.48;
      if (isSeed) {
        colors[idx * 3] = 0.24;
        colors[idx * 3 + 1] = 0.13;
        colors[idx * 3 + 2] = 0.08;
      } else {
        colors[idx * 3] = 0.88;
        colors[idx * 3 + 1] = 0.81;
        colors[idx * 3 + 2] = 0.6;
      }
    } else {
      zones[idx] = ZONE_ID.flesh;
      tissueResistance[idx] = 0.28 + rng() * 0.24;
      const shade = (rng() - 0.5) * 0.04;
      colors[idx * 3] = 0.95 + shade;
      colors[idx * 3 + 1] = 0.9 + shade;
      colors[idx * 3 + 2] = 0.75 + shade;
    }

    assignFundamentalSpecies(idx, rng());
    idx++;
  }

  // Curved woody stem rising from the top basin
  const stemStartY = appleCenterY + appleScale * 0.56;
  const stemTotalH = appleScale * 0.54;
  for (let i = 0; i < stemCount && idx < count; i++) {
    const t = stemCount > 1 ? i / (stemCount - 1) : 0.5;
    positions[idx * 3] = appleScale * (0.04 * t + 0.16 * t * t);
    positions[idx * 3 + 1] = stemStartY + t * stemTotalH;
    positions[idx * 3 + 2] = appleScale * (0.02 * t + 0.03 * t * t);
    zones[idx] = ZONE_ID.stem;
    masses[idx] = 0.95;
    tissueResistance[idx] = 0.92;
    colors[idx * 3] = 0.46;
    colors[idx * 3 + 1] = 0.28;
    colors[idx * 3 + 2] = 0.14;
    assignFundamentalSpecies(idx, rng());
    idx++;
  }

  // Tucked stem-basin calyx collar particles
  const collarBaseY = stemStartY + stemTotalH * 0.06;
  for (let i = 0; i < leafCount && idx < count; i++) {
    const a = (i / Math.max(1, leafCount)) * Math.PI * 2;
    const rad = appleScale * (0.06 + (i % 3) * 0.04);
    positions[idx * 3] = Math.cos(a) * rad;
    positions[idx * 3 + 1] = collarBaseY - (i % 3) * appleScale * 0.025;
    positions[idx * 3 + 2] = Math.sin(a) * rad;
    zones[idx] = ZONE_ID.leaf;
    masses[idx] = 0.85;
    tissueResistance[idx] = 0.86;
    colors[idx * 3] = 0.7;
    colors[idx * 3 + 1] = 0.54;
    colors[idx * 3 + 2] = 0.28;
    assignFundamentalSpecies(idx, rng());
    idx++;
  }

  const finalCount = idx;

  // Pairwise minimum-distance relaxation (strictly keeping particles above chamber floor!)
  const minSep = latticeSpacing * 0.72;
  const minSepSq = minSep * minSep;
  const halfSafe = boxSize * 0.46;
  const minFloorSafe = -boxSize * 0.5 + 0.12;
  for (let pass = 0; pass < 3; pass++) {
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
          positions[i3 + 1] = Math.max(minFloorSafe, Math.min(halfSafe, positions[i3 + 1] + ny * push));
          positions[i3 + 2] = Math.max(-halfSafe, Math.min(halfSafe, positions[i3 + 2] + nz * push));
          positions[j3] = Math.max(-halfSafe, Math.min(halfSafe, positions[j3] - nx * push));
          positions[j3 + 1] = Math.max(minFloorSafe, Math.min(halfSafe, positions[j3 + 1] - ny * push));
          positions[j3 + 2] = Math.max(-halfSafe, Math.min(halfSafe, positions[j3 + 2] - nz * push));
        }
      }
    }
  }

  // Ultra-fine realistic subatomic / molecular particle radius
  const particleRadius = Math.max(0.02, Math.min(0.028, latticeSpacing * 0.14));

  return {
    count: finalCount,
    positions: positions.subarray(0, finalCount * 3),
    zones: zones.subarray(0, finalCount),
    species: species.subarray(0, finalCount),
    colors: colors.subarray(0, finalCount * 3),
    dustColors: dustColors.subarray(0, finalCount * 3),
    gasColors: gasColors.subarray(0, finalCount * 3),
    masses: masses.subarray(0, finalCount),
    tissueResistance: tissueResistance.subarray(0, finalCount),
    nearestNeighborDist: latticeSpacing,
    particleRadius,
    appleCenterY,
    appleScale,
  };
}
