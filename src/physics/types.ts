export type ParticleZone = 'skin' | 'flesh' | 'core' | 'stem' | 'leaf';

export const ZONE_ID: Record<ParticleZone, number> = {
  skin: 0,
  flesh: 1,
  core: 2,
  stem: 3,
  leaf: 4,
};

export const SPECIES_ID = {
  proton: 0,
  neutron: 1,
  electron: 2,
  photon: 3,
} as const;

export type ThermodynamicStage =
  | 'full_cycle'
  | 'solid'
  | 'decay'
  | 'dust'
  | 'gas'
  | 'reversal';

export type MacroPhase =
  | 'fresh'
  | 'decay'
  | 'dust'
  | 'equilibrium'
  | 'rearranging'
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
  stageCaption: string;
  isReversed: boolean;
  decayProgress: number; // 0..1 (organic rot & wrinkling)
  puddleProgress: number; // 0..1 (viscous organic puddle on floor)
  dustProgress: number; // 0..1 (dehydrated ash/dust mound on floor)
  solidShellAlpha: number; // 1 = intact glossy apple shell, 0 = fully dissociated particles
  history: HistoryPoint[];
}

export interface SampledApple {
  count: number;
  positions: Float64Array; // length count * 3
  zones: Uint8Array; // length count
  species: Uint8Array; // length count (proton, neutron, electron, photon)
  colors: Float32Array; // length count * 3 (sRGB 0..1)
  dustColors: Float32Array; // length count * 3 (sRGB 0..1 dried ash/organic dust)
  gasColors: Float32Array; // length count * 3 (sRGB 0..1 fundamental subatomic species)
  masses: Float64Array; // length count
  tissueResistance: Float32Array; // length count (skin & stem resist decay longer than flesh)
  nearestNeighborDist: number;
  particleRadius: number;
  appleCenterY: number;
  appleScale: number;
}
