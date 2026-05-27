import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polygon as LeafletPolygon, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import {
  BoxSelect,
  Building2,
  CheckCircle2,
  ClipboardList,
  Compass,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  FileUp,
  FolderOpen,
  Grid2X2,
  Home,
  ImagePlus,
  Info,
  LayoutGrid,
  Package,
  Ruler,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { ActiveTab } from '../types';
import BimStudioTab from './BimStudioTab';
import OptimizationPanel, { CommandRow } from './OptimizationPanel';

const SUPPORTED_CAD_EXTENSIONS = ['.dwg', '.dxf', '.obj'];
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

type DashboardProps = { activeTab: ActiveTab; setActiveTab: (tab: ActiveTab) => void };
type SelectedCadAsset = { name: string; extension: string; sizeMb: number };
type FloorPlanForm = { width: number; length: number; wall: number; columnW: number; columnD: number; rotationAngle: number };
type BudgetView = { id: string; label: string; width: number; height: number; scale: number; viewType?: string; priority?: number };
type ScaleLabState = {
  scaleForm: { realWidth: number; realLength: number; sheet: string; scale: number };
  board: { width: number; height: number };
  printSheet: string;
  lineWeights: Record<string, number>;
  converterMode: 'real-to-drawing' | 'drawing-to-real' | 'scale-to-scale' | 'find-scale';
  realSize: number;
  drawingSize: number;
  converterScale: number;
  targetScale: number;
  budgetViews: BudgetView[];
};
type ComplianceState = {
  lotArea: number;
  lotType: 'Inside' | 'Corner' | 'Through';
  zoning: 'R1' | 'R2' | 'R3';
  floors: number;
  footprintPercent: number;
  northAngle: number;
  projectShadow: boolean;
  selectedTile: { col: number; row: number } | null;
  material: 'Ceramic' | 'Marble' | 'Concrete';
  tile: {
    width: number;
    length: number;
    size: number;
    waste: number;
    grout: number;
    cost: number;
    laborPerSqm: number;
    adhesivePerSqm: number;
    roomShape: 'Rectangle' | 'L-shape' | 'Corridor' | 'Custom';
    pattern: 'Straight grid' | 'Running bond' | 'Diagonal' | 'Checkerboard' | 'Herringbone';
    orientation: number;
    startPoint: 'Center' | 'Corner' | 'Doorway aligned';
    groutColor: string;
  };
  targetMonth: string;
  apertureHeight: number;
};
type ArchiVaultProjectState = {
  version: 1;
  activeTab: ActiveTab;
  assetVault: { selectedCadAsset: SelectedCadAsset | null };
  floorPlan: { form: FloorPlanForm; spacings: number[] };
  scaleLab: ScaleLabState;
  compliance: ComplianceState;
  automation: { commands: CommandRow[] };
  studio: { note: string };
};

const tabs: Array<{ id: ActiveTab; label: string; icon: React.ElementType }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'vault', label: 'Asset Vault', icon: Search },
  { id: 'planning', label: 'Planning Lab', icon: Grid2X2 },
  { id: 'site', label: 'Site Analysis', icon: Compass },
  { id: 'compliance', label: 'Code & Compliance', icon: ShieldCheck },
  { id: 'materials', label: 'Materials & Cost', icon: Package },
  { id: 'plots', label: 'Plot & Sheets', icon: LayoutGrid },
  { id: 'automation', label: 'Automation Tools', icon: FileCode2 },
  { id: 'render', label: 'Render Studio', icon: Building2 },
  { id: 'reports', label: 'Reports & Projects', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const defaultCommands: CommandRow[] = [
  { id: 'units-mm', label: 'Set units to millimeters', command: '_UNITS\n2\n3\n1\n0', enabled: true },
  { id: 'regen-all', label: 'Regenerate drawing cache', command: '_REGENALL', enabled: true },
];

const scaleRows = [
  ['1:1 (Full Size)', '1:1', 'Detail drawings'],
  ['1:2', '1:2', 'Large details'],
  ['1:5', '1:5', 'Construction details'],
  ['1:10', '1:10', 'Furniture and joinery details'],
  ['1:20', '1:20', 'Room details and sections'],
  ['1:25', '1:25', 'Room layouts'],
  ['1:50', '1:50', 'Floor plans, sections, elevations'],
  ['1:75', '1:75', 'Floor plan alternate'],
  ['1:100', '1:100', 'Floor plans and small site plans'],
  ['1:200', '1:200', 'Site plans'],
  ['1:500', '1:500', 'Master plans'],
  ['1:1000', '1:1000', 'Urban/site context'],
];

const scaleReferenceDetails = [
  { scale: 20, label: '1:20', use: 'Room details / interior details', type: 'Room Detail', sheet: 'A3/A2', detail: 'High detail', notes: 'Excellent for dimensions and materials, but needs more sheet space.', tags: ['Good for detail drawing', 'Too detailed for A4'] },
  { scale: 25, label: '1:25', use: 'Room layouts and enlarged plans', type: 'Interior Detail', sheet: 'A3/A2', detail: 'High detail', notes: 'Good compromise for room-level furniture and joinery.', tags: ['Good for A2', 'Readable dimensions'] },
  { scale: 50, label: '1:50', use: 'Floor plans, sections, elevations', type: 'Floor Plan', sheet: 'A2/A1', detail: 'Standard architectural scale', notes: 'Best general-purpose scale for plates with labels and dimensions.', tags: ['Best for A1', 'Good for A2'] },
  { scale: 75, label: '1:75', use: 'Compact floor plans and alternates', type: 'Floor Plan', sheet: 'A2/A1', detail: 'Moderate detail', notes: 'Useful when 1:50 is too large but labels still need readability.', tags: ['Good for A1', 'Presentation friendly'] },
  { scale: 100, label: '1:100', use: 'Floor plans and small site plans', type: 'Floor Plan', sheet: 'A1/A0', detail: 'Presentation board scale', notes: 'Good for boards; leave space for labels, dimensions, and title block.', tags: ['Best for A1', 'Good for board'] },
  { scale: 200, label: '1:200', use: 'Site plans', type: 'Site Plan', sheet: 'A1/A0', detail: 'Less detail, more context', notes: 'Good for building footprint and site relationships, not interior labels.', tags: ['Good for site plan', 'Not ideal for room dimensions'] },
  { scale: 500, label: '1:500', use: 'Master plans', type: 'Master Plan', sheet: 'A1/A0', detail: 'Large site coverage', notes: 'Use for massing, zoning, roads, open space, and site structure.', tags: ['Good for master plan', 'Context scale'] },
  { scale: 1000, label: '1:1000', use: 'Urban/site context', type: 'Urban Context', sheet: 'A1/A0', detail: 'Context only', notes: 'Not for detailed plans; use for surrounding blocks and access patterns.', tags: ['Urban context', 'Not ideal for dimensions'] },
];

const scalePresets = [
  { name: 'Floor Plan Board', type: 'Floor Plan', sheet: 'A1', scale: 100, width: 18, height: 12, unit: 'meters', note: 'Good for presentation boards with labels and dimensions.' },
  { name: 'Section/Elevation Set', type: 'Section', sheet: 'A1', scale: 100, width: 18, height: 8, unit: 'meters', note: 'Keeps elevations readable while leaving caption space.' },
  { name: 'Interior Detail Sheet', type: 'Interior Detail', sheet: 'A2', scale: 25, width: 5, height: 4, unit: 'meters', note: 'Larger scale for joinery, fixtures, and material notes.' },
  { name: 'Site Analysis Sheet', type: 'Site Plan', sheet: 'A1', scale: 200, width: 60, height: 45, unit: 'meters', note: 'Balances building footprint with site context.' },
  { name: 'Master Plan Board', type: 'Master Plan', sheet: 'A0', scale: 500, width: 180, height: 120, unit: 'meters', note: 'Shows circulation, massing, and zones across a large site.' },
  { name: 'Urban Context Map', type: 'Urban Context', sheet: 'A0', scale: 1000, width: 500, height: 350, unit: 'meters', note: 'For context only, not detailed dimensions.' },
];

const paperSizes = [
  { name: 'A0', width: 1189, height: 841 },
  { name: 'A1', width: 841, height: 594 },
  { name: 'A2', width: 594, height: 420 },
  { name: 'A3', width: 420, height: 297 },
  { name: 'A4', width: 297, height: 210 },
  { name: 'A5', width: 210, height: 148 },
  { name: 'B0', width: 1414, height: 1000 },
  { name: 'B1', width: 1000, height: 707 },
  { name: 'B2', width: 707, height: 500 },
  { name: 'B3', width: 500, height: 353 },
  { name: 'B4', width: 353, height: 250 },
  { name: 'C0', width: 1297, height: 917 },
  { name: 'C1', width: 917, height: 648 },
  { name: 'C2', width: 648, height: 458 },
  { name: 'C3', width: 458, height: 324 },
  { name: 'C4', width: 324, height: 229 },
  { name: 'Letter', width: 279, height: 216 },
  { name: 'Legal', width: 356, height: 216 },
  { name: 'Tabloid', width: 432, height: 279 },
  { name: 'Ledger', width: 432, height: 279 },
  { name: 'ANSI A', width: 279, height: 216 },
  { name: 'ANSI B', width: 432, height: 279 },
  { name: 'ANSI C', width: 559, height: 432 },
  { name: 'ANSI D', width: 864, height: 559 },
  { name: 'ANSI E', width: 1118, height: 864 },
  { name: 'ARCH A', width: 305, height: 229 },
  { name: 'ARCH B', width: 457, height: 305 },
  { name: 'ARCH C', width: 610, height: 457 },
  { name: 'ARCH D', width: 914, height: 610 },
  { name: 'ARCH E', width: 1219, height: 914 },
  { name: 'ARCH E1', width: 1067, height: 762 },
];

const lineWeightSteps = [0.05, 0.09, 0.13, 0.15, 0.18, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50, 0.53, 0.60, 0.70, 0.80];

const lineWeightPresets = [
  { name: 'Cut Lines', active: 0.50, min: 0.50, max: 0.50, layer: 'A-WALL-CUT', color: 1, usage: 'Section cut walls', style: 'Heavy cut line' },
  { name: 'Object Lines', active: 0.35, min: 0.30, max: 0.40, layer: 'A-WALL', color: 7, usage: 'Visible walls and primary outlines', style: 'Main object line' },
  { name: 'Wall Edges', active: 0.30, min: 0.25, max: 0.35, layer: 'A-WALL', color: 7, usage: 'Wall edges and secondary outlines', style: 'Medium wall edge' },
  { name: 'Furniture', active: 0.25, min: 0.18, max: 0.25, layer: 'A-FURN', color: 4, usage: 'Furniture and loose objects', style: 'Light object line' },
  { name: 'Door Swing', active: 0.18, min: 0.13, max: 0.18, layer: 'A-DOOR', color: 2, usage: 'Door leaves and swing arcs', style: 'Thin movement line' },
  { name: 'Hatching', active: 0.13, min: 0.09, max: 0.15, layer: 'A-HATCH', color: 8, usage: 'Hatching and poche background', style: 'Light background detail' },
  { name: 'Grid Lines', active: 0.13, min: 0.09, max: 0.15, layer: 'A-GRID', color: 6, usage: 'Structural grid and datum lines', style: 'Grid reference' },
  { name: 'Dimensions', active: 0.13, min: 0.09, max: 0.15, layer: 'A-DIMS', color: 3, usage: 'Dimensions and leaders', style: 'Annotation line' },
  { name: 'Annotations', active: 0.18, min: 0.13, max: 0.20, layer: 'A-TEXT', color: 3, usage: 'Text notes and tags', style: 'Readable annotation' },
  { name: 'Hidden Lines', active: 0.09, min: 0.05, max: 0.13, layer: 'A-HIDDEN', color: 9, usage: 'Overhead/hidden objects', style: 'Hidden light line' },
  { name: 'Center Lines', active: 0.09, min: 0.05, max: 0.13, layer: 'A-CENTER', color: 9, usage: 'Center marks and axes', style: 'Centerline reference' },
];

const monthProfiles = [
  { key: 'january', label: 'January (Winter Solstice Cycle - Low Sun Angle)', angle: 52, group: 'low' },
  { key: 'february', label: 'February (Early Spring Transition - Mid-Low Angle)', angle: 60, group: 'mid' },
  { key: 'march', label: 'March (Vernal Equinox Cycle - Neutral Angle)', angle: 68, group: 'mid' },
  { key: 'april', label: 'April (Dry Season Ascent - Rising Sun Angle)', angle: 76, group: 'mid' },
  { key: 'may', label: 'May (Peak Dry Season - High Sun Angle)', angle: 82, group: 'high' },
  { key: 'june', label: 'June (Summer Solstice Peak - Maximum High Sun)', angle: 78, group: 'high' },
  { key: 'july', label: 'July (Monsoon Solstice Split - High Sun Angle)', angle: 80, group: 'high' },
  { key: 'august', label: 'August (Late Summer Transition - Mid-High Angle)', angle: 74, group: 'mid' },
  { key: 'september', label: 'September (Autumnal Equinox Cycle - Neutral Angle)', angle: 68, group: 'mid' },
  { key: 'october', label: 'October (Late Rain Transition - Mid-Low Angle)', angle: 61, group: 'mid' },
  { key: 'november', label: 'November (Winter Solstice Ascent - Low Sun Angle)', angle: 54, group: 'low' },
  { key: 'december', label: 'December (Amihan Season - Low Sun Angle)', angle: 49, group: 'low' },
];

const materialStyles: Record<ComplianceState['material'], { grid: string; fill: string; pattern: string }> = {
  Ceramic: {
    grid: 'rgba(34,211,238,0.42)',
    fill: 'rgba(34,211,238,0.12)',
    pattern: 'linear-gradient(135deg, rgba(34,211,238,0.10) 25%, transparent 25%, transparent 50%, rgba(34,211,238,0.10) 50%, rgba(34,211,238,0.10) 75%, transparent 75%, transparent)',
  },
  Marble: {
    grid: 'rgba(216,180,254,0.48)',
    fill: 'rgba(216,180,254,0.11)',
    pattern: 'linear-gradient(120deg, rgba(216,180,254,0.18), transparent 38%, rgba(255,255,255,0.10) 42%, transparent 47%, rgba(216,180,254,0.10))',
  },
  Concrete: {
    grid: 'rgba(161,161,170,0.48)',
    fill: 'rgba(161,161,170,0.12)',
    pattern: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.12) 1px, transparent 1px), radial-gradient(circle at 70% 65%, rgba(255,255,255,0.08) 1px, transparent 1px)',
  },
};

const zoningPresets: Record<ComplianceState['zoning'], { label: string; maxCoverage: number; maxFar: number; openSpace: number; setback: string; parking: string; helper: string }> = {
  R1: {
    label: 'R1 - Low density residential',
    maxCoverage: 0.6,
    maxFar: 1.5,
    openSpace: 0.4,
    setback: 'Front 4.5m, side 2.0m, rear 2.0m study placeholder',
    parking: 'Estimate 1 slot per dwelling unit placeholder',
    helper: 'Best for detached or low-density residential studies. Keep more open space and lower massing.',
  },
  R2: {
    label: 'R2 - Medium density residential',
    maxCoverage: 0.65,
    maxFar: 2.0,
    openSpace: 0.35,
    setback: 'Front 3.0m, side 2.0m, rear 2.0m study placeholder',
    parking: 'Estimate 1 slot per dwelling or 100sqm GFA placeholder',
    helper: 'Useful for townhouses, small apartments, and compact student planning studies.',
  },
  R3: {
    label: 'R3 - Higher density residential',
    maxCoverage: 0.7,
    maxFar: 3.0,
    openSpace: 0.3,
    setback: 'Front 3.0m, side 1.5m, rear 2.0m study placeholder',
    parking: 'Estimate 1 slot per 75sqm GFA placeholder',
    helper: 'Allows denser massing, but daylight, ventilation, parking, and open-space quality need more care.',
  },
};

function inputClass() {
  return 'w-full rounded-md border border-white/10 bg-[#11151b] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10';
}

function buttonClass(variant: 'primary' | 'secondary' = 'primary') {
  return variant === 'primary'
    ? 'inline-flex items-center justify-center gap-2 rounded-md bg-cyan-400 px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300'
    : 'inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <span className="ml-1 grid h-4 w-4 cursor-help place-items-center rounded-full border border-cyan-300/30 text-[10px] font-bold text-cyan-200">?</span>
      <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-56 -translate-x-1/2 rounded-md border border-white/10 bg-[#080a0d] p-2 text-xs leading-5 text-zinc-200 shadow-xl group-hover:block">
        {text}
      </span>
    </span>
  );
}

function AdvancedToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-white/[0.08]">
      {open ? 'Hide Advanced Settings' : 'Show Advanced Options'}
    </button>
  );
}

function ComplianceScorecard({
  openPercent,
  builtPercent,
  openSpace,
  builtArea,
  far,
  grossFloorArea,
}: {
  openPercent: number;
  builtPercent: number;
  openSpace: number;
  builtArea: number;
  far: number;
  grossFloorArea: number;
}) {
  return (
    <div className="mt-4 rounded-md border border-white/10 bg-[#11151b] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Compliance Scorecard</p>
          <p className="mt-1 text-sm font-semibold text-white">Open Space vs. Built-up Area</p>
        </div>
        <span className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 font-mono text-xs text-cyan-100">FAR {far.toFixed(2)}</span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full border border-white/10 bg-[#080a0d]">
        <div className="h-full bg-emerald-300" style={{ width: `${openPercent}%` }} />
        <div className="-mt-3 h-full bg-cyan-300/70" style={{ marginLeft: `${openPercent}%`, width: `${builtPercent}%` }} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <div className="rounded border border-emerald-300/20 bg-emerald-300/10 p-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-100/70">Open Space</p>
          <p className="text-sm font-semibold text-emerald-50">{openSpace.toFixed(1)} sqm</p>
        </div>
        <div className="rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-100/70">Built-up Area</p>
          <p className="text-sm font-semibold text-cyan-50">{builtArea.toFixed(1)} sqm</p>
        </div>
        <div className="rounded border border-white/10 bg-black/20 p-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Footprint</p>
          <p className="text-sm font-semibold text-white">{builtPercent.toFixed(1)}%</p>
        </div>
        <div className="rounded border border-white/10 bg-black/20 p-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">GFA</p>
          <p className="text-sm font-semibold text-white">{grossFloorArea.toFixed(1)} sqm</p>
        </div>
      </div>
    </div>
  );
}

function PageIntro({ title, subtitle, breadcrumb }: { title: string; subtitle: string; breadcrumb: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">{breadcrumb}</p>
      <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">{subtitle}</p>
    </div>
  );
}

function SubNav<T extends string>({ items, active, onSelect }: { items: readonly T[]; active: T; onSelect: (item: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
      {items.map((item) => (
        <button key={item} type="button" className={`rounded-md border px-3 py-2 text-sm font-medium transition ${active === item ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100' : 'border-white/10 bg-[#11151b] text-zinc-400 hover:text-white'}`} onClick={() => onSelect(item)}>
          {item}
        </button>
      ))}
    </div>
  );
}

function fileExtension(fileName: string) {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index).toLowerCase() : '';
}

function downloadText(fileName: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadSimplePdf(fileName: string, title: string, lines: string[]) {
  const safeLines = [title, '', ...lines].map((line) => line.replace(/[()\\]/g, ' '));
  const textObjects = safeLines.map((line, index) => `BT /F1 10 Tf 42 ${780 - index * 16} Td (${line}) Tj ET`).join('\n');
  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length ${textObjects.length} >> stream
${textObjects}
endstream endobj
xref
0 6
0000000000 65535 f 
trailer << /Root 1 0 R /Size 6 >>
startxref
0
%%EOF`;
  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function logWorkflow(actionType: string, resultSummary: string, warningsCount: number, filePath = 'browser-session') {
  const entry = {
    id: crypto.randomUUID(),
    action_type: actionType,
    file_path: filePath,
    result_summary: resultSummary,
    warnings_count: warningsCount,
    created_at: new Date().toISOString(),
  };
  const existing = JSON.parse(localStorage.getItem('archivault_workflow_logs') ?? '[]') as typeof entry[];
  localStorage.setItem('archivault_workflow_logs', JSON.stringify([entry, ...existing].slice(0, 100), null, 2));
  void fetch(`${API_BASE}/api/v1/workflow/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => undefined);
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function BoardAutoLayoutPlanner() {
  const [board, setBoard] = useState({
    size: 'A1',
    orientation: 'Landscape',
    title: 'Community Learning Hub',
    plans: 1,
    elevations: 2,
    sections: 1,
    renders: 2,
    diagrams: 2,
    concept: true,
    titleBlock: true,
  });
  const [generatedAt, setGeneratedAt] = useState('');
  const selected = paperSizes.find((paper) => paper.name === board.size) ?? paperSizes[1];
  const isLandscape = board.orientation === 'Landscape';
  const width = isLandscape ? Math.max(selected.width, selected.height) : Math.min(selected.width, selected.height);
  const height = isLandscape ? Math.min(selected.width, selected.height) : Math.max(selected.width, selected.height);
  const contentCount = board.plans + board.elevations + board.sections + board.renders + board.diagrams + (board.concept ? 1 : 0);
  const whiteSpace = Math.max(4, 32 - contentCount * 3);
  const balanceScore = Math.max(45, Math.min(98, 100 - Math.abs(board.renders + board.diagrams - board.plans - board.elevations - board.sections) * 7 - Math.max(0, contentCount - 8) * 4));
  type BoardZone = { label: string; x: number; y: number; w: number; h: number; tone: string; note: string };
  const zones = useMemo<BoardZone[]>(() => {
    const renderWidth = board.renders >= 3 ? 27 : 22;
    const baseZones: BoardZone[] = [
      { label: 'Title', x: 4, y: 4, w: board.titleBlock ? 48 : 58, h: 10, tone: 'border-cyan-300/50 bg-cyan-300/10', note: 'Project title and identity' },
      { label: 'Floor Plan', x: 4, y: 40, w: 40, h: board.plans > 1 ? 34 : 42, tone: 'border-emerald-300/50 bg-emerald-300/10', note: `${board.plans} plan view${board.plans === 1 ? '' : 's'}` },
      { label: 'Elevations', x: 47, y: 40, w: 24, h: 17, tone: 'border-sky-300/50 bg-sky-300/10', note: `${board.elevations} elevation view${board.elevations === 1 ? '' : 's'}` },
      { label: 'Sections', x: 47, y: 60, w: 24, h: 17, tone: 'border-violet-300/50 bg-violet-300/10', note: `${board.sections} section cut${board.sections === 1 ? '' : 's'}` },
      { label: 'Renders', x: 74, y: 18, w: renderWidth, h: board.renders >= 3 ? 56 : 43, tone: 'border-amber-300/50 bg-amber-300/10', note: `${board.renders} render anchor${board.renders === 1 ? '' : 's'}` },
      { label: 'Details', x: 74, y: board.renders >= 3 ? 78 : 64, w: renderWidth, h: 16, tone: 'border-white/30 bg-white/[0.04]', note: 'Detail/callout strip' },
      { label: 'Text Block', x: 4, y: 82, w: 55, h: 12, tone: 'border-zinc-300/30 bg-zinc-300/10', note: 'Captions and notes' },
    ];
    if (board.concept) {
      baseZones.push({ label: 'Concept', x: 4, y: 17, w: board.diagrams > 0 ? 26 : 34, h: 20, tone: 'border-lime-300/50 bg-lime-300/10', note: 'Design concept' });
    }
    if (board.diagrams > 0) {
      baseZones.push({ label: 'Site Analysis', x: board.concept ? 33 : 4, y: 17, w: board.concept ? 23 : 32, h: 20, tone: 'border-fuchsia-300/50 bg-fuchsia-300/10', note: `${board.diagrams} diagram${board.diagrams === 1 ? '' : 's'}` });
    }
    return baseZones;
  }, [board.concept, board.diagrams, board.elevations, board.plans, board.renders, board.sections, board.titleBlock]);
  const hierarchy = [
    `${board.title || 'Project title'} as first read`,
    `${board.plans} plan${board.plans === 1 ? '' : 's'} as the technical anchor`,
    `${board.renders} render${board.renders === 1 ? '' : 's'} for visual impact`,
    `${board.elevations + board.sections} elevation/section view${board.elevations + board.sections === 1 ? '' : 's'} for verification`,
  ];
  const guide = [
    `Board: ${board.size} ${board.orientation} (${width} x ${height} mm)`,
    generatedAt ? `Generated: ${generatedAt}` : 'Generated: not yet generated in this session',
    `Hierarchy: title and concept first, then floor plans, then elevations/sections, with renders as visual anchors.`,
    `Scale notes: keep floor plans at the largest consistent scale that fits; use smaller scale only for site/context diagrams.`,
    `White space warning: ${whiteSpace < 10 ? 'crowded board, reduce text or combine diagrams' : 'healthy negative space for presentation clarity'}.`,
    `Visual balance score: ${balanceScore}/100`,
    '',
    'Placement zones:',
    ...zones.map((zone, index) => `${index + 1}. ${zone.label}: ${zone.note}`),
  ].join('\n');
  return (
    <section className="grid gap-5 xl:grid-cols-[0.8fr_1fr]">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-base font-semibold text-white">Presentation Board Auto Layout Planner</h3>
        <p className="mt-1 text-sm text-zinc-400">Choose board contents and generate a balanced plate composition.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="Board Size"><select className={inputClass()} value={board.size} onChange={(e) => setBoard({ ...board, size: e.target.value })}>{['A0', 'A1', 'A2', 'A3'].map((size) => <option key={size}>{size}</option>)}</select></Field>
          <Field label="Orientation"><select className={inputClass()} value={board.orientation} onChange={(e) => setBoard({ ...board, orientation: e.target.value })}><option>Landscape</option><option>Portrait</option></select></Field>
          <Field label="Project Title"><input className={inputClass()} value={board.title} onChange={(e) => setBoard({ ...board, title: e.target.value })} /></Field>
          {[
            ['plans', 'Floor Plans'],
            ['elevations', 'Elevations'],
            ['sections', 'Sections'],
            ['renders', 'Renders'],
            ['diagrams', 'Diagrams'],
          ].map(([key, label]) => <div key={key}><Field label={label}><input className={inputClass()} type="number" value={board[key as keyof typeof board] as number} onChange={(e) => setBoard({ ...board, [key]: Number(e.target.value) })} /></Field></div>)}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border border-white/10 bg-[#11151b] p-3 text-sm text-zinc-200"><input type="checkbox" checked={board.concept} onChange={() => setBoard({ ...board, concept: !board.concept })} className="accent-cyan-300" />Include design concept text</label>
          <label className="flex items-center gap-2 rounded-md border border-white/10 bg-[#11151b] p-3 text-sm text-zinc-200"><input type="checkbox" checked={board.titleBlock} onChange={() => setBoard({ ...board, titleBlock: !board.titleBlock })} className="accent-cyan-300" />Include title block</label>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button className={buttonClass()} onClick={() => setGeneratedAt(new Date().toLocaleTimeString())}>Generate Board Layout</button>
          <button className={buttonClass('secondary')} onClick={() => downloadText('ArchiVault_Board_Layout_Guide.txt', guide)}>Download Layout Guide</button>
        </div>
        {generatedAt && (
          <div className="mt-4 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-50">
            Layout generated at {generatedAt}. The board grid, hierarchy, white-space note, and downloadable guide now match the current inputs.
          </div>
        )}
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="text-base font-semibold text-white">Suggested Board Grid</h3><p className="mt-1 text-xs text-zinc-500">{board.title} · balance {balanceScore}/100 · white space {whiteSpace}%</p></div>
          <span className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 font-mono text-xs text-cyan-100">{width} x {height}</span>
        </div>
        <div className="mt-5 aspect-[1.414/1] rounded-md border border-cyan-300/30 bg-[#080a0d] p-3">
          <div className="relative h-full w-full rounded-sm border border-white/10 bg-[#11151b]">
            {zones.map((zone, index) => (
              <div key={zone.label} className={`absolute rounded border p-1.5 text-[10px] font-semibold text-white ${zone.tone}`} style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` }}>
                <span className="mr-1 text-cyan-100">{index + 1}</span>{zone.label}
                <span className="mt-1 block text-[9px] font-normal leading-3 text-zinc-300">{zone.note}</span>
              </div>
            ))}
            {board.titleBlock && <div className="absolute bottom-2 right-2 h-10 w-28 rounded border border-amber-300/60 bg-amber-300/10 p-1 text-[9px] text-amber-100">Title Block</div>}
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded border border-white/10 bg-[#11151b] p-3"><p className="text-[10px] uppercase text-zinc-500">Hierarchy</p><p className="text-xs text-zinc-200">Plans first, renders as anchors</p></div>
          <div className="rounded border border-white/10 bg-[#11151b] p-3"><p className="text-[10px] uppercase text-zinc-500">Scale Notes</p><p className="text-xs text-zinc-200">One scale family per row</p></div>
          <div className={`rounded border p-3 ${whiteSpace < 10 ? 'border-amber-300/30 bg-amber-300/10' : 'border-emerald-300/30 bg-emerald-300/10'}`}><p className="text-[10px] uppercase text-zinc-300">White Space</p><p className="text-xs text-zinc-100">{whiteSpace < 10 ? 'Crowded' : 'Balanced'}</p></div>
        </div>
        <div className="mt-4 rounded-md border border-white/10 bg-[#11151b] p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Recommended hierarchy</p>
          <ol className="mt-2 space-y-1 text-xs leading-5 text-zinc-300">
            {hierarchy.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </div>
      </div>
    </section>
  );
}

function StudentPlanningToolkit() {
  const [rooms, setRooms] = useState([{ name: 'Studio', width: 4, length: 5, qty: 1, level: 'Ground', category: 'Public' }, { name: 'Bedroom', width: 3, length: 3.5, qty: 2, level: 'Second', category: 'Private' }]);
  const [stair, setStair] = useState({ height: 3000, riser: 165, tread: 280, type: 'U-shaped', width: 1100 });
  const [vent, setVent] = useState({ width: 4, length: 5, height: 2.8, room: 'Bedroom', orientation: 'East', wind: 'Northeast', type: 'Cross ventilation' });
  const [material, setMaterial] = useState({ width: 4, length: 5, height: 2.8, type: 'Wall paint', waste: 10, unit: 1, coverage: 8 });
  const risers = Math.max(1, Math.round(stair.height / stair.riser));
  const actualRiser = stair.height / risers;
  const treads = Math.max(1, risers - 1);
  const totalRun = treads * stair.tread;
  const totalArea = rooms.reduce((sum, room) => sum + room.width * room.length * room.qty, 0);
  const materialBase = material.type === 'Wall paint' ? 2 * (material.width + material.length) * material.height : material.width * material.length;
  const materialUnits = Math.ceil((materialBase / Math.max(material.coverage, 0.1)) * (1 + material.waste / 100));
  const csv = ['Room,Width,Length,Quantity,Area Each,Total Area,Category,Floor Level', ...rooms.map((room) => `${room.name},${room.width},${room.length},${room.qty},${(room.width * room.length).toFixed(2)},${(room.width * room.length * room.qty).toFixed(2)},${room.category},${room.level}`)].join('\n');
  return (
    <section className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Bubble Diagram Planner</h3>
          <p className="mt-1 text-sm text-zinc-400">Organize spaces before making the floor plan.</p>
          <div className="mt-4 grid gap-3">
            {rooms.map((room, index) => (
              <div key={`${room.name}-${index}`} className="grid gap-2 rounded-md border border-white/10 bg-[#11151b] p-2 md:grid-cols-[1fr_0.6fr_0.6fr_0.5fr_0.8fr_0.8fr_auto]">
                <input className={inputClass()} value={room.name} onChange={(e) => setRooms((current) => current.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
                <input className={inputClass()} type="number" value={room.width} onChange={(e) => setRooms((current) => current.map((item, i) => i === index ? { ...item, width: Number(e.target.value) } : item))} />
                <input className={inputClass()} type="number" value={room.length} onChange={(e) => setRooms((current) => current.map((item, i) => i === index ? { ...item, length: Number(e.target.value) } : item))} />
                <input className={inputClass()} type="number" value={room.qty} onChange={(e) => setRooms((current) => current.map((item, i) => i === index ? { ...item, qty: Number(e.target.value) } : item))} />
                <select className={inputClass()} value={room.category} onChange={(e) => setRooms((current) => current.map((item, i) => i === index ? { ...item, category: e.target.value } : item))}>{['Public', 'Semi-public', 'Private', 'Service', 'Circulation', 'Outdoor'].map((item) => <option key={item}>{item}</option>)}</select>
                <input className={inputClass()} value={room.level} onChange={(e) => setRooms((current) => current.map((item, i) => i === index ? { ...item, level: e.target.value } : item))} />
                <button className="text-zinc-500 hover:text-red-300" onClick={() => setRooms((current) => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button className={`${buttonClass('secondary')} mt-3`} onClick={() => setRooms((current) => [...current, { name: 'New Space', width: 3, length: 3, qty: 1, level: 'Ground', category: 'Semi-public' }])}>Add Space</button>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-[#080a0d] p-4">
            <div className="relative h-56">
              {rooms.map((room, index) => {
                const palette = room.category === 'Private' ? 'bg-violet-300/25 border-violet-300/60' : room.category === 'Service' ? 'bg-amber-300/20 border-amber-300/60' : room.category === 'Public' ? 'bg-cyan-300/20 border-cyan-300/60' : 'bg-emerald-300/20 border-emerald-300/60';
                return <div key={`${room.name}-node`} className={`absolute grid place-items-center rounded-full border text-center text-[10px] font-semibold text-white ${palette}`} style={{ left: `${10 + (index % 4) * 22}%`, top: `${14 + Math.floor(index / 4) * 34}%`, width: `${Math.min(90, Math.max(54, room.width * room.length * 3))}px`, height: `${Math.min(90, Math.max(54, room.width * room.length * 3))}px` }}>{room.name}</div>;
              })}
              <div className="absolute inset-x-8 top-1/2 border-t border-dashed border-cyan-300/25" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Room Area Schedule Generator</h3>
          <div className="mt-4 max-h-72 overflow-auto rounded-md border border-white/10">
            <table className="w-full text-left text-xs"><tbody>{rooms.map((room) => <tr key={room.name} className="border-b border-white/5"><td className="p-2 text-white">{room.name}</td><td className="p-2 text-zinc-400">{room.width} x {room.length}</td><td className="p-2 text-zinc-400">{room.qty}</td><td className="p-2 font-mono text-cyan-200">{(room.width * room.length * room.qty).toFixed(2)} sqm</td><td className="p-2 text-zinc-500">{room.category}</td></tr>)}</tbody></table>
          </div>
          <p className="mt-3 text-sm font-semibold text-white">Total gross floor area: {totalArea.toFixed(2)} sqm</p>
          <div className="mt-3 flex flex-wrap gap-2"><button className={buttonClass('secondary')} onClick={() => downloadText('ArchiVault_Room_Area_Schedule.csv', csv)}>Export CSV</button><button className={buttonClass('secondary')} onClick={() => navigator.clipboard?.writeText(csv)}>Copy table for presentation board</button></div>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Stair Calculator</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{[['height', 'Floor-to-floor height'], ['riser', 'Preferred riser'], ['tread', 'Preferred tread'], ['width', 'Stair width']].map(([key, label]) => <div key={key}><Field label={label}><input className={inputClass()} type="number" value={stair[key as keyof typeof stair] as number} onChange={(e) => setStair({ ...stair, [key]: Number(e.target.value) })} /></Field></div>)}<Field label="Stair Type"><select className={inputClass()} value={stair.type} onChange={(e) => setStair({ ...stair, type: e.target.value })}><option>Straight</option><option>L-shaped</option><option>U-shaped</option></select></Field></div>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-50">{risers} risers · {actualRiser.toFixed(1)}mm actual riser · {treads} treads · {(totalRun / 1000).toFixed(2)}m total run</div>
          <p className="mt-3 text-xs leading-5 text-zinc-400">{actualRiser > 180 ? 'Comfort warning: riser is high.' : 'Riser is within a comfortable study range.'} Provide landing for long stair flights.</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Window and Ventilation Planner</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{[['width', 'Room width'], ['length', 'Room length'], ['height', 'Room height']].map(([key, label]) => <div key={key}><Field label={label}><input className={inputClass()} type="number" value={vent[key as keyof typeof vent] as number} onChange={(e) => setVent({ ...vent, [key]: Number(e.target.value) })} /></Field></div>)}<Field label="Orientation"><select className={inputClass()} value={vent.orientation} onChange={(e) => setVent({ ...vent, orientation: e.target.value })}>{['North', 'East', 'South', 'West'].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Wind Direction"><select className={inputClass()} value={vent.wind} onChange={(e) => setVent({ ...vent, wind: e.target.value })}><option>Northeast</option><option>Southwest</option><option>East</option><option>West</option></select></Field></div>
          <div className="mt-4 aspect-[1.4/1] rounded-md border border-cyan-300/20 bg-[#11151b] p-4"><div className="relative h-full border border-cyan-300/50"><div className="absolute left-0 top-1/3 h-10 w-1 bg-cyan-300" /><div className="absolute right-0 top-1/2 h-10 w-1 bg-cyan-300" /><div className="absolute left-6 top-1/2 w-[80%] border-t-2 border-dashed border-emerald-300" /></div></div>
          <p className="mt-3 text-xs leading-5 text-zinc-400">Recommended window wall: {vent.orientation}. Use opposite openings for cross ventilation from {vent.wind}. Add shade when west-facing heat gain is high.</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Material Quantity Estimator</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{[['width', 'Room width'], ['length', 'Room length'], ['height', 'Room height'], ['waste', 'Waste %'], ['coverage', 'Coverage/unit']].map(([key, label]) => <div key={key}><Field label={label}><input className={inputClass()} type="number" value={material[key as keyof typeof material] as number} onChange={(e) => setMaterial({ ...material, [key]: Number(e.target.value) })} /></Field></div>)}<Field label="Material Type"><select className={inputClass()} value={material.type} onChange={(e) => setMaterial({ ...material, type: e.target.value })}>{['Floor tiles', 'Wall paint', 'Ceiling boards', 'Concrete slab', 'CHB wall blocks', 'Plywood sheets'].map((item) => <option key={item}>{item}</option>)}</select></Field></div>
          <div className="mt-4 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm font-semibold text-emerald-50">Estimated total units: {materialUnits}</div>
          <p className="mt-3 text-xs leading-5 text-zinc-400">Includes {material.waste}% waste allowance. Round up when purchasing and verify supplier unit dimensions.</p>
        </div>
      </div>
    </section>
  );
}

type BubbleNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  borderColor: string;
  borderWidth: number;
  fontSize: number;
  fontColor: string;
  opacity: number;
  area: number;
  zone: string;
  shape: 'circle' | 'rounded' | 'square';
};

type BubbleConnection = {
  id: string;
  from: string;
  to: string;
  relationship: string;
  color: string;
  thickness: number;
  dashed: boolean;
  arrow: boolean;
  label: string;
};

function BubbleDiagramMaker() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('Residential Bubble Diagram');
  const [description, setDescription] = useState('Early zoning and adjacency study for an architecture plate.');
  const [tool, setTool] = useState<'select' | 'bubble' | 'connect'>('select');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [zoom, setZoom] = useState(100);
  const [selectedBubbleId, setSelectedBubbleId] = useState('living');
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [connectStartId, setConnectStartId] = useState('');
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [search, setSearch] = useState('');
  const [bubbleNotice, setBubbleNotice] = useState('');
  const [liveAdvisor, setLiveAdvisor] = useState(true);
  const [autoRelationshipLabels, setAutoRelationshipLabels] = useState(true);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [bubbles, setBubbles] = useState<BubbleNode[]>([
    { id: 'living', label: 'Living Room', x: 130, y: 120, width: 118, height: 118, color: '#67e8f9', borderColor: '#0891b2', borderWidth: 3, fontSize: 13, fontColor: '#082f49', opacity: 0.92, area: 24, zone: 'Public', shape: 'circle' },
    { id: 'kitchen', label: 'Kitchen', x: 360, y: 130, width: 92, height: 92, color: '#fbbf24', borderColor: '#b45309', borderWidth: 3, fontSize: 12, fontColor: '#451a03', opacity: 0.9, area: 12, zone: 'Service', shape: 'circle' },
    { id: 'bedroom', label: 'Bedroom', x: 230, y: 310, width: 104, height: 104, color: '#c4b5fd', borderColor: '#7c3aed', borderWidth: 3, fontSize: 12, fontColor: '#2e1065', opacity: 0.9, area: 14, zone: 'Private', shape: 'circle' },
    { id: 'corridor', label: 'Corridor', x: 520, y: 290, width: 82, height: 82, color: '#d4d4d8', borderColor: '#71717a', borderWidth: 2, fontSize: 11, fontColor: '#18181b', opacity: 0.86, area: 8, zone: 'Circulation', shape: 'circle' },
  ]);
  const [connections, setConnections] = useState<BubbleConnection[]>([
    { id: 'c1', from: 'living', to: 'kitchen', relationship: 'Must be near', color: '#0891b2', thickness: 4, dashed: false, arrow: false, label: 'near' },
    { id: 'c2', from: 'living', to: 'bedroom', relationship: 'Should be separated', color: '#f87171', thickness: 2, dashed: true, arrow: false, label: 'quiet' },
  ]);
  const roomPresets = ['Living Room', 'Dining', 'Kitchen', 'Bedroom', 'Toilet and Bath', 'Storage', 'Laundry', 'Office', 'Lobby', 'Corridor', 'Parking', 'Balcony', 'Classroom'];
  const visiblePresets = roomPresets.filter((preset) => preset.toLowerCase().includes(search.toLowerCase()));
  const zoneColors: Record<string, string> = { Public: '#67e8f9', 'Semi-private': '#86efac', Private: '#c4b5fd', Service: '#fbbf24', Circulation: '#d4d4d8', Outdoor: '#5eead4' };
  const quickSpacePresets: Record<string, { area: number; zone: string; color: string; border: string }> = {
    'Living Room': { area: 24, zone: 'Public', color: '#67e8f9', border: '#0891b2' },
    Dining: { area: 14, zone: 'Public', color: '#fde047', border: '#ca8a04' },
    Kitchen: { area: 12, zone: 'Service', color: '#fb923c', border: '#c2410c' },
    Bedroom: { area: 14, zone: 'Private', color: '#c4b5fd', border: '#7c3aed' },
    'Toilet and Bath': { area: 5, zone: 'Service', color: '#93c5fd', border: '#2563eb' },
    Storage: { area: 4, zone: 'Service', color: '#a1a1aa', border: '#52525b' },
    Laundry: { area: 6, zone: 'Service', color: '#5eead4', border: '#0f766e' },
    Office: { area: 10, zone: 'Semi-private', color: '#86efac', border: '#16a34a' },
    Lobby: { area: 12, zone: 'Public', color: '#67e8f9', border: '#0891b2' },
    Corridor: { area: 8, zone: 'Circulation', color: '#d4d4d8', border: '#71717a' },
    Parking: { area: 15, zone: 'Service', color: '#52525b', border: '#27272a' },
    Balcony: { area: 6, zone: 'Semi-private', color: '#99f6e4', border: '#0d9488' },
    Classroom: { area: 40, zone: 'Public', color: '#60a5fa', border: '#2563eb' },
  };
  const selectedBubble = bubbles.find((bubble) => bubble.id === selectedBubbleId);
  const selectedConnection = connections.find((connection) => connection.id === selectedConnectionId);
  const editorBg = 'bg-[#080a0d] text-white';
  const panelBg = 'bg-[#11151b] border-white/10';
  const canvasBg = 'bg-[linear-gradient(90deg,rgba(34,211,238,.085)_1px,transparent_1px),linear-gradient(rgba(34,211,238,.085)_1px,transparent_1px)] bg-[size:28px_28px]';

  function showBubbleNotice(message: string) {
    setBubbleNotice(message);
    window.setTimeout(() => setBubbleNotice(''), 2200);
  }

  function snapshot() {
    return JSON.stringify({ title, description, bubbles, connections });
  }

  function pushHistory() {
    setHistory((current) => [...current.slice(-18), snapshot()]);
    setFuture([]);
  }

  function updateBubble(id: string, patch: Partial<BubbleNode>) {
    setBubbles((current) => current.map((bubble) => bubble.id === id ? { ...bubble, ...patch } : bubble));
  }

  function updateConnection(id: string, patch: Partial<BubbleConnection>) {
    setConnections((current) => current.map((connection) => connection.id === id ? { ...connection, ...patch } : connection));
  }

  function safeRestore(serialized: string) {
    try {
      const parsed = JSON.parse(serialized);
      setTitle(typeof parsed.title === 'string' ? parsed.title : 'Bubble Diagram');
      setDescription(typeof parsed.description === 'string' ? parsed.description : '');
      setBubbles(Array.isArray(parsed.bubbles) ? parsed.bubbles : []);
      setConnections(Array.isArray(parsed.connections) ? parsed.connections : []);
      setSelectedBubbleId('');
      setSelectedConnectionId('');
      setConnectStartId('');
    } catch (error) {
      console.error('Bubble diagram restore failed', error);
      showBubbleNotice('Bubble Diagram failed to load. Saved data may be corrupted.');
    }
  }

  function handleToolChange(nextTool: 'select' | 'bubble' | 'connect') {
    if (nextTool === 'connect' && tool === 'connect') {
      setTool('select');
      setConnectStartId('');
      showBubbleNotice('Connection mode off.');
      return;
    }
    setTool(nextTool);
    setSelectedConnectionId('');
    if (nextTool !== 'connect') setConnectStartId('');
    if (nextTool === 'connect' && !selectedBubbleId) showBubbleNotice('Select first bubble to connect.');
    if (nextTool === 'bubble') showBubbleNotice('Bubble mode on. Click the canvas to place a bubble.');
  }

  function addBubble(label = 'New Space') {
    pushHistory();
    const id = crypto.randomUUID();
    const area = 12;
    const bubble: BubbleNode = { id, label, x: 180 + bubbles.length * 22, y: 140 + bubbles.length * 18, width: 92, height: 92, color: '#67e8f9', borderColor: '#0891b2', borderWidth: 3, fontSize: 12, fontColor: '#082f49', opacity: 0.92, area, zone: 'Public', shape: 'circle' };
    setBubbles((current) => [...current, bubble]);
    setSelectedBubbleId(id);
    setSelectedConnectionId('');
  }

  function handleAddQuickSpace(label: string) {
    pushHistory();
    const preset = quickSpacePresets[label] ?? { area: 10, zone: 'Semi-private', color: '#67e8f9', border: '#0891b2' };
    const id = crypto.randomUUID();
    const workspace = workspaceRef.current;
    const visibleX = workspace ? (workspace.scrollLeft + workspace.clientWidth / 2) / (zoom / 100) : 420;
    const visibleY = workspace ? (workspace.scrollTop + workspace.clientHeight / 2) / (zoom / 100) : 320;
    const size = Math.min(150, Math.max(70, preset.area * 4));
    let finalLabel = label;
    setBubbles((current) => {
      const sameNameCount = current.filter((bubble) => bubble.label === label || bubble.label.startsWith(`${label} `)).length;
      finalLabel = sameNameCount === 0 ? label : `${label} ${sameNameCount + 1}`;
      const offset = (current.length % 7) * 18;
      const bubble: BubbleNode = {
        id,
        label: finalLabel,
        x: Math.max(36, Math.min(1700, Math.round((visibleX - size / 2 + offset) / 12) * 12)),
        y: Math.max(36, Math.min(1000, Math.round((visibleY - size / 2 + offset) / 12) * 12)),
        width: size,
        height: size,
        color: preset.color,
        borderColor: preset.border,
        borderWidth: 3,
        fontSize: preset.area > 20 ? 13 : 12,
        fontColor: preset.color === '#52525b' ? '#f8fafc' : '#082f49',
        opacity: 0.92,
        area: preset.area,
        zone: preset.zone,
        shape: 'circle',
      };
      return [...current, bubble];
    });
    setSelectedBubbleId(id);
    setSelectedConnectionId('');
    setConnectStartId('');
    setTool('select');
    showBubbleNotice(`${finalLabel} bubble added.`);
  }

  function handleBubbleClick(id: string) {
    const clickedBubble = bubbles.find((bubble) => bubble.id === id);
    if (!clickedBubble) {
      showBubbleNotice('That bubble is no longer available.');
      return;
    }
    if (tool === 'connect') {
      if (!connectStartId) {
        setConnectStartId(id);
        setSelectedBubbleId(id);
        setSelectedConnectionId('');
        showBubbleNotice(`First bubble selected: ${clickedBubble.label}. Click another bubble.`);
      } else if (connectStartId !== id) {
        const firstBubble = bubbles.find((bubble) => bubble.id === connectStartId);
        if (!firstBubble) {
          setConnectStartId(id);
          showBubbleNotice('First bubble was missing. Select the first bubble again.');
          return;
        }
        const duplicate = connections.some((connection) => (connection.from === connectStartId && connection.to === id) || (connection.from === id && connection.to === connectStartId));
        if (duplicate) {
          setConnectStartId('');
          showBubbleNotice('Those bubbles are already connected.');
          return;
        }
        pushHistory();
        const connectionId = crypto.randomUUID();
        setConnections((current) => [...current, { id: connectionId, from: connectStartId, to: id, relationship: 'Should be near', color: '#0891b2', thickness: 2, dashed: false, arrow: false, label: 'near' }]);
        setConnectStartId('');
        setSelectedBubbleId('');
        setSelectedConnectionId(connectionId);
        showBubbleNotice(`${firstBubble.label} connected to ${clickedBubble.label}.`);
      } else {
        showBubbleNotice('Choose a different bubble for the second connection point.');
      }
      return;
    }
    setSelectedBubbleId(id);
    setSelectedConnectionId('');
  }

  function onCanvasClick(event: React.MouseEvent<HTMLDivElement>) {
    if (tool !== 'bubble') return;
    pushHistory();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const id = crypto.randomUUID();
    const x = ((event.clientX - rect.left) / (zoom / 100));
    const y = ((event.clientY - rect.top) / (zoom / 100));
    setBubbles((current) => [...current, { id, label: 'New Space', x: Math.round(x / 12) * 12, y: Math.round(y / 12) * 12, width: 92, height: 92, color: '#67e8f9', borderColor: '#0891b2', borderWidth: 3, fontSize: 12, fontColor: '#082f49', opacity: 0.92, area: 10, zone: 'Public', shape: 'circle' }]);
    setSelectedBubbleId(id);
    setTool('select');
    showBubbleNotice('New bubble added.');
  }

  function applyTemplate(kind: 'Residential' | 'Classroom' | 'Office') {
    pushHistory();
    const templateBubbles: Record<typeof kind, BubbleNode[]> = {
      Residential: [
        { id: 'entry', label: 'Entry', x: 70, y: 280, width: 78, height: 78, color: '#5eead4', borderColor: '#0f766e', borderWidth: 2, fontSize: 11, fontColor: '#042f2e', opacity: 0.92, area: 6, zone: 'Circulation', shape: 'circle' },
        { id: 'living-t', label: 'Living', x: 220, y: 200, width: 116, height: 116, color: '#67e8f9', borderColor: '#0891b2', borderWidth: 3, fontSize: 13, fontColor: '#082f49', opacity: 0.92, area: 24, zone: 'Public', shape: 'circle' },
        { id: 'dining-t', label: 'Dining', x: 410, y: 230, width: 96, height: 96, color: '#86efac', borderColor: '#16a34a', borderWidth: 2, fontSize: 12, fontColor: '#052e16', opacity: 0.92, area: 12, zone: 'Semi-private', shape: 'circle' },
        { id: 'kitchen-t', label: 'Kitchen', x: 570, y: 230, width: 94, height: 94, color: '#fbbf24', borderColor: '#b45309', borderWidth: 3, fontSize: 12, fontColor: '#451a03', opacity: 0.9, area: 12, zone: 'Service', shape: 'circle' },
        { id: 'bed-t', label: 'Bedroom', x: 380, y: 420, width: 106, height: 106, color: '#c4b5fd', borderColor: '#7c3aed', borderWidth: 3, fontSize: 12, fontColor: '#2e1065', opacity: 0.9, area: 14, zone: 'Private', shape: 'circle' },
      ],
      Classroom: [
        { id: 'lobby-t', label: 'Lobby', x: 120, y: 280, width: 88, height: 88, color: '#67e8f9', borderColor: '#0891b2', borderWidth: 3, fontSize: 12, fontColor: '#082f49', opacity: 0.92, area: 16, zone: 'Public', shape: 'circle' },
        { id: 'class-a', label: 'Classroom A', x: 320, y: 160, width: 130, height: 130, color: '#86efac', borderColor: '#16a34a', borderWidth: 3, fontSize: 12, fontColor: '#052e16', opacity: 0.92, area: 45, zone: 'Semi-private', shape: 'circle' },
        { id: 'class-b', label: 'Classroom B', x: 540, y: 160, width: 130, height: 130, color: '#86efac', borderColor: '#16a34a', borderWidth: 3, fontSize: 12, fontColor: '#052e16', opacity: 0.92, area: 45, zone: 'Semi-private', shape: 'circle' },
        { id: 'toilet-t', label: 'Toilet', x: 475, y: 390, width: 82, height: 82, color: '#fbbf24', borderColor: '#b45309', borderWidth: 2, fontSize: 11, fontColor: '#451a03', opacity: 0.92, area: 10, zone: 'Service', shape: 'circle' },
      ],
      Office: [
        { id: 'reception-t', label: 'Reception', x: 100, y: 270, width: 100, height: 100, color: '#67e8f9', borderColor: '#0891b2', borderWidth: 3, fontSize: 12, fontColor: '#082f49', opacity: 0.92, area: 18, zone: 'Public', shape: 'circle' },
        { id: 'work-t', label: 'Work Area', x: 320, y: 220, width: 138, height: 138, color: '#86efac', borderColor: '#16a34a', borderWidth: 3, fontSize: 13, fontColor: '#052e16', opacity: 0.92, area: 60, zone: 'Semi-private', shape: 'circle' },
        { id: 'meeting-t', label: 'Meeting', x: 570, y: 180, width: 108, height: 108, color: '#c4b5fd', borderColor: '#7c3aed', borderWidth: 3, fontSize: 12, fontColor: '#2e1065', opacity: 0.9, area: 20, zone: 'Private', shape: 'circle' },
        { id: 'storage-t', label: 'Storage', x: 580, y: 390, width: 76, height: 76, color: '#fbbf24', borderColor: '#b45309', borderWidth: 2, fontSize: 11, fontColor: '#451a03', opacity: 0.92, area: 8, zone: 'Service', shape: 'circle' },
      ],
    };
    const nextBubbles = templateBubbles[kind];
    setBubbles(nextBubbles);
    setConnections(nextBubbles.slice(1).map((bubble, index) => ({
      id: `template-link-${index}`,
      from: nextBubbles[0].id,
      to: bubble.id,
      relationship: index === 0 ? 'Must be near' : 'Should be near',
      color: '#0891b2',
      thickness: index === 0 ? 4 : 2,
      dashed: false,
      arrow: false,
      label: index === 0 ? 'primary' : 'near',
    })));
    setSelectedBubbleId(nextBubbles[0].id);
    setSelectedConnectionId('');
    setConnectStartId('');
    setTemplatesOpen(false);
    showBubbleNotice(`${kind} template loaded.`);
  }

  function moveBubble(event: React.MouseEvent<HTMLDivElement>) {
    if (!drag || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / (zoom / 100) - drag.dx) / 12) * 12;
    const y = Math.round(((event.clientY - rect.top) / (zoom / 100) - drag.dy) / 12) * 12;
    updateBubble(drag.id, { x: Math.max(0, x), y: Math.max(0, y) });
  }

  function centerWorkspace() {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    workspace.scrollTo({ left: Math.max(0, (workspace.scrollWidth - workspace.clientWidth) / 2), top: Math.max(0, (workspace.scrollHeight - workspace.clientHeight) / 2), behavior: 'smooth' });
  }

  function fitWorkspace() {
    setZoom(70);
    window.setTimeout(centerWorkspace, 40);
  }

  function fitContent() {
    if (!bubbles.length) {
      fitWorkspace();
      return;
    }
    const maxX = Math.max(...bubbles.map((bubble) => bubble.x + bubble.width));
    const maxY = Math.max(...bubbles.map((bubble) => bubble.y + bubble.height));
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const fitZoom = Math.max(45, Math.min(110, Math.floor(Math.min((workspace.clientWidth - 120) / Math.max(maxX, 1), (workspace.clientHeight - 120) / Math.max(maxY, 1)) * 100)));
    setZoom(fitZoom);
    window.setTimeout(() => workspace.scrollTo({ left: Math.max(0, (maxX * fitZoom / 100 - workspace.clientWidth) / 2), top: Math.max(0, (maxY * fitZoom / 100 - workspace.clientHeight) / 2), behavior: 'smooth' }), 40);
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) {
      showBubbleNotice('Nothing to undo.');
      return;
    }
    setFuture((current) => [snapshot(), ...current]);
    setHistory((current) => current.slice(0, -1));
    safeRestore(previous);
    showBubbleNotice('Undo applied.');
  }

  function redo() {
    const next = future[0];
    if (!next) {
      showBubbleNotice('Nothing to redo.');
      return;
    }
    setHistory((current) => [...current, snapshot()]);
    setFuture((current) => current.slice(1));
    safeRestore(next);
    showBubbleNotice('Redo applied.');
  }

  function saveDiagram() {
    localStorage.setItem('archivault_bubble_diagram', snapshot());
    logWorkflow('saved_bubble_diagram', `Saved ${title} with ${bubbles.length} bubbles.`, 0);
    showBubbleNotice('Diagram saved.');
  }

  function loadDiagram() {
    const saved = localStorage.getItem('archivault_bubble_diagram');
    if (!saved) {
      showBubbleNotice('No saved diagram found.');
      return;
    }
    pushHistory();
    safeRestore(saved);
    showBubbleNotice('Diagram loaded.');
  }

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConnectStartId('');
        setTool('select');
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedBubbleId) {
          pushHistory();
          setBubbles((current) => current.filter((bubble) => bubble.id !== selectedBubbleId));
          setConnections((current) => current.filter((connection) => connection.from !== selectedBubbleId && connection.to !== selectedBubbleId));
          setSelectedBubbleId('');
          setConnectStartId('');
          showBubbleNotice('Bubble deleted.');
        } else if (selectedConnectionId) {
          pushHistory();
          setConnections((current) => current.filter((connection) => connection.id !== selectedConnectionId));
          setSelectedConnectionId('');
          showBubbleNotice('Connection deleted.');
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedBubbleId, selectedConnectionId]);

  function buildSvg() {
    const lines = connections.map((connection) => {
      const from = bubbles.find((bubble) => bubble.id === connection.from);
      const to = bubbles.find((bubble) => bubble.id === connection.to);
      if (!from || !to) return '';
      return `<line x1="${from.x + from.width / 2}" y1="${from.y + from.height / 2}" x2="${to.x + to.width / 2}" y2="${to.y + to.height / 2}" stroke="${connection.color}" stroke-width="${connection.thickness}" ${connection.dashed ? 'stroke-dasharray="8 6"' : ''}/>`;
    }).join('');
    const nodes = bubbles.map((bubble) => {
      const shape = bubble.shape === 'circle'
        ? `<ellipse cx="${bubble.x + bubble.width / 2}" cy="${bubble.y + bubble.height / 2}" rx="${bubble.width / 2}" ry="${bubble.height / 2}" fill="${bubble.color}" stroke="${bubble.borderColor}" stroke-width="${bubble.borderWidth}" opacity="${bubble.opacity}"/>`
        : `<rect x="${bubble.x}" y="${bubble.y}" width="${bubble.width}" height="${bubble.height}" rx="${bubble.shape === 'rounded' ? 18 : 6}" fill="${bubble.color}" stroke="${bubble.borderColor}" stroke-width="${bubble.borderWidth}" opacity="${bubble.opacity}"/>`;
      return `<g>${shape}<text x="${bubble.x + bubble.width / 2}" y="${bubble.y + bubble.height / 2}" dominant-baseline="middle" text-anchor="middle" font-size="${bubble.fontSize}" fill="${bubble.fontColor}">${bubble.label}</text></g>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1100" viewBox="0 0 1800 1100"><rect width="1800" height="1100" fill="#080a0d"/>${lines}${nodes}</svg>`;
  }

  function exportSvg() {
    downloadText(`${title.replace(/[^\w]+/g, '_') || 'bubble_diagram'}.svg`, buildSvg());
    showBubbleNotice('SVG exported.');
  }

  function exportPng() {
    const svg = buildSvg();
    const image = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 760;
      const context = canvas.getContext('2d');
      context?.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      const link = document.createElement('a');
      link.download = `${title.replace(/[^\w]+/g, '_') || 'bubble_diagram'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showBubbleNotice('PNG exported.');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      showBubbleNotice('PNG export failed. Try SVG export instead.');
    };
    image.src = url;
  }

  function exportPdf() {
    downloadSimplePdf(`${title.replace(/[^\w]+/g, '_') || 'bubble_diagram'}.pdf`, title, [
      description,
      '',
      `Bubbles: ${bubbles.length}`,
      `Connections: ${connections.length}`,
      '',
      ...bubbles.map((bubble) => `${bubble.label} - ${bubble.area} sqm - ${bubble.zone}`),
      '',
      ...connections.map((connection) => {
        const from = bubbles.find((bubble) => bubble.id === connection.from)?.label ?? 'Missing space';
        const to = bubbles.find((bubble) => bubble.id === connection.to)?.label ?? 'Missing space';
        return `${from} to ${to}: ${connection.relationship}`;
      }),
    ]);
    showBubbleNotice('PDF exported.');
  }

  const hints = [
    bubbles.some((bubble) => bubble.label.toLowerCase().includes('kitchen')) && bubbles.some((bubble) => bubble.label.toLowerCase().includes('dining')) ? 'Kitchen should stay near Dining for efficient food service.' : '',
    bubbles.some((bubble) => bubble.zone === 'Private') && bubbles.some((bubble) => bubble.zone === 'Public') ? 'Bedrooms are usually separated from noisy public areas.' : '',
    bubbles.some((bubble) => bubble.zone === 'Circulation') ? '' : 'Circulation space may be missing.',
  ].filter(Boolean);
  const bubbleDistance = (a?: BubbleNode, b?: BubbleNode) => a && b ? Math.hypot((a.x + a.width / 2) - (b.x + b.width / 2), (a.y + a.height / 2) - (b.y + b.height / 2)) : 9999;
  function evaluateConnection(connection: BubbleConnection) {
    const from = bubbles.find((bubble) => bubble.id === connection.from);
    const to = bubbles.find((bubble) => bubble.id === connection.to);
    const distance = bubbleDistance(from, to);
    const publicPrivateConflict = Boolean(from && to && ((from.zone === 'Private' && to.zone === 'Public') || (from.zone === 'Public' && to.zone === 'Private')) && distance < 220);
    if (publicPrivateConflict) return { label: 'noise conflict', color: '#f87171', dashed: true, thickness: Math.max(2, connection.thickness) };
    if (connection.relationship === 'Must be near') return distance <= 260 ? { label: 'near', color: '#34d399', dashed: false, thickness: Math.max(4, connection.thickness) } : { label: 'too far', color: '#f59e0b', dashed: false, thickness: Math.max(3, connection.thickness) };
    if (connection.relationship === 'Should be near') return distance <= 450 ? { label: 'near', color: '#67e8f9', dashed: false, thickness: Math.max(2, connection.thickness) } : { label: 'too far', color: '#f59e0b', dashed: true, thickness: Math.max(2, connection.thickness) };
    if (connection.relationship === 'Must be separated') return distance < 260 ? { label: 'too close', color: '#ef4444', dashed: true, thickness: Math.max(3, connection.thickness) } : { label: 'separated', color: '#94a3b8', dashed: true, thickness: Math.max(2, connection.thickness) };
    if (connection.relationship === 'Should be separated') return distance < 190 ? { label: 'too close', color: '#f87171', dashed: true, thickness: Math.max(2, connection.thickness) } : { label: 'quiet', color: '#5eead4', dashed: true, thickness: Math.max(2, connection.thickness) };
    return { label: connection.label || 'neutral', color: connection.color, dashed: connection.dashed, thickness: connection.thickness };
  }
  const evaluatedConnections = useMemo(() => connections.map((connection) => ({ ...connection, live: evaluateConnection(connection) })), [connections, bubbles]);
  const designAdvisor = useMemo(() => {
    const comments: Array<{ tone: 'good' | 'warning' | 'critical' | 'tip'; text: string }> = [];
    const byLabel = (needle: string) => bubbles.find((bubble) => bubble.label.toLowerCase().includes(needle));
    const distance = (a?: BubbleNode, b?: BubbleNode) => a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 9999;
    const kitchen = byLabel('kitchen');
    const dining = byLabel('dining');
    const bedroom = byLabel('bedroom');
    const living = byLabel('living');
    const toilet = byLabel('toilet');
    const storage = byLabel('storage');
    const corridor = bubbles.find((bubble) => bubble.zone === 'Circulation' || bubble.label.toLowerCase().includes('corridor'));
    if (kitchen && dining && distance(kitchen, dining) > 280) comments.push({ tone: 'warning', text: 'Kitchen should be closer to Dining for better functional flow.' });
    if (bedroom && living && distance(bedroom, living) < 190) comments.push({ tone: 'warning', text: 'Bedroom is too close to noisy public spaces. Move it farther from Living Room.' });
    if (!corridor) comments.push({ tone: 'critical', text: 'Corridor or circulation space may be missing.' });
    if (toilet && toilet.zone === 'Public') comments.push({ tone: 'warning', text: 'Toilet and Bath should be accessible, but not treated as a main public zone.' });
    if (storage && kitchen && distance(storage, kitchen) < 260) comments.push({ tone: 'good', text: 'Storage is working well near service areas like Kitchen or Laundry.' });
    if (bubbles.filter((bubble) => bubble.zone === 'Private').length >= 2) comments.push({ tone: 'good', text: 'Your private zone is forming well. Keep bedrooms grouped together.' });
    if (living && dining && distance(living, dining) < 260) comments.push({ tone: 'good', text: 'Living Room and Dining work well as connected public spaces.' });
    connections.forEach((connection) => {
      const from = bubbles.find((bubble) => bubble.id === connection.from);
      const to = bubbles.find((bubble) => bubble.id === connection.to);
      const evaluation = evaluateConnection(connection);
      if (!from || !to) return;
      if (evaluation.label === 'too far') comments.push({ tone: 'warning', text: `${from.label} and ${to.label} are too far for a required adjacency.` });
      if (evaluation.label === 'too close') comments.push({ tone: 'critical', text: `${from.label} and ${to.label} are too close for a separation rule.` });
      if (evaluation.label === 'noise conflict') comments.push({ tone: 'critical', text: `${from.label} and ${to.label} may create a public/private noise conflict.` });
      if (evaluation.label === 'near') comments.push({ tone: 'good', text: `${from.label} and ${to.label} have a good adjacency distance.` });
    });
    if (connections.length < Math.max(1, bubbles.length - 2)) comments.push({ tone: 'tip', text: 'Add more connections so the relationship logic is clearer.' });
    const areas = bubbles.map((bubble) => bubble.area);
    if (areas.length && Math.max(...areas) / Math.max(1, Math.min(...areas)) > 8) comments.push({ tone: 'warning', text: 'Bubble sizes are very uneven. Check if small spaces are still readable.' });
    const penalty = comments.filter((comment) => comment.tone === 'critical').length * 22 + comments.filter((comment) => comment.tone === 'warning').length * 10 + Math.max(0, bubbles.length - connections.length - 1) * 3;
    const score = Math.max(0, Math.min(100, 92 - penalty + comments.filter((comment) => comment.tone === 'good').length * 4));
    const status = score >= 85 ? 'Strong layout' : score >= 70 ? 'Good but can improve' : score >= 50 ? 'Needs adjustment' : 'Poor planning flow';
    return { comments, score, status };
  }, [bubbles, connections]);

  return (
    <section className={`overflow-hidden rounded-xl border border-white/10 ${editorBg}`}>
      <div className="border-b border-white/10 p-4">
        <h2 className="text-xl font-bold">Bubble Diagram Maker & Tool</h2>
        <p className="mt-1 text-sm opacity-70">Create architectural bubble diagrams to visualize spatial relationships, plan zoning, and organize functional layouts.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-[0.7fr_1fr]">
          <input className="rounded-md border border-white/10 bg-[#11151b] px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/60" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Diagram title" />
          <input className="rounded-md border border-white/10 bg-[#11151b] px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/60" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Diagram description" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#0d1117] p-2.5">
        {[
          ['bubble', 'Bubble'],
          ['connect', 'Connect'],
          ['select', 'Select'],
        ].map(([mode, label]) => <button key={mode} type="button" className={tool === mode ? buttonClass() : buttonClass('secondary')} onClick={() => handleToolChange(mode as typeof tool)}>{label}</button>)}
        <button type="button" className={templatesOpen ? buttonClass() : buttonClass('secondary')} onClick={() => { setTemplatesOpen((value) => !value); showBubbleNotice(templatesOpen ? 'Templates closed.' : 'Choose a template from the left panel.'); }}>Templates</button>
        <button type="button" className={buttonClass('secondary')} onClick={saveDiagram}>Save</button>
        <button type="button" className={buttonClass('secondary')} onClick={loadDiagram}>Load</button>
        <button type="button" className={buttonClass('secondary')} onClick={exportSvg}>SVG export</button>
        <button type="button" className={buttonClass('secondary')} onClick={exportPng}>PNG export</button>
        <button type="button" className={buttonClass('secondary')} onClick={exportPdf}>PDF export</button>
        <button type="button" className={buttonClass('secondary')} onClick={() => { setZoom((value) => Math.max(25, value - 10)); showBubbleNotice('Zoomed out.'); }}>Zoom out</button>
        <span className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 font-mono text-xs text-cyan-100">{zoom}%</span>
        <button type="button" className={buttonClass('secondary')} onClick={() => { setZoom((value) => Math.min(300, value + 10)); showBubbleNotice('Zoomed in.'); }}>Zoom in</button>
        <button type="button" className={buttonClass('secondary')} onClick={() => { setZoom(100); showBubbleNotice('Zoom reset to 100%.'); }}>Reset zoom</button>
        <button type="button" className={buttonClass('secondary')} onClick={() => { fitWorkspace(); showBubbleNotice('Workspace fitted.'); }}>Fit workspace</button>
        <button type="button" className={buttonClass('secondary')} onClick={() => { fitContent(); showBubbleNotice(bubbles.length ? 'Content fitted.' : 'No bubbles yet. Workspace fitted.'); }}>Fit content</button>
        <button type="button" className={buttonClass('secondary')} onClick={() => { centerWorkspace(); showBubbleNotice('Canvas centered.'); }}>Center canvas</button>
        <button type="button" className={theme === 'dark' ? buttonClass() : buttonClass('secondary')} onClick={() => { setTheme((value) => value === 'dark' ? 'light' : 'dark'); showBubbleNotice('Theme toggled.'); }}>Dark mode</button>
        <label className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-200"><input type="checkbox" checked={liveAdvisor} onChange={() => setLiveAdvisor((value) => !value)} className="accent-cyan-300" />Live Advisor</label>
        <label className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-200"><input type="checkbox" checked={autoRelationshipLabels} onChange={() => setAutoRelationshipLabels((value) => !value)} className="accent-cyan-300" />Auto Relationship Labels</label>
        <button type="button" className={buttonClass('secondary')} onClick={undo}>Undo</button>
        <button type="button" className={buttonClass('secondary')} onClick={redo}>Redo</button>
        <button type="button" className={buttonClass('secondary')} onClick={() => { if (!window.confirm('Clear all bubbles and connections?')) return; pushHistory(); setBubbles([]); setConnections([]); setSelectedBubbleId(''); setSelectedConnectionId(''); setConnectStartId(''); showBubbleNotice('Canvas cleared.'); }}>Clear canvas</button>
      </div>
      <div className="grid min-h-[760px] lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <aside className={`relative z-20 pointer-events-auto border-r p-4 ${panelBg}`}>
          <input className="w-full rounded-md border border-white/10 bg-[#080a0d] px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/60" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bubbles" />
          {templatesOpen && <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] opacity-50">Templates</p>
            <div className="mt-3 grid gap-2">
              {(['Residential', 'Classroom', 'Office'] as const).map((template) => <button key={template} type="button" className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-left text-xs font-semibold text-cyan-100 hover:bg-cyan-400/20" onClick={() => applyTemplate(template)}>{template} template</button>)}
            </div>
          </>}
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] opacity-50">Quick spaces</p>
          <div className="relative z-30 mt-3 max-h-[390px] space-y-2 overflow-y-auto pr-1">{visiblePresets.map((preset) => <button key={preset} type="button" className="block w-full cursor-pointer rounded-md border border-cyan-300/15 bg-cyan-400/10 px-3 py-2 text-left text-xs text-zinc-100 transition hover:border-cyan-300/45 hover:bg-cyan-400/20 active:scale-[0.98]" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); handleAddQuickSpace(preset); }}>{preset}</button>)}</div>
          {bubbleNotice && <div className="mt-3 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-2 text-xs text-emerald-50">{bubbleNotice}</div>}
        </aside>
        <main ref={workspaceRef} className="h-[760px] overflow-auto bg-[#05070a] p-4">
          <div
            ref={canvasRef}
            className={`relative h-[1100px] w-[1800px] rounded-lg border border-white/10 ${canvasBg}`}
            onClick={onCanvasClick}
            onMouseMove={moveBubble}
            onMouseUp={() => setDrag(null)}
            onMouseLeave={() => setDrag(null)}
          >
            <div className="absolute inset-0 origin-top-left" style={{ transform: `scale(${zoom / 100})`, transformOrigin: '0 0' }}>
            <svg className="absolute left-0 top-0 h-[1100px] w-[1800px]">
              <defs>
                <marker id="bubble-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#0891b2" />
                </marker>
              </defs>
              {evaluatedConnections.map((connection) => {
                const from = bubbles.find((bubble) => bubble.id === connection.from);
                const to = bubbles.find((bubble) => bubble.id === connection.to);
                if (!from || !to) return null;
                const selected = selectedConnectionId === connection.id;
                const x1 = from.x + from.width / 2;
                const y1 = from.y + from.height / 2;
                const x2 = to.x + to.width / 2;
                const y2 = to.y + to.height / 2;
                return (
                  <g key={connection.id} onClick={(event) => { event.stopPropagation(); setSelectedConnectionId(connection.id); setSelectedBubbleId(''); }}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={selected ? '#2563eb' : autoRelationshipLabels ? connection.live.color : connection.color} strokeWidth={selected ? (autoRelationshipLabels ? connection.live.thickness : connection.thickness) + 2 : autoRelationshipLabels ? connection.live.thickness : connection.thickness} strokeDasharray={(autoRelationshipLabels ? connection.live.dashed : connection.dashed) ? '8 6' : undefined} markerEnd={connection.arrow ? 'url(#bubble-arrow)' : undefined} className="cursor-pointer" />
                    {(autoRelationshipLabels ? connection.live.label : connection.label) && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" fontSize="12" fill={selected ? '#2563eb' : autoRelationshipLabels ? connection.live.color : connection.color} className="pointer-events-none font-semibold">{autoRelationshipLabels ? connection.live.label : connection.label}</text>}
                  </g>
                );
              })}
            </svg>
            {tool === 'bubble' && <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-800 dark:text-cyan-100">Click an empty grid area to place a new bubble.</div>}
            {tool === 'connect' && <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-100">{connectStartId ? 'Now click the second bubble to connect it.' : 'Click the first bubble to start a connection.'}</div>}
            {bubbles.map((bubble) => {
              const selected = selectedBubbleId === bubble.id;
              return (
                <button
                  key={bubble.id}
                  className={`absolute grid place-items-center text-center font-semibold shadow-sm transition ${selected ? 'ring-4 ring-blue-400/40' : ''}`}
                  style={{ left: bubble.x, top: bubble.y, width: bubble.width, height: bubble.height, backgroundColor: bubble.color, borderColor: bubble.borderColor, borderWidth: bubble.borderWidth, color: bubble.fontColor, fontSize: bubble.fontSize, opacity: bubble.opacity, borderRadius: bubble.shape === 'circle' ? '999px' : bubble.shape === 'rounded' ? '18px' : '6px' }}
                  onClick={(event) => { event.stopPropagation(); handleBubbleClick(bubble.id); }}
                  type="button"
                  onMouseDown={(event) => { if (tool !== 'select') return; pushHistory(); setDrag({ id: bubble.id, dx: event.nativeEvent.offsetX, dy: event.nativeEvent.offsetY }); }}
                >
                  <span>{bubble.label}<br /><span className="text-[10px] opacity-75">{bubble.area} sqm</span></span>
                </button>
              );
            })}
            </div>
          </div>
        </main>
        <aside className={`max-h-[760px] overflow-y-auto border-l p-4 ${panelBg}`}>
          <div className="flex gap-2"><button type="button" className={selectedBubble ? buttonClass() : buttonClass('secondary')} onClick={() => { if (selectedBubble) showBubbleNotice('Bubble properties active.'); }}>Bubble</button><button type="button" className={selectedConnection ? buttonClass() : buttonClass('secondary')} onClick={() => { if (selectedConnection) showBubbleNotice('Connection properties active.'); }}>Connection</button></div>
          {!selectedBubble && !selectedConnection && <div className="mt-4 rounded-md border border-white/10 bg-black/10 p-3 text-sm leading-6 opacity-70">Select a bubble or connector to edit its live properties. Changes update on the canvas immediately.</div>}
          {selectedBubble && (
            <div className="mt-4 space-y-3">
              <Field label="Bubble text"><input className={inputClass()} value={selectedBubble.label} onChange={(event) => updateBubble(selectedBubble.id, { label: event.target.value })} /></Field>
              <Field label="Area, sqm"><input className={inputClass()} type="number" value={selectedBubble.area} onChange={(event) => updateBubble(selectedBubble.id, { area: Number(event.target.value) })} /></Field>
              <Field label="Zone tag"><select className={inputClass()} value={selectedBubble.zone} onChange={(event) => updateBubble(selectedBubble.id, { zone: event.target.value, color: zoneColors[event.target.value] ?? selectedBubble.color })}>{Object.keys(zoneColors).map((zone) => <option key={zone}>{zone}</option>)}</select></Field>
              <Field label="Shape"><select className={inputClass()} value={selectedBubble.shape} onChange={(event) => updateBubble(selectedBubble.id, { shape: event.target.value as BubbleNode['shape'] })}><option value="circle">Circle</option><option value="rounded">Rounded rectangle</option><option value="square">Square</option></select></Field>
              <Field label="Fill color"><input className={inputClass()} type="color" value={selectedBubble.color} onChange={(event) => updateBubble(selectedBubble.id, { color: event.target.value })} /></Field>
              <div className="flex flex-wrap gap-2">{Object.values(zoneColors).map((color) => <button key={color} type="button" className="h-7 w-7 rounded-full border border-black/20" style={{ backgroundColor: color }} onClick={() => updateBubble(selectedBubble.id, { color })} />)}</div>
              <Field label="Width"><input type="range" min="56" max="220" value={selectedBubble.width} onChange={(event) => updateBubble(selectedBubble.id, { width: Number(event.target.value), height: selectedBubble.shape === 'circle' ? Number(event.target.value) : selectedBubble.height })} className="w-full accent-cyan-400" /></Field>
              <Field label="Height"><input type="range" min="56" max="180" value={selectedBubble.height} onChange={(event) => updateBubble(selectedBubble.id, { height: Number(event.target.value) })} className="w-full accent-cyan-400" /></Field>
              <Field label="Border thickness"><input type="range" min="1" max="8" value={selectedBubble.borderWidth} onChange={(event) => updateBubble(selectedBubble.id, { borderWidth: Number(event.target.value) })} className="w-full accent-cyan-400" /></Field>
              <Field label="Border color"><input className={inputClass()} type="color" value={selectedBubble.borderColor} onChange={(event) => updateBubble(selectedBubble.id, { borderColor: event.target.value })} /></Field>
              <Field label="Font size"><input type="range" min="9" max="22" value={selectedBubble.fontSize} onChange={(event) => updateBubble(selectedBubble.id, { fontSize: Number(event.target.value) })} className="w-full accent-cyan-400" /></Field>
              <Field label="Font color"><input className={inputClass()} type="color" value={selectedBubble.fontColor} onChange={(event) => updateBubble(selectedBubble.id, { fontColor: event.target.value })} /></Field>
              <Field label="Opacity"><input type="range" min="0.3" max="1" step="0.05" value={selectedBubble.opacity} onChange={(event) => updateBubble(selectedBubble.id, { opacity: Number(event.target.value) })} className="w-full accent-cyan-400" /></Field>
              <button type="button" className={buttonClass('secondary')} onClick={() => { pushHistory(); setBubbles((current) => current.filter((bubble) => bubble.id !== selectedBubble.id)); setConnections((current) => current.filter((connection) => connection.from !== selectedBubble.id && connection.to !== selectedBubble.id)); setSelectedBubbleId(''); setConnectStartId(''); showBubbleNotice('Bubble deleted.'); }}>Delete bubble</button>
            </div>
          )}
          {selectedConnection && (
            <div className="mt-4 space-y-3">
              <Field label="Relationship"><select className={inputClass()} value={selectedConnection.relationship} onChange={(event) => updateConnection(selectedConnection.id, { relationship: event.target.value, dashed: event.target.value.includes('separated'), color: event.target.value.includes('separated') ? '#f87171' : '#0891b2', thickness: event.target.value === 'Must be near' ? 4 : 2 })}>{['Must be near', 'Should be near', 'Neutral', 'Should be separated', 'Must be separated'].map((item) => <option key={item}>{item}</option>)}</select></Field>
              <Field label="Line color"><input className={inputClass()} type="color" value={selectedConnection.color} onChange={(event) => updateConnection(selectedConnection.id, { color: event.target.value })} /></Field>
              <Field label="Line thickness"><input type="range" min="1" max="8" value={selectedConnection.thickness} onChange={(event) => updateConnection(selectedConnection.id, { thickness: Number(event.target.value) })} className="w-full accent-cyan-400" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedConnection.dashed} onChange={() => updateConnection(selectedConnection.id, { dashed: !selectedConnection.dashed })} />Dashed line</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedConnection.arrow} onChange={() => updateConnection(selectedConnection.id, { arrow: !selectedConnection.arrow })} />Arrow</label>
              <Field label="Connection label"><input className={inputClass()} value={selectedConnection.label} onChange={(event) => updateConnection(selectedConnection.id, { label: event.target.value })} /></Field>
              <button type="button" className={buttonClass('secondary')} onClick={() => { pushHistory(); setConnections((current) => current.filter((connection) => connection.id !== selectedConnection.id)); setSelectedConnectionId(''); showBubbleNotice('Connection deleted.'); }}>Delete connection</button>
            </div>
          )}
          <div className="mt-5 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-950 dark:text-amber-100">
            {hints[0] ?? 'Tip: add public spaces near entry, keep private spaces quieter, and include circulation.'}
          </div>
          {liveAdvisor && <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-white">Design Comments</h4>
              <span className={`rounded px-2 py-1 text-[10px] font-bold ${designAdvisor.score >= 85 ? 'bg-emerald-300 text-emerald-950' : designAdvisor.score >= 70 ? 'bg-cyan-300 text-cyan-950' : designAdvisor.score >= 50 ? 'bg-amber-300 text-amber-950' : 'bg-red-300 text-red-950'}`}>{designAdvisor.score}/100</span>
            </div>
            <p className="mt-1 text-xs text-cyan-100">{designAdvisor.status}</p>
            <div className="mt-3 space-y-2">
              {designAdvisor.comments.slice(0, showMoreSuggestions ? 12 : 5).map((comment) => <div key={comment.text} className={`rounded border p-2 text-xs leading-5 ${comment.tone === 'good' ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-50' : comment.tone === 'critical' ? 'border-red-300/30 bg-red-300/10 text-red-100' : comment.tone === 'warning' ? 'border-amber-300/30 bg-amber-300/10 text-amber-100' : 'border-cyan-300/25 bg-cyan-300/10 text-cyan-50'}`}>{comment.tone === 'good' ? '[OK]' : comment.tone === 'critical' ? '[FIX]' : comment.tone === 'warning' ? '[CHECK]' : '[TIP]'} {comment.text}</div>)}
            </div>
            {designAdvisor.comments.length > 5 && <button className={`${buttonClass('secondary')} mt-3 w-full`} onClick={() => setShowMoreSuggestions((value) => !value)}>{showMoreSuggestions ? 'Hide extra suggestions' : 'More suggestions'}</button>}
          </div>}
        </aside>
      </div>
    </section>
  );
}

function LiveArchitectureToolkit() {
  const [spaces, setSpaces] = useState([
    { name: 'Living Room', area: 24, zone: 'Public', priority: 5, adjacency: 'Kitchen', relation: 'Must be near' },
    { name: 'Kitchen', area: 12, zone: 'Service', priority: 4, adjacency: 'Dining', relation: 'Should be near' },
    { name: 'Bedroom', area: 14, zone: 'Private', priority: 4, adjacency: 'Toilet and Bath', relation: 'Should be near' },
    { name: 'Corridor', area: 8, zone: 'Circulation', priority: 3, adjacency: 'Living Room', relation: 'Neutral' },
  ]);
  const [stair, setStair] = useState({ type: 'Straight', height: 3000, riser: 165, tread: 280, width: 1100, landing: 1200, floors: 2, maxRiser: 180, minTread: 250, minWidth: 900, minLanding: 900 });
  const [vent, setVent] = useState({ width: 4, length: 5, height: 2.8, windowW: 1.2, windowH: 1.2, windows: 2, orientation: 'East', operable: 70, cross: true });
  const [material, setMaterial] = useState({
    category: 'Tiles',
    type: 'Ceramic tile',
    preset: 'Bedroom floor',
    unitSystem: 'Metric',
    length: 4.2,
    width: 3.6,
    height: 2.8,
    thickness: 100,
    wallHeight: 2.8,
    openings: 1.8,
    waste: 10,
    tileW: 600,
    tileL: 600,
    grout: 3,
    tilesPerBox: 4,
    pattern: 'Straight',
    coats: 2,
    coverage: 10,
    boardW: 1.2,
    boardL: 2.4,
    roofSlope: 1.15,
    overlap: 0.15,
    sheetW: 0.8,
    sheetL: 2.4,
    rebarDiameter: 10,
    barLength: 6,
    rebarSpacing: 200,
    layers: 1,
    lap: 10,
    laborEnabled: true,
    laborRate: 250,
    deliveryEnabled: false,
    deliveryRate: 750,
  });
  const [prices, setPrices] = useState([
    { name: 'cement bag', unit: 'bag', price: 280, source: 'Sample data', updated: '2026-05-01' },
    { name: '4-inch hollow blocks', unit: 'pc', price: 18, source: 'Sample data', updated: '2026-05-01' },
    { name: '10mm rebar', unit: '6m length', price: 165, source: 'Sample data', updated: '2026-05-01' },
    { name: 'tile box', unit: 'box', price: 750, source: 'Sample data', updated: '2026-05-01' },
    { name: 'paint gallon', unit: 'gal', price: 980, source: 'Sample data', updated: '2026-05-01' },
    { name: 'ready-mix concrete', unit: 'cu.m', price: 5200, source: 'Sample data', updated: '2026-05-01' },
    { name: 'sand', unit: 'cu.m', price: 1450, source: 'Sample data', updated: '2026-05-01' },
    { name: 'gravel', unit: 'cu.m', price: 1650, source: 'Sample data', updated: '2026-05-01' },
    { name: 'plywood board', unit: 'board', price: 780, source: 'Sample data', updated: '2026-05-01' },
    { name: 'ceiling board', unit: 'board', price: 620, source: 'Sample data', updated: '2026-05-01' },
    { name: 'roofing sheet', unit: 'sheet', price: 540, source: 'Sample data', updated: '2026-05-01' },
    { name: 'tile adhesive', unit: 'bag', price: 320, source: 'Sample data', updated: '2026-05-01' },
    { name: 'grout', unit: 'kg', price: 95, source: 'Sample data', updated: '2026-05-01' },
    { name: 'steel framing', unit: 'm', price: 180, source: 'Sample data', updated: '2026-05-01' },
  ]);
  const [plot, setPlot] = useState({ dwgFolder: 'C:/Projects/Plate01/DWG', outputFolder: 'C:/Projects/Plate01/PDF', sheet: 'A1', scale: '1:100', style: 'monochrome.ctb', orientation: 'Landscape', mode: 'One PDF per drawing', dwgCount: 12 });
  const [renderAssets, setRenderAssets] = useState([
    { name: 'wood_floor_dark.jpg', category: 'Texture', subcategory: 'Wood material', fileType: '.jpg', size: 18, resolution: '4096x4096', polygons: 0, compatibility: 'SketchUp, Enscape, V-Ray', style: 'modern', license: 'Free educational', source: 'ambientCG', tags: 'wood, floor, dark, texture', favorite: true, missing: false, collection: 'Materials Library', notes: 'Check scale before render.' },
    { name: 'tropical_tree_highpoly.skp', category: 'Tree', subcategory: 'Vegetation', fileType: '.skp', size: 86, resolution: 'thumbnail pending', polygons: 180000, compatibility: 'SketchUp, Lumion', style: 'tropical', license: 'Free with attribution', source: '3D Warehouse', tags: 'tree, tropical, landscape', favorite: false, missing: false, collection: 'Landscape Scene', notes: 'Heavy model. Use proxy for previews.' },
    { name: 'studio_hdri_8k.hdr', category: 'HDRI', subcategory: 'Lighting', fileType: '.hdr', size: 140, resolution: '8192x4096', polygons: 0, compatibility: 'V-Ray, Enscape, D5 Render', style: 'realistic', license: 'CC0', source: 'Poly Haven', tags: 'studio, hdri, light', favorite: false, missing: true, collection: 'Client Render', notes: 'Missing source file path.' },
  ]);
  const [assetFilters, setAssetFilters] = useState({ search: '', category: 'All', fileType: 'All', software: 'All', style: 'All', license: 'All', flag: 'All', collection: 'All' });
  const [resourceFavorites, setResourceFavorites] = useState<string[]>([]);
  const [advancedWarnings, setAdvancedWarnings] = useState(false);
  const [bubbleGuideOpen, setBubbleGuideOpen] = useState(true);
  const [priceToast, setPriceToast] = useState('');
  const [assetToast, setAssetToast] = useState('');
  const [plotToast, setPlotToast] = useState('');
  const showToolkitToast = (setter: React.Dispatch<React.SetStateAction<string>>, message: string) => {
    setter(message);
    window.setTimeout(() => setter(''), 2200);
  };
  const totalArea = spaces.reduce((sum, space) => sum + space.area, 0);
  const bubbleWarnings = [spaces.some((space) => space.zone === 'Circulation') ? '' : 'Add one circulation space so rooms connect clearly.'].filter(Boolean);
  const bubbleScore = Math.max(0, 94 - bubbleWarnings.length * 18 - spaces.filter((space) => space.relation.includes('separated')).length * 4);
  const stairCalc = useMemo(() => {
    const risers = Math.max(1, Math.round(stair.height / Math.max(stair.riser, 1)));
    const actualRiser = stair.height / risers;
    const treads = Math.max(1, risers - 1);
    const run = treads * stair.tread;
    const angle = Math.atan(stair.height / Math.max(run, 1)) * 180 / Math.PI;
    const comfort = 2 * actualRiser + stair.tread;
    const warnings = [actualRiser > stair.maxRiser ? 'Riser too high.' : '', stair.tread < stair.minTread ? 'Tread too shallow.' : '', stair.width < stair.minWidth ? 'Stair width too narrow.' : '', stair.landing < stair.minLanding ? 'Landing too small.' : '', angle > 38 ? 'Stair is steep.' : ''].filter(Boolean);
    return { risers, actualRiser, treads, run, angle, comfort, warnings, status: warnings.length > 2 ? 'Critical' : warnings.length ? 'Warning' : 'Comfortable' };
  }, [stair]);
  const ventCalc = useMemo(() => {
    const floorArea = vent.width * vent.length;
    const windowArea = vent.windowW * vent.windowH * vent.windows;
    const ratio = floorArea > 0 ? (windowArea / floorArea) * 100 : 0;
    const score = Math.max(0, Math.min(100, Math.round(ratio * 9 + (vent.cross ? 20 : 0) - (vent.orientation === 'West' ? 15 : 0))));
    const warnings = [ratio < 10 ? 'Window area is below the 10% floor-area study target.' : '', vent.orientation === 'West' ? 'West-facing windows may cause afternoon heat gain.' : '', !vent.cross ? 'One-sided ventilation limits airflow.' : ''].filter(Boolean);
    return { floorArea, windowArea, ratio, openable: windowArea * (vent.operable / 100), score, warnings, status: score > 75 ? 'Good Cross Ventilation' : score > 50 ? 'Limited Airflow' : 'Poor Ventilation' };
  }, [vent]);
  const materialCalc = useMemo(() => {
    const priceOf = (name: string) => prices.find((item) => item.name === name)?.price ?? 0;
    const wasteFactor = 1 + Math.max(0, material.waste) / 100;
    const floorArea = Math.max(0, material.length * material.width);
    const wallArea = Math.max(0, material.length * material.wallHeight - material.openings);
    const labor = material.laborEnabled ? floorArea * material.laborRate : 0;
    const delivery = material.deliveryEnabled ? material.deliveryRate : 0;
    let baseQty = 0;
    let totalQty = 0;
    let unit = 'unit';
    let unitPrice = 0;
    let label = material.category;
    let notes = '';
    let breakdown: Array<{ item: string; qty: number; unit: string; price: number; subtotal: number; notes: string }> = [];
    const warnings: string[] = [];
    if (material.category === 'Concrete') {
      baseQty = floorArea * (material.thickness / 1000);
      totalQty = baseQty * wasteFactor;
      unit = 'cu.m';
      unitPrice = priceOf('ready-mix concrete');
      label = 'Concrete volume';
      breakdown = [
        { item: 'Concrete volume', qty: totalQty, unit, price: unitPrice, subtotal: totalQty * unitPrice, notes: `${material.thickness}mm slab thickness` },
        { item: 'Cement bags guide', qty: totalQty * 9, unit: 'bags', price: priceOf('cement bag'), subtotal: totalQty * 9 * priceOf('cement bag'), notes: 'Material-based rough guide' },
      ];
      if (material.thickness <= 0) warnings.push('Thickness must be greater than zero.');
    } else if (material.category === 'CHB') {
      baseQty = Math.max(0, wallArea / 0.08);
      totalQty = Math.ceil(baseQty * wasteFactor);
      unit = 'pcs';
      unitPrice = priceOf('4-inch hollow blocks');
      label = 'CHB blocks';
      breakdown = [
        { item: 'Hollow blocks', qty: totalQty, unit, price: unitPrice, subtotal: totalQty * unitPrice, notes: `${wallArea.toFixed(2)} sqm net wall area` },
        { item: 'Mortar cement', qty: Math.ceil(totalQty / 80), unit: 'bags', price: priceOf('cement bag'), subtotal: Math.ceil(totalQty / 80) * priceOf('cement bag'), notes: 'Sample mortar allowance' },
        { item: 'Mortar sand', qty: totalQty * 0.004, unit: 'cu.m', price: priceOf('sand'), subtotal: totalQty * 0.004 * priceOf('sand'), notes: 'Sample mortar allowance' },
      ];
      if (material.openings > material.length * material.wallHeight) warnings.push('Opening area is greater than wall area.');
    } else if (material.category === 'Rebar') {
      const barsEachWay = Math.ceil((material.length * 1000) / Math.max(1, material.rebarSpacing)) + Math.ceil((material.width * 1000) / Math.max(1, material.rebarSpacing));
      baseQty = barsEachWay * Math.max(material.length, material.width) * material.layers * (1 + material.lap / 100);
      totalQty = baseQty * wasteFactor;
      unit = 'm';
      unitPrice = priceOf('10mm rebar') / Math.max(1, material.barLength);
      label = `${material.rebarDiameter}mm rebar`;
      breakdown = [{ item: 'Rebar length', qty: totalQty, unit, price: unitPrice, subtotal: totalQty * unitPrice, notes: `${material.rebarSpacing}mm spacing, ${material.layers} layer(s)` }];
      if (material.rebarSpacing > 300) warnings.push('Rebar spacing seems too wide for a study estimate.');
    } else if (material.category === 'Tiles' || material.category === 'Grout / tile adhesive') {
      const tileArea = (material.tileW / 1000) * (material.tileL / 1000);
      baseQty = floorArea / Math.max(0.01, tileArea);
      totalQty = Math.ceil(baseQty * wasteFactor);
      unit = 'tiles';
      unitPrice = priceOf('tile box') / Math.max(1, material.tilesPerBox);
      label = 'Tiles required';
      const boxes = Math.ceil(totalQty / Math.max(1, material.tilesPerBox));
      breakdown = [
        { item: 'Tiles', qty: totalQty, unit, price: unitPrice, subtotal: totalQty * unitPrice, notes: `${boxes} box(es), ${material.pattern} pattern` },
        { item: 'Tile adhesive', qty: Math.ceil(floorArea / 4), unit: 'bags', price: priceOf('tile adhesive'), subtotal: Math.ceil(floorArea / 4) * priceOf('tile adhesive'), notes: 'Sample 4 sqm/bag allowance' },
        { item: 'Grout', qty: Math.ceil(floorArea * Math.max(1, material.grout) * 0.12), unit: 'kg', price: priceOf('grout'), subtotal: Math.ceil(floorArea * Math.max(1, material.grout) * 0.12) * priceOf('grout'), notes: `${material.grout}mm grout width` },
      ];
      if (material.pattern === 'Diagonal' && material.waste < 15) warnings.push('Waste percentage may be too low for diagonal tile pattern.');
      if (material.tileW > material.width * 1000 / 2) warnings.push('Tile size is large for this room width.');
    } else if (material.category === 'Paint') {
      baseQty = (wallArea * material.coats) / Math.max(0.1, material.coverage);
      totalQty = Math.ceil(baseQty * wasteFactor);
      unit = 'liters';
      unitPrice = priceOf('paint gallon') / 3.785;
      label = 'Paint required';
      breakdown = [{ item: 'Paint', qty: totalQty, unit, price: unitPrice, subtotal: totalQty * unitPrice, notes: `${material.coats} coat(s), ${material.coverage} sqm/L` }];
      if (material.coverage < 5) warnings.push('Paint coverage looks too low. Check the product data sheet.');
    } else if (['Ceiling boards', 'Plywood', 'Steel framing'].includes(material.category)) {
      const boardArea = material.boardW * material.boardL;
      baseQty = floorArea / Math.max(0.01, boardArea);
      totalQty = Math.ceil(baseQty * wasteFactor);
      unit = material.category === 'Steel framing' ? 'm' : 'boards';
      unitPrice = material.category === 'Ceiling boards' ? priceOf('ceiling board') : material.category === 'Plywood' ? priceOf('plywood board') : priceOf('steel framing');
      label = material.category;
      breakdown = [{ item: material.category, qty: totalQty, unit, price: unitPrice, subtotal: totalQty * unitPrice, notes: `${material.boardW}m x ${material.boardL}m module` }];
    } else {
      const sheetArea = material.sheetW * material.sheetL;
      baseQty = (floorArea * material.roofSlope) / Math.max(0.01, sheetArea - material.overlap);
      totalQty = Math.ceil(baseQty * wasteFactor);
      unit = 'sheets';
      unitPrice = priceOf('roofing sheet');
      label = 'Roofing sheets';
      breakdown = [{ item: 'Roofing sheets', qty: totalQty, unit, price: unitPrice, subtotal: totalQty * unitPrice, notes: `Slope factor ${material.roofSlope}` }];
    }
    if (material.waste < 5) warnings.push('Waste allowance may be too low for site cutting and breakage.');
    if (floorArea <= 0) warnings.push('Length and width must be greater than zero.');
    const materialSubtotal = breakdown.reduce((sum, item) => sum + item.subtotal, 0);
    return { baseQty, wasteQty: Math.max(0, totalQty - baseQty), totalQty, unit, unitPrice, label, notes, breakdown, warnings, floorArea, wallArea, materialSubtotal, labor, delivery, grandTotal: materialSubtotal + labor + delivery };
  }, [material, prices]);
  const priceOutdated = prices.some((price) => (Date.now() - new Date(price.updated).getTime()) / 86400000 > 30);
  const plotWarnings = [!plot.dwgFolder ? 'Missing DWG folder' : '', !plot.outputFolder ? 'Missing output folder' : '', !plot.style ? 'Missing plot style' : '', plot.dwgCount <= 0 ? 'No DWG files found' : ''].filter(Boolean);
  const plotReadiness = plotWarnings[0] ?? 'Ready to generate plot pack';
  const plotSheet = paperSizes.find((paper) => paper.name === plot.sheet) ?? paperSizes[1];
  const plotOutputPreview = Array.from({ length: Math.min(3, Math.max(0, plot.dwgCount)) }, (_, index) => `${plot.outputFolder || 'Output_Folder'}/Sheet_${String(index + 1).padStart(2, '0')}_${plot.sheet}_${plot.scale.replace(':', '-')}.pdf`);
  const plotScript = [
    '; ===============================================',
    '; ArchiVault AutoCAD Plot Pack - BatchPlot.scr',
    '; This website prepares the plotting package only.',
    '; Open AutoCAD and run this file with the SCRIPT command.',
    '; ===============================================',
    '',
    '; [1] Keep file dialogs off so AutoCAD can follow scripted prompts',
    '_FILEDIA',
    '0',
    '',
    '; [2] Plot package settings',
    `; DWG folder: ${plot.dwgFolder || 'MISSING_DWG_FOLDER'}`,
    `; Output PDF folder: ${plot.outputFolder || 'MISSING_OUTPUT_FOLDER'}`,
    `; Sheet: ${plot.sheet} ${plot.orientation}`,
    `; Scale: ${plot.scale}`,
    `; Plot style / CTB: ${plot.style || 'MISSING_PLOT_STYLE'}`,
    `; Output mode: ${plot.mode}`,
    `; Expected PDFs: ${plot.dwgCount}`,
    '',
    '; [3] Example plotting sequence for the active drawing',
    '; Repeat or batch-run this generated setup per DWG in AutoCAD.',
    '_-PLOT',
    '_Y',
    '',
    'DWG To PDF.pc3',
    `${plot.sheet} (${plotSheet.width}.00 x ${plotSheet.height}.00 MM)`,
    '_M',
    plot.orientation,
    '_N',
    '_E',
    plot.scale === 'Fit to Paper' ? '_F' : plot.scale,
    '_C',
    '_Y',
    plot.style || 'monochrome.ctb',
    '_Y',
    '_N',
    '_N',
    '_N',
    `${plot.outputFolder || 'C:/PDF_Output'}/active_drawing_${plot.sheet}_${plot.scale.replace(':', '-')}.pdf`,
    '_N',
    '_Y',
    '',
    '; [4] Restore dialogs',
    '_FILEDIA',
    '1',
    '',
  ].join('\n');
  const plotInstructions = [
    'ArchiVault AutoCAD Plot Pack',
    '',
    'This website prepares the AutoCAD plotting package. To export the actual PDFs, open AutoCAD and run the generated .SCR file using the SCRIPT command.',
    '',
    `DWG folder: ${plot.dwgFolder || 'Missing'}`,
    `Output folder: ${plot.outputFolder || 'Missing'}`,
    `Sheet: ${plot.sheet} ${plot.orientation}`,
    `Scale: ${plot.scale}`,
    `Plot style: ${plot.style || 'Missing'}`,
    `Expected PDF count: ${plot.dwgCount}`,
    '',
    'PDF naming preview:',
    ...(plotOutputPreview.length ? plotOutputPreview : ['No output preview because no DWG files were found.']),
    '',
    'CTB / plot style reminder:',
    `Make sure ${plot.style || 'your CTB file'} exists on this AutoCAD computer before running the script.`,
    '',
    'Workflow:',
    '1. Open AutoCAD.',
    '2. Open the first DWG or run your batch process folder-by-folder.',
    '3. Type SCRIPT.',
    '4. Select ArchiVault_AutoCAD_Plot_Pack.scr.',
    '5. Let AutoCAD generate PDFs using the selected plot settings.',
  ].join('\n');
  const assetSummary = useMemo(() => {
    const totalSize = renderAssets.reduce((sum, asset) => sum + asset.size, 0);
    const heavy = renderAssets.filter((asset) => asset.size > 50).length;
    const missing = renderAssets.filter((asset) => asset.missing).length;
    return { totalSize, heavy, missing, risk: heavy + missing > 3 ? 'Critical' : heavy + missing > 1 ? 'Heavy' : heavy ? 'Moderate' : 'Light' };
  }, [renderAssets]);
  const assetCategories = ['All', '3D Model', 'Furniture', 'Chair', 'Table', 'Sofa', 'Bed', 'Cabinet', 'Kitchen fixture', 'Bathroom fixture', 'Lighting fixture', 'Door', 'Window', 'Stair', 'Railing', 'Tree', 'Plant', 'Grass', 'Human scale figure', 'Vehicle', 'Appliance', 'Decor', 'Texture', 'PBR Material', 'Tile material', 'Wood material', 'Concrete material', 'Stone material', 'Metal material', 'Glass material', 'Fabric material', 'HDRI', 'IES Light', 'Render preset', 'Camera preset', 'Scene template', 'SketchUp component', 'V-Ray material', 'Enscape asset', 'Lumion asset', 'D5 asset', 'Twinmotion asset', 'Revit family', 'AutoCAD DWG block', 'Title block template', 'Layout template', 'Presentation board template'];
  const assetFileTypes = ['All', '.skp', '.fbx', '.obj', '.dae', '.3ds', '.blend', '.rvt', '.rfa', '.dwg', '.dxf', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.exr', '.hdr', '.vrmat', '.mat', '.ies', '.pdf', '.psd', '.ai', '.svg'];
  const assetSoftware = ['All', 'SketchUp', 'Enscape', 'Lumion', 'V-Ray', 'D5 Render', 'Twinmotion', 'Blender', 'Revit', 'AutoCAD'];
  const assetCollections = ['All', 'Thesis Project', 'Residential Project', 'Interior Scene', 'Landscape Scene', 'Plate Submission', 'Presentation Board', 'Client Render', 'Furniture Library', 'Materials Library', 'DWG Blocks Library', 'Revit Families Library'];
  const filteredRenderAssets = renderAssets.filter((asset) => {
    const text = `${asset.name} ${asset.category} ${asset.subcategory} ${asset.tags}`.toLowerCase();
    const weight = asset.size > 100 ? 'Very Heavy' : asset.size > 50 ? 'Heavy' : asset.size > 20 ? 'Moderate' : 'Light';
    return (!assetFilters.search || text.includes(assetFilters.search.toLowerCase()))
      && (assetFilters.category === 'All' || asset.category === assetFilters.category || asset.subcategory === assetFilters.category)
      && (assetFilters.fileType === 'All' || asset.fileType === assetFilters.fileType)
      && (assetFilters.software === 'All' || asset.compatibility.includes(assetFilters.software))
      && (assetFilters.style === 'All' || asset.style === assetFilters.style)
      && (assetFilters.license === 'All' || asset.license.includes(assetFilters.license))
      && (assetFilters.collection === 'All' || asset.collection === assetFilters.collection)
      && (assetFilters.flag === 'All' || (assetFilters.flag === 'Favorite only' && asset.favorite) || (assetFilters.flag === 'Heavy assets only' && ['Heavy', 'Very Heavy'].includes(weight)) || (assetFilters.flag === 'Missing files only' && asset.missing) || (assetFilters.flag === 'Free assets only' && asset.license.toLowerCase().includes('free')));
  });
  const resourceSites = [
    ['SketchUp 3D Warehouse', 'SketchUp Models', 'Searchable pre-made 3D models for SketchUp.', 'Check model license and polygon weight.', 'https://3dwarehouse.sketchup.com/'],
    ['BIMobject', 'Revit Families / BIM Objects', 'Free BIM objects and manufacturer Revit families.', 'Confirm manufacturer usage terms.', 'https://www.bimobject.com/'],
    ['BIMsmith Market', 'Revit Families / BIM Objects', 'Free Revit families and BIM content.', 'Review product permissions.', 'https://market.bimsmith.com/'],
    ['Poly Haven', 'HDRI', 'CC0 free HDRIs, textures, and 3D models.', 'CC0, still credit when possible.', 'https://polyhaven.com/'],
    ['ambientCG', 'Textures / PBR Materials', 'Free PBR materials, HDRIs, and models.', 'Check asset-specific license notes.', 'https://ambientcg.com/'],
    ['CADdetails', 'DWG Blocks', 'CAD details, product drawings, BIM models, and specs.', 'Manufacturer files may have usage limits.', 'https://www.caddetails.com/'],
    ['DWGModels', 'DWG Blocks', 'Free DWG blocks for furniture, people, symbols, and architecture.', 'Verify license before client/commercial work.', 'https://dwgmodels.com/'],
    ['Behance', 'Presentation Templates', 'Presentation board and visual reference inspiration.', 'Do not copy copyrighted boards directly.', 'https://www.behance.net/'],
    ['Canva', 'Presentation Templates', 'Presentation graphics and board layout templates.', 'Check free/pro asset terms.', 'https://www.canva.com/'],
    ['Pexels / Unsplash', 'Rendering References', 'Free reference images and texture photos.', 'Check each image license before reuse.', 'https://www.pexels.com/'],
  ];
  const unitBadge = (text: string) => <span className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 font-mono text-[10px] text-cyan-100">{text}</span>;

  return (
    <section className="space-y-5">
      <BubbleDiagramMaker />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="hidden">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-white">Bubble Diagram Planner</h3><p className="mt-1 text-sm text-zinc-400">Plan spaces and check adjacency before drawing your floor plan.</p></div>{unitBadge('sqm')}</div>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-cyan-50">How this helps your concept plan</h4>
                <p className="mt-1 text-xs leading-5 text-cyan-50/80">Bubble diagrams quickly show program size, public-to-private flow, adjacency, and separation before you commit to walls, dimensions, or a fixed floor plan.</p>
              </div>
              <button className={buttonClass('secondary')} onClick={() => setBubbleGuideOpen((value) => !value)}>{bubbleGuideOpen ? 'Hide Guide' : 'Show Guide'}</button>
            </div>
            {bubbleGuideOpen && (
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <div className="rounded border border-white/10 bg-[#11151b] p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Read The Bubbles</p>
                  <p className="mt-2 text-xs leading-5 text-zinc-300">Larger bubbles mean larger required areas in square meters. Colors group spaces by zone: public, private, service, circulation, and outdoor.</p>
                </div>
                <div className="rounded border border-white/10 bg-[#11151b] p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Read The Lines</p>
                  <div className="mt-2 space-y-2 text-xs text-zinc-300">
                    <p><span className="mr-2 inline-block h-0.5 w-8 bg-cyan-300 align-middle" /> Must or should be near.</p>
                    <p><span className="mr-2 inline-block h-0.5 w-8 border-t border-dashed border-red-300 align-middle" /> Should or must be separated.</p>
                    <p><span className="mr-2 inline-block h-0.5 w-8 bg-cyan-300 align-middle [height:3px]" /> Stronger relationship priority.</p>
                  </div>
                </div>
                <div className="rounded border border-amber-300/20 bg-amber-300/10 p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-amber-100/70">Planning Reminder</p>
                  <p className="mt-2 text-xs leading-5 text-amber-50/90">This is not a scaled construction plan. Use it to test relationships with clients or classmates, then translate the strongest scheme into measured rooms, walls, doors, and circulation.</p>
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 grid gap-2">
            {spaces.map((space, index) => (
              <div key={`${space.name}-${index}`} className="grid gap-2 rounded-md border border-white/10 bg-[#11151b] p-2 md:grid-cols-[1fr_0.55fr_0.8fr_0.9fr_0.9fr_auto]">
                <input className={inputClass()} value={space.name} onChange={(event) => setSpaces((current) => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
                <input className={inputClass()} type="number" value={space.area} onChange={(event) => setSpaces((current) => current.map((item, i) => i === index ? { ...item, area: Number(event.target.value) } : item))} />
                <select className={inputClass()} value={space.zone} onChange={(event) => setSpaces((current) => current.map((item, i) => i === index ? { ...item, zone: event.target.value } : item))}>{['Public', 'Semi-private', 'Private', 'Service', 'Circulation', 'Outdoor'].map((item) => <option key={item}>{item}</option>)}</select>
                <input className={inputClass()} value={space.adjacency} onChange={(event) => setSpaces((current) => current.map((item, i) => i === index ? { ...item, adjacency: event.target.value } : item))} />
                <select className={inputClass()} value={space.relation} onChange={(event) => setSpaces((current) => current.map((item, i) => i === index ? { ...item, relation: event.target.value } : item))}>{['Must be near', 'Should be near', 'Neutral', 'Should be separated', 'Must be separated'].map((item) => <option key={item}>{item}</option>)}</select>
                <button className="text-zinc-500 hover:text-red-300" onClick={() => setSpaces((current) => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button className={`${buttonClass('secondary')} mt-3`} onClick={() => setSpaces((current) => [...current, { name: 'New Space', area: 10, zone: 'Semi-private', priority: 3, adjacency: 'Corridor', relation: 'Should be near' }])}>Add Space</button>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-[#080a0d] p-4">
            <div className="relative h-72 overflow-hidden rounded bg-[#11151b]">
              <svg className="absolute inset-0 h-full w-full">
                {spaces.map((space, index) => {
                  const target = spaces.findIndex((item) => item.name.toLowerCase() === space.adjacency.toLowerCase());
                  if (target < 0) return null;
                  const x1 = 16 + (index % 4) * 24;
                  const y1 = 24 + Math.floor(index / 4) * 34;
                  const x2 = 16 + (target % 4) * 24;
                  const y2 = 24 + Math.floor(target / 4) * 34;
                  return <line key={`${space.name}-${space.adjacency}`} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`} stroke={space.relation.includes('separated') ? '#f87171' : '#67e8f9'} strokeWidth={space.relation === 'Must be near' ? 3 : 1.5} strokeDasharray={space.relation.includes('separated') ? '6 5' : undefined} />;
                })}
              </svg>
              {spaces.map((space, index) => {
                const palette = space.zone === 'Private' ? 'bg-violet-300/25 border-violet-300/60' : space.zone === 'Service' ? 'bg-amber-300/20 border-amber-300/60' : space.zone === 'Public' ? 'bg-cyan-300/20 border-cyan-300/60' : space.zone === 'Circulation' ? 'bg-white/10 border-white/40' : 'bg-emerald-300/20 border-emerald-300/60';
                return <div key={`${space.name}-node`} className={`absolute grid place-items-center rounded-full border text-center text-[10px] font-semibold text-white ${palette}`} style={{ left: `${8 + (index % 4) * 24}%`, top: `${14 + Math.floor(index / 4) * 34}%`, width: `${Math.min(104, Math.max(58, space.area * 3))}px`, height: `${Math.min(104, Math.max(58, space.area * 3))}px` }}><span>{space.name}<br />{space.area} sqm</span></div>;
              })}
            </div>
            <div className={`mt-3 rounded border p-2 text-xs ${bubbleScore > 80 ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-50' : 'border-amber-300/30 bg-amber-300/10 text-amber-50'}`}>Bubble Diagram Score: {bubbleScore}/100. {bubbleWarnings[0] ?? `Total planned area: ${totalArea.toFixed(1)} sqm.`}</div>
          </div>
        </div>
        <div className="hidden">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-white">Stair Calculator</h3><p className="mt-1 text-sm text-zinc-400">Calculate safer risers, treads, slope, and landings.</p></div>{unitBadge('mm')}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Stair type"><select className={inputClass()} value={stair.type} onChange={(event) => setStair({ ...stair, type: event.target.value })}>{['Straight', 'L-shaped', 'U-shaped', 'Spiral', 'Dog-leg'].map((item) => <option key={item}>{item}</option>)}</select></Field>
            {[
              ['height', 'Floor-to-floor height, mm'], ['riser', 'Desired riser height, mm'], ['tread', 'Desired tread depth, mm'], ['width', 'Stair width, mm'], ['landing', 'Landing depth, mm'], ['floors', 'Number of floors'],
            ].map(([key, label]) => <div key={key}><Field label={label}><input className={inputClass()} type="number" value={stair[key as keyof typeof stair] as number} onChange={(event) => setStair({ ...stair, [key]: Number(event.target.value) })} /></Field></div>)}
          </div>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-[#080a0d] p-4">
            <div className="relative h-48 rounded bg-[#11151b]">
              {Array.from({ length: Math.min(stairCalc.treads, 14) }).map((_, index) => <div key={index} className="absolute bottom-6 border-b-2 border-r-2 border-cyan-300" style={{ left: `${8 + index * 5.8}%`, width: '5.8%', height: `${10 + index * 5}%` }} />)}
              <div className={`absolute right-4 top-4 rounded px-2 py-1 text-xs font-semibold ${stairCalc.status === 'Comfortable' ? 'bg-emerald-300 text-emerald-950' : stairCalc.status === 'Warning' ? 'bg-amber-300 text-amber-950' : 'bg-red-300 text-red-950'}`}>{stairCalc.status}</div>
              <span className="absolute bottom-2 left-4 text-[10px] text-zinc-400">Run {(stairCalc.run / 1000).toFixed(2)} m | Slope {stairCalc.angle.toFixed(1)} deg</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4 text-xs text-zinc-300"><span>{stairCalc.risers} risers</span><span>{stairCalc.actualRiser.toFixed(1)}mm actual R</span><span>{stairCalc.treads} treads</span><span>2R+T {stairCalc.comfort.toFixed(0)}mm</span></div>
            <p className="mt-2 text-xs text-zinc-400">{stairCalc.warnings[0] ?? 'Comfort formula is acceptable for a study check.'}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-white">Window and Ventilation Planner</h3><p className="mt-1 text-sm text-zinc-400">Check if rooms have enough natural light and airflow.</p></div>{unitBadge('m / sqm')}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ['width', 'Room width, m'], ['length', 'Room length, m'], ['height', 'Ceiling height, m'], ['windowW', 'Window width, m'], ['windowH', 'Window height, m'], ['windows', 'Number of windows'], ['operable', 'Operable window, %'],
            ].map(([key, label]) => <div key={key}><Field label={label}><input className={inputClass()} type="number" value={vent[key as keyof typeof vent] as number} onChange={(event) => setVent({ ...vent, [key]: Number(event.target.value) })} /></Field></div>)}
            <Field label="Window orientation"><select className={inputClass()} value={vent.orientation} onChange={(event) => setVent({ ...vent, orientation: event.target.value })}>{['North', 'East', 'South', 'West'].map((item) => <option key={item}>{item}</option>)}</select></Field>
            <label className="flex items-center gap-2 rounded-md border border-white/10 bg-[#11151b] p-3 text-sm text-zinc-200"><input type="checkbox" checked={vent.cross} onChange={() => setVent({ ...vent, cross: !vent.cross })} className="accent-cyan-300" />Cross ventilation</label>
          </div>
          <div className="mt-4 aspect-[1.35/1] rounded-md border border-cyan-300/20 bg-[#080a0d] p-4"><div className="relative h-full rounded border border-cyan-300/50 bg-[#11151b]"><div className={`absolute ${vent.orientation === 'West' ? 'left-0 top-1/4 h-16 w-1' : vent.orientation === 'East' ? 'right-0 top-1/4 h-16 w-1' : vent.orientation === 'North' ? 'left-1/4 top-0 h-1 w-20' : 'bottom-0 left-1/4 h-1 w-20'} bg-cyan-300`} /><div className="absolute left-8 top-1/2 w-[72%] border-t-2 border-dashed border-emerald-300" /><span className="absolute right-3 top-3 rounded bg-cyan-300 px-2 py-1 text-[10px] font-bold text-zinc-950">{ventCalc.status}</span></div></div>
          <p className="mt-3 text-xs leading-5 text-zinc-400">Window ratio {ventCalc.ratio.toFixed(1)}%, openable area {ventCalc.openable.toFixed(2)} sqm. {ventCalc.warnings[0] ?? 'Daylight and airflow look reasonable.'}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-white">Material Quantity Estimator</h3><p className="mt-1 text-sm text-zinc-400">Live quantities, prices, previews, and warnings for student estimates.</p></div>{unitBadge('m / mm / PHP')}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Material category"><select className={inputClass()} value={material.category} onChange={(event) => setMaterial({ ...material, category: event.target.value })}>{['Concrete', 'CHB', 'Rebar', 'Tiles', 'Paint', 'Ceiling boards', 'Plywood', 'Roofing sheets', 'Steel framing', 'Grout / tile adhesive'].map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Preset"><select className={inputClass()} value={material.preset} onChange={(event) => setMaterial({ ...material, preset: event.target.value })}>{['Bedroom floor', 'Toilet wall', 'Classroom slab', 'Small house wall', 'Roof bay'].map((item) => <option key={item}>{item}</option>)}</select></Field>
            {[
              ['length', 'Length, m'], ['width', 'Width, m'], ['wallHeight', 'Wall height, m'], ['openings', 'Openings area, sqm'], ['waste', 'Waste allowance, %'],
            ].map(([key, label]) => <div key={key}><Field label={label}><input className={inputClass()} type="number" value={material[key as keyof typeof material] as number} onChange={(event) => setMaterial({ ...material, [key]: Number(event.target.value) })} /></Field></div>)}
            {material.category === 'Concrete' && <Field label="Thickness, mm"><input className={inputClass()} type="number" value={material.thickness} onChange={(event) => setMaterial({ ...material, thickness: Number(event.target.value) })} /></Field>}
            {(material.category === 'Tiles' || material.category === 'Grout / tile adhesive') && <>
              <Field label="Tile width, mm"><input className={inputClass()} type="number" value={material.tileW} onChange={(event) => setMaterial({ ...material, tileW: Number(event.target.value) })} /></Field>
              <Field label="Tile length, mm"><input className={inputClass()} type="number" value={material.tileL} onChange={(event) => setMaterial({ ...material, tileL: Number(event.target.value) })} /></Field>
              <Field label="Pattern"><select className={inputClass()} value={material.pattern} onChange={(event) => setMaterial({ ...material, pattern: event.target.value })}>{['Straight', 'Running bond', 'Diagonal', 'Checkerboard'].map((item) => <option key={item}>{item}</option>)}</select></Field>
              <Field label="Grout width, mm"><input className={inputClass()} type="number" value={material.grout} onChange={(event) => setMaterial({ ...material, grout: Number(event.target.value) })} /></Field>
            </>}
            {material.category === 'Rebar' && <>
              <Field label="Bar diameter, mm"><input className={inputClass()} type="number" value={material.rebarDiameter} onChange={(event) => setMaterial({ ...material, rebarDiameter: Number(event.target.value) })} /></Field>
              <Field label="Spacing, mm"><input className={inputClass()} type="number" value={material.rebarSpacing} onChange={(event) => setMaterial({ ...material, rebarSpacing: Number(event.target.value) })} /></Field>
            </>}
            {material.category === 'Paint' && <>
              <Field label="Number of coats"><input className={inputClass()} type="number" value={material.coats} onChange={(event) => setMaterial({ ...material, coats: Number(event.target.value) })} /></Field>
              <Field label="Coverage per liter"><input className={inputClass()} type="number" value={material.coverage} onChange={(event) => setMaterial({ ...material, coverage: Number(event.target.value) })} /></Field>
            </>}
            <label className="flex items-center gap-2 rounded-md border border-white/10 bg-[#11151b] p-3 text-xs text-zinc-300"><input type="checkbox" checked={material.laborEnabled} onChange={() => setMaterial({ ...material, laborEnabled: !material.laborEnabled })} className="accent-cyan-300" />Include labor</label>
            <Field label="Labor cost / sqm"><input className={inputClass()} type="number" value={material.laborRate} onChange={(event) => setMaterial({ ...material, laborRate: Number(event.target.value) })} /></Field>
          </div>
          <div className="mt-4 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm font-semibold text-emerald-50">{materialCalc.totalQty.toFixed(material.category === 'Concrete' ? 2 : 0)} {materialCalc.unit} · {materialCalc.label} | PHP {materialCalc.grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-[#11151b] p-4">
            <div className="relative h-40 overflow-hidden rounded bg-[#080a0d] bg-[linear-gradient(90deg,rgba(34,211,238,.12)_1px,transparent_1px),linear-gradient(rgba(34,211,238,.12)_1px,transparent_1px)] bg-[size:20%_25%]">
              <div className="absolute inset-6 border-2 border-cyan-300/70 bg-cyan-300/10" />
              {(material.category === 'Tiles' || material.category === 'Grout / tile adhesive') && Array.from({ length: 6 }).map((_, index) => <span key={index} className="absolute top-6 h-[calc(100%-3rem)] border-l border-cyan-300/30" style={{ left: `${16 + index * 12}%` }} />)}
              {material.category === 'Paint' && <div className="absolute inset-x-12 top-12 h-16 rounded border border-amber-300/50 bg-amber-300/10" />}
              {material.category === 'Rebar' && Array.from({ length: 7 }).map((_, index) => <span key={index} className="absolute left-8 right-8 border-t border-emerald-300/60" style={{ top: `${18 + index * 10}%` }} />)}
              <span className="absolute bottom-2 left-3 rounded bg-black/40 px-2 py-1 text-[10px] text-cyan-100">{material.length}m x {material.width}m · {material.category}</span>
              <span className="absolute right-3 top-3 rounded bg-cyan-300 px-2 py-1 text-[10px] font-bold text-zinc-950">PHP {materialCalc.grandTotal.toFixed(0)}</span>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 text-xs">
            <div className="rounded border border-white/10 bg-[#11151b] p-2 text-zinc-300">Base quantity: {materialCalc.baseQty.toFixed(2)} {materialCalc.unit}</div>
            <div className="rounded border border-white/10 bg-[#11151b] p-2 text-zinc-300">Waste allowance: {materialCalc.wasteQty.toFixed(2)} {materialCalc.unit}</div>
            <div className="rounded border border-white/10 bg-[#11151b] p-2 text-zinc-300">Material subtotal: PHP {materialCalc.materialSubtotal.toFixed(0)}</div>
            <div className="rounded border border-white/10 bg-[#11151b] p-2 text-zinc-300">Labor + delivery: PHP {(materialCalc.labor + materialCalc.delivery).toFixed(0)}</div>
          </div>
          {materialCalc.warnings.map((warning) => <p key={warning} className="mt-2 rounded-md border border-amber-300/30 bg-amber-300/10 p-2 text-xs text-amber-100">{warning}</p>)}
          <div className="mt-4 max-h-40 overflow-auto rounded-md border border-white/10">
            <table className="w-full text-left text-xs text-zinc-300"><thead className="bg-white/[0.04] text-zinc-500"><tr><th className="p-2">Item</th><th className="p-2">Qty</th><th className="p-2">Unit</th><th className="p-2">Subtotal</th></tr></thead><tbody>{materialCalc.breakdown.map((item) => <tr key={item.item} className="border-t border-white/10"><td className="p-2">{item.item}</td><td className="p-2">{item.qty.toFixed(2)}</td><td className="p-2">{item.unit}</td><td className="p-2">PHP {item.subtotal.toFixed(0)}</td></tr>)}</tbody></table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2"><button className={buttonClass('secondary')} onClick={() => downloadText('ArchiVault_Material_Estimate.csv', materialCalc.breakdown.map((item) => `${item.item},${item.qty},${item.unit},${item.price},${item.subtotal},${item.notes}`).join('\n'))}>Export CSV</button><button className={buttonClass('secondary')} onClick={() => navigator.clipboard?.writeText(`Material: ${material.category}\nTotal: PHP ${materialCalc.grandTotal.toFixed(0)}`)}>Copy Summary</button></div>
          <p className="mt-3 text-xs leading-5 text-amber-100">Prices are estimates only. Verify with local suppliers before final purchase.</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Material Cost Estimator</h3>
          <p className="mt-1 text-sm text-zinc-400">Editable Philippine material price placeholders.</p>
          {priceToast && <p className="mt-3 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-2 text-xs text-emerald-50">{priceToast}</p>}
          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">{prices.map((price, index) => <div key={`${price.name}-${index}`} className="grid grid-cols-[1fr_0.65fr_auto] gap-2 rounded-md border border-white/10 bg-[#11151b] p-2"><span className="text-xs text-zinc-300">{price.name}<br /><span className="text-zinc-500">{price.unit} | {price.source} | {price.updated}</span></span><input className={inputClass()} type="number" value={price.price} onChange={(event) => setPrices((current) => current.map((item, i) => i === index ? { ...item, price: Number(event.target.value) || 0, updated: new Date().toISOString().slice(0, 10), source: 'Manual edit' } : item))} /><div className="flex flex-col gap-1"><button className="text-[10px] text-cyan-200" onClick={() => { setPrices((current) => [...current, { ...price, name: `${price.name} copy`, source: 'Duplicated sample' }]); showToolkitToast(setPriceToast, 'Material duplicated.'); }}>Duplicate</button><button className="text-[10px] text-amber-200" onClick={() => { setPrices((current) => current.map((item, i) => i === index ? { ...item, updated: '2026-01-01', source: 'Marked outdated' } : item)); showToolkitToast(setPriceToast, 'Price marked outdated.'); }}>Outdated</button><button className="text-[10px] text-red-200" onClick={() => { setPrices((current) => current.filter((_, i) => i !== index)); showToolkitToast(setPriceToast, 'Material deleted.'); }}>Delete</button></div></div>)}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={buttonClass('secondary')} onClick={() => { logWorkflow('updated_material_prices', 'Manual PH market price placeholders reviewed.', priceOutdated ? 1 : 0); showToolkitToast(setPriceToast, 'Sample market prices refreshed for editing.'); }}>Update Market Prices</button>
            <button className={buttonClass('secondary')} onClick={() => { setPrices((current) => [...current, { name: 'new material', unit: 'unit', price: 0, source: 'Manual entry', updated: new Date().toISOString().slice(0, 10) }]); showToolkitToast(setPriceToast, 'New material added.'); }}>Add Material</button>
            <button className={buttonClass('secondary')} onClick={() => downloadText('ArchiVault_Material_Prices.csv', prices.map((price) => `${price.name},${price.unit},${price.price},${price.source},${price.updated}`).join('\n'))}>Export Price CSV</button>
          </div>
          {priceOutdated && <p className="mt-3 rounded-md border border-amber-300/30 bg-amber-300/10 p-2 text-xs text-amber-100">Material prices may be outdated. Please update before final budgeting.</p>}
          <p className="mt-3 text-xs leading-5 text-zinc-500">Prices are estimates only. Verify with local suppliers before final purchase.</p>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Auto-Plot Batch Exporter</h3>
          <p className="mt-1 text-sm text-zinc-400">Generate AutoCAD plotting files for batch PDF output. The website prepares the pack; AutoCAD creates the actual PDFs.</p>
          <div className="mt-3 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-50">This website prepares the AutoCAD plotting package. To export the actual PDFs, open AutoCAD and run the generated .SCR file using the SCRIPT command.</div>
          {plotToast && <p className="mt-3 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-2 text-xs text-emerald-50">{plotToast}</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="DWG folder path"><input className={inputClass()} value={plot.dwgFolder} onChange={(event) => setPlot({ ...plot, dwgFolder: event.target.value })} /></Field>
            <Field label="Output PDF folder path"><input className={inputClass()} value={plot.outputFolder} onChange={(event) => setPlot({ ...plot, outputFolder: event.target.value })} /></Field>
            <Field label="Sheet size"><select className={inputClass()} value={plot.sheet} onChange={(event) => setPlot({ ...plot, sheet: event.target.value })}>{['A0', 'A1', 'A2', 'A3', 'A4'].map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Scale"><select className={inputClass()} value={plot.scale} onChange={(event) => setPlot({ ...plot, scale: event.target.value })}>{['Fit to Paper', '1:50', '1:100', '1:150', '1:200'].map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Plot style"><select className={inputClass()} value={plot.style} onChange={(event) => setPlot({ ...plot, style: event.target.value })}>{['monochrome.ctb', 'grayscale.ctb', 'acad.ctb', 'custom CTB'].map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="DWG files found"><input className={inputClass()} type="number" value={plot.dwgCount} onChange={(event) => setPlot({ ...plot, dwgCount: Number(event.target.value) })} /></Field>
          </div>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-[#080a0d] p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <span className={`rounded border px-2 py-1 text-[10px] font-semibold ${plotWarnings.length ? 'border-amber-300/30 bg-amber-300/10 text-amber-100' : 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'}`}>{plotReadiness}</span>
              <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-[10px] text-cyan-100">{plot.scale}</span>
              <span className="rounded border border-violet-300/30 bg-violet-300/10 px-2 py-1 text-[10px] text-violet-100">{plot.style}</span>
              <span className="rounded border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[10px] text-emerald-100">{plot.dwgCount} output PDFs</span>
            </div>
            <div className="aspect-[1.414/1] rounded border border-zinc-300/60 bg-[#11151b] p-4">
              <div className="relative h-full rounded border border-dashed border-cyan-300/40 bg-cyan-300/5">
                <div className="absolute inset-[9%] rounded border border-cyan-300/40 bg-[#080a0d]">
                  <svg className="h-full w-full" viewBox="0 0 100 70" preserveAspectRatio="none">
                    <rect x="8" y="8" width="58" height="44" fill="none" stroke="#67e8f9" strokeWidth="0.7" />
                    <path d="M12 44 L24 32 L32 38 L42 20 L55 36 L63 28" fill="none" stroke="#94a3b8" strokeWidth="0.8" />
                    <path d="M14 14 H62 M14 22 H62 M14 30 H62 M14 38 H62" stroke="#1f2937" strokeWidth="0.4" />
                    <path d="M20 12 V50 M32 12 V50 M44 12 V50 M56 12 V50" stroke="#1f2937" strokeWidth="0.4" />
                    <rect x="70" y="42" width="24" height="18" fill="rgba(251,191,36,.12)" stroke="#fbbf24" strokeWidth="0.7" />
                    <text x="72" y="49" fill="#fde68a" fontSize="3">Title block</text>
                    <text x="72" y="55" fill="#fde68a" fontSize="2.5">{plot.sheet}</text>
                  </svg>
                </div>
                <span className="absolute left-3 top-3 rounded bg-black/50 px-2 py-1 text-[10px] text-cyan-100">{plot.sheet} {plot.orientation}</span>
                <span className="absolute bottom-3 left-3 rounded bg-black/50 px-2 py-1 text-[10px] text-zinc-200">Printable margin + viewport preview</span>
              </div>
            </div>
            <div className="mt-3 rounded border border-white/10 bg-[#11151b] p-3 text-xs leading-5 text-zinc-300">
              <p className="font-semibold text-white">PDF naming preview</p>
              {(plotOutputPreview.length ? plotOutputPreview : ['No output preview because no DWG files were found.']).map((name) => <p key={name} className="mt-1 font-mono text-cyan-100">{name}</p>)}
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button className={buttonClass()} onClick={() => { downloadText('ArchiVault_AutoCAD_Plot_Pack.scr', plotScript); downloadText('ArchiVault_AutoCAD_Plot_Pack_Instructions.txt', plotInstructions); logWorkflow('generated_autocad_plot_pack', `${plot.sheet} ${plot.scale} plot pack for ${plot.dwgCount} drawings.`, plotWarnings.length); showToolkitToast(setPlotToast, 'AutoCAD Plot Pack generated. Run the .SCR file in AutoCAD using SCRIPT.'); }}>Generate AutoCAD Plot Pack</button>
            <button className={buttonClass('secondary')} onClick={() => showToolkitToast(setPlotToast, `${plotReadiness}. ${plot.sheet} ${plot.orientation}, ${plot.scale}, ${plot.style}, ${plot.dwgCount} PDF(s).`)}>Preview Plot Setup</button>
            <button className={buttonClass('secondary')} onClick={() => { downloadText('ArchiVault_AutoCAD_Plot_Pack.scr', plotScript); downloadText('ArchiVault_AutoCAD_Plot_Pack_Instructions.txt', plotInstructions); showToolkitToast(setPlotToast, 'Plot pack downloaded.'); }}>Download Plot Pack</button>
            <button className={buttonClass('secondary')} onClick={() => { navigator.clipboard?.writeText('SCRIPT ArchiVault_AutoCAD_Plot_Pack.scr'); showToolkitToast(setPlotToast, 'SCRIPT command copied.'); }}>Copy SCRIPT Command</button>
            <button className={buttonClass('secondary')} onClick={() => { setPlot({ dwgFolder: '', outputFolder: '', sheet: 'A1', scale: '1:100', style: 'monochrome.ctb', orientation: 'Landscape', mode: 'One PDF per drawing', dwgCount: 0 }); showToolkitToast(setPlotToast, 'Plot setup reset.'); }}>Reset</button>
          </div>
          {plotWarnings[0] && <div className="mt-3 space-y-2">{plotWarnings.map((warning) => <p key={warning} className="rounded-md border border-amber-300/30 bg-amber-300/10 p-2 text-xs text-amber-100">{warning}</p>)}</div>}
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Auto-Render Asset Manager</h3>
          <p className="mt-1 text-sm text-zinc-400">Organize SketchUp, Enscape, Lumion, V-Ray, D5, Twinmotion, Blender, Revit, DWG, texture, HDRI, and template assets.</p>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-50">Instructions: filter assets by category, software, file type, license, style, and collection. Select heavy or missing assets first before rendering so the scene does not lag.</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-cyan-100/70">Collection Size</p><p className="mt-2 text-lg font-semibold text-white">{assetSummary.totalSize} MB</p></div>
            <div className="rounded-md border border-orange-300/20 bg-orange-300/10 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-orange-100/70">Heavy Assets</p><p className="mt-2 text-lg font-semibold text-white">{assetSummary.heavy}</p></div>
            <div className="rounded-md border border-red-300/20 bg-red-300/10 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-red-100/70">Missing Files</p><p className="mt-2 text-lg font-semibold text-white">{assetSummary.missing}</p></div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Field label="Search asset"><input className={inputClass()} value={assetFilters.search} onChange={(event) => setAssetFilters({ ...assetFilters, search: event.target.value })} /></Field>
            <Field label="Category"><select className={inputClass()} value={assetFilters.category} onChange={(event) => setAssetFilters({ ...assetFilters, category: event.target.value })}>{assetCategories.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="File type"><select className={inputClass()} value={assetFilters.fileType} onChange={(event) => setAssetFilters({ ...assetFilters, fileType: event.target.value })}>{assetFileTypes.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Software"><select className={inputClass()} value={assetFilters.software} onChange={(event) => setAssetFilters({ ...assetFilters, software: event.target.value })}>{assetSoftware.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Style"><select className={inputClass()} value={assetFilters.style} onChange={(event) => setAssetFilters({ ...assetFilters, style: event.target.value })}>{['All', 'modern', 'minimalist', 'tropical', 'industrial', 'classic', 'realistic'].map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="License"><select className={inputClass()} value={assetFilters.license} onChange={(event) => setAssetFilters({ ...assetFilters, license: event.target.value })}>{['All', 'Free', 'CC0', 'Free educational', 'Free with attribution'].map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Collection"><select className={inputClass()} value={assetFilters.collection} onChange={(event) => setAssetFilters({ ...assetFilters, collection: event.target.value })}>{assetCollections.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Quick flag"><select className={inputClass()} value={assetFilters.flag} onChange={(event) => setAssetFilters({ ...assetFilters, flag: event.target.value })}>{['All', 'Favorite only', 'Recently used', 'Heavy assets only', 'Missing files only', 'Free assets only'].map((item) => <option key={item}>{item}</option>)}</select></Field>
          </div>
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">{filteredRenderAssets.map((asset, index) => {
            const tags = asset.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
            const weight = asset.size > 100 ? 'Very Heavy' : asset.size > 50 ? 'Heavy' : asset.size > 20 ? 'Moderate' : 'Light';
            const lagScore = Math.min(100, Math.round(asset.size * 0.55 + asset.polygons / 4500 + (asset.missing ? 30 : 0)));
            const realIndex = renderAssets.findIndex((item) => item.name === asset.name);
            return <div key={asset.name} className={`rounded-md border p-3 ${asset.missing ? 'border-red-300/40 bg-red-300/10' : asset.size > 50 ? 'border-orange-300/30 bg-orange-300/10' : 'border-white/10 bg-[#11151b]'}`}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-white">{asset.name}</p><p className="mt-1 text-xs text-zinc-400">{asset.category} / {asset.subcategory} | {asset.fileType} | {asset.size} MB | {asset.resolution}</p><p className="mt-1 text-xs text-zinc-500">{asset.compatibility} | {asset.style} | {asset.license} | {asset.collection}</p><p className="mt-1 text-[10px] text-cyan-100">{tags.join(', ')}</p><p className="mt-2 text-xs text-zinc-300">{asset.notes}</p></div><div className="text-right"><span className="rounded bg-black/30 px-2 py-1 text-[10px] text-white">{weight}</span><p className="mt-2 text-[10px] text-amber-100">Lag risk {lagScore}/100</p></div></div><div className="mt-3 flex flex-wrap gap-2"><button className="text-xs text-cyan-200" onClick={() => { setRenderAssets((current) => current.map((item, i) => i === realIndex ? { ...item, favorite: !item.favorite } : item)); showToolkitToast(setAssetToast, asset.favorite ? 'Removed from favorites.' : 'Asset marked favorite.'); }}>{asset.favorite ? 'Remove favorite' : 'Mark favorite'}</button><button className="text-xs text-cyan-200" onClick={() => { navigator.clipboard?.writeText(`${asset.name}, ${asset.category}, ${asset.fileType}, ${asset.size}MB, ${asset.source}`); showToolkitToast(setAssetToast, 'Metadata copied.'); }}>Copy metadata</button><button className="text-xs text-cyan-200" onClick={() => { logWorkflow('render_asset_check', `${asset.name}: ${weight}, lag risk ${lagScore}`, asset.missing || asset.size > 50 ? 1 : 0); showToolkitToast(setAssetToast, `${asset.name}: ${asset.missing ? 'missing file warning' : weight + ' asset'} checked.`); }}>Check asset</button></div></div>;
          })}</div>
          {assetToast && <p className="mt-3 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-2 text-xs text-emerald-50">{assetToast}</p>}
          <div className="mt-4 flex flex-wrap gap-2"><button className={buttonClass('secondary')} onClick={() => showToolkitToast(setAssetToast, 'Import file picker is coming soon. Use Export CSV or add mock assets for now.')}>Import file</button><button className={buttonClass('secondary')} onClick={() => showToolkitToast(setAssetToast, 'Import folder requires browser directory permission. Coming soon.')}>Import folder</button><button className={buttonClass('secondary')} onClick={() => showToolkitToast(setAssetToast, 'Thumbnail placeholder generated for selected asset list.')}>Generate Thumbnail</button><button className={buttonClass('secondary')} onClick={() => showToolkitToast(setAssetToast, `${assetSummary.missing} missing file(s), ${assetSummary.heavy} heavy asset(s).`)}>Check Missing Files</button><button className={buttonClass('secondary')} onClick={() => showToolkitToast(setAssetToast, 'Duplicate check complete: no duplicate mock asset names found.')}>Check Duplicates</button><button className={buttonClass('secondary')} onClick={() => showToolkitToast(setAssetToast, `${assetSummary.heavy} heavy asset(s) should be optimized before rendering.`)}>Check Heavy Assets</button><button className={buttonClass('secondary')} onClick={() => downloadText('ArchiVault_Render_Assets.csv', renderAssets.map((asset) => `${asset.name},${asset.category},${asset.fileType},${asset.size},${asset.compatibility},${asset.license},${asset.source}`).join('\n'))}>Export asset list CSV</button><button className={buttonClass()} onClick={() => { downloadText('ArchiVault_Render_Asset_Collection.txt', renderAssets.map((asset) => `${asset.name},${asset.category},${asset.size}MB,${asset.compatibility}`).join('\n')); logWorkflow('collected_render_assets', `${renderAssets.length} render assets collected. Risk: ${assetSummary.risk}.`, assetSummary.heavy + assetSummary.missing); showToolkitToast(setAssetToast, 'Render asset collection saved.'); }}>Collect Assets for Render</button></div>
          <div className="mt-5 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">Always check the license before using downloaded assets in school, client, or commercial work.</div>
          <div className="mt-4 rounded-md border border-white/10 bg-[#11151b] p-4">
            <h4 className="text-sm font-semibold text-white">Free Resource Sites</h4>
            <div className="mt-3 grid max-h-80 gap-3 overflow-y-auto pr-2 md:grid-cols-2">
              {resourceSites.map(([name, category, useful, reminder, url]) => <div key={name} className="rounded-md border border-white/10 bg-[#080a0d] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">{name}</p><p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-cyan-200">{category}</p></div><ExternalLink className="h-4 w-4 text-cyan-300" /></div><p className="mt-2 text-xs leading-5 text-zinc-400">{useful}</p><p className="mt-2 text-xs leading-5 text-amber-100">{reminder}</p><div className="mt-3 flex flex-wrap gap-2"><a className={buttonClass('secondary')} href={url} target="_blank" rel="noreferrer" onClick={() => showToolkitToast(setAssetToast, `Opening ${name}.`)}>Open website</a><button className={buttonClass('secondary')} onClick={() => { setResourceFavorites((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]); showToolkitToast(setAssetToast, resourceFavorites.includes(name) ? 'Resource favorite removed.' : 'Resource site saved.'); }}>{resourceFavorites.includes(name) ? 'Saved' : 'Favorite'}</button><button className={buttonClass('secondary')} onClick={() => showToolkitToast(setAssetToast, `Note added placeholder for ${name}.`)}>Add note</button></div></div>)}
            </div>
          </div>
        </div>
      </div>
      <button className={buttonClass('secondary')} onClick={() => setAdvancedWarnings((value) => !value)}>{advancedWarnings ? 'Hide advanced warnings' : 'Show advanced warnings'}</button>
      {advancedWarnings && <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 text-xs leading-6 text-zinc-300">Advanced warnings currently tracked: bubble adjacency, stair comfort limits, ventilation ratio, material price freshness, plot setup warnings, and render asset weight/missing-file flags.</div>}
    </section>
  );
}

function CompactStairCalculator() {
  const [stair, setStair] = useState({ type: 'Straight', unit: 'mm', direction: 'Up clockwise', landingType: 'Mid-landing', height: 3000, riser: 165, tread: 280, width: 1100, landing: 1200, floors: 2, headroom: 2100, maxRiser: 180, minTread: 250 });
  const stairCalc = useMemo(() => {
    const risers = Math.max(1, Math.round(stair.height / Math.max(stair.riser, 1)));
    const actualRiser = stair.height / risers;
    const treads = Math.max(1, risers - 1);
    const run = treads * stair.tread;
    const angle = Math.atan(stair.height / Math.max(run, 1)) * 180 / Math.PI;
    const comfort = 2 * actualRiser + stair.tread;
    const warnings = [
      actualRiser > stair.maxRiser ? 'Riser too high.' : '',
      stair.tread < stair.minTread ? 'Tread too shallow.' : '',
      angle > 38 ? 'Stair too steep.' : '',
      stair.width < 900 ? 'Width too narrow.' : '',
      stair.landing < 900 ? 'Landing too small.' : '',
      stair.headroom < 2000 ? 'Headroom too low.' : '',
    ].filter(Boolean);
    const score = Math.max(0, 100 - warnings.length * 15 - Math.max(0, Math.abs(625 - comfort) / 8));
    const status = warnings.length ? 'Warning' : 'Comfortable';
    return { risers, actualRiser, treads, run, angle, comfort, warnings, score: Math.round(score), status };
  }, [stair]);
  const unsafe = stairCalc.status !== 'Comfortable';

  return (
    <div className="rounded-lg border border-white/10 bg-[#11151b] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Stair Calculator</h3>
          <p className="mt-1 text-xs text-zinc-400">Live riser, tread, run, slope, and comfort check.</p>
        </div>
        <span className={`rounded px-2 py-1 text-[10px] font-bold ${stairCalc.status === 'Comfortable' ? 'bg-emerald-300 text-emerald-950' : 'bg-amber-300 text-amber-950'}`}>{stairCalc.status}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Stair type"><select className={inputClass()} value={stair.type} onChange={(event) => setStair({ ...stair, type: event.target.value })}>{['Straight', 'L-shaped', 'U-shaped', 'Spiral', 'Dog-leg'].map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Unit"><select className={inputClass()} value={stair.unit} onChange={(event) => setStair({ ...stair, unit: event.target.value })}><option>mm</option><option>meters</option></select></Field>
        <Field label="Direction"><select className={inputClass()} value={stair.direction} onChange={(event) => setStair({ ...stair, direction: event.target.value })}><option>Up clockwise</option><option>Up counterclockwise</option><option>Up north</option><option>Up east</option></select></Field>
        <Field label="Landing type"><select className={inputClass()} value={stair.landingType} onChange={(event) => setStair({ ...stair, landingType: event.target.value })}><option>Mid-landing</option><option>Quarter landing</option><option>Half landing</option><option>None</option></select></Field>
        {[
          ['height', 'Floor-to-floor height, mm'],
          ['riser', 'Desired riser height, mm'],
          ['tread', 'Desired tread depth, mm'],
          ['width', 'Stair width, mm'],
          ['landing', 'Landing depth, mm'],
          ['floors', 'Number of floors'],
          ['headroom', 'Headroom, mm'],
          ['maxRiser', 'Max riser limit, mm'],
          ['minTread', 'Min tread limit, mm'],
        ].map(([key, label]) => <div key={key}><Field label={label}><input className={inputClass()} type="number" value={stair[key as keyof typeof stair] as number} onChange={(event) => setStair({ ...stair, [key]: Number(event.target.value) })} /></Field></div>)}
      </div>
      <div className="mt-4 rounded-md border border-cyan-300/20 bg-[#080a0d] p-3">
        <div className="relative h-56 overflow-hidden rounded bg-[#0d1117]">
          {stair.type === 'Straight' && (
            <>
              {Array.from({ length: Math.min(stairCalc.treads, 13) }).map((_, index) => (
                <div
                  key={index}
                  className={`absolute bottom-10 border-b-2 border-r-2 ${unsafe ? 'border-amber-300' : 'border-cyan-300'}`}
                  style={{ left: `${7 + index * 6.4}%`, width: '6.4%', height: `${12 + index * 5.8}%` }}
                />
              ))}
            </>
          )}
          {stair.type === 'L-shaped' && (
            <div className="absolute inset-8">
              <div className="absolute left-2 top-24 h-14 w-32 border-2 border-cyan-300 bg-cyan-300/10" />
              <div className="absolute left-32 top-24 h-16 w-16 border-2 border-amber-300 bg-amber-300/10 text-center text-[10px] leading-[4rem] text-amber-100">Landing</div>
              <div className="absolute left-48 top-8 h-32 w-14 border-2 border-cyan-300 bg-cyan-300/10" />
              <span className="absolute left-8 top-20 text-[10px] text-cyan-100">Run 1 to landing</span>
              <span className="absolute left-52 top-4 text-[10px] text-cyan-100">Run 2 up</span>
            </div>
          )}
          {stair.type === 'U-shaped' && (
            <div className="absolute inset-8">
              <div className="absolute left-10 top-24 h-16 w-32 border-2 border-cyan-300 bg-cyan-300/10" />
              <div className="absolute left-[10.5rem] top-24 h-16 w-20 border-2 border-amber-300 bg-amber-300/10 text-center text-[10px] leading-[4rem] text-amber-100">180 deg</div>
              <div className="absolute left-[15.5rem] top-24 h-16 w-32 border-2 border-cyan-300 bg-cyan-300/10" />
              <span className="absolute left-16 top-20 text-[10px] text-cyan-100">Run 1</span>
              <span className="absolute left-72 top-20 text-[10px] text-cyan-100">Run 2</span>
            </div>
          )}
          {stair.type === 'Spiral' && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="relative h-40 w-40 rounded-full border-2 border-cyan-300/80">
                {Array.from({ length: 14 }).map((_, index) => (
                  <span
                    key={index}
                    className="absolute left-1/2 top-1/2 h-1 w-16 origin-left bg-cyan-300/70"
                    style={{ transform: `rotate(${index * 25}deg)` }}
                  />
                ))}
                <span className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300" />
              </div>
              <span className="absolute bottom-3 text-[10px] text-zinc-400">Simplified spiral stair preview.</span>
            </div>
          )}
          {stair.type === 'Dog-leg' && (
            <div className="absolute inset-8">
              <div className="absolute left-12 top-28 h-14 w-36 border-2 border-cyan-300 bg-cyan-300/10" />
              <div className="absolute left-44 top-[5.5rem] h-24 w-20 border-2 border-amber-300 bg-amber-300/10 text-center text-[10px] leading-[6rem] text-amber-100">Landing</div>
              <div className="absolute left-64 top-12 h-14 w-36 border-2 border-cyan-300 bg-cyan-300/10" />
              <span className="absolute left-16 top-24 text-[10px] text-cyan-100">Flight A</span>
              <span className="absolute left-72 top-8 text-[10px] text-cyan-100">Flight B</span>
            </div>
          )}
          <span className="absolute bottom-2 left-3 text-[10px] text-zinc-400">Run {(stairCalc.run / 1000).toFixed(2)} m | Height {(stair.height / 1000).toFixed(2)} m | Slope {stairCalc.angle.toFixed(1)} deg | Landing {stair.landing}mm</span>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-zinc-300 sm:grid-cols-5">
          <span>{stairCalc.risers} risers</span>
          <span>{stairCalc.actualRiser.toFixed(1)}mm R</span>
          <span>{stairCalc.treads} treads</span>
          <span>2R+T {stairCalc.comfort.toFixed(0)}mm</span>
          <span>Safety {stairCalc.score}/100</span>
        </div>
        {stairCalc.warnings[0] && <div className="mt-3 space-y-1">{stairCalc.warnings.map((warning) => <p key={warning} className="rounded border border-amber-300/30 bg-amber-300/10 p-2 text-xs text-amber-100">{warning}</p>)}</div>}
      </div>
    </div>
  );
}

function FloorPlanLab({
  form,
  setForm,
  spacings,
  setSpacings,
  showToolkit = true,
}: {
  form: FloorPlanForm;
  setForm: React.Dispatch<React.SetStateAction<FloorPlanForm>>;
  spacings: number[];
  setSpacings: React.Dispatch<React.SetStateAction<number[]>>;
  showToolkit?: boolean;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const layoutPreview = useMemo(() => {
    const width = Math.max(form.width, 1);
    const length = Math.max(form.length, 1);
    const xAxes = Math.max(spacings.length + 1, 2);
    const yAxes = Math.max(spacings.length + 1, 2);
    const ratio = width / length;
    const footprintWidthPercent = ratio >= 1 ? 92 : Math.max(48, ratio * 92);
    const footprintHeightPercent = ratio >= 1 ? Math.max(48, (1 / ratio) * 92) : 92;
    const wallInsetPercent = Math.min(14, Math.max(3, (form.wall / (Math.min(width, length) * 1000)) * 100));
    const columnWidthPercent = Math.min(5, Math.max(1.4, (form.columnW / (width * 1000)) * 100));
    const columnDepthPercent = Math.min(5, Math.max(1.4, (form.columnD / (length * 1000)) * 100));
    const columns = Array.from({ length: xAxes * yAxes }).map((_, index) => ({
      id: `column-${index}`,
      x: (index % xAxes) / (xAxes - 1),
      y: Math.floor(index / xAxes) / (yAxes - 1),
    }));
    return {
      xAxes,
      yAxes,
      columns,
      footprintWidthPercent,
      footprintHeightPercent,
      wallInsetPercent,
      columnWidthPercent,
      columnDepthPercent,
    };
  }, [form.columnD, form.columnW, form.length, form.wall, form.width, spacings.length]);

  const script = [
    '; ArchiVault Floor Plan Layout',
    '_RECTANGLE',
    '0,0',
    `${form.width * 1000},${form.length * 1000}`,
    '; grid and column placeholders generated from room spacings',
    '',
  ].join('\n');

  return (
    <div className="space-y-5">
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Spatial Planning Tools</h2>
          <p className="mt-1 text-sm text-zinc-400">Stair + Floor Plan Lab in one compact workspace.</p>
        </div>
        <span className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 font-mono text-[10px] text-cyan-100">mm / m</span>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[0.82fr_1.35fr]">
        <CompactStairCalculator />
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-base font-semibold text-white">Floor Plan Lab</h3>
        <p className="mt-1 text-sm text-zinc-400">Generate structural grid, wall outline, and column placeholder scripts.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Total Width, meters"><input className={inputClass()} type="number" value={form.width} onChange={(e) => setForm({ ...form, width: Number(e.target.value) })} /></Field>
          <Field label="Total Length, meters"><input className={inputClass()} type="number" value={form.length} onChange={(e) => setForm({ ...form, length: Number(e.target.value) })} /></Field>
          <Field label="Wall Thickness, mm"><input className={inputClass()} type="number" value={form.wall} onChange={(e) => setForm({ ...form, wall: Number(e.target.value) })} /></Field>
        </div>
        <div className="mt-4">
          <AdvancedToggle open={showAdvanced} onClick={() => setShowAdvanced((value) => !value)} />
        </div>
        {showAdvanced && <div className="mt-4 grid gap-4 rounded-md border border-white/10 bg-[#11151b] p-4 sm:grid-cols-2">
          <Field label="Column W, mm"><input className={inputClass()} type="number" value={form.columnW} onChange={(e) => setForm({ ...form, columnW: Number(e.target.value) })} /></Field>
          <Field label="Column D, mm"><input className={inputClass()} type="number" value={form.columnD} onChange={(e) => setForm({ ...form, columnD: Number(e.target.value) })} /></Field>
          <Field label="Rotation Angle, degrees"><input className={inputClass()} type="number" value={form.rotationAngle} onChange={(e) => setForm({ ...form, rotationAngle: Number(e.target.value) })} /></Field>
        </div>}
        {showAdvanced && <div className="mt-5 rounded-md border border-white/10 bg-[#11151b] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">Room Spacing Parameters</h4>
            <button className={buttonClass('secondary')} onClick={() => setSpacings((current) => [...current, 4])}>Add</button>
          </div>
          <div className="space-y-2">
            {spacings.map((value, index) => (
              <div key={`${index}-${value}`} className="flex gap-2">
                <input className={inputClass()} type="number" value={value} onChange={(e) => setSpacings((current) => current.map((item, itemIndex) => itemIndex === index ? Number(e.target.value) : item))} />
                <button className="rounded-md px-2 text-zinc-500 hover:bg-red-400/10 hover:text-red-300" onClick={() => setSpacings((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>}
        <button className={`${buttonClass()} mt-5 w-full`} onClick={() => downloadText('ArchiVault_Floor_Plan_Layout.scr', script)}>Generate Parametric Layout Script</button>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-base font-semibold text-white">Structural Layout Preview</h3>
        <p className="mt-1 text-xs text-zinc-500">{layoutPreview.xAxes} vertical axes · {layoutPreview.yAxes} horizontal axes · {layoutPreview.columns.length} columns</p>
        <div className="mt-5 aspect-[1.35/1] rounded-md border border-white/10 bg-[#11151b] p-6">
          <div className="grid h-full w-full place-items-center">
          <div
            className="relative border-2 border-cyan-300/70 bg-cyan-300/5"
            style={{
              width: `${layoutPreview.footprintWidthPercent}%`,
              height: `${layoutPreview.footprintHeightPercent}%`,
              transform: `rotate(${form.rotationAngle}deg)`,
              transformOrigin: 'center',
            }}
          >
            <div
              className="absolute border border-cyan-100/70"
              style={{
                inset: `${layoutPreview.wallInsetPercent}%`,
              }}
            />
            {Array.from({ length: layoutPreview.xAxes }).map((_, index) => <div key={`x-${index}`} className="absolute top-0 h-full border-l border-dashed border-cyan-300/25" style={{ left: `${(index / (layoutPreview.xAxes - 1)) * 100}%` }} />)}
            {Array.from({ length: layoutPreview.yAxes }).map((_, index) => <div key={`y-${index}`} className="absolute left-0 w-full border-t border-dashed border-cyan-300/25" style={{ top: `${(index / (layoutPreview.yAxes - 1)) * 100}%` }} />)}
            {layoutPreview.columns.map((column) => (
              <span
                key={column.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100 bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.55)]"
                style={{
                  left: `${column.x * 100}%`,
                  top: `${column.y * 100}%`,
                  width: `${layoutPreview.columnWidthPercent}%`,
                  height: `${layoutPreview.columnDepthPercent}%`,
                  minWidth: '7px',
                  minHeight: '7px',
                }}
              />
            ))}
          </div>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[11px] uppercase text-zinc-500">Footprint</p><p className="text-sm font-semibold text-white">{form.width} x {form.length} m</p></div>
          <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[11px] uppercase text-zinc-500">Wall</p><p className="text-sm font-semibold text-white">{form.wall} mm</p></div>
          <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[11px] uppercase text-zinc-500">Column</p><p className="text-sm font-semibold text-white">{form.columnW} x {form.columnD} mm</p></div>
          <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[11px] uppercase text-zinc-500">Rotation</p><p className="text-sm font-semibold text-white">{form.rotationAngle} deg</p></div>
        </div>
      </div>
        </div>
      </div>
    </section>
    {showToolkit && <LiveArchitectureToolkit />}
    </div>
  );
}

function ScaleLayoutLab({
  state,
  setState,
}: {
  state: ScaleLabState;
  setState: React.Dispatch<React.SetStateAction<ScaleLabState>>;
}) {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [budgetCheckedAt, setBudgetCheckedAt] = useState('');
  const [assetWeightNote, setAssetWeightNote] = useState('');
  const [scaleGuideOpen, setScaleGuideOpen] = useState(false);
  const [scaleAssistant, setScaleAssistant] = useState({
    drawingType: 'Floor Plan',
    sheet: 'A1',
    realWidth: 18,
    realHeight: 12,
    unit: 'meters',
    selectedScale: 100,
    note: 'Good for presentation boards with labels and dimensions.',
  });
  const [assetMetrics, setAssetMetrics] = useState({
    lines: 5200,
    polylines: 980,
    blocks: 260,
    hatches: 140,
    text: 420,
    layers: 76,
    duplicates: 380,
    tinyFragments: 240,
    unusedLayers: 18,
    nestedBlocks: 34,
  });
  const [assetAnalyzedAt, setAssetAnalyzedAt] = useState('');
  const [recommendationNote, setRecommendationNote] = useState('');
  const { scaleForm, board, printSheet, lineWeights, converterMode, realSize, drawingSize, converterScale, targetScale, budgetViews } = state;
  const scaleMath = useMemo(() => {
    const sheetSizes = Object.fromEntries(paperSizes.map((paper) => [paper.name, [paper.width, paper.height] as [number, number]]));
    const sheet = sheetSizes[scaleForm.sheet] ?? sheetSizes.A1;
    const drawing = { width: (scaleForm.realWidth * 1000) / scaleForm.scale, length: (scaleForm.realLength * 1000) / scaleForm.scale };
    const fits = drawing.width <= sheet[0] && drawing.length <= sheet[1];
    const bestFitRaw = Math.max((scaleForm.realWidth * 1000) / sheet[0], (scaleForm.realLength * 1000) / sheet[1]);
    const standardScales = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000, 1250, 2500, 5000, 10000];
    const bestFitScale = standardScales.find((scale) => scale >= bestFitRaw) ?? Math.ceil(bestFitRaw);
    const drawingPreviewWidth = Math.min((drawing.width / sheet[0]) * 100, 112);
    const drawingPreviewHeight = Math.min((drawing.length / sheet[1]) * 100, 112);
    const textHeightModelMm = 2.5 * converterScale;
    const converterResult = converterMode === 'real-to-drawing'
      ? `${((realSize * 1000) / converterScale).toFixed(0)} mm`
      : converterMode === 'drawing-to-real'
        ? `${((drawingSize * converterScale) / 1000).toFixed(2)} m`
        : converterMode === 'scale-to-scale'
          ? `${(drawingSize * (converterScale / targetScale)).toFixed(0)} mm`
          : `1:${Math.max(1, Math.round((realSize * 1000) / Math.max(drawingSize, 0.1)))}`;
    return { sheet, drawing, fits, bestFitScale, drawingPreviewWidth, drawingPreviewHeight, textHeightModelMm, converterResult };
  }, [converterMode, converterScale, drawingSize, realSize, scaleForm.realLength, scaleForm.realWidth, scaleForm.scale, scaleForm.sheet, targetScale]);
  const { sheet, drawing, fits, bestFitScale, drawingPreviewWidth, drawingPreviewHeight, textHeightModelMm, converterResult } = scaleMath;
  const budgetMath = useMemo(() => {
    const selectedPrintSheet = paperSizes.find((paper) => paper.name === printSheet) ?? paperSizes[1];
    const margin = 20;
    const gap = 12;
    const titleBlock = { x: selectedPrintSheet.width - 150, y: selectedPrintSheet.height - 58, w: 130, h: 38 };
    let cursorX = margin;
    let cursorY = margin;
    let rowHeight = 0;
    const placedViews = budgetViews.map((view) => {
      const w = (view.width * 1000) / Math.max(view.scale, 1);
      const h = (view.height * 1000) / Math.max(view.scale, 1);
      if (cursorX + w > selectedPrintSheet.width - margin) {
        cursorX = margin;
        cursorY += rowHeight + gap;
        rowHeight = 0;
      }
      const rect = { ...view, x: cursorX, y: cursorY, w, h };
      cursorX += w + gap;
      rowHeight = Math.max(rowHeight, h);
      return rect;
    });
    const budgetUsedWidth = Math.max(...placedViews.map((view) => view.x + view.w), margin) + margin;
    const budgetUsedHeight = Math.max(...placedViews.map((view) => view.y + view.h), margin) + margin;
    const warnings: string[] = [];
    const criticalIssues: string[] = [];
    placedViews.forEach((view, index) => {
      if (view.scale <= 0) criticalIssues.push(`${view.label} has an invalid scale.`);
      if (view.x < margin || view.y < margin || view.x + view.w > selectedPrintSheet.width - margin || view.y + view.h > selectedPrintSheet.height - margin) criticalIssues.push(`${view.label} is outside the printable margin.`);
      if (rectsOverlap(view, titleBlock)) criticalIssues.push(`Warning: ${view.label} overlaps with title block.`);
      placedViews.slice(index + 1).forEach((other) => {
        if (rectsOverlap(view, other)) criticalIssues.push(`${view.label} overlaps with ${other.label}.`);
        const closeX = Math.abs((view.x + view.w) - other.x) < gap || Math.abs((other.x + other.w) - view.x) < gap;
        const verticallyAligned = view.y < other.y + other.h && view.y + view.h > other.y;
        if (closeX && verticallyAligned) warnings.push(`${view.label} is too close to ${other.label}; add at least ${gap}mm spacing.`);
      });
    });
    if (!['A0', 'A1', 'A2', 'A3', 'A4'].includes(selectedPrintSheet.name)) criticalIssues.push('Selected sheet size is not a standard A-series plotting sheet.');
    if (!budgetViews.some((view) => /plan/i.test(view.label))) warnings.push('No floor plan view detected.');
    if (!budgetViews.some((view) => /elev/i.test(view.label))) warnings.push('No elevation view detected.');
    if (Object.keys(lineWeights).length < 6) warnings.push('Some line weight assignments are missing.');
    const budgetFits = criticalIssues.length === 0 && budgetUsedWidth <= selectedPrintSheet.width && budgetUsedHeight <= selectedPrintSheet.height;
    const passedChecks = [
      selectedPrintSheet.name.startsWith('A') ? 'Selected sheet size is valid.' : '',
      budgetFits ? 'Drawing views fit inside selected sheet.' : '',
      criticalIssues.every((item) => !item.includes('title block')) ? 'Title block does not overlap views.' : '',
      budgetViews.length > 0 ? 'Required drawing views are present.' : '',
      Object.keys(lineWeights).length > 0 ? 'Line weights are assigned.' : '',
      budgetViews.every((view) => view.scale > 0) ? 'Scale values are valid.' : '',
    ].filter(Boolean);
    const plotReadiness = Math.max(0, Math.min(100, Math.round(100 - warnings.length * 8 - criticalIssues.length * 18)));
    const aSheets = paperSizes.filter((paper) => ['A4', 'A3', 'A2', 'A1', 'A0'].includes(paper.name));
    const recommendedSheet = aSheets.find((paper) => budgetUsedWidth <= paper.width && budgetUsedHeight <= paper.height) ?? paperSizes[0];
    const recommendedSheetExplanation = `Recommended Sheet: ${recommendedSheet.name} because smaller checked sheets cannot safely hold ${budgetViews.map((view) => view.label).join(', ') || 'the current views'} with margins, spacing, and the title block.`;
    const commonScales = [20, 25, 50, 75, 100, 150, 200, 250, 500];
    const scaleSuggestions = budgetViews.map((view) => {
      const scale = commonScales.find((candidate) => (view.width * 1000) / candidate <= selectedPrintSheet.width - 190 && (view.height * 1000) / candidate <= selectedPrintSheet.height - 80) ?? 500;
      return `${view.label}: 1:${scale}`;
    });
    return { selectedPrintSheet, budgetUsedWidth, budgetUsedHeight, budgetFits, placedViews, titleBlock, warnings, criticalIssues, passedChecks, plotReadiness, recommendedSheet, recommendedSheetExplanation, scaleSuggestions };
  }, [budgetViews, lineWeights, printSheet]);
  const { selectedPrintSheet, budgetUsedWidth, budgetUsedHeight, budgetFits, placedViews, titleBlock, warnings, criticalIssues, passedChecks, plotReadiness, recommendedSheetExplanation, scaleSuggestions } = budgetMath;
  const scaleAssistantMath = useMemo(() => {
    const sheetInfo = paperSizes.find((paper) => paper.name === scaleAssistant.sheet) ?? paperSizes[1];
    const titleBlockWidth = Math.min(150, sheetInfo.width * 0.24);
    const margin = 20;
    const availableWidth = Math.max(20, sheetInfo.width - margin * 2 - titleBlockWidth);
    const availableHeight = Math.max(20, sheetInfo.height - margin * 2);
    const realWidthMm = scaleAssistant.unit === 'meters' ? scaleAssistant.realWidth * 1000 : scaleAssistant.realWidth;
    const realHeightMm = scaleAssistant.unit === 'meters' ? scaleAssistant.realHeight * 1000 : scaleAssistant.realHeight;
    const commonScales = [20, 25, 50, 75, 100, 150, 200, 250, 500, 1000];
    const drawingType = scaleAssistant.drawingType;
    const typePreferred = drawingType.includes('Detail') ? [20, 25, 50] : drawingType === 'Site Plan' ? [200, 250, 500] : drawingType === 'Master Plan' ? [500, 1000] : drawingType === 'Urban Context' ? [1000, 500] : [50, 75, 100, 150];
    const fitsAt = (scale: number) => realWidthMm / scale <= availableWidth && realHeightMm / scale <= availableHeight;
    const recommendedScale = typePreferred.find(fitsAt) ?? commonScales.find(fitsAt) ?? 1000;
    const alternativeScale = commonScales.find((scale) => scale > recommendedScale && fitsAt(scale)) ?? recommendedScale;
    const selectedWidth = realWidthMm / scaleAssistant.selectedScale;
    const selectedHeight = realHeightMm / scaleAssistant.selectedScale;
    const fillRatio = Math.max(selectedWidth / availableWidth, selectedHeight / availableHeight);
    const fitStatus = fillRatio > 1 ? 'Too large for sheet' : fillRatio > 0.86 ? 'Fits but tight' : fillRatio < 0.12 ? 'Too small / details may not be readable' : 'Fits well';
    const warnings = [
      fillRatio > 1 ? `${scaleAssistant.selectedScale === 20 ? '1:20 is too detailed for this sheet size.' : `1:${scaleAssistant.selectedScale} is too large for ${scaleAssistant.sheet}.`}` : '',
      fillRatio < 0.12 ? `1:${scaleAssistant.selectedScale} may be too small for readable labels.` : '',
      scaleAssistant.sheet === 'A4' && ['Floor Plan', 'Section', 'Elevation'].includes(drawingType) && realWidthMm > 8000 ? 'A4 may be too small for this floor plan.' : '',
      drawingType.includes('Detail') && scaleAssistant.selectedScale >= 100 ? 'Detail drawing uses a scale that is too small.' : '',
      drawingType.includes('Site') && scaleAssistant.selectedScale <= 50 ? 'Site plan uses a scale that is too detailed.' : '',
      selectedWidth > availableWidth || selectedHeight > availableHeight ? 'Leave space for title block and dimensions.' : '',
    ].filter(Boolean);
    const explanation = `Recommended Scale: 1:${recommendedScale}. This works well for ${drawingType.toLowerCase()} on ${scaleAssistant.sheet} and keeps enough space for labels, dimensions, and title block.`;
    const comparisons = [recommendedScale, alternativeScale, scaleAssistant.selectedScale]
      .filter((scale, index, array) => array.indexOf(scale) === index)
      .slice(0, 3)
      .map((scale) => {
        const width = realWidthMm / scale;
        const height = realHeightMm / scale;
        const ratio = Math.max(width / availableWidth, height / availableHeight);
        return {
          scale,
          width,
          height,
          fit: ratio <= 1,
          readability: scale <= 100 ? 'High' : scale <= 250 ? 'Medium' : 'Low',
          quality: ratio > 1 ? 'Does not fit' : ratio > 0.86 ? 'Tight but usable' : ratio < 0.12 ? 'Too small' : 'Best balance',
        };
      });
    return { sheetInfo, titleBlockWidth, availableWidth, availableHeight, realWidthMm, realHeightMm, recommendedScale, alternativeScale, selectedWidth, selectedHeight, fitStatus, warnings, explanation, comparisons };
  }, [scaleAssistant]);
  const assetAnalysis = useMemo(() => {
    const totalObjects = assetMetrics.lines + assetMetrics.polylines + assetMetrics.blocks + assetMetrics.hatches + assetMetrics.text;
    const penalty = totalObjects / 260 + assetMetrics.hatches * 0.18 + assetMetrics.blocks * 0.12 + assetMetrics.duplicates * 0.11 + assetMetrics.layers * 0.28 + assetMetrics.tinyFragments * 0.08 + assetMetrics.nestedBlocks * 0.45;
    const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
    const status = score >= 75 ? 'Light' : score >= 55 ? 'Moderate' : score >= 32 ? 'Heavy' : 'Critical';
    const lagRisk = score >= 75 ? 'LOW: safe for laptop' : score >= 55 ? 'MEDIUM: clean before plotting/importing' : score >= 32 ? 'HIGH: purge and simplify' : 'CRITICAL: likely to lag in SketchUp/Revit';
    return { totalObjects, score, status, lagRisk };
  }, [assetMetrics]);

  function updateBudgetView(id: string, patch: Partial<BudgetView>) {
    setState((current) => ({
      ...current,
      budgetViews: current.budgetViews.map((view) => view.id === id ? { ...view, ...patch } : view),
    }));
  }

  async function importViewsFromCsv(file: File) {
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const header = lines[0]?.split(',').map((value) => value.trim().toLowerCase()) ?? [];
    const hasNamedColumns = header.includes('view_name') || header.includes('width_mm');
    const rows = hasNamedColumns ? lines.slice(1) : lines;
    const cell = (cells: string[], name: string, fallbackIndex: number) => {
      const index = header.indexOf(name);
      return cells[index >= 0 ? index : fallbackIndex] ?? '';
    };
    const importedViews = rows
      .map((row) => row.split(',').map((value) => value.trim()))
      .filter((cells) => cells.length >= 4)
      .map((cells) => ({
        id: crypto.randomUUID(),
        label: cell(cells, 'view_name', 0) || 'Imported View',
        width: Number(cell(cells, 'width_mm', 1)) >= 100 ? Number(cell(cells, 'width_mm', 1)) / 1000 : Number(cell(cells, 'width_mm', 1)) || 10,
        height: Number(cell(cells, 'height_mm', 2)) >= 100 ? Number(cell(cells, 'height_mm', 2)) / 1000 : Number(cell(cells, 'height_mm', 2)) || 8,
        scale: Number(cell(cells, 'scale', 3)) || 100,
        viewType: cell(cells, 'view_type', 4) || 'drawing',
        priority: Number(cell(cells, 'priority', 5)) || 2,
      }));
    if (!importedViews.length) return;
    setState((current) => ({ ...current, budgetViews: [...current.budgetViews, ...importedViews] }));
    logWorkflow('import_csv_view_list', `${importedViews.length} drawing views imported from ${file.name}`, 0, file.name);
  }

  function generatePlotStyleGuide() {
    const rows = [
      ['Layer Name', 'Color', 'Lineweight', 'Usage', 'Recommended Plot Style'],
      ...lineWeightPresets.map((preset) => [preset.layer, String(preset.color), `${(lineWeights[preset.name] ?? preset.active).toFixed(2)}mm`, preset.usage, preset.style]),
    ].map((row) => row.join(',')).join('\n');
    downloadText('ArchiVault_CTB_STB_Plot_Style_Guide.csv', rows);
    logWorkflow('generate_plot_style_guide', 'CTB/STB plot style CSV exported from line weight catalog.', 0, 'ArchiVault_CTB_STB_Plot_Style_Guide.csv');
  }

  function recommendSheetSize() {
    setState((current) => ({ ...current, printSheet: budgetMath.recommendedSheet.name }));
    setRecommendationNote(budgetMath.recommendedSheetExplanation);
    logWorkflow('recommend_sheet_size', budgetMath.recommendedSheetExplanation, warnings.length + criticalIssues.length);
  }

  function logScaleRecommendation() {
    logWorkflow('scale_recommendation', scaleAssistantMath.explanation, scaleAssistantMath.warnings.length);
  }

  function exportScaleGuideCsv() {
    const rows = [
      ['Scale', 'Best Use Case', 'Drawing Type', 'Recommended Sheet', 'Detail Level', 'Warning/Notes'],
      ...scaleReferenceDetails.map((row) => [row.label, row.use, row.type, row.sheet, row.detail, row.notes]),
    ].map((row) => row.join(',')).join('\n');
    downloadText('ArchiVault_Scale_Reference_Guide.csv', rows);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <div className="grid gap-2 text-xs sm:grid-cols-3">
          {['1. Input Size', '2. Select Scale', '3. Generate'].map((step, index) => (
            <div key={step} className={`rounded-md border p-3 ${index === 0 ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-[#11151b] text-zinc-400'}`}>{step}</div>
          ))}
        </div>
      </div>
      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Scale Safety Calculator</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Real Width, meters"><input className={inputClass()} type="number" value={scaleForm.realWidth} onChange={(e) => setState((current) => ({ ...current, scaleForm: { ...current.scaleForm, realWidth: Number(e.target.value) } }))} /></Field>
            <Field label="Real Length, meters"><input className={inputClass()} type="number" value={scaleForm.realLength} onChange={(e) => setState((current) => ({ ...current, scaleForm: { ...current.scaleForm, realLength: Number(e.target.value) } }))} /></Field>
            <Field label="Sheet Size"><select className={inputClass()} value={scaleForm.sheet} onChange={(e) => setState((current) => ({ ...current, scaleForm: { ...current.scaleForm, sheet: e.target.value } }))}>{paperSizes.map((paper) => <option key={paper.name}>{paper.name}</option>)}</select></Field>
            <Field label="Scale Factor"><input className={inputClass()} type="number" value={scaleForm.scale} onChange={(e) => setState((current) => ({ ...current, scaleForm: { ...current.scaleForm, scale: Number(e.target.value) } }))} /></Field>
          </div>
          <div className={`mt-5 rounded-md border p-4 ${fits ? 'border-emerald-300/30 bg-emerald-300/10' : 'border-red-300/30 bg-red-300/10'}`}>
            <p className="flex items-center gap-2 font-semibold text-white">{fits ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : <XCircle className="h-5 w-5 text-red-300" />}{fits ? 'Fits printable boundary' : 'Scale overflows selected sheet'}</p>
            <p className="mt-2 text-sm text-zinc-300">Drawing: {drawing.width.toFixed(0)} x {drawing.length.toFixed(0)} mm · Boundary: {sheet[0]} x {sheet[1]} mm</p>
            <button className={`${buttonClass('secondary')} mt-3`} onClick={() => setState((current) => ({ ...current, scaleForm: { ...current.scaleForm, scale: bestFitScale } }))}>Find Best Fit 1:{bestFitScale}</button>
          </div>
          <div className="mt-5 rounded-md border border-white/10 bg-[#080a0d] p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Sheet Fit Visual Preview</p>
            <div className="mx-auto aspect-[1.414/1] max-w-md rounded border border-cyan-300/30 bg-[#11151b] p-3">
              <div className="relative h-full w-full overflow-hidden rounded-sm border border-emerald-300/30 bg-[linear-gradient(90deg,rgba(34,211,238,.09)_1px,transparent_1px),linear-gradient(rgba(34,211,238,.09)_1px,transparent_1px)] bg-[size:25%_25%]">
                <div
                  className={`absolute rounded-sm border ${fits ? 'border-cyan-200 bg-cyan-300/25' : 'border-red-200 bg-red-300/25'}`}
                  style={{
                    left: `${Math.max((100 - Math.min(drawingPreviewWidth, 100)) / 2, 0)}%`,
                    top: `${Math.max((100 - Math.min(drawingPreviewHeight, 100)) / 2, 0)}%`,
                    width: `${Math.max(drawingPreviewWidth, 4)}%`,
                    height: `${Math.max(drawingPreviewHeight, 4)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Golden Layout Guide</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Board Width, mm"><input className={inputClass()} type="number" value={board.width} onChange={(e) => setState((current) => ({ ...current, board: { ...current.board, width: Number(e.target.value) } }))} /></Field>
            <Field label="Board Height, mm"><input className={inputClass()} type="number" value={board.height} onChange={(e) => setState((current) => ({ ...current, board: { ...current.board, height: Number(e.target.value) } }))} /></Field>
          </div>
          <div className="mt-5 aspect-[1.414/1] rounded-md border border-cyan-300/30 bg-[#11151b] bg-[linear-gradient(90deg,rgba(34,211,238,.13)_1px,transparent_1px),linear-gradient(rgba(34,211,238,.13)_1px,transparent_1px)] bg-[size:33.33%_50%]" />
        </div>
      </section>
      <section className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Architectural Scale Converter</h3>
          <p className="mt-1 text-sm text-zinc-400">Convert real sizes, drawing sizes, and scale ratios before plotting.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ['real-to-drawing', 'Real to Drawing'],
              ['drawing-to-real', 'Drawing to Real'],
              ['scale-to-scale', 'Scale to Scale'],
              ['find-scale', 'Find Scale'],
            ].map(([mode, label]) => (
              <button key={mode} className={converterMode === mode ? buttonClass() : buttonClass('secondary')} onClick={() => setState((current) => ({ ...current, converterMode: mode as typeof converterMode }))}>{label}</button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {(converterMode === 'real-to-drawing' || converterMode === 'find-scale') && <Field label="Real Size (m)"><input className={inputClass()} type="number" value={realSize} onChange={(event) => setState((current) => ({ ...current, realSize: Number(event.target.value) }))} /></Field>}
            {(converterMode === 'drawing-to-real' || converterMode === 'scale-to-scale' || converterMode === 'find-scale') && <Field label="Drawing Size (mm)"><input className={inputClass()} type="number" value={drawingSize} onChange={(event) => setState((current) => ({ ...current, drawingSize: Number(event.target.value) }))} /></Field>}
            {converterMode !== 'find-scale' && <Field label={converterMode === 'scale-to-scale' ? 'From Scale' : 'Scale'}><select className={inputClass()} value={converterScale} onChange={(event) => setState((current) => ({ ...current, converterScale: Number(event.target.value) }))}>{[1, 2, 5, 10, 20, 25, 50, 75, 100, 200, 500, 1000].map((scale) => <option key={scale} value={scale}>1:{scale}</option>)}</select></Field>}
            {converterMode === 'scale-to-scale' && <Field label="To Scale"><select className={inputClass()} value={targetScale} onChange={(event) => setState((current) => ({ ...current, targetScale: Number(event.target.value) }))}>{[1, 2, 5, 10, 20, 25, 50, 75, 100, 200, 500, 1000].map((scale) => <option key={scale} value={scale}>1:{scale}</option>)}</select></Field>}
          </div>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-4"><p className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">Result</p><p className="mt-1 text-2xl font-bold text-cyan-100">{converterResult}</p><p className="mt-2 text-xs text-cyan-100/70">Metric mode uses meters for real dimensions and millimeters for plotted drawings.</p><p className="mt-3 rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-cyan-50">Smart annotation advice: at 1:{converterScale}, use 2.5mm plotted text, or {textHeightModelMm.toFixed(0)}mm model-space text height in AutoCAD.</p></div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">Scale Reference Chart</h3>
              <p className="mt-1 text-sm text-zinc-400">Interactive scale assistant for plans, sections, details, site plans, and boards.</p>
            </div>
            <span className={`rounded px-2 py-1 text-xs font-semibold ${scaleAssistantMath.fitStatus === 'Fits well' ? 'bg-emerald-300 text-emerald-950' : scaleAssistantMath.fitStatus === 'Fits but tight' ? 'bg-amber-300 text-amber-950' : scaleAssistantMath.fitStatus.startsWith('Too large') ? 'bg-red-300 text-red-950' : 'bg-cyan-300 text-cyan-950'}`}>{scaleAssistantMath.fitStatus}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {scalePresets.map((preset) => (
              <button key={preset.name} className={buttonClass('secondary')} onClick={() => setScaleAssistant({ drawingType: preset.type, sheet: preset.sheet, selectedScale: preset.scale, realWidth: preset.width, realHeight: preset.height, unit: preset.unit, note: preset.note })}>{preset.name}</button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Drawing type"><select className={inputClass()} value={scaleAssistant.drawingType} onChange={(event) => setScaleAssistant({ ...scaleAssistant, drawingType: event.target.value })}>{['Floor Plan', 'Section', 'Elevation', 'Room Detail', 'Interior Detail', 'Site Plan', 'Master Plan', 'Urban Context'].map((item) => <option key={item}>{item}</option>)}</select></Field>
              <Field label="Sheet size"><select className={inputClass()} value={scaleAssistant.sheet} onChange={(event) => setScaleAssistant({ ...scaleAssistant, sheet: event.target.value })}>{['A0', 'A1', 'A2', 'A3', 'A4'].map((item) => <option key={item}>{item}</option>)}</select></Field>
              <Field label={`Real width, ${scaleAssistant.unit === 'meters' ? 'm' : 'mm'}`}><input className={inputClass()} type="number" value={scaleAssistant.realWidth} onChange={(event) => setScaleAssistant({ ...scaleAssistant, realWidth: Number(event.target.value) })} /></Field>
              <Field label={`Real height, ${scaleAssistant.unit === 'meters' ? 'm' : 'mm'}`}><input className={inputClass()} type="number" value={scaleAssistant.realHeight} onChange={(event) => setScaleAssistant({ ...scaleAssistant, realHeight: Number(event.target.value) })} /></Field>
              <Field label="Unit"><select className={inputClass()} value={scaleAssistant.unit} onChange={(event) => setScaleAssistant({ ...scaleAssistant, unit: event.target.value })}><option value="meters">meters</option><option value="mm">mm</option></select></Field>
              <Field label="Selected scale"><select className={inputClass()} value={scaleAssistant.selectedScale} onChange={(event) => setScaleAssistant({ ...scaleAssistant, selectedScale: Number(event.target.value) })}>{[20, 25, 50, 75, 100, 150, 200, 250, 500, 1000].map((scale) => <option key={scale} value={scale}>1:{scale}</option>)}</select></Field>
            </div>
            <div className="rounded-md border border-cyan-300/20 bg-[#080a0d] p-4">
              <div className="relative mx-auto aspect-[1.414/1] max-w-md rounded border border-zinc-300/50 bg-[#11151b] p-3">
                <div className="absolute border border-dashed border-cyan-300/50" style={{ left: '5%', top: '7%', width: '80%', height: '86%' }} />
                <div className="absolute bottom-[7%] right-[5%] h-[18%] w-[18%] border border-amber-300/60 bg-amber-300/10 p-1 text-[9px] text-amber-100">Title block</div>
                <div className={`absolute rounded-sm border ${scaleAssistantMath.fitStatus === 'Fits well' ? 'border-emerald-200 bg-emerald-300/20' : scaleAssistantMath.fitStatus === 'Fits but tight' ? 'border-amber-200 bg-amber-300/20' : scaleAssistantMath.fitStatus.startsWith('Too large') ? 'border-red-200 bg-red-300/20' : 'border-cyan-200 bg-cyan-300/20'}`} style={{ left: '8%', top: '12%', width: `${Math.min(95, Math.max(5, (scaleAssistantMath.selectedWidth / scaleAssistantMath.sheetInfo.width) * 100))}%`, height: `${Math.min(95, Math.max(5, (scaleAssistantMath.selectedHeight / scaleAssistantMath.sheetInfo.height) * 100))}%` }}>
                  <span className="p-1 text-[9px] text-white">1:{scaleAssistant.selectedScale}</span>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-cyan-100">{scaleAssistantMath.explanation}</p>
              {scaleAssistantMath.warnings[0] && <p className="mt-2 rounded border border-amber-300/30 bg-amber-300/10 p-2 text-xs text-amber-100">{scaleAssistantMath.warnings[0]}</p>}
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {scaleAssistantMath.comparisons.map((item) => (
              <div key={item.scale} className={`rounded-md border p-3 ${item.quality === 'Best balance' ? 'border-emerald-300/30 bg-emerald-300/10' : item.fit ? 'border-cyan-300/20 bg-cyan-300/10' : 'border-red-300/30 bg-red-300/10'}`}>
                <p className="font-mono text-sm font-semibold text-white">1:{item.scale}</p>
                <p className="mt-1 text-xs text-zinc-300">{item.width.toFixed(0)}mm x {item.height.toFixed(0)}mm on paper</p>
                <p className="mt-1 text-xs text-zinc-400">Readability: {item.readability} · {item.quality}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 max-h-72 overflow-y-auto rounded-md border border-white/10">
            <table className="w-full text-left text-xs">
              <tbody>{scaleReferenceDetails.map((row) => <tr key={row.label} className="border-b border-white/5 transition hover:bg-white/[0.04]"><td className="p-2 font-mono text-cyan-200">{row.label}</td><td className="p-2 text-white">{row.use}</td><td className="p-2 text-zinc-400">{row.type}</td><td className="p-2 text-zinc-400">{row.sheet}</td><td className="p-2 text-zinc-300">{row.detail}</td><td className="p-2 text-zinc-500">{row.tags.map((tag) => <span key={tag} className="mr-1 inline-block rounded border border-cyan-300/20 bg-cyan-300/10 px-1.5 py-0.5 text-[10px] text-cyan-100">{tag}</span>)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={buttonClass()} onClick={logScaleRecommendation}>Recommend Scale</button>
            <button className={buttonClass('secondary')} onClick={() => navigator.clipboard?.writeText(`Recommended Scale: 1:${scaleAssistantMath.recommendedScale}`)}>Copy recommended scale</button>
            <button className={buttonClass('secondary')} onClick={exportScaleGuideCsv}>Export scale guide as CSV</button>
            <button className={buttonClass('secondary')} onClick={() => logWorkflow('scale_note_saved', scaleAssistantMath.explanation, scaleAssistantMath.warnings.length)}>Save to project notes</button>
            <button className={buttonClass('secondary')} onClick={() => setState((current) => ({ ...current, budgetViews: [...current.budgetViews, { id: crypto.randomUUID(), label: scaleAssistant.drawingType, width: scaleAssistant.realWidth, height: scaleAssistant.realHeight, scale: scaleAssistantMath.recommendedScale, viewType: scaleAssistant.drawingType, priority: 2 }] }))}>Add to layout planner</button>
          </div>
          <div className="mt-3 rounded-md border border-white/10 bg-[#11151b] p-3">
            <button className="text-xs font-semibold text-cyan-200" onClick={() => setScaleGuideOpen((value) => !value)}>{scaleGuideOpen ? 'Hide' : 'Show'} how scale works</button>
            {scaleGuideOpen && <p className="mt-2 text-xs leading-5 text-zinc-400">Paper size = Real size / Scale. Real size = Paper size x Scale. Example: a 10,000mm wall at 1:100 becomes 100mm on paper.</p>}
          </div>
        </div>
      </section>
      <BoardAutoLayoutPlanner />
      <div className="flex justify-end"><AdvancedToggle open={showAdvanced} onClick={() => setShowAdvanced((value) => !value)} /></div>
      {showAdvanced && (
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Print Layout Budget Panel</h3>
          <p className="mt-2 text-sm text-zinc-400">Add drawing views and verify sheet fit.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[0.45fr_1fr]">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importViewsFromCsv(file);
                event.currentTarget.value = '';
              }}
            />
            <select className={inputClass()} value={printSheet} onChange={(event) => setState((current) => ({ ...current, printSheet: event.target.value }))}>
              {paperSizes.map((paper) => <option key={paper.name}>{paper.name}</option>)}
            </select>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className={buttonClass('secondary')} onClick={() => setState((current) => ({ ...current, budgetViews: [...current.budgetViews, { id: crypto.randomUUID(), label: 'New View', width: 10, height: 8, scale: 100 }] }))}>Add Drawing View</button>
              <button className={buttonClass('secondary')} onClick={() => csvInputRef.current?.click()}>Import CSV View List</button>
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-500">CSV columns supported: view_name, width_mm, height_mm, scale, view_type, priority.</p>
          <div className="mt-3 space-y-2">
            {budgetViews.map((view) => (
              <div key={view.id} className="grid gap-2 rounded-md border border-white/10 bg-[#11151b] p-2 md:grid-cols-[1fr_0.7fr_0.7fr_0.65fr_0.7fr_0.5fr_auto]">
                <input className={inputClass()} value={view.label} onChange={(event) => updateBudgetView(view.id, { label: event.target.value })} />
                <input className={inputClass()} type="number" value={view.width} onChange={(event) => updateBudgetView(view.id, { width: Number(event.target.value) })} />
                <input className={inputClass()} type="number" value={view.height} onChange={(event) => updateBudgetView(view.id, { height: Number(event.target.value) })} />
                <input className={inputClass()} type="number" value={view.scale} onChange={(event) => updateBudgetView(view.id, { scale: Number(event.target.value) })} />
                <input className={inputClass()} value={view.viewType ?? 'drawing'} onChange={(event) => updateBudgetView(view.id, { viewType: event.target.value })} />
                <input className={inputClass()} type="number" value={view.priority ?? 2} onChange={(event) => updateBudgetView(view.id, { priority: Number(event.target.value) })} />
                <button className="rounded-md px-2 text-zinc-500 hover:bg-red-400/10 hover:text-red-300" onClick={() => setState((current) => ({ ...current, budgetViews: current.budgetViews.filter((item) => item.id !== view.id) }))}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-100/70">Plot Readiness</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full bg-cyan-300" style={{ width: `${plotReadiness}%` }} /></div>
              <p className="mt-2 text-lg font-semibold text-white">{plotReadiness}%</p>
            </div>
            <div className="rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-100/70">Passed Checks</p>
              <p className="mt-2 text-lg font-semibold text-white">{passedChecks.length}</p>
            </div>
            <div className={`rounded-md border p-3 ${criticalIssues.length ? 'border-red-300/30 bg-red-300/10' : warnings.length ? 'border-amber-300/30 bg-amber-300/10' : 'border-emerald-300/20 bg-emerald-300/10'}`}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-300">Warnings / Critical</p>
              <p className="mt-2 text-lg font-semibold text-white">{warnings.length} / {criticalIssues.length}</p>
            </div>
          </div>
          <div className={`mt-4 rounded-md border p-3 ${budgetFits ? 'border-emerald-300/30 bg-emerald-300/10' : 'border-red-300/30 bg-red-300/10'}`}>
            <p className="text-sm font-semibold text-white">{budgetFits ? 'Layout fits selected sheet' : 'Layout exceeds selected sheet'}</p>
            <p className="mt-1 text-xs text-zinc-300">Used: {budgetUsedWidth.toFixed(0)} x {budgetUsedHeight.toFixed(0)} mm · Sheet: {selectedPrintSheet.width} x {selectedPrintSheet.height} mm</p>
            <div className="mt-3 aspect-[1.414/1] rounded-md border border-white/10 bg-[#080a0d] p-3">
              <div className="relative h-full w-full rounded-sm border border-cyan-300/30 bg-[#11151b]">
                <div className="absolute border border-dashed border-emerald-300/30" style={{ left: `${(20 / selectedPrintSheet.width) * 100}%`, top: `${(20 / selectedPrintSheet.height) * 100}%`, width: `${((selectedPrintSheet.width - 40) / selectedPrintSheet.width) * 100}%`, height: `${((selectedPrintSheet.height - 40) / selectedPrintSheet.height) * 100}%` }} />
                {placedViews.map((view) => {
                  const width = (view.w / selectedPrintSheet.width) * 100;
                  const height = (view.h / selectedPrintSheet.height) * 100;
                  const overlapsTitle = rectsOverlap(view, titleBlock);
                  return (
                    <div key={view.id} className={`absolute rounded-sm border p-1 text-[9px] ${overlapsTitle ? 'border-red-200 bg-red-300/25 text-red-50' : 'border-cyan-200 bg-cyan-300/20 text-cyan-50'}`} style={{ left: `${(view.x / selectedPrintSheet.width) * 100}%`, top: `${(view.y / selectedPrintSheet.height) * 100}%`, width: `${Math.max(width, 8)}%`, height: `${Math.max(height, 8)}%` }}>
                      {view.label}
                    </div>
                  );
                })}
                <div className={`absolute border p-1 text-[9px] ${criticalIssues.some((item) => item.includes('title block')) ? 'border-red-300/70 bg-red-300/20 text-red-50' : 'border-amber-300/60 bg-amber-300/10 text-amber-100'}`} style={{ left: `${(titleBlock.x / selectedPrintSheet.width) * 100}%`, top: `${(titleBlock.y / selectedPrintSheet.height) * 100}%`, width: `${(titleBlock.w / selectedPrintSheet.width) * 100}%`, height: `${(titleBlock.h / selectedPrintSheet.height) * 100}%` }}>Title block</div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={buttonClass()} onClick={() => { setBudgetCheckedAt(new Date().toLocaleTimeString()); logWorkflow('verify_sheet_fit', budgetFits ? 'Sheet fit passed.' : 'Sheet fit has layout issues.', warnings.length + criticalIssues.length); }}>Verify Sheet Fit</button>
            <button className={buttonClass('secondary')} onClick={recommendSheetSize}>Recommend Sheet Size</button>
          </div>
          {recommendationNote && <p className="mt-3 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-50">{recommendationNote}</p>}
          {budgetCheckedAt && (
            <div className={`mt-3 rounded-md border p-3 text-sm ${budgetFits ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-50' : 'border-red-300/30 bg-red-300/10 text-red-50'}`}>
              Verified at {budgetCheckedAt}: {budgetFits ? 'all drawing views fit within the printable sheet boundary.' : 'the combined drawing views exceed the selected printable sheet boundary.'}
            </div>
          )}
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-white/10 bg-[#11151b] p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Scale Suggestions</p>
              <div className="mt-2 space-y-1 text-xs text-cyan-100">{scaleSuggestions.map((item) => <p key={item}>Suggested scale for {item}</p>)}</div>
            </div>
            <div className="rounded-md border border-white/10 bg-[#11151b] p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Layout Warnings</p>
              <div className="mt-2 space-y-1 text-xs text-zinc-300">{[...criticalIssues, ...warnings].length ? [...criticalIssues, ...warnings].map((item) => <p key={item}>{item}</p>) : <p>No spacing, margin, or title block collisions detected.</p>}</div>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">Standard Line Weight Catalog</h3>
              <p className="mt-1 text-xs text-zinc-500">Architecture presets mapped to layers and CTB/STB plotting rules.</p>
            </div>
            <button className={buttonClass()} onClick={generatePlotStyleGuide}>Generate Plot Style Guide</button>
          </div>
          <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-2">
            {lineWeightPresets.map((preset) => {
              const active = lineWeights[preset.name] ?? preset.active;
              const inRange = active >= preset.min && active <= preset.max;
              const command = `_LWEIGHT\n${active.toFixed(2)}\n${preset.layer}`;
              return (
                <div key={preset.name} className={`rounded-md border bg-[#11151b] p-3 ${inRange ? 'border-cyan-300/30' : 'border-amber-300/30'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-sm font-semibold text-white">{preset.name}</span>
                      <p className="mt-1 text-xs text-zinc-400">{preset.usage} - {preset.style} · Color {preset.color}</p>
                      <p className="mt-1 text-xs text-zinc-500">Optimal: {preset.min.toFixed(2)}-{preset.max.toFixed(2)}mm · Layer: {preset.layer}</p>
                    </div>
                    <select className="rounded-md border border-white/10 bg-[#080a0d] px-2 py-1 text-xs text-zinc-100" value={active} onChange={(event) => setState((current) => ({ ...current, lineWeights: { ...current.lineWeights, [preset.name]: Number(event.target.value) } }))}>
                      {lineWeightSteps.map((value) => (
                        <option key={value} value={value}>{value.toFixed(2)}mm{value >= preset.min && value <= preset.max ? ' *' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-3 h-4 rounded bg-black/20 px-1 py-1">
                    <div className="w-full border-cyan-300" style={{ borderBottomWidth: `${Math.max(1, Math.round(active * 8))}px` }} />
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap rounded bg-black/20 p-2 font-mono text-[11px] leading-5 text-emerald-300">{command}</pre>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      )}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">Asset Weight Analyzer</h3>
            <p className="mt-2 text-sm text-zinc-400">Mock CAD profile analyzer for spotting lag before importing to SketchUp, Revit, or rendering tools.</p>
          </div>
          <button className={buttonClass()} onClick={() => { setAssetAnalyzedAt(new Date().toLocaleTimeString()); setAssetWeightNote(`${assetAnalysis.status} profile detected. ${assetAnalysis.lagRisk}`); logWorkflow('run_asset_analysis', `${assetAnalysis.status} asset score ${assetAnalysis.score}/100. ${assetAnalysis.lagRisk}`, assetAnalysis.status === 'Critical' ? 4 : assetAnalysis.status === 'Heavy' ? 3 : assetAnalysis.status === 'Moderate' ? 1 : 0); }}>Run Asset Analysis</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className={`rounded-md border p-3 ${assetAnalysis.status === 'Critical' ? 'border-red-300/40 bg-red-300/10' : assetAnalysis.status === 'Heavy' ? 'border-orange-300/40 bg-orange-300/10' : assetAnalysis.status === 'Moderate' ? 'border-amber-300/40 bg-amber-300/10' : 'border-emerald-300/30 bg-emerald-300/10'}`}>
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-300">Asset Weight Score</p>
            <p className="mt-2 text-2xl font-semibold text-white">{assetAnalysis.score}/100</p>
            <p className="text-xs text-zinc-300">{assetAnalysis.status}</p>
          </div>
          <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Total Objects</p><p className="mt-2 text-xl font-semibold text-white">{assetAnalysis.totalObjects.toLocaleString()}</p></div>
          <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Lag Risk Meter</p><p className="mt-2 text-sm font-semibold text-cyan-100">{assetAnalysis.lagRisk}</p></div>
          <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Last Run</p><p className="mt-2 text-sm text-zinc-300">{assetAnalyzedAt || 'Not analyzed yet'}</p></div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {Object.entries(assetMetrics).map(([key, value]) => (
            <label key={key} className="rounded-md border border-white/10 bg-[#11151b] p-2">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-zinc-500">{key.replace(/[A-Z]/g, (match) => ` ${match}`).trim()}</span>
              <input className={inputClass()} type="number" value={value} onChange={(event) => setAssetMetrics((current) => ({ ...current, [key]: Number(event.target.value) }))} />
            </label>
          ))}
        </div>
        {assetWeightNote && <p className="mt-3 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-50">{assetWeightNote}</p>}
      </div>
    </div>
  );
}

function SiteAnalysisDiagramBuilder() {
  const [site, setSite] = useState({ north: 45, sun: 'East', wind: 'Northeast', road: 'South', noise: 'West', view: 'North', access: 'Southwest', slope: 'Southeast' });
  const directions: Record<string, number> = { North: -90, Northeast: -45, East: 0, Southeast: 45, South: 90, Southwest: 135, West: 180, Northwest: -135 };
  const arrow = (label: string, direction: string, color: string, length = 38) => (
    <div key={label} className={`absolute left-1/2 top-1/2 h-[2px] origin-left ${color}`} style={{ width: `${length}%`, transform: `rotate(${(directions[direction] ?? 0) - site.north}deg)` }}>
      <span className="absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-white">{label}</span>
    </div>
  );
  const notes = [
    `Orient diagrams with north rotated ${site.north} degrees.`,
    `Place access and arrival emphasis from the ${site.access} edge near the ${site.road} road side.`,
    `Use buffer planting or service spaces toward the ${site.noise} noise source.`,
    `Open major view corridors toward the ${site.view} direction while shading sun exposure from ${site.sun}.`,
    `Drainage and stepped massing should respond to the ${site.slope} slope direction.`,
  ].join('\n');
  return (
    <section className="grid gap-5 xl:grid-cols-[0.8fr_1fr]">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-base font-semibold text-white">Site Analysis Diagram Builder</h3>
        <p className="mt-1 text-sm text-zinc-400">Organize sun path, wind, noise, access, views, slope, and buffer zones.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label={`North Angle: ${site.north} degrees`}><input type="range" min="0" max="360" value={site.north} onChange={(e) => setSite({ ...site, north: Number(e.target.value) })} className="w-full accent-cyan-300" /></Field>
          {[
            ['sun', 'Sun Direction'],
            ['wind', 'Wind Direction'],
            ['road', 'Main Road Side'],
            ['noise', 'Noise Source'],
            ['view', 'Best View'],
            ['access', 'Site Access'],
            ['slope', 'Slope Direction'],
          ].map(([key, label]) => <div key={key}><Field label={label}><select className={inputClass()} value={site[key as keyof typeof site] as string} onChange={(e) => setSite({ ...site, [key]: e.target.value })}>{Object.keys(directions).map((item) => <option key={item}>{item}</option>)}</select></Field></div>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><button className={buttonClass('secondary')} onClick={() => downloadText('ArchiVault_Site_Analysis_Notes.txt', notes)}>Download Site Notes</button><button className={buttonClass('secondary')} onClick={() => downloadText('ArchiVault_Site_Diagram.scr', `; Site analysis diagram script\n; ${notes.replace(/\n/g, '\n; ')}\n`)}>Export AutoCAD/site diagram script</button></div>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-base font-semibold text-white">Site Diagram Preview</h3>
        <div className="mt-5 aspect-[1.25/1] rounded-md border border-cyan-300/20 bg-[#080a0d] p-8">
          <div className="relative h-full rounded border-2 border-cyan-300/50 bg-[#11151b]">
            <div className="absolute inset-6 rounded border border-dashed border-emerald-300/30 bg-emerald-300/5" />
            {arrow('Sun path', site.sun, 'bg-amber-300')}
            {arrow('Amihan', 'Northeast', 'bg-cyan-300', 44)}
            {arrow('Habagat', 'Southwest', 'bg-emerald-300', 44)}
            {arrow('Noise', site.noise, 'bg-red-300', 30)}
            {arrow('Views', site.view, 'bg-violet-300', 35)}
            {arrow('Access', site.access, 'bg-white', 28)}
            {arrow('Slope', site.slope, 'bg-blue-300', 33)}
            <div className="absolute bottom-3 right-3 rounded border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[10px] text-emerald-100">Buffer zone</div>
          </div>
        </div>
        <pre className="mt-4 whitespace-pre-wrap rounded-md border border-white/10 bg-[#11151b] p-3 text-xs leading-5 text-zinc-300">{notes}</pre>
      </div>
    </section>
  );
}

function ComplianceLab({
  state,
  setState,
}: {
  state: ComplianceState;
  setState: React.Dispatch<React.SetStateAction<ComplianceState>>;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [site, setSite] = useState({ sun: 'East', road: 'South', noise: 'West', view: 'North', access: 'Southwest', slope: 'Southeast' });
  const [complianceCheckedAt, setComplianceCheckedAt] = useState('');
  const [tilePreviewReady, setTilePreviewReady] = useState(false);
  const [structuralColumnNote, setStructuralColumnNote] = useState('');
  const [saveNote, setSaveNote] = useState('');
  const { tile, targetMonth, apertureHeight, lotArea, lotType, zoning, floors, footprintPercent, northAngle, projectShadow, selectedTile, material } = state;
  const zoningPreset = zoningPresets[zoning];
  const roomArea = Math.max(0, tile.width * tile.length * (tile.roomShape === 'L-shape' ? 0.78 : tile.roomShape === 'Corridor' ? 0.72 : 1));
  const baseTiles = Math.ceil(roomArea / Math.max((tile.size / 1000) ** 2, 0.01));
  const tiles = Math.ceil(baseTiles * (1 + tile.waste / 100));
  const tileColumns = Math.max(1, Math.ceil((tile.width * 1000) / Math.max(tile.size, 1)));
  const tileRows = Math.max(1, Math.ceil((tile.length * 1000) / Math.max(tile.size, 1)));
  const cutTiles = Math.max(0, (tile.width * 1000) % tile.size > 5 ? tileRows : 0) + Math.max(0, (tile.length * 1000) % tile.size > 5 ? tileColumns : 0);
  const autoWastage = Math.min(18, Math.max(8, Math.round((cutTiles / Math.max(baseTiles, 1)) * 100 + (tile.pattern === 'Diagonal' ? 7 : tile.pattern === 'Herringbone' ? 10 : 4))));
  const tileBoxes = Math.ceil(tiles / 4);
  const adhesiveCost = roomArea * tile.adhesivePerSqm;
  const groutQtyKg = Math.max(1, Math.ceil(roomArea * (tile.grout / 3) * 0.18));
  const laborCost = roomArea * tile.laborPerSqm;
  const totalTileBudget = tiles * tile.cost + adhesiveCost + laborCost;
  const costPerSqm = roomArea > 0 ? totalTileBudget / roomArea : 0;
  const month = monthProfiles.find((item) => item.key === targetMonth) ?? monthProfiles[5];
  const eavesDepth = Math.round(apertureHeight / Math.tan((month.angle * Math.PI) / 180));
  const shadowMaskWidth = Math.min(52, Math.max(18, (eavesDepth / Math.max(apertureHeight, 1)) * 42));
  const shadowMaskOpacity = Math.min(0.62, Math.max(0.28, eavesDepth / 4200));
  const optimalSolarAngle = month.group === 'high' ? 90 : month.group === 'low' ? 135 : 110;
  const activeWind = month.group === 'low' ? 'amihan' : month.key === 'june' || month.key === 'july' || month.key === 'august' || month.key === 'september' ? 'habagat' : 'balanced';
  const angleDelta = Math.abs(((northAngle - optimalSolarAngle + 540) % 360) - 180);
  const isAligned = angleDelta <= 8;
  const orientationSector = northAngle < 45 || northAngle >= 315
    ? 'north-facing'
    : northAngle < 135
      ? 'east-facing'
      : northAngle < 225
        ? 'south-facing'
        : 'west-facing';
  const compassResponse = isAligned
    ? `Your north angle is aligned with the ${month.label} solar target. Keep primary glazing controlled but open enough for daylight, and use lighter shading so rooms do not become unnecessarily dark.`
    : angleDelta > 90
      ? `This orientation is strongly offset from the selected month's ideal solar path. Re-check window placement on ${orientationSector} zones, add deeper overhangs or vertical fins, and avoid placing heat-sensitive studios or bedrooms on the most exposed facade.`
      : `This orientation is workable but not perfectly tuned for ${month.label}. Use adjustable louvers, operable windows, and room-by-room shading so the plan can adapt to changing sun and wind exposure.`;
  const windResponse = activeWind === 'amihan'
    ? 'Amihan is active: prioritize northeast intake openings, protected clerestory vents, and cross-flow paths that move cool air toward service or courtyard exhaust zones.'
    : activeWind === 'habagat'
      ? 'Habagat is active: protect southwest-facing openings from wind-driven rain with recessed windows, covered balconies, and drainable sill details.'
      : 'Transitional wind profile: keep both northeast and southwest openings adjustable so the building can switch between seasonal airflow patterns.';
  const requestedFootprint = lotArea * (footprintPercent / 100);
  const allowableFootprint = lotArea * zoningPreset.maxCoverage;
  const requiredOpenSpace = lotArea * zoningPreset.openSpace;
  const maxFloorArea = lotArea * zoningPreset.maxFar;
  const actualFootprint = Math.min(requestedFootprint, lotArea);
  const builtPercent = lotArea > 0 ? Math.min(100, Math.max(0, (allowableFootprint / lotArea) * 100)) : 0;
  const openPercent = Math.max(0, 100 - builtPercent);
  const grossFloorArea = actualFootprint * floors;
  const far = lotArea > 0 ? grossFloorArea / lotArea : 0;
  const massingHeight = floors * 3.2;
  const materialStyle = materialStyles[material];
  const directions: Record<string, number> = { North: -90, Northeast: -45, East: 0, Southeast: 45, South: 90, Southwest: 135, West: 180, Northwest: -135 };
  const siteAngleAdvice = isAligned
    ? `Live compass note: ${northAngle} degrees is aligned for ${month.label}. Keep the strongest public spaces and primary windows connected to the ${site.view} view, then use light shading rather than heavy barriers.`
    : angleDelta > 90
      ? `Live compass note: ${northAngle} degrees is ${angleDelta.toFixed(0)} degrees away from the seasonal target. Treat the ${orientationSector} edge as sensitive: add shading, buffer rooms, and avoid putting heat-sensitive spaces directly on that side.`
      : `Live compass note: ${northAngle} degrees is workable but needs tuning. Keep openings adjustable, use medium shading, and check whether the ${site.sun} sun direction conflicts with the ${site.view} view direction.`;
  const siteRoadAdvice = site.road === site.noise
    ? `Road/noise overlap: because the main road and noise both come from ${site.road}, place parking, service rooms, storage, stairs, or landscape buffer along that edge before quiet rooms.`
    : `Road/noise split: main approach is from ${site.road}, while noise comes from ${site.noise}. Keep arrival clear, but put acoustic buffering only where it is actually needed.`;
  const siteWindAdvice = activeWind === 'amihan'
    ? `Wind response: prioritize Amihan intake from the northeast and exhaust warm air toward the opposite side.`
    : activeWind === 'habagat'
      ? `Wind response: Habagat can bring stronger rain, so protect southwest openings with canopies, recessed windows, or louvers.`
      : `Wind response: keep both northeast and southwest openings flexible because this month has a transitional wind profile.`;
  const siteNotes = [
    siteAngleAdvice,
    siteRoadAdvice,
    siteWindAdvice,
    `Access should read from the ${site.access} side, especially if the main road is on the ${site.road} edge.`,
    `Use service spaces, trees, or buffer walls toward the ${site.noise} noise source.`,
    `Keep important views open toward ${site.view}, while shading sun exposure from ${site.sun}.`,
    `Slope response: step massing and drainage toward ${site.slope}.`,
  ].join('\n');
  const siteArrow = (label: string, direction: string, color: string, length = 38) => (
    <div key={label} className={`absolute left-1/2 top-1/2 h-[2px] origin-left ${color}`} style={{ width: `${length}%`, transform: `rotate(${(directions[direction] ?? 0) - northAngle}deg)` }}>
      <span className="absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-white">{label}</span>
    </div>
  );
  const selectedTileCoord = selectedTile
    ? {
        x1: selectedTile.col * tile.size,
        y1: selectedTile.row * tile.size,
        x2: Math.min((selectedTile.col + 1) * tile.size, tile.width * 1000),
        y2: Math.min((selectedTile.row + 1) * tile.size, tile.length * 1000),
      }
    : null;
  const codeIssues = [
    lotArea <= 0 ? ['critical', 'Room/lot data invalid: enter a positive lot area before checking compliance.'] : null,
    actualFootprint > allowableFootprint ? ['critical', `Lot coverage exceeds ${zoningPreset.label} limit. Reduce footprint to ${allowableFootprint.toFixed(1)} sqm or less.`] : null,
    far > zoningPreset.maxFar ? ['critical', `FAR ${far.toFixed(2)} exceeds ${zoningPreset.maxFar.toFixed(2)} for this zoning preset. Reduce floors or footprint.`] : null,
    lotArea - actualFootprint < requiredOpenSpace ? ['warning', `Open space is below the ${requiredOpenSpace.toFixed(1)} sqm study target. Add courts, yards, or permeable landscape.`] : null,
    eavesDepth > 2000 ? ['critical', 'Eaves projection is very deep and needs structural support review.'] : eavesDepth > 1200 ? ['warning', 'Eaves projection is extensive; add brackets, columns, or lighter shading alternatives.'] : null,
    lotType === 'Corner' ? ['passed', 'Corner lot selected: reserve visibility and pedestrian clearances at the street corner.'] : null,
  ].filter(Boolean) as Array<['passed' | 'warning' | 'critical', string]>;
  const passedCodeItems = [
    actualFootprint <= allowableFootprint,
    far <= zoningPreset.maxFar,
    lotArea - actualFootprint >= requiredOpenSpace,
    eavesDepth <= 1200,
  ].filter(Boolean).length;
  const complianceScore = Math.max(0, Math.round((passedCodeItems / 4) * 100 - codeIssues.filter(([status]) => status === 'critical').length * 12));
  const tileWarnings = [
    tile.width <= 0 || tile.length <= 0 ? ['critical', 'Room dimensions invalid. Enter positive room width and length.'] : null,
    tile.size > Math.min(tile.width, tile.length) * 1000 ? ['critical', 'Tile size is too large for this room dimension.'] : null,
    tile.waste < autoWastage ? ['warning', `Wastage may be too low. Suggested wastage is about ${autoWastage}%.`] : null,
    tile.grout < 1 || tile.grout > 8 ? ['warning', 'Grout width is unusual. Most interior tiles use about 2mm to 5mm joints.'] : null,
    cutTiles > baseTiles * 0.35 ? ['warning', 'Too many cut tiles detected along the edges. Try a smaller tile or change starting point.'] : null,
    tile.cost <= 0 ? ['critical', 'Missing cost data. Enter cost per tile or update the material cost database.'] : null,
    tile.cost < 25 ? ['warning', 'Budget estimate may be outdated. Verify current Philippine supplier prices.'] : null,
  ].filter(Boolean) as Array<['warning' | 'critical', string]>;
  const totalWarnings = codeIssues.filter(([status]) => status !== 'passed').length + tileWarnings.length;
  const overallStatus = totalWarnings === 0 ? 'Safe' : codeIssues.some(([status]) => status === 'critical') || tileWarnings.some(([status]) => status === 'critical') ? 'Critical' : totalWarnings > 3 ? 'Caution' : 'Warning';
  const tileScript = useMemo(() => {
    const widthMm = Math.round(tile.width * 1000);
    const lengthMm = Math.round(tile.length * 1000);
    const verticalLines = Array.from({ length: Math.max(0, tileColumns - 1) }).flatMap((_, index) => {
      const x = Math.min((index + 1) * tile.size, widthMm);
      return ['_LINE', `${x},0`, `${x},${lengthMm}`, ''];
    });
    const horizontalLines = Array.from({ length: Math.max(0, tileRows - 1) }).flatMap((_, index) => {
      const y = Math.min((index + 1) * tile.size, lengthMm);
      return ['_LINE', `0,${y}`, `${widthMm},${y}`, ''];
    });
    return [
      '; ArchiVault Material & Tile Grid Array',
      `; Material: ${material}`,
      `; Room: ${tile.width}m x ${tile.length}m`,
      `; Tile module: ${tile.size}mm with ${tile.grout}mm grout`,
      selectedTileCoord ? `; Selected tile bounds: ${selectedTileCoord.x1},${selectedTileCoord.y1} to ${selectedTileCoord.x2},${selectedTileCoord.y2} mm` : '; No selected tile',
      '',
      '_RECTANGLE',
      '0,0',
      `${widthMm},${lengthMm}`,
      '',
      '; Vertical tile joints',
      ...verticalLines,
      '; Horizontal tile joints',
      ...horizontalLines,
      '_REGENALL',
      '',
      '',
    ].join('\n');
  }, [material, selectedTileCoord, tile.grout, tile.length, tile.size, tile.width, tileColumns, tileRows]);
  const materialNote = month.group === 'low'
    ? 'Thermal Mass Check: Lower winter sun vectors optimize daylight penetration. Ensure clear-pane solar window assemblies on southern exposure walls to capture passive morning warmth.'
    : month.group === 'high'
      ? 'Heat Mitigation Check: Use double-insulated concrete masonry structures or exterior structural shade louvers on western vectors to block intensive radiant heat loads.'
      : 'Advise using thick masonry insulation layout, high thermal mass brick aggregates, or external shading louvers on western facing zones to combat heat gain.';
  const advisoryItems = month.group === 'high'
    ? [
        ['Shading', `${orientationSector} layout at ${northAngle} degrees: prioritize deep west-facing shade fins, exterior louvers, and roof-edge canopies for high-angle dry-season heat. ${angleDelta > 45 ? 'Because the angle is off target, increase adjustability instead of relying on one fixed overhang depth.' : 'The alignment is close, so use slimmer shading with stronger glare control.'}`],
        ['Solar Gain', `Reduce glazing exposure on hot afternoon vectors. For ${orientationSector} rooms, place thicker masonry, storage, toilets, or stairs on the hotter side before assigning study spaces.`],
        ['Ventilation', `${windResponse} Add high-level exhaust paths to release roof heat and avoid stagnant warm air under ceiling slabs.`],
      ]
    : month.group === 'low'
      ? [
          ['Morning Sun', `${orientationSector} angle at ${northAngle} degrees: preserve controlled southeast daylight access for passive warmth and clear interior illumination. ${angleDelta > 45 ? 'The current rotation may push low sun deeper into rooms, so mark desks and beds away from direct glare zones.' : 'The angle is close to target, so daylight can be captured with moderate overhangs.'}`],
          ['Ventilation', `${windResponse} Use operable louvers so students can tune airflow without exposing interiors to rain or street dust.`],
          ['Glare Control', `Low sun can travel far across the floor plate. Add adjustable blinds, planting screens, or fins where sun reaches desks, drafting boards, model-making counters, or display walls.`],
        ]
      : [
          ['Cross Ventilation', `${windResponse} Balance northeast and southwest openings, then use door transoms or interior slots so airflow is not blocked by partitions.`],
          ['Shading', `${orientationSector} angle at ${northAngle} degrees: use medium-depth canopies, vertical fins, and vegetation screens because this month sits between high and low sun behavior.`],
          ['Solar Gain', `Tune glazing and wall mass by room function. Put frequently occupied study areas on calmer facades and reserve hotter exposed edges for circulation, storage, or buffer spaces.`],
        ];
  const inputDrivenAdvisories = [
    lotArea < 150
      ? ['Maximize Vertical Space', 'Small lot detected. Stack service spaces, storage, and sleeping areas vertically, keep circulation compact, and reserve the ground plane for flexible open space rather than wide single-use rooms.']
      : null,
    far > 1.8
      ? ['Floor Area Control', 'The estimated FAR is becoming dense for a student planning study. Check stair width, daylight access, fire egress logic, and whether upper floors are creating too much enclosed floor area for the lot.']
      : null,
    eavesDepth > 2000
      ? ['Structural Shading Support', 'The eaves projection is beyond a light canopy condition. Add columns, brackets, or a framed canopy bay and avoid treating the overhang as a simple decorative fascia.']
      : null,
    totalTileBudget > 25000
      ? ['Material Budget Watch', 'Tile cost is trending high. Compare ceramic or concrete finish alternatives, reduce cuts at edges, and align room dimensions to the tile module plus grout width.']
      : null,
  ].filter(Boolean) as string[][];
  const activeAdvisoryItems = [...inputDrivenAdvisories, ...advisoryItems].slice(0, 3);

  useEffect(() => {
    setState((current) => {
      const nextAngle = month.group === 'high' ? 90 : month.group === 'low' ? 135 : 110;
      return current.northAngle === nextAngle ? current : { ...current, northAngle: nextAngle };
    });
  }, [month.key, setState]);

  function generateFullReport() {
    const report = [
      'ArchiVault Compliance & Environmental Lab Report',
      '',
      `Target month: ${month.label}`,
      `North orientation angle: ${northAngle} degrees`,
      `Solar altitude coefficient: ${month.angle} degrees`,
      `Eaves depth required: ${eavesDepth} mm`,
      `Lot area: ${lotArea} sqm`,
      `Lot type: ${lotType}`,
      `Zoning preset: ${zoningPreset.label}`,
      `Floors: ${floors}`,
      `Requested building footprint: ${actualFootprint.toFixed(2)} sqm`,
      `Maximum allowable footprint: ${allowableFootprint.toFixed(2)} sqm`,
      `Maximum allowable floor area: ${maxFloorArea.toFixed(2)} sqm`,
      `Required open space: ${requiredOpenSpace.toFixed(2)} sqm (${openPercent.toFixed(1)}%)`,
      `Built-up area ratio: ${builtPercent.toFixed(1)}%`,
      `Estimated gross floor area: ${grossFloorArea.toFixed(2)} sqm`,
      `Estimated FAR: ${far.toFixed(2)}`,
      `Compliance score: ${complianceScore}%`,
      `Setback placeholder: ${zoningPreset.setback}`,
      `Parking placeholder: ${zoningPreset.parking}`,
      '',
      `Tile material: ${material}`,
      `Room: ${tile.width}m x ${tile.length}m (${tile.roomShape})`,
      `Tile pattern: ${tile.pattern}`,
      `Starting point: ${tile.startPoint}`,
      `Tile orientation: ${tile.orientation} degrees`,
      `Tile size: ${tile.size}mm`,
      `Grout width: ${tile.grout}mm`,
      `Grout color: ${tile.groutColor}`,
      `Tiles required with wastage: ${tiles}`,
      `Tile boxes estimate: ${tileBoxes}`,
      `Cut tile estimate: ${cutTiles}`,
      `Adhesive estimate: ${adhesiveCost.toFixed(2)}`,
      `Grout quantity estimate: ${groutQtyKg} kg`,
      `Labor cost estimate: ${laborCost.toFixed(2)}`,
      `Cost per tile: ${tile.cost.toFixed(2)}`,
      `Cost per sqm: ${costPerSqm.toFixed(2)}`,
      `Estimated total material + labor budget: ${totalTileBudget.toFixed(2)}`,
      '',
      'Warnings and issues:',
      ...codeIssues.map(([status, text]) => `- ${status.toUpperCase()}: ${text}`),
      ...tileWarnings.map(([status, text]) => `- ${status.toUpperCase()}: ${text}`),
      selectedTileCoord ? `Selected tile: column ${selectedTile?.col}, row ${selectedTile?.row}, bounds ${selectedTileCoord.x1},${selectedTileCoord.y1} to ${selectedTileCoord.x2},${selectedTileCoord.y2} mm` : 'Selected tile: none',
      '',
      'Advisory items:',
      `- Compass Response: ${compassResponse}`,
      `- Wind Response: ${windResponse}`,
      ...activeAdvisoryItems.map(([title, text]) => `- ${title}: ${text}`),
      '',
      `Material note: ${materialNote}`,
    ].join('\n');
    downloadSimplePdf('ArchiVault_Compliance_Environmental_Report.pdf', 'ArchiVault Compliance & Environmental Lab Report', report.split('\n'));
  }

  function saveComplianceSummary() {
    const projectName = window.prompt('Enter project/report name', 'ArchiVault Compliance Report');
    if (!projectName) {
      setSaveNote('Save cancelled. Enter a project/report name to save this summary.');
      return;
    }
    const summary = `Code ${complianceScore}% | Tile budget ${totalTileBudget.toFixed(2)} | ${totalWarnings} warnings`;
    logWorkflow('compliance_tile_summary', `${projectName}: ${summary}`, totalWarnings);
    void fetch(`${API_BASE}/api/v1/compliance/save-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lot_area_sqm: lotArea,
        zoning,
        lot_type: lotType,
        result_summary: `${projectName}: ${summary}`,
        warnings_count: totalWarnings,
        tile_summary: `${tile.roomShape}, ${tile.pattern}, ${tiles} tiles, ${tileBoxes} boxes`,
        material_summary: `${material}, total ${totalTileBudget.toFixed(2)}, cost/sqm ${costPerSqm.toFixed(2)}`,
      }),
    }).catch(() => undefined);
    setSaveNote(`${projectName} saved at ${new Date().toLocaleTimeString()}.`);
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">National Building Code Check</h3>
              <p className="mt-1 text-sm text-zinc-400">Live planning guide for lot coverage, open space, FAR/GFA, setbacks, parking placeholders, and climate shading.</p>
            </div>
            <span className={`rounded-md px-2 py-1 text-xs font-bold ${complianceScore >= 85 ? 'bg-emerald-300 text-emerald-950' : complianceScore >= 60 ? 'bg-amber-300 text-amber-950' : 'bg-red-300 text-red-950'}`}>{complianceScore}%</span>
          </div>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-50">
            Instructions: choose a zoning preset, enter lot size and floors, then read the live lot preview. Green means the study is within the preset, yellow means check it, and red means revise the massing before using it on a plate.
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Field label="Lot Area, sqm"><input className={inputClass()} type="number" value={lotArea} onChange={(event) => setState((current) => ({ ...current, lotArea: Number(event.target.value) }))} /></Field>
            <Field label="Floors"><input className={inputClass()} type="number" value={floors} onChange={(event) => setState((current) => ({ ...current, floors: Number(event.target.value) }))} /></Field>
            <Field label="Zoning"><select className={inputClass()} value={zoning} onChange={(event) => setState((current) => ({ ...current, zoning: event.target.value as ComplianceState['zoning'] }))}><option value="R1">R1</option><option value="R2">R2</option><option value="R3">R3</option></select><HelpTip text="Zoning is the rule category for a lot. For students, think of it as the project type limit: low-density, medium-density, or denser residential planning." /></Field>
            <Field label="Lot Type"><select className={inputClass()} value={lotType} onChange={(event) => setState((current) => ({ ...current, lotType: event.target.value as ComplianceState['lotType'] }))}><option>Inside</option><option>Corner</option><option>Through</option></select></Field>
            <Field label="Building Footprint, %"><input className={inputClass()} type="number" value={footprintPercent} onChange={(event) => setState((current) => ({ ...current, footprintPercent: Number(event.target.value) }))} /></Field>
            <div className="rounded-md border border-white/10 bg-[#11151b] p-3 text-xs leading-5 text-zinc-300"><p className="font-semibold text-cyan-100">Zoning preset helper</p><p className="mt-1">{zoningPreset.helper}</p></div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Target Month"><select className={inputClass()} value={targetMonth} onChange={(event) => setState((current) => ({ ...current, targetMonth: event.target.value }))}>{monthProfiles.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></Field>
            <Field label="Window Aperture Height, mm"><input className={inputClass()} type="number" value={apertureHeight} onChange={(event) => setState((current) => ({ ...current, apertureHeight: Number(event.target.value) }))} /></Field>
          </div>
          <div className="mt-4 rounded-md border border-white/10 bg-[#080a0d] p-4">
            <div className="relative mx-auto aspect-[1.25/1] max-w-md rounded-md border border-zinc-400/50 bg-[#11151b]">
              <div className="absolute inset-[8%] border border-dashed border-cyan-300/50" />
              <div className="absolute bottom-[8%] right-[8%] h-[15%] w-[28%] border border-amber-300/60 bg-amber-300/10 p-1 text-[9px] text-amber-100">setback / title guide</div>
              <div className="absolute left-[12%] top-[12%] rounded-sm border border-emerald-300/50 bg-emerald-300/10" style={{ width: `${Math.max(18, Math.min(72, zoningPreset.openSpace * 100))}%`, height: '72%' }} />
              <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 ${actualFootprint <= allowableFootprint && far <= zoningPreset.maxFar ? 'border-emerald-300 bg-emerald-300/20' : 'border-red-300 bg-red-300/20'}`} style={{ width: `${Math.min(72, Math.max(18, Math.sqrt(actualFootprint / Math.max(lotArea, 1)) * 78))}%`, height: `${Math.min(72, Math.max(18, Math.sqrt(actualFootprint / Math.max(lotArea, 1)) * 78))}%` }}>
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-black/50 px-2 py-1 text-[10px] text-white">{floors}F massing</span>
              </div>
              <div className="absolute left-1/2 top-1/2 h-[2px] w-[38%] origin-left bg-amber-300" style={{ transform: `rotate(${optimalSolarAngle - northAngle}deg)` }} />
              <div className="absolute left-1/2 top-[46%] border-t border-amber-200/70" style={{ width: `${Math.min(42, Math.max(12, eavesDepth / 70))}%` }} />
              <span className="absolute left-3 top-3 rounded bg-black/40 px-2 py-1 text-[10px] text-zinc-200">Lot boundary</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
              <span className="rounded border border-emerald-300/20 bg-emerald-300/10 p-2 text-emerald-50">Open space target: {requiredOpenSpace.toFixed(1)} sqm</span>
              <span className="rounded border border-cyan-300/20 bg-cyan-300/10 p-2 text-cyan-50">Max footprint: {allowableFootprint.toFixed(1)} sqm</span>
              <span className="rounded border border-amber-300/20 bg-amber-300/10 p-2 text-amber-50">Massing height: {massingHeight.toFixed(1)} m</span>
            </div>
          </div>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">Eaves Depth Required <HelpTip text="This is the suggested roof or canopy projection that shades a window from sun. Bigger number means deeper shade, but it may need structural support." /></p>
            <p className="mt-1 text-2xl font-semibold text-white">{eavesDepth} mm</p>
            <p className="mt-1 text-xs text-cyan-100/70">Solar altitude coefficient: {month.angle} degrees for Manila latitude profile.</p>
            {eavesDepth > 1200 && <div className={`mt-3 rounded-md border p-2 text-xs ${eavesDepth > 2000 ? 'border-red-300 bg-red-400/15 text-red-100 shadow-[0_0_0_1px_rgba(252,165,165,0.35)]' : 'border-amber-300/30 bg-amber-300/10 text-amber-100'}`}><p>Structural Alert: Overhang depth is highly extensive. Structural support elements like concrete columns or structural canopy cantilever framing brackets are highly recommended.</p>{eavesDepth > 2000 && <button className="mt-2 rounded-md bg-red-200 px-3 py-1 text-xs font-semibold text-red-950" onClick={() => setStructuralColumnNote(`Column support note added: place support posts or brackets under the ${eavesDepth}mm overhang and verify cantilever sizing with a structural adviser.`)}>Add Structural Column</button>}{structuralColumnNote && <p className="mt-2 rounded border border-red-200/30 bg-black/20 p-2">{structuralColumnNote}</p>}</div>}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Footprint <HelpTip text="Footprint is the ground area occupied by the building block." /></p><p className="text-sm font-semibold text-white">{actualFootprint.toFixed(1)} / {allowableFootprint.toFixed(1)} sqm</p><p className="mt-1 text-[11px] text-zinc-500">Max allowable footprint</p></div>
            <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">GFA <HelpTip text="GFA means gross floor area: footprint multiplied by the number of floors." /></p><p className="text-sm font-semibold text-white">{grossFloorArea.toFixed(1)} / {maxFloorArea.toFixed(1)} sqm</p><p className="mt-1 text-[11px] text-zinc-500">Max floor area by FAR</p></div>
            <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">FAR <HelpTip text="FAR compares total floor area to lot area. Higher FAR means denser building mass." /></p><p className="text-sm font-semibold text-white">{far.toFixed(2)} / {zoningPreset.maxFar.toFixed(2)}</p><p className="mt-1 text-[11px] text-zinc-500">Floor area ratio</p></div>
            <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Setback Checker</p><p className="text-xs leading-5 text-zinc-300">{zoningPreset.setback}</p></div>
            <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Parking Estimate</p><p className="text-xs leading-5 text-zinc-300">{zoningPreset.parking}</p></div>
            <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Lot Coverage</p><p className="text-sm font-semibold text-white">{footprintPercent}% requested</p><p className="mt-1 text-[11px] text-zinc-500">Limit {(zoningPreset.maxCoverage * 100).toFixed(0)}%</p></div>
          </div>
          <ComplianceScorecard openPercent={openPercent} builtPercent={builtPercent} openSpace={requiredOpenSpace} builtArea={actualFootprint} far={far} grossFloorArea={grossFloorArea} />
          <div className="mt-4 space-y-2">
            {codeIssues.map(([status, text]) => <div key={text} className={`rounded-md border p-2 text-xs leading-5 ${status === 'passed' ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-50' : status === 'critical' ? 'border-red-300/30 bg-red-300/10 text-red-100' : 'border-amber-300/30 bg-amber-300/10 text-amber-100'}`}>{text}</div>)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2"><button className={buttonClass()} onClick={() => { setComplianceCheckedAt(new Date().toLocaleTimeString()); logWorkflow('building_code_check', `NBC guide score ${complianceScore}% for ${zoning}`, codeIssues.filter(([status]) => status !== 'passed').length); }}>Check Building Code Compliance</button><button className={buttonClass('secondary')} onClick={generateFullReport}>Export Code Check Report</button></div>
          {complianceCheckedAt && (
            <div className="mt-3 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-50">
              Checked at {complianceCheckedAt}: estimated FAR {far.toFixed(2)}, allowable footprint {allowableFootprint.toFixed(1)} sqm, open-space target {requiredOpenSpace.toFixed(1)} sqm.
            </div>
          )}
          <p className="mt-4 text-xs text-zinc-500">Planning guide only, not legal advice.</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">Material & Tile Grid Array</h3>
              <p className="mt-1 text-sm text-zinc-400">Live tile layout, cut-tile warning, grout, adhesive, labor, and budget planner.</p>
            </div>
            <button className={buttonClass('secondary')} onClick={() => setShowAdvanced((value) => !value)}>{showAdvanced ? 'Hide Advanced' : 'Show Advanced'}</button>
          </div>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-50">
            Instructions: enter the room and tile size, then watch the grid update live. Click any tile to read exact export coordinates. Yellow tiles mark likely cuts or waste-prone edges.
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Room Width, meters"><input className={inputClass()} type="number" value={tile.width} onChange={(e) => setState((current) => ({ ...current, tile: { ...current.tile, width: Number(e.target.value) } }))} /></Field>
            <Field label="Room Length, meters"><input className={inputClass()} type="number" value={tile.length} onChange={(e) => setState((current) => ({ ...current, tile: { ...current.tile, length: Number(e.target.value) } }))} /></Field>
            <Field label="Tile Size, mm"><input className={inputClass()} type="number" value={tile.size} onChange={(e) => setState((current) => ({ ...current, tile: { ...current.tile, size: Number(e.target.value) } }))} /></Field>
            <Field label="Wastage Percent"><input className={inputClass()} type="number" value={tile.waste} onChange={(e) => setState((current) => ({ ...current, tile: { ...current.tile, waste: Number(e.target.value) } }))} /></Field>
            <Field label="Room Shape"><select className={inputClass()} value={tile.roomShape} onChange={(event) => setState((current) => ({ ...current, tile: { ...current.tile, roomShape: event.target.value as ComplianceState['tile']['roomShape'] } }))}><option>Rectangle</option><option>L-shape</option><option>Corridor</option><option>Custom</option></select></Field>
            <Field label="Tile Pattern"><select className={inputClass()} value={tile.pattern} onChange={(event) => setState((current) => ({ ...current, tile: { ...current.tile, pattern: event.target.value as ComplianceState['tile']['pattern'] } }))}><option>Straight grid</option><option>Running bond</option><option>Diagonal</option><option>Checkerboard</option><option>Herringbone</option></select></Field>
          </div>
          {showAdvanced && <div className="mt-4 grid gap-4 rounded-md border border-white/10 bg-[#11151b] p-4 sm:grid-cols-2">
            <Field label="Grout Width, mm"><input className={inputClass()} type="number" value={tile.grout} onChange={(e) => setState((current) => ({ ...current, tile: { ...current.tile, grout: Number(e.target.value) } }))} /></Field>
            <Field label="Cost per Tile"><input className={inputClass()} type="number" value={tile.cost} onChange={(e) => setState((current) => ({ ...current, tile: { ...current.tile, cost: Number(e.target.value) } }))} /></Field>
            <Field label="Tile Material"><select className={inputClass()} value={material} onChange={(event) => setState((current) => ({ ...current, material: event.target.value as ComplianceState['material'] }))}><option>Ceramic</option><option>Marble</option><option>Concrete</option></select></Field>
            <Field label="Tile Orientation, degrees"><input className={inputClass()} type="number" value={tile.orientation} onChange={(e) => setState((current) => ({ ...current, tile: { ...current.tile, orientation: Number(e.target.value) } }))} /></Field>
            <Field label="Starting Point"><select className={inputClass()} value={tile.startPoint} onChange={(event) => setState((current) => ({ ...current, tile: { ...current.tile, startPoint: event.target.value as ComplianceState['tile']['startPoint'] } }))}><option>Center</option><option>Corner</option><option>Doorway aligned</option></select></Field>
            <Field label="Grout Color"><input className={inputClass()} type="color" value={tile.groutColor} onChange={(e) => setState((current) => ({ ...current, tile: { ...current.tile, groutColor: e.target.value } }))} /></Field>
            <Field label="Labor Cost / sqm"><input className={inputClass()} type="number" value={tile.laborPerSqm} onChange={(e) => setState((current) => ({ ...current, tile: { ...current.tile, laborPerSqm: Number(e.target.value) } }))} /></Field>
            <Field label="Adhesive Cost / sqm"><input className={inputClass()} type="number" value={tile.adhesivePerSqm} onChange={(e) => setState((current) => ({ ...current, tile: { ...current.tile, adhesivePerSqm: Number(e.target.value) } }))} /></Field>
          </div>}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Tiles Required</p><p className="text-sm font-semibold text-white">{tiles}</p></div>
            <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Boxes / Cuts</p><p className="text-sm font-semibold text-white">{tileBoxes} boxes / {cutTiles} cuts</p></div>
            <div className="rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-emerald-100/70">Budget Estimate</p><p className="text-sm font-semibold text-emerald-50">{totalTileBudget.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p><p className="mt-1 text-[11px] text-emerald-100/70">{costPerSqm.toFixed(0)} / sqm</p></div>
          </div>
          <div className="mt-4 aspect-[1.2/1] rounded-md border border-cyan-300/20 bg-[#080a0d] p-3">
            <div
              className="grid h-full w-full rounded border"
              style={{
                borderColor: materialStyle.grid,
                backgroundColor: materialStyle.fill,
                gridTemplateColumns: `repeat(${Math.min(tileColumns, 18)}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${Math.min(tileRows, 18)}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: Math.min(tileColumns, 18) * Math.min(tileRows, 18) }).map((_, index) => {
                const col = index % Math.min(tileColumns, 18);
                const row = Math.floor(index / Math.min(tileColumns, 18));
                const selected = selectedTile?.col === col && selectedTile?.row === row;
                return (
                  <button
                    key={`${col}-${row}`}
                    className={`border transition ${selected ? 'border-amber-200 bg-amber-300/35' : 'hover:bg-white/10'}`}
                    style={{
                      borderColor: selected ? undefined : tile.groutColor,
                      backgroundImage: materialStyle.pattern,
                      backgroundSize: material === 'Concrete' ? '18px 18px' : '24px 24px',
                    }}
                    onClick={() => setState((current) => ({ ...current, selectedTile: { col, row } }))}
                    title={`Tile ${col}, ${row}`}
                  />
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-500">{tileColumns} columns · {tileRows} rows visualized from a 0,0 datum.</p>
          {tilePreviewReady && (
            <div className="mt-2 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-2 text-xs text-emerald-50">
              Preview refreshed: {tileColumns} x {tileRows} tile grid, {material} finish, {tiles} tiles including wastage, estimated budget {totalTileBudget.toLocaleString(undefined, { maximumFractionDigits: 2 })}.
            </div>
          )}
          {selectedTileCoord && <p className="mt-2 rounded-md border border-amber-300/20 bg-amber-300/10 p-2 font-mono text-xs text-amber-100">Selected tile: col {selectedTile?.col}, row {selectedTile?.row} · {selectedTileCoord.x1},{selectedTileCoord.y1} to {selectedTileCoord.x2},{selectedTileCoord.y2} mm</p>}
          <div className="mt-3 grid gap-2">
            {tileWarnings.map(([status, text]) => <div key={text} className={`rounded-md border p-2 text-xs leading-5 ${status === 'critical' ? 'border-red-300/30 bg-red-300/10 text-red-100' : 'border-amber-300/30 bg-amber-300/10 text-amber-100'}`}>{text}</div>)}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">Pattern Setup</p><p className="text-xs text-cyan-50">{tile.roomShape} · {tile.pattern} · {tile.startPoint}</p></div>
            <div className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-amber-100/70">Adhesive / Grout</p><p className="text-xs text-amber-50">{adhesiveCost.toFixed(0)} adhesive · {groutQtyKg}kg grout</p></div>
            <div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Labor</p><p className="text-xs text-zinc-200">{laborCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} labor estimate</p></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2"><button className={buttonClass('secondary')} onClick={() => { setTilePreviewReady(true); setState((current) => ({ ...current, selectedTile: current.selectedTile ?? { col: 0, row: 0 } })); }}>Preview Tile Grid</button><button className={buttonClass()} onClick={() => downloadText('ArchiVault_Tile_Grid.scr', tileScript)}>Download Tile Script</button><button className={buttonClass('secondary')} onClick={generateFullReport}>Export Tile Report</button></div>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between gap-3"><h3 className="text-base font-semibold text-white">Environmental Compass</h3><Compass className="h-5 w-5 text-cyan-300" /></div>
          <Field label={`North Orientation Angle: ${northAngle} degrees`}>
            <input className="mt-4 w-full accent-cyan-300" type="range" min="0" max="360" value={northAngle} onChange={(event) => setState((current) => ({ ...current, northAngle: Number(event.target.value) }))} />
          </Field>
          <div className={`mt-2 rounded-md border px-3 py-2 text-xs ${isAligned ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-[#11151b] text-zinc-400'}`}>
            Optimal solar orientation for {month.label}: {optimalSolarAngle} degrees · {isAligned ? 'Aligned' : `${angleDelta.toFixed(0)} degrees off target`}
          </div>
          <label className="mt-3 flex items-center gap-3 rounded-md border border-white/10 bg-[#11151b] p-3 text-sm text-zinc-200"><input type="checkbox" checked={projectShadow} onChange={() => setState((current) => ({ ...current, projectShadow: !current.projectShadow }))} className="h-4 w-4 accent-cyan-300" />Project Shadow</label>
          <div className="mx-auto mt-6 aspect-square max-w-sm rounded-full border border-cyan-300/30 bg-[#11151b] p-8">
            <div className="relative h-full w-full rounded-full border border-white/10 bg-[radial-gradient(circle,rgba(34,211,238,0.12)_1px,transparent_1px)] bg-[size:22px_22px]">
              <span className="absolute left-1/2 top-2 -translate-x-1/2 text-xs font-bold text-white">N</span>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-bold text-zinc-500">S</span>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">E</span>
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">W</span>
              <div className={`absolute left-1/2 top-1/2 h-[2px] w-[42%] origin-left -translate-y-1/2 bg-amber-300 ${isAligned ? 'shadow-[0_0_18px_rgba(252,211,77,0.9)]' : ''}`} style={{ transform: `rotate(${optimalSolarAngle - northAngle}deg)` }} />
              <div className={`absolute left-1/2 top-1/2 h-[2px] w-[48%] origin-left -translate-y-1/2 bg-cyan-300 ${activeWind === 'amihan' ? 'shadow-[0_0_18px_rgba(34,211,238,0.85)]' : 'opacity-45'}`} style={{ transform: `rotate(${45 - northAngle}deg)` }} />
              <div className={`absolute left-1/2 top-1/2 h-[2px] w-[48%] origin-left -translate-y-1/2 bg-emerald-300 ${activeWind === 'habagat' ? 'shadow-[0_0_18px_rgba(110,231,183,0.85)]' : 'opacity-45'}`} style={{ transform: `rotate(${225 - northAngle}deg)` }} />
              {siteArrow('Noise', site.noise, 'bg-red-300', 30)}
              {siteArrow('Views', site.view, 'bg-violet-300', 34)}
              {siteArrow('Access', site.access, 'bg-white', 28)}
              {siteArrow('Slope', site.slope, 'bg-blue-300', 32)}
              {projectShadow && (
                <div
                  className="absolute left-1/2 top-1/2 origin-top-left skew-x-[-18deg] border-l border-amber-200/30 bg-black"
                  style={{
                    height: `${Math.min(34, Math.max(18, shadowMaskWidth * 0.7))}%`,
                    opacity: shadowMaskOpacity,
                    transform: `rotate(${optimalSolarAngle + 180 - northAngle}deg)`,
                    width: `${shadowMaskWidth}%`,
                  }}
                >
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/60 px-2 py-0.5 font-mono text-[9px] text-amber-100">{eavesDepth}mm shadow mask</span>
                </div>
              )}
              <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
            </div>
          </div>
          <div className="mt-5 rounded-md border border-white/10 bg-[#11151b] p-4">
            <div className="flex items-center justify-between gap-3">
              <div><h4 className="text-sm font-semibold text-white">Site Analysis Layers</h4><p className="mt-1 text-xs text-zinc-500">Compass + site diagram in one preview.</p></div>
              <button className={buttonClass('secondary')} onClick={() => downloadText('ArchiVault_Site_Analysis_Notes.txt', siteNotes)}>Download Notes</button>
            </div>
            <div className={`mt-4 rounded-md border p-3 ${isAligned ? 'border-emerald-300/30 bg-emerald-300/10' : angleDelta > 90 ? 'border-amber-300/40 bg-amber-300/10' : 'border-cyan-300/25 bg-cyan-300/10'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white">Live Site Suggestion</p>
                <span className="rounded bg-black/20 px-2 py-1 font-mono text-[10px] text-cyan-100">{northAngle} deg · {orientationSector}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-200">{siteAngleAdvice}</p>
              <p className="mt-2 text-xs leading-5 text-cyan-100/80">{siteRoadAdvice}</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ['sun', 'Sun Direction'],
                ['road', 'Main Road Side'],
                ['noise', 'Noise Source'],
                ['view', 'Best View'],
                ['access', 'Site Access'],
                ['slope', 'Slope Direction'],
              ].map(([key, label]) => <div key={key}><Field label={label}><select className={inputClass()} value={site[key as keyof typeof site]} onChange={(event) => setSite({ ...site, [key]: event.target.value })}>{Object.keys(directions).map((item) => <option key={item}>{item}</option>)}</select></Field></div>)}
            </div>
            <pre className="mt-4 whitespace-pre-wrap rounded-md border border-white/10 bg-black/20 p-3 text-xs leading-5 text-zinc-300">{siteNotes}</pre>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Design Advisory Studio</h3>
          <div className={`mt-3 rounded-md border p-3 ${isAligned ? 'border-emerald-300/30 bg-emerald-300/10' : angleDelta > 90 ? 'border-amber-300/40 bg-amber-300/10' : 'border-cyan-300/25 bg-cyan-300/10'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-white">Compass Response</h4>
              <span className="rounded border border-white/10 bg-black/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-100">{northAngle} deg · {orientationSector}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-200">{compassResponse}</p>
            <p className="mt-2 text-xs leading-5 text-cyan-100/80">{windResponse}</p>
          </div>
          {activeAdvisoryItems.map(([title, text]) => <div key={title} className="mt-3 rounded-md border border-white/10 bg-[#11151b] p-3"><h4 className="text-sm font-semibold text-white">{title}</h4><p className="mt-1 text-xs leading-5 text-zinc-400">{text}</p></div>)}
          <div className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3"><h4 className="text-sm font-semibold text-amber-100">Material Specification Study</h4><p className="mt-1 text-xs leading-5 text-amber-100/80">{materialNote}</p></div>
          <div className="mt-4 flex flex-wrap gap-2"><button className={buttonClass('secondary')} onClick={() => downloadText('site_analysis_vectors.scr', '; Site analysis diagram script\n')}>Export Site Analysis Diagram Script</button><button className={buttonClass()} onClick={generateFullReport}>Generate Full Report</button></div>
        </div>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">Summary Report Panel</h3>
            <p className="mt-1 text-sm text-zinc-400">One place to review code checks, tile quantities, warning count, and overall status before exporting.</p>
          </div>
          <span className={`rounded-md px-3 py-1 text-xs font-bold ${overallStatus === 'Safe' ? 'bg-emerald-300 text-emerald-950' : overallStatus === 'Critical' ? 'bg-red-300 text-red-950' : 'bg-amber-300 text-amber-950'}`}>{overallStatus}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/70">Building Code Summary</p>
            <p className="mt-2 text-sm text-white">Score {complianceScore}% · FAR {far.toFixed(2)} · footprint {actualFootprint.toFixed(1)} sqm</p>
            <p className="mt-1 text-xs text-cyan-50/70">Max floor area {maxFloorArea.toFixed(1)} sqm; open-space target {requiredOpenSpace.toFixed(1)} sqm.</p>
          </div>
          <div className="rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-100/70">Material Summary</p>
            <p className="mt-2 text-sm text-white">{tiles} tiles · {tileBoxes} boxes · {cutTiles} cuts</p>
            <p className="mt-1 text-xs text-emerald-50/70">Budget {totalTileBudget.toLocaleString(undefined, { maximumFractionDigits: 0 })}; cost/sqm {costPerSqm.toFixed(0)}.</p>
          </div>
          <div className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-amber-100/70">Warnings</p>
            <p className="mt-2 text-sm text-white">{totalWarnings} total warnings</p>
            <p className="mt-1 text-xs text-amber-50/80">{codeIssues.find(([status]) => status === 'critical')?.[1] ?? tileWarnings[0]?.[1] ?? 'No major warning. Continue refining dimensions and supplier prices.'}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={buttonClass()} onClick={generateFullReport}>Export PDF Report</button>
          <button className={buttonClass('secondary')} onClick={saveComplianceSummary}>Save to Project</button>
          <button className={buttonClass('secondary')} onClick={() => navigator.clipboard?.writeText(`Code ${complianceScore}% | Tile ${tiles} pcs | Budget ${totalTileBudget.toFixed(0)} | Warnings ${totalWarnings}`)}>Copy Summary</button>
        </div>
        {saveNote && <p className="mt-3 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-2 text-xs text-emerald-50">{saveNote}</p>}
      </div>
    </section>
  );
}

type SiteBoundaryPoint = { x: number; y: number; lat: number; lng: number };
type SiteMapProvider = 'osm' | 'google-roadmap' | 'google-satellite' | 'google-hybrid' | 'google-terrain';
type SiteViewMode = '2D' | 'CONCEPT_3D' | 'REAL_3D';
type SiteSearchResult = { id: string; name: string; address: string; type: string; lat: number; lng: number; distanceMeters?: number };
type SiteMassingState = { width: number; length: number; height: number; floors: number; rotation: number; x: number; y: number; enabled: boolean };
type LeafletSiteMapProps = {
  site: { address: string; latitude: number; longitude: number };
  boundary: SiteBoundaryPoint[];
  activeTool: 'pin' | 'draw' | 'edit';
  selectedVertexIndex: number | null;
  showSiteBoundary: boolean;
  mapProvider: SiteMapProvider;
  googleEnabled: boolean;
  fitRequest: number;
  finishBoundary: () => void;
  setLocationSelected: React.Dispatch<React.SetStateAction<boolean>>;
  setMapCenter: React.Dispatch<React.SetStateAction<{ lat: number; lng: number }>>;
  setSelectedVertexIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setSite: React.Dispatch<React.SetStateAction<any>>;
  setBoundary: React.Dispatch<React.SetStateAction<SiteBoundaryPoint[]>>;
  showNotice: (text: string) => void;
};

function toCanvasPoint(lat: number, lng: number, siteLat: number, siteLng: number) {
  return {
    x: Math.max(6, Math.min(94, 50 + (lng - siteLng) * 65000)),
    y: Math.max(6, Math.min(94, 50 - (lat - siteLat) * 70000)),
  };
}

function calculateBoundaryMetrics(boundary: SiteBoundaryPoint[]) {
  if (boundary.length === 0) return { area: 0, perimeter: 0, centroid: null as { lat: number; lng: number } | null };
  const earthMetersPerDegreeLat = 111_320;
  const originLat = boundary.reduce((sum, point) => sum + point.lat, 0) / boundary.length;
  const originLng = boundary.reduce((sum, point) => sum + point.lng, 0) / boundary.length;
  const metersPerDegreeLng = earthMetersPerDegreeLat * Math.cos((originLat * Math.PI) / 180);
  const projected = boundary.map((point) => ({
    x: (point.lng - originLng) * metersPerDegreeLng,
    y: (point.lat - originLat) * earthMetersPerDegreeLat,
  }));
  const signedArea = boundary.length >= 3 ? projected.reduce((sum, point, index) => {
    const next = projected[(index + 1) % projected.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) : 0;
  const perimeter = projected.reduce((sum, point, index) => {
    const next = projected[index + 1] ?? (boundary.length >= 3 ? projected[0] : null);
    if (!next) return sum;
    return sum + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
  return {
    area: Math.round(Math.abs(signedArea) / 2),
    perimeter: Math.round(perimeter),
    centroid: { lat: originLat, lng: originLng },
  };
}

function distanceMetersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}

function isGoogleSiteProvider(provider: SiteMapProvider) {
  return provider.startsWith('google');
}

function getSiteTileLayer(provider: SiteMapProvider, googleEnabled: boolean) {
  if (isGoogleSiteProvider(provider) && !googleEnabled) {
    return { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', label: 'OpenStreetMap' };
  }
  const layers: Record<SiteMapProvider, { url: string; attribution: string; label: string }> = {
    osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', label: 'OpenStreetMap' },
    'google-roadmap': { url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', attribution: '&copy; Google Maps', label: 'Google Roadmap' },
    'google-satellite': { url: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', attribution: '&copy; Google Maps', label: 'Google Satellite' },
    'google-hybrid': { url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', attribution: '&copy; Google Maps', label: 'Google Hybrid' },
    'google-terrain': { url: 'https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', attribution: '&copy; Google Maps', label: 'Google Terrain' },
  };
  return layers[provider];
}

function LeafletMapController({ site, boundary, fitRequest, mapProvider }: Pick<LeafletSiteMapProps, 'site' | 'boundary' | 'fitRequest' | 'mapProvider'>) {
  const map = useMap();

  useEffect(() => {
    map.setView([site.latitude, site.longitude], Math.max(map.getZoom(), 17), { animate: true });
  }, [map, site.latitude, site.longitude]);

  useEffect(() => {
    if (boundary.length >= 2) {
      map.fitBounds(boundary.map((point) => [point.lat, point.lng]) as any, { padding: [42, 42], maxZoom: mapProvider === 'google-terrain' ? 18 : 19 });
      return;
    }
    map.setView([site.latitude, site.longitude], 17, { animate: true });
  }, [boundary, fitRequest, map, mapProvider, site.latitude, site.longitude]);

  return null;
}

function LeafletMapClickTools({ site, activeTool, finishBoundary, setLocationSelected, setMapCenter, setSite, setBoundary, showNotice }: Pick<LeafletSiteMapProps, 'site' | 'activeTool' | 'finishBoundary' | 'setLocationSelected' | 'setMapCenter' | 'setSite' | 'setBoundary' | 'showNotice'>) {
  const map = useMap();
  useMapEvents({
    click(event) {
      const lat = event.latlng.lat;
      const lng = event.latlng.lng;
      if (activeTool === 'draw') {
        const canvasPoint = toCanvasPoint(lat, lng, site.latitude, site.longitude);
        setBoundary((current) => [...current, { ...canvasPoint, lat, lng }]);
        showNotice('Corner added. Click Finish when done.');
        return;
      }
      if (activeTool === 'pin') {
        setSite((current: any) => ({ ...current, latitude: lat, longitude: lng }));
        setLocationSelected(true);
        showNotice('Site pin moved.');
      }
    },
    dblclick() {
      if (activeTool === 'draw') finishBoundary();
    },
    moveend() {
      const center = map.getCenter();
      setMapCenter({ lat: center.lat, lng: center.lng });
    },
  });
  return null;
}

function LeafletSiteMap({ site, boundary, activeTool, selectedVertexIndex, showSiteBoundary, mapProvider, googleEnabled, fitRequest, finishBoundary, setLocationSelected, setMapCenter, setSelectedVertexIndex, setSite, setBoundary, showNotice }: LeafletSiteMapProps) {
  const tileLayer = getSiteTileLayer(mapProvider, googleEnabled);
  const polygonPositions = boundary.map((point) => [point.lat, point.lng]) as any;

  return (
    <MapContainer center={[site.latitude, site.longitude]} zoom={17} className="absolute inset-0 z-0 h-full w-full bg-[#080a0d]" scrollWheelZoom doubleClickZoom={false}>
      <TileLayer key={tileLayer.url} attribution={tileLayer.attribution} url={tileLayer.url} subdomains={isGoogleSiteProvider(mapProvider) && googleEnabled ? ['0', '1', '2', '3'] : ['a', 'b', 'c']} />
      <LeafletMapController site={site} boundary={boundary} fitRequest={fitRequest} mapProvider={mapProvider} />
      <LeafletMapClickTools site={site} activeTool={activeTool} finishBoundary={finishBoundary} setLocationSelected={setLocationSelected} setMapCenter={setMapCenter} setSite={setSite} setBoundary={setBoundary} showNotice={showNotice} />
      {activeTool !== 'draw' && <Marker
        position={[site.latitude, site.longitude] as any}
        draggable
        eventHandlers={{
          dragend: (event: any) => {
            const latLng = event.target.getLatLng();
            setSite((current: any) => ({ ...current, latitude: latLng.lat, longitude: latLng.lng }));
            setLocationSelected(true);
            showNotice('Site pin moved.');
          },
        }}
      />}
      {showSiteBoundary && boundary.length >= 3 && (
        <LeafletPolygon positions={polygonPositions} pathOptions={{ color: '#67e8f9', weight: 2, fillColor: '#22d3ee', fillOpacity: 0.16 }} />
      )}
      {showSiteBoundary && boundary.length === 2 && (
        <Polyline positions={polygonPositions} pathOptions={{ color: '#67e8f9', weight: 2, dashArray: '6 6' }} />
      )}
      {showSiteBoundary && activeTool !== 'edit' && boundary.map((point, index) => (
        <CircleMarker
          key={`dot-${point.lat}-${point.lng}-${index}`}
          center={[point.lat, point.lng] as any}
          radius={index === boundary.length - 1 ? 5 : 4}
          pathOptions={{ color: '#a5f3fc', fillColor: '#22d3ee', fillOpacity: 0.95, weight: selectedVertexIndex === index ? 3 : 1.5 }}
        />
      ))}
      {showSiteBoundary && activeTool === 'edit' && boundary.map((point, index) => (
        <Marker
          key={`${point.lat}-${point.lng}-${index}`}
          position={[point.lat, point.lng] as any}
          draggable
          eventHandlers={{
            click: () => setSelectedVertexIndex(index),
            dragend: (event: any) => {
              const latLng = event.target.getLatLng();
              const canvasPoint = toCanvasPoint(latLng.lat, latLng.lng, site.latitude, site.longitude);
              setSelectedVertexIndex(index);
              setBoundary((current) => current.map((currentPoint, currentIndex) => (
                currentIndex === index ? { ...currentPoint, ...canvasPoint, lat: latLng.lat, lng: latLng.lng } : currentPoint
              )));
            },
          }}
        />
      ))}
    </MapContainer>
  );
}

function CesiumReal3DView({
  boundary,
  site,
  massing,
  googleMapTilesKey,
  cesiumIonToken,
  showSiteBoundary,
  showMassing,
  cameraCommand,
  onStatus,
  onFallback,
}: {
  boundary: SiteBoundaryPoint[];
  site: { latitude: number; longitude: number; address: string };
  massing: SiteMassingState;
  googleMapTilesKey: string;
  cesiumIonToken: string;
  showSiteBoundary: boolean;
  showMassing: boolean;
  cameraCommand: string | null;
  onStatus: (text: string) => void;
  onFallback: (text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const cesiumRef = useRef<any>(null);
  const lastCommandRef = useRef<typeof cameraCommand>(null);
  const hasBoundary = boundary.length >= 3;
  const centroid = useMemo(() => calculateBoundaryMetrics(boundary).centroid ?? { lat: site.latitude, lng: site.longitude }, [boundary, site.latitude, site.longitude]);

  useEffect(() => {
    let cancelled = false;
    let viewer: any;

    async function initCesium() {
      if (!containerRef.current) return;
      if (!googleMapTilesKey.trim()) {
        onFallback('Real Google 3D requires developer configuration. Showing conceptual 3D instead.');
        return;
      }
      const canvas = document.createElement('canvas');
      const webgl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!webgl) {
        onFallback('Your browser does not support WebGL. Showing conceptual 3D instead.');
        return;
      }
      try {
        onStatus('Loading Google Photorealistic 3D Tiles...');
        const Cesium = await import('cesium');
        if (cancelled || !containerRef.current) return;
        cesiumRef.current = Cesium;
        if (cesiumIonToken.trim()) Cesium.Ion.defaultAccessToken = cesiumIonToken.trim();
        viewer = new Cesium.Viewer(containerRef.current, {
          animation: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          navigationHelpButton: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
          terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        });
        viewerRef.current = viewer;
        viewer.scene.globe.show = false;
        viewer.scene.skyAtmosphere.show = true;
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#05070a');

        const tileset = await Cesium.Cesium3DTileset.fromUrl(`https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(googleMapTilesKey.trim())}`);
        if (cancelled || viewer.isDestroyed?.()) return;
        viewer.scene.primitives.add(tileset);
        onStatus('Real Google 3D connected.');
      } catch (error) {
        console.error('Real Google 3D failed to load', error);
        if (!cancelled) onFallback('Real 3D failed to load. Switched to conceptual 3D.');
        return;
      }
    }

    initCesium();
    return () => {
      cancelled = true;
      if (viewerRef.current && !viewerRef.current.isDestroyed?.()) viewerRef.current.destroy();
      viewerRef.current = null;
      cesiumRef.current = null;
    };
  }, [cesiumIonToken, googleMapTilesKey, onFallback, onStatus]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || viewer.isDestroyed?.()) return;
    viewer.entities.removeAll();
    if (showSiteBoundary && hasBoundary) {
      const positions = boundary.map((point) => Cesium.Cartesian3.fromDegrees(point.lng, point.lat, 3));
      viewer.entities.add({
        name: 'Selected site boundary',
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.20),
          outline: true,
          outlineColor: Cesium.Color.CYAN,
        },
      });
      viewer.entities.add({
        polyline: {
          positions: [...positions, positions[0]],
          width: 4,
          material: Cesium.Color.CYAN,
          clampToGround: false,
        },
      });
    }
    if (showMassing && massing.enabled && hasBoundary) {
      const height = Math.max(3, massing.height || massing.floors * 3);
      viewer.entities.add({
        name: 'Concept massing overlay',
        position: Cesium.Cartesian3.fromDegrees(centroid.lng, centroid.lat, height / 2),
        box: {
          dimensions: new Cesium.Cartesian3(Math.max(4, massing.width), Math.max(4, massing.length), height),
          material: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.35),
          outline: true,
          outlineColor: Cesium.Color.WHITE,
        },
      });
    }
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(centroid.lng, centroid.lat, hasBoundary ? 520 : 900),
      orientation: {
        heading: Cesium.Math.toRadians(35),
        pitch: Cesium.Math.toRadians(-55),
        roll: 0,
      },
      duration: 1.2,
    });
  }, [boundary, centroid.lat, centroid.lng, hasBoundary, massing, showMassing, showSiteBoundary]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !cameraCommand || lastCommandRef.current === cameraCommand) return;
    lastCommandRef.current = cameraCommand;
    const command = cameraCommand.split('-')[0];
    const height = command === 'top' ? 900 : 520;
    if (command === 'snapshot') {
      try {
        viewer.render();
        const link = document.createElement('a');
        link.href = viewer.canvas.toDataURL('image/png');
        link.download = 'site_real_google_3d_snapshot.png';
        link.click();
        onStatus('3D snapshot downloaded.');
      } catch {
        onStatus('3D snapshot is unavailable in this browser.');
      }
      return;
    }
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(centroid.lng, centroid.lat, height),
      orientation: {
        heading: Cesium.Math.toRadians(command === 'top' ? 0 : 35),
        pitch: Cesium.Math.toRadians(command === 'top' ? -90 : -55),
        roll: 0,
      },
      duration: 0.8,
    });
  }, [cameraCommand, centroid.lat, centroid.lng, onStatus]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0 [&_.cesium-widget-credits]:hidden" />
      <div className="absolute left-4 top-20 z-10 max-w-sm rounded-xl border border-cyan-300/20 bg-black/65 p-3 text-xs leading-5 text-cyan-50 backdrop-blur">
        <p className="font-semibold">Real Google 3D</p>
        <p className="mt-1 text-cyan-50/75">Photorealistic 3D tiles load only when the developer configured Google Map Tiles API.</p>
      </div>
    </div>
  );
}

function SiteAnalysisTab() {
  const configuredGoogleKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';
  const configuredGoogleMapTilesKey = (import.meta.env.VITE_GOOGLE_MAP_TILES_API_KEY as string | undefined) ?? '';
  const configuredCesiumIonToken = (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined) ?? '';
  const mapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const googleMapRef = useRef<any>(null);
  const googleMarkerRef = useRef<any>(null);
  const googlePolygonRef = useRef<any>(null);
  const [apiKey, setApiKey] = useState(configuredGoogleKey);
  const [connectionStatus, setConnectionStatus] = useState('OpenStreetMap Ready');
  const [notice, setNotice] = useState('');
  const googleMapsEnabled = apiKey.trim().length > 0;
  const [site, setSite] = useState({
    address: '',
    latitude: 14.5995,
    longitude: 120.9842,
    area: 0,
    perimeter: 0,
    road: 'East',
    wind: 'Northeast',
    sun: 'East',
    zoning: 'R2',
    far: 2.0,
    maxFootprint: 432,
    setbacks: 2,
    maxHeight: 10,
    parking: 2,
    targetUse: 'Student housing / mixed-use study',
    constructionCost: 3200000,
    revenue: 4100000,
  });
  const [siteSize, setSiteSize] = useState({ width: 24, length: 30, rotation: 8 });
  const [massing, setMassing] = useState({ width: 14, length: 18, height: 9, floors: 3, rotation: 8, x: 50, y: 45, enabled: false });
  const [mapMode, setMapMode] = useState<'leaflet' | 'mock' | 'google'>('leaflet');
  const [mapType, setMapType] = useState('roadmap');
  const [mapProvider, setMapProvider] = useState<SiteMapProvider>('osm');
  const [activeTool, setActiveTool] = useState<'pin' | 'draw' | 'edit'>('pin');
  const [siteWorkspace, setSiteWorkspace] = useState<'analyze' | 'quantitative' | 'context' | 'feasibility' | 'concept' | 'reports' | 'saved'>('analyze');
  const [siteViewMode, setSiteViewMode] = useState<SiteViewMode>('2D');
  const [real3dStatus, setReal3dStatus] = useState(configuredGoogleMapTilesKey.trim() ? 'Real Google 3D ready' : 'Real Google 3D not connected');
  const [real3dCameraCommand, setReal3dCameraCommand] = useState<string | null>(null);
  const [showSiteBoundary, setShowSiteBoundary] = useState(true);
  const [isDrawingBoundary, setIsDrawingBoundary] = useState(false);
  const [locationSelected, setLocationSelected] = useState(false);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: 14.5995, lng: 120.9842 });
  const [searchResults, setSearchResults] = useState<SiteSearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<SiteSearchResult[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [openMapData, setOpenMapData] = useState({ status: 'Not loaded', amenities: 0, schools: 0, hospitals: 0, parks: 0, transit: 0, roads: 0, buildings: 0 });
  const [helperDismissed, setHelperDismissed] = useState(false);
  const [mapFitRequest, setMapFitRequest] = useState(0);
  const [showInsightsPanel, setShowInsightsPanel] = useState(true);
  const [showSiteSidebar, setShowSiteSidebar] = useState(true);
  const [siteMoreToolsOpen, setSiteMoreToolsOpen] = useState(false);
  const [reportDrawerOpen, setReportDrawerOpen] = useState(false);
  const [workflowGuideOpen, setWorkflowGuideOpen] = useState(true);
  const [insightsOpen, setInsightsOpen] = useState({ quantitative: true, climate: true, amenities: true, recommendations: true });
  const [deepConfigOpen, setDeepConfigOpen] = useState(false);
  const [contextMapTab, setContextMapTab] = useState<'Building Analysis' | 'Land Use' | 'Road Network' | 'Compare Maps'>('Building Analysis');
  const [contextSubtab, setContextSubtab] = useState('Height');
  const [activeAnalysis, setActiveAnalysis] = useState<'macro' | 'solidVoid' | 'access' | 'environmental' | 'zoning' | 'threeD'>('macro');
  const [selectedTemplate, setSelectedTemplate] = useState('Urban Site Analysis');
  const [boundary, setBoundary] = useState<SiteBoundaryPoint[]>([]);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState({
    roads: true,
    satellite: false,
    terrain: false,
    transit: true,
    amenities: true,
    green: true,
    schools: true,
    retail: true,
    water: false,
    noise: true,
    landUse: true,
  });
  const [threeD, setThreeD] = useState({ buildings: true, roads: true, sunShadow: true, massing: true, height: 12, orbit: 34, zoom: 1 });
  const [climate, setClimate] = useState({ month: 'June', time: '9:00 AM', buildingHeight: 8, orientation: 35, radius: '500m', weatherProvider: 'Mock weather' });
  const [analysisToggles, setAnalysisToggles] = useState({
    macroRadius: true,
    microBoundary: true,
    landmarks: true,
    flowArrows: true,
    contextLabels: true,
    buildingMass: true,
    openSpace: true,
    densityHeat: true,
    courtyards: true,
    pedestrian: true,
    vehicle: true,
    desireLines: true,
    barriers: true,
    entries: true,
    service: true,
    sunPath: true,
    wind: true,
    topography: true,
    vegetation: true,
    views: true,
    noise: true,
    shadow: true,
  });
  const [savedStudies, setSavedStudies] = useState<string[]>([]);

  const workflowSteps = [
    ['1', 'Search Site', 'Find or type the location.'],
    ['2', 'Draw Boundary', 'Pin the site and adjust corners.'],
    ['3', 'View in 3D', 'Check roads, sun, and massing.'],
    ['4', 'Edit Massing', 'Test building size and floors.'],
    ['5', 'Analyze Site', 'Review easy design cards.'],
    ['6', 'Export Report', 'Save a board-ready summary.'],
  ];

  const siteMonths = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const siteTimes = [
    '12:00 AM', '1:00 AM', '2:00 AM', '3:00 AM', '4:00 AM', '5:00 AM',
    '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
    '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
    '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM',
  ];

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 2600);
  }, []);

  const real3dEnabled = configuredGoogleMapTilesKey.trim().length > 0;
  const handleReal3dStatus = useCallback((text: string) => setReal3dStatus(text), []);
  const handleReal3dFallback = useCallback((text: string) => {
    setReal3dStatus(text);
    setSiteViewMode('CONCEPT_3D');
    showNotice(text);
  }, [showNotice]);

  useEffect(() => {
    function closeFloatingUi(event: MouseEvent) {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
        setShowRecentSearches(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setShowSearchDropdown(false);
      setShowRecentSearches(false);
      setSiteMoreToolsOpen(false);
      if (isDrawingBoundary) {
        if (boundary.length === 0 || window.confirm('Cancel boundary drawing?')) cancelBoundaryDrawing();
      }
    }
    document.addEventListener('mousedown', closeFloatingUi);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', closeFloatingUi);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [boundary.length, isDrawingBoundary]);

  const hasSiteBoundary = boundary.length >= 3;

  const boundaryMetrics = useMemo(() => calculateBoundaryMetrics(boundary), [boundary]);
  const polygonArea = boundaryMetrics.area;
  const perimeter = boundaryMetrics.perimeter;
  const mapStatus = isDrawingBoundary
    ? `Drawing boundary - live estimate (${boundary.length} point${boundary.length === 1 ? '' : 's'} added)`
    : activeTool === 'edit' && hasSiteBoundary
      ? 'Editing boundary'
      : hasSiteBoundary
        ? 'Boundary complete'
        : locationSelected
          ? 'Location selected'
          : 'No site selected';
  const boundaryWarnings = [
    boundary.length > 0 && boundary.length < 3 ? 'Boundary needs at least 3 points.' : '',
    hasSiteBoundary && polygonArea < 40 ? 'Site area seems too small.' : '',
    hasSiteBoundary && polygonArea > 100000 ? 'Site area seems unusually large.' : '',
  ].filter(Boolean);
  const analysisReadiness = hasSiteBoundary ? 'Full boundary analysis active' : locationSelected ? 'Using selected point only' : 'Boundary required';

  useEffect(() => {
    setSite((current) => ({
      ...current,
      area: polygonArea,
      perimeter,
      latitude: boundaryMetrics.centroid?.lat ?? current.latitude,
      longitude: boundaryMetrics.centroid?.lng ?? current.longitude,
    }));
  }, [boundaryMetrics.centroid, polygonArea, perimeter]);

  useEffect(() => {
    const center = boundaryMetrics.centroid ?? (locationSelected ? { lat: site.latitude, lng: site.longitude } : null);
    if (!center) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setOpenMapData((current) => ({ ...current, status: 'Loading open map data...' }));
        const radius = hasSiteBoundary ? 700 : 500;
        const query = `[out:json][timeout:12];
(
  node(around:${radius},${center.lat},${center.lng})["amenity"];
  node(around:${radius},${center.lat},${center.lng})["highway"="bus_stop"];
  way(around:${radius},${center.lat},${center.lng})["leisure"="park"];
  way(around:${radius},${center.lat},${center.lng})["highway"];
  way(around:${radius},${center.lat},${center.lng})["building"];
);
out tags;`;
        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Open map data unavailable');
        const data = await response.json();
        const elements = Array.isArray(data.elements) ? data.elements : [];
        setOpenMapData({
          status: 'Estimated from OpenStreetMap',
          amenities: elements.filter((item: any) => item.tags?.amenity).length,
          schools: elements.filter((item: any) => item.tags?.amenity === 'school' || item.tags?.amenity === 'university' || item.tags?.amenity === 'college').length,
          hospitals: elements.filter((item: any) => item.tags?.amenity === 'hospital' || item.tags?.amenity === 'clinic').length,
          parks: elements.filter((item: any) => item.tags?.leisure === 'park').length,
          transit: elements.filter((item: any) => item.tags?.highway === 'bus_stop').length,
          roads: elements.filter((item: any) => item.tags?.highway && item.type === 'way').length,
          buildings: elements.filter((item: any) => item.tags?.building).length,
        });
      } catch {
        if (!controller.signal.aborted) setOpenMapData((current) => ({ ...current, status: 'Open data temporarily unavailable' }));
      }
    }, 650);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [boundaryMetrics.centroid, hasSiteBoundary, locationSelected, site.latitude, site.longitude]);

  const massingCalc = useMemo(() => {
    if (!massing.enabled || !hasSiteBoundary) return { footprint: 0, gfa: 0, far: 0, coverage: 0, openSpace: site.area, height: 0, warnings: [] as string[] };
    const footprint = Math.max(0, massing.width * massing.length);
    const gfa = footprint * Math.max(1, massing.floors);
    const far = site.area > 0 ? gfa / site.area : 0;
    const coverage = site.area > 0 ? (footprint / site.area) * 100 : 0;
    const openSpace = Math.max(0, site.area - footprint);
    const height = massing.height || massing.floors * 3;
    const outsideSite = massing.x < 18 || massing.x > 82 || massing.y < 18 || massing.y > 82;
    const warnings = [
      outsideSite ? 'Building mass may be too close to or outside the site boundary.' : '',
      coverage > 70 ? 'Building footprint is large. Open space may be too low.' : '',
      far > site.far ? 'Current massing exceeds the FAR guide.' : '',
      height > site.maxHeight ? 'Massing height exceeds the max height guide.' : '',
      footprint > site.maxFootprint ? 'Footprint is larger than the max footprint guide.' : '',
    ].filter(Boolean);
    return { footprint, gfa, far, coverage, openSpace, height, warnings };
  }, [hasSiteBoundary, massing, site.area, site.far, site.maxFootprint, site.maxHeight]);

  const opportunities = useMemo(() => [
    ...(!hasSiteBoundary ? ['Start by drawing a site boundary so the report can calculate real site metrics.'] : []),
    `Use the ${site.road.toLowerCase()} road frontage for the clearest arrival sequence.`,
    `${site.wind} wind can support cross ventilation if openings are paired across the site.`,
    `The selected ${climate.radius} context radius is useful for mapping schools, transit, parks, and daily amenities.`,
  ], [hasSiteBoundary, site.road, site.wind, climate.radius]);

  const constraints = useMemo(() => [
    'West-facing edges need shade screens, trees, or deeper overhangs for afternoon heat.',
    'Traffic-facing edges should include landscape or service buffers before quiet spaces.',
    'Zoning, setbacks, FAR, and parking values are planning assumptions until verified with local authorities.',
  ], []);

  const feasibility = useMemo(() => {
    if (!hasSiteBoundary) return { allowableGfa: 0, estimatedFloors: 0, roi: 0, score: 0 };
    const allowableGfa = site.area * site.far;
    const estimatedFloors = Math.max(1, Math.ceil(allowableGfa / Math.max(site.maxFootprint, 1)));
    const roi = ((site.revenue - site.constructionCost) / Math.max(site.constructionCost, 1)) * 100;
    const score = Math.max(20, Math.min(96, Math.round(58 + roi / 2 + site.far * 5 - (site.maxHeight < 8 ? 12 : 0) - massingCalc.warnings.length * 4)));
    return { allowableGfa, estimatedFloors, roi, score };
  }, [hasSiteBoundary, massingCalc.warnings.length, site.area, site.constructionCost, site.far, site.maxFootprint, site.maxHeight, site.revenue]);

  const analysisMetrics = useMemo(() => {
    if (!hasSiteBoundary) return { builtCoverage: 0, openSpace: 0, densityScore: 0, fragmentationScore: 0, voidOpportunity: 0, accessPoints: 0, pedestrianScore: 0, vehicleScore: 0, barrierSeverity: 0, connectivity: 0 };
    const builtCoverage = Math.min(88, Math.max(22, Math.round((site.maxFootprint / Math.max(site.area, 1)) * 100)));
    const openSpace = Math.max(0, 100 - builtCoverage);
    const densityScore = Math.min(100, Math.round(builtCoverage * 0.9 + (analysisToggles.densityHeat ? 8 : 0)));
    const fragmentationScore = analysisToggles.courtyards ? 42 : 66;
    const voidOpportunity = Math.max(20, Math.min(96, openSpace + (analysisToggles.openSpace ? 18 : 0) - fragmentationScore / 5));
    const accessPoints = (analysisToggles.entries ? 2 : 0) + (analysisToggles.service ? 1 : 0);
    const pedestrianScore = analysisToggles.pedestrian ? 82 : 54;
    const vehicleScore = analysisToggles.vehicle ? 74 : 46;
    const barrierSeverity = analysisToggles.barriers ? 58 : 18;
    const connectivity = Math.round((pedestrianScore + vehicleScore + (100 - barrierSeverity)) / 3);
    return { builtCoverage, openSpace, densityScore, fragmentationScore, voidOpportunity, accessPoints, pedestrianScore, vehicleScore, barrierSeverity, connectivity };
  }, [analysisToggles, hasSiteBoundary, site.area, site.maxFootprint]);

  const recommendations = useMemo(() => [
    ...(!hasSiteBoundary ? [['Getting started', 'Search a site or draw a boundary to begin. Analysis will unlock after a valid polygon exists.']] : []),
    ...(hasSiteBoundary ? [
      ['Boundary', isDrawingBoundary ? 'Draft boundary in progress. Finish when the traced lot matches your site.' : 'Boundary complete. You can now review live site metrics and export a report.'],
      ['Site size', site.area > 2500 ? 'Boundary is large enough for multiple massing options.' : site.area > 0 ? 'Compact site. Test massing carefully to protect open space.' : 'Draw a cleaner boundary if this was not the intended lot.'],
      ['Open map data', openMapData.status.includes('Estimated') ? `OpenStreetMap found ${openMapData.amenities} mapped amenities and ${openMapData.roads} nearby road segments.` : 'Open map data is unavailable right now; use manual observation notes if needed.'],
    ] : []),
    ['Macro context', 'Use the strongest urban flow to position the main frontage and arrival sequence.'],
    ['Micro context', 'Study street enclosure, edge rhythm, and immediate neighbors before locating openings.'],
    ['Solid/void', `Estimated built coverage is ${analysisMetrics.builtCoverage}%; use open voids as breathing spaces or courtyards.`],
    ['Access/movement', `Pedestrian score ${analysisMetrics.pedestrianScore}/100. Keep public entry readable from the strongest flow.`],
    ['Site access', `Place public spaces and lobby frontage toward the ${site.road} edge.`],
    ['Climate', `Catch ${site.wind} breezes with aligned openings and shaded outdoor transition spaces.`],
    ['Sun/shadow', `${climate.month} ${climate.time}: prioritize east daylight and protect west-facing glass.`],
    ['Noise', 'Use planting, service rooms, storage, or parking as buffers along traffic-heavy edges.'],
    ['Views', 'Keep communal rooms and active frontage toward pedestrian movement and open-space views.'],
    ['Zoning', `At FAR ${site.far.toFixed(1)}, estimated allowable GFA is ${feasibility.allowableGfa.toFixed(0)} sqm.`],
    ['Massing', `Your test mass is ${massingCalc.footprint.toFixed(0)} sqm footprint, ${massingCalc.gfa.toFixed(0)} sqm GFA, FAR ${massingCalc.far.toFixed(2)}.`],
    ['Circulation', 'Separate service access from primary pedestrian arrival whenever the road network allows it.'],
    ['Concept direction', 'Let access, climate, urban grain, and void opportunities become the first drivers of the parti diagram.'],
  ], [analysisMetrics.builtCoverage, analysisMetrics.pedestrianScore, climate.month, climate.time, feasibility.allowableGfa, hasSiteBoundary, isDrawingBoundary, massingCalc.far, massingCalc.footprint, massingCalc.gfa, openMapData.amenities, openMapData.roads, openMapData.status, site.area, site.far, site.road, site.wind]);

  const layerFindings = useMemo(() => {
    const findings: Record<typeof activeAnalysis, string[]> = {
      macro: [
        `Macro radius ${climate.radius} is active for reading districts, landmarks, and movement corridors.`,
        `Main frontage should respond to the strongest flow from the ${site.road} side.`,
        'Use context labels to explain why this location matters in the urban network.',
      ],
      solidVoid: [
        `Built coverage estimate: ${analysisMetrics.builtCoverage}%; open-space ratio: ${analysisMetrics.openSpace}%.`,
        `Density score ${analysisMetrics.densityScore}/100 and fragmentation score ${analysisMetrics.fragmentationScore}/100 are placeholder/manual metrics.`,
        'Use void spaces to guide pedestrian flow, courtyard placement, and outdoor breathing zones.',
      ],
      access: [
        `Access points detected/planned: ${analysisMetrics.accessPoints}.`,
        `Connectivity score ${analysisMetrics.connectivity}/100 with barrier severity ${analysisMetrics.barrierSeverity}/100.`,
        'Separate service access from public entry and buffer noisy traffic edges.',
      ],
      environmental: [
        `${climate.month} ${climate.time} sun and ${site.wind} wind layers are active.`,
        'Avoid large unshaded west-facing glass and preserve vegetation as a heat buffer.',
        'Orient public spaces toward good views and service areas toward noisy or poor-view edges.',
      ],
      zoning: [
        `Allowable GFA is ${feasibility.allowableGfa.toFixed(0)} sqm under the current FAR assumption.`,
        `Estimated floors: ${feasibility.estimatedFloors}; test mass FAR: ${massingCalc.far.toFixed(2)}; feasibility score: ${feasibility.score}/100.`,
        'Verify official zoning, setbacks, parking, and height limits with local authorities.',
      ],
      threeD: [
        'Conceptual 3D massing shows site block, surrounding context blocks, roads, sun, and shadow.',
        'Connect a 3D tiles/building provider for real city geometry.',
        'Use height and orbit sliders to explain massing impact in presentations.',
      ],
    };
    return findings[activeAnalysis];
  }, [activeAnalysis, analysisMetrics, climate.month, climate.radius, climate.time, feasibility.allowableGfa, feasibility.estimatedFloors, feasibility.score, massingCalc.far, site.road, site.wind]);

  const reportLines = useMemo(() => !hasSiteBoundary ? [
    'No site selected yet.',
    'Start by searching a location or drawing your site boundary.',
    `Current map center: ${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}`,
    'Your site analysis report will appear after selecting a site.',
  ] : [
    `Address: ${site.address || 'Selected site'}`,
    `Boundary status: ${isDrawingBoundary ? 'Draft boundary in progress' : 'Boundary complete'}`,
    `Coordinates: ${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}`,
    `Site area: ${site.area.toLocaleString()} sqm (${(site.area / 10000).toFixed(3)} ha)`,
    `Perimeter: ${site.perimeter} m`,
    `Main road/access side: ${site.road}`,
    `Weather provider: ${climate.weatherProvider}`,
    `Wind direction: ${site.wind}`,
    `Sun direction/time: ${site.sun}, ${climate.month} ${climate.time}`,
    `Zoning guide: ${site.zoning}; FAR ${site.far}; max footprint ${site.maxFootprint} sqm; setbacks ${site.setbacks} m`,
    `Allowable GFA: ${feasibility.allowableGfa.toFixed(0)} sqm; feasibility score ${feasibility.score}/100`,
    `Concept massing: ${massing.enabled ? `${massing.width}m x ${massing.length}m x ${massing.height}m, ${massing.floors} floors` : 'Not added yet'}`,
    `Massing footprint: ${massingCalc.footprint.toFixed(0)} sqm; GFA: ${massingCalc.gfa.toFixed(0)} sqm; FAR: ${massingCalc.far.toFixed(2)}; open space: ${massingCalc.openSpace.toFixed(0)} sqm`,
    '',
    'Opportunities:',
    ...opportunities.map((item) => `- ${item}`),
    '',
    'Constraints:',
    ...constraints.map((item) => `- ${item}`),
    '',
    'Recommendations:',
    ...recommendations.map(([group, text]) => `- ${group}: ${text}`),
    '',
    `Active analysis layer: ${activeAnalysis}`,
    ...layerFindings.map((item) => `- ${item}`),
    '',
    'Data note: Map, weather, places, zoning, and 3D layers may use placeholder data unless API providers are connected.',
  ], [activeAnalysis, climate.month, climate.time, climate.weatherProvider, constraints, feasibility.allowableGfa, feasibility.score, hasSiteBoundary, isDrawingBoundary, layerFindings, massing, massingCalc, opportunities, recommendations, site]);

  function saveApiKey() {
    showNotice('Google Maps key is managed by the developer through VITE_GOOGLE_MAPS_API_KEY.');
  }

  function fitBoundaryToGoogleMap() {
    const google = (window as any).google;
    if (!googleMapRef.current || !google || boundary.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    boundary.forEach((point) => bounds.extend({ lat: point.lat, lng: point.lng }));
    googleMapRef.current.fitBounds(bounds);
  }

  function syncGooglePolygon() {
    const google = (window as any).google;
    if (!googleMapRef.current || !google) return;
    if (!showSiteBoundary) {
      if (googlePolygonRef.current) googlePolygonRef.current.setMap(null);
      return;
    }
    const path = boundary.map((point) => ({ lat: point.lat, lng: point.lng }));
    if (!googlePolygonRef.current) {
      googlePolygonRef.current = new google.maps.Polygon({
        paths: path,
        editable: true,
        draggable: activeTool === 'edit',
        strokeColor: '#67e8f9',
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: '#22d3ee',
        fillOpacity: 0.16,
        map: googleMapRef.current,
      });
      const updateBoundaryFromGoogle = () => {
        const next = googlePolygonRef.current.getPath().getArray().map((latLng: any, index: number) => ({
          x: boundary[index]?.x ?? 40 + index * 8,
          y: boundary[index]?.y ?? 35 + index * 7,
          lat: latLng.lat(),
          lng: latLng.lng(),
        }));
        setBoundary(next);
      };
      googlePolygonRef.current.getPath().addListener('set_at', updateBoundaryFromGoogle);
      googlePolygonRef.current.getPath().addListener('insert_at', updateBoundaryFromGoogle);
      googlePolygonRef.current.addListener('dragend', updateBoundaryFromGoogle);
    } else {
      googlePolygonRef.current.setMap(googleMapRef.current);
      googlePolygonRef.current.setPath(path);
      googlePolygonRef.current.setEditable(activeTool === 'edit' || activeTool === 'draw');
      googlePolygonRef.current.setDraggable(activeTool === 'edit');
    }
  }

  function initGoogleMap() {
    const google = (window as any).google;
    if (!google?.maps || !mapRef.current) {
      setConnectionStatus('Map failed to load');
      setMapMode('mock');
      return;
    }
    setMapMode('google');
    setConnectionStatus('Connected');
    const center = { lat: site.latitude, lng: site.longitude };
    googleMapRef.current = new google.maps.Map(mapRef.current, {
      center,
      zoom: 17,
      mapTypeId: siteViewMode !== '2D' ? 'satellite' : mapType,
      disableDefaultUI: false,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#111827' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#d1d5db' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#020617' }] },
      ],
    });
    try {
      googleMapRef.current.setTilt?.(siteViewMode !== '2D' ? 45 : 0);
      googleMapRef.current.setHeading?.(siteViewMode !== '2D' ? threeD.orbit : 0);
      if (siteViewMode !== '2D') googleMapRef.current.setZoom?.(18);
    } catch {
      showNotice('3D camera controls are limited on this map view.');
    }
    googleMarkerRef.current = new google.maps.Marker({ position: center, draggable: true, map: googleMapRef.current, title: site.address });
    googleMarkerRef.current.addListener('dragend', (event: any) => {
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      setSite((current) => ({ ...current, latitude: lat, longitude: lng }));
    });
    googleMapRef.current.addListener('click', (event: any) => {
      if (activeTool === 'pin') {
        const lat = event.latLng.lat();
        const lng = event.latLng.lng();
        googleMarkerRef.current.setPosition({ lat, lng });
        setSite((current) => ({ ...current, latitude: lat, longitude: lng }));
      }
    });
    if (google.maps.places && searchInputRef.current) {
      const autocomplete = new google.maps.places.Autocomplete(searchInputRef.current, {
        fields: ['formatted_address', 'geometry', 'name'],
      });
      autocomplete.bindTo('bounds', googleMapRef.current);
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const location = place?.geometry?.location;
        if (!location) {
          showNotice('Choose a location from the search suggestions.');
          return;
        }
        const lat = location.lat();
        const lng = location.lng();
        const address = place.formatted_address || place.name || site.address;
        setSite((current) => ({ ...current, address, latitude: lat, longitude: lng }));
        googleMapRef.current.setCenter({ lat, lng });
        googleMapRef.current.setZoom(18);
        googleMarkerRef.current.setPosition({ lat, lng });
        showNotice('Site located on Google Maps.');
      });
    }
    syncGooglePolygon();
  }

  function testGoogleConnection() {
    if (!apiKey.trim()) {
      setConnectionStatus('Mock Map Mode');
      setMapMode('mock');
      return;
    }
    const existing = document.getElementById('archivault-google-maps-js') as HTMLScriptElement | null;
    if ((window as any).google?.maps) {
      initGoogleMap();
      return;
    }
    if (existing) {
      existing.addEventListener('load', initGoogleMap, { once: true });
      existing.addEventListener('error', () => setConnectionStatus('Invalid API key or map failed to load'), { once: true });
      return;
    }
    setConnectionStatus('Testing connection...');
    const script = document.createElement('script');
    script.id = 'archivault-google-maps-js';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey.trim())}&libraries=places,drawing,geometry`;
    script.async = true;
    script.onload = initGoogleMap;
    script.onerror = () => {
      setConnectionStatus('Invalid API key or map failed to load');
      setMapMode('mock');
    };
    document.head.appendChild(script);
  }

  useEffect(() => {
    if (googleMapRef.current) {
      googleMapRef.current.setMapTypeId(siteViewMode !== '2D' ? 'satellite' : mapType);
      try {
        googleMapRef.current.setTilt?.(siteViewMode !== '2D' ? 45 : 0);
        googleMapRef.current.setHeading?.(siteViewMode !== '2D' ? threeD.orbit : 0);
        if (siteViewMode !== '2D') googleMapRef.current.setZoom?.(Math.max(18, googleMapRef.current.getZoom?.() ?? 18));
      } catch {
        // Some map types/regions do not expose tilt or heading controls.
      }
      syncGooglePolygon();
    }
  }, [activeTool, boundary, mapType, siteViewMode, threeD.orbit, showSiteBoundary]);

  useEffect(() => {
    setMapMode('leaflet');
    setConnectionStatus('OpenStreetMap Ready');
  }, []);

  function chooseMapProvider(provider: SiteMapProvider) {
    if (isGoogleSiteProvider(provider) && !googleMapsEnabled) {
      setMapProvider('osm');
      showNotice('Google Maps is not connected. OpenStreetMap mode is active.');
      return;
    }
    setMapMode('leaflet');
    setSiteViewMode('2D');
    setMapProvider(provider);
    setConnectionStatus(isGoogleSiteProvider(provider) ? 'Google Maps Connected' : 'OpenStreetMap Ready');
  }

  function startBoundaryDrawing() {
    setActiveTool('draw');
    setIsDrawingBoundary(true);
    setSelectedVertexIndex(null);
    setSiteMoreToolsOpen(false);
    setShowSearchDropdown(false);
    if (boundary.length === 0) setMassing({ ...massing, enabled: false });
    showNotice('Click the lot corners. Click Finish when done.');
  }

  function finishBoundary() {
    if (boundary.length < 3) {
      showNotice('Add at least 3 points to create a boundary.');
      return;
    }
    setIsDrawingBoundary(false);
    setActiveTool('pin');
    setMapFitRequest((value) => value + 1);
    showNotice('Boundary complete. You can now analyze the site.');
  }

  function undoBoundaryPoint() {
    setBoundary((current) => current.slice(0, -1));
    setSelectedVertexIndex(null);
    showNotice('Last boundary point removed.');
  }

  function cancelBoundaryDrawing() {
    setBoundary([]);
    setIsDrawingBoundary(false);
    setActiveTool('pin');
    setSelectedVertexIndex(null);
    setMassing((current) => ({ ...current, enabled: false }));
    showNotice('Boundary drawing cancelled.');
  }

  function removeSelectedVertex() {
    if (selectedVertexIndex === null) {
      showNotice('Select a boundary corner first.');
      return;
    }
    setBoundary((current) => current.filter((_, index) => index !== selectedVertexIndex));
    setSelectedVertexIndex(null);
    showNotice('Selected boundary corner removed.');
  }

  function finishEditingBoundary() {
    setActiveTool('pin');
    setSelectedVertexIndex(null);
    showNotice('Boundary updated.');
  }

  async function searchAddress() {
    setSiteMoreToolsOpen(false);
    const google = (window as any).google;
    if (mapMode === 'google' && google?.maps) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: site.address }, (results: any[], status: string) => {
        if (status === 'OK' && results?.[0]) {
          const location = results[0].geometry.location;
          const lat = location.lat();
          const lng = location.lng();
          setSite((current) => ({ ...current, latitude: lat, longitude: lng, address: results[0].formatted_address }));
          googleMapRef.current.setCenter({ lat, lng });
          googleMarkerRef.current.setPosition({ lat, lng });
          showNotice('Address located on Google Maps.');
        } else {
          showNotice('Address search failed. Try a more specific location.');
        }
      });
      return;
    }
    if (mapMode === 'leaflet') {
      try {
        const rawQuery = site.address.trim();
        if (!rawQuery) {
          setSearchError('Type a place, landmark, school, barangay, or city first.');
          setShowSearchDropdown(true);
          showNotice('Type a location first.');
          return;
        }
        setSearchLoading(true);
        setSearchError('');
        setSearchResults([]);
        setConnectionStatus('Searching OpenStreetMap...');
        const cleanedQuery = rawQuery.replace(/[^\w\s.,-]/g, ' ').replace(/\s+/g, ' ').trim();
        const queryVariants = Array.from(new Set([
          rawQuery,
          `${rawQuery} Philippines`,
          cleanedQuery,
          `${cleanedQuery} Philippines`,
          cleanedQuery.split(',').slice(-2).join(' ').trim(),
        ].filter(Boolean)));
        const allResults: any[] = [];
        for (const query of queryVariants) {
          const params = new URLSearchParams({ format: 'json', addressdetails: '1', limit: '8', bounded: '0', countrycodes: 'ph', q: query });
          const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
          if (!response.ok) throw new Error('Search service unavailable');
          const results = await response.json();
          if (Array.isArray(results)) allResults.push(...results);
          if (Array.isArray(results) && results.length >= 3) break;
        }
        const seen = new Set<string>();
        const mappedResults: SiteSearchResult[] = allResults.map((result: any, index: number) => {
          const address = result.address ?? {};
          const name = result.name || address.school || address.amenity || address.building || address.road || address.suburb || address.city || address.town || address.village || result.display_name?.split(',')[0] || 'Search result';
          const lat = Number(result.lat);
          const lng = Number(result.lon);
          return {
            id: `${result.place_id ?? `${lat}-${lng}-${index}`}`,
            name,
            address: result.display_name ?? 'OpenStreetMap result',
            type: result.type || result.class || address.amenity || 'place',
            lat,
            lng,
            distanceMeters: Number.isFinite(lat) && Number.isFinite(lng) ? distanceMetersBetween(mapCenter, { lat, lng }) : undefined,
          };
        }).filter((result) => {
          if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng) || seen.has(result.id)) return false;
          seen.add(result.id);
          return true;
        }).slice(0, 8);
        if (mappedResults.length) {
          setSearchResults(mappedResults);
          setShowSearchDropdown(true);
          setShowRecentSearches(false);
          setConnectionStatus('OpenStreetMap Ready');
          showNotice('Search results ready. Choose the correct site location.');
          return;
        }
        setConnectionStatus('OpenStreetMap Ready');
        setSearchError('No exact result found. Try a shorter name, nearby city, or click the map manually.');
        setShowSearchDropdown(true);
        showNotice('No OpenStreetMap result found. Try a more specific address.');
      } catch {
        setConnectionStatus('OpenStreetMap Ready');
        setSearchError('Search service unavailable. Try manual map selection.');
        setShowSearchDropdown(true);
        showNotice('Address search is unavailable right now. You can still click the map to pin the site.');
      } finally {
        setSearchLoading(false);
      }
      return;
    }
    showNotice('Mock search active. Click the map area or adjust coordinates manually.');
  }

  function selectSearchResult(result: SiteSearchResult) {
    setSite((current) => ({ ...current, address: result.address, latitude: result.lat, longitude: result.lng }));
    setLocationSelected(true);
    setMapCenter({ lat: result.lat, lng: result.lng });
    setSearchResults([]);
    setShowSearchDropdown(false);
    setShowRecentSearches(false);
    setSearchError('');
    setRecentSearches((current) => [result, ...current.filter((item) => item.id !== result.id)].slice(0, 3));
    showNotice('Site location selected.');
  }

  function clearSearch() {
    setSite((current) => ({ ...current, address: '' }));
    setSearchResults([]);
    setSearchError('');
    setShowSearchDropdown(false);
    setShowRecentSearches(false);
  }

  function useMapCenter() {
    setSite((current) => ({ ...current, latitude: mapCenter.lat, longitude: mapCenter.lng, address: current.address || 'Selected map center' }));
    setLocationSelected(true);
    showNotice('Map center selected as site location.');
  }

  function moveBoundaryPoint(index: number, key: 'x' | 'y', value: number) {
    setBoundary((current) => current.map((point, pointIndex) => {
      if (pointIndex !== index) return point;
      const nextValue = Math.max(6, Math.min(94, value));
      const latOffset = (nextValue - 50) / 70000;
      const lngOffset = (nextValue - 50) / 65000;
      return key === 'x' ? { ...point, x: nextValue, lng: site.longitude + lngOffset } : { ...point, y: nextValue, lat: site.latitude - latOffset };
    }));
  }

  function clearBoundary() {
    if (hasSiteBoundary && !window.confirm('Clear the current site boundary?')) return;
    setBoundary([]);
    setMassing((current) => ({ ...current, enabled: false }));
    setIsDrawingBoundary(false);
    setActiveTool('pin');
    setSelectedVertexIndex(null);
    if (googlePolygonRef.current) googlePolygonRef.current.setMap(null);
    googlePolygonRef.current = null;
    showNotice('Site boundary cleared.');
  }

  function resetBoundary() {
    setBoundary([]);
    setMassing((current) => ({ ...current, enabled: false }));
    setIsDrawingBoundary(true);
    showNotice('Draw Boundary is active. Click points on the map to outline your site.');
  }

  function applyManualSiteSize(nextSize = siteSize) {
    const width = Math.max(4, nextSize.width);
    const length = Math.max(4, nextSize.length);
    const area = Math.round(width * length);
    const perimeterMeters = Math.round((width + length) * 2);
    const w = Math.max(12, Math.min(70, width * 1.4));
    const h = Math.max(12, Math.min(70, length * 1.15));
    const cx = 52;
    const cy = 45;
    setSiteSize(nextSize);
    setSite((current) => ({ ...current, area, perimeter: perimeterMeters }));
    setBoundary([
      { x: cx - w / 2, y: cy - h / 2, lat: site.latitude + 0.00035, lng: site.longitude - 0.00035 },
      { x: cx + w / 2, y: cy - h / 2, lat: site.latitude + 0.00032, lng: site.longitude + 0.00035 },
      { x: cx + w / 2, y: cy + h / 2, lat: site.latitude - 0.00028, lng: site.longitude + 0.00042 },
      { x: cx - w / 2, y: cy + h / 2, lat: site.latitude - 0.00032, lng: site.longitude - 0.00038 },
    ]);
    showNotice('Site size and boundary updated.');
  }

  function saveSiteStudy() {
    if (!hasSiteBoundary) {
      showNotice('Draw a site boundary before saving a study.');
      return;
    }
    const name = window.prompt('Enter site study/project name', `${site.address} Site Study`);
    if (!name) return;
    const savedProject = {
      id: crypto.randomUUID(),
      project_name: name,
      address: site.address,
      latitude: site.latitude,
      longitude: site.longitude,
      site_area_sqm: site.area,
      perimeter_m: site.perimeter,
      zoning: site.zoning,
      boundary,
      massing: { ...massing, ...massingCalc },
      report_summary: reportLines.join('\n'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const existing = JSON.parse(window.localStorage.getItem('archivault_site_analysis_projects') ?? '[]');
    window.localStorage.setItem('archivault_site_analysis_projects', JSON.stringify([savedProject, ...existing].slice(0, 20)));
    setSavedStudies((current) => [name, ...current.slice(0, 4)]);
    showNotice(`${name} saved locally for this session.`);
  }

  function copyReport() {
    navigator.clipboard?.writeText(reportLines.join('\n'));
    showNotice('Site analysis summary copied.');
  }

  const layerItems = [
    ['roads', 'Roads'],
    ['satellite', 'Satellite'],
    ['terrain', 'Terrain'],
    ['transit', 'Transit'],
    ['amenities', 'Nearby amenities'],
    ['green', 'Green/open spaces'],
    ['schools', 'Schools'],
    ['retail', 'Retail'],
    ['water', 'Waterways'],
    ['noise', 'Noise placeholder'],
    ['landUse', 'Land use placeholder'],
  ] as const;

  const analysisLayerItems = [
    ['macro', 'Macro and Micro', 'City role, radii, landmarks, flows, and site edges.'],
    ['solidVoid', 'Solid and Void', 'Figure-ground, density, courtyards, and open spaces.'],
    ['access', 'Access and Movement', 'Entries, pedestrian paths, vehicles, desire lines, barriers.'],
    ['environmental', 'Environmental Layers', 'Sun, wind, vegetation, views, noise, topography, shadow.'],
    ['zoning', 'Zoning and Feasibility', 'FAR, footprint, height, parking, ROI placeholders.'],
    ['threeD', '3D Context', 'Concept massing, roads, shadow, and surrounding blocks.'],
  ] as const;

  const analysisToggleGroups: Record<typeof activeAnalysis, Array<keyof typeof analysisToggles>> = {
    macro: ['macroRadius', 'microBoundary', 'landmarks', 'flowArrows', 'contextLabels'],
    solidVoid: ['buildingMass', 'openSpace', 'densityHeat', 'courtyards'],
    access: ['pedestrian', 'vehicle', 'desireLines', 'barriers', 'entries', 'service'],
    environmental: ['sunPath', 'wind', 'topography', 'vegetation', 'views', 'noise', 'shadow'],
    zoning: ['microBoundary', 'contextLabels'],
    threeD: ['buildingMass', 'openSpace', 'sunPath', 'shadow'],
  };

  function applySiteTemplate(template: string) {
    setSelectedTemplate(template);
    if (template.includes('Solid')) {
      setActiveAnalysis('solidVoid');
      setAnalysisToggles((current) => ({ ...current, buildingMass: true, openSpace: true, densityHeat: true, courtyards: true }));
      showNotice('Solid and Void Figure-Ground Study template applied.');
      return;
    }
    if (template.includes('Access')) {
      setActiveAnalysis('access');
      setAnalysisToggles((current) => ({ ...current, pedestrian: true, vehicle: true, desireLines: true, barriers: true, entries: true, service: true }));
      showNotice('Access and Movement Study template applied.');
      return;
    }
    if (template.includes('Climate')) {
      setActiveAnalysis('environmental');
      setAnalysisToggles((current) => ({ ...current, sunPath: true, wind: true, vegetation: true, views: true, noise: true, shadow: true }));
      setClimate((current) => ({ ...current, month: 'June', time: '3:00 PM' }));
      showNotice('Climate Response Study template applied.');
      return;
    }
    if (template.includes('Commercial')) {
      setActiveAnalysis('access');
      setSite((current) => ({ ...current, targetUse: 'Commercial frontage study', far: 3 }));
      showNotice('Commercial Site Analysis template applied.');
      return;
    }
    setActiveAnalysis('macro');
    setClimate((current) => ({ ...current, radius: template.includes('Thesis') ? '2km' : '500m' }));
    showNotice(`${template} template applied.`);
  }

  function exportAnalysisDiagram(kind: string) {
    const titleText = `ArchiVault ${kind} Diagram`;
    const notes = layerFindings.map((item, index) => `<text x="40" y="${500 + index * 24}" fill="#d1d5db" font-size="16">${item.replace(/[<>&]/g, '')}</text>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="700" viewBox="0 0 1100 700">
<rect width="1100" height="700" fill="#080a0d"/>
<text x="40" y="52" fill="#67e8f9" font-size="26" font-family="Arial">${titleText}</text>
<text x="40" y="82" fill="#94a3b8" font-size="14" font-family="Arial">${new Date().toLocaleDateString()} | ${site.address.replace(/[<>&]/g, '')}</text>
<rect x="90" y="120" width="720" height="340" fill="#111827" stroke="#334155"/>
<polygon points="${boundary.map((point) => `${90 + point.x * 7.2},${120 + point.y * 3.4}`).join(' ')}" fill="#0e7490" stroke="#67e8f9" stroke-width="4"/>
<line x1="450" y1="290" x2="620" y2="230" stroke="#fde047" stroke-width="5"/>
<line x1="240" y1="370" x2="710" y2="210" stroke="#22d3ee" stroke-width="4" stroke-dasharray="12 8"/>
<text x="850" y="135" fill="#f8fafc" font-size="18">Legend</text>
<rect x="850" y="155" width="28" height="14" fill="#0e7490" stroke="#67e8f9"/><text x="890" y="168" fill="#d1d5db" font-size="14">Selected site</text>
<line x1="850" y1="200" x2="880" y2="190" stroke="#fde047" stroke-width="5"/><text x="890" y="200" fill="#d1d5db" font-size="14">Sun / shadow</text>
<line x1="850" y1="232" x2="880" y2="222" stroke="#22d3ee" stroke-width="4" stroke-dasharray="8 6"/><text x="890" y="232" fill="#d1d5db" font-size="14">Movement / wind</text>
${notes}
<text x="40" y="660" fill="#fbbf24" font-size="13">Placeholder GIS/3D/weather data unless API providers are connected. Verify official site data before final design decisions.</text>
</svg>`;
    downloadText(`ArchiVault_${kind.replace(/[^\w]+/g, '_')}_Diagram.svg`, svg);
    showNotice(`${kind} diagram exported.`);
  }

  const boundaryPath = boundary.map((point) => `${point.x},${point.y}`).join(' ');
  const shadowAngle = climate.month === 'December' ? 48 : climate.month === 'June' ? 24 : 34;
  const shadowLength = Math.max(28, Math.min(72, climate.buildingHeight * (climate.month === 'December' ? 5 : 3)));

  const workspaceNav = [
    ['analyze', 'Analyze', 'Search, draw, and run a quick study.'],
    ['quantitative', 'Metrics', 'Scores, risks, and data cards.'],
    ['context', 'Context', 'Buildings, roads, land use, and overlays.'],
    ['feasibility', 'Climate', 'Sun, wind, climate, zoning, and risk.'],
    ['concept', 'Concept', 'Test massing and site moves.'],
    ['reports', 'Reports', 'Export summaries and diagrams.'],
    ['saved', 'Saved', 'Open saved project studies.'],
  ] as const;
  const quantitativeCards = !hasSiteBoundary ? [
    ['Site area', 'No site selected', 'Placeholder', 'Draw a boundary to calculate site metrics.'],
    ['Perimeter', 'No site selected', 'Placeholder', 'Boundary length appears after at least 3 points.'],
    ['Coordinates', `${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}`, 'Placeholder', 'Click or drag the map marker to update.'],
    ['Footprint', 'Add massing later', 'Placeholder', 'Massing unlocks after drawing a boundary.'],
    ['GFA / FAR', 'No massing yet', 'Placeholder', 'Add Building Mass to test floors and FAR.'],
    ['Open space', 'No site selected', 'Placeholder', 'Open-space estimate needs a site boundary.'],
    ['Walkability', 'Pending', 'Placeholder', 'Analysis unlocks after boundary selection.'],
    ['Nearby amenities', 'Pending', 'Placeholder', 'Use Analyze Site after drawing the site.'],
  ] : [
    ['Potential visitors', '1.8k/day', 'Moderate', 'Estimated / placeholder'],
    ['Green space', `${analysisMetrics.openSpace}%`, analysisMetrics.openSpace > 35 ? 'Good' : 'Moderate', 'From open-space estimate'],
    ['Public transport', 'Good', 'Good', 'Transit proximity placeholder'],
    ['Average income', 'Sample', 'Placeholder', 'Connect demographic API'],
    ['Walkability', `${Math.max(35, Math.min(92, 45 + openMapData.roads * 3 + openMapData.transit * 4 + openMapData.amenities))}/100`, openMapData.status.includes('Estimated') ? 'Good' : 'Placeholder', openMapData.status.includes('Estimated') ? 'Estimated from open map data.' : 'Data unavailable - connect provider or enter manually.'],
    ['Nearby amenities', `${openMapData.amenities}`, openMapData.status.includes('Estimated') ? 'Good' : 'Placeholder', openMapData.status],
    ['Noise level', openMapData.roads > 8 ? 'Moderate' : 'Low', openMapData.roads > 8 ? 'Moderate' : 'Good', openMapData.status.includes('Estimated') ? 'Estimated from nearby mapped roads.' : 'Traffic edge estimate placeholder.'],
    ['Flood risk', 'Low-Med', 'Moderate', 'Drainage placeholder'],
    ['Population density', 'Unavailable', 'Placeholder', 'Data unavailable - connect provider or enter manually.'],
    ['Land value index', '67/100', 'Placeholder', 'Future market data'],
    ['Property price', 'Sample', 'Placeholder', 'Future real estate data'],
    ['Median rent', 'Sample', 'Placeholder', 'Future real estate data'],
    ['Zoning FAR', site.far.toFixed(2), massingCalc.far <= site.far ? 'Good' : 'High Risk', 'Manual zoning input'],
    ['Height limit', `${site.maxHeight}m`, massingCalc.height <= site.maxHeight ? 'Good' : 'High Risk', 'Manual zoning input'],
    ['Setbacks', `${site.setbacks}m`, 'Placeholder', 'Verify with local code'],
    ['Impervious surface', `${Math.round(massingCalc.coverage)}%`, massingCalc.coverage > 70 ? 'High Risk' : 'Moderate', 'Concept massing estimate'],
  ];
  const climateProfile = [
    ['Jan', 27, 34, 'NE'], ['Feb', 28, 28, 'NE'], ['Mar', 29, 24, 'E'], ['Apr', 31, 31, 'SE'],
    ['May', 32, 97, 'S'], ['Jun', 31, 158, 'SW'], ['Jul', 30, 190, 'SW'], ['Aug', 30, 210, 'SW'],
    ['Sep', 30, 190, 'SW'], ['Oct', 29, 150, 'E'], ['Nov', 28, 82, 'NE'], ['Dec', 27, 48, 'NE'],
  ] as const;

  return (
    <section className="relative flex h-[calc(100vh-8px)] w-full flex-col overflow-hidden border border-white/10 bg-[#05070a] text-white shadow-2xl lg:-mx-4 lg:-mt-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0b0f14] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Site Analysis</p>
          <h2 className="truncate text-lg font-semibold">Urban Site Analysis Workspace</h2>
          <p className="mt-0.5 truncate text-[11px] text-zinc-400">{hasSiteBoundary ? (site.address || 'Selected site') : 'No site selected yet'} &middot; {hasSiteBoundary ? `${site.area.toLocaleString()} sqm` : 'draw a boundary to calculate area'} &middot; {site.latitude.toFixed(5)}, {site.longitude.toFixed(5)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`hidden rounded-md border px-2 py-1 text-[11px] sm:inline-flex ${mapMode === 'leaflet' || mapMode === 'google' || siteViewMode === 'REAL_3D' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : connectionStatus.includes('failed') || connectionStatus.includes('Invalid') ? 'border-red-300/30 bg-red-300/10 text-red-100' : 'border-amber-300/30 bg-amber-300/10 text-amber-100'}`}>{siteViewMode === 'REAL_3D' ? 'Real 3D' : siteViewMode === 'CONCEPT_3D' ? 'Concept 3D' : getSiteTileLayer(mapProvider, googleMapsEnabled).label}</span>
          <span className={`hidden rounded-md border px-2 py-1 text-[11px] md:inline-flex ${real3dEnabled ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : 'border-zinc-300/20 bg-white/5 text-zinc-300'}`}>Real 3D: {real3dEnabled ? 'Ready' : 'Off'}</span>
          <button className={buttonClass('secondary')} onClick={() => setShowSiteSidebar((value) => !value)}>{showSiteSidebar ? 'Hide Menu' : 'Show Menu'}</button>
          <button className={buttonClass('secondary')} onClick={() => setShowInsightsPanel((value) => !value)}>{showInsightsPanel ? 'Hide Insights' : 'Show Insights'}</button>
          <button className={buttonClass('secondary')} onClick={saveSiteStudy}>Save Project</button>
          <button className={buttonClass()} onClick={() => { downloadSimplePdf('ArchiVault_Site_Analysis_Report.pdf', 'ArchiVault Site Analysis Report', reportLines); showNotice('Site analysis PDF exported.'); }}>Export Report</button>
        </div>
      </div>

      {notice && <p className="mx-3 mt-2 shrink-0 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-2 text-xs text-emerald-50">{notice}</p>}

      <div className={`grid min-h-0 flex-1 gap-0 ${showSiteSidebar && showInsightsPanel ? 'lg:grid-cols-[72px_minmax(0,1fr)_300px] 2xl:grid-cols-[210px_minmax(0,1fr)_310px]' : showSiteSidebar ? 'lg:grid-cols-[72px_minmax(0,1fr)] 2xl:grid-cols-[210px_minmax(0,1fr)]' : showInsightsPanel ? 'lg:grid-cols-[minmax(0,1fr)_300px]' : 'grid-cols-1'}`}>
        {showSiteSidebar && <aside className="hidden min-h-0 overflow-y-auto border-r border-white/10 bg-[#0b0f14] p-2 lg:block">
          <div className="hidden rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 2xl:block">
            <button className="flex w-full items-center justify-between text-left text-xs font-semibold text-cyan-100" onClick={() => setWorkflowGuideOpen((value) => !value)}>
              <span>Simple workflow</span>
              <span>{workflowGuideOpen ? 'Hide' : 'Show'}</span>
            </button>
            {workflowGuideOpen && <ol className="mt-2 space-y-1 text-[11px] leading-5 text-cyan-50/80">
              <li>1. Search your site.</li>
              <li>2. Draw the boundary.</li>
              <li>3. Analyze context.</li>
              <li>4. Switch to 3D for massing.</li>
              <li>5. Export report.</li>
            </ol>}
          </div>
          <div className="mt-2 space-y-1.5">
            {workspaceNav.map(([id, label, help]) => (
              <button key={id} type="button" title={label} onClick={() => setSiteWorkspace(id)} className={`w-full rounded-xl border px-2 py-2 text-center transition 2xl:p-3 2xl:text-left ${siteWorkspace === id ? 'border-cyan-300/50 bg-cyan-300/15 text-cyan-50' : 'border-white/10 bg-[#111827] text-zinc-300 hover:border-cyan-300/30'}`}>
                <span className="block text-[11px] font-semibold 2xl:text-sm">{label}</span>
                <span className="mt-1 hidden text-[11px] leading-4 text-zinc-500 2xl:block">{help}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 hidden rounded-xl border border-white/10 bg-[#111827] p-3 2xl:block">
            <p className="text-xs font-semibold text-white">Map Status</p>
            <p className={`mt-2 rounded border px-2 py-1 text-[11px] ${mapMode === 'leaflet' || mapMode === 'google' || siteViewMode === 'REAL_3D' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/30 bg-amber-300/10 text-amber-100'}`}>{siteViewMode === 'REAL_3D' ? real3dStatus : siteViewMode === 'CONCEPT_3D' ? 'Concept 3D View' : getSiteTileLayer(mapProvider, googleMapsEnabled).label}</p>
            <p className="mt-2 text-[11px] leading-4 text-zinc-500">{real3dEnabled ? 'Leaflet handles drawing; Real Google 3D is available for viewing the selected site.' : googleMapsEnabled ? 'Google map tile options are enabled, but Leaflet remains the drawing framework.' : 'Google Maps is not connected. OpenStreetMap mode is active.'}</p>
          </div>
        </aside>}

        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#070a0f] p-2">
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-[#0f141b] p-2">
            <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-white">{workspaceNav.find(([id]) => id === siteWorkspace)?.[1]}</h3>
                <p className="mt-0.5 hidden text-[11px] text-zinc-400 sm:block">{siteWorkspace === 'analyze' ? 'Search, draw, and analyze without leaving the map.' : 'Same map, different analysis lens.'}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button className={`${siteViewMode === '2D' && mapProvider === 'osm' ? buttonClass() : buttonClass('secondary')} !px-2 !py-1 text-[11px]`} onClick={() => chooseMapProvider('osm')}>OSM</button>
                {[
                  ['google-satellite', 'Satellite'],
                  ['google-hybrid', 'Hybrid'],
                  ['google-terrain', 'Terrain'],
                ].map(([provider, label]) => <button key={provider} disabled={!googleMapsEnabled} className={`${siteViewMode === '2D' && mapProvider === provider ? buttonClass() : buttonClass('secondary')} !px-2 !py-1 text-[11px] ${!googleMapsEnabled ? 'cursor-not-allowed opacity-45' : ''}`} onClick={() => chooseMapProvider(provider as SiteMapProvider)}>{label}{!googleMapsEnabled ? ' Locked' : ''}</button>)}
                <button className={`${siteViewMode === 'CONCEPT_3D' ? buttonClass() : buttonClass('secondary')} !px-2 !py-1 text-[11px]`} onClick={() => { setSiteViewMode('CONCEPT_3D'); setSiteWorkspace('concept'); }}>3D</button>
                <button className={`${siteViewMode === 'REAL_3D' ? buttonClass() : buttonClass('secondary')} !px-2 !py-1 text-[11px] ${!real3dEnabled ? 'opacity-75' : ''}`} onClick={() => {
                  if (!hasSiteBoundary) {
                    showNotice('Draw a site boundary first.');
                    return;
                  }
                  if (!real3dEnabled) {
                    setSiteViewMode('CONCEPT_3D');
                    setSiteWorkspace('concept');
                    showNotice('Real Google 3D is not connected. Showing conceptual 3D preview.');
                    return;
                  }
                  setSiteViewMode('REAL_3D');
                  setSiteWorkspace('concept');
                  setReal3dStatus('Opening Real Google 3D...');
                }}>Real Google 3D{!real3dEnabled ? ' Locked' : ''}</button>
              </div>
            </div>

            <div className="relative min-h-[520px] flex-1 overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#080a0d] shadow-inner md:min-h-0">
              {mapMode === 'leaflet' && siteViewMode === '2D' && (
                <LeafletSiteMap site={site} boundary={boundary} activeTool={activeTool} selectedVertexIndex={selectedVertexIndex} showSiteBoundary={showSiteBoundary} mapProvider={mapProvider} googleEnabled={googleMapsEnabled} fitRequest={mapFitRequest} finishBoundary={finishBoundary} setLocationSelected={setLocationSelected} setMapCenter={setMapCenter} setSelectedVertexIndex={setSelectedVertexIndex} setSite={setSite} setBoundary={setBoundary} showNotice={showNotice} />
              )}
              <div ref={mapRef} className={`${mapMode === 'google' && siteViewMode === '2D' ? 'block' : 'hidden'} absolute inset-0`} />
              {(mapMode === 'mock' || siteViewMode !== '2D') && (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_24%,rgba(34,197,94,.16),transparent_20%),radial-gradient(circle_at_78%_28%,rgba(59,130,246,.12),transparent_18%),linear-gradient(90deg,rgba(34,211,238,.09)_1px,transparent_1px),linear-gradient(rgba(34,211,238,.09)_1px,transparent_1px)] bg-[size:auto,auto,10%_12.5%,10%_12.5%]">
                  {siteViewMode !== '2D' ? (
                    !hasSiteBoundary ? (
                      <div className="absolute inset-0 grid place-items-center p-6">
                        <div className="max-w-md rounded-2xl border border-amber-300/25 bg-amber-300/10 p-5 text-center text-amber-50">
                          <h3 className="text-base font-semibold">Draw a site boundary first</h3>
                          <p className="mt-2 text-sm leading-6">Draw a site boundary in 2D Map first. Then switch to Concept 3D or Real Google 3D.</p>
                          <button className={`${buttonClass()} mt-4`} onClick={() => { setSiteViewMode('2D'); setActiveTool('draw'); setIsDrawingBoundary(true); }}>Go to 2D + Draw Boundary</button>
                        </div>
                      </div>
                    ) : siteViewMode === 'REAL_3D' && real3dEnabled ? (
                      <CesiumReal3DView
                        boundary={boundary}
                        site={site}
                        massing={massing}
                        googleMapTilesKey={configuredGoogleMapTilesKey}
                        cesiumIonToken={configuredCesiumIonToken}
                        showSiteBoundary={showSiteBoundary}
                        showMassing={massing.enabled && threeD.massing}
                        cameraCommand={real3dCameraCommand}
                        onStatus={handleReal3dStatus}
                        onFallback={handleReal3dFallback}
                      />
                    ) : (
                    <div className="absolute inset-8" style={{ perspective: '900px' }}>
                      <div className="absolute inset-x-8 bottom-16 h-80 rotate-x-[58deg] border border-cyan-300/25 bg-cyan-300/5" style={{ transform: `rotateX(58deg) rotateZ(${threeD.orbit}deg) scale(${threeD.zoom})` }}>
                        {threeD.roads && <><div className="absolute left-0 top-[66%] h-4 w-full bg-zinc-400/35" /><div className="absolute left-[72%] top-0 h-full w-4 bg-zinc-400/25" /></>}
                        {threeD.buildings && [10, 22, 65, 78].map((left, index) => <div key={left} className="absolute top-[18%] h-[20%] w-[12%] border border-white/10 bg-white/10" style={{ left: `${left}%`, boxShadow: `0 -${22 + index * 10}px 0 rgba(255,255,255,.08)` }} />)}
                        {showSiteBoundary && <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points={boundaryPath} fill="rgba(34,211,238,.22)" stroke="#67e8f9" strokeWidth="0.7" /></svg>}
                        {massing.enabled && <div className="absolute border border-cyan-100 bg-cyan-300/25" style={{ left: `${Math.max(8, Math.min(82, massing.x - massing.width / 2))}%`, top: `${Math.max(8, Math.min(78, massing.y - massing.length / 2))}%`, width: `${Math.max(10, Math.min(50, massing.width))}%`, height: `${Math.max(10, Math.min(50, massing.length))}%`, transform: `rotate(${massing.rotation}deg)`, boxShadow: `0 -${Math.max(18, Math.min(100, massing.height * 4))}px 0 rgba(34,211,238,.20)` }} />}
                        {threeD.sunShadow && <div className="absolute left-[50%] top-[48%] h-[20%] bg-black/40" style={{ width: `${shadowLength}%`, transform: `rotate(${shadowAngle}deg)`, transformOrigin: 'left center' }} />}
                      </div>
                      <span className="absolute right-6 top-6 h-20 border-l-2 border-yellow-300" style={{ transform: `rotate(${climate.orientation}deg)` }} />
                      <div className="absolute left-4 top-4 max-w-sm rounded-xl border border-cyan-300/20 bg-black/65 p-3 text-xs leading-5 text-cyan-100">{siteViewMode === 'REAL_3D' ? 'Real Google 3D is not connected. Showing Concept 3D instead.' : 'Conceptual 3D preview based on the site boundary you drew in Leaflet.'}</div>
                    </div>
                    )
                  ) : (
                    <>
                      {layers.roads && <><div className="absolute left-[8%] top-[70%] h-4 w-[84%] rounded bg-zinc-500/40" /><div className="absolute left-[70%] top-[12%] h-[82%] w-3 rounded bg-zinc-500/30" /></>}
                      {layers.green && <div className="absolute left-[9%] top-[14%] h-[18%] w-[18%] rounded-full border border-emerald-300/30 bg-emerald-300/10" />}
                      {layers.schools && <div className="absolute right-[11%] top-[16%] rounded border border-blue-300/30 bg-blue-300/10 px-2 py-1 text-[10px] text-blue-100">School</div>}
                      {layers.retail && <div className="absolute bottom-[17%] left-[18%] rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[10px] text-amber-100">Retail</div>}
                    </>
                  )}
                </div>
              )}

              <div className="absolute left-4 top-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-black/65 p-1.5 shadow-2xl backdrop-blur">
                <div className="relative" ref={searchDropdownRef}>
                  <input ref={searchInputRef} className="h-9 w-[min(62vw,340px)] rounded-lg border border-white/10 bg-[#0b0f14]/90 px-3 pr-9 text-xs text-white outline-none placeholder:text-zinc-500 focus:border-cyan-300/50" value={site.address} onFocus={() => { setSiteMoreToolsOpen(false); if (searchResults.length > 0 || searchError) setShowSearchDropdown(true); }} onChange={(event) => setSite({ ...site, address: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') searchAddress(); }} placeholder="Search place or address..." />
                  {searchLoading && <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] text-cyan-200">...</span>}
                  {site.address && <button type="button" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-white" onClick={clearSearch}>X</button>}
                  {recentSearches.length > 0 && !showSearchDropdown && !searchResults.length && !searchError && <button type="button" className="absolute left-0 top-full z-30 mt-1 rounded-md border border-white/10 bg-black/70 px-2 py-1 text-[10px] text-cyan-100 backdrop-blur hover:border-cyan-300/35" onClick={() => { setShowRecentSearches(true); setShowSearchDropdown(true); }}>Show recent</button>}
                  {showSearchDropdown && (searchResults.length > 0 || searchError || (showRecentSearches && recentSearches.length > 0)) && <div className="absolute left-0 top-full z-40 mt-2 max-h-[220px] w-[min(82vw,360px)] overflow-auto rounded-xl border border-cyan-300/20 bg-[#090d12] p-1.5 shadow-2xl">
                    <div className="mb-1 flex items-center justify-between gap-2 px-1">
                      <button type="button" className="text-[10px] uppercase tracking-[0.12em] text-cyan-200 hover:text-white" onClick={() => setShowRecentSearches((value) => !value)}>{showRecentSearches ? 'Hide recent' : 'Show recent'}</button>
                      <button type="button" className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-white" onClick={() => { setShowSearchDropdown(false); setShowRecentSearches(false); }}>Close</button>
                    </div>
                    {searchError && <p className="rounded border border-amber-300/20 bg-amber-300/10 p-2 text-xs text-amber-100">{searchError}</p>}
                    {searchResults.map((result) => <button key={result.id} type="button" className="mt-1 w-full rounded-lg border border-white/10 bg-[#111827] px-2 py-1.5 text-left hover:border-cyan-300/40" onClick={() => selectSearchResult(result)}><span className="block text-xs font-semibold text-white">{result.name}</span><span className="mt-0.5 block truncate text-[11px] text-zinc-400">{result.address}</span><span className="mt-0.5 block text-[10px] uppercase tracking-[0.12em] text-cyan-200">{result.type} · OpenStreetMap{result.distanceMeters !== undefined ? ` · ${(result.distanceMeters / 1000).toFixed(1)} km from map center` : ''}</span></button>)}
                    {showRecentSearches && recentSearches.length > 0 && <><p className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Recent</p>{recentSearches.map((result) => <button key={result.id} type="button" className="mt-1 w-full rounded-lg border border-white/10 bg-[#111827] px-2 py-1.5 text-left hover:border-cyan-300/40" onClick={() => selectSearchResult(result)}><span className="block text-xs font-semibold text-white">{result.name}</span><span className="mt-0.5 block truncate text-[11px] text-zinc-400">{result.address}</span></button>)}</>}
                  </div>}
                </div>
                <button className="h-9 rounded-lg border border-cyan-300/35 bg-cyan-300/15 px-3 text-xs font-semibold text-cyan-50 hover:bg-cyan-300/25" onClick={searchAddress}>{searchLoading ? '...' : 'Search'}</button>
                <button className={`h-9 rounded-lg border px-3 text-xs font-semibold ${isDrawingBoundary ? 'border-cyan-300/50 bg-cyan-300/20 text-cyan-50' : 'border-white/10 bg-[#111827]/90 text-zinc-200 hover:border-cyan-300/35'}`} onClick={startBoundaryDrawing}>Draw</button>
                <button className="h-9 rounded-lg border border-white/10 bg-[#111827]/90 px-3 text-xs font-semibold text-zinc-200 hover:border-cyan-300/35" onClick={clearBoundary}>Clear</button>
                <button className="h-9 rounded-lg border border-white/10 bg-[#111827]/90 px-3 text-xs font-semibold text-zinc-200 hover:border-cyan-300/35" onClick={() => { if (!hasSiteBoundary) { showNotice('Draw a site boundary first.'); return; } if (mapMode === 'google') fitBoundaryToGoogleMap(); else setMapFitRequest((value) => value + 1); showNotice('Fit to site requested.'); }}>Fit</button>
                <div className="relative">
                  <button className="h-9 rounded-lg border border-white/10 bg-[#111827]/90 px-3 text-xs font-semibold text-zinc-200 hover:border-cyan-300/35" onClick={() => { setShowSearchDropdown(false); setShowRecentSearches(false); setSiteMoreToolsOpen((value) => !value); }}>More</button>
                  {siteMoreToolsOpen && <div className="absolute right-0 top-full z-40 mt-2 grid w-52 gap-1.5 rounded-xl border border-white/10 bg-[#0b0f14]/95 p-2 shadow-2xl backdrop-blur">
                    <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" onClick={useMapCenter}>Use Center</button>
                    <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" onClick={useMapCenter}>Drop Pin Here</button>
                    <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" onClick={() => { const input = window.prompt('Enter coordinates as latitude, longitude', `${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}`); if (!input) return; const [lat, lng] = input.split(',').map((value) => Number(value.trim())); if (!Number.isFinite(lat) || !Number.isFinite(lng)) { showNotice('Invalid coordinates. Use latitude, longitude.'); return; } setSite((current) => ({ ...current, latitude: lat, longitude: lng, address: current.address || 'Manual coordinates' })); setLocationSelected(true); setMapCenter({ lat, lng }); showNotice('Manual coordinates selected.'); }}>Enter Coordinates</button>
                    <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" onClick={() => { if (!hasSiteBoundary) { showNotice('Draw a site boundary first.'); return; } setActiveTool('edit'); setSiteMoreToolsOpen(false); showNotice('Drag the corner dots to adjust the boundary.'); }}>Edit Boundary</button>
                    <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" onClick={() => { if (!hasSiteBoundary) { showNotice(locationSelected ? 'Draw a boundary first for accurate site area and perimeter.' : 'Select or draw a site first.'); return; } setActiveAnalysis('macro'); setSiteWorkspace('quantitative'); showNotice('Full boundary analysis active.'); }}>Analyze Site</button>
                    <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" onClick={saveSiteStudy}>Save Project</button>
                    <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" onClick={() => { setSiteViewMode('CONCEPT_3D'); setSiteWorkspace('concept'); showNotice('Concept 3D helps you test massing after selecting a site.'); }}>Concept 3D</button>
                    <button className={`rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35 ${!real3dEnabled ? 'opacity-50' : ''}`} onClick={() => {
                      if (!hasSiteBoundary) {
                        showNotice('Draw a site boundary first.');
                        return;
                      }
                      if (!real3dEnabled) {
                        setSiteViewMode('CONCEPT_3D');
                        showNotice('Real Google 3D requires developer configuration. Showing Concept 3D.');
                        return;
                      }
                      setSiteViewMode('REAL_3D');
                      setSiteWorkspace('concept');
                      setReal3dStatus('Opening Real Google 3D...');
                    }}>Real Google 3D</button>
                    <button disabled={!hasSiteBoundary} className={`rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35 ${!hasSiteBoundary ? 'cursor-not-allowed opacity-45' : ''}`} onClick={() => { if (!hasSiteBoundary) { showNotice('Add Building Mass becomes available after drawing a site boundary.'); return; } setMassing({ ...massing, enabled: true }); setSiteWorkspace('concept'); showNotice('Concept massing added. Adjust the block to test building size.'); }}>Add Building Mass</button>
                    <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" onClick={() => { setThreeD({ ...threeD, orbit: 34, zoom: 1 }); setReal3dCameraCommand(`reset-${Date.now()}` as any); showNotice('Camera reset.'); }}>Reset Camera</button>
                    <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" onClick={() => { setThreeD({ ...threeD, orbit: 0, zoom: 1.05 }); setReal3dCameraCommand(`top-${Date.now()}` as any); showNotice('Top view requested.'); }}>Top View</button>
                    <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" onClick={() => { setThreeD({ ...threeD, orbit: 34, zoom: 1 }); setReal3dCameraCommand(`oblique-${Date.now()}` as any); showNotice('Oblique view requested.'); }}>Oblique View</button>
                    <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" onClick={() => setShowSiteBoundary((value) => !value)}>{showSiteBoundary ? 'Hide Boundary' : 'Show Boundary'}</button>
                    <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" onClick={() => setMassing({ ...massing, enabled: !massing.enabled })}>{massing.enabled ? 'Hide Massing' : 'Show Massing'}</button>
                    <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" onClick={() => setThreeD({ ...threeD, sunShadow: !threeD.sunShadow })}>{threeD.sunShadow ? 'Hide Sun/Shadows' : 'Show Sun/Shadows'}</button>
                    <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-cyan-300/35" onClick={() => { if (siteViewMode === 'REAL_3D') setReal3dCameraCommand(`snapshot-${Date.now()}` as any); else exportAnalysisDiagram('Site_3D_Snapshot'); }}>Download Snapshot</button>
                  </div>}
                </div>
              </div>

              {isDrawingBoundary && <div className="absolute left-4 top-[62px] z-10 flex flex-wrap gap-1.5 rounded-xl border border-cyan-300/20 bg-black/65 p-1.5 backdrop-blur">
                <button className="rounded-lg border border-cyan-300/35 bg-cyan-300/15 px-3 py-1.5 text-xs font-semibold text-cyan-50 hover:bg-cyan-300/25" onClick={finishBoundary}>Finish</button>
                <button className="rounded-lg border border-white/10 bg-[#111827]/90 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-cyan-300/35" onClick={undoBoundaryPoint}>Undo Point</button>
                <button className="rounded-lg border border-white/10 bg-[#111827]/90 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-cyan-300/35" onClick={cancelBoundaryDrawing}>Cancel</button>
              </div>}

              {activeTool === 'edit' && hasSiteBoundary && <div className="absolute left-4 top-[62px] z-10 flex flex-wrap gap-1.5 rounded-xl border border-cyan-300/20 bg-black/65 p-1.5 backdrop-blur">
                <button className="rounded-lg border border-white/10 bg-[#111827]/90 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-cyan-300/35" onClick={removeSelectedVertex}>Remove Corner</button>
                <button className="rounded-lg border border-cyan-300/35 bg-cyan-300/15 px-3 py-1.5 text-xs font-semibold text-cyan-50 hover:bg-cyan-300/25" onClick={finishEditingBoundary}>Finish Editing</button>
              </div>}

              <div className="absolute bottom-4 left-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-lg border border-cyan-300/25 bg-black/65 px-2.5 py-1.5 text-cyan-100 backdrop-blur">Status: {mapStatus}</span>
                <span className="rounded-lg border border-white/10 bg-black/55 px-2.5 py-1.5 text-zinc-200 backdrop-blur">{hasSiteBoundary ? `${isDrawingBoundary ? 'Draft ' : ''}${site.area.toLocaleString()} sqm | ${(site.area / 10000).toFixed(3)} ha | ${site.perimeter}m` : boundary.length >= 2 ? `Draft perimeter: ${perimeter}m · need 3 points for area` : locationSelected ? `Selected: ${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}` : 'No site selected'}</span>
                {isDrawingBoundary && <span className="rounded-lg border border-amber-300/25 bg-black/55 px-2.5 py-1.5 text-amber-100 backdrop-blur">Click points around the lot. Finish when done.</span>}
                {boundaryWarnings.map((warning) => <span key={warning} className="rounded-lg border border-amber-300/25 bg-black/55 px-2.5 py-1.5 text-amber-100 backdrop-blur">{warning}</span>)}
              </div>

              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {hasSiteBoundary && activeAnalysis === 'macro' && analysisToggles.macroRadius && [18, 30, 44, 58].map((radius) => <circle key={radius} cx="50" cy="46" r={radius} fill="none" stroke="#22d3ee" strokeWidth="0.28" strokeDasharray="2 2" opacity="0.45" />)}
                {hasSiteBoundary && activeAnalysis === 'solidVoid' && analysisToggles.buildingMass && [[14, 16, 13, 16], [70, 14, 15, 18], [76, 56, 13, 20], [17, 57, 12, 15], [8, 38, 12, 10], [61, 70, 20, 9]].map(([x, y, w, h], index) => <rect key={index} x={x} y={y} width={w} height={h} fill="rgba(0,0,0,.70)" stroke="#111827" strokeWidth="0.3" />)}
                {hasSiteBoundary && activeAnalysis === 'access' && <><path d="M8 73 C24 66, 35 58, 50 46 S78 26, 92 14" fill="none" stroke="#34d399" strokeWidth="0.8" strokeDasharray="2 1" /><path d="M8 72 L91 72" fill="none" stroke="#fb923c" strokeWidth="1.1" /><path d="M25 84 L66 27" fill="none" stroke="#fde047" strokeWidth="0.7" strokeDasharray="1 1.6" /></>}
                {hasSiteBoundary && activeAnalysis === 'environmental' && <><path d="M16 70 C34 15, 66 15, 84 70" fill="none" stroke="#fde047" strokeWidth="0.8" strokeDasharray="2 1" /><line x1="15" y1="18" x2="78" y2="82" stroke="#67e8f9" strokeWidth="0.8" /><path d="M78 52 C86 57, 90 63, 93 72" fill="none" stroke="#f87171" strokeWidth="1" strokeDasharray="2 1" /></>}
                {showSiteBoundary && hasSiteBoundary && <polygon points={boundaryPath} fill="rgba(34,211,238,.16)" stroke="#67e8f9" strokeWidth="0.72" />}
                {massing.enabled && <g transform={`rotate(${massing.rotation} ${massing.x} ${massing.y})`}><rect x={massing.x - Math.max(5, massing.width / 2)} y={massing.y - Math.max(5, massing.length / 2)} width={Math.max(10, massing.width)} height={Math.max(10, massing.length)} fill="rgba(253,224,71,.24)" stroke="#fde047" strokeWidth="0.55" /><text x={massing.x} y={massing.y} textAnchor="middle" fontSize="2.4" fill="#fef9c3">mass</text></g>}
              </svg>

              {!hasSiteBoundary && !helperDismissed && !isDrawingBoundary && <div className="absolute bottom-14 left-4 z-10 max-w-xs rounded-xl border border-amber-300/20 bg-black/60 p-2.5 text-xs text-amber-100 shadow-2xl backdrop-blur"><button className="absolute right-2 top-1 text-[10px] text-amber-100/70 hover:text-white" onClick={() => setHelperDismissed(true)}>X</button><p className="pr-5 font-semibold">Search, then Draw.</p><p className="mt-1 leading-4">Trace your lot with map clicks.</p></div>}
            </div>
          </div>

          <div className="hidden">
          {siteWorkspace === 'quantitative' && (
            <div className="rounded-2xl border border-white/10 bg-[#0f141b] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="text-base font-semibold text-white">Quantitative Analysis</h3><p className="mt-1 text-xs text-zinc-400">Estimated / placeholder until API data source is connected.</p></div>
                <button className={buttonClass()} onClick={() => setDeepConfigOpen((value) => !value)}>Deep Analysis Configuration</button>
              </div>
              {deepConfigOpen && <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4"><h4 className="text-sm font-semibold text-cyan-50">Deep Analysis Configuration</h4><div className="mt-3 grid gap-3 md:grid-cols-3"><div><p className="text-xs font-semibold text-white">Roles</p><p className="mt-1 text-xs text-cyan-50/80">Architect, Urban Planner, Environmental Consultant, Real Estate Developer, Property Investor</p></div><div><p className="text-xs font-semibold text-white">Tier 1: Critical / Verified</p><p className="mt-1 text-xs text-cyan-50/80">FAR, prices, rent, walkability, transport, amenities, flood/noise risk, site area</p></div><div><p className="text-xs font-semibold text-white">Tier 2/3</p><p className="mt-1 text-xs text-cyan-50/80">Height, setbacks, density, climate, demographics, land-use mix</p></div></div><button className={`${buttonClass()} mt-3`}>Start Deep Analysis</button></div>}
              <div className="mt-4 grid gap-3 md:grid-cols-4">{quantitativeCards.map(([name, value, status, note]) => <div key={name} className="rounded-xl border border-white/10 bg-[#111827] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{name}</p><p className="mt-2 text-lg font-semibold text-white">{value}</p><span className={`mt-2 inline-block rounded px-2 py-1 text-[10px] ${status === 'High Risk' ? 'bg-red-300/15 text-red-100' : status === 'Good' || status === 'Excellent' ? 'bg-emerald-300/15 text-emerald-100' : status === 'Placeholder' ? 'bg-zinc-300/10 text-zinc-300' : 'bg-amber-300/15 text-amber-100'}`}>{status}</span><p className="mt-2 text-[11px] leading-4 text-zinc-500">{note}</p></div>)}</div>
            </div>
          )}

          {siteWorkspace === 'context' && (
            <div className="rounded-2xl border border-white/10 bg-[#0f141b] p-4">
              <div className="flex flex-wrap gap-2">{['Building Analysis', 'Land Use', 'Road Network', 'Compare Maps'].map((tab) => <button key={tab} className={contextMapTab === tab ? buttonClass() : buttonClass('secondary')} onClick={() => setContextMapTab(tab as typeof contextMapTab)}>{tab}</button>)}</div>
              <div className="mt-3 flex flex-wrap gap-2">{(contextMapTab === 'Building Analysis' ? ['Type', 'Height', 'Footprint', 'Age'] : contextMapTab === 'Land Use' ? ['Land Use', 'Population'] : ['Road hierarchy', 'Access points', 'Pedestrian movement', 'Vehicle movement', 'Transit']).map((tab) => <button key={tab} className={contextSubtab === tab ? buttonClass() : buttonClass('secondary')} onClick={() => setContextSubtab(tab)}>{tab}</button>)}</div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]"><div className="min-h-80 rounded-xl border border-cyan-300/20 bg-[#080a0d] p-4"><p className="text-sm font-semibold text-white">{contextMapTab} · {contextSubtab}</p><p className="mt-2 text-xs text-zinc-400">Sample/contextual estimate layer. Real footprint, land-use, population, and road data can be connected later.</p><div className="mt-6 grid grid-cols-5 gap-2">{['<10m', '10-20m', '20-30m', '30-50m', '>50m'].map((legend, index) => <div key={legend} className="h-24 rounded border border-white/10" style={{ backgroundColor: ['#0f766e', '#0891b2', '#4f46e5', '#9333ea', '#f97316'][index] }}><span className="m-2 inline-block rounded bg-black/40 px-1 text-[10px]">{legend}</span></div>)}</div></div><div className="rounded-xl border border-white/10 bg-[#111827] p-3"><p className="text-sm font-semibold text-white">Customize</p>{['Color style', 'Opacity', 'Show legend', 'Show labels', 'Compare mode'].map((item) => <label key={item} className="mt-3 flex items-center justify-between text-xs text-zinc-300"><span>{item}</span><input type="checkbox" defaultChecked /></label>)}<div className="mt-4 grid gap-2"><button className={buttonClass('secondary')} onClick={() => exportAnalysisDiagram(`${contextMapTab}_${contextSubtab}`)}>Download PNG</button><button className={buttonClass('secondary')} onClick={() => downloadText('context_layer_data.csv', 'layer,value,status\nsample,estimated,placeholder')}>Download CSV</button><button className={buttonClass('secondary')} onClick={() => downloadSimplePdf('Context_Map_Report.pdf', 'Context Map Report', reportLines)}>Download Map Report</button></div></div></div>
            </div>
          )}

          {siteWorkspace === 'concept' && (
            <div className="rounded-2xl border border-white/10 bg-[#0f141b] p-4">
              <div className="flex flex-wrap gap-2"><button className={siteViewMode === '2D' ? buttonClass() : buttonClass('secondary')} onClick={() => setSiteViewMode('2D')}>2D Map</button><button className={siteViewMode === 'CONCEPT_3D' ? buttonClass() : buttonClass('secondary')} onClick={() => setSiteViewMode('CONCEPT_3D')}>Concept 3D</button><button className={siteViewMode === 'REAL_3D' ? buttonClass() : buttonClass('secondary')} onClick={() => { if (!real3dEnabled) { setSiteViewMode('CONCEPT_3D'); showNotice('Real Google 3D is not connected. Showing Concept 3D.'); return; } setSiteViewMode('REAL_3D'); }}>Real Google 3D</button><button className={buttonClass('secondary')}>Import OBJ</button><button className={buttonClass('secondary')}>Record</button><button className={buttonClass('secondary')} onClick={() => setReal3dCameraCommand(`top-${Date.now()}`)}>Top View</button><button className={buttonClass('secondary')} onClick={() => downloadText('ArchiVault_Concept_Model.obj.txt', 'OBJ placeholder export for conceptual massing.')}>Download 3D</button><button className={buttonClass()} onClick={saveSiteStudy}>Save Plan</button></div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr]"><div className="rounded-xl border border-white/10 bg-[#111827] p-3"><p className="text-sm font-semibold text-white">Toolbox / Properties</p>{['Draw Polygon', 'Draw Circle', 'Draw Path', 'Draw Perpendicular Path', 'Add Building Mass', 'Add Landscape Zone', 'Add Entry Point', 'Add Road/Access', 'Add Tree/Vegetation', 'Add Label'].map((tool) => <button key={tool} className="mt-2 w-full rounded border border-white/10 bg-black/20 px-2 py-2 text-left text-xs text-zinc-300 hover:border-cyan-300/30">{tool}</button>)}<div className="mt-4 grid gap-3"><Field label="Floors"><input className={inputClass()} type="number" value={massing.floors} onChange={(event) => setMassing({ ...massing, floors: Number(event.target.value) || 1 })} /></Field><Field label="Height"><input className={inputClass()} type="number" value={massing.height} onChange={(event) => setMassing({ ...massing, height: Number(event.target.value) || 0 })} /></Field><Field label="Rotation"><input className={inputClass()} type="range" min="-45" max="45" value={massing.rotation} onChange={(event) => setMassing({ ...massing, rotation: Number(event.target.value) })} /></Field></div></div><div className="rounded-xl border border-cyan-300/20 bg-[#080a0d] p-4"><div className="grid gap-3 md:grid-cols-4">{[['GFA', `${massingCalc.gfa.toFixed(0)} sqm`], ['Footprint', `${massingCalc.footprint.toFixed(0)} sqm`], ['FAR', massingCalc.far.toFixed(2)], ['Open space', `${massingCalc.openSpace.toFixed(0)} sqm`]].map(([k, v]) => <div key={k} className="rounded border border-white/10 bg-[#111827] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{k}</p><p className="mt-1 text-sm font-semibold text-white">{v}</p></div>)}</div><p className="mt-4 text-xs leading-5 text-zinc-400">Use Concept Planner to test building size. Warnings appear when FAR, open space, or height assumptions are exceeded.</p>{massingCalc.warnings.map((warning) => <p key={warning} className="mt-2 rounded border border-amber-300/25 bg-amber-300/10 p-2 text-xs text-amber-100">{warning}</p>)}</div></div>
            </div>
          )}

          {siteWorkspace === 'reports' && (
            <div className="rounded-2xl border border-white/10 bg-[#0f141b] p-4">
              <h3 className="text-base font-semibold text-white">Live Site Analysis Report</h3>
              <p className="mt-1 text-xs text-zinc-400">Updates when address, boundary, layer, climate, or concept massing changes.</p>
              <pre className="mt-4 max-h-80 overflow-auto rounded-xl border border-white/10 bg-[#080a0d] p-4 font-mono text-xs leading-6 text-emerald-100">{reportLines.join('\n')}</pre>
              <div className="mt-4 flex flex-wrap gap-2"><button className={buttonClass()} onClick={() => downloadSimplePdf('ArchiVault_Site_Analysis_Report.pdf', 'ArchiVault Site Analysis Report', reportLines)}>Export PDF Report</button><button className={buttonClass('secondary')} onClick={() => exportAnalysisDiagram('Site_Analysis_Map')}>Export Map PNG</button><button className={buttonClass('secondary')} onClick={() => downloadText('ArchiVault_Site_Data.csv', reportLines.map((line) => `"${line.replace(/"/g, '""')}"`).join('\n'))}>Export CSV Data</button><button className={buttonClass('secondary')} onClick={copyReport}>Copy Summary</button><button className={buttonClass('secondary')} onClick={saveSiteStudy}>Save Site Study</button></div>
            </div>
          )}

          {siteWorkspace === 'saved' && (
            <div className="rounded-2xl border border-white/10 bg-[#0f141b] p-4">
              <h3 className="text-base font-semibold text-white">Saved Studies</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">{(savedStudies.length ? savedStudies : ['No saved study yet']).map((study) => <div key={study} className="rounded-xl border border-white/10 bg-[#111827] p-3"><p className="text-sm font-semibold text-white">{study}</p><p className="mt-1 text-xs text-zinc-500">Saved in this browser session / local storage.</p><button className={`${buttonClass('secondary')} mt-3`}>Open Study</button></div>)}</div>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-[#0f141b] p-4">
            <h3 className="text-base font-semibold text-white">Strategic Generative Recommendations</h3>
            <div className="mt-4 grid gap-4 lg:grid-cols-3"><div className="min-h-28 rounded-xl border border-white/10 bg-[#080a0d] p-3 text-xs text-zinc-400">Urban Context image/map snapshot</div><div className="min-h-28 rounded-xl border border-white/10 bg-[#080a0d] p-3 text-xs text-zinc-400">Site Detail image/map snapshot</div><div className="min-h-28 rounded-xl border border-white/10 bg-[#080a0d] p-3 text-xs text-zinc-400">Street View placeholder</div></div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">{recommendations.slice(0, 8).map(([group, text]) => <div key={group} className="rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-3"><p className="text-xs font-semibold text-cyan-100">{group}</p><p className="mt-1 text-xs leading-5 text-zinc-300">{text}</p></div>)}</div>
          </div>
          </div>
        </main>

        {showInsightsPanel && <aside className="hidden min-h-0 overflow-y-auto border-l border-white/10 bg-[#0b0f14] p-2 lg:block">
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-[#111827] p-3">
              <button className="flex w-full items-center justify-between text-left" onClick={() => setInsightsOpen({ ...insightsOpen, quantitative: !insightsOpen.quantitative })}><span className="text-sm font-semibold text-white">Quantitative Insights</span><span className="text-xs text-cyan-200">{insightsOpen.quantitative ? 'Hide' : 'Show'}</span></button>
              {insightsOpen.quantitative && (!hasSiteBoundary ? <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100"><p className="font-semibold">{isDrawingBoundary ? 'Draft boundary in progress.' : 'No site selected yet.'}</p><p className="mt-1">{boundary.length >= 2 ? `Draft perimeter: ${perimeter}m. Add at least 3 points to estimate area.` : 'Draw a boundary to calculate site area, perimeter, FAR, GFA, and open space.'}</p></div> : <div className="mt-3 grid gap-2">{[['Site area', `${site.area.toLocaleString()} sqm`], ['Perimeter', `${site.perimeter}m`], ['Coordinates', `${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}`], ['GFA', massing.enabled ? `${massingCalc.gfa.toFixed(0)} sqm` : 'No massing yet'], ['FAR', massing.enabled ? `${massingCalc.far.toFixed(2)} / ${site.far.toFixed(2)}` : 'No massing yet'], ['Walkability', `${Math.max(35, Math.min(92, 45 + openMapData.roads * 3 + openMapData.transit * 4 + openMapData.amenities))}/100`], ['Amenities', `${openMapData.amenities} mapped`], ['Open data', openMapData.status]].map(([k, v]) => <div key={k} className="flex items-center justify-between gap-3 rounded border border-white/10 bg-black/20 px-3 py-2 text-xs"><span className="text-zinc-500">{k}</span><span className="text-right font-semibold text-white">{v}</span></div>)}</div>)}
            </div>
            <div className="rounded-xl border border-white/10 bg-[#111827] p-3">
              <button className="flex w-full items-center justify-between text-left" onClick={() => setInsightsOpen({ ...insightsOpen, climate: !insightsOpen.climate })}><span className="text-sm font-semibold text-white">Climatic Conditions</span><span className="text-xs text-cyan-200">{insightsOpen.climate ? 'Hide' : 'Show'}</span></button>
              {insightsOpen.climate && <div className="mt-3"><p className="rounded border border-amber-300/20 bg-amber-300/10 p-2 text-xs text-amber-100">Sample climate profile. Connect weather API for live data.</p><div className="mt-3 h-24 rounded border border-white/10 bg-black/20 p-2">{climateProfile.map(([month, temp, rain]) => <span key={month} className="mr-1 inline-block w-[6%] align-bottom" title={`${month}: ${temp}C, ${rain}mm`}><span className="block bg-cyan-300/70" style={{ height: `${Math.max(10, rain / 3)}px` }} /></span>)}</div><div className="mt-3 grid grid-cols-4 gap-1">{climateProfile.map(([month, , , wind]) => <div key={month} className="rounded border border-white/10 bg-black/20 p-1 text-center text-[10px]"><p className="text-zinc-500">{month}</p><p className="text-cyan-100">{wind}</p></div>)}</div></div>}
            </div>
            <div className="rounded-xl border border-white/10 bg-[#111827] p-3">
              <button className="flex w-full items-center justify-between text-left" onClick={() => setInsightsOpen({ ...insightsOpen, amenities: !insightsOpen.amenities })}><span className="text-sm font-semibold text-white">Proximity + Amenities</span><span className="text-xs text-cyan-200">{insightsOpen.amenities ? 'Hide' : 'Show'}</span></button>
              {insightsOpen.amenities && <div className="mt-3 grid gap-2">{['Schools: 2', 'Parks: 1', 'Transit: 450m', 'Retail/Food: 5+', 'Hospitals: 1km+', 'Community: sample'].map((item) => <p key={item} className="rounded border border-white/10 bg-black/20 p-2 text-xs text-zinc-300">{item}</p>)}</div>}
            </div>
            <div className="rounded-xl border border-white/10 bg-[#111827] p-3">
              <button className="flex w-full items-center justify-between text-left" onClick={() => setInsightsOpen({ ...insightsOpen, recommendations: !insightsOpen.recommendations })}><span className="text-sm font-semibold text-white">Opportunities + Constraints</span><span className="text-xs text-cyan-200">{insightsOpen.recommendations ? 'Hide' : 'Show'}</span></button>
              {insightsOpen.recommendations && <div className="mt-3 space-y-2"><div className="rounded border border-emerald-300/20 bg-emerald-300/10 p-2 text-xs leading-5 text-emerald-50">{opportunities.join(' ')}</div><div className="rounded border border-amber-300/20 bg-amber-300/10 p-2 text-xs leading-5 text-amber-50">{constraints.join(' ')}</div></div>}
            </div>
          </div>
        </aside>}
        {!showInsightsPanel && <button className="absolute right-0 top-1/2 z-20 hidden -translate-y-1/2 rounded-l-xl border border-cyan-300/25 bg-[#0b0f14]/95 px-2 py-5 text-xs font-semibold text-cyan-100 shadow-2xl [writing-mode:vertical-rl] hover:bg-cyan-300/10 lg:block" onClick={() => setShowInsightsPanel(true)}>Insights</button>}
      </div>
      <div className="shrink-0 border-t border-white/10 bg-[#0b0f14] p-2">
        <button className="flex h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-[#111827] px-3 text-left" onClick={() => setReportDrawerOpen((value) => !value)}>
          <span><span className="block text-sm font-semibold text-white">Live Report + Strategic Recommendations</span><span className="hidden text-xs text-zinc-500 sm:block">{recommendations.length} recommendations · {boundaryWarnings.length + massingCalc.warnings.length} warnings · {hasSiteBoundary ? 'Report ready' : 'Draw boundary to start'}</span></span>
          <span className="text-xs text-cyan-200">{reportDrawerOpen ? 'Collapse' : 'Open'}</span>
        </button>
        {reportDrawerOpen && <div className="mt-2 grid max-h-[34vh] gap-3 overflow-y-auto xl:grid-cols-[1fr_1fr_260px]">
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3"><p className="text-sm font-semibold text-emerald-50">Opportunities</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-emerald-50/85">{opportunities.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3"><p className="text-sm font-semibold text-amber-50">Constraints + Warnings</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-amber-50/85">{[...constraints, ...boundaryWarnings, ...massingCalc.warnings].map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3"><p className="text-sm font-semibold text-cyan-50">Report Actions</p><div className="mt-3 grid gap-2"><button className={buttonClass()} onClick={() => downloadSimplePdf('ArchiVault_Site_Analysis_Report.pdf', 'ArchiVault Site Analysis Report', reportLines)}>Export PDF</button><button className={buttonClass('secondary')} onClick={copyReport}>Copy Summary</button><button className={buttonClass('secondary')} onClick={saveSiteStudy}>Save Study</button></div></div>
        </div>}
      </div>
    </section>
  );

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Site Analysis</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">Search a location, pin a site, outline a boundary, review context layers, and generate a live architecture site-analysis report. Google Maps is optional; mock mode stays available when no API key is connected.</p>
          </div>
          <span className={`rounded border px-3 py-1 text-xs ${connectionStatus === 'Connected' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/30 bg-amber-300/10 text-amber-100'}`}>{connectionStatus}</span>
        </div>
        {notice && <p className="mt-3 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-2 text-xs text-emerald-50">{notice}</p>}
        <div className="mt-4 grid gap-2 md:grid-cols-6">
          {workflowSteps.map(([number, titleText, helper]) => (
            <div key={number} className="rounded-md border border-white/10 bg-[#11151b] p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-300 text-xs font-bold text-cyan-950">{number}</span>
                <p className="text-xs font-semibold text-white">{titleText}</p>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-zinc-500">{helper}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">Mini guide: Search your site, draw the boundary, adjust massing, review analysis, then export. This is a planning guide; verify official data before final submission.</p>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[0.8fr_1.35fr_0.9fr]">
        <aside className="space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-base font-semibold text-white">Google Maps API Settings</h3>
            <p className="mt-1 text-xs text-zinc-500">The key is saved only in this browser local storage. No key is hard-coded.</p>
            <div className="mt-4 space-y-3">
              <Field label="Google Maps API key"><input className={inputClass()} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste API key when ready" /></Field>
              <div className="flex flex-wrap gap-2">
                <button className={buttonClass('secondary')} onClick={saveApiKey}>Save API Key</button>
                <button className={buttonClass()} onClick={testGoogleConnection}>Test Connection</button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-base font-semibold text-white">Search + Site Controls</h3>
            <div className="mt-4 space-y-3">
              <Field label="Address / place"><input className={inputClass()} value={site.address} onChange={(event) => setSite({ ...site, address: event.target.value })} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Latitude"><input className={inputClass()} type="number" value={site.latitude} onChange={(event) => setSite({ ...site, latitude: Number(event.target.value) || 0 })} /></Field>
                <Field label="Longitude"><input className={inputClass()} type="number" value={site.longitude} onChange={(event) => setSite({ ...site, longitude: Number(event.target.value) || 0 })} /></Field>
              </div>
              <div className="rounded-md border border-cyan-300/15 bg-cyan-300/5 p-3">
                <p className="text-xs font-semibold text-cyan-100">Step 2: Adjust site size</p>
                <p className="mt-1 text-[11px] leading-4 text-zinc-400">Use this when you already know the approximate lot size. It updates the boundary and report instantly.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label="Site width, m"><input className={inputClass()} type="number" value={siteSize.width} onChange={(event) => setSiteSize({ ...siteSize, width: Number(event.target.value) || 0 })} /></Field>
                  <Field label="Site length, m"><input className={inputClass()} type="number" value={siteSize.length} onChange={(event) => setSiteSize({ ...siteSize, length: Number(event.target.value) || 0 })} /></Field>
                  <Field label="Orientation, deg"><input className={inputClass()} type="number" value={siteSize.rotation} onChange={(event) => setSiteSize({ ...siteSize, rotation: Number(event.target.value) || 0 })} /></Field>
                </div>
                <button className={`${buttonClass('secondary')} mt-3 w-full`} onClick={() => applyManualSiteSize()}>Apply Site Size</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button className={buttonClass()} onClick={searchAddress}>Search Address</button>
                <button className={buttonClass('secondary')} onClick={() => { setActiveTool('pin'); showNotice('Drop Pin mode enabled. Click the map or drag the marker.'); }}>Drop Pin</button>
                <button className={buttonClass('secondary')} onClick={() => { setActiveTool('draw'); resetBoundary(); }}>Draw Site Boundary</button>
                <button className={buttonClass('secondary')} onClick={() => { setActiveTool('edit'); showNotice('Edit Boundary mode enabled. Move vertices in the controls or Google polygon.'); }}>Edit Boundary</button>
                <button className={buttonClass('secondary')} onClick={() => { setActiveAnalysis('threeD'); showNotice('3D view opened. Use the right panel to orbit, zoom, and adjust massing.'); }}>View Site in 3D</button>
                <button className={buttonClass('secondary')} onClick={() => { setMassing((current) => ({ ...current, enabled: true })); setActiveAnalysis('threeD'); showNotice('Building mass added. Edit its size in the 3D panel.'); }}>Add Building Mass</button>
                <button className={buttonClass('secondary')} onClick={clearBoundary}>Clear Boundary</button>
                <button className={buttonClass('secondary')} onClick={() => { fitBoundaryToGoogleMap(); showNotice('Fit to site requested.'); }}>Fit to Site</button>
                <button className={buttonClass('secondary')} onClick={saveSiteStudy}>Save Site</button>
                <button className={buttonClass()} onClick={() => showNotice('Site analysis refreshed from current inputs.')}>Analyze Site</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-100/70">Site Area</p>
                  <p className="mt-1 text-lg font-semibold text-white">{site.area.toLocaleString()} sqm</p>
                  <p className="text-xs text-cyan-50/70">{(site.area / 10000).toFixed(3)} hectares</p>
                </div>
                <div className="rounded-md border border-white/10 bg-[#11151b] p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Perimeter</p>
                  <p className="mt-1 text-lg font-semibold text-white">{site.perimeter} m</p>
                  <p className="text-xs text-zinc-500">updates from boundary</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-base font-semibold text-white">Layer Toggles</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {layerItems.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-md border border-white/10 bg-[#11151b] px-3 py-2 text-xs text-zinc-300">
                  <input type="checkbox" checked={layers[key]} onChange={(event) => {
                    setLayers({ ...layers, [key]: event.target.checked });
                    if (key === 'satellite') setMapType(event.target.checked ? 'satellite' : 'roadmap');
                    if (key === 'terrain') setMapType(event.target.checked ? 'terrain' : 'roadmap');
                  }} />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-3 rounded border border-amber-300/20 bg-amber-300/10 p-2 text-xs text-amber-100">Amenity, land-use, noise, and zoning layers are placeholders until Places/context APIs are connected.</p>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-base font-semibold text-white">Analysis Layer Controls</h3>
            <p className="mt-1 text-xs text-zinc-500">Switch from map viewing into architecture diagram layers.</p>
            <div className="mt-4 grid gap-2">
              {analysisLayerItems.map(([id, label, help]) => (
                <button key={id} type="button" className={`rounded-md border px-3 py-2 text-left text-xs transition ${activeAnalysis === id ? 'border-cyan-300/45 bg-cyan-300/15 text-cyan-50' : 'border-white/10 bg-[#11151b] text-zinc-300 hover:border-cyan-300/25'}`} onClick={() => { setActiveAnalysis(id); showNotice(`${label} layer active.`); }}>
                  <span className="block font-semibold">{label}</span>
                  <span className="mt-1 block leading-5 text-zinc-500">{help}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-md border border-white/10 bg-[#11151b] p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Active layer switches</p>
              <div className="mt-3 grid gap-2">
                {analysisToggleGroups[activeAnalysis].map((key) => (
                  <label key={key} className="flex items-center justify-between gap-2 rounded border border-white/10 bg-black/20 px-2 py-2 text-xs text-zinc-300">
                    <span>{String(key).replace(/([A-Z])/g, ' $1')}</span>
                    <input type="checkbox" checked={analysisToggles[key]} onChange={(event) => setAnalysisToggles({ ...analysisToggles, [key]: event.target.checked })} />
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-base font-semibold text-white">Student Templates</h3>
            <Field label="Analysis board template">
              <select className={inputClass()} value={selectedTemplate} onChange={(event) => applySiteTemplate(event.target.value)}>
                {['Urban Site Analysis', 'Residential Site Study', 'School Site Analysis', 'Commercial Site Analysis', 'Thesis Site Analysis', 'Climate Response Study', 'Access and Movement Study', 'Solid and Void Figure-Ground Study'].map((template) => <option key={template}>{template}</option>)}
              </select>
            </Field>
            <div className="mt-3 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-50">
              Template adds relevant layers, report headings, radius logic, and a checklist of what to analyze for the selected board type.
            </div>
          </div>
        </aside>

        <main className="space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">Map + Editable Site Boundary</h3>
                <p className="mt-1 text-xs text-zinc-500">{mapMode === 'google' ? 'Google Maps JavaScript API connected.' : 'Mock map placeholder. Connect Google Maps API key to enable live address search and map selection.'}</p>
              </div>
              <span className="rounded border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">Tool: {activeTool}</span>
            </div>
            <div className="relative mt-4 min-h-[470px] overflow-hidden rounded-md border border-cyan-300/20 bg-[#080a0d]">
              <div ref={mapRef} className={`${mapMode === 'google' ? 'block' : 'hidden'} absolute inset-0`} />
              {mapMode !== 'google' && (
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(34,211,238,.09)_1px,transparent_1px),linear-gradient(rgba(34,211,238,.09)_1px,transparent_1px)] bg-[size:10%_12.5%]">
                  {layers.roads && <><div className="absolute left-[8%] top-[70%] h-4 w-[84%] rounded bg-zinc-500/40" /><div className="absolute left-[70%] top-[12%] h-[82%] w-3 rounded bg-zinc-500/30" /></>}
                  {layers.green && <div className="absolute left-[9%] top-[14%] h-[18%] w-[18%] rounded-full border border-emerald-300/30 bg-emerald-300/10" />}
                  {layers.schools && <div className="absolute right-[11%] top-[16%] rounded border border-blue-300/30 bg-blue-300/10 px-2 py-1 text-[10px] text-blue-100">School</div>}
                  {layers.retail && <div className="absolute bottom-[17%] left-[18%] rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[10px] text-amber-100">Retail</div>}
                  {layers.noise && <div className="absolute bottom-[20%] right-[18%] h-[20%] w-[22%] rounded-full border border-red-300/30 bg-red-300/10 blur-[1px]" />}
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {boundary.length > 0 && <polygon points={boundaryPath} fill="rgba(34,211,238,.16)" stroke="#67e8f9" strokeWidth="0.7" />}
                    <circle cx="50" cy="46" r="1.8" fill="#fef08a" />
                    <line x1="50" y1="46" x2={50 + Math.cos((site.north - 90) * Math.PI / 180) * 18} y2={46 + Math.sin((site.north - 90) * Math.PI / 180) * 18} stroke="#fde047" strokeWidth="0.5" />
                  </svg>
                  {boundary.map((point, index) => (
                    <button
                      key={`${point.x}-${point.y}-${index}`}
                      className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-yellow-200 bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,.65)]"
                      style={{ left: `${point.x}%`, top: `${point.y}%` }}
                      onClick={() => showNotice(`Boundary vertex ${index + 1}. Use edit controls below to adjust it.`)}
                      aria-label={`Boundary point ${index + 1}`}
                    />
                  ))}
                  <span className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-[10px] text-cyan-100">Mock map | click tools still update report and 3D preview</span>
                </div>
              )}
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {activeAnalysis === 'macro' && analysisToggles.macroRadius && <>
                  {[18, 30, 44, 58].map((radius, index) => <circle key={radius} cx="50" cy="46" r={radius} fill="none" stroke={index === 0 ? '#67e8f9' : '#22d3ee'} strokeWidth="0.28" strokeDasharray="2 2" opacity={0.35 + index * 0.09} />)}
                </>}
                {activeAnalysis === 'macro' && analysisToggles.flowArrows && <>
                  <line x1="6" y1="73" x2="44" y2="51" stroke="#22d3ee" strokeWidth="0.8" strokeDasharray="2 1" />
                  <line x1="88" y1="18" x2="61" y2="38" stroke="#22d3ee" strokeWidth="0.8" strokeDasharray="2 1" />
                  <line x1="20" y1="16" x2="42" y2="32" stroke="#fde047" strokeWidth="0.6" />
                </>}
                {activeAnalysis === 'solidVoid' && analysisToggles.buildingMass && <>
                  {[[14, 16, 13, 16], [70, 14, 15, 18], [76, 56, 13, 20], [17, 57, 12, 15], [8, 38, 12, 10], [61, 70, 20, 9]].map(([x, y, w, h], index) => <rect key={index} x={x} y={y} width={w} height={h} fill="rgba(0,0,0,.68)" stroke="#111827" strokeWidth="0.3" />)}
                </>}
                {activeAnalysis === 'solidVoid' && analysisToggles.openSpace && <><ellipse cx="23" cy="24" rx="14" ry="10" fill="rgba(52,211,153,.14)" stroke="#34d399" strokeWidth="0.4" /><ellipse cx="74" cy="76" rx="17" ry="8" fill="rgba(52,211,153,.12)" stroke="#34d399" strokeWidth="0.35" /></>}
                {activeAnalysis === 'solidVoid' && analysisToggles.densityHeat && <circle cx="70" cy="24" r="20" fill="rgba(239,68,68,.12)" stroke="#f97316" strokeWidth="0.3" />}
                {activeAnalysis === 'access' && analysisToggles.pedestrian && <><path d="M8 73 C24 66, 35 58, 50 46 S78 26, 92 14" fill="none" stroke="#34d399" strokeWidth="0.8" strokeDasharray="2 1" /><path d="M18 89 C30 72, 42 62, 54 50" fill="none" stroke="#34d399" strokeWidth="0.65" strokeDasharray="2 1" /></>}
                {activeAnalysis === 'access' && analysisToggles.vehicle && <><path d="M8 72 L91 72" fill="none" stroke="#fb923c" strokeWidth="1.1" /><path d="M72 10 L72 93" fill="none" stroke="#fb923c" strokeWidth="0.85" /></>}
                {activeAnalysis === 'access' && analysisToggles.desireLines && <path d="M25 84 L66 27" fill="none" stroke="#fde047" strokeWidth="0.7" strokeDasharray="1 1.6" />}
                {activeAnalysis === 'access' && analysisToggles.barriers && <path d="M78 55 L92 70" fill="none" stroke="#f87171" strokeWidth="1.2" strokeDasharray="2 1" />}
                {activeAnalysis === 'environmental' && analysisToggles.sunPath && <path d="M16 70 C34 15, 66 15, 84 70" fill="none" stroke="#fde047" strokeWidth="0.8" strokeDasharray="2 1" />}
                {activeAnalysis === 'environmental' && analysisToggles.wind && <><line x1="15" y1="18" x2="78" y2="82" stroke="#67e8f9" strokeWidth="0.8" /><line x1="18" y1="22" x2="81" y2="86" stroke="#67e8f9" strokeWidth="0.45" opacity="0.8" /></>}
                {activeAnalysis === 'environmental' && analysisToggles.vegetation && <><circle cx="22" cy="24" r="4" fill="#34d399" opacity="0.55" /><circle cx="27" cy="29" r="3" fill="#34d399" opacity="0.45" /><circle cx="18" cy="31" r="3.5" fill="#34d399" opacity="0.45" /></>}
                {activeAnalysis === 'environmental' && analysisToggles.noise && <path d="M78 52 C86 57, 90 63, 93 72" fill="none" stroke="#f87171" strokeWidth="1" strokeDasharray="2 1" />}
                {activeAnalysis === 'environmental' && analysisToggles.shadow && <polygon points={`50,46 ${50 + shadowLength / 2},${46 + shadowLength / 5} ${50 + shadowLength / 3},${46 + shadowLength / 2}`} fill="rgba(0,0,0,.35)" />}
                {boundary.length > 0 && <polygon points={boundaryPath} fill="rgba(34,211,238,.16)" stroke="#67e8f9" strokeWidth="0.72" />}
                {massing.enabled && <g transform={`rotate(${massing.rotation} ${massing.x} ${massing.y})`}>
                  <rect x={massing.x - Math.max(5, massing.width / 2)} y={massing.y - Math.max(5, massing.length / 2)} width={Math.max(10, massing.width)} height={Math.max(10, massing.length)} fill="rgba(253,224,71,.24)" stroke="#fde047" strokeWidth="0.55" />
                  <text x={massing.x} y={massing.y} textAnchor="middle" fontSize="2.4" fill="#fef9c3">mass</text>
                </g>}
              </svg>
              <div className="pointer-events-none absolute right-3 top-3 max-w-[260px] rounded-md border border-black/30 bg-black/65 p-3">
                <p className="text-xs font-semibold text-cyan-100">{analysisLayerItems.find(([id]) => id === activeAnalysis)?.[1]}</p>
                <p className="mt-1 text-[10px] leading-4 text-zinc-300">{layerFindings[0]}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-4">
              {boundary.map((point, index) => (
                <div key={index} className="rounded-md border border-white/10 bg-[#11151b] p-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Vertex {index + 1}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input className={inputClass()} type="number" value={Math.round(point.x)} onChange={(event) => moveBoundaryPoint(index, 'x', Number(event.target.value) || 0)} />
                    <input className={inputClass()} type="number" value={Math.round(point.y)} onChange={(event) => moveBoundaryPoint(index, 'y', Number(event.target.value) || 0)} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                ['Active Layer', analysisLayerItems.find(([id]) => id === activeAnalysis)?.[1] ?? activeAnalysis],
                ['Macro Radius', climate.radius],
                ['Built Coverage', `${analysisMetrics.builtCoverage}%`],
                ['Open Space Ratio', `${analysisMetrics.openSpace}%`],
                ['Connectivity', `${analysisMetrics.connectivity}/100`],
                ['Void Opportunity', `${analysisMetrics.voidOpportunity.toFixed(0)}/100`],
              ].map(([label, value]) => <div key={label} className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</p><p className="mt-1 text-sm font-semibold text-white">{value}</p></div>)}
            </div>
            <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3">
              <p className="text-xs font-semibold text-cyan-100">Layer Findings</p>
              <div className="mt-2 grid gap-2">
                {layerFindings.map((finding) => <p key={finding} className="rounded border border-cyan-300/10 bg-black/20 p-2 text-xs leading-5 text-cyan-50">{finding}</p>)}
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-base font-semibold text-white">Road + Mobility Analysis</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Road access side"><select className={inputClass()} value={site.road} onChange={(event) => setSite({ ...site, road: event.target.value })}>{['North', 'East', 'South', 'West', 'Northeast', 'Southeast', 'Southwest', 'Northwest'].map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Context radius"><select className={inputClass()} value={climate.radius} onChange={(event) => setClimate({ ...climate, radius: event.target.value })}>{['250m', '500m', '1km', '2km'].map((item) => <option key={item}>{item}</option>)}</select></Field>
              </div>
              <div className="mt-4 grid gap-2">
                {['Nearest major road: placeholder collector road', `Pedestrian entry: recommended from ${site.road}`, 'Vehicle/service entry: offset from main pedestrian arrival', 'Walkability score placeholder: 72/100', 'Traffic/noise risk: moderate, add landscape buffer'].map((item) => <p key={item} className="rounded border border-white/10 bg-[#11151b] p-2 text-xs text-zinc-300">{item}</p>)}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-base font-semibold text-white">Weather + Sun Path</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Month"><select className={inputClass()} value={climate.month} onChange={(event) => setClimate({ ...climate, month: event.target.value })}>{siteMonths.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Time of day"><select className={inputClass()} value={climate.time} onChange={(event) => setClimate({ ...climate, time: event.target.value })}>{siteTimes.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Building height, m"><input className={inputClass()} type="number" value={climate.buildingHeight} onChange={(event) => setClimate({ ...climate, buildingHeight: Number(event.target.value) || 0 })} /></Field>
                <Field label="Site orientation"><input className={inputClass()} type="number" value={climate.orientation} onChange={(event) => setClimate({ ...climate, orientation: Number(event.target.value) || 0 })} /></Field>
              </div>
              <div className="mt-4 rounded-md border border-cyan-300/20 bg-[#11151b] p-3">
                <div className="relative mx-auto h-44 w-44 rounded-full border border-cyan-300/35 bg-cyan-300/5">
                  <span className="absolute left-1/2 top-2 -translate-x-1/2 text-[10px] font-semibold text-white">N</span>
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-zinc-400">S</span>
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400">W</span>
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400">E</span>
                  <span className="absolute left-1/2 top-1/2 h-[2px] w-20 origin-left bg-yellow-300" style={{ transform: `rotate(${climate.orientation}deg)` }} />
                  <span className="absolute left-1/2 top-1/2 h-[2px] w-16 origin-left bg-cyan-300" style={{ transform: `rotate(${site.wind === 'Northeast' ? 45 : site.wind === 'Southwest' ? 225 : 90}deg)` }} />
                  <span className="absolute left-1/2 top-1/2 h-[2px] w-14 origin-left bg-emerald-300" style={{ transform: `rotate(${site.sun === 'East' ? 0 : site.sun === 'West' ? 180 : 35}deg)` }} />
                </div>
                <p className="mt-3 text-xs leading-5 text-zinc-400">Mock climate: 31°C, 74% humidity, wind from {site.wind}. Avoid large unshaded west-facing glass and use trees/screens as heat buffers.</p>
              </div>
            </div>
          </div>
        </main>

        <aside className="space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-base font-semibold text-white">Site Metrics</h3>
            <div className="mt-4 grid gap-2">
              {[
                ['Coordinates', `${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}`],
                ['Site area', `${site.area.toLocaleString()} sqm`],
                ['Perimeter', `${site.perimeter} m`],
                ['Building footprint', `${massingCalc.footprint.toFixed(0)} sqm`],
                ['Gross floor area', `${massingCalc.gfa.toFixed(0)} sqm`],
                ['Test FAR', `${massingCalc.far.toFixed(2)} / ${site.far.toFixed(2)}`],
                ['Open space', `${massingCalc.openSpace.toFixed(0)} sqm`],
                ['Feasibility score', `${feasibility.score}/100`],
              ].map(([label, value]) => <div key={label} className="flex items-center justify-between rounded border border-white/10 bg-[#11151b] px-3 py-2 text-xs"><span className="text-zinc-500">{label}</span><span className="font-semibold text-white">{value}</span></div>)}
            </div>
            {massingCalc.warnings.length > 0 && <div className="mt-3 space-y-2">
              {massingCalc.warnings.map((warning) => <p key={warning} className="rounded border border-amber-300/25 bg-amber-300/10 p-2 text-xs leading-5 text-amber-100">{warning}</p>)}
            </div>}
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">3D Site / Surroundings Preview</h3>
                <p className="mt-1 text-xs text-zinc-500">Conceptual 3D preview based on selected site. Connect a 3D tiles provider for real city geometry.</p>
              </div>
              <span className="rounded border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-[10px] text-amber-100">Mock 3D</span>
            </div>
            <div className="relative mt-4 h-72 overflow-hidden rounded-md border border-cyan-300/20 bg-[#080a0d]" style={{ perspective: '760px' }}>
              <div className="absolute inset-x-8 bottom-9 h-40 rotate-x-[58deg] border border-cyan-300/25 bg-cyan-300/5 bg-[linear-gradient(90deg,rgba(34,211,238,.12)_1px,transparent_1px),linear-gradient(rgba(34,211,238,.12)_1px,transparent_1px)] bg-[size:14%_20%]" style={{ transform: `rotateX(58deg) rotateZ(${threeD.orbit}deg) scale(${threeD.zoom})` }}>
                {threeD.roads && <><div className="absolute left-0 top-[66%] h-3 w-full bg-zinc-400/35" /><div className="absolute left-[72%] top-0 h-full w-3 bg-zinc-400/25" /></>}
                {threeD.massing && massing.enabled && <div className="absolute border border-cyan-200 bg-cyan-300/20" style={{ left: `${Math.max(8, Math.min(82, massing.x - massing.width / 2))}%`, top: `${Math.max(8, Math.min(78, massing.y - massing.length / 2))}%`, width: `${Math.max(10, Math.min(50, massing.width))}%`, height: `${Math.max(10, Math.min(50, massing.length))}%`, transform: `rotate(${massing.rotation}deg)`, boxShadow: `0 -${Math.max(18, Math.min(88, massing.height * 4))}px 0 rgba(34,211,238,.18)` }} />}
                {threeD.buildings && [12, 22, 62, 78].map((left, index) => <div key={left} className="absolute top-[18%] h-[20%] w-[12%] border border-white/10 bg-white/10" style={{ left: `${left}%`, boxShadow: `0 -${18 + index * 8}px 0 rgba(255,255,255,.08)` }} />)}
                {threeD.sunShadow && <div className="absolute left-[50%] top-[47%] h-[18%] bg-black/35" style={{ width: `${shadowLength}%`, transform: `rotate(${shadowAngle}deg)`, transformOrigin: 'left center' }} />}
              </div>
              <span className="absolute right-4 top-4 h-14 border-l-2 border-yellow-300" style={{ transform: `rotate(${climate.orientation}deg)` }} />
              <span className="absolute bottom-3 left-3 text-[10px] text-cyan-100">Orbit {threeD.orbit} deg | mass height {massing.height}m</span>
            </div>
            <div className="mt-3 grid gap-2">
              <div className="rounded-md border border-cyan-300/15 bg-cyan-300/5 p-3">
                <p className="text-xs font-semibold text-cyan-100">Step 4: Edit concept massing</p>
                <p className="mt-1 text-[11px] leading-4 text-zinc-400">Adjust the block mass to test building size before detailed design.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Building width, m"><input className={inputClass()} type="number" value={massing.width} onChange={(event) => setMassing({ ...massing, width: Number(event.target.value) || 0 })} /></Field>
                  <Field label="Building length, m"><input className={inputClass()} type="number" value={massing.length} onChange={(event) => setMassing({ ...massing, length: Number(event.target.value) || 0 })} /></Field>
                  <Field label="Height, m"><input className={inputClass()} type="number" value={massing.height} onChange={(event) => setMassing({ ...massing, height: Number(event.target.value) || 0 })} /></Field>
                  <Field label="Floors"><input className={inputClass()} type="number" value={massing.floors} onChange={(event) => setMassing({ ...massing, floors: Number(event.target.value) || 1 })} /></Field>
                  <Field label="Position X"><input className={inputClass()} type="range" min="15" max="85" value={massing.x} onChange={(event) => setMassing({ ...massing, x: Number(event.target.value) })} /></Field>
                  <Field label="Position Y"><input className={inputClass()} type="range" min="15" max="85" value={massing.y} onChange={(event) => setMassing({ ...massing, y: Number(event.target.value) })} /></Field>
                  <Field label="Rotation"><input className={inputClass()} type="range" min="-45" max="45" value={massing.rotation} onChange={(event) => setMassing({ ...massing, rotation: Number(event.target.value) })} /></Field>
                  <label className="flex items-center gap-2 rounded border border-white/10 bg-[#11151b] px-2 py-2 text-xs text-zinc-300"><input type="checkbox" checked={massing.enabled} onChange={(event) => setMassing({ ...massing, enabled: event.target.checked })} />Show building mass</label>
                </div>
              </div>
              <Field label="Orbit angle"><input className={inputClass()} type="range" min="0" max="360" value={threeD.orbit} onChange={(event) => setThreeD({ ...threeD, orbit: Number(event.target.value) })} /></Field>
              <div className="grid grid-cols-2 gap-2">
                {(['buildings', 'roads', 'sunShadow', 'massing'] as const).map((key) => <label key={key} className="flex items-center gap-2 rounded border border-white/10 bg-[#11151b] px-2 py-2 text-xs text-zinc-300"><input type="checkbox" checked={threeD[key]} onChange={(event) => setThreeD({ ...threeD, [key]: event.target.checked })} />{key}</label>)}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={buttonClass('secondary')} onClick={() => setThreeD({ buildings: true, roads: true, sunShadow: true, massing: true, height: 12, orbit: 34, zoom: 1 })}>Reset Camera</button>
                <button className={buttonClass('secondary')} onClick={() => { downloadText('ArchiVault_Site_3D_Snapshot.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520"><rect width="100%" height="100%" fill="#080a0d"/><polygon points="350,180 560,175 610,340 320,350" fill="#0e7490" stroke="#67e8f9"/><text x="40" y="60" fill="#67e8f9">Conceptual 3D site snapshot</text></svg>`); showNotice('3D snapshot exported.'); }}>Export 3D Snapshot</button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-base font-semibold text-white">Zoning + Feasibility</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Zoning type"><select className={inputClass()} value={site.zoning} onChange={(event) => setSite({ ...site, zoning: event.target.value })}>{['R1', 'R2', 'R3', 'Commercial', 'Mixed-use', 'Institutional'].map((item) => <option key={item}>{item}</option>)}</select></Field>
              <Field label="FAR"><input className={inputClass()} type="number" value={site.far} onChange={(event) => setSite({ ...site, far: Number(event.target.value) || 0 })} /></Field>
              <Field label="Max footprint, sqm"><input className={inputClass()} type="number" value={site.maxFootprint} onChange={(event) => setSite({ ...site, maxFootprint: Number(event.target.value) || 0 })} /></Field>
              <Field label="Setbacks, m"><input className={inputClass()} type="number" value={site.setbacks} onChange={(event) => setSite({ ...site, setbacks: Number(event.target.value) || 0 })} /></Field>
              <Field label="Max height, m"><input className={inputClass()} type="number" value={site.maxHeight} onChange={(event) => setSite({ ...site, maxHeight: Number(event.target.value) || 0 })} /></Field>
              <Field label="Parking req."><input className={inputClass()} type="number" value={site.parking} onChange={(event) => setSite({ ...site, parking: Number(event.target.value) || 0 })} /></Field>
            </div>
            <p className="mt-3 rounded border border-amber-300/20 bg-amber-300/10 p-2 text-xs text-amber-100">Planning guide only. Verify official zoning and code requirements with local authorities.</p>
          </div>
        </aside>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.15fr]">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Amenities + Context Analysis</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {[
              ['Schools', '2 within radius', 'API-ready placeholder'],
              ['Parks', '1 nearby', 'green buffer opportunity'],
              ['Transit', '450m estimate', 'walkability support'],
              ['Retail/Food', '5+ nearby', 'active frontage potential'],
              ['Hospitals', '1km+ estimate', 'community service context'],
              ['Government', 'manual check', 'future Places API'],
              ['Community', 'religious/civic', 'social mapping layer'],
              ['Waterways', layers.water ? 'visible layer' : 'off', 'flood/drainage check'],
            ].map(([name, value, note]) => <div key={name} className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-xs font-semibold text-white">{name}</p><p className="mt-1 text-xs text-cyan-100">{value}</p><p className="mt-1 text-[10px] text-zinc-500">{note}</p></div>)}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Design Recommendations</h3>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {recommendations.map(([group, text]) => <div key={group} className="rounded-md border border-cyan-300/15 bg-cyan-300/5 p-3"><p className="text-xs font-semibold text-cyan-100">{group}</p><p className="mt-1 text-xs leading-5 text-zinc-300">{text}</p></div>)}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">Live Site Analysis Report</h3>
            <p className="mt-1 text-xs text-zinc-500">Updates automatically from address, marker, boundary, climate, layer, and zoning inputs.</p>
          </div>
          <span className="rounded border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">{savedStudies.length ? `${savedStudies.length} saved this session` : 'Unsaved study'}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3 text-xs leading-5 text-emerald-50"><strong>Opportunities</strong><br />{opportunities.join(' ')}</div>
          <div className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-50"><strong>Constraints</strong><br />{constraints.join(' ')}</div>
        </div>
        <pre className="mt-4 max-h-64 overflow-auto rounded-md border border-white/10 bg-[#080a0d] p-4 font-mono text-xs leading-6 text-emerald-100">{reportLines.join('\n')}</pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={buttonClass()} onClick={() => { downloadSimplePdf('ArchiVault_Site_Analysis_Report.pdf', 'ArchiVault Site Analysis Report', reportLines); showNotice('Site analysis PDF exported.'); }}>Export Site Analysis PDF</button>
          {[
            'Macro/Micro Map',
            'Solid/Void Figure-Ground',
            'Access/Movement Diagram',
            'Environmental Layers',
          ].map((kind) => <button key={kind} className={buttonClass('secondary')} onClick={() => exportAnalysisDiagram(kind)}>{kind} SVG</button>)}
          <button className={buttonClass('secondary')} onClick={() => { downloadText('ArchiVault_Site_Data.csv', reportLines.map((line) => `"${line.replace(/"/g, '""')}"`).join('\n')); showNotice('Site data CSV exported.'); }}>Export Data CSV</button>
          <button className={buttonClass('secondary')} onClick={() => { downloadText('ArchiVault_Site_Map_Image.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="650"><rect width="100%" height="100%" fill="#080a0d"/><polygon points="${boundary.map((point) => `${point.x * 10},${point.y * 6.5}`).join(' ')}" fill="#0e7490" stroke="#67e8f9" stroke-width="4"/><text x="40" y="60" fill="#67e8f9">ArchiVault Site Map - ${site.address}</text></svg>`); showNotice('Map image exported.'); }}>Export Map Image</button>
          <button className={buttonClass('secondary')} onClick={copyReport}>Copy Report Summary</button>
          <button className={buttonClass('secondary')} onClick={saveSiteStudy}>Save Site Study</button>
          {['GLB', 'OBJ', 'DXF', 'Rhino'].map((kind) => <button key={kind} className={buttonClass('secondary')} onClick={() => { downloadText(`ArchiVault_Site_Context_${kind}.txt`, `${kind} export placeholder for ${site.address}.\nConnect a 3D tiles/context provider to generate real geometry.\n\n${reportLines.join('\n')}`); showNotice(`${kind} placeholder exported.`); }}>{kind}</button>)}
        </div>
      </div>
    </section>
  );
}

export default function Dashboard({ activeTab, setActiveTab }: DashboardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectImportRef = useRef<HTMLInputElement>(null);
  const [toolSearch, setToolSearch] = useState('');
  const [planningSubtab, setPlanningSubtab] = useState<'Bubble Diagram' | 'Stair + Floor Plan' | 'Window/Ventilation' | 'Scale Helper'>('Bubble Diagram');
  const [materialsSubtab, setMaterialsSubtab] = useState<'Quantity Estimator' | 'Cost Estimator' | 'Tile Grid' | 'Price Database'>('Quantity Estimator');
  const [plotSubtab, setPlotSubtab] = useState<'Sheet Layout' | 'Line Weights' | 'Auto-Plot Pack'>('Sheet Layout');
  const [renderSubtab, setRenderSubtab] = useState<'Render Assets' | 'Free Resources' | 'Render Optimizer' | 'Scene Prep' | 'Concept Helper'>('Render Assets');
  const [automationSubtab, setAutomationSubtab] = useState<'CAD Cleanup' | 'Macro Builder' | 'SketchUp Scripts' | 'Revit/Dynamo' | 'File Health'>('CAD Cleanup');
  const [settingsNote, setSettingsNote] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedCadAsset, setSelectedCadAsset] = useState<SelectedCadAsset | null>(null);
  const [assetError, setAssetError] = useState('');
  const [floorPlanForm, setFloorPlanForm] = useState<FloorPlanForm>({ width: 12, length: 10, wall: 150, columnW: 300, columnD: 300, rotationAngle: 0 });
  const [floorPlanSpacings, setFloorPlanSpacings] = useState([4, 3.5, 4.5]);
  const [scaleLabState, setScaleLabState] = useState<ScaleLabState>({
    scaleForm: { realWidth: 18, realLength: 28, sheet: 'A1', scale: 100 },
    board: { width: 841, height: 594 },
    printSheet: 'A1',
    lineWeights: Object.fromEntries(lineWeightPresets.map((item) => [item.name, item.active])),
    converterMode: 'real-to-drawing',
    realSize: 5,
    drawingSize: 50,
    converterScale: 100,
    targetScale: 50,
    budgetViews: [
      { id: 'plan', label: 'Plan', width: 18, height: 12, scale: 100 },
      { id: 'elevation', label: 'Elevation', width: 18, height: 6, scale: 100 },
    ],
  });
  const [complianceState, setComplianceState] = useState<ComplianceState>({
    lotArea: 240,
    lotType: 'Inside',
    zoning: 'R1',
    floors: 2,
    footprintPercent: 55,
    northAngle: 90,
    projectShadow: false,
    selectedTile: null,
    material: 'Ceramic',
    tile: {
      width: 4.2,
      length: 3.6,
      size: 600,
      waste: 10,
      grout: 3,
      cost: 85,
      laborPerSqm: 250,
      adhesivePerSqm: 95,
      roomShape: 'Rectangle',
      pattern: 'Straight grid',
      orientation: 0,
      startPoint: 'Center',
      groutColor: '#26323d',
    },
    targetMonth: 'june',
    apertureHeight: 2500,
  });
  const [commands, setCommands] = useState<CommandRow[]>(defaultCommands);
  const normalizedTab: ActiveTab =
    activeTab === 'floorplan' ? 'planning' :
    activeTab === 'lab' ? 'plots' :
    activeTab === 'studio' ? 'render' :
    activeTab;

  useEffect(() => {
    if (normalizedTab !== activeTab) setActiveTab(normalizedTab);
  }, [activeTab, normalizedTab, setActiveTab]);

  const openTool = (tab: ActiveTab, subtool?: string) => {
    setActiveTab(tab);
    if (tab === 'planning' && subtool) setPlanningSubtab(subtool as typeof planningSubtab);
    if (tab === 'materials' && subtool) setMaterialsSubtab(subtool as typeof materialsSubtab);
    if (tab === 'plots' && subtool) setPlotSubtab(subtool as typeof plotSubtab);
    if (tab === 'render' && subtool) setRenderSubtab(subtool as typeof renderSubtab);
    if (tab === 'automation' && subtool) setAutomationSubtab(subtool as typeof automationSubtab);
    setToolSearch('');
  };

  const toolIndex = [
    { label: 'Bubble Diagram Planner', keywords: 'bubble zoning spaces adjacency', tab: 'planning' as ActiveTab, subtool: 'Bubble Diagram', desc: 'Plan spaces before drawing walls.' },
    { label: 'Stair Calculator', keywords: 'stairs riser tread stair', tab: 'planning' as ActiveTab, subtool: 'Stair + Floor Plan', desc: 'Check risers, treads, and floor planning.' },
    { label: 'Floor Plan Lab', keywords: 'floor plan structural grid columns', tab: 'planning' as ActiveTab, subtool: 'Stair + Floor Plan', desc: 'Generate layout scripts and previews.' },
    { label: 'Window/Ventilation Planner', keywords: 'window ventilation airflow daylight', tab: 'planning' as ActiveTab, subtool: 'Window/Ventilation', desc: 'Study room airflow and daylight.' },
    { label: 'Scale Helper', keywords: 'scale reference chart sheet fit', tab: 'planning' as ActiveTab, subtool: 'Scale Helper', desc: 'Choose readable architectural scales.' },
    { label: 'Site Analysis', keywords: 'site google maps sun wind zoning', tab: 'site' as ActiveTab, desc: 'Search, draw boundary, analyze context.' },
    { label: 'National Building Code Check', keywords: 'code compliance far gfa footprint pd1096', tab: 'compliance' as ActiveTab, desc: 'Planning guide for lot coverage and FAR.' },
    { label: 'Material Estimator', keywords: 'materials cost quantity rebar concrete chb tile paint', tab: 'materials' as ActiveTab, subtool: 'Quantity Estimator', desc: 'Estimate quantities and budgets.' },
    { label: 'Price Database', keywords: 'market price philippine supplier cost', tab: 'materials' as ActiveTab, subtool: 'Price Database', desc: 'Edit sample material prices.' },
    { label: 'Auto-Plot Pack', keywords: 'plot pdf dwg autocad ctb sheet', tab: 'plots' as ActiveTab, subtool: 'Auto-Plot Pack', desc: 'Generate AutoCAD plot pack.' },
    { label: 'Line Weights', keywords: 'lineweight ctb stb layers plot style', tab: 'plots' as ActiveTab, subtool: 'Line Weights', desc: 'Choose drafting line weights.' },
    { label: 'CAD File Health Checker', keywords: 'dwg dxf health lag cleanup audit purge', tab: 'automation' as ActiveTab, subtool: 'File Health', desc: 'Analyze CAD lag and cleanup needs.' },
    { label: 'Script Builder', keywords: 'script macro autocad sketchup revit automation', tab: 'automation' as ActiveTab, subtool: 'Macro Builder', desc: 'Preview and download script packs.' },
    { label: 'Render Assets', keywords: 'render assets textures hdri sketchup enscape lumion vray d5', tab: 'render' as ActiveTab, subtool: 'Render Assets', desc: 'Manage render assets and resources.' },
    { label: 'Reports & Projects', keywords: 'reports saved projects export pdf csv', tab: 'reports' as ActiveTab, desc: 'Find saved studies and exported outputs.' },
    { label: 'Settings', keywords: 'settings api backup restore maps weather', tab: 'settings' as ActiveTab, desc: 'Keys, backups, and app setup.' },
  ];
  const toolResults = toolSearch.trim()
    ? toolIndex.filter((tool) => `${tool.label} ${tool.keywords}`.toLowerCase().includes(toolSearch.toLowerCase())).slice(0, 8)
    : [];

  function handleCadAsset(file: File) {
    const extension = fileExtension(file.name);
    if (!SUPPORTED_CAD_EXTENSIONS.includes(extension)) {
      setAssetError('Unsupported file format. Please upload a vector CAD drawing or 3D mesh block.');
      setSelectedCadAsset(null);
      return;
    }
    setAssetError('');
    setSelectedCadAsset({ name: file.name, extension: extension.replace('.', '').toUpperCase(), sizeMb: Number((file.size / (1024 * 1024)).toFixed(2)) });
  }

  function buildProjectState(): ArchiVaultProjectState {
    return {
      version: 1,
      activeTab,
      assetVault: { selectedCadAsset },
      floorPlan: { form: floorPlanForm, spacings: floorPlanSpacings },
      scaleLab: scaleLabState,
      compliance: complianceState,
      automation: { commands },
      studio: { note: 'SketchUp and Revit settings are managed in the 3D & BIM Studio workspace.' },
    };
  }

  function exportProjectJson() {
    downloadText('ArchiVault_Project_State.json', JSON.stringify(buildProjectState(), null, 2));
  }

  async function importProjectJson(file: File) {
    const text = await file.text();
    const parsed = JSON.parse(text) as Partial<ArchiVaultProjectState>;
    if (parsed.activeTab) setActiveTab(parsed.activeTab);
    if (parsed.assetVault) setSelectedCadAsset(parsed.assetVault.selectedCadAsset ?? null);
    if (parsed.floorPlan?.form) setFloorPlanForm({ ...floorPlanForm, ...parsed.floorPlan.form });
    if (parsed.floorPlan?.spacings) setFloorPlanSpacings(parsed.floorPlan.spacings);
    if (parsed.scaleLab) setScaleLabState((current) => ({ ...current, ...parsed.scaleLab }));
    if (parsed.compliance) setComplianceState((current) => ({ ...current, ...parsed.compliance, tile: { ...current.tile, ...parsed.compliance?.tile } }));
    if (parsed.automation?.commands) setCommands(parsed.automation.commands);
  }

  return (
    <div className={normalizedTab === 'site' ? 'space-y-0' : 'space-y-6'}>
      {normalizedTab !== 'site' && <div className="relative rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">Find a Tool</p>
            <p className="mt-1 text-xs text-zinc-500">Search tools, reports, assets, or workflows without guessing which tab they live in.</p>
          </div>
          <div className="w-full lg:max-w-xl">
            <input
              className={inputClass()}
              value={toolSearch}
              onChange={(event) => setToolSearch(event.target.value)}
              placeholder="Search tools, reports, assets, or workflows..."
            />
          </div>
        </div>
        {toolResults.length > 0 && (
          <div className="absolute left-3 right-3 top-full z-30 mt-2 grid gap-2 rounded-lg border border-cyan-300/20 bg-[#0b0d10] p-3 shadow-2xl md:grid-cols-2">
            {toolResults.map((tool) => (
              <button key={`${tool.label}-${tool.subtool ?? tool.tab}`} className="rounded-md border border-white/10 bg-[#11151b] p-3 text-left hover:border-cyan-300/40" onClick={() => openTool(tool.tab, tool.subtool)}>
                <span className="text-sm font-semibold text-white">{tool.label}</span>
                <span className="mt-1 block text-xs leading-5 text-zinc-400">{tool.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>}
      {normalizedTab !== 'site' && <nav className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = normalizedTab === tab.id;
          return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${isActive ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-100'}`}><Icon className="h-4 w-4" />{tab.label}</button>;
        })}
      </nav>}

      {normalizedTab === 'dashboard' && (
        <div className="space-y-5">
          <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-5">
            <h2 className="text-lg font-semibold text-white">Start Here</h2>
            <p className="mt-1 text-sm leading-6 text-cyan-50/80">Choose the task you need. ArchiVault will take you to the right workspace and keep advanced tools grouped inside each lab.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Start Bubble Diagram', 'Plan spaces and relationships before drafting.', 'Ready', 'Planning Lab', 'planning', 'Bubble Diagram'],
              ['Open Site Analysis', 'Search site, draw boundary, analyze context.', 'Ready', 'Site Analysis', 'site', undefined],
              ['Estimate Materials', 'Estimate quantities, waste, and sample costs.', 'Live', 'Materials & Cost', 'materials', 'Quantity Estimator'],
              ['Generate Plot Pack', 'Prepare AutoCAD .SCR plotting package.', 'Ready', 'Plot & Sheets', 'plots', 'Auto-Plot Pack'],
              ['Analyze CAD File', 'Check DWG/DXF health and cleanup needs.', 'Ready', 'Automation Tools', 'automation', 'File Health'],
              ['Open Render Assets', 'Manage textures, HDRIs, models, and resources.', 'Ready', 'Render Studio', 'render', 'Render Assets'],
              ['View Reports', 'Find saved studies and exported summaries.', 'Saved', 'Reports & Projects', 'reports', undefined],
            ].map(([titleText, desc, status, target, tab, subtool]) => (
              <div key={titleText} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">{titleText}</h3>
                  <span className="rounded border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[10px] text-emerald-100">{status}</span>
                </div>
                <p className="mt-2 min-h-10 text-xs leading-5 text-zinc-400">{desc}</p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Last used: this session</p>
                <button className={`${buttonClass()} mt-3 w-full`} onClick={() => openTool(tab as ActiveTab, subtool as string | undefined)}>Open {target}</button>
              </div>
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-base font-semibold text-white">Recent Projects</h3>
              <div className="mt-3 space-y-2">
                {['Thesis Site Study', 'Plate 03 Plot Pack', 'Residential Material Estimate'].map((project, index) => <div key={project} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-[#11151b] p-3"><div><p className="text-sm font-semibold text-white">{project}</p><p className="text-xs text-zinc-500">Last edited {index + 1} day{index === 0 ? '' : 's'} ago</p></div><button className={buttonClass('secondary')} onClick={() => openTool(index === 0 ? 'site' : index === 1 ? 'plots' : 'materials')}>Quick open</button></div>)}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-base font-semibold text-white">Workflow Shortcuts</h3>
              <div className="mt-3 grid gap-2">
                {[
                  ['Plate Submission Workflow', 'Scale Helper -> Sheet Layout -> Line Weights -> Auto-Plot Pack', 'plots'],
                  ['Site Analysis Workflow', 'Search Site -> Draw Boundary -> 3D -> Export Report', 'site'],
                  ['CAD Cleanup Workflow', 'File Health -> Presets -> Preview Script -> Download Pack', 'automation'],
                  ['Render Prep Workflow', 'Render Assets -> Optimizer -> Scene Prep', 'render'],
                  ['Material Estimate Workflow', 'Quantity -> Cost -> Price Database -> Report', 'materials'],
                ].map(([name, steps, tab]) => <button key={name} className="rounded-md border border-white/10 bg-[#11151b] p-3 text-left hover:border-cyan-300/35" onClick={() => openTool(tab as ActiveTab)}><span className="text-sm font-semibold text-white">{name}</span><span className="mt-1 block text-xs text-zinc-400">{steps}</span></button>)}
              </div>
            </div>
          </div>
        </div>
      )}

      {normalizedTab === 'vault' && (
        <div className="space-y-5">
          {!selectedCadAsset && (
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="grid h-16 w-16 place-items-center rounded-2xl border border-cyan-300/30 bg-[#11151b]"><UploadCloud className="h-8 w-8 text-cyan-200" /></div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Get Started: Upload one CAD asset</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-cyan-50/80">Asset Vault helps you check what kind of CAD file you have before planning cleanup, optimization, or import workflows. Start with a `.dwg`, `.dxf`, or `.obj` file.</p>
                </div>
              </div>
            </div>
          )}
          <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) handleCadAsset(file); }} className={`rounded-lg border border-dashed p-5 ${isDragging ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/15 bg-white/[0.03]'}`}>
              <input ref={fileInputRef} type="file" accept=".dwg,.dxf,.obj" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleCadAsset(file); }} />
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-md border border-white/10 bg-[#11151b] p-6 text-center">
                <ImagePlus className="mb-5 h-12 w-12 text-cyan-300" />
                <h3 className="text-lg font-semibold text-white">Drop a CAD asset file</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">Use vector drawing files and 3D mesh blocks for vault analysis and optimization planning.</p>
                <div className="mt-4 flex max-w-md items-start gap-2 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-left text-xs leading-5 text-amber-100"><Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />Accepts .dwg, .dxf, and .obj CAD assets. Max recommended size for analysis: 50MB.</div>
                <button className={`${buttonClass()} mt-5`} onClick={() => fileInputRef.current?.click()}><UploadCloud className="h-4 w-4" />Upload CAD Asset</button>
                {assetError && <p className="mt-4 rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">{assetError}</p>}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between"><div><h3 className="text-base font-semibold text-white">CAD Asset Intake</h3><p className="mt-1 text-xs text-zinc-500">Awaiting .dwg, .dxf, or .obj input</p></div><BoxSelect className="h-5 w-5 text-cyan-300" /></div>
              {selectedCadAsset ? <div className="rounded-md border border-emerald-300/20 bg-emerald-300/10 p-4 text-emerald-100">{selectedCadAsset.name} · {selectedCadAsset.extension} · {selectedCadAsset.sizeMb} MB</div> : <div className="rounded-md border border-white/10 bg-[#11151b] p-5 text-sm text-zinc-400">No CAD asset selected yet. Drop or upload a supported .dwg, .dxf, or .obj file.</div>}
              <div className="mt-5 rounded-md border border-white/10 bg-[#080a0d] p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Asset Visual Preview</p>
                <div className="relative aspect-[1.45/1] overflow-hidden rounded border border-cyan-300/20 bg-[#11151b] bg-[linear-gradient(90deg,rgba(34,211,238,.08)_1px,transparent_1px),linear-gradient(rgba(34,211,238,.08)_1px,transparent_1px)] bg-[size:20%_20%]">
                  <div className="absolute left-[18%] top-[18%] h-[48%] w-[52%] border-2 border-cyan-300/70" />
                  <div className="absolute left-[30%] top-[31%] h-[22%] w-[18%] border border-amber-300/70 bg-amber-300/10" />
                  <div className="absolute bottom-[18%] right-[14%] h-[28%] w-[22%] border border-emerald-300/70 bg-emerald-300/10" />
                  <span className="absolute bottom-3 left-3 rounded bg-black/40 px-2 py-1 font-mono text-[10px] text-cyan-100">{selectedCadAsset ? selectedCadAsset.extension : 'DWG / DXF / OBJ'}</span>
                </div>
              </div>
            </div>
          </section>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5"><p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Free CAD Resources</p><div className="grid gap-3 md:grid-cols-3">{[
            ['CAD Blocks','Free architectural AutoCAD blocks in DWG format.','https://www.cad-blocks.net/'],
            ['CADdetails','Manufacturer CAD drawings, BIM models, and specs.','https://www.caddetails.com/'],
            ['DWG Models','Free DWG blocks for furniture, symbols, people, and architectural assets.','https://dwgmodels.com/'],
          ].map(([name, desc, url]) => <a key={name} href={url} target="_blank" rel="noreferrer" className="rounded-md border border-white/10 bg-[#11151b] p-3 hover:border-cyan-300/40"><span className="flex items-center justify-between text-sm font-medium text-white">{name}<ExternalLink className="h-3.5 w-3.5 text-cyan-300" /></span><span className="mt-2 block text-xs leading-5 text-zinc-400">{desc}</span></a>)}</div></div>
        </div>
      )}
      {normalizedTab === 'planning' && (
        <div className="space-y-5">
          <PageIntro title="Planning Lab" subtitle="Early design tools for spaces, stairs, floor plans, ventilation, and scale choices." breadcrumb={`Planning Lab > ${planningSubtab}`} />
          <SubNav items={['Bubble Diagram', 'Stair + Floor Plan', 'Window/Ventilation', 'Scale Helper']} active={planningSubtab} onSelect={(item) => setPlanningSubtab(item as typeof planningSubtab)} />
          {planningSubtab === 'Bubble Diagram' && <BubbleDiagramMaker />}
          {planningSubtab === 'Stair + Floor Plan' && <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]"><CompactStairCalculator /><FloorPlanLab form={floorPlanForm} setForm={setFloorPlanForm} spacings={floorPlanSpacings} setSpacings={setFloorPlanSpacings} showToolkit={false} /></div>}
          {planningSubtab === 'Window/Ventilation' && <StudentPlanningToolkit />}
          {planningSubtab === 'Scale Helper' && <ScaleLayoutLab state={scaleLabState} setState={setScaleLabState} />}
        </div>
      )}
      {normalizedTab === 'site' && <SiteAnalysisTab />}
      {normalizedTab === 'compliance' && (
        <div className="space-y-5">
          <PageIntro title="Code & Compliance" subtitle="Planning-guide checks for lot coverage, FAR/GFA, open space, setbacks, and code assumptions." breadcrumb="Code & Compliance > Building Code Check" />
          <div className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">Planning guide only. Verify official requirements with local authorities.</div>
          <ComplianceLab state={complianceState} setState={setComplianceState} />
        </div>
      )}
      {normalizedTab === 'materials' && (
        <div className="space-y-5">
          <PageIntro title="Materials & Cost" subtitle="Live quantity estimates, sample Philippine prices, tile layouts, and material reports." breadcrumb={`Materials & Cost > ${materialsSubtab}`} />
          <SubNav items={['Quantity Estimator', 'Cost Estimator', 'Tile Grid', 'Price Database']} active={materialsSubtab} onSelect={(item) => setMaterialsSubtab(item as typeof materialsSubtab)} />
          <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-50">Tip: material tools are grouped in the live estimator toolkit below. Use the search field inside the page if the section is long.</div>
          <LiveArchitectureToolkit />
        </div>
      )}
      {normalizedTab === 'plots' && (
        <div className="space-y-5">
          <PageIntro title="Plot & Sheets" subtitle="Sheet fit, scale choices, line weights, CTB/STB guidance, and AutoCAD plot packs." breadcrumb={`Plot & Sheets > ${plotSubtab}`} />
          <SubNav items={['Sheet Layout', 'Line Weights', 'Auto-Plot Pack']} active={plotSubtab} onSelect={(item) => setPlotSubtab(item as typeof plotSubtab)} />
          <ScaleLayoutLab state={scaleLabState} setState={setScaleLabState} />
          {plotSubtab === 'Auto-Plot Pack' && <LiveArchitectureToolkit />}
        </div>
      )}
      {normalizedTab === 'automation' && (
        <div className="space-y-5">
          <PageIntro title="Automation Tools" subtitle="Cleanup scripts, macro builder, CAD file health, SketchUp Ruby, and Revit/Dynamo packs." breadcrumb={`Automation Tools > ${automationSubtab}`} />
          <SubNav items={['CAD Cleanup', 'Macro Builder', 'SketchUp Scripts', 'Revit/Dynamo', 'File Health']} active={automationSubtab} onSelect={(item) => setAutomationSubtab(item as typeof automationSubtab)} />
          <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-50">Workflow: choose software, pick presets, preview script, download script pack, then follow the software-specific guide.</div>
          <OptimizationPanel commands={commands} setCommands={setCommands} />
        </div>
      )}
      {normalizedTab === 'render' && (
        <div className="space-y-5">
          <PageIntro title="Render Studio" subtitle="Render assets, free resources, lag optimization, scene prep, SketchUp/Revit helpers, and concept text." breadcrumb={`Render Studio > ${renderSubtab}`} />
          <SubNav items={['Render Assets', 'Free Resources', 'Render Optimizer', 'Scene Prep', 'Concept Helper']} active={renderSubtab} onSelect={(item) => setRenderSubtab(item as typeof renderSubtab)} />
          <BimStudioTab />
          <LiveArchitectureToolkit />
        </div>
      )}
      {normalizedTab === 'reports' && (
        <div className="space-y-5">
          <PageIntro title="Reports & Projects" subtitle="Saved projects, site studies, material estimates, code checks, plot packs, and exported reports." breadcrumb="Reports & Projects" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {['Saved Site Studies', 'Saved Material Estimates', 'Saved Code Checks', 'Saved Bubble Diagrams', 'Saved Plot Packs', 'Exported Reports'].map((name) => <div key={name} className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><h3 className="text-sm font-semibold text-white">{name}</h3><p className="mt-2 text-xs leading-5 text-zinc-400">Search, open, rename, duplicate, delete, export PDF/CSV, or copy summary. Saved browser data appears here as the save system grows.</p><div className="mt-3 flex flex-wrap gap-2"><button className={buttonClass('secondary')}>Open</button><button className={buttonClass('secondary')}>Export PDF</button><button className={buttonClass('secondary')}>Copy Summary</button></div></div>)}
          </div>
        </div>
      )}
      {normalizedTab === 'settings' && (
        <div className="space-y-5">
          <PageIntro title="Settings" subtitle="API keys, app preferences, export paths, software paths, and workspace backups." breadcrumb="Settings" />
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-base font-semibold text-white">API Keys</h3>
              <p className="mt-1 text-xs text-zinc-500">Google Maps, Weather, Places, and future data providers can be configured here later.</p>
              <div className="mt-4 grid gap-3"><Field label="Google Maps API key"><input className={inputClass()} placeholder="Managed inside Site Analysis for now" /></Field><Field label="Weather API key"><input className={inputClass()} placeholder="Placeholder" /></Field><Field label="Places API key"><input className={inputClass()} placeholder="Placeholder" /></Field></div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-base font-semibold text-white">Workspace Backup</h3>
              <p className="mt-1 text-xs text-zinc-500">Save your current ArchiVault inputs or restore a saved work file.</p>
              {settingsNote && <p className="mt-3 rounded-md border border-emerald-300/25 bg-emerald-300/10 p-2 text-xs text-emerald-50">{settingsNote}</p>}
              <input ref={projectImportRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProjectJson(file).then(() => setSettingsNote('Saved work restored.')); event.currentTarget.value = ''; }} />
              <div className="mt-4 flex flex-wrap gap-2"><button className={buttonClass('secondary')} onClick={() => projectImportRef.current?.click()}><FileUp className="h-4 w-4" /> Restore Saved Work</button><button className={buttonClass()} onClick={() => { exportProjectJson(); setSettingsNote('Current work backup downloaded.'); }}><Download className="h-4 w-4" /> Save My Current Work</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
