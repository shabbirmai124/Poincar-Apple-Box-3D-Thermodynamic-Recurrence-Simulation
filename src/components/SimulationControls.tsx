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
  { id: 'solid', label: '1. Fresh' },
  { id: 'decay', label: '2. Mold & Puddle' },
  { id: 'dust', label: '3. Dust' },
  { id: 'gas', label: '4. Quantum Soup' },
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
  const tempPct = ((tempDisplay - 50) / 750) * 100;

  return (
    <div className="space-y-3">
      {/* Row 1: Poincaré phase cycle & Chamber temperature sliders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="cycle-scrubber" className="text-xs font-medium text-slate-300">
              Poincaré phase cycle
            </label>
            <span className="text-[11px] text-slate-500">
              Apple → Mold &amp; Puddle → Dust → Quantum Soup → Reassembly
            </span>
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
                background: `linear-gradient(to right, #38BDF8 ${cyclePct}%, #1E293B ${cyclePct}%)`,
              }}
            />
            <span
              className="w-11 text-right text-sm font-semibold text-slate-100 font-mono-tabular shrink-0"
              data-testid="cycle-pct-value"
            >
              {cyclePct}%
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="chamber-temp-slider" className="block text-xs font-medium text-slate-300">
            Chamber temperature
          </label>
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
                background: `linear-gradient(to right, #38BDF8 ${tempPct}%, #1E293B ${tempPct}%)`,
              }}
            />
            <span
              className="w-14 text-right text-sm font-semibold text-slate-100 font-mono-tabular shrink-0"
              data-testid="temp-value"
            >
              {tempDisplay} K
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: Stage dropdown + Direct 6-stage theory buttons + Speed */}
      <div className="flex flex-wrap items-end justify-between gap-2 pt-0.5">
        <div className="w-full sm:w-48 shrink-0 space-y-1">
          <label
            htmlFor="thermodynamic-stage-select"
            className="block text-xs font-medium text-slate-300"
          >
            Thermodynamic stage
          </label>
          <select
            id="thermodynamic-stage-select"
            value={stage}
            onChange={(e) => onStageChange(e.target.value as ThermodynamicStage)}
            className="w-full h-9 rounded-lg border border-slate-700/90 bg-[#0B1120] px-2.5 text-xs font-medium text-slate-100 hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400 transition-colors cursor-pointer"
          >
            <option value="full_cycle">Full cycle (Slow)</option>
            <option value="solid">1. Fresh Apple</option>
            <option value="decay">2. Mold &amp; Puddle</option>
            <option value="dust">3. Dust Collapse</option>
            <option value="gas">4. Subatomic Soup</option>
            <option value="reversal">5. Reassembly (v → −v)</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex flex-wrap items-center gap-1" role="group" aria-label="Direct simulation stages">
            {QUICK_STAGES.map((item) => {
              const active = stage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onStageChange(item.id)}
                  aria-pressed={active}
                  className={`h-9 px-2.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                    active
                      ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                      : 'bg-[#0B1120] border-slate-800 text-slate-300 hover:bg-slate-800/70 hover:text-white'
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
            className={`h-9 px-2.5 rounded-lg text-xs font-medium border inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              isReversed
                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                : 'bg-[#0B1120] border-slate-800 text-slate-200 hover:bg-slate-800/70 hover:text-white'
            }`}
          >
            <Rewind className="w-3.5 h-3.5" />
            <span>5. Reassemble</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            aria-label="Reset chamber to fresh apple"
            className="h-9 px-2.5 rounded-lg text-xs font-medium border border-slate-800 bg-[#0B1120] text-slate-300 hover:bg-slate-800/70 hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <label className="h-9 px-2 rounded-lg border border-slate-800 bg-[#0B1120] inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 cursor-pointer select-none hover:bg-slate-800/70">
            <input
              type="checkbox"
              checked={showVelocityVectors}
              onChange={onToggleVectors}
              className="accent-sky-400 rounded cursor-pointer"
            />
            <span>Trails</span>
          </label>

          <div
            className="inline-flex rounded-lg border border-slate-800 bg-[#070B14] p-0.5"
            role="group"
            aria-label="Observation speed"
          >
            {[0.25, 0.5, 1, 2].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onTimeScaleChange(spd)}
                aria-pressed={Math.abs(timeScale - spd) < 0.05}
                className={`h-8 px-1.5 rounded-md text-[11px] font-mono-tabular font-medium transition-colors cursor-pointer ${
                  Math.abs(timeScale - spd) < 0.05
                    ? 'bg-slate-800 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
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
