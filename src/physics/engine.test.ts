import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAppleParticles } from './appleSampler';
import { AppleBoxEngine } from './engine';
import { computeRawKineticEnergy, computeRMSD } from './metrics';
import { ZONE_ID } from './types';

test('generateAppleParticles constructs volumetric multi-tissue apple strictly inside chamber', () => {
  const boxSize = 6.0;
  const sampled = generateAppleParticles(480, boxSize);

  assert.ok(sampled.count >= 450 && sampled.count <= 480);
  const zoneCounts = new Map<number, number>();
  const half = boxSize * 0.5;

  for (let i = 0; i < sampled.count; i++) {
    const x = sampled.positions[i * 3];
    const y = sampled.positions[i * 3 + 1];
    const z = sampled.positions[i * 3 + 2];
    assert.ok(Math.abs(x) < half, `x=${x} out of bounds`);
    assert.ok(Math.abs(y) < half, `y=${y} out of bounds`);
    assert.ok(Math.abs(z) < half, `z=${z} out of bounds`);
    const zId = sampled.zones[i];
    zoneCounts.set(zId, (zoneCounts.get(zId) ?? 0) + 1);
  }

  assert.ok((zoneCounts.get(ZONE_ID.skin) ?? 0) > 80, 'expected cuticle skin particles');
  assert.ok((zoneCounts.get(ZONE_ID.flesh) ?? 0) > 60, 'expected parenchyma flesh particles');
  assert.ok((zoneCounts.get(ZONE_ID.core) ?? 0) > 8, 'expected core & seed particles');
  assert.ok((zoneCounts.get(ZONE_ID.stem) ?? 0) >= 6, 'expected lignified stem particles');
  assert.ok((zoneCounts.get(ZONE_ID.leaf) ?? 0) >= 10, 'expected orchard leaf particles');
});

test('Fresh solid apple stays stably cohesive with zero wall collisions for 3 seconds without input', () => {
  const engine = new AppleBoxEngine({ particleCount: 420, boxSize: 6.0, stage: 'solid' });
  for (let f = 0; f < 100; f++) {
    engine.advance(0.03);
  }
  const t3 = engine.getTelemetry();
  assert.equal(t3.wallCollisions, 0, 'fresh solid apple must remain intact inside chamber');
  assert.ok(t3.rmsdNm < 0.08, `expected tiny thermal vibration RMSD < 0.08 nm, got ${t3.rmsdNm}`);
  assert.equal(t3.phase, 'fresh');
});

test('Velocity Verlet + elastic wall & hard-sphere collisions strictly conserve kinetic energy in gas phase', () => {
  const engine = new AppleBoxEngine({ particleCount: 360, boxSize: 6.0, stage: 'gas' });
  engine.setStage('gas');

  const k0 = computeRawKineticEnergy(engine.vel, engine.mass, engine.count);
  assert.ok(k0 > 500, 'expected energetic ergodic gas');

  for (let i = 0; i < 300; i++) {
    engine.verletStep(0.004);
  }

  const k1 = computeRawKineticEnergy(engine.vel, engine.mass, engine.count);
  assert.ok(engine.wallCollisions > 40, `expected elastic wall bounces, got ${engine.wallCollisions}`);
  const relDrift = Math.abs(k1 - k0) / k0;
  assert.ok(
    relDrift < 1e-8,
    `expected exact kinetic energy conservation in elastic hard-sphere gas, got drift ${relDrift}`
  );
});

test('Ergodic gas maximizes spatial Shannon entropy and RMSD around ~2.5-3.4 nm', () => {
  const engine = new AppleBoxEngine({ particleCount: 480, boxSize: 6.0, stage: 'solid' });
  const fresh = engine.getTelemetry();
  assert.ok(fresh.entropyPct <= 10, `fresh apple entropyPct should be low, got ${fresh.entropyPct}`);

  engine.setStage('gas');
  for (let f = 0; f < 120; f++) {
    engine.advance(0.03);
  }
  const gas = engine.getTelemetry();
  assert.ok(gas.entropyPct > 85, `expected high ergodic entropy > 85%, got ${gas.entropyPct.toFixed(1)}%`);
  assert.ok(gas.rmsdNm > 2.2 && gas.rmsdNm < 3.8, `expected gas RMSD ~3 nm, got ${gas.rmsdNm.toFixed(2)}`);
  assert.equal(gas.phase, 'equilibrium');
});

test('Loschmidt time-reversal (v -> -v) reconstructs fresh apple with RMSD dropping back to ~0.00 nm', () => {
  const engine = new AppleBoxEngine({ particleCount: 360, boxSize: 6.0, stage: 'gas' });
  engine.setStage('gas');
  for (let f = 0; f < 80; f++) {
    engine.advance(0.03);
  }
  const peakRmsd = computeRMSD(engine.pos, engine.initPos, engine.count);
  assert.ok(peakRmsd > 2.0, 'should be thoroughly dispersed before reversal');

  engine.reverseVelocities();
  assert.equal(engine.isReversed, true);

  for (let f = 0; f < 280; f++) {
    engine.advance(0.035);
    if (!engine.isReversed) break;
  }

  const recombined = engine.getTelemetry();
  assert.ok(
    recombined.rmsdNm < 0.08,
    `expected Poincaré recurrence RMSD < 0.08 nm, got ${recombined.rmsdNm.toFixed(4)}`
  );
  assert.equal(recombined.phase, 'recombined');
});

test('Phase cycle scrubber seeks cleanly between fresh (0%), gas (40%), and recurrence (100%)', () => {
  const engine = new AppleBoxEngine({ particleCount: 400, boxSize: 6.0 });

  engine.seekCycleProgress(0.4);
  const gasSnap = engine.getTelemetry();
  assert.ok(gasSnap.entropyPct > 85, '40% scrub should produce max-entropy ergodic gas');
  assert.ok(gasSnap.rmsdNm > 2.2, '40% scrub should have dispersed RMSD');

  engine.seekCycleProgress(1.0);
  const recSnap = engine.getTelemetry();
  assert.equal(recSnap.rmsdNm, 0);
  assert.equal(recSnap.phase, 'recombined');
  assert.equal(recSnap.stageLabel, 'Poincaré Recurrence Achieved');
  assert.equal(recSnap.timescaleLabel, 't = T_rec');
});
