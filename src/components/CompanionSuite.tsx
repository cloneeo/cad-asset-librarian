import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock3,
  FileSearch,
  Grid2X2,
  ListPlus,
  Loader2,
  Music2,
  Plus,
  Ruler,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

type BudgetView = {
  id: string;
  label: string;
  real_width_meters: number;
  real_length_meters: number;
  scale_factor: number;
};

type LayoutBudgetResponse = {
  fits: boolean;
  sheet: {
    name: string;
    width_mm: number;
    height_mm: number;
    printable_width_mm: number;
    printable_height_mm: number;
    margin_padding_mm: number;
  };
  used_layout_mm: { width: number; height: number };
  remaining_margin_safety_mm: { right: number; bottom: number };
  drawings: Array<BudgetView & { width_mm: number; height_mm: number; x: number; y: number; scale: string }>;
  overflow_reasons: string[];
  autocad_script: string;
};

type AssetHealthResponse = {
  overall_health_status: string;
  overall_health_color: 'Green' | 'Yellow' | 'Red';
  auto_toggle_flags: { deep_purge: boolean; overkill: boolean };
  profiles: Array<{
    file_name: string;
    file_size_mb: number;
    estimated_density_score: number;
    health_status: string;
    health_color: 'Green' | 'Yellow' | 'Red';
  }>;
};

const paperSizes = [
  'A0', 'A1', 'A2', 'A3', 'A4', 'B0', 'B1', 'B2', 'B3', 'C0', 'C1', 'C2', 'C3',
  'Letter', 'Legal', 'Tabloid', 'Ledger', 'ANSI_A', 'ANSI_B', 'ANSI_C', 'ANSI_D',
  'ANSI_E', 'ARCH_A', 'ARCH_B', 'ARCH_C', 'ARCH_D', 'ARCH_E', 'ARCH_E1',
];

const lineWeights = [
  { label: 'Walls', range: '0.35-0.50mm', color: 'bg-cyan-300', commands: '_LWEIGHT\n0.50\nA-WALL' },
  { label: 'Cut Objects', range: '0.30-0.40mm', color: 'bg-emerald-300', commands: '_LWEIGHT\n0.35\nA-CUT' },
  { label: 'Furniture', range: '0.18-0.25mm', color: 'bg-sky-300', commands: '_LWEIGHT\n0.25\nA-FURN' },
  { label: 'Hatching', range: '0.13-0.18mm', color: 'bg-zinc-300', commands: '_LWEIGHT\n0.15\nA-HATCH' },
  { label: 'Annotations', range: '0.18-0.25mm', color: 'bg-violet-300', commands: '_LWEIGHT\n0.20\nA-ANNO' },
  { label: 'Hidden Lines', range: '0.09-0.13mm', color: 'bg-amber-300', commands: '_LWEIGHT\n0.13\nA-HIDN' },
];

function inputClass() {
  return 'w-full rounded-md border border-white/10 bg-[#11151b] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10';
}

function healthClass(color?: string) {
  if (color === 'Red') return 'border-red-300/30 bg-red-300/10 text-red-100';
  if (color === 'Yellow') return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
  return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100';
}

