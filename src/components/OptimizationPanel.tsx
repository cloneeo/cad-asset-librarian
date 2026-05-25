import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Loader2,
  Plus,
  SlidersHorizontal,
  TerminalSquare,
  Trash2,
  X,
  AlertCircle,
  Check,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

type ScriptFlags = {
  deep_purge: boolean;
  audit_fix: boolean;
  overkill: boolean;
  close_tiny_gaps: boolean;
  flatten_2d_linework: boolean;
  consolidate_geometry: boolean;
  bind_xrefs: boolean;
  purge_regapps: boolean;
  inject_pdf_plot_macro: boolean;
  normalize_layers: boolean;
  reset_annotation_scales: boolean;
  cleanup_proxy_objects: boolean;
  repair_draw_order: boolean;
  regen_viewports: boolean;
  auto_save_close: boolean;
};

type CommandRow = {
  id: string;
  label: string;
  command: string;
  enabled: boolean;
};

type OptimizationPanelProps = {
  commands: CommandRow[];
  setCommands: React.Dispatch<React.SetStateAction<CommandRow[]>>;
  newLabel: string;
  setNewLabel: React.Dispatch<React.SetStateAction<string>>;
  newCommand: string;
  setNewCommand: React.Dispatch<React.SetStateAction<string>>;
  onInjectRules?: (rules: { deepPurge: boolean; purgeRegapps: boolean; overkill: boolean }) => void;
  activeTab?: string;
};

