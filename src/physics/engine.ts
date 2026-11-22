import { generateAppleParticles } from './appleSampler';
import {
  computeRawKineticEnergy,
  computeRecombinationPct,
  computeRMSD,
  computeShannonEntropy,
  getPhaseCaptions,
  scaleKineticEnergyKj,
} from './metrics';
import {
  HistoryPoint,
  MacroPhase,
  SimulationParams,
  TelemetrySnapshot,
  ThermodynamicStage,
  WallFace,
} from './types';

interface PhaseKeyframe {
  positions: Float64Array;
  velocities: Float64Array;
  decayProgress: number;
  puddleProgress: number;
  dustProgress: number;
}

const FIXED_SUB_DT = 0.004;
const MAX_SUBSTEPS = 12;
const MAX_HISTORY = 120;
const FULL_CYCLE_DURATION_S = 68.0; // Unhurried slow observation of all 6 Apple-in-a-Box stages
const WALL_FACES: WallFace[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

/**
 * Symplectic Velocity Verlet + Elastic Hard-Sphere / Multi-Stage Decomposition Engine
 * modeling all 6 exact physical stages of the Apple-in-a-Box (Poincaré Recurrence) theory:
 *   1. Fresh Cohesive Apple resting on chamber floor
 *   2. Enzymatic Decay, Mold & Viscous Organic Puddle + volatile gas escape
 *   3. Dehydration & Powdery Dust Collapse
 *   4. Thermal Equilibrium (Subatomic Soup: protons, neutrons, electrons, photons, e = 1.0)
 *   5. Infinite Random Rearrangement & micro-fluctuations
 *   6. Spontaneous Poincaré Recurrence back into the exact fresh apple
 */
export class AppleBoxEngine {
  public params: SimulationParams;
  public count: number;
  public particleRadius: number;
  public appleCenterY: number;
  public appleScale: number;

  // Phase space typed arrays (64-bit precision for symplectic stability)
  public pos: Float64Array;
  public vel: Float64Array;
  public acc: Float64Array;
  public initPos: Float64Array;
  public mass: Float64Array;
  public zone: Uint8Array;
  public species: Uint8Array;
  public tissueResistance: Float32Array;
  public baseColor: Float32Array;
  public dustColor: Float32Array;
  public gasColor: Float32Array;

  // Spatial hash scratch buffers (O(N) elastic sphere collisions, zero GC)
  private hashHead: Int32Array;
  private hashNext: Int32Array;
  private hashRes = 12;

  // Thermodynamic & 6-stage state
  public simTime = 0;
  public stepCount = 0;
  public wallCollisions = 0;
  public cycleProgress = 0; // 0..1
  public isReversed = false;
  public decayProgress = 0; // 0 = fresh, 1 = fully decayed/oxidized
  public puddleProgress = 0; // 0 = dry, 1 = peak wet viscous puddle on floor
  public dustProgress = 0; // 0 = organic/wet, 1 = dehydrated dust/ash before sublimation
  public solidShellAlpha = 1; // 1 = crisp 3D apple mesh, 0 = fully dissociated particles
  private hasEverDispersed = false;

  // Energy & entropy baselines
  private baselineEntropy = 1.0;
  private lastPotentialEnergy = 0;
  private referenceRawEnergy = 0;
  private history: HistoryPoint[] = [];
  private historyTimer = 0;

  // Wall elastic bounce shimmer intensity [0..1]
  public wallImpacts: Record<WallFace, number> = {
    px: 0,
    nx: 0,
    py: 0,
    ny: 0,
    pz: 0,
    nz: 0,
  };

  // Phase-space checkpoints for exact Loschmidt echo convergence
  private keyframes: PhaseKeyframe[] = [];
  private keyframeTimer = 0;
  private reversalTargetIdx = -1;

  // Internal stage dynamic parameters
  private bondStiffness = 62.0;
  private activeGravity = 0.0;
  private gasBurstTriggered = false;
  private rngState = 7182818;

  constructor(initialParams?: Partial<SimulationParams>) {
    this.params = {
      particleCount: initialParams?.particleCount ?? 1100,
      boxSize: initialParams?.boxSize ?? 6.0,
      temperatureK: initialParams?.temperatureK ?? 310,
      stage: initialParams?.stage ?? 'full_cycle',
      timeScale: initialParams?.timeScale ?? 0.5,
    };

    this.count = this.params.particleCount;
    this.particleRadius = 0.025;
    this.appleCenterY = -1.78;
    this.appleScale = 1.29;

    this.pos = new Float64Array(0);
    this.vel = new Float64Array(0);
    this.acc = new Float64Array(0);
    this.initPos = new Float64Array(0);
    this.mass = new Float64Array(0);
    this.zone = new Uint8Array(0);
    this.species = new Uint8Array(0);
    this.tissueResistance = new Float32Array(0);
    this.baseColor = new Float32Array(0);
    this.dustColor = new Float32Array(0);
    this.gasColor = new Float32Array(0);
    this.hashHead = new Int32Array(this.hashRes * this.hashRes * this.hashRes);
    this.hashNext = new Int32Array(0);

    this.reset(this.params.particleCount);
  }

  private nextRandom(): number {
    let x = this.rngState | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x;
    return ((x >>> 0) % 1000000) / 1000000;
  }

  public reset(newParticleCount?: number): void {
    if (typeof newParticleCount === 'number') {
      this.params.particleCount = newParticleCount;
    }

    const sampled = generateAppleParticles(this.params.particleCount, this.params.boxSize, 2026);
    this.count = sampled.count;
    this.particleRadius = sampled.particleRadius;
    this.appleCenterY = sampled.appleCenterY;
    this.appleScale = sampled.appleScale;

    this.pos = new Float64Array(sampled.positions);
    this.initPos = new Float64Array(sampled.positions);
    this.vel = new Float64Array(this.count * 3);
    this.acc = new Float64Array(this.count * 3);
    this.mass = new Float64Array(sampled.masses);
    this.zone = new Uint8Array(sampled.zones);
    this.species = new Uint8Array(sampled.species);
    this.tissueResistance = new Float32Array(sampled.tissueResistance);
    this.baseColor = new Float32Array(sampled.colors);
    this.dustColor = new Float32Array(sampled.dustColors);
    this.gasColor = new Float32Array(sampled.gasColors);
    this.hashNext = new Int32Array(this.count);

    this.rngState = 7182818;
    this.simTime = 0;
    this.stepCount = 0;
    this.wallCollisions = 0;
    this.cycleProgress = 0;
    this.isReversed = false;
    this.decayProgress = 0;
    this.puddleProgress = 0;
    this.dustProgress = 0;
    this.solidShellAlpha = 1;
    this.hasEverDispersed = false;
    this.bondStiffness = 62.0;
    this.activeGravity = 0.0;
    this.gasBurstTriggered = false;
    this.keyframes = [];
    this.keyframeTimer = 0;
    this.reversalTargetIdx = -1;
    this.history = [];
    this.historyTimer = 0;

    for (const f of WALL_FACES) this.wallImpacts[f] = 0;

    const solidRms = 0.12 * Math.sqrt(this.params.temperatureK / 310);
    this.assignZeroMomentumVelocities(solidRms);

    const e0 = computeShannonEntropy(this.pos, this.count, this.params.boxSize);
    this.baselineEntropy = e0.entropy;

    this.lastPotentialEnergy = this.computeForces();
    this.rebaseReferenceEnergy();
    this.recordKeyframe();
    this.recordHistoryPoint();
  }

  public assignZeroMomentumVelocities(rmsSpeed: number): void {
    let px = 0;
    let py = 0;
    let pz = 0;
    let totalM = 0;

    for (let i = 0; i < this.count; i++) {
      const u1 = Math.max(1e-6, this.nextRandom());
      const u2 = this.nextRandom();
      const u3 = Math.max(1e-6, this.nextRandom());
      const u4 = this.nextRandom();
      const g1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const g2 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
      const g3 = Math.sqrt(-2 * Math.log(u3)) * Math.cos(2 * Math.PI * u4);

      const scale = rmsSpeed / Math.sqrt(3);
      const i3 = i * 3;
      this.vel[i3] = g1 * scale;
      this.vel[i3 + 1] = g2 * scale;
      this.vel[i3 + 2] = g3 * scale;

      const m = this.mass[i];
      px += m * this.vel[i3];
      py += m * this.vel[i3 + 1];
      pz += m * this.vel[i3 + 2];
      totalM += m;
    }

    if (totalM > 0) {
      const invM = 1 / totalM;
      for (let i = 0; i < this.count; i++) {
        const i3 = i * 3;
        this.vel[i3] -= px * invM;
        this.vel[i3 + 1] -= py * invM;
        this.vel[i3 + 2] -= pz * invM;
      }
    }
  }

  private rescaleVelocityRms(targetRms: number): void {
    let sumV2 = 0;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      sumV2 +=
        this.vel[i3] * this.vel[i3] +
        this.vel[i3 + 1] * this.vel[i3 + 1] +
        this.vel[i3 + 2] * this.vel[i3 + 2];
    }
    const curRms = Math.sqrt(sumV2 / Math.max(1, this.count));
    if (curRms < 1e-5) {
      this.assignZeroMomentumVelocities(targetRms);
      return;
    }
    const ratio = targetRms / curRms;
    for (let i = 0; i < this.count * 3; i++) {
      this.vel[i] *= ratio;
    }
  }

  private targetGasRmsSpeed(): number {
    return 5.4 * Math.sqrt(Math.max(50, this.params.temperatureK) / 310);
  }

  public setTemperatureK(tempK: number): void {
    const clamped = Math.max(50, Math.min(800, tempK));
    const prevTemp = this.params.temperatureK;
    this.params.temperatureK = clamped;
    if (prevTemp > 0) {
      const speedScale = Math.sqrt(clamped / prevTemp);
      for (let i = 0; i < this.count * 3; i++) {
        this.vel[i] *= speedScale;
      }
      this.rebaseReferenceEnergy();
    }
  }

  public setStage(stage: ThermodynamicStage): void {
    this.params.stage = stage;
    if (stage === 'solid') {
      this.reset(this.params.particleCount);
      this.params.stage = 'solid';
      this.cycleProgress = 0;
    } else if (stage === 'decay') {
      // Stage 2: Mold, Enzymatic Rot & Viscous Organic Puddle forming on chamber floor
      this.reset(this.params.particleCount);
      this.params.stage = 'decay';
      this.seekCycleProgress(0.18);
    } else if (stage === 'dust') {
      // Stage 3: Dehydration & Powdery Dust Mound crumbling on floor + rising vapor
      this.reset(this.params.particleCount);
      this.params.stage = 'dust';
      this.seekCycleProgress(0.32);
    } else if (stage === 'gas') {
      this.isReversed = false;
      this.cycleProgress = 0.52;
      this.puddleProgress = 0;
      this.dustProgress = 0;
      this.triggerErgodicGasBurst();
    } else if (stage === 'reversal') {
      this.params.stage = 'reversal';
      const rmsd = computeRMSD(this.pos, this.initPos, this.count);
      if (rmsd < 0.8) {
        this.scatterToErgodicGasImmediate();
      }
      if (!this.isReversed) {
        this.reverseVelocities();
      }
    } else if (stage === 'full_cycle') {
      this.reset(this.params.particleCount);
      this.params.stage = 'full_cycle';
    }
  }

  /**
   * Immediately scrubs the closed system across all 6 stages of the Apple-in-a-Box theory:
   * - 0%..9%:   1. Fresh Cohesive Apple resting on chamber floor
   * - 9%..26%:  2. Decay, Mold & Viscous Puddle collapsing onto floor + volatile gas
   * - 26%..38%: 3. Dehydration & Powdery Dust Mound + sublimating particles
   * - 38%..58%: 4. Thermal Equilibrium (Fundamental Subatomic Soup: protons, neutrons, electrons, photons)
   * - 58%..76%: 5. Infinite Random Rearrangement across cosmic eons
   * - 76%..96%: 6. Spontaneous Poincaré Recombination
   * - 96%..100%: Poincaré Recurrence Achieved (Exact Fresh Apple Reformed)
   */
  public seekCycleProgress(progress01: number): void {
    const p = Math.max(0, Math.min(1, progress01));
    this.cycleProgress = p;
    const halfBound = this.params.boxSize * 0.5 - this.particleRadius;
    const floorY = -halfBound;

    if (p <= 0.05) {
      this.pos.set(this.initPos);
      this.bondStiffness = 62.0;
      this.activeGravity = 0;
      this.decayProgress = 0;
      this.puddleProgress = 0;
      this.dustProgress = 0;
      this.solidShellAlpha = 1;
      this.isReversed = false;
      this.gasBurstTriggered = false;
      this.hasEverDispersed = false;
      this.assignZeroMomentumVelocities(0.12 * Math.sqrt(this.params.temperatureK / 310));
    } else if (p >= 0.96) {
      this.pos.set(this.initPos);
      this.bondStiffness = 62.0;
      this.activeGravity = 0;
      this.decayProgress = 0;
      this.puddleProgress = 0;
      this.dustProgress = 0;
      this.solidShellAlpha = 1;
      this.isReversed = false;
      this.hasEverDispersed = true;
      this.assignZeroMomentumVelocities(0.12 * Math.sqrt(this.params.temperatureK / 310));
    } else if (p < 0.26) {
      // Stage 2: Decay, Mold & Viscous Puddle + rising volatile gas wisps
      const d = (p - 0.05) / 0.21; // 0..1
      this.bondStiffness = Math.max(1.2, (1 - d) * 16.0);
      this.activeGravity = 3.8;
      this.decayProgress = Math.min(1, 0.15 + d * 0.85);
      this.puddleProgress = Math.min(1, d * 1.15);
      this.dustProgress = 0;
      this.solidShellAlpha = Math.max(0.28, 1 - d * 0.65);
      this.isReversed = false;
      this.gasBurstTriggered = false;
      this.hasEverDispersed = false;

      for (let i = 0; i < this.count; i++) {
        const i3 = i * 3;
        const isVolatile = i % 5 === 0; // ~20% escape upward as decomposition gases (CO2, CH4)
        const h1 = Math.sin(i * 19.13) * 0.5;
        const h2 = Math.cos(i * 31.71) * 0.5;
        if (isVolatile && d > 0.18) {
          const rise = (d - 0.18) / 0.82;
          const x = this.initPos[i3] * (1 + rise * 1.6) + h1 * rise * 2.2;
          const y = Math.min(halfBound * 0.9, this.initPos[i3 + 1] + rise * 3.8 + Math.abs(h2) * rise);
          const z = this.initPos[i3 + 2] * (1 + rise * 1.6) + h2 * rise * 2.2;
          this.pos[i3] = Math.max(-halfBound, Math.min(halfBound, x));
          this.pos[i3 + 1] = Math.max(floorY + 0.04, Math.min(halfBound, y));
          this.pos[i3 + 2] = Math.max(-halfBound, Math.min(halfBound, z));
        } else {
          // Organic mass slumping into a flattened puddle on the floor
          const spread = 1 + d * 0.58;
          const slumpedY = floorY + 0.05 + (this.initPos[i3 + 1] - floorY) * (1 - d * 0.65);
          this.pos[i3] = Math.max(-halfBound, Math.min(halfBound, this.initPos[i3] * spread + h1 * d * 0.4));
          this.pos[i3 + 1] = Math.max(floorY + 0.04, Math.min(halfBound, slumpedY));
          this.pos[i3 + 2] = Math.max(-halfBound, Math.min(halfBound, this.initPos[i3 + 2] * spread + h2 * d * 0.4));
        }
      }
      this.assignZeroMomentumVelocities((0.4 + d * 1.1) * Math.sqrt(this.params.temperatureK / 310));
    } else if (p < 0.38) {
      // Stage 3: Dehydration & Powdery Dust Mound + sublimating cloud
      const d = (p - 0.26) / 0.12; // 0..1
      this.bondStiffness = 0.0;
      this.activeGravity = 1.6 * (1 - d);
      this.decayProgress = 1.0;
      this.puddleProgress = Math.max(0, 1 - d * 1.25); // Wet puddle dries up!
      this.dustProgress = Math.min(1, 0.35 + d * 0.65);
      this.solidShellAlpha = Math.max(0, 0.28 * (1 - d * 1.6));
      this.isReversed = false;
      this.gasBurstTriggered = false;
      this.hasEverDispersed = d > 0.5;

      for (let i = 0; i < this.count; i++) {
        const i3 = i * 3;
        const h1 = Math.sin(i * 19.13);
        const h2 = Math.cos(i * 31.71);
        const h3 = Math.sin(i * 53.97) * 0.5 + 0.5;
        const lifting = h3 < 0.25 + d * 0.55;
        if (lifting) {
          // Fine dust grains & dissociated atoms lifting into the chamber volume
          const lift = Math.min(1, (d + h3 * 0.4));
          const x = h1 * halfBound * (0.45 + lift * 0.48);
          const y = floorY + 0.08 + lift * (this.params.boxSize * 0.78) * h3;
          const z = h2 * halfBound * (0.45 + lift * 0.48);
          this.pos[i3] = Math.max(-halfBound, Math.min(halfBound, x));
          this.pos[i3 + 1] = Math.max(floorY + 0.04, Math.min(halfBound, y));
          this.pos[i3 + 2] = Math.max(-halfBound, Math.min(halfBound, z));
        } else {
          // Flattened powdery organic dust mound on chamber floor
          const rSpread = 0.4 + Math.sqrt(h3) * 1.85;
          const ang = i * 2.39996;
          const moundH = Math.max(0.03, (1 - rSpread / 2.3) * 0.42 * (1 - d * 0.55));
          this.pos[i3] = Math.cos(ang) * rSpread;
          this.pos[i3 + 1] = floorY + 0.03 + moundH * (Math.abs(h1) * 0.7 + 0.3);
          this.pos[i3 + 2] = Math.sin(ang) * rSpread;
        }
      }
      this.assignZeroMomentumVelocities((1.2 + d * 2.4) * Math.sqrt(this.params.temperatureK / 310));
    } else if (p <= 0.76) {
      // Stages 4 & 5: Subatomic Soup (Thermal Equilibrium) & Infinite Random Rearrangement
      this.scatterToErgodicGasImmediate();
      this.cycleProgress = p;
    } else {
      // Stage 6: Spontaneous Poincaré Recombination (0.76 -> 0.96)
      const r = (p - 0.76) / 0.2; // 0 (soup) -> 1 (fresh apple)
      const smooth = r * r * (3 - 2 * r);
      this.bondStiffness = 0;
      this.activeGravity = 0;
      this.decayProgress = Math.max(0, 1 - smooth * 1.15);
      this.puddleProgress = r > 0.5 && r < 0.85 ? Math.sin(((r - 0.5) / 0.35) * Math.PI) * 0.4 : 0;
      this.dustProgress = r > 0.2 && r < 0.65 ? Math.sin(((r - 0.2) / 0.45) * Math.PI) * 0.5 : 0;
      this.solidShellAlpha = Math.max(0, (r - 0.72) / 0.28);
      this.isReversed = true;
      this.hasEverDispersed = true;
      for (let i = 0; i < this.count; i++) {
        const i3 = i * 3;
        const gx = Math.sin(i * 12.9898 + 1.1) * halfBound * 0.92;
        const gy = Math.sin(i * 78.233 + 2.3) * halfBound * 0.92;
        const gz = Math.sin(i * 37.719 + 4.7) * halfBound * 0.92;
        this.pos[i3] = gx + (this.initPos[i3] - gx) * smooth;
        this.pos[i3 + 1] = gy + (this.initPos[i3 + 1] - gy) * smooth;
        this.pos[i3 + 2] = gz + (this.initPos[i3 + 2] - gz) * smooth;
        this.vel[i3] = (this.initPos[i3] - this.pos[i3]) * 2.5;
        this.vel[i3 + 1] = (this.initPos[i3 + 1] - this.pos[i3 + 1]) * 2.5;
        this.vel[i3 + 2] = (this.initPos[i3 + 2] - this.pos[i3 + 2]) * 2.5;
      }
    }

    this.lastPotentialEnergy = this.computeForces();
    this.rebaseReferenceEnergy();
    this.recordHistoryPoint();
  }

  private scatterToErgodicGasImmediate(): void {
    const halfBound = this.params.boxSize * 0.5 - this.particleRadius;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      this.pos[i3] = (this.nextRandom() * 2 - 1) * halfBound * 0.94;
      this.pos[i3 + 1] = (this.nextRandom() * 2 - 1) * halfBound * 0.94;
      this.pos[i3 + 2] = (this.nextRandom() * 2 - 1) * halfBound * 0.94;
    }
    this.bondStiffness = 0;
    this.activeGravity = 0;
    this.decayProgress = 1.0;
    this.puddleProgress = 0.0;
    this.dustProgress = 0.0;
    this.solidShellAlpha = 0.0;
    this.isReversed = false;
    this.gasBurstTriggered = true;
    this.hasEverDispersed = true;
    this.assignZeroMomentumVelocities(this.targetGasRmsSpeed());
    this.lastPotentialEnergy = this.computeForces();
    this.rebaseReferenceEnergy();
  }

  public triggerErgodicGasBurst(): void {
    this.isReversed = false;
    this.bondStiffness = 0;
    this.activeGravity = 0;
    this.decayProgress = 1.0;
    this.puddleProgress = 0.0;
    this.dustProgress = 0.0;
    this.solidShellAlpha = 0.0;
    this.gasBurstTriggered = true;
    this.hasEverDispersed = true;

    const targetRms = this.targetGasRmsSpeed();
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const dx = this.pos[i3];
      const dy = this.pos[i3 + 1] - this.appleCenterY;
      const dz = this.pos[i3 + 2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-4;
      const u1 = Math.max(1e-6, this.nextRandom());
      const u2 = this.nextRandom();
      const u3 = Math.max(1e-6, this.nextRandom());
      const u4 = this.nextRandom();
      const gx = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const gy = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
      const gz = Math.sqrt(-2 * Math.log(u3)) * Math.cos(2 * Math.PI * u4);

      this.vel[i3] += (dx / r) * targetRms * 0.42 + gx * targetRms * 0.65;
      this.vel[i3 + 1] += Math.abs(dy / r) * targetRms * 0.55 + gy * targetRms * 0.65;
      this.vel[i3 + 2] += (dz / r) * targetRms * 0.42 + gz * targetRms * 0.65;
    }
    this.rescaleVelocityRms(targetRms);
    this.lastPotentialEnergy = this.computeForces();
    this.rebaseReferenceEnergy();
    this.recordKeyframe();
  }

  public reverseVelocities(): void {
    this.isReversed = !this.isReversed;
    for (let i = 0; i < this.count * 3; i++) {
      this.vel[i] = -this.vel[i];
    }
    if (this.isReversed) {
      this.bondStiffness = 0;
      this.activeGravity = 0;
      this.reversalTargetIdx = Math.max(0, this.keyframes.length - 1);
      if (this.cycleProgress < 0.76) {
        this.cycleProgress = 0.77;
      }
    } else {
      this.reversalTargetIdx = -1;
    }
    this.rebaseReferenceEnergy();
  }

  public rebaseReferenceEnergy(): void {
    const rawK = computeRawKineticEnergy(this.vel, this.mass, this.count);
    this.referenceRawEnergy = rawK + this.lastPotentialEnergy;
  }

  public advance(frameDt: number): void {
    const clampedDt = Math.min(0.05, Math.max(0, frameDt));
    const scaledDt = clampedDt * this.params.timeScale;

    const wallDecay = Math.exp(-clampedDt * 8.0);
    for (const f of WALL_FACES) {
      this.wallImpacts[f] *= wallDecay;
      if (this.wallImpacts[f] < 0.005) this.wallImpacts[f] = 0;
    }

    if (this.params.stage === 'full_cycle') {
      this.updateFullCycle(scaledDt);
    } else if (this.params.stage === 'decay') {
      this.decayProgress = Math.min(0.98, this.decayProgress + scaledDt * 0.08);
      this.puddleProgress = Math.min(1.0, this.puddleProgress + scaledDt * 0.12);
      this.bondStiffness = Math.max(0.35, this.bondStiffness * Math.exp(-scaledDt * 0.35));
      this.activeGravity = 3.6;
    } else if (this.params.stage === 'dust') {
      this.dustProgress = Math.min(1.0, this.dustProgress + scaledDt * 0.08);
      this.puddleProgress = Math.max(0, this.puddleProgress - scaledDt * 0.25);
      this.bondStiffness = 0.0;
      this.activeGravity = 0.6;
    }

    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.round(scaledDt / FIXED_SUB_DT)));
    const dt = scaledDt / steps;

    for (let s = 0; s < steps; s++) {
      this.verletStep(dt);
    }

    // Smoothly morph solid 3D apple shell opacity according to stage & RMSD
    const rmsd = computeRMSD(this.pos, this.initPos, this.count);
    let targetShell = 0;
    if (this.isReversed) {
      targetShell = rmsd < 0.42 ? Math.max(0, Math.min(1, 1 - rmsd / 0.42)) : 0;
    } else if (this.gasBurstTriggered || this.dustProgress > 0.7) {
      targetShell = 0;
    } else if (this.decayProgress > 0.04) {
      // Keep the real rotting/wrinkling/slumping 3D apple visible throughout Decay & Puddle stage!
      targetShell = Math.max(0.18, 1 - this.decayProgress * 0.72) * (1 - this.dustProgress);
    } else {
      targetShell = rmsd < 0.06 ? 1.0 : rmsd < 0.28 ? Math.max(0, 1 - (rmsd - 0.06) / 0.22) : 0;
    }
    this.solidShellAlpha += (targetShell - this.solidShellAlpha) * Math.min(1, clampedDt * 6.0);

    this.historyTimer += clampedDt;
    if (this.historyTimer >= 0.14) {
      this.historyTimer = 0;
      this.recordHistoryPoint();
    }
  }

  private updateFullCycle(dt: number): void {
    if (this.cycleProgress >= 1.0) {
      return;
    }

    const prev = this.cycleProgress;
    this.cycleProgress = Math.min(1.0, this.cycleProgress + dt / FULL_CYCLE_DURATION_S);
    const p = this.cycleProgress;

    if (p < 0.09) {
      // Stage 1: Fresh Cohesive Apple resting on floor
      this.bondStiffness = 62.0;
      this.activeGravity = 0;
      this.decayProgress = 0;
      this.puddleProgress = 0;
      this.dustProgress = 0;
    } else if (p < 0.26) {
      // Stage 2: Decay, Mold & Viscous Organic Puddle + rising decomposition vapor
      const d = (p - 0.09) / 0.17;
      this.bondStiffness = Math.max(0.6, Math.pow(1 - d, 1.8) * 18.0);
      this.activeGravity = 3.8;
      this.decayProgress = Math.min(1.0, d * 1.15);
      this.puddleProgress = Math.min(1.0, Math.pow(d, 0.85));
      this.dustProgress = 0;
      if (prev < 0.09) {
        this.rescaleVelocityRms(0.75 * Math.sqrt(this.params.temperatureK / 310));
        this.rebaseReferenceEnergy();
      }
    } else if (p < 0.38) {
      // Stage 3: Dehydration & Powdery Dust Collapse
      const d = (p - 0.26) / 0.12;
      this.bondStiffness = 0.0;
      this.activeGravity = 2.4 * (1 - d * 0.85);
      this.decayProgress = 1.0;
      this.puddleProgress = Math.max(0, 1 - d * 1.25);
      this.dustProgress = Math.min(1.0, Math.sin(Math.min(1, d) * Math.PI * 0.85) + d * 0.35);
      if (prev < 0.26) {
        // Gentle thermal lift as moisture dries & dust grains begin escaping
        this.rescaleVelocityRms(1.85 * Math.sqrt(this.params.temperatureK / 310));
        this.rebaseReferenceEnergy();
      }
    } else if (p < 0.76) {
      // Stages 4 & 5: Thermal Equilibrium (Subatomic Soup) -> Infinite Random Rearrangement
      this.puddleProgress = 0;
      this.dustProgress = 0;
      if (!this.gasBurstTriggered) {
        this.triggerErgodicGasBurst();
      }
    } else if (p < 0.96) {
      // Stage 6: Spontaneous Poincaré Recurrence (Loschmidt Echo)
      if (!this.isReversed) {
        this.reverseVelocities();
      }
    } else {
      // Poincaré Recurrence Achieved!
      this.isReversed = false;
      this.decayProgress = 0;
      this.puddleProgress = 0;
      this.dustProgress = 0;
      this.bondStiffness = 62.0;
      this.activeGravity = 0;
      this.pos.set(this.initPos);
      this.assignZeroMomentumVelocities(0.12 * Math.sqrt(this.params.temperatureK / 310));
      this.lastPotentialEnergy = this.computeForces();
      this.rebaseReferenceEnergy();
    }
  }

  public verletStep(dt: number): void {
    const n = this.count;
    const pos = this.pos;
    const vel = this.vel;
    const acc = this.acc;
    const halfDt = 0.5 * dt;
    const halfBound = this.params.boxSize * 0.5 - this.particleRadius;

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const vx = vel[i3] + acc[i3] * halfDt;
      const vy = vel[i3 + 1] + acc[i3 + 1] * halfDt;
      const vz = vel[i3 + 2] + acc[i3 + 2] * halfDt;

      vel[i3] = vx;
      vel[i3 + 1] = vy;
      vel[i3 + 2] = vz;

      let nx = pos[i3] + vx * dt;
      let ny = pos[i3 + 1] + vy * dt;
      let nz = pos[i3 + 2] + vz * dt;

      // Zero-damping perfectly elastic specular wall reflections (e = 1.0)
      if (nx > halfBound) {
        nx = 2 * halfBound - nx;
        vel[i3] = -Math.abs(vel[i3]);
        this.wallCollisions++;
        this.wallImpacts.px = Math.min(1, this.wallImpacts.px + 0.16);
      } else if (nx < -halfBound) {
        nx = -2 * halfBound - nx;
        vel[i3] = Math.abs(vel[i3]);
        this.wallCollisions++;
        this.wallImpacts.nx = Math.min(1, this.wallImpacts.nx + 0.16);
      }

      if (ny > halfBound) {
        ny = 2 * halfBound - ny;
        vel[i3 + 1] = -Math.abs(vel[i3 + 1]);
        this.wallCollisions++;
        this.wallImpacts.py = Math.min(1, this.wallImpacts.py + 0.16);
      } else if (ny < -halfBound) {
        ny = -2 * halfBound - ny;
        vel[i3 + 1] = Math.abs(vel[i3 + 1]);
        this.wallCollisions++;
        this.wallImpacts.ny = Math.min(1, this.wallImpacts.ny + 0.16);
      }

      if (nz > halfBound) {
        nz = 2 * halfBound - nz;
        vel[i3 + 2] = -Math.abs(vel[i3 + 2]);
        this.wallCollisions++;
        this.wallImpacts.pz = Math.min(1, this.wallImpacts.pz + 0.16);
      } else if (nz < -halfBound) {
        nz = -2 * halfBound - nz;
        vel[i3 + 2] = Math.abs(vel[i3 + 2]);
        this.wallCollisions++;
        this.wallImpacts.nz = Math.min(1, this.wallImpacts.nz + 0.16);
      }

      pos[i3] = Math.max(-halfBound, Math.min(halfBound, nx));
      pos[i3 + 1] = Math.max(-halfBound, Math.min(halfBound, ny));
      pos[i3 + 2] = Math.max(-halfBound, Math.min(halfBound, nz));
    }

    if (!this.isReversed && this.bondStiffness < 12.0) {
      this.resolveElasticSphereCollisions();
    }

    this.lastPotentialEnergy = this.computeForces();

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      vel[i3] += acc[i3] * halfDt;
      vel[i3 + 1] += acc[i3 + 1] * halfDt;
      vel[i3 + 2] += acc[i3 + 2] * halfDt;
    }

    if (this.isReversed) {
      this.applyTimeReversalGuidance(dt);
    } else {
      this.keyframeTimer += dt;
      if (this.keyframeTimer >= 0.16) {
        this.keyframeTimer = 0;
        this.recordKeyframe();
      }
    }

    this.simTime += this.isReversed ? -dt : dt;
    if (this.simTime < 0) this.simTime = 0;
    this.stepCount++;

    if (!this.hasEverDispersed && this.stepCount % 16 === 0) {
      if (computeRMSD(this.pos, this.initPos, this.count) > 0.9) {
        this.hasEverDispersed = true;
      }
    }
  }

  private resolveElasticSphereCollisions(): void {
    const n = this.count;
    const pos = this.pos;
    const vel = this.vel;
    const mass = this.mass;
    const boxSize = this.params.boxSize;
    const half = boxSize * 0.5;
    const minDist = this.particleRadius * 2.0;
    const minDistSq = minDist * minDist;

    const gridRes = this.hashRes;
    this.hashHead.fill(-1);
    const invCell = gridRes / boxSize;

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const cx = Math.min(gridRes - 1, Math.max(0, Math.floor((pos[i3] + half) * invCell)));
      const cy = Math.min(gridRes - 1, Math.max(0, Math.floor((pos[i3 + 1] + half) * invCell)));
      const cz = Math.min(gridRes - 1, Math.max(0, Math.floor((pos[i3 + 2] + half) * invCell)));
      const cell = (cx * gridRes + cy) * gridRes + cz;
      this.hashNext[i] = this.hashHead[cell];
      this.hashHead[cell] = i;
    }

    for (let cx = 0; cx < gridRes; cx++) {
      const xMin = Math.max(0, cx - 1);
      const xMax = Math.min(gridRes - 1, cx + 1);
      for (let cy = 0; cy < gridRes; cy++) {
        const yMin = Math.max(0, cy - 1);
        const yMax = Math.min(gridRes - 1, cy + 1);
        for (let cz = 0; cz < gridRes; cz++) {
          const zMin = Math.max(0, cz - 1);
          const zMax = Math.min(gridRes - 1, cz + 1);
          const baseCell = (cx * gridRes + cy) * gridRes + cz;

          for (let i = this.hashHead[baseCell]; i !== -1; i = this.hashNext[i]) {
            const i3 = i * 3;
            for (let nx = xMin; nx <= xMax; nx++) {
              for (let ny = yMin; ny <= yMax; ny++) {
                for (let nz = zMin; nz <= zMax; nz++) {
                  const nCell = (nx * gridRes + ny) * gridRes + nz;
                  for (let j = this.hashHead[nCell]; j !== -1; j = this.hashNext[j]) {
                    if (j <= i) continue;
                    const j3 = j * 3;
                    const dx = pos[i3] - pos[j3];
                    const dy = pos[i3 + 1] - pos[j3 + 1];
                    const dz = pos[i3 + 2] - pos[j3 + 2];
                    const d2 = dx * dx + dy * dy + dz * dz;

                    if (d2 < minDistSq && d2 > 1e-10) {
                      const d = Math.sqrt(d2);
                      const invD = 1 / d;
                      const nX = dx * invD;
                      const nY = dy * invD;
                      const nZ = dz * invD;

                      const overlap = (minDist - d) * 0.5;
                      pos[i3] += nX * overlap;
                      pos[i3 + 1] += nY * overlap;
                      pos[i3 + 2] += nZ * overlap;
                      pos[j3] -= nX * overlap;
                      pos[j3 + 1] -= nY * overlap;
                      pos[j3 + 2] -= nZ * overlap;

                      const rvx = vel[i3] - vel[j3];
                      const rvy = vel[i3 + 1] - vel[j3 + 1];
                      const rvz = vel[i3 + 2] - vel[j3 + 2];
                      const vn = rvx * nX + rvy * nY + rvz * nZ;

                      if (vn < 0) {
                        const mi = mass[i];
                        const mj = mass[j];
                        const invSum = 2 / (mi + mj);
                        const ji = mj * invSum * vn;
                        const jj = mi * invSum * vn;

                        vel[i3] -= ji * nX;
                        vel[i3 + 1] -= ji * nY;
                        vel[i3 + 2] -= ji * nZ;
                        vel[j3] += jj * nX;
                        vel[j3 + 1] += jj * nY;
                        vel[j3 + 2] += jj * nZ;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  private computeForces(): number {
    const n = this.count;
    const pos = this.pos;
    const acc = this.acc;
    const mass = this.mass;
    const g = this.activeGravity;
    const kBase = this.bondStiffness;
    const half = this.params.boxSize * 0.5;

    let potential = 0;

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      let ax = 0;
      let ay = -g;
      let az = 0;

      if (g !== 0) {
        potential += mass[i] * g * (pos[i3 + 1] + half);
      }

      if (kBase > 0.01) {
        const k = kBase * (0.45 + this.tissueResistance[i] * 0.75);
        const dx = this.initPos[i3] - pos[i3];
        const dy = this.initPos[i3 + 1] - pos[i3 + 1];
        const dz = this.initPos[i3 + 2] - pos[i3 + 2];
        const invM = 1 / mass[i];
        ax += k * dx * invM;
        ay += k * dy * invM;
        az += k * dz * invM;
        potential += 0.5 * k * (dx * dx + dy * dy + dz * dz);
      }

      acc[i3] = ax;
      acc[i3 + 1] = ay;
      acc[i3 + 2] = az;
    }

    return potential;
  }

  private applyTimeReversalGuidance(dt: number): void {
    const n = this.count;
    const pos = this.pos;
    const vel = this.vel;

    let targetPos = this.initPos;
    let targetDecay = 0;
    let targetPuddle = 0;
    let targetDust = 0;

    if (this.reversalTargetIdx > 0 && this.keyframes.length > 0) {
      const kf = this.keyframes[this.reversalTargetIdx];
      targetPos = kf.positions;
      targetDecay = kf.decayProgress;
      targetPuddle = kf.puddleProgress;
      targetDust = kf.dustProgress;
      if (computeRMSD(pos, kf.positions, n) < 0.65) {
        this.reversalTargetIdx = Math.max(0, this.reversalTargetIdx - 1);
      }
    }

    this.decayProgress += (targetDecay - this.decayProgress) * Math.min(1, dt * 4.2);
    this.puddleProgress += (targetPuddle - this.puddleProgress) * Math.min(1, dt * 4.2);
    this.dustProgress += (targetDust - this.dustProgress) * Math.min(1, dt * 4.2);

    const rmsdToOrigin = computeRMSD(pos, this.initPos, n);
    const stiffness = this.reversalTargetIdx <= 1 ? 18.0 : 12.5;
    const damping = this.reversalTargetIdx <= 1 ? 6.2 : 3.8;

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      vel[i3] += ((targetPos[i3] - pos[i3]) * stiffness - vel[i3] * damping) * dt;
      vel[i3 + 1] += ((targetPos[i3 + 1] - pos[i3 + 1]) * stiffness - vel[i3 + 1] * damping) * dt;
      vel[i3 + 2] += ((targetPos[i3 + 2] - pos[i3 + 2]) * stiffness - vel[i3 + 2] * damping) * dt;
    }

    if (this.params.stage === 'reversal') {
      const conv = Math.max(0, Math.min(1, 1 - rmsdToOrigin / (this.params.boxSize * 0.56)));
      this.cycleProgress = Math.max(this.cycleProgress, 0.76 + conv * 0.24);
    }

    if (this.reversalTargetIdx <= 1 && rmsdToOrigin < 0.05) {
      this.isReversed = false;
      this.decayProgress = 0;
      this.puddleProgress = 0;
      this.dustProgress = 0;
      this.bondStiffness = 62.0;
      this.activeGravity = 0;
      this.cycleProgress = 1.0;
      this.pos.set(this.initPos);
      this.assignZeroMomentumVelocities(0.12 * Math.sqrt(this.params.temperatureK / 310));
      this.lastPotentialEnergy = this.computeForces();
      this.rebaseReferenceEnergy();
    }
  }

  private recordKeyframe(): void {
    if (this.keyframes.length >= 160) {
      const compacted: PhaseKeyframe[] = [this.keyframes[0]];
      for (let i = 1; i < this.keyframes.length; i += 2) {
        compacted.push(this.keyframes[i]);
      }
      this.keyframes = compacted;
    }
    this.keyframes.push({
      positions: new Float64Array(this.pos),
      velocities: new Float64Array(this.vel),
      decayProgress: this.decayProgress,
      puddleProgress: this.puddleProgress,
      dustProgress: this.dustProgress,
    });
  }

  private recordHistoryPoint(): void {
    const entropy = computeShannonEntropy(
      this.pos,
      this.count,
      this.params.boxSize,
      this.baselineEntropy
    );
    const rawK = computeRawKineticEnergy(this.vel, this.mass, this.count);
    const kineticEnergyKj = scaleKineticEnergyKj(rawK, this.count, this.params.temperatureK);
    const rmsdNm = computeRMSD(this.pos, this.initPos, this.count);

    this.history.push({
      t: this.simTime,
      entropyPct: entropy.pct,
      kineticEnergyKj,
      rmsdNm,
    });
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
  }

  public getTelemetry(): TelemetrySnapshot {
    const rawK = computeRawKineticEnergy(this.vel, this.mass, this.count);
    const rawTotal = rawK + this.lastPotentialEnergy;
    const denom = Math.max(1e-3, Math.abs(this.referenceRawEnergy));
    const energyDriftPct = ((rawTotal - this.referenceRawEnergy) / denom) * 100;

    const kineticEnergyKj = scaleKineticEnergyKj(rawK, this.count, this.params.temperatureK);
    const potentialEnergyKj = (this.lastPotentialEnergy / Math.max(1, this.count)) * 0.42;
    const totalEnergyKj = kineticEnergyKj + potentialEnergyKj;

    const entropy = computeShannonEntropy(
      this.pos,
      this.count,
      this.params.boxSize,
      this.baselineEntropy
    );
    const rmsdNm = computeRMSD(this.pos, this.initPos, this.count);
    const recombinationPct = computeRecombinationPct(rmsdNm, this.params.boxSize);

    let phase: MacroPhase = 'fresh';
    if (this.isReversed && rmsdNm > 0.14) {
      phase = 'reversing';
    } else if (rmsdNm <= 0.14 && (this.hasEverDispersed || this.cycleProgress >= 0.95)) {
      phase = 'recombined';
    } else if (rmsdNm <= 0.2 && this.decayProgress < 0.12) {
      phase = 'fresh';
    } else if (this.gasBurstTriggered || entropy.pct >= 84) {
      phase = this.cycleProgress >= 0.58 && this.cycleProgress < 0.76 ? 'rearranging' : 'equilibrium';
    } else if (this.dustProgress > 0.25) {
      phase = 'dust';
    } else {
      phase = 'decay';
    }

    const { stageLabel, timescaleLabel, stageCaption } = getPhaseCaptions(
      phase,
      this.cycleProgress,
      rmsdNm
    );

    return {
      simTime: this.simTime,
      stepCount: this.stepCount,
      particleCount: this.count,
      cycleProgress: this.cycleProgress,
      kineticEnergyKj,
      potentialEnergyKj,
      totalEnergyKj,
      energyDriftPct,
      temperatureK: this.params.temperatureK,
      shannonEntropy: entropy.entropy,
      maxEntropy: entropy.maxEntropy,
      entropyPct: entropy.pct,
      rmsdNm,
      recombinationPct,
      wallCollisions: this.wallCollisions,
      phase,
      stageLabel,
      timescaleLabel,
      stageCaption,
      isReversed: this.isReversed,
      decayProgress: this.decayProgress,
      puddleProgress: this.puddleProgress,
      dustProgress: this.dustProgress,
      solidShellAlpha: this.solidShellAlpha,
      history: this.history.slice(),
    };
  }
}
