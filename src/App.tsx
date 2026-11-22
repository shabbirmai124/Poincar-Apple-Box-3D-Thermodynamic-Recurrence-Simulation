import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Eye, EyeOff, Pause, Play } from 'lucide-react';
import { MetricCards } from './components/MetricCards';
import { SimulationControls } from './components/SimulationControls';
import { TheoryDrawer } from './components/TheoryDrawer';
import {
  CameraPreset,
  TelemetrySnapshot,
  ThermodynamicStage,
} from './physics/types';
import { AppleBoxSceneController } from './scene/AppleBoxScene';

const INITIAL_TELEMETRY: TelemetrySnapshot = {
  simTime: 0,
  stepCount: 0,
  particleCount: 1100,
  cycleProgress: 0,
  kineticEnergyKj: 12.0,
  potentialEnergyKj: 0,
  totalEnergyKj: 12.0,
  energyDriftPct: 0,
  temperatureK: 310,
  shannonEntropy: 1.0,
  maxEntropy: 6.23,
  entropyPct: 2.0,
  rmsdNm: 0,
  recombinationPct: 100,
  wallCollisions: 0,
  phase: 'fresh',
  stageLabel: 'Fresh Apple in Sealed Box',
  timescaleLabel: 't = 0 s',
  stageCaption:
    'A fresh apple rests inside an indestructible, perfectly isolated chamber allowing zero matter or energy out.',
  isReversed: false,
  decayProgress: 0,
  puddleProgress: 0,
  dustProgress: 0,
  solidShellAlpha: 1,
  history: [
    { t: 0, entropyPct: 2.0, kineticEnergyKj: 12.0, rmsdNm: 0 },
    { t: 0.1, entropyPct: 2.0, kineticEnergyKj: 12.0, rmsdNm: 0 },
  ],
};

const CAMERA_OPTIONS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'isometric', label: '3/4' },
  { id: 'front', label: 'Front' },
  { id: 'top', label: 'Top' },
];

