import React, { useMemo, useState } from 'react';
import { Download, Grid2X2, Loader2, Plus, Trash2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

type SpacingRow = {
  id: string;
  value: number;
};

function inputClass() {
  return 'w-full rounded-md border border-white/10 bg-[#11151b] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10';
}

export default function FloorPlanLab() {
  const [totalWidthMeters, setTotalWidthMeters] = useState(12);
  const [totalLengthMeters, setTotalLengthMeters] = useState(10);
  const [wallThicknessMm, setWallThicknessMm] = useState(150);
  const [columnWidthMm, setColumnWidthMm] = useState(300);
  const [columnDepthMm, setColumnDepthMm] = useState(300);
  const [gridSpacings, setGridSpacings] = useState<SpacingRow[]>([
    { id: crypto.randomUUID(), value: 4 },
    { id: crypto.randomUUID(), value: 3.5 },
    { id: crypto.randomUUID(), value: 4.5 },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const previewAxes = useMemo(() => {
    const widthMm = totalWidthMeters * 1000;
    const lengthMm = totalLengthMeters * 1000;
    const spacingsMm = gridSpacings.map((row) => Math.max(row.value, 0) * 1000);
    const x = [0];
    let cursor = 0;
    spacingsMm.forEach((spacing) => {
      cursor += spacing;
      if (cursor < widthMm) x.push(cursor);
    });
    if (x[x.length - 1] !== widthMm) x.push(widthMm);

    const y = [0];
    cursor = 0;
    spacingsMm.forEach((spacing) => {
      cursor += spacing;
      if (cursor < lengthMm) y.push(cursor);
    });
    if (y[y.length - 1] !== lengthMm) y.push(lengthMm);
    return { x, y, widthMm, lengthMm };
  }, [gridSpacings, totalLengthMeters, totalWidthMeters]);

  function updateSpacing(id: string, value: number) {
    setGridSpacings((current) => current.map((row) => row.id === id ? { ...row, value } : row));
  }

  async function generateLayoutScript() {
    setBusy(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/v1/drafting/generate-layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          total_width_meters: totalWidthMeters,
          total_length_meters: totalLengthMeters,
          wall_thickness_mm: wallThicknessMm,
          column_width_mm: columnWidthMm,
          column_depth_mm: columnDepthMm,
          grid_spacings: gridSpacings.map((row) => row.value).filter((value) => value > 0),
        }),
      });

      if (!response.ok) throw new Error(await response.text());

      const blob = new Blob([await response.text()], { type: 'text/plain; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ArchiVault_Floor_Plan_Layout.scr';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Layout script generation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">Floor Plan Lab</h3>
            <p className="mt-1 text-sm text-zinc-400">Generate structural grid, wall outline, and column placeholder scripts.</p>
          </div>
          <Grid2X2 className="h-5 w-5 text-cyan-300" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Total width, meters</span>
            <input className={inputClass()} type="number" value={totalWidthMeters} onChange={(event) => setTotalWidthMeters(Number(event.target.value))} />
          </label>
          <label>
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Total length, meters</span>
            <input className={inputClass()} type="number" value={totalLengthMeters} onChange={(event) => setTotalLengthMeters(Number(event.target.value))} />
          </label>
          <label>
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Wall thickness, mm</span>
            <input className={inputClass()} type="number" value={wallThicknessMm} onChange={(event) => setWallThicknessMm(Number(event.target.value))} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Column W, mm</span>
              <input className={inputClass()} type="number" value={columnWidthMm} onChange={(event) => setColumnWidthMm(Number(event.target.value))} />
            </label>
            <label>
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Column D, mm</span>
              <input className={inputClass()} type="number" value={columnDepthMm} onChange={(event) => setColumnDepthMm(Number(event.target.value))} />
            </label>
          </div>
        </div>

        <div className="mt-5 rounded-md border border-white/10 bg-[#11151b] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">Room Spacing Parameters</p>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.08]"
              onClick={() => setGridSpacings((current) => [...current, { id: crypto.randomUUID(), value: 4 }])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
          <div className="max-h-[260px] space-y-2 overflow-y-auto pr-2 [scrollbar-color:rgba(34,211,238,0.45)_rgba(255,255,255,0.06)] [scrollbar-width:thin]">
            {gridSpacings.map((row, index) => (
              <div key={row.id} className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  className={inputClass()}
                  type="number"
                  value={row.value}
                  onChange={(event) => updateSpacing(row.id, Number(event.target.value))}
                  aria-label={`Grid spacing ${index + 1}`}
                />
                <button
                  className="rounded-md p-2 text-zinc-500 hover:bg-red-400/10 hover:text-red-300"
                  onClick={() => setGridSpacings((current) => current.filter((item) => item.id !== row.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={generateLayoutScript}
          disabled={busy}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Generate Parametric Layout Script
        </button>
        {error && <p className="mt-3 rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</p>}
      </div>

      <div className="rounded-lg border border-white/10 bg-[#080a0d] p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-white">Structural Layout Preview</h3>
          <p className="mt-1 text-sm text-zinc-400">{previewAxes.x.length} vertical axes · {previewAxes.y.length} horizontal axes · {previewAxes.x.length * previewAxes.y.length} columns</p>
        </div>
        <div className="aspect-[1.2/1] rounded-md border border-white/10 bg-[#11151b] p-4">
          <div className="relative h-full w-full overflow-hidden rounded-sm border border-cyan-300/30 bg-[linear-gradient(90deg,rgba(34,211,238,0.08)_1px,transparent_1px),linear-gradient(rgba(34,211,238,0.08)_1px,transparent_1px)] bg-[size:20%_20%]">
            <div className="absolute inset-4 border-2 border-cyan-200/70 bg-cyan-300/5" />
            {previewAxes.x.map((axis) => (
              <div key={`x-${axis}`} className="absolute top-0 h-full border-l border-emerald-300/50" style={{ left: `${(axis / previewAxes.widthMm) * 100}%` }} />
            ))}
            {previewAxes.y.map((axis) => (
              <div key={`y-${axis}`} className="absolute left-0 w-full border-t border-emerald-300/50" style={{ top: `${(axis / previewAxes.lengthMm) * 100}%` }} />
            ))}
            {previewAxes.x.map((xAxis) => previewAxes.y.map((yAxis) => (
              <div
                key={`col-${xAxis}-${yAxis}`}
                className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-amber-200 bg-amber-300/70"
                style={{
                  left: `${(xAxis / previewAxes.widthMm) * 100}%`,
                  top: `${(yAxis / previewAxes.lengthMm) * 100}%`,
                }}
              />
            )))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Footprint</p>
            <p className="mt-1 text-sm font-semibold text-white">{totalWidthMeters} x {totalLengthMeters} m</p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Wall</p>
            <p className="mt-1 text-sm font-semibold text-white">{wallThicknessMm} mm</p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Column</p>
            <p className="mt-1 text-sm font-semibold text-white">{columnWidthMm} x {columnDepthMm} mm</p>
          </div>
        </div>
      </div>
    </section>
  );
}
