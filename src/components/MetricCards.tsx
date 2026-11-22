import React from 'react';
import { HistoryPoint, TelemetrySnapshot } from '../physics/types';

interface MetricCardsProps {
  telemetry: TelemetrySnapshot;
}

interface SparklineProps {
  values: number[];
  min: number;
  max: number;
  stroke: string;
  label: string;
}

const Sparkline: React.FC<SparklineProps> = ({ values, min, max, stroke, label }) => {
  const width = 260;
  const height = 34;
  const padX = 5;
  const padY = 6;
  const span = Math.max(1e-4, max - min);

  const safeValues = values.length >= 2 ? values : [values[0] ?? min, values[0] ?? min];
  const pts = safeValues.map((v, idx) => {
    const x = padX + (idx / Math.max(1, safeValues.length - 1)) * (width - padX * 2);
    const norm = Math.max(0, Math.min(1, (v - min) / span));
    const y = height - padY - norm * (height - padY * 2);
    return { x, y };
  });

  const pathD = pts
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const last = pts[pts.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-8 overflow-visible"
      role="img"
      aria-label={label}
    >
      <path
        d={pathD}
        fill="none"
        stroke={stroke}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r="3.4" fill={stroke} />
    </svg>
  );
};

function extractSeries(history: HistoryPoint[], selector: (p: HistoryPoint) => number): number[] {
  if (history.length === 0) return [0, 0];
  return history.map(selector);
}

export const MetricCards: React.FC<MetricCardsProps> = ({ telemetry }) => {
  const entropySeries = extractSeries(telemetry.history, (p) => p.entropyPct);
  const energySeries = extractSeries(telemetry.history, (p) => p.kineticEnergyKj);
  const rmsdSeries = extractSeries(telemetry.history, (p) => p.rmsdNm);

  // Dynamic headroom for kinetic energy so elastic gas plateaus read crisp and steady
  const maxEnergy = Math.max(28, telemetry.kineticEnergyKj * 1.45, ...energySeries);

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      aria-label="Live statistical mechanics metrics"
    >
      {/* 1. Shannon Entropy */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex flex-col justify-between gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-slate-600 truncate">
            Shannon entropy (S / S_max)
          </span>
          <span
            className="text-sm font-semibold text-slate-900 font-mono-tabular shrink-0"
            data-testid="metric-entropy"
          >
            {telemetry.entropyPct.toFixed(1)}%
          </span>
        </div>
        <Sparkline
          values={entropySeries}
          min={0}
          max={105}
          stroke="#2563EB"
          label={`Shannon entropy trace at ${telemetry.entropyPct.toFixed(1)} percent`}
        />
      </div>

      {/* 2. Total Kinetic Energy */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex flex-col justify-between gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-slate-600 truncate">
            Total kinetic energy
          </span>
          <span
            className="text-sm font-semibold text-slate-900 font-mono-tabular shrink-0"
            data-testid="metric-energy"
          >
            {telemetry.kineticEnergyKj.toFixed(1)} kJ/mol
          </span>
        </div>
        <Sparkline
          values={energySeries}
          min={0}
          max={maxEnergy}
          stroke="#EA580C"
          label={`Total kinetic energy trace at ${telemetry.kineticEnergyKj.toFixed(1)} kilojoules per mole`}
        />
      </div>

      {/* 3. Structural RMSD */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex flex-col justify-between gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-slate-600 truncate">
            Structural RMSD
          </span>
          <span
            className="text-sm font-semibold text-slate-900 font-mono-tabular shrink-0"
            data-testid="metric-rmsd"
          >
            {telemetry.rmsdNm.toFixed(2)} nm
          </span>
        </div>
        <Sparkline
          values={rmsdSeries}
          min={0}
          max={3.6}
          stroke="#10B981"
          label={`Structural RMSD trace at ${telemetry.rmsdNm.toFixed(2)} nanometers`}
        />
      </div>
    </div>
  );
};