type SaveFilePicker = (options?: {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

declare global {
  interface Window {
    showSaveFilePicker?: SaveFilePicker;
  }
}

const coreOptions: Array<{ key: keyof ScriptFlags; label: string; commandPreview: string }> = [
  { key: 'audit_fix', label: 'Audit & Fix Errors', commandPreview: '_AUDIT / _Y' },
  { key: 'deep_purge', label: 'Deep Purge Junk Items', commandPreview: '_-PURGE / _A / _* / _N' },
  { key: 'purge_regapps', label: 'Purge Regapps (Deep Registry Clean)', commandPreview: '_-PURGE / _R / * / _N' },
  { key: 'overkill', label: 'Delete Duplicate Geometry', commandPreview: '_OVERKILL / _ALL' },
  { key: 'close_tiny_gaps', label: 'Close Tiny Geometric Gaps', commandPreview: 'PEDIT / JOIN / tolerance 0.01' },
  { key: 'inject_pdf_plot_macro', label: 'Inject Quick PDF Plot Macro', commandPreview: '_-PLOT / DWG To PDF.pc3 / A1' },
  { key: 'auto_save_close', label: 'Auto-Save and Close Workspace', commandPreview: '_QSAVE / _CLOSE' },
];

const presetOptions: Array<{ key: keyof ScriptFlags; label: string; commandPreview: string }> = [
  { key: 'flatten_2d_linework', label: 'Flatten 2D Linework', commandPreview: '_FLATTEN / _ALL / _N' },
  { key: 'consolidate_geometry', label: 'Consolidate Geometry', commandPreview: '_OVERKILL / _ALL' },
  { key: 'bind_xrefs', label: 'Bind External References', commandPreview: '_-XREF / _BIND / *' },
  { key: 'normalize_layers', label: 'Normalize Layer States', commandPreview: '_-LAYER / _ON / _THAW / _UNLOCK' },
  { key: 'reset_annotation_scales', label: 'Reset Annotation Scales', commandPreview: '_-SCALELISTEDIT / _R / _Y / _E' },
  { key: 'cleanup_proxy_objects', label: 'Stabilize Proxy Objects', commandPreview: '_PROXYSHOW / _PROXYGRAPHICS' },
  { key: 'repair_draw_order', label: 'Repair Draw Order', commandPreview: '_DRAWORDER / _ALL / _F' },
  { key: 'regen_viewports', label: 'Regenerate All Viewports', commandPreview: '_REGENALL' },
];

function inputClass() {
  return 'w-full rounded-md border border-white/10 bg-[#0c1016] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10';
}

function ToggleRow({
  enabled,
  label,
  commandPreview,
  onToggle,
}: {
  key?: React.Key;
  enabled: boolean;
  label: string;
  commandPreview: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-white/[0.04]"
    >
      <span className={`relative h-5 w-9 shrink-0 rounded-full border transition ${enabled ? 'border-cyan-300/50 bg-cyan-300/25' : 'border-white/10 bg-white/[0.04]'}`}>
        <span className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition ${enabled ? 'left-[18px] bg-cyan-200' : 'left-1 bg-zinc-500'}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="mt-1 block truncate font-mono text-[11px] text-zinc-500">{commandPreview}</span>
      </span>
      {enabled && <CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-300" />}
    </button>
  );
}

function buildPreview(flags: ScriptFlags, enabledCommands: CommandRow[]) {
  const lines = [
    '; ================================================',
    '; ArchiVault Web Suite - Optimize_Project.scr',
    '; Live compiled AutoCAD automation script',
    '; ================================================',
    '',
  ];

  const addBlock = (title: string, commands: string[]) => {
    lines.push(title, ...commands, '');
  };

  if (flags.audit_fix) addBlock('; [1] Audit and Fix Errors', ['_AUDIT', '_Y']);
  if (flags.deep_purge) addBlock('; [2] Deep Purge Junk Items', ['_-PURGE', '_A', '_*', '_N']);
  if (flags.purge_regapps) addBlock('; [3] Purge Regapps - Deep Registry Clean', ['_-PURGE', '_R', '*', '_N']);
  if (flags.flatten_2d_linework) addBlock('; [4] Geometry Flattening Process', ['_FLATTEN', '_ALL', '', '_N']);
  if (flags.overkill || flags.consolidate_geometry) addBlock('; [5] Consolidate Geometry / Overkill', ['_OVERKILL', '_ALL', '']);
  if (flags.bind_xrefs) addBlock('; [6] External Reference Binding', ['_-XREF', '_BIND', '*']);
  if (flags.close_tiny_gaps) addBlock('; [7] Close Tiny Geometric Gaps', ['_PEDIT', '_M', '_ALL', '', '_Y', '_J', '0.01']);
  if (flags.normalize_layers) addBlock('; [8] Layer State Normalization', ['_-LAYER', '_ON', '_*', '_THAW', '_*', '_UNLOCK', '_*']);
  if (flags.reset_annotation_scales) addBlock('; [9] Annotation Scale Cleanup', ['_-SCALELISTEDIT', '_R', '_Y', '_E']);
  if (flags.cleanup_proxy_objects) addBlock('; [10] Proxy Object Display Stabilization', ['_PROXYSHOW', '1', '_PROXYGRAPHICS', '1']);
  if (flags.repair_draw_order) addBlock('; [11] Draw Order Repair', ['_DRAWORDER', '_ALL', '', '_F']);
  if (flags.regen_viewports) addBlock('; [12] Viewport Regeneration', ['_REGENALL']);
  if (flags.inject_pdf_plot_macro) {
    addBlock('; [13] Quick PDF Plot Macro', [
      '_-PLOT',
      '_Y',
      '',
      'DWG To PDF.pc3',
      'ISO full bleed A1 (841.00 x 594.00 MM)',
      '_M',
      '_L',
      '_N',
      '_W',
      '0,0',
      '841,594',
      '_F',
      '_C',
      '_Y',
      'monochrome.ctb',
      '_Y',
      '_A',
      '%USERPROFILE%\\Desktop\\ArchiVault_Quick_Plot.pdf',
      '_N',
      '_Y',
    ]);
  }

  if (enabledCommands.length > 0) {
    lines.push('; [14] Unified Macro Builder Rows');
    enabledCommands.forEach((row) => {
      lines.push(`; ${row.label}`);
      row.command.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => lines.push(line));
      lines.push('');
    });
  }

  if (flags.auto_save_close) addBlock('; [15] Save and Close Workspace', ['_QSAVE', '_CLOSE']);
  return `${lines.join('\n')}\n`;
}

export default function OptimizationPanel({
  commands,
  setCommands,
  newLabel,
  setNewLabel,
  newCommand,
  setNewCommand,
  onInjectRules,
  activeTab = 'automation',
}: OptimizationPanelProps) {
  const [flags, setFlags] = useState<ScriptFlags>({
    deep_purge: true,
    audit_fix: true,
    overkill: true,
    close_tiny_gaps: false,
    flatten_2d_linework: true,
    consolidate_geometry: true,
    bind_xrefs: false,
    purge_regapps: true,
    inject_pdf_plot_macro: false,
    normalize_layers: false,
    reset_annotation_scales: false,
    cleanup_proxy_objects: false,
    repair_draw_order: false,
    regen_viewports: true,
    auto_save_close: true,
  });
  const [isCompiling, setIsCompiling] = useState(false);
  const [error, setError] = useState('');
  const [downloadedAt, setDownloadedAt] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [downloadFileName, setDownloadFileName] = useState(
    activeTab === 'floorplan' ? 'Parametric_Floor_Plan_Base' : 'ArchiVault_Optimization_Routine'
  );

  const enabledCommands = useMemo(() => commands.filter((command) => command.enabled), [commands]);
  const scriptPreview = useMemo(() => buildPreview(flags, enabledCommands), [enabledCommands, flags]);
  const enabledCount = useMemo(() => Object.values(flags).filter(Boolean).length, [flags]);

  function setFlag(key: keyof ScriptFlags) {
    setFlags((current) => ({ ...current, [key]: !current[key] }));
  }

  React.useEffect(() => {
    if (onInjectRules) {
      setFlags((current) => ({
        ...current,
        deep_purge: onInjectRules.deepPurge || current.deep_purge,
        purge_regapps: onInjectRules.purgeRegapps || current.purge_regapps,
        overkill: onInjectRules.overkill || current.overkill,
      }));
    }
  }, [onInjectRules]);

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

  function buildPayload() {
    return {
      ...flags,
      custom_commands: enabledCommands.map((command) => command.command),
    };
  }

  function sanitizeFileName(input: string): string {
    return input
      .replace(/[\s\-\.]+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .substring(0, 255)
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'ArchiVault_Automation';
  }

  function getActiveRules(): { key: string; label: string }[] {
    return Object.entries(flags)
      .filter(([, value]) => value)
      .map(([key]) => {
        const option = [...coreOptions, ...presetOptions].find((o) => o.key === key);
        return {
          key,
          label: option?.label || key,
        };
      });
  }

  async function downloadScript() {
    setIsCompiling(true);
    setError('');
    setDownloadedAt('');
    setShowToast(false);

    try {
      const response = await fetch(`${API_BASE}/api/v1/autocad/generate-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });

      if (!response.ok) throw new Error(await response.text());

      const blob = new Blob([await response.arrayBuffer()], { type: 'application/zip' });
      const sanitized = sanitizeFileName(downloadFileName);
      const finalFileName = `${sanitized}.zip`;

      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: finalFileName,
          types: [{ description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = finalFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      setDownloadedAt(new Date().toLocaleTimeString());
      setShowToast(true);
      setTimeout(() => setShowToast(false), 5000);
    } catch (compileError) {
      if (compileError instanceof DOMException && compileError.name === 'AbortError') {
        setError('Save was canceled. Click Download Script when you are ready to choose a folder.');
      } else {
        setError(compileError instanceof Error ? compileError.message : 'Script download failed.');
      }
    } finally {
      setIsCompiling(false);
    }
  }

  return (
    <section className="grid h-[calc(100vh-220px)] min-h-[680px] gap-4 overflow-hidden xl:grid-cols-[0.82fr_1fr_1.14fr]">
      <div className="min-h-0 rounded-lg border border-white/10 bg-white/[0.03]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Core Optimizations & Presets</h3>
            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">{enabledCount} modules active</p>
          </div>
          <SlidersHorizontal className="h-5 w-5 text-cyan-300" />
        </div>
        <div className="h-[calc(100%-62px)] overflow-y-auto p-3 [scrollbar-color:rgba(34,211,238,0.45)_rgba(255,255,255,0.06)] [scrollbar-width:thin]">
          <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Standard Checklist</p>
          <div className="space-y-1">
            {coreOptions.map((option) => {
              const rowKey = option.key;
              return (
                <ToggleRow
                  key={rowKey}
                  enabled={flags[rowKey]}
                  label={option.label}
                  commandPreview={option.commandPreview}
                  onToggle={() => setFlag(rowKey)}
                />
              );
            })}
          </div>
          <p className="px-2 pb-2 pt-5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Rendering Presets</p>
          <div className="space-y-1">
            {presetOptions.map((option) => {
              const rowKey = option.key;
              return (
                <ToggleRow
                  key={rowKey}
                  enabled={flags[rowKey]}
                  label={option.label}
                  commandPreview={option.commandPreview}
                  onToggle={() => setFlag(rowKey)}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="min-h-0 rounded-lg border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Unified Macro Builder</h3>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">Dynamic command table</p>
        </div>
        <div className="flex h-[calc(100%-62px)] flex-col gap-3 p-3">
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 [scrollbar-color:rgba(34,211,238,0.45)_rgba(255,255,255,0.06)] [scrollbar-width:thin]">
            {commands.map((command) => (
              <div key={command.id} className="flex items-start gap-3 rounded-md bg-[#0c1016] p-3">
                <input
                  type="checkbox"
                  checked={command.enabled}
                  onChange={() => setCommands((current) => current.map((item) => item.id === command.id ? { ...item, enabled: !item.enabled } : item))}
                  className="mt-1 h-4 w-4 accent-cyan-300"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{command.label}</p>
                  <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-zinc-500">{command.command}</pre>
                </div>
                <button className="rounded p-1 text-zinc-500 hover:bg-red-400/10 hover:text-red-300" onClick={() => setCommands((current) => current.filter((item) => item.id !== command.id))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={addCommand} className="rounded-md bg-[#0c1016] p-3">
            <div className="grid gap-2">
              <label>
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Command Label</span>
                <input className={inputClass()} value={newLabel} onChange={(event) => setNewLabel(event.target.value)} />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Raw AutoCAD Commands</span>
                <textarea className={`${inputClass()} min-h-[88px] resize-none font-mono text-xs leading-5`} value={newCommand} onChange={(event) => setNewCommand(event.target.value)} />
              </label>
            </div>
            <button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]" type="submit">
              <Plus className="h-4 w-4" />
              Add Row
            </button>
          </form>
        </div>
      </div>

      <div className="relative min-h-0 rounded-lg border border-white/10 bg-[#080a0d]">
        <div className="absolute right-3 top-3 z-10">
          <button
            onClick={downloadScript}
            disabled={isCompiling}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-zinc-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isCompiling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download Script
          </button>
        </div>
        <div className="border-b border-white/10 px-4 py-3 pr-44">
          <div className="mb-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-amber-300/70 mb-2">
              📝 Guide: Provide a name to identify this optimization batch or blueprint model layout before triggering the final execution build.
            </p>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <TerminalSquare className="h-4 w-4 text-cyan-300" />
            <input
              type="text"
              value={downloadFileName}
              onChange={(e) => setDownloadFileName(e.target.value)}
              className="flex-1 bg-[#0c1016] border border-white/10 rounded px-3 py-1.5 text-sm font-mono text-cyan-100 focus:border-cyan-300/50 focus:outline-none focus:ring-1 focus:ring-cyan-300/20 transition"
              placeholder="Enter filename..."
            />
            <span className="text-[11px] text-zinc-500">.zip</span>
          </div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{enabledCommands.length} macro rows enabled</p>
        </div>
        <pre className="h-[calc(100%-62px)] overflow-auto p-4 font-mono text-xs leading-6 text-emerald-300 [scrollbar-color:rgba(34,211,238,0.45)_rgba(255,255,255,0.06)] [scrollbar-width:thin]">{scriptPreview}</pre>

        {/* Workflow Guide Alert */}
        <div className="absolute bottom-52 left-3 right-3 rounded-md border border-amber-300/30 bg-amber-300/5 px-3 py-2 backdrop-blur">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-300 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200">
              💡 Workflow Guide: Extract the downloaded archive container and drop the generated .scr file directly into the middle of your active AutoCAD drawing canvas to execute the cleaning pipeline automatically.
            </p>
          </div>
        </div>

        {/* Success Toast */}
        {showToast && (
          <div className="absolute bottom-3 left-3 right-3 rounded-md border border-emerald-300/40 bg-emerald-950/80 px-4 py-3 backdrop-blur animate-in slide-in-from-bottom-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="h-4 w-4 text-emerald-300" />
                  <p className="text-sm font-semibold text-emerald-100">Script Successfully Compiled!</p>
                </div>
                <div className="text-xs text-emerald-200/80 ml-6">
                  <p className="font-medium mb-1 text-emerald-200">Active optimizations in this bundle:</p>
                  <div className="space-y-0.5 max-h-40 overflow-y-auto">
                    {getActiveRules().map((rule) => (
                      <div key={rule.key} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-emerald-300 shrink-0" />
                        <span>{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowToast(false)}
                className="text-emerald-300 hover:text-emerald-200 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {(downloadedAt || error) && !showToast && (
          <div className="absolute bottom-3 left-3 right-3 rounded-md border border-white/10 bg-[#0c1016]/95 px-3 py-2 backdrop-blur">
            {downloadedAt && <p className="text-xs text-cyan-100">{sanitizeFileName(downloadFileName)}.zip downloaded at {downloadedAt}. Extract and drag the `.scr` file into AutoCAD to run it.</p>}
            {error && <p className="text-xs text-red-200">{error}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
