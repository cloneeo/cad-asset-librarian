import React, { useRef, useState } from 'react';
import {
  Activity,
  ArrowRightLeft,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  FileSearch,
  Grid2X2,
  ListPlus,
  Loader2,
  Ruler,
  Trash2,
  UploadCloud,
  XCircle,
  Zap,
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
    vertex_count_estimate: number;
    estimated_density_score: number;
    status_rating: 'Green' | 'Yellow' | 'Red';
    internal_layers: string[];
    health_status: string;
    health_color: 'Green' | 'Yellow' | 'Red';
  }>;
};

type ScaleConverterMode = 'real-to-drawing' | 'drawing-to-real' | 'scale-to-scale' | 'find-scale';
type UnitSystem = 'metric' | 'imperial';

const paperSizes = [
  'A0', 'A1', 'A2', 'A3', 'A4', 'B0', 'B1', 'B2', 'B3', 'C0', 'C1', 'C2', 'C3',
  'Letter', 'Legal', 'Tabloid', 'Ledger', 'ANSI_A', 'ANSI_B', 'ANSI_C', 'ANSI_D',
  'ANSI_E', 'ARCH_A', 'ARCH_B', 'ARCH_C', 'ARCH_D', 'ARCH_E', 'ARCH_E1',
];

const lineWeights = [
  { label: 'Walls', range: '0.35-0.50mm', values: [0.35, 0.50], color: 'bg-cyan-300', layer: 'A-WALL' },
  { label: 'Cut Objects', range: '0.30-0.40mm', values: [0.30, 0.35, 0.40], color: 'bg-emerald-300', layer: 'A-CUT' },
  { label: 'Furniture', range: '0.18-0.25mm', values: [0.18, 0.20, 0.25], color: 'bg-sky-300', layer: 'A-FURN' },
  { label: 'Hatching', range: '0.13-0.18mm', values: [0.13, 0.15, 0.18], color: 'bg-zinc-300', layer: 'A-HATCH' },
  { label: 'Annotations', range: '0.18-0.25mm', values: [0.18, 0.20, 0.25], color: 'bg-violet-300', layer: 'A-ANNO' },
  { label: 'Hidden Lines', range: '0.09-0.13mm', values: [0.09, 0.13], color: 'bg-amber-300', layer: 'A-HIDN' },
];

type CompanionSuiteProps = {
  onSelectCommand?: (command: { label: string; command: string }) => void;
  onInjectOptimizationRules?: (rules: { deepPurge: boolean; purgeRegapps: boolean; overkill: boolean }) => void;
};

const scaleReferences = [
  { scale: '1:1 (Full Size)', ratio: '1:1', use: 'Detail drawings' },
  { scale: '1:2', ratio: '1:2', use: 'Large details' },
  { scale: '1:5', ratio: '1:5', use: 'Construction details' },
  { scale: '1:10', ratio: '1:10', use: 'Furniture and joinery details' },
  { scale: '1:20', ratio: '1:20', use: 'Room details and sections' },
  { scale: '1:25', ratio: '1:25', use: 'Room layouts' },
  { scale: '1:50', ratio: '1:50', use: 'Floor plans, sections, elevations' },
  { scale: '1:75', ratio: '1:75', use: 'Floor plans alternate' },
  { scale: '1:100', ratio: '1:100', use: 'Floor plans and small site plans' },
  { scale: '1:125', ratio: '1:125', use: 'Building overviews' },
  { scale: '1:200', ratio: '1:200', use: 'Site plans and building overviews' },
  { scale: '1:250', ratio: '1:250', use: 'Site plans' },
  { scale: '1:500', ratio: '1:500', use: 'Site plans and urban context' },
  { scale: '1:1000', ratio: '1:1000', use: 'Urban plans and mapping' },
  { scale: '1:1250', ratio: '1:1250', use: 'Urban planning' },
  { scale: '1:2500', ratio: '1:2500', use: 'City maps and master plans' },
  { scale: '1:5000', ratio: '1:5000', use: 'Regional planning' },
  { scale: '1:10000', ratio: '1:10000', use: 'Large area mapping' },
];

const commonScaleOptions = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000, 1250, 2500, 5000, 10000];

function inputClass() {
  return 'w-full rounded-md border border-white/10 bg-[#11151b] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10';
}

function healthClass(color?: string) {
  if (color === 'Red') return 'border-red-300/30 bg-red-300/10 text-red-100';
  if (color === 'Yellow') return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
  return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100';
}

