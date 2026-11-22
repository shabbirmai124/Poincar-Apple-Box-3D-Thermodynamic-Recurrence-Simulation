import React from 'react';
import { RotateCcw, Rewind } from 'lucide-react';
import { ThermodynamicStage } from '../physics/types';

interface SimulationControlsProps {
  cycleProgress: number; // 0..1
  temperatureK: number;
  stage: ThermodynamicStage;
  isReversed: boolean;
  showVelocityVectors: boolean;
  timeScale: number;
  onSeekCycle: (progress01: number) => void;
  onTemperatureChange: (tempK: number) => void;
  onStageChange: (stage: ThermodynamicStage) => void;
  onReverseVelocities: () => void;
  onReset: () => void;
  onToggleVectors: () => void;
  onTimeScaleChange: (scale: number) => void;
}

const QUICK_STAGES: Array<{ id: ThermodynamicStage; label: string }> = [
  { id: 'solid', label: '1. Fresh Apple' },
  { id: 'decay', label: '2. Decay & Slump' },
  { id: 'gas', label: '3. Thermal Gas' },
  { id: 'full_cycle', label: 'Full Cycle' },
];

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  cycleProgress,
  temperatureK,
  stage,
  isReversed,
  showVelocityVectors,
  timeScale,
  onSeekCycle,
  onTemperatureChange,
  onStageChange,
  onReverseVelocities,
  onReset,
  onToggleVectors,
  onTimeScaleChange,
}) => {
  const cyclePct = Math.round(cycleProgress * 100);
  const tempDisplay = Math.round(temperatureK);

  return (
    <div className="space-y-3.5">
      {/* Row 1: Two primary thermodynamic sliders matching reference layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
        {/* Poincaré Phase Cycle Scrubber */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="cycle-scrubber"
              className="text-sm font-medium text-slate-700"
            >
              Poincaré phase cycle
            </label>
          </div>
          <div className="flex items-center gap-3">
            <input
              id="cycle-scrubber"
              type="range"
              min={0}
              max={100}
              step={1}
              value={cyclePct}
              onChange={(e) => onSeekCycle(Number(e.target.value) / 100)}
              className="studio-slider flex-1"
              style={{
                background: `linear-gradient(to right, #2563EB ${cyclePct}%, #E2E8F0 ${cyclePct}%)`,
              }}
            />
            <span
              className="w-12 text-right text-sm font-semibold text-slate-900 font-mono-tabular shrink-0"
              data-testid="cycle-pct-value"
            >
              {cyclePct}%
            </span>
          </div>
        </div>

        {/* Chamber Temperature Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="chamber-temp-slider"
              className="text-sm font-medium text-slate-700"
            >
              Chamber temperature
            </label>
          </div>
          <div className="flex items-center gap-3">
            <input
              id="chamber-temp-slider"
              type="range"
              min={50}
              max={800}
              step={10}
              value={tempDisplay}
              onChange={(e) => onTemperatureChange(Number(e.target.value))}
              className="studio-slider flex-1"
              style={{
                background: `linear-gradient(to right, #2563EB ${((tempDisplay - 50) / 750) * 100}%, #E2E8F0 ${((tempDisplay - 50) / 750) * 100}%)`,
              }}
            />
            <span
              className="w-14 text-right text-sm font-semibold text-slate-900 font-mono-tabular shrink-0"
              data-testid="temp-value"
            >
              {tempDisplay} K
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: Thermodynamic Stage selector + Direct Phase Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 pt-0.5">
        <div className="flex-1 min-w-[220px] max-w-md space-y-1.5">
          <label
            htmlFor="thermodynamic-stage-select"
            className="block text-sm font-medium text-slate-700"
          >
            Thermodynamic stage
          </label>
          <select
            id="thermodynamic-stage-select"
            value={stage}
            onChange={(e) => onStageChange(e.target.value as ThermodynamicStage)}
            className="w-full h-10 rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-sm font-medium text-slate-900 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors cursor-pointer"
          >
            <option value="full_cycle">Full cycle</option>
            <option value="solid">1. Cohesive Solid Apple</option>
            <option value="decay">2. Enzymatic Decay &amp; Slump</option>
            <option value="gas">3. Ergodic Max-Entropy Gas</option>
            <option value="reversal">4. Loschmidt Time-Reversal (v → −v)</option>
          </select>
        </div>

        {/* Direct 1-click stage buttons + Reverse Time & Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap items-center gap-1.5" role="group" aria-label="Direct simulation stages">
            {QUICK_STAGES.map((item) => {
              const active = stage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onStageChange(item.id)}
                  aria-pressed={active}
                  className={`h-9 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    active
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onReverseVelocities}
            aria-pressed={isReversed}
            className={`h-9 px-3 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              isReversed
                ? 'bg-sky-600 border-sky-600 text-white'
                : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <Rewind className="w-3.5 h-3.5" />
            <span>4. Reverse (v → −v)</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            aria-label="Reset chamber to fresh apple"
            className="h-9 px-3 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <label className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer select-none hover:bg-slate-50">
            <input
              type="checkbox"
              checked={showVelocityVectors}
              onChange={onToggleVectors}
              className="accent-blue-600 rounded cursor-pointer"
            />
            <span>Vectors</span>
          </label>

          <div
            className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
            role="group"
            aria-label="Simulation speed"
          >
            {[0.5, 1, 2].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onTimeScaleChange(spd)}
                aria-pressed={Math.abs(timeScale - spd) < 0.05}
                className={`h-8 px-2 rounded-md text-xs font-mono-tabular font-medium transition-colors cursor-pointer ${
                  Math.abs(timeScale - spd) < 0.05
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {spd}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
