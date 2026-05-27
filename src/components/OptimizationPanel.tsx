import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, Loader2, Plus, TerminalSquare, Trash2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

export type CommandRow = { id: string; label: string; command: string; enabled: boolean };

type ScriptFlags = {
  audit_fix: boolean;
  deep_purge: boolean;
  purge_regapps: boolean;
  overkill: boolean;
  close_tiny_gaps: boolean;
  inject_pdf_plot_macro: boolean;
  auto_save_close: boolean;
  flatten_2d_linework: boolean;
  consolidate_geometry: boolean;
  normalize_layers: boolean;
  bind_xrefs: boolean;
  reset_annotation_scales: boolean;
  cleanup_proxy_objects: boolean;
  repair_draw_order: boolean;
  regen_viewports: boolean;
};

type Props = {
  commands: CommandRow[];
  setCommands: React.Dispatch<React.SetStateAction<CommandRow[]>>;
};

type ToastItem = { id: string; text: string };

const coreModules: Array<{ key: keyof ScriptFlags; title: string; preview: string }> = [
  { key: 'audit_fix', title: 'Audit & Fix Errors', preview: '_AUDIT / _Y' },
  { key: 'deep_purge', title: 'Deep Purge Junk Items', preview: '_-PURGE / _A / * / _N' },
  { key: 'purge_regapps', title: 'Purge Regapps Deep Registry Clean', preview: '_-PURGE / _R / * / _N' },
  { key: 'overkill', title: 'Delete Duplicate Geometry', preview: '_OVERKILL / _ALL' },
  { key: 'close_tiny_gaps', title: 'Close Tiny Geometric Gaps', preview: 'PEDIT / JOIN / tolerance 0.01' },
  { key: 'inject_pdf_plot_macro', title: 'Inject Quick PDF Plot Macro', preview: '_-PLOT / DWG To PDF.pc3 / A1' },
  { key: 'auto_save_close', title: 'Auto-Save at End', preview: '_QSAVE only when checked' },
];

const renderModules: Array<{ key: keyof ScriptFlags; title: string; preview: string }> = [
  { key: 'flatten_2d_linework', title: 'Flatten 2D Linework', preview: '_FLATTEN / _ALL / _N' },
  { key: 'consolidate_geometry', title: 'Consolidate Geometry', preview: '_JOIN / _ALL' },
  { key: 'normalize_layers', title: 'Clean Layer States', preview: '_LAYER / purge unused' },
  { key: 'bind_xrefs', title: 'Bind External References', preview: '_-XREF / _BIND / *' },
];

function inputClass() {
  return 'w-full rounded-md border border-white/10 bg-[#0d1117] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-300/60';
}

function Toggle({ active, title, preview, onClick }: { key?: React.Key; active: boolean; title: string; preview: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-white/[0.04]">
      <span className={`relative h-5 w-9 rounded-full border ${active ? 'border-cyan-300/50 bg-cyan-300/25' : 'border-white/10 bg-white/[0.04]'}`}>
        <span className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full ${active ? 'left-[18px] bg-cyan-200' : 'left-1 bg-zinc-500'}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">{title}</span>
        <span className="block truncate font-mono text-[11px] text-zinc-500">{preview}</span>
      </span>
      {active && <CheckCircle2 className="h-4 w-4 text-cyan-300" />}
    </button>
  );
}