function SheetPreview({ layoutBudget }: { layoutBudget: LayoutBudgetResponse }) {
  const sheet = layoutBudget.sheet;
  const titleHeight = Math.min(55, Math.max(28, sheet.height_mm * 0.08));

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-md border border-white/10 bg-[#080a0d] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">{sheet.name} paper space</p>
            <p className="mt-1 text-xs text-zinc-500">{sheet.width_mm} x {sheet.height_mm} mm</p>
          </div>
          <span className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-200">20mm pad</span>
        </div>

        <div className="mx-auto aspect-[0.707/1] max-h-[420px] w-full max-w-[320px] rounded-md border border-zinc-600 bg-zinc-950 p-3">
          <div className="relative h-full w-full overflow-hidden rounded-sm border border-cyan-300/40 bg-[linear-gradient(90deg,rgba(34,211,238,0.08)_1px,transparent_1px),linear-gradient(rgba(34,211,238,0.08)_1px,transparent_1px)] bg-[size:25%_25%]">
            <div
              className="absolute border border-emerald-300/50 bg-emerald-300/5"
              style={{
                left: `${(sheet.margin_padding_mm / sheet.width_mm) * 100}%`,
                top: `${(sheet.margin_padding_mm / sheet.height_mm) * 100}%`,
                width: `${(sheet.printable_width_mm / sheet.width_mm) * 100}%`,
                height: `${(sheet.printable_height_mm / sheet.height_mm) * 100}%`,
              }}
            />
            <div
              className="absolute border border-amber-300/60 bg-amber-300/10"
              style={{
                left: `${(sheet.margin_padding_mm / sheet.width_mm) * 100}%`,
                top: `${(sheet.margin_padding_mm / sheet.height_mm) * 100}%`,
                width: `${(sheet.printable_width_mm / sheet.width_mm) * 100}%`,
                height: `${(titleHeight / sheet.height_mm) * 100}%`,
              }}
            >
              <span className="absolute left-1 top-1 text-[9px] font-medium text-amber-100">Title block</span>
            </div>
            {layoutBudget.drawings.map((drawing, index) => (
              <div
                key={`${drawing.label}-${index}`}
                className="absolute overflow-hidden rounded-sm border border-cyan-200 bg-cyan-300/20 p-1"
                style={{
                  left: `${(drawing.x / sheet.width_mm) * 100}%`,
                  top: `${(drawing.y / sheet.height_mm) * 100}%`,
                  width: `${Math.max((drawing.width_mm / sheet.width_mm) * 100, 4)}%`,
                  height: `${Math.max((drawing.height_mm / sheet.height_mm) * 100, 4)}%`,
                }}
              >
                <span className="block truncate text-[9px] font-semibold text-cyan-50">{drawing.label}</span>
                <span className="block truncate text-[8px] text-cyan-100">{drawing.scale}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Used area</p>
            <p className="mt-1 text-sm font-semibold text-white">{layoutBudget.used_layout_mm.width} x {layoutBudget.used_layout_mm.height} mm</p>
          </div>
          <div className="rounded-md border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Right safe space</p>
            <p className="mt-1 text-sm font-semibold text-white">{layoutBudget.remaining_margin_safety_mm.right} mm</p>
          </div>
          <div className="rounded-md border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Bottom safe space</p>
            <p className="mt-1 text-sm font-semibold text-white">{layoutBudget.remaining_margin_safety_mm.bottom} mm</p>
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-black/20 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500">Drawing boxes</p>
          <div className="space-y-2">
            {layoutBudget.drawings.map((drawing, index) => (
              <div key={`${drawing.label}-row-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded bg-white/[0.04] px-3 py-2 text-xs">
                <span className="font-medium text-white">{drawing.label}</span>
                <span className="text-zinc-400">{drawing.width_mm} x {drawing.height_mm} mm</span>
                <span className="font-mono text-cyan-200">({drawing.x}, {drawing.y})</span>
              </div>
            ))}
          </div>
        </div>

        {layoutBudget.overflow_reasons.length > 0 && (
          <div className="rounded-md border border-red-300/20 bg-red-300/10 p-3 text-xs text-red-100">
            {layoutBudget.overflow_reasons.join(' ')}
          </div>
        )}

        {layoutBudget.autocad_script && (
          <details className="rounded-md border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer text-xs font-medium text-zinc-300">AutoCAD script details</summary>
            <pre className="mt-3 max-h-36 overflow-auto rounded bg-black/30 p-3 font-mono text-[11px] leading-5 text-emerald-200">{layoutBudget.autocad_script}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

export default function CompanionSuite() {
  const assetInputRef = useRef<HTMLInputElement>(null);
  const [targetSheetSize, setTargetSheetSize] = useState('A1');
  const [views, setViews] = useState<BudgetView[]>([
    { id: crypto.randomUUID(), label: 'Plan', real_width_meters: 18, real_length_meters: 12, scale_factor: 100 },
    { id: crypto.randomUUID(), label: 'Elevation', real_width_meters: 18, real_length_meters: 6, scale_factor: 100 },
  ]);
  const [layoutBudget, setLayoutBudget] = useState<LayoutBudgetResponse | null>(null);
  const [budgetBusy, setBudgetBusy] = useState(false);
  const [budgetError, setBudgetError] = useState('');
  const [assetHealth, setAssetHealth] = useState<AssetHealthResponse | null>(null);
  const [assetBusy, setAssetBusy] = useState(false);
  const [assetError, setAssetError] = useState('');
  const [sessionSeconds, setSessionSeconds] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    if (!timerRunning) return undefined;
    const timer = window.setInterval(() => {
      setSessionSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning]);

  const timerLabel = useMemo(() => {
    const minutes = Math.floor(sessionSeconds / 60).toString().padStart(2, '0');
    const seconds = (sessionSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [sessionSeconds]);

  function updateView(id: string, patch: Partial<BudgetView>) {
    setViews((current) => current.map((view) => view.id === id ? { ...view, ...patch } : view));
  }

  async function computeBudget() {
    setBudgetBusy(true);
    setBudgetError('');
    try {
      const response = await fetch(`${API_BASE}/api/v1/scale/layout-budget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_sheet_size: targetSheetSize,
          drawings: views.map(({ id, ...view }) => view),
          margin_padding_mm: 20,
          gap_mm: 12,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      setLayoutBudget(await response.json());
    } catch (error) {
      setBudgetError(error instanceof Error ? error.message : 'Layout budget failed.');
    } finally {
      setBudgetBusy(false);
    }
  }

  async function analyzeAssets(files: FileList | null) {
    if (!files?.length) return;
    setAssetBusy(true);
    setAssetError('');
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append('files', file));
      const response = await fetch(`${API_BASE}/api/v1/assets/analyze-weight`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error(await response.text());
      setAssetHealth(await response.json());
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : 'Asset weight analysis failed.');
    } finally {
      setAssetBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-white/10 bg-[#080a0d]">
      <div className="border-b border-white/10 px-5 py-4">
        <h3 className="text-base font-semibold text-white">Archi Companion Suite</h3>
        <p className="mt-1 text-xs text-zinc-500">Print budgeting, standards, asset health, and focus support.</p>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-white">Print Layout Budget Panel</h3>
                <Ruler className="h-5 w-5 text-cyan-300" />
              </div>
              <div className="mb-4 grid gap-3 sm:grid-cols-[0.45fr_1fr]">
                <select className={inputClass()} value={targetSheetSize} onChange={(event) => setTargetSheetSize(event.target.value)}>
                  {paperSizes.map((size) => <option key={size}>{size}</option>)}
                </select>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-200"
                  onClick={() => setViews((current) => [...current, { id: crypto.randomUUID(), label: 'New View', real_width_meters: 10, real_length_meters: 8, scale_factor: 100 }])}
                >
                  <ListPlus className="h-4 w-4" />
                  Add Drawing View
                </button>
              </div>
              <div className="space-y-3">
                {views.map((view) => (
                  <div key={view.id} className="grid gap-3 rounded-md border border-white/10 bg-[#11151b] p-3 md:grid-cols-[1fr_0.8fr_0.8fr_0.7fr_auto]">
                    <input className={inputClass()} value={view.label} onChange={(event) => updateView(view.id, { label: event.target.value })} />
                    <input className={inputClass()} type="number" value={view.real_width_meters} onChange={(event) => updateView(view.id, { real_width_meters: Number(event.target.value) })} />
                    <input className={inputClass()} type="number" value={view.real_length_meters} onChange={(event) => updateView(view.id, { real_length_meters: Number(event.target.value) })} />
                    <input className={inputClass()} type="number" value={view.scale_factor} onChange={(event) => updateView(view.id, { scale_factor: Number(event.target.value) })} />
                    <button className="rounded-md p-2 text-zinc-500 hover:bg-red-400/10 hover:text-red-300" onClick={() => setViews((current) => current.filter((item) => item.id !== view.id))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button className="mt-4 inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-white/[0.08]" onClick={computeBudget}>
                {budgetBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Grid2X2 className="h-4 w-4" />}
                Verify Sheet Fit
              </button>
              {layoutBudget && (
                <div className={`mt-4 rounded-md border p-4 ${layoutBudget.fits ? healthClass('Green') : healthClass('Red')}`}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {layoutBudget.fits ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {layoutBudget.fits ? 'Layout fits selected sheet' : 'Layout exceeds selected sheet'}
                  </div>
                  <SheetPreview layoutBudget={layoutBudget} />
                </div>
              )}
              {budgetError && <p className="mt-3 rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{budgetError}</p>}
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-white">Asset Weight Analyzer</h3>
                <Activity className="h-5 w-5 text-cyan-300" />
              </div>
              <input ref={assetInputRef} className="hidden" type="file" multiple accept=".dwg,.obj,.dxf,.skp,.rvt" onChange={(event) => analyzeAssets(event.target.files)} />
              <button className="inline-flex items-center gap-2 rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-200" onClick={() => assetInputRef.current?.click()}>
                {assetBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Upload CAD Assets
              </button>
              {assetHealth && (
                <div className={`mt-4 rounded-md border p-4 ${healthClass(assetHealth.overall_health_color)}`}>
                  <p className="text-sm font-medium">{assetHealth.overall_health_status}</p>
                  <p className="mt-1 text-xs">Auto toggles: PURGE {String(assetHealth.auto_toggle_flags.deep_purge)}, OVERKILL {String(assetHealth.auto_toggle_flags.overkill)}</p>
                  <div className="mt-3 space-y-2">
                    {assetHealth.profiles.map((profile) => (
                      <div key={profile.file_name} className="rounded bg-black/20 px-3 py-2 text-xs">
                        <span className="font-medium">{profile.file_name}</span> · {profile.file_size_mb} MB · score {profile.estimated_density_score}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {assetError && <p className="mt-3 rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{assetError}</p>}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-white">Standard Line Weight Catalog</h3>
                <FileSearch className="h-5 w-5 text-cyan-300" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {lineWeights.map((item) => (
                  <div key={item.label} className="rounded-md border border-white/10 bg-[#11151b] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm font-medium text-white">
                        <span className={`h-2.5 w-8 rounded-full ${item.color}`} />
                        {item.label}
                      </span>
                      <span className="text-xs text-zinc-400">{item.range}</span>
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-5 text-zinc-500">{item.commands}</pre>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-white">Focus Hub Widget</h3>
                <Clock3 className="h-5 w-5 text-cyan-300" />
              </div>
              <div className="rounded-md border border-white/10 bg-[#11151b] p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-md border border-cyan-300/30 bg-cyan-300/10">
                    <Music2 className="h-5 w-5 text-cyan-300" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">OPM Studio Playlist</p>
                    <p className="text-xs text-zinc-500">Visual placeholder for a future embedded focus mix.</p>
                  </div>
                </div>
                <div className="mt-5 text-center">
                  <p className="font-mono text-4xl font-semibold text-white">{timerLabel}</p>
                  <div className="mt-4 flex justify-center gap-2">
                    <button className="rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-zinc-950" onClick={() => setTimerRunning((current) => !current)}>
                      {timerRunning ? 'Pause' : 'Start'}
                    </button>
                    <button className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200" onClick={() => { setTimerRunning(false); setSessionSeconds(25 * 60); }}>
                      Reset
                    </button>
                    <button className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200" onClick={() => setSessionSeconds((current) => current + 5 * 60)}>
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>
    </section>
  );
}
