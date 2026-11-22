export type ParticleZone = 'skin' | 'flesh' | 'core' | 'stem' | 'leaf';

export const ZONE_ID: Record<ParticleZone, number> = {
  skin: 0,
  flesh: 1,
  core: 2,
  stem: 3,
  leaf: 4,
};

export type ThermodynamicStage =
  | 'full_cycle'
  | 'solid'
  | 'decay'
  | 'gas'
  | 'reversal';

export type MacroPhase =
  | 'fresh'
  | 'decay'
  | 'equilibrium'
  | 'reversing'
  | 'recombined';

export type CameraPreset = 'isometric' | 'front' | 'top' | 'inside';

export type WallFace = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

export interface SimulationParams {
  particleCount: number;
  boxSize: number; // 6.0 nm characteristic sealed chamber width
  temperatureK: number; // 50 K .. 800 K (default 310 K)
  stage: ThermodynamicStage;
  timeScale: number;
}

export interface HistoryPoint {
  t: number;
  entropyPct: number; // 0..100%
  kineticEnergyKj: number; // kJ/mol
  rmsdNm: number; // nm
}

export interface TelemetrySnapshot {
  simTime: number;
  stepCount: number;
  particleCount: number;
  cycleProgress: number; // 0..1 (0%..100%)
  kineticEnergyKj: number;
  potentialEnergyKj: number;
  totalEnergyKj: number;
  energyDriftPct: number;
  temperatureK: number;
  shannonEntropy: number;
  maxEntropy: number;
  entropyPct: number; // 0..100%
  rmsdNm: number;
  recombinationPct: number; // 0..100%
  wallCollisions: number;
  phase: MacroPhase;
  stageLabel: string;
  timescaleLabel: string;
  isReversed: boolean;
  decayProgress: number; // 0..1
  solidShellAlpha: number; // 1 = intact glossy apple shell, 0 = fully dissociated particles
  history: HistoryPoint[];
}

export interface SampledApple {
  count: number;
  positions: Float64Array; // length count * 3
  zones: Uint8Array; // length count
  colors: Float32Array; // length count * 3 (sRGB 0..1)
  gasColors: Float32Array; // length count * 3 (sRGB 0..1 warm amber & ice-cyan gas species)
  masses: Float64Array; // length count
  tissueResistance: Float32Array; // length count (skin & stem resist decay longer than flesh)
  nearestNeighborDist: number;
  particleRadius: number;
  appleCenterY: number;
  appleScale: number;
}