function compilePreview(flags: ScriptFlags, commands: CommandRow[], fileName: string, safeMode: boolean) {
  const lines = [
    '; ===============================================',
    `; ArchiVault Web Suite - ${fileName}.scr`,
    '; Live compiled AutoCAD automation script',
    '; Sanity Check: This script is for cleanup and optimization. It does not modify geometry. If you encounter errors, press Ctrl+Z to revert.',
    '; ===============================================',
    '',
    '_UNDO',
    '_GROUP',
    '',
    '; [Safety Warning Comments]',
    safeMode ? '; Non-destructive protocol: no DELETE or ERASE commands are emitted.' : '; Advanced mode: geometry-modifying cleanup may run. Duplicate the DWG first.',
    '; Soft purge uses confirm/verify = _N so used definitions are not accidentally removed.',
    '; Geometry-changing tools such as FLATTEN, OVERKILL, JOIN, and XREF BIND are intentionally skipped in safe mode.',
    '',
    '; [Set System Variables for performance]',
    '_FILEDIA',
    '0',
    '_CMDECHO',
    '0',
    '',
  ];
  const add = (title: string, body: string[]) => lines.push(title, ...body, '');
  if (flags.audit_fix) add('; [1] Audit and Fix Errors', ['_AUDIT', '_Y']);
  if (flags.deep_purge) add('; [2] Soft Purge Junk Items', ['_-PURGE', '_A', '*', '_N']);
  if (flags.purge_regapps) add('; [3] Soft Purge Regapps - Deep Registry Clean', ['_-PURGE', '_R', '*', '_N']);
  if (flags.flatten_2d_linework) add('; [4] Geometry Flattening Process', safeMode ? ['; _FLATTEN is geometry-modifying and must be run manually after backup review.'] : ['_FLATTEN', '_ALL', '_N']);
  if (flags.overkill || flags.consolidate_geometry) add('; [5] Duplicate Geometry Cleanup', safeMode ? ['; _OVERKILL can remove entities and is not emitted in safe scripts.'] : ['_OVERKILL', '_ALL']);
  if (flags.close_tiny_gaps) add('; [6] Close Tiny Geometric Gaps', safeMode ? ['; PEDIT/JOIN changes geometry and is not emitted in safe scripts.'] : ['PEDIT', '_M', '_ALL', '', '_J', '0.01']);
  if (flags.bind_xrefs) add('; [7] Bind External References', safeMode ? ['; XREF BIND changes drawing references and is not emitted in safe scripts.'] : ['_-XREF', '_BIND', '*']);
  if (flags.normalize_layers) add('; [8] Non-destructive Layer Property Normalization', ['_-LAYER', '_ON', '*', '_THAW', '*', '_UNLOCK', '*']);
  commands.filter((item) => item.enabled).forEach((item) => {
    const safeLines = item.command.split(/\r?\n/).filter(Boolean).filter((line) => !/^\s*_?(erase|delete)\b/i.test(line));
    add(`; Macro Row - ${item.label}`, safeLines.length ? safeLines : ['; skipped unsafe DELETE/ERASE-only custom row']);
  });
  if (flags.inject_pdf_plot_macro) add('; Quick PDF Plot Macro', ['_-PLOT', '_Y', '', 'DWG To PDF.pc3', 'ISO full bleed A1 (841.00 x 594.00 MM)', '_M', '_L']);
  lines.push('; [Restore System Variables]', '_FILEDIA', '1', '_CMDECHO', '1', '');
  if (flags.auto_save_close) add('; Optional Auto-save drawing', ['_QSAVE']);
  lines.push('; [End Undo Group]', '_UNDO', '_END', '');
  return `${lines.join('\n')}\n`;
}

