import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, HardDriveDownload, Loader2, TerminalSquare } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

type ScriptFlags = {
  deep_purge: boolean;
  audit_fix: boolean;
  overkill: boolean;
  close_tiny_gaps: boolean;
  auto_save_close: boolean;
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

type DragModal = {
  mode: 'saved' | 'downloaded';
  title: string;
  location: string;
  detail: string;
};

declare global {
  interface Window {
    showSaveFilePicker?: SaveFilePicker;
  }
}

const optimizationOptions: Array<{
  key: keyof ScriptFlags;
  label: string;
  commandPreview: string;
}> = [
  {
    key: 'deep_purge',
    label: 'Deep Purge Junk Items',
    commandPreview: '_-PURGE / _A / _* / _N',
  },
  {
    key: 'audit_fix',
    label: 'Audit & Fix Errors',
    commandPreview: '_AUDIT / _Y',
  },
  {
    key: 'overkill',
    label: 'Delete Duplicate Geometry',
    commandPreview: '_OVERKILL / _ALL',
  },
  {
    key: 'close_tiny_gaps',
    label: 'Close Tiny Geometric Gaps',
    commandPreview: 'PEDIT / JOIN / tolerance 0.01',
  },
  {
    key: 'auto_save_close',
    label: 'Auto-Save and Close Workspace',
    commandPreview: '_QSAVE / _CLOSE',
  },
];

function checkboxClass(enabled: boolean) {
  return `flex items-start gap-3 rounded-md border p-4 text-left transition ${
    enabled
      ? 'border-cyan-300/40 bg-cyan-300/10'
      : 'border-white/10 bg-[#11151b] hover:border-white/20'
  }`;
}

export default function OptimizationPanel() {
  const [flags, setFlags] = useState<ScriptFlags>({
    deep_purge: true,
    audit_fix: true,
    overkill: true,
    close_tiny_gaps: false,
    auto_save_close: true,
  });
  const [customInjection, setCustomInjection] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [error, setError] = useState('');
  const [compiledAt, setCompiledAt] = useState('');
  const [savedPath, setSavedPath] = useState('');
  const [downloadedAt, setDownloadedAt] = useState('');
  const [dragModal, setDragModal] = useState<DragModal | null>(null);

  const enabledCount = useMemo(
    () => Object.values(flags).filter(Boolean).length,
    [flags],
  );

  function buildPayload() {
    const custom_commands = customInjection
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return { ...flags, custom_commands };
  }

  async function downloadScript() {
    setIsCompiling(true);
    setError('');
    setDownloadedAt('');
    setDragModal(null);

    try {
      const response = await fetch(`${API_BASE}/api/v1/autocad/generate-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });

      if (!response.ok) throw new Error(await response.text());

      const blob = await response.blob();
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'Custom_ArchiVault_Clean.scr',
          types: [
            {
              description: 'AutoCAD Script',
              accept: { 'text/plain': ['.scr'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        const savedTime = new Date().toLocaleTimeString();
        setDownloadedAt(savedTime);
        setDragModal({
          mode: 'saved',
          title: 'AutoCAD script is ready',
          location: 'the folder you selected in the Save dialog',
          detail: 'Open that folder, then drag Custom_ArchiVault_Clean.scr directly into AutoCAD.',
        });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Custom_ArchiVault_Clean.scr';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        const downloadedTime = new Date().toLocaleTimeString();
        setDownloadedAt(downloadedTime);
        setDragModal({
          mode: 'downloaded',
          title: 'AutoCAD script download started',
          location: 'your Downloads folder',
          detail: 'If the browser warns about .scr, choose Keep for this locally generated plain-text AutoCAD script, then drag it into AutoCAD.',
        });
      }
    } catch (compileError) {
      if (compileError instanceof DOMException && compileError.name === 'AbortError') {
        setError('Save was canceled. Click Compile & Download Script when you are ready to choose a folder.');
      } else {
        setError(compileError instanceof Error ? compileError.message : 'Script download failed.');
      }
    } finally {
      setIsCompiling(false);
    }
  }

  async function saveScriptToDesktop() {
    setIsCompiling(true);
    setError('');
    setSavedPath('');
    setDragModal(null);

    try {
      const response = await fetch(`${API_BASE}/api/v1/autocad/save-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });

      if (!response.ok) throw new Error(await response.text());

      const result = await response.json();
      setSavedPath(result.script_path);
      setCompiledAt(new Date().toLocaleTimeString());
      setDragModal({
        mode: 'saved',
        title: 'Desktop script is ready',
        location: result.script_path,
        detail: 'Find this file on your Desktop, then drag Custom_ArchiVault_Clean.scr directly into AutoCAD.',
      });
    } catch (compileError) {
      setError(compileError instanceof Error ? compileError.message : 'Script compilation failed.');
    } finally {
      setIsCompiling(false);
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">AutoCAD Optimization Checklist</h3>
            <p className="mt-1 text-sm text-zinc-400">{enabledCount} cleanup modules selected</p>
          </div>
          <TerminalSquare className="h-5 w-5 text-cyan-300" />
        </div>

        <div className="space-y-3">
          {optimizationOptions.map((option) => {
            const enabled = flags[option.key];
            return (
              <label key={option.key} className={checkboxClass(enabled)}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => setFlags((current) => ({ ...current, [option.key]: !current[option.key] }))}
                  className="mt-1 h-4 w-4 accent-cyan-300"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-white">{option.label}</span>
                  <span className="mt-1 block font-mono text-[11px] text-zinc-500">{option.commandPreview}</span>
                </span>
                {enabled && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />}
              </label>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-[#080a0d]">
        <div className="border-b border-white/10 p-5">
          <h3 className="text-base font-semibold text-white">Custom Injection</h3>
          <p className="mt-1 text-sm text-zinc-400">Append raw AutoCAD commands line-by-line after the selected cleanup modules.</p>
        </div>

        <div className="p-5">
          <textarea
            value={customInjection}
            onChange={(event) => setCustomInjection(event.target.value)}
            rows={11}
            spellCheck={false}
            placeholder={'_REGENALL\n_ZOOM\n_EXTENTS'}
            className="min-h-[260px] w-full resize-y rounded-md border border-white/10 bg-[#11151b] px-3 py-3 font-mono text-xs leading-6 text-emerald-200 outline-none transition placeholder:text-zinc-700 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10"
          />

          <button
            onClick={downloadScript}
            disabled={isCompiling}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isCompiling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Compile & Download Script
          </button>

          <button
            onClick={saveScriptToDesktop}
            disabled={isCompiling}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isCompiling ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDriveDownload className="h-4 w-4" />}
            Save Copy to Desktop
          </button>

          {downloadedAt && (
            <div className="mt-3 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 py-2">
              <p className="text-xs font-medium text-cyan-100">Downloaded Custom_ArchiVault_Clean.scr at {downloadedAt}</p>
              <p className="mt-1 text-[11px] leading-5 text-cyan-200">Use the downloaded `.scr` file for drag-and-drop into AutoCAD. If Windows warns about `.scr`, choose keep because this file is plain AutoCAD script text generated locally.</p>
            </div>
          )}

          {savedPath && (
            <div className="mt-3 rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-2">
              <p className="text-xs font-medium text-emerald-200">Saved AutoCAD script file (.scr) at {compiledAt}</p>
              <p className="mt-1 break-all font-mono text-[11px] text-emerald-300">{savedPath}</p>
            </div>
          )}
          {error && <p className="mt-3 rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</p>}
        </div>
      </div>
      {dragModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-lg border border-cyan-300/30 bg-[#080a0d] shadow-2xl shadow-cyan-950/30">
            <div className="border-b border-white/10 p-5">
              <p className="text-lg font-semibold text-white">{dragModal.title}</p>
              <p className="mt-1 text-sm text-zinc-400">Custom_ArchiVault_Clean.scr</p>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-cyan-200">File location</p>
                <p className="mt-2 break-all font-mono text-xs leading-5 text-cyan-50">{dragModal.location}</p>
              </div>
              <ol className="space-y-3 text-sm leading-6 text-zinc-300">
                <li className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">1. Locate `Custom_ArchiVault_Clean.scr`.</li>
                <li className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">2. Open your drawing in AutoCAD.</li>
                <li className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">3. Drag the `.scr` file onto the AutoCAD window to run the optimizer.</li>
              </ol>
              <p className="text-xs leading-5 text-zinc-500">{dragModal.detail}</p>
              <button
                onClick={() => setDragModal(null)}
                className="w-full rounded-md bg-cyan-300 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-200"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
