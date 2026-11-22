import React from 'react';
import { X } from 'lucide-react';
import { TelemetrySnapshot } from '../physics/types';

interface TheoryDrawerProps {
  open: boolean;
  onClose: () => void;
  telemetry: TelemetrySnapshot;
}

export const TheoryDrawer: React.FC<TheoryDrawerProps> = ({ open, onClose, telemetry }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex justify-end bg-slate-900/35"
      role="dialog"
      aria-modal="true"
      aria-labelledby="theory-drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="w-full max-w-lg h-full bg-white border-l border-slate-200 overflow-y-auto px-6 py-5 text-slate-700 flex flex-col gap-6 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div>
            <h2 id="theory-drawer-title" className="text-lg font-semibold text-slate-900">
              Apple in a Box &amp; Poincaré Recurrence
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Closed Hamiltonian Physics &amp; Coarse-Grained Equations
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close theory drawer"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section 1: Thought Experiment Stages */}
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-slate-900">
            1. The Four Stages Over Infinite Time
          </h3>
          <ol className="space-y-2 text-xs leading-relaxed text-slate-600">
            <li>
              <strong className="text-slate-900">01. Cohesive Solid Apple.</strong> A fresh apple is
              sealed inside an indestructible, perfectly adiabatic chamber allowing zero matter or
              energy exchange. Cuticle, parenchyma flesh, core seeds, stem, and leaf remain bound by
              inter-cellular cohesion.
            </li>
            <li>
              <strong className="text-slate-900">02. Enzymatic Decay &amp; Slump.</strong> Cellular
              bonds weaken over weeks and years. Oxidation browns the skin and cortex while gravity
              pulls softened tissue downward and volatile molecules escape.
            </li>
            <li>
              <strong className="text-slate-900">03. Ergodic Max-Entropy Gas.</strong> Over cosmic
              eons, all matter dissociates into fundamental particles undergoing lossless elastic
              collisions (<span className="font-mono-tabular text-slate-900">e = 1.0</span>) against
              one another and the six sealed chamber walls.
            </li>
            <li>
              <strong className="text-slate-900">04. Poincaré Recurrence.</strong> Because particle
              count N is finite and total energy is bounded, phase-space volume is finite. Given
              infinite time (or exact Loschmidt velocity inversion{' '}
              <span className="font-mono-tabular text-slate-900">v → −v</span>), trajectories must
              re-align into the exact fresh starting apple.
            </li>
          </ol>
        </section>

        {/* Section 2: Computational Limits & Coarse-Graining */}
        <section className="space-y-2 pt-4 border-t border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            2. Why Coarse-Graining Is Required
          </h3>
          <p className="text-xs leading-relaxed text-slate-600">
            A 150 g apple contains roughly{' '}
            <span className="font-mono-tabular font-medium text-blue-700">N ≈ 10²⁵</span> atoms. Its
            Poincaré recurrence horizon scales doubly exponentially as{' '}
            <span className="font-mono-tabular font-medium text-orange-700">T_R ~ 10^(10^N)</span> —
            vastly exceeding the age of the universe (
            <span className="font-mono-tabular text-slate-900">1.38 × 10¹⁰ yr</span>). This live
            engine coarse-grains the apple into{' '}
            <span className="font-mono-tabular font-medium text-blue-700">
              {telemetry.particleCount}
            </span>{' '}
            anatomically layered molecular particles inside a sealed 6.0 nm test volume.
          </p>
        </section>

        {/* Section 3: Implemented Equations */}
        <section className="space-y-3 pt-4 border-t border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            3. Live Equations Running in This Engine
          </h3>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">
                  Symplectic Velocity Verlet &amp; Elastic Collisions
                </span>
                <span className="font-mono-tabular font-semibold text-orange-700">
                  E_k = {telemetry.kineticEnergyKj.toFixed(1)} kJ/mol
                </span>
              </div>
              <p className="font-mono-tabular text-blue-700 text-[11px]">
                v_i&apos; = v_i − [2m_j/(m_i+m_j)] ((v_i − v_j) · n) n   (e = 1.0)
              </p>
              <p className="text-slate-600 leading-relaxed">
                64-bit symplectic Velocity Verlet paired with an O(N) 3D spatial hash for elastic
                hard-sphere collisions and specular wall reflections preserves phase-space volume
                and keeps kinetic energy strictly flat in gas equilibrium.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">
                  Spatial Shannon / Boltzmann Entropy
                </span>
                <span className="font-mono-tabular font-semibold text-blue-700">
                  S / S_max = {telemetry.entropyPct.toFixed(1)}%
                </span>
              </div>
              <p className="font-mono-tabular text-blue-700 text-[11px]">
                S = −k_B Σ p_k ln(p_k)   across 8×8×8 = 512 voxels
              </p>
              <p className="text-slate-600 leading-relaxed">
                Near zero when particles are tightly localized inside the apple silhouette; climbs
                to a flat 100% plateau during uniform ergodic thermal equilibrium.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">
                  Structural RMSD &amp; Loschmidt Time-Reversal
                </span>
                <span className="font-mono-tabular font-semibold text-emerald-700">
                  RMSD = {telemetry.rmsdNm.toFixed(2)} nm
                </span>
              </div>
              <p className="font-mono-tabular text-blue-700 text-[11px]">
                RMSD = √( (1/N) Σ |r_i(t) − r_i(0)|² )   |   v_i → −v_i
              </p>
              <p className="text-slate-600 leading-relaxed">
                Measures exact atomic deviation from the fresh apple lattice. Inverting all
                velocities via Loschmidt&apos;s echo retraces chaotic trajectories back to{' '}
                <span className="font-mono-tabular text-slate-900">0.00 nm</span>.
              </p>
            </div>
          </div>
        </section>

        <section className="pt-4 border-t border-slate-200 text-[11px] text-slate-500 space-y-1">
          <p className="font-semibold text-slate-700">Controls &amp; Keyboard Shortcuts</p>
          <p>
            <span className="font-mono-tabular font-medium text-slate-800">Space</span> Play / Pause
            · <span className="font-mono-tabular font-medium text-slate-800">R</span> Reverse
            Velocities ·{' '}
            <span className="font-mono-tabular font-medium text-slate-800">C</span> Toggle Core View
            · Drag 3D chamber to orbit, scroll to zoom.
          </p>
        </section>
      </aside>
    </div>
  );
};