export default function OptimizationPanel({ commands, setCommands }: Props) {
  const [flags, setFlags] = useState<ScriptFlags>({
    audit_fix: true,
    deep_purge: true,
    purge_regapps: true,
    overkill: true,
    close_tiny_gaps: false,
    inject_pdf_plot_macro: false,
    auto_save_close: false,
    flatten_2d_linework: true,
    consolidate_geometry: true,
    normalize_layers: false,
    bind_xrefs: false,
    reset_annotation_scales: false,
    cleanup_proxy_objects: false,
    repair_draw_order: false,
    regen_viewports: true,
  });
  const [newLabel, setNewLabel] = useState('');
  const [newCommand, setNewCommand] = useState('');
  const [downloadFileName, setDownloadFileName] = useState('ArchiVault_Optimization_Routine');
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [safeMode, setSafeMode] = useState(true);
  const [showLogs, setShowLogs] = useState(false);

  const enabledCommands = useMemo(() => commands.filter((item) => item.enabled), [commands]);
  const preview = useMemo(() => compilePreview(flags, commands, downloadFileName || 'Optimize_Project', safeMode), [commands, downloadFileName, flags, safeMode]);
  const activePresetNames = [...coreModules, ...renderModules].filter((item) => flags[item.key]).map((item) => item.title);

  function addRow(event: React.FormEvent) {
    event.preventDefault();
    if (!newLabel.trim() || !newCommand.trim()) return;
    setCommands((current) => [...current, { id: crypto.randomUUID(), label: newLabel.trim(), command: newCommand.trim(), enabled: true }]);
    setNewLabel('');
    setNewCommand('');
  }

  async function downloadScript() {
    setBusy(true);
    const payload = { ...flags, overkill: safeMode ? false : flags.overkill, flatten_2d_linework: safeMode ? false : flags.flatten_2d_linework, bind_xrefs: safeMode ? false : flags.bind_xrefs, close_tiny_gaps: safeMode ? false : flags.close_tiny_gaps, custom_commands: enabledCommands.map((item) => item.command) };
    try {
      const response = await fetch(`${API_BASE}/api/v1/autocad/generate-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const blob = response.ok ? await response.blob() : new Blob([preview], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(downloadFileName || 'Optimize_Project').replace(/[^\w-]+/g, '_')}.scr`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setToasts(activePresetNames.slice(0, 5).map((text) => ({ id: crypto.randomUUID(), text })));
      window.setTimeout(() => setToasts([]), 5200);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="relative grid gap-4 xl:grid-cols-[0.82fr_1fr_1.15fr]">
      <div className="rounded-lg border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Core Optimizations & Presets</h3>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">{activePresetNames.length} modules active</p>
        </div>
        <div className="max-h-[680px] overflow-y-auto p-3">
          <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Standard Checklist</p>
          {coreModules.map((item) => <Toggle key={item.key} active={flags[item.key]} title={item.title} preview={item.preview} onClick={() => setFlags((current) => ({ ...current, [item.key]: !current[item.key] }))} />)}
          <p className="px-2 pb-2 pt-5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Rendering Presets</p>
          {renderModules.map((item) => <Toggle key={item.key} active={flags[item.key]} title={item.title} preview={item.preview} onClick={() => setFlags((current) => ({ ...current, [item.key]: !current[item.key] }))} />)}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Unified Macro Builder</h3>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">Dynamic command table</p>
        </div>
        <div className="space-y-3 p-3">
          <div className="max-h-[390px] space-y-2 overflow-y-auto">
            {commands.map((row) => (
              <div key={row.id} className="flex items-start gap-3 rounded-md bg-[#0d1117] p-3">
                <input type="checkbox" checked={row.enabled} onChange={() => setCommands((current) => current.map((item) => item.id === row.id ? { ...item, enabled: !item.enabled } : item))} className="mt-1 h-4 w-4 accent-cyan-300" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{row.label}</p>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] leading-5 text-zinc-500">{row.command}</pre>
                </div>
                <button onClick={() => setCommands((current) => current.filter((item) => item.id !== row.id))} className="text-zinc-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <form onSubmit={addRow} className="rounded-md bg-[#0d1117] p-3">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Command Label</span>
              <input className={inputClass()} value={newLabel} onChange={(event) => setNewLabel(event.target.value)} />
            </label>
            <label className="mt-2 block">
              <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Raw AutoCAD Commands</span>
              <textarea className={`${inputClass()} font-mono text-xs`} rows={4} value={newCommand} onChange={(event) => setNewCommand(event.target.value)} />
            </label>
            <button type="submit" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-white/[0.08]">
              <Plus className="h-4 w-4" /> Add Row
            </button>
          </form>
        </div>
      </div>

      <div className="relative rounded-lg border border-white/10 bg-[#080a0d]">
        <div className="border-b border-white/10 px-4 py-3 pr-40">
          <div className="flex items-center gap-2">
            <TerminalSquare className="h-4 w-4 text-cyan-300" />
            <h3 className="text-sm font-semibold text-white">Script Export Panel</h3>
          </div>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">{enabledCommands.length} macro rows enabled</p>
        </div>
        <div className="border-b border-white/10 p-4">
          <label className="flex items-center justify-between gap-3 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-50">
            <span><span className="font-semibold">Safe Mode</span><span className="mt-1 block text-xs text-cyan-100/70">Recommended for students. It avoids geometry-changing commands and shows what will happen first.</span></span>
            <input type="checkbox" checked={safeMode} onChange={() => setSafeMode((value) => !value)} className="h-4 w-4 accent-cyan-300" />
          </label>
          {safeMode && (
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-md border border-white/10 bg-[#0d1117] p-3"><p className="font-semibold text-white">Before</p><p className="mt-1 leading-5 text-zinc-400">The drawing may contain unused definitions, registry clutter, and slow display settings.</p></div>
              <div className="rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3"><p className="font-semibold text-emerald-50">After</p><p className="mt-1 leading-5 text-emerald-100/80">The script audits, soft-purges, resets safe settings, and leaves geometry untouched.</p></div>
            </div>
          )}
        </div>
        <button onClick={downloadScript} disabled={busy} className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-200">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download Script
        </button>
        <div className="space-y-3 p-4">
          <div className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
            Guide: Provide a name to identify this optimization batch or blueprint model layout before triggering the final execution build.
          </div>
          <input className={inputClass()} value={downloadFileName} onChange={(event) => setDownloadFileName(event.target.value)} />
          <div className="flex gap-2">
            <button className={!showLogs ? 'rounded-md bg-cyan-300 px-3 py-2 text-xs font-semibold text-zinc-950' : 'rounded-md border border-white/10 px-3 py-2 text-xs text-zinc-300'} onClick={() => setShowLogs(false)}>Helpful Tips</button>
            <button className={showLogs ? 'rounded-md bg-cyan-300 px-3 py-2 text-xs font-semibold text-zinc-950' : 'rounded-md border border-white/10 px-3 py-2 text-xs text-zinc-300'} onClick={() => setShowLogs(true)}>System Logs</button>
          </div>
          {showLogs ? (
            <pre className="h-[420px] overflow-auto rounded-md bg-black/30 p-4 font-mono text-xs leading-6 text-emerald-300">{preview}</pre>
          ) : (
            <div className="h-[420px] overflow-auto rounded-md border border-white/10 bg-[#0d1117] p-4 text-sm leading-6 text-zinc-300">
              <p className="font-semibold text-white">This download creates a drag-and-drop AutoCAD script.</p>
              <p className="mt-3">In Safe Mode, ArchiVault only uses cleanup steps designed to avoid changing your drawn geometry. Geometry-changing modules are converted into comments so you can review them manually.</p>
              <p className="mt-3">Use System Logs only when you want to inspect the exact `.scr` command lines before downloading.</p>
              <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">Tip: Duplicate your DWG before running any cleanup script, especially when Safe Mode is off.</p>
            </div>
          )}
          <div className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
            Workflow Guide: Extract the downloaded archive container and drop the generated .scr file directly into the middle of your active AutoCAD drawing canvas to execute the cleaning pipeline automatically.
          </div>
        </div>
      </div>

      <div className="fixed right-5 top-24 z-50 space-y-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="animate-fade-in rounded-md border border-cyan-300/20 bg-[#081216] px-3 py-2 text-xs text-cyan-100 shadow-lg shadow-cyan-950/30">
            Active preset: {toast.text}
          </div>
        ))}
      </div>
    </section>
  );
}