function formatNumber(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function ScaleConverterCard() {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [mode, setMode] = useState<ScaleConverterMode>('real-to-drawing');
  const [realSize, setRealSize] = useState(5);
  const [drawingSize, setDrawingSize] = useState(50);
  const [sourceDrawingSize, setSourceDrawingSize] = useState(120);
  const [scaleFactor, setScaleFactor] = useState(100);
  const [targetScaleFactor, setTargetScaleFactor] = useState(50);

  const realUnit = unitSystem === 'metric' ? 'm' : 'ft';
  const drawingUnit = unitSystem === 'metric' ? 'mm' : 'in';
  const realToDrawing = unitSystem === 'metric'
    ? (realSize * 1000) / scaleFactor
    : (realSize * 12) / scaleFactor;
  const drawingToReal = unitSystem === 'metric'
    ? (drawingSize * scaleFactor) / 1000
    : (drawingSize * scaleFactor) / 12;
  const convertedScale = sourceDrawingSize * (scaleFactor / targetScaleFactor);
  const foundScale = unitSystem === 'metric'
    ? (realSize * 1000) / Math.max(drawingSize, 0.0001)
    : (realSize * 12) / Math.max(drawingSize, 0.0001);

  const resultText = {
    'real-to-drawing': `${formatNumber(realToDrawing)} ${drawingUnit}`,
    'drawing-to-real': `${formatNumber(drawingToReal)} ${realUnit}`,
    'scale-to-scale': `${formatNumber(convertedScale)} ${drawingUnit}`,
    'find-scale': `1:${Math.max(1, Math.round(foundScale))}`,
  }[mode];

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Architectural Scale Converter</h3>
          <p className="mt-1 text-xs text-zinc-500">Convert real sizes, drawing sizes, and scale ratios before plotting.</p>
        </div>
        <Calculator className="h-5 w-5 text-cyan-300" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['metric', 'imperial'] as UnitSystem[]).map((system) => (
          <button
            key={system}
            className={`rounded-md px-3 py-2 text-xs font-semibold transition ${unitSystem === system ? 'bg-cyan-300 text-zinc-950' : 'border border-white/10 bg-[#11151b] text-zinc-300 hover:bg-white/[0.06]'}`}
            onClick={() => setUnitSystem(system)}
          >
            {system === 'metric' ? 'Metric' : 'Imperial (US)'}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['real-to-drawing', 'Real to Drawing'],
          ['drawing-to-real', 'Drawing to Real'],
          ['scale-to-scale', 'Scale to Scale'],
          ['find-scale', 'Find Scale'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition ${mode === value ? 'bg-cyan-300 text-zinc-950' : 'border border-white/10 bg-[#11151b] text-zinc-300 hover:bg-white/[0.06]'}`}
            onClick={() => setMode(value as ScaleConverterMode)}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(mode === 'real-to-drawing' || mode === 'find-scale') && (
          <label className="space-y-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Real size ({realUnit})</span>
            <input className={inputClass()} type="number" min="0" value={realSize} onChange={(event) => setRealSize(Number(event.target.value))} />
          </label>
        )}

        {(mode === 'drawing-to-real' || mode === 'find-scale') && (
          <label className="space-y-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Drawing size ({drawingUnit})</span>
            <input className={inputClass()} type="number" min="0" value={drawingSize} onChange={(event) => setDrawingSize(Number(event.target.value))} />
          </label>
        )}

        {mode === 'scale-to-scale' && (
          <label className="space-y-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Current drawing size ({drawingUnit})</span>
            <input className={inputClass()} type="number" min="0" value={sourceDrawingSize} onChange={(event) => setSourceDrawingSize(Number(event.target.value))} />
          </label>
        )}

        {mode !== 'find-scale' && (
          <label className="space-y-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{mode === 'scale-to-scale' ? 'From scale' : 'Scale'}</span>
            <select className={inputClass()} value={scaleFactor} onChange={(event) => setScaleFactor(Number(event.target.value))}>
              {commonScaleOptions.map((scale) => <option key={scale} value={scale}>1:{scale}</option>)}
            </select>
          </label>
        )}

        {mode === 'scale-to-scale' && (
          <label className="space-y-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">To scale</span>
            <select className={inputClass()} value={targetScaleFactor} onChange={(event) => setTargetScaleFactor(Number(event.target.value))}>
              {commonScaleOptions.map((scale) => <option key={scale} value={scale}>1:{scale}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-4">
        <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">Result</p>
        <p className="mt-1 text-2xl font-semibold text-cyan-100">{resultText}</p>
        <p className="mt-2 text-xs text-cyan-100/70">
          {unitSystem === 'metric'
            ? 'Metric mode uses meters for real dimensions and millimeters for plotted drawings.'
            : 'Imperial mode uses feet for real dimensions and inches for plotted drawings.'}
        </p>
      </div>
    </div>
  );
}

function ScaleReferenceChart() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Scale Reference Chart</h3>
          <p className="mt-1 text-xs text-zinc-500">Common architectural plotting scales and their typical use cases.</p>
        </div>
        <Ruler className="h-5 w-5 text-cyan-300" />
      </div>
      <div className="max-h-[420px] overflow-y-auto rounded-md border border-white/10 [scrollbar-color:rgba(34,211,238,0.45)_rgba(255,255,255,0.06)] [scrollbar-width:thin]">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-[#17202b] text-white">
            <tr>
              <th className="border-b border-white/10 px-3 py-3 font-semibold">Scale</th>
              <th className="border-b border-white/10 px-3 py-3 font-semibold">Ratio</th>
              <th className="border-b border-white/10 px-3 py-3 font-semibold">Common Use</th>
            </tr>
          </thead>
          <tbody>
            {scaleReferences.map((row) => (
              <tr key={row.scale} className="border-b border-white/5 odd:bg-white/[0.02]">
                <td className="px-3 py-3 font-medium text-zinc-100">{row.scale}</td>
                <td className="px-3 py-3 font-mono text-cyan-200">{row.ratio}</td>
                <td className="px-3 py-3 text-zinc-400">{row.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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

export default function CompanionSuite({ onSelectCommand, onInjectOptimizationRules }: CompanionSuiteProps) {
  const assetInputRef = useRef<HTMLInputElement>(null);
  const [activeLineWeights, setActiveLineWeights] = useState<Record<string, number>>(
    Object.fromEntries(lineWeights.map((item) => [item.label, item.values[item.values.length - 1]]))
  );
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

  function getLineWeightCommand(label: string, layer: string) {
    const weight = activeLineWeights[label] ?? 0.25;
    return `_LWEIGHT\n${weight.toFixed(2)}\n${layer}`;
  }

  async function copyLineWeightCommand(event: React.MouseEvent, command: string) {
    event.stopPropagation();
    await navigator.clipboard?.writeText(command);
  }

  return (
    <section className="rounded-lg border border-white/10 bg-[#080a0d]">
      <div className="border-b border-white/10 px-5 py-4">
        <h3 className="text-base font-semibold text-white">Archi Companion Suite</h3>
        <p className="mt-1 text-xs text-zinc-500">Print budgeting, standards, asset health, and focus support.</p>
      </div>

      <div className="space-y-5 p-5">
        <ScaleConverterCard />

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
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
                <div className={`mt-4 rounded-lg border p-5 ${healthClass(assetHealth.overall_health_color)}`}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{assetHealth.overall_health_status}</p>
                      <p className="mt-1 text-xs opacity-75">Detected asset profiles ready for optimization</p>
                    </div>
                    {assetHealth.overall_health_color === 'Green' && <CheckCircle2 className="h-5 w-5 text-emerald-300" />}
                    {assetHealth.overall_health_color === 'Yellow' && <Activity className="h-5 w-5 text-amber-300" />}
                    {assetHealth.overall_health_color === 'Red' && <XCircle className="h-5 w-5 text-red-300" />}
                  </div>

                  <div className="space-y-3">
                    {assetHealth.profiles.map((profile, idx) => (
                      <div key={`${profile.file_name}-${idx}`} className="rounded-md border border-white/10 bg-black/20 p-3">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white">{profile.file_name}</p>
                            <p className="mt-1 text-xs text-zinc-400">{profile.extension} • {profile.file_size_mb} MB</p>
                          </div>
                          <div className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${
                            profile.status_rating === 'Green' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' :
                            profile.status_rating === 'Yellow' ? 'border-amber-300/30 bg-amber-300/10 text-amber-100' :
                            'border-red-300/30 bg-red-300/10 text-red-100'
                          }`}>
                            {profile.status_rating === 'Green' && <CheckCircle2 className="h-3 w-3" />}
                            {profile.status_rating === 'Yellow' && <Activity className="h-3 w-3" />}
                            {profile.status_rating === 'Red' && <XCircle className="h-3 w-3" />}
                            {profile.status_rating === 'Green' ? 'Low-Poly' : profile.status_rating === 'Yellow' ? 'Medium-Poly' : 'High-Poly Bloat'}
                          </div>
                        </div>

                        <div className="mb-3 grid grid-cols-2 gap-2">
                          <div className="rounded bg-black/30 p-2">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">File Size</p>
                            <p className={`mt-1 text-sm font-semibold ${
                              profile.file_size_mb < 5 ? 'text-emerald-200' :
                              profile.file_size_mb < 20 ? 'text-amber-200' :
                              'text-red-200'
                            }`}>{profile.file_size_mb} MB</p>
                          </div>
                          <div className="rounded bg-black/30 p-2">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Vertex Count</p>
                            <p className="mt-1 text-sm font-semibold text-cyan-200">{profile.vertex_count_estimate.toLocaleString()}</p>
                          </div>
                        </div>

                        {profile.internal_layers.length > 0 && (
                          <details className="rounded bg-black/30 p-2">
                            <summary className="cursor-pointer flex items-center justify-between text-xs font-medium text-zinc-300 hover:text-white">
                              <span>Internal Layers ({profile.internal_layers.length})</span>
                              <ChevronDown className="h-3 w-3" />
                            </summary>
                            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-2 [scrollbar-color:rgba(34,211,238,0.45)_rgba(255,255,255,0.06)] [scrollbar-width:thin]">
                              {profile.internal_layers.map((layer, lidx) => (
                                <div key={`${layer}-${lidx}`} className="text-[11px] text-zinc-400 font-mono">
                                  {layer}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        {(profile.status_rating === 'Yellow' || profile.status_rating === 'Red') && (
                          <button
                            onClick={() => onInjectOptimizationRules?.({ deepPurge: true, purgeRegapps: true, overkill: profile.status_rating === 'Red' })}
                            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-300/20"
                          >
                            <Zap className="h-3.5 w-3.5" />
                            Auto-Inject Optimization Rules
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {assetError && <p className="mt-3 rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{assetError}</p>}
            </div>
          </div>

          <div className="space-y-5">
            <ScaleReferenceChart />

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-white">Standard Line Weight Catalog</h3>
                <FileSearch className="h-5 w-5 text-cyan-300" />
              </div>
              <div className="grid max-h-[520px] gap-3 overflow-y-auto pr-2 sm:grid-cols-2 xl:grid-cols-1 [scrollbar-color:rgba(34,211,238,0.45)_rgba(255,255,255,0.06)] [scrollbar-width:thin]">
                {lineWeights.map((item) => {
                  const activeWeight = activeLineWeights[item.label] ?? item.values[0];
                  const command = getLineWeightCommand(item.label, item.layer);
                  const previewHeight = Math.max(1, Math.round(activeWeight * 8));

                  return (
                    <button
                      key={item.label}
                      className="rounded-md border border-white/10 bg-[#11151b] p-3 text-left transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
                      onClick={() => onSelectCommand?.({ label: `${item.label} line weight ${activeWeight.toFixed(2)}mm`, command })}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-sm font-medium text-white">
                            <span className={`h-2.5 w-8 rounded-full ${item.color}`} />
                            {item.label}
                          </span>
                          <div className="mt-2 h-4 rounded bg-black/20 px-1 py-1">
                            <div
                              className={`w-full ${item.color.replace('bg-', 'border-')}`}
                              style={{ borderBottomWidth: `${previewHeight}px` }}
                            />
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <select
                            className="rounded-md border border-white/10 bg-[#080a0d] px-2 py-1 text-xs text-zinc-200 outline-none focus:border-cyan-300/60"
                            value={activeWeight}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              event.stopPropagation();
                              setActiveLineWeights((current) => ({ ...current, [item.label]: Number(event.target.value) }));
                            }}
                          >
                            {item.values.map((value) => (
                              <option key={value} value={value}>{value.toFixed(2)}mm</option>
                            ))}
                          </select>
                          <button
                            className="rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-zinc-400 transition hover:border-cyan-300/40 hover:text-cyan-200"
                            onClick={(event) => copyLineWeightCommand(event, command)}
                            title="Copy AutoCAD command"
                          >
                            <Clipboard className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-xs text-zinc-500">{item.range}</span>
                        <span className="text-xs font-medium text-cyan-200">{activeWeight.toFixed(2)}mm active</span>
                      </div>
                      <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-5 text-zinc-500">{command}</pre>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
