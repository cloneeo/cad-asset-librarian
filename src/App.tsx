import React, { useState } from 'react';
import { Boxes, Cpu, Layers3 } from 'lucide-react';
import Dashboard from './components/Dashboard';
import { ActiveTab } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  return (
    <div className="min-h-screen bg-[#0b0d10] text-zinc-100 antialiased" id="app-root">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0d10]/88 backdrop-blur-xl" id="app-header">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300">ArchiVault Web Suite</p>
              <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-white">CAD optimization command center</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2">
            <Cpu className="h-4 w-4 text-emerald-300" />
            <span className="text-xs text-zinc-300">FastAPI + SQLite + imagehash + Pillow</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-5 py-6 lg:py-8" id="core-viewport">
        <section className="mb-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Automate visual matching, sheet math, board layout, and render prep.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
              A production-ready framework for architecture students who need local CAD asset retrieval, scale validation, presentation board grids, and repeatable AutoCAD cleanup scripts from one quiet dashboard.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            {['pHash Search', 'Sheet Fit', 'SCR Builder'].map((label) => (
              <div key={label} className="rounded-md border border-white/10 bg-[#11151b] px-3 py-3">
                <Layers3 className="mb-2 h-4 w-4 text-cyan-300" />
                <p className="text-[11px] font-medium text-zinc-300">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <Dashboard activeTab={activeTab} setActiveTab={setActiveTab} />
      </main>

      <footer className="mt-10 border-t border-white/10 px-5 py-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <span>ArchiVault Web Suite framework, 2026</span>
          <span>API default: http://localhost:8080</span>
        </div>
      </footer>
    </div>
  );
}
