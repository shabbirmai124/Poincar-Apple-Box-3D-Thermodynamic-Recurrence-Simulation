import { MacroPhase } from './types';

export interface EntropyResult {
  entropy: number;
  maxEntropy: number;
  pct: number; // 0..100% normalized between compact apple baseline and ergodic max-entropy gas
}

const VOXEL_GRID_RES = 8; // 8 x 8 x 8 = 512 spatial microstate bins

/**
 * Computes Spatial Shannon / Boltzmann Entropy across an 8x8x8 = 512 voxel partition
 * of the sealed containment chamber:
 *   S = -sum_{p_i > 0} p_i * ln(p_i)
 */
export function computeShannonEntropy(
  positions: Float64Array,
  count: number,
  boxSize: number,
  baselineEntropy?: number
): EntropyResult {
  const totalCells = VOXEL_GRID_RES * VOXEL_GRID_RES * VOXEL_GRID_RES;
  // Theoretical max occupancy entropy for N particles in 512 bins (finite-N Stirling correction)
  const expectedOccupied = totalCells * (1 - Math.exp(-count / totalCells));
  const maxEntropy = Math.log(Math.max(2, Math.min(totalCells, expectedOccupied * 1.16)));

  if (count <= 1) {
    return { entropy: 0, maxEntropy: 1, pct: 0 };
  }

  const counts = new Int32Array(totalCells);
  const half = boxSize * 0.5;
  const invSize = VOXEL_GRID_RES / boxSize;

  for (let i = 0; i < count; i++) {
    const cx = Math.min(
      VOXEL_GRID_RES - 1,
      Math.max(0, Math.floor((positions[i * 3] + half) * invSize))
    );
    const cy = Math.min(
      VOXEL_GRID_RES - 1,
      Math.max(0, Math.floor((positions[i * 3 + 1] + half) * invSize))
    );
    const cz = Math.min(
      VOXEL_GRID_RES - 1,
      Math.max(0, Math.floor((positions[i * 3 + 2] + half) * invSize))
    );
    counts[(cx * VOXEL_GRID_RES + cy) * VOXEL_GRID_RES + cz]++;
  }

  let entropy = 0;
  const invN = 1 / count;
  for (let c = 0; c < totalCells; c++) {
    const n = counts[c];
    if (n > 0) {
      const p = n * invN;
      entropy -= p * Math.log(p);
    }
  }

  const floorS = baselineEntropy !== undefined ? baselineEntropy * 0.96 : 0;
  const span = Math.max(0.5, maxEntropy - floorS);
  const rawRatio = (entropy - floorS) / span;
  const pct = Math.max(2.0, Math.min(100.0, rawRatio * 100));

  return { entropy, maxEntropy, pct };
}

/**
 * Computes Root-Mean-Square Deviation (nm) from initial exact apple coordinates r_i(0).
 */
export function computeRMSD(
  positions: Float64Array,
  initPositions: Float64Array,
  count: number
): number {
  if (count === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const dx = positions[i3] - initPositions[i3];
    const dy = positions[i3 + 1] - initPositions[i3 + 1];
    const dz = positions[i3 + 2] - initPositions[i3 + 2];
    sumSq += dx * dx + dy * dy + dz * dz;
  }
  return Math.sqrt(sumSq / count);
}

/**
 * Computes total simulation kinetic energy K = sum(0.5 * m_i * |v_i|^2).
 */
export function computeRawKineticEnergy(
  velocities: Float64Array,
  masses: Float64Array,
  count: number
): number {
  let k = 0;
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const vx = velocities[i3];
    const vy = velocities[i3 + 1];
    const vz = velocities[i3 + 2];
    k += 0.5 * masses[i] * (vx * vx + vy * vy + vz * vz);
  }
  return k;
}

/**
 * Maps internal simulation kinetic energy to physically scaled molar kinetic energy (kJ/mol)
 * calibrated around 310 K physiological/room chamber temperature (~12.4 kJ/mol solid -> ~19.2 kJ/mol gas).
 */
export function scaleKineticEnergyKj(rawK: number, count: number, temperatureK: number): number {
  if (count === 0) return 0;
  const meanKPerParticle = rawK / count;
  // Base thermal floor proportional to T_K plus live kinetic energy contribution from Verlet speeds
  const thermalBase = (temperatureK / 310) * 11.9;
  const dynamicTerm = meanKPerParticle * 0.42;
  return thermalBase + dynamicTerm;
}

export function computeRecombinationPct(rmsdNm: number, boxSize: number): number {
  const maxRef = boxSize * 0.52;
  const normalized = Math.max(0, Math.min(1, 1 - rmsdNm / maxRef));
  return Math.pow(normalized, 1.25) * 100;
}

export function getPhaseCaptions(
  phase: MacroPhase,
  cycleProgress: number,
  rmsdNm: number
): { stageLabel: string; timescaleLabel: string } {
  switch (phase) {
    case 'fresh':
      return {
        stageLabel: 'Cohesive Solid Apple',
        timescaleLabel: 't = 0 s',
      };
    case 'decay':
      return {
        stageLabel: 'Enzymatic Decay & Slump',
        timescaleLabel: cycleProgress < 0.22 ? 't ≈ 3.4 yr' : 't ≈ 10² yr',
      };
    case 'equilibrium': {
      // Scale illustrative astronomical exponent smoothly across ergodic phase
      const exp = Math.min(54, Math.max(12, Math.round(14 + (cycleProgress - 0.3) * 95)));
      return {
        stageLabel: 'Ergodic Max-Entropy Gas',
        timescaleLabel: `10^(10^${exp}) yr`,
      };
    }
    case 'reversing':
      return {
        stageLabel: 'Loschmidt Recurrence Path',
        timescaleLabel: rmsdNm < 0.6 ? 't → T_rec' : '10^(10^52) yr',
      };
    case 'recombined':
      return {
        stageLabel: 'Poincaré Recurrence Achieved',
        timescaleLabel: 't = T_rec',
      };
  }
}
