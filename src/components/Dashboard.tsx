import React, { useMemo, useRef, useState } from 'react';
import {
  BoxSelect,
  Building2,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCode2,
  ImagePlus,
  LayoutGrid,
  Loader2,
  Plus,
  Ruler,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { ActiveTab } from '../types';
import CompanionSuite from './CompanionSuite';
import OptimizationPanel from './OptimizationPanel';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

type DashboardProps = {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
};

type SearchMatch = {
  id: number;
  name: string;
  category: string;
  file_link: string;
  cloud_link: string;
  description: string;
  distance: number;
  similarity_score: number;
};

type ScaleResponse = {
  valid: boolean;
  sheet_size: string;
  scale: string;
  orientation: string;
  drawing_dimensions_mm: { width: number; length: number };
  printable_boundary_mm: { width: number; height: number };
  remaining_margin_safety_mm: {
    horizontal_total: number;
    vertical_total: number;
    minimum_edge_margin: number;
  };
  recommendations: Array<{
    scale: string;
    orientation: string;
    drawing_width_mm: number;
    drawing_length_mm: number;
    minimum_margin_mm: number;
  }>;
};

type LayoutResponse = {
  board: { width_mm: number; height_mm: number };
  system: {
    margin_mm: number;
    gutter_mm: number;
    rule_of_thirds_x: number[];
    rule_of_thirds_y: number[];
  };
  zones: Array<{ name: string; x: number; y: number; width: number; height: number }>;
};

type CommandRow = {
  id: string;
  label: string;
  command: string;
  enabled: boolean;
};

const tabs: Array<{ id: ActiveTab; label: string; icon: React.ElementType }> = [
  { id: 'vault', label: 'Asset Vault', icon: Search },
  { id: 'lab', label: 'Scale & Layout Lab', icon: Ruler },
  { id: 'automation', label: 'Automation Panel', icon: FileCode2 },
  { id: 'studio', label: '3D & BIM Studio', icon: Building2 },
];

const defaultCommands: CommandRow[] = [
  {
    id: 'units-mm',
    label: 'Set units to millimeters',
    command: '_UNITS\n2\n3\n1\n0\nN',
    enabled: true,
  },
  {
    id: 'regen-all',
    label: 'Regenerate drawing cache',
    command: '_REGENALL',
    enabled: true,
  },
];

const resourceLinks = [
  {
    name: 'CAD Blocks',
    url: 'https://www.cad-blocks.net/',
    description: 'Free architectural AutoCAD blocks in DWG format.',
  },
  {
    name: 'CADdetails',
    url: 'https://www.caddetails.com/Main/Home',
    description: 'Manufacturer CAD drawings, BIM models, and specs.',
  },
  {
    name: 'DWG Models',
    url: 'https://dwgmodels.com/',
    description: 'Free DWG blocks for furniture, symbols, people, and architectural assets.',
  },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function inputClass() {
  return 'w-full rounded-md border border-white/10 bg-[#11151b] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10';
}

function buttonClass(variant: 'primary' | 'secondary' = 'primary') {
  if (variant === 'secondary') {
    return 'inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]';
  }
  return 'inline-flex items-center justify-center gap-2 rounded-md bg-cyan-400 px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300';
}

function ResourceLinks() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Free CAD resources</p>
      <div className="grid gap-3 md:grid-cols-3">
        {resourceLinks.map((resource) => (
          <a
            key={resource.name}
            href={resource.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-white/10 bg-[#11151b] p-3 transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
          >
            <span className="flex items-center justify-between gap-2 text-sm font-medium text-white">
              {resource.name}
              <ExternalLink className="h-3.5 w-3.5 text-cyan-300" />
            </span>
            <span className="mt-2 block text-xs leading-5 text-zinc-400">{resource.description}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function StudioPlaceholder() {
  const modules = [
    {
      title: 'SketchUp API Hub',
      description: 'Automation scripts for standard elevation scene generation through Ruby API scene, camera, and tag presets.',
    },
    {
      title: 'Revit Project Auditing',
      description: 'Model weight reduction utilities for unused families, imported CAD cleanup, warnings, and purge workflows.',
    },
  ];

  return (
    <section className="grid gap-5 lg:grid-cols-2">
      {modules.map((module) => (
        <div key={module.title} className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-white">{module.title}</h3>
            <Sparkles className="h-5 w-5 text-cyan-300" />
          </div>
          <p className="text-sm leading-6 text-zinc-400">{module.description}</p>
          <div className="mt-5 rounded-md border border-white/10 bg-[#11151b] p-4 text-xs leading-5 text-zinc-500">
            Future module slot reserved for platform-specific automation settings and export output.
          </div>
        </div>
      ))}
    </section>
  );
}

export default function Dashboard({ activeTab, setActiveTab }: DashboardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [uploadedHash, setUploadedHash] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [previewUrl, setPreviewUrl] = useState('');

  const [scaleForm, setScaleForm] = useState({
    real_world_width_meters: 18,
    real_world_length_meters: 28,
    target_sheet_size: 'A1',
    scale_factor: 100,
  });
  const [scaleResult, setScaleResult] = useState<ScaleResponse | null>(null);

  const [layoutForm, setLayoutForm] = useState({ width_mm: 841, height_mm: 594 });
  const [layoutResult, setLayoutResult] = useState<LayoutResponse | null>(null);

  const [commands, setCommands] = useState<CommandRow[]>(defaultCommands);
  const [newLabel, setNewLabel] = useState('');
  const [newCommand, setNewCommand] = useState('');
  const [studentLayers, setStudentLayers] = useState('walls, door swings, furniture loose, dims');
  const [scriptPreview, setScriptPreview] = useState('');
  const enabledCommands = useMemo(() => commands.filter((command) => command.enabled), [commands]);

  async function runVisualSearch(file: File) {
    if (!file.type.startsWith('image/')) {
      setSearchError('Upload a PNG, JPG, or another image screenshot.');
      return;
    }

    setSearching(true);
    setSearchError('');
    setMatches([]);
    setUploadedHash('');
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_BASE}/search`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setUploadedHash(data.uploaded_phash);
      setMatches(data.matches ?? []);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Visual search failed.');
    } finally {
      setSearching(false);
    }
  }

  async function computeScale() {
    const response = await fetch(`${API_BASE}/compute-scale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scaleForm),
    });
    if (!response.ok) throw new Error(await response.text());
    setScaleResult(await response.json());
  }

  async function computeLayout() {
    const response = await fetch(`${API_BASE}/compute-layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layoutForm),
    });
    if (!response.ok) throw new Error(await response.text());
    setLayoutResult(await response.json());
  }

  async function generateWorkflowScript(download = false) {
    const response = await fetch(`${API_BASE}/generate-workflow-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        custom_commands: enabledCommands.map((command) => command.command),
        student_layers: studentLayers.split(',').map((layer) => layer.trim()).filter(Boolean),
        include_qsave: true,
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const text = await response.text();
    setScriptPreview(text);

    if (download) {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Optimize_Project.scr';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }

  function addCommand(event: React.FormEvent) {
    event.preventDefault();
    if (!newLabel.trim() || !newCommand.trim()) return;
    setCommands((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        label: newLabel.trim(),
        command: newCommand.trim(),
        enabled: true,
      },
    ]);
    setNewLabel('');
    setNewCommand('');
  }

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                  : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === 'vault' && (
        <div className="space-y-5">
          <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div
              className={`rounded-lg border border-dashed p-5 transition ${
                isDragging ? 'border-cyan-300 bg-cyan-300/10' : 'border-white/15 bg-white/[0.03]'
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) runVisualSearch(file);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) runVisualSearch(file);
                }}
              />
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-md border border-white/10 bg-[#11151b] p-6 text-center">
                {previewUrl ? (
                  <img src={previewUrl} alt="Uploaded screenshot preview" className="mb-5 max-h-48 rounded-md border border-white/10 object-contain" />
                ) : (
                  <ImagePlus className="mb-5 h-12 w-12 text-cyan-300" />
                )}
                <h3 className="text-lg font-semibold text-white">Drop a plan screenshot</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">The API computes a 64-bit pHash and compares it against local `.dwg` and `.obj` records in SQLite.</p>
                <button className={`${buttonClass()} mt-5`} onClick={() => fileInputRef.current?.click()}>
                  <UploadCloud className="h-4 w-4" />
                  Upload Screenshot
                </button>
                {searching && <p className="mt-4 inline-flex items-center gap-2 text-sm text-cyan-200"><Loader2 className="h-4 w-4 animate-spin" /> Searching local vault</p>}
                {searchError && <p className="mt-4 rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{searchError}</p>}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">Match Results</h3>
                  <p className="mt-1 text-xs text-zinc-500">{uploadedHash ? `Uploaded pHash: ${uploadedHash}` : 'Awaiting screenshot input'}</p>
                </div>
                <BoxSelect className="h-5 w-5 text-cyan-300" />
              </div>
              <div className="space-y-3">
                {matches.length === 0 && (
                  <div className="rounded-md border border-white/10 bg-[#11151b] p-5 text-sm text-zinc-400">No matches yet. Seeded backend assets will appear here after a search.</div>
                )}
                {matches.map((match) => (
                  <div key={match.id} className="rounded-md border border-white/10 bg-[#11151b] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="font-medium text-zinc-100">{match.name}</h4>
                        <p className="mt-1 text-xs text-zinc-500">{match.category}</p>
                        <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-400">{match.description}</p>
                      </div>
                      <div className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-right">
                        <p className="text-lg font-semibold text-cyan-200">{match.similarity_score}%</p>
                        <p className="text-[11px] text-zinc-500">distance {match.distance}</p>
                      </div>
                    </div>
                    <p className="mt-3 font-mono text-[11px] text-zinc-500">{match.cloud_link || match.file_link}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <ResourceLinks />
        </div>
      )}

      {activeTab === 'lab' && (
        <div className="space-y-5">
          <section className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Scale Safety Calculator</h3>
              <Ruler className="h-5 w-5 text-cyan-300" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Real width, meters">
                <input className={inputClass()} type="number" value={scaleForm.real_world_width_meters} onChange={(event) => setScaleForm({ ...scaleForm, real_world_width_meters: Number(event.target.value) })} />
              </Field>
              <Field label="Real length, meters">
                <input className={inputClass()} type="number" value={scaleForm.real_world_length_meters} onChange={(event) => setScaleForm({ ...scaleForm, real_world_length_meters: Number(event.target.value) })} />
              </Field>
              <Field label="Sheet size">
                <select className={inputClass()} value={scaleForm.target_sheet_size} onChange={(event) => setScaleForm({ ...scaleForm, target_sheet_size: event.target.value })}>
                  {['A0', 'A1', 'A2', 'A3'].map((size) => <option key={size}>{size}</option>)}
                </select>
              </Field>
              <Field label="Scale factor">
                <input className={inputClass()} type="number" value={scaleForm.scale_factor} onChange={(event) => setScaleForm({ ...scaleForm, scale_factor: Number(event.target.value) })} />
              </Field>
            </div>
            <button className={`${buttonClass()} mt-5`} onClick={() => computeScale()}>
              <CheckCircle2 className="h-4 w-4" />
              Validate Fit
            </button>
            {scaleResult && (
              <div className="mt-5 rounded-md border border-white/10 bg-[#11151b] p-4">
                <div className="flex items-center gap-2">
                  {scaleResult.valid ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : <XCircle className="h-5 w-5 text-red-300" />}
                  <p className="font-medium text-white">{scaleResult.valid ? 'Fits printable boundary' : 'Scale overflows selected sheet'}</p>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-zinc-400 sm:grid-cols-2">
                  <p>Drawing: {scaleResult.drawing_dimensions_mm.width} x {scaleResult.drawing_dimensions_mm.length} mm</p>
                  <p>Boundary: {scaleResult.printable_boundary_mm.width} x {scaleResult.printable_boundary_mm.height} mm</p>
                  <p>Orientation: {scaleResult.orientation}</p>
                  <p>Min edge margin: {scaleResult.remaining_margin_safety_mm.minimum_edge_margin} mm</p>
                </div>
                {scaleResult.recommendations.length > 0 && (
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Alternative scales</p>
                    <div className="flex flex-wrap gap-2">
                      {scaleResult.recommendations.map((item) => (
                        <span key={item.scale} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-zinc-300">{item.scale} {item.orientation}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Golden Layout Guide</h3>
              <LayoutGrid className="h-5 w-5 text-cyan-300" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Board width, mm">
                <input className={inputClass()} type="number" value={layoutForm.width_mm} onChange={(event) => setLayoutForm({ ...layoutForm, width_mm: Number(event.target.value) })} />
              </Field>
              <Field label="Board height, mm">
                <input className={inputClass()} type="number" value={layoutForm.height_mm} onChange={(event) => setLayoutForm({ ...layoutForm, height_mm: Number(event.target.value) })} />
              </Field>
            </div>
            <button className={`${buttonClass()} mt-5`} onClick={() => computeLayout()}>
              <LayoutGrid className="h-4 w-4" />
              Compute Board
            </button>
            <div className="mt-5 aspect-[1.414/1] rounded-md border border-white/10 bg-[#11151b] p-3">
              <div className="relative h-full w-full overflow-hidden rounded border border-cyan-300/20 bg-[linear-gradient(90deg,rgba(34,211,238,0.08)_1px,transparent_1px),linear-gradient(rgba(34,211,238,0.08)_1px,transparent_1px)] bg-[size:33.33%_33.33%]">
                {layoutResult?.zones.map((zone) => (
                  <div
                    key={zone.name}
                    className="absolute rounded border border-cyan-300/50 bg-cyan-300/10 p-2 text-[10px] font-medium text-cyan-100"
                    style={{
                      left: `${(zone.x / layoutResult.board.width_mm) * 100}%`,
                      top: `${(zone.y / layoutResult.board.height_mm) * 100}%`,
                      width: `${(zone.width / layoutResult.board.width_mm) * 100}%`,
                      height: `${(zone.height / layoutResult.board.height_mm) * 100}%`,
                    }}
                  >
                    {zone.name}
                  </div>
                ))}
              </div>
            </div>
            </div>
          </section>
          <CompanionSuite />
        </div>
      )}

      {activeTab === 'automation' && (
        <div className="space-y-5">
          <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-base font-semibold text-white">Dynamic Command Table</h3>
              <p className="mt-1 text-sm text-zinc-400">Enabled rows are injected after audit, deep purge, and layer realignment.</p>
              <Field label="Student layers to normalize">
                <input className={`${inputClass()} mt-5`} value={studentLayers} onChange={(event) => setStudentLayers(event.target.value)} />
              </Field>
              <div className="mt-5 space-y-2">
                {commands.map((command) => (
                  <div key={command.id} className="flex items-start gap-3 rounded-md border border-white/10 bg-[#11151b] p-3">
                    <input
                      type="checkbox"
                      checked={command.enabled}
                      onChange={() => setCommands((current) => current.map((item) => item.id === command.id ? { ...item, enabled: !item.enabled } : item))}
                      className="mt-1 h-4 w-4 accent-cyan-300"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">{command.label}</p>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] leading-5 text-zinc-500">{command.command}</pre>
                    </div>
                    <button className="rounded p-1 text-zinc-500 hover:bg-red-400/10 hover:text-red-300" onClick={() => setCommands((current) => current.filter((item) => item.id !== command.id))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <form onSubmit={addCommand} className="mt-5 rounded-md border border-white/10 bg-[#11151b] p-4">
                <div className="grid gap-3">
                  <Field label="Command label">
                    <input className={inputClass()} value={newLabel} onChange={(event) => setNewLabel(event.target.value)} />
                  </Field>
                  <Field label="Raw AutoCAD commands">
                    <textarea className={inputClass()} rows={4} value={newCommand} onChange={(event) => setNewCommand(event.target.value)} />
                  </Field>
                </div>
                <button className={`${buttonClass('secondary')} mt-4`} type="submit">
                  <Plus className="h-4 w-4" />
                  Add Row
                </button>
              </form>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#080a0d]">
              <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">Optimize_Project.scr</h3>
                  <p className="mt-1 text-xs text-zinc-500">{enabledCommands.length} custom command rows enabled</p>
                </div>
                <div className="flex gap-2">
                  <button className={buttonClass('secondary')} onClick={() => generateWorkflowScript(false)}>Preview</button>
                  <button className={buttonClass()} onClick={() => generateWorkflowScript(true)}>
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                </div>
              </div>
              <pre className="min-h-[520px] overflow-auto p-5 font-mono text-xs leading-6 text-emerald-300">{scriptPreview || '; Generate a preview to inspect the final AutoCAD workflow script.'}</pre>
            </div>
          </section>
          <OptimizationPanel />
        </div>
      )}

      {activeTab === 'studio' && <StudioPlaceholder />}
    </div>
  );
}