export function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<AppleBoxSceneController | null>(null);

  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(INITIAL_TELEMETRY);
  const [paused, setPaused] = useState(false);
  const [stage, setStage] = useState<ThermodynamicStage>('full_cycle');
  const [temperatureK, setTemperatureK] = useState(310);
  const [timeScale, setTimeScale] = useState(0.5);
  const [coreView, setCoreView] = useState(false);
  const [showVelocityVectors, setShowVelocityVectors] = useState(true);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [theoryOpen, setTheoryOpen] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const controller = new AppleBoxSceneController(
      mount,
      (snapshot) => {
        setTelemetry(snapshot);
      },
      (lost) => setContextLost(lost)
    );
    controllerRef.current = controller;

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA')
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setPaused((prev) => {
          const next = !prev;
          controllerRef.current?.setPaused(next);
          return next;
        });
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setPaused(false);
        setStage('reversal');
        controllerRef.current?.setStage('reversal');
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setCoreView((prev) => {
          const next = !prev;
          controllerRef.current?.setVisualState({ coreView: next });
          return next;
        });
      } else if (e.key === 'Escape') {
        setTheoryOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleTogglePause = () => {
    setPaused((prev) => {
      const next = !prev;
      controllerRef.current?.setPaused(next);
      return next;
    });
  };

  const handleToggleCoreView = () => {
    setCoreView((prev) => {
      const next = !prev;
      controllerRef.current?.setVisualState({ coreView: next });
      return next;
    });
  };

  const handleToggleVectors = () => {
    setShowVelocityVectors((prev) => {
      const next = !prev;
      controllerRef.current?.setVisualState({ showVelocityVectors: next });
      return next;
    });
  };

  const handleSeekCycle = (progress01: number) => {
    setStage('full_cycle');
    controllerRef.current?.seekCycle(progress01);
  };

  const handleTemperatureChange = (tempK: number) => {
    setTemperatureK(tempK);
    controllerRef.current?.setTemperatureK(tempK);
  };

  const handleStageChange = (nextStage: ThermodynamicStage) => {
    setStage(nextStage);
    setPaused(false);
    controllerRef.current?.setStage(nextStage);
  };

  const handleReverseVelocities = () => {
    setStage('reversal');
    setPaused(false);
    controllerRef.current?.setStage('reversal');
  };

  const handleReset = () => {
    setStage('full_cycle');
    setPaused(false);
    controllerRef.current?.reset();
  };

  const handleTimeScaleChange = (scale: number) => {
    setTimeScale(scale);
    controllerRef.current?.setTimeScale(scale);
  };

  const handleCameraPreset = (preset: CameraPreset) => {
    setCameraPreset(preset);
    controllerRef.current?.setCameraPreset(preset);
  };

  const showSpeciesLegend =
    telemetry.phase === 'equilibrium' ||
    telemetry.phase === 'rearranging' ||
    telemetry.phase === 'reversing';

  return (
    <main
      className="min-h-screen lg:h-screen w-full flex flex-col bg-[#010308] text-slate-100 overflow-x-hidden lg:overflow-hidden"
      data-phase={telemetry.phase}
      data-cycle={Math.round(telemetry.cycleProgress * 100)}
      data-rmsd={telemetry.rmsdNm.toFixed(2)}
    >
      {/* Top 3D Deep-Space Sealed Chamber Viewport */}
      <section
        className="relative flex-1 min-h-[380px] sm:min-h-[440px] w-full bg-[#010308] overflow-hidden"
        aria-label="3D Sealed Apple-in-a-Box Deep Space Chamber"
      >
        <div
          ref={canvasMountRef}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
        />

        {/* Top Bar Overlay (zero backdrop-filter over WebGL) */}
        <header className="pointer-events-none absolute top-0 inset-x-0 z-10 flex flex-wrap items-start justify-between gap-2 px-4 sm:px-6 pt-3.5">
          {/* Left: Stage status, cosmic timescale & concise 1-line physical caption */}
          <div className="pointer-events-auto flex flex-col gap-1.5 max-w-xl">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="bg-[#0B1120] border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-100">
                {telemetry.stageLabel}
              </h1>
              <span className="bg-[#0B1120] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-medium text-sky-300 font-mono-tabular">
                {telemetry.timescaleLabel}
              </span>
            </div>
            <p className="text-xs text-slate-300/90 leading-snug bg-[#050811]/85 border border-slate-800/70 rounded-lg px-3 py-1.5">
              {telemetry.stageCaption}
            </p>
          </div>

          {/* Right: Core view toggle, Play/Pause circle, Theory drawer trigger */}
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleCoreView}
              aria-pressed={coreView}
              className={`h-9 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                coreView
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {coreView ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>Core view</span>
            </button>

            <button
              type="button"
              onClick={handleTogglePause}
              aria-label={paused ? 'Play simulation' : 'Pause simulation'}
              className="w-9 h-9 rounded-full bg-[#0B1120] border border-slate-700 hover:bg-slate-800 text-slate-100 inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {paused ? <Play className="w-4 h-4 fill-current ml-0.5" /> : <Pause className="w-4 h-4 fill-current" />}
            </button>

            <button
              type="button"
              onClick={() => setTheoryOpen(true)}
              aria-label="Open theory and equations"
              className="h-9 px-3 rounded-full bg-[#0B1120] border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Theory</span>
            </button>
          </div>
        </header>

        {/* Bottom-Left Camera Angle Presets */}
        <div
          className="absolute bottom-3 left-4 sm:left-6 z-10 inline-flex items-center rounded-lg bg-[#0B1120] border border-slate-800 p-0.5"
          role="group"
          aria-label="Camera angle presets"
        >
          {CAMERA_OPTIONS.map((cam) => (
            <button
              key={cam.id}
              type="button"
              onClick={() => handleCameraPreset(cam.id)}
              aria-pressed={cameraPreset === cam.id}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                cameraPreset === cam.id
                  ? 'bg-slate-800 text-sky-300'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {cam.label}
            </button>
          ))}
        </div>

        {/* Bottom-Right Fundamental Subatomic Species Legend (visible during Quantum Soup & Recombination) */}
        {showSpeciesLegend && (
          <div
            className="absolute bottom-3 right-4 sm:right-6 z-10 flex flex-wrap items-center gap-3 rounded-lg bg-[#0B1120] border border-slate-800 px-3 py-1.5 text-[11px] font-medium text-slate-300"
            aria-label="Fundamental particle species legend"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#F5573D]" />
              Protons
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#B8C7DB]" />
              Neutrons
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#47D6FF]" />
              Electrons
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#FFEB9E]" />
              Photons
            </span>
          </div>
        )}

        {contextLost && (
          <div
            role="alert"
            className="absolute inset-0 z-20 flex items-center justify-center bg-[#010308]/90"
          >
            <div className="bg-[#0B1120] border border-slate-800 rounded-xl px-6 py-5 max-w-sm text-center space-y-3 shadow-2xl">
              <p className="text-sm font-semibold text-slate-100">
                WebGL Rendering Context Interrupted
              </p>
              <p className="text-xs text-slate-400">
                The 3D physics viewport paused to recover graphics memory. Reload to resume the
                sealed chamber simulation.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg bg-sky-500 text-slate-950 text-xs font-semibold hover:bg-sky-400 cursor-pointer"
              >
                Reload Simulation
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Lower Instrument Console */}
      <section className="shrink-0 bg-[#050811] border-t border-slate-800/90 px-4 sm:px-6 py-3.5">
        <div className="max-w-5xl mx-auto space-y-3">
          <MetricCards telemetry={telemetry} />
          <div className="border-t border-slate-800/80 pt-3">
            <SimulationControls
              cycleProgress={telemetry.cycleProgress}
              temperatureK={temperatureK}
              stage={stage}
              isReversed={telemetry.isReversed}
              showVelocityVectors={showVelocityVectors}
              timeScale={timeScale}
              onSeekCycle={handleSeekCycle}
              onTemperatureChange={handleTemperatureChange}
              onStageChange={handleStageChange}
              onReverseVelocities={handleReverseVelocities}
              onReset={handleReset}
              onToggleVectors={handleToggleVectors}
              onTimeScaleChange={handleTimeScaleChange}
            />
          </div>
        </div>
      </section>

      <TheoryDrawer
        open={theoryOpen}
        onClose={() => setTheoryOpen(false)}
        telemetry={telemetry}
      />
    </main>
  );
}

export default App;
