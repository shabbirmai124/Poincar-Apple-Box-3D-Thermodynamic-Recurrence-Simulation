import { MacroPhase } from './types';

export interface EntropyResult {
  entropy: number;
  maxEntropy: number;
  pct: number; // 0..100%
}

const VOXEL_RES = 8; // 8x8x8 = 512 spatial microstate cells
const TOTAL_BINS = VOXEL_RES * VOXEL_RES * VOXEL_RES;
const binCounts = new Int32Array(TOTAL_BINS);

/**
 * Computes Spatial Shannon / Boltzmann Entropy S = -sum(p_k * ln(p_k)) across an 8x8x8 voxel grid.
 */
export function computeShannonEntropy(
  positions: Float64Array,
  count: number,
  boxSize: number,
  baselineEntropy = 0
): EntropyResult {
  binCounts.fill(0);
  const half = boxSize * 0.5;
  const invSize = 1 / boxSize;

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    const gx = Math.min(VOXEL_RES - 1, Math.max(0, Math.floor((x + half) * invSize * VOXEL_RES)));
    const gy = Math.min(VOXEL_RES - 1, Math.max(0, Math.floor((y + half) * invSize * VOXEL_RES)));
    const gz = Math.min(VOXEL_RES - 1, Math.max(0, Math.floor((z + half) * invSize * VOXEL_RES)));

    binCounts[(gx * VOXEL_RES + gy) * VOXEL_RES + gz]++;
  }

  let s = 0;
  const invN = 1 / Math.max(1, count);
  for (let b = 0; b < TOTAL_BINS; b++) {
    const c = binCounts[b];
    if (c > 0) {
      const p = c * invN;
      s -= p * Math.log(p);
    }
  }

  const maxUniform = Math.log(Math.min(TOTAL_BINS, Math.max(2, count))) * 0.93;
  const floorS = Math.min(baselineEntropy * 0.96, maxUniform * 0.72);
  const denom = Math.max(1e-4, maxUniform - floorS);
  const rawPct = ((s - floorS) / denom) * 100;
  const pct = Math.max(0, Math.min(100, rawPct));

  return {
    entropy: s,
    maxEntropy: maxUniform,
    pct,
  };
}

/**
 * Computes Structural Root-Mean-Square Deviation (RMSD, in nm) relative to the fresh apple state.
 */
export function computeRMSD(
  positions: Float64Array,
  initPositions: Float64Array,
  count: number
): number {
  let sumSq = 0;
  const len = count * 3;
  for (let i = 0; i < len; i++) {
    const d = positions[i] - initPositions[i];
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / Math.max(1, count));
}

export function computeRecombinationPct(rmsdNm: number, boxSize: number): number {
  const maxRefRmsd = boxSize * 0.56;
  const norm = Math.max(0, Math.min(1, 1 - rmsdNm / maxRefRmsd));
  return norm * 100;
}

export function computeRawKineticEnergy(
  velocities: Float64Array,
  masses: Float64Array,
  count: number
): number {
  let k = 0;
  for (let i = 0; i < count; i++) {
    const vx = velocities[i * 3];
    const vy = velocities[i * 3 + 1];
    const vz = velocities[i * 3 + 2];
    k += 0.5 * masses[i] * (vx * vx + vy * vy + vz * vz);
  }
  return k;
}

export function scaleKineticEnergyKj(
  rawKinetic: number,
  count: number,
  temperatureK: number
): number {
  const perParticle = rawKinetic / Math.max(1, count);
  const thermalFloor = (temperatureK / 310) * 11.8;
  return thermalFloor + perParticle * 0.42;
}

/**
 * Maps macroscopic thermodynamic phase & cycle progress to authentic Apple-in-a-Box theory labels,
 * cosmic timescales, and concise physical captions.
 */
export function getPhaseCaptions(
  phase: MacroPhase,
  cycleProgress: number,
  rmsdNm: number
): { stageLabel: string; timescaleLabel: string; stageCaption: string } {
  if (phase === 'recombined') {
    return {
      stageLabel: 'Poincaré Recurrence Achieved',
      timescaleLabel: 't = T_rec',
      stageCaption:
        'After cycling through astronomical microstates, the exact starting apple spontaneously reassembles.',
    };
  }
  if (phase === 'reversing') {
    return {
      stageLabel: 'Spontaneous Recombination',
      timescaleLabel: rmsdNm < 0.7 ? 't → T_rec' : '10^(10^50) yr',
      stageCaption:
        'Finite phase-space trajectories converge back together, condensing dust and energy into living fruit.',
    };
  }
  if (phase === 'rearranging') {
    return {
      stageLabel: 'Infinite Random Rearrangement',
      timescaleLabel: '10^(10^48) yr',
      stageCaption:
        'Zero atoms ever escape the sealed box; endless collisions explore every possible arrangement of matter.',
    };
  }
  if (phase === 'equilibrium') {
    return {
      stageLabel: 'Thermal Equilibrium (Subatomic Soup)',
      timescaleLabel: cycleProgress > 0.48 ? '10^36 yr' : '10^14 yr',
      stageCaption:
        'Matter breaks down into protons, neutrons, electrons, and photons bouncing elastically at max entropy.',
    };
  }
  if (phase === 'dust') {
    return {
      stageLabel: 'Dehydration & Dust Collapse',
      timescaleLabel: '10^2 – 10^4 yr',
      stageCaption:
        'Organic moisture evaporates and the shriveled husk crumbles into a fine dust mound & drifting gas.',
    };
  }
  if (phase === 'decay') {
    return {
      stageLabel: 'Decay, Mold & Puddle',
      timescaleLabel: 'Weeks – Years',
      stageCaption:
        'Bacteria and mold digest the apple, wrinkling the skin and collapsing it into a dark viscous puddle.',
    };
  }
  return {
    stageLabel: 'Fresh Apple in Sealed Box',
    timescaleLabel: 't = 0 s',
    stageCaption:
      'A fresh apple rests inside an indestructible, perfectly isolated chamber allowing zero matter or energy out.',
  };
}
