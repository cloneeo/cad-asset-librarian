import React, { useMemo, useRef, useState } from 'react';
import { Box, CheckCircle2, Download, FileCode2, Layers3, ScanLine, Sparkles, UploadCloud, XCircle } from 'lucide-react';

type ElevationKey = 'front' | 'rear' | 'left' | 'right' | 'roof' | 'perspective';

const elevationOptions: Array<{ key: ElevationKey; label: string; scene: string; file: string }> = [
  { key: 'front', label: 'Front Elevation', scene: 'SKP_ELEV_FRONT', file: 'front_elevation_1-100.png' },
  { key: 'rear', label: 'Rear Elevation', scene: 'SKP_ELEV_REAR', file: 'rear_elevation_1-100.png' },
  { key: 'left', label: 'Left Side Elevation', scene: 'SKP_ELEV_LEFT', file: 'left_elevation_1-100.png' },
  { key: 'right', label: 'Right Side Elevation', scene: 'SKP_ELEV_RIGHT', file: 'right_elevation_1-100.png' },
  { key: 'roof', label: 'Roof Plan View', scene: 'SKP_ROOF_PLAN', file: 'roof_plan_1-100.png' },
  { key: 'perspective', label: 'Perspective Reference View', scene: 'SKP_PERSPECTIVE_REF', file: 'perspective_reference_1-100.png' },
];

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

function inputClass() {
  return 'w-full rounded-md border border-white/10 bg-[#11151b] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10';
}

function downloadText(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ViewSetupPreview({ sectionDirection, selectedViews }: { sectionDirection: string; selectedViews: Record<ElevationKey, boolean> }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#080a0d] p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white">View Setup Preview</h3>
        <p className="mt-1 text-xs text-zinc-500">Elevation arrows, center cut line, and section direction guide.</p>
      </div>
      <div className="relative aspect-[1.2/1] rounded-md border border-white/10 bg-[#11151b] p-8">
        <div className="absolute inset-8 rounded-sm border-2 border-cyan-300/70 bg-cyan-300/5">
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 border-l-2 border-dashed border-amber-300" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 rounded bg-amber-300 px-2 py-1 text-[10px] font-semibold text-zinc-950">SECTION A-A</div>
          {selectedViews.front && <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-semibold text-cyan-200">Front {'->'}</div>}
          {selectedViews.rear && <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-semibold text-cyan-200">Rear {'->'}</div>}
          {selectedViews.left && <div className="absolute -left-12 top-1/2 -translate-y-1/2 text-xs font-semibold text-cyan-200">Left</div>}
          {selectedViews.right && <div className="absolute -right-12 top-1/2 -translate-y-1/2 text-xs font-semibold text-cyan-200">Right</div>}
          <div className="absolute right-3 top-3 rounded border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-zinc-300">{sectionDirection}</div>
        </div>
      </div>
    </div>
  );
}

type LagFlags = {
  audit: boolean;
  purge: boolean;
  regapp: boolean;
  overkill: boolean;
  flatten: boolean;
  scalelist: boolean;
  dgn: boolean;
  qsave: boolean;
  close: boolean;
};

type AutoCadHealthFile = {
  name: string;
  path: string;
  type: 'DWG' | 'DXF';
  sizeMb: number;
  modified: string;
  mode: string;
};

type AutoCadCleanupFlags = {
  audit: boolean;
  purge: boolean;
  regapp: boolean;
  overkill: boolean;
  scalelist: boolean;
  xrefNote: boolean;
  hatchNote: boolean;
  flatten: boolean;
  saveCopy: boolean;
};

function safeCopy(text: string) {
  void navigator.clipboard?.writeText(text);
}

function countDxfEntity(text: string, entity: string) {
  return (text.match(new RegExp(`\\n\\s*0\\s*\\n\\s*${entity}\\s*\\n`, 'gi')) ?? []).length;
}

function riskTone(value: number, warning: number, critical: number) {
  if (value >= critical) return 'border-red-300/30 bg-red-300/10 text-red-100';
  if (value >= warning) return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
  return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100';
}

function ScriptCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{subtitle}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function SketchUpScriptSuite() {
  const [elev, setElev] = useState({
    width: 12,
    length: 10,
    height: 6,
    floors: 2,
    floorHeight: 3,
    front: 'South',
    scale: '1:100',
    format: 'png',
  });
  const [elevViews, setElevViews] = useState<Record<ElevationKey, boolean>>({ front: true, rear: true, left: true, right: true, roof: true, perspective: false });
  const [section, setSection] = useState({ type: 'Longitudinal Section', position: 'Centerline', direction: 'North-South', cuts: 2, naming: 'AA / BB / CC', floors: 'All floors', furniture: false, structure: true });
  const [wall, setWall] = useState({ wallHeight: 3000, wallThickness: 150, floorHeight: 3000, floors: 2, doorHeight: 2100, sill: 900, head: 2100 });
  const scenes = elevationOptions.filter((item) => elevViews[item.key]);
  const exportNames = scenes.map((item) => item.file.replace('1-100', elev.scale.replace(':', '-')).replace('.png', `.${elev.format}`));
  const elevationScript = [
    '# ArchiVault Auto Elevation Generator',
    '# Non-destructive SketchUp Ruby guide: creates scenes/pages and view notes only.',
    'model = Sketchup.active_model',
    'pages = model.pages',
    'view = model.active_view',
    'model.start_operation("ArchiVault Auto Elevation Setup", true)',
    'view.camera.perspective = false if view.camera.respond_to?(:perspective=)',
    `# Model envelope: ${elev.width}m W x ${elev.length}m L x ${elev.height}m H`,
    `# Building front direction: ${elev.front}`,
    `scene_names = [${scenes.map((item) => `"${item.scene}"`).join(', ')}]`,
    'scene_names.each do |scene_name|',
    '  page = pages.add(scene_name)',
    '  page.use_camera = true',
    '  page.use_rendering_options = true',
    '  page.update',
    'end',
    'model.commit_operation',
    'UI.messagebox("ArchiVault elevation setup scenes created. Review cameras before export.")',
    '',
  ].join('\n');
  const sectionNames = ['SKP_SECTION_AA', 'SKP_SECTION_BB', 'SKP_SECTION_CC', 'SKP_STAIR_SECTION', 'SKP_WALL_SECTION'].slice(0, Math.max(1, Math.min(section.cuts, 5)));
  const sectionGuide = [
    '# ArchiVault Auto Section Generator',
    '# Non-destructive guide: creates section scene placeholders and comments only.',
    `# Section type: ${section.type}`,
    `# Section line position: ${section.position}`,
    `# Cut direction: ${section.direction}`,
    `# Floors to show: ${section.floors}`,
    `# Include furniture: ${section.furniture ? 'yes' : 'no'}`,
    `# Structure only: ${section.structure ? 'yes' : 'no'}`,
    'model = Sketchup.active_model',
    'pages = model.pages',
    sectionNames.map((name) => `pages.add("${name}") unless pages[name]`).join('\n'),
    '# Reminder: enable section fill, use Hidden Line style, align camera perpendicular to cut plane.',
    '',
  ].join('\n');
  const wallGuide = [
    'Wall Extrusion Planner',
    `Wall height: ${wall.wallHeight}mm`,
    `Wall thickness: ${wall.wallThickness}mm`,
    `Floors: ${wall.floors}, floor height: ${wall.floorHeight}mm`,
    `Door opening: ${wall.doorHeight}mm high`,
    `Window sill/head: ${wall.sill}mm / ${wall.head}mm`,
    '',
    'Checklist:',
    '- Import clean CAD plan',
    '- Trace closed wall faces',
    '- Push/pull walls to correct height',
    '- Cut door and window openings',
    '- Group walls per floor',
    '- Assign proper tags',
    '- Save scene after each major stage',
  ].join('\n');
  return (
    <section className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <ScriptCard title="Auto Elevation Generator" subtitle="Generate SketchUp scene setup scripts for front, rear, side, roof, and optional perspective views.">
          <div className="grid gap-3 sm:grid-cols-3">
            {(['width', 'length', 'height', 'floors', 'floorHeight'] as const).map((key) => <label key={key}><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">{key}</span><input className={inputClass()} type="number" value={elev[key]} onChange={(event) => setElev({ ...elev, [key]: Number(event.target.value) })} /></label>)}
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Building front</span><select className={inputClass()} value={elev.front} onChange={(event) => setElev({ ...elev, front: event.target.value })}>{['North', 'East', 'South', 'West'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Output scale</span><select className={inputClass()} value={elev.scale} onChange={(event) => setElev({ ...elev, scale: event.target.value })}>{['1:50', '1:100', '1:200'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Export format</span><select className={inputClass()} value={elev.format} onChange={(event) => setElev({ ...elev, format: event.target.value })}>{['png', 'jpg', 'pdf'].map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">{elevationOptions.map((item) => <label key={item.key} className="flex items-center gap-2 rounded border border-white/10 bg-[#11151b] p-2 text-xs text-zinc-300"><input type="checkbox" checked={elevViews[item.key]} onChange={() => setElevViews((current) => ({ ...current, [item.key]: !current[item.key] }))} className="accent-cyan-300" />{item.label}</label>)}</div>
          <pre className="mt-4 max-h-44 overflow-auto rounded-md bg-black/30 p-3 font-mono text-xs text-emerald-300">{elevationScript}</pre>
          <div className="mt-3 flex flex-wrap gap-2"><button className="rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-zinc-950" onClick={() => downloadText('ArchiVault_Auto_Elevation_Setup.rb', elevationScript)}>Generate Elevation Setup</button><button className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200" onClick={() => safeCopy([...scenes.map((item) => item.scene), ...exportNames].join('\n'))}>Copy Scene Checklist</button><button className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200" onClick={() => downloadText('ArchiVault_Auto_Elevation_Guide.rb', elevationScript)}>Export SketchUp Guide</button></div>
        </ScriptCard>
        <ScriptCard title="Auto Section Generator" subtitle="Create section-scene placeholders, cut notes, hidden-line reminders, and export checklist.">
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Section type</span><select className={inputClass()} value={section.type} onChange={(event) => setSection({ ...section, type: event.target.value })}>{['Longitudinal Section', 'Cross Section', 'Center Section', 'Stair Section', 'Wall Section', 'Custom Section Line'].map((item) => <option key={item}>{item}</option>)}</select></label>
            {(['position', 'direction', 'cuts', 'naming', 'floors'] as const).map((key) => <label key={key}><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">{key}</span><input className={inputClass()} type={key === 'cuts' ? 'number' : 'text'} value={section[key] as string | number} onChange={(event) => setSection({ ...section, [key]: key === 'cuts' ? Number(event.target.value) : event.target.value })} /></label>)}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="flex items-center gap-2 rounded border border-white/10 bg-[#11151b] p-2 text-xs text-zinc-300"><input type="checkbox" checked={section.furniture} onChange={() => setSection({ ...section, furniture: !section.furniture })} className="accent-cyan-300" />Include furniture</label><label className="flex items-center gap-2 rounded border border-white/10 bg-[#11151b] p-2 text-xs text-zinc-300"><input type="checkbox" checked={section.structure} onChange={() => setSection({ ...section, structure: !section.structure })} className="accent-cyan-300" />Structure only</label></div>
          <pre className="mt-4 max-h-44 overflow-auto rounded-md bg-black/30 p-3 font-mono text-xs text-emerald-300">{sectionGuide}</pre>
          <div className="mt-3 flex flex-wrap gap-2"><button className="rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-zinc-950" onClick={() => downloadText('ArchiVault_Section_Setup.rb', sectionGuide)}>Generate Section Setup</button><button className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200" onClick={() => downloadText('ArchiVault_Section_Guide.rb', sectionGuide)}>Export Section Guide</button><button className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200" onClick={() => safeCopy(sectionGuide)}>Copy Section Checklist</button></div>
        </ScriptCard>
      </div>
      <ScriptCard title="Wall Extrusion Planner" subtitle="Generate a non-destructive modeling checklist for wall heights, openings, floor grouping, and tags.">
        <div className="grid gap-3 md:grid-cols-7">{Object.entries(wall).map(([key, value]) => <label key={key}><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">{key}</span><input className={inputClass()} type="number" value={value} onChange={(event) => setWall({ ...wall, [key]: Number(event.target.value) })} /></label>)}</div>
        <pre className="mt-4 rounded-md bg-black/30 p-3 font-mono text-xs text-emerald-300">{wallGuide}</pre>
        <div className="mt-3 flex flex-wrap gap-2"><button className="rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-zinc-950" onClick={() => downloadText('ArchiVault_Wall_Modeling_Guide.txt', wallGuide)}>Generate Wall Modeling Guide</button><button className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200" onClick={() => downloadText('ArchiVault_Wall_Modeling_Checklist.txt', wallGuide)}>Export Modeling Checklist</button></div>
      </ScriptCard>
    </section>
  );
}

function OptimizationUtilitySuite() {
  const [lag, setLag] = useState({ intensity: 'Standard', audit: true, purge: true, regapp: true, overkill: false, flatten: false, scalelist: true, dgn: true, qsave: false, close: false } as { intensity: string } & LagFlags);
  const autocadFileInputRef = useRef<HTMLInputElement>(null);
  const [healthDragActive, setHealthDragActive] = useState(false);
  const [healthFile, setHealthFile] = useState<AutoCadHealthFile | null>(null);
  const [healthMessage, setHealthMessage] = useState('');
  const [healthError, setHealthError] = useState('');
  const [healthPreviewReady, setHealthPreviewReady] = useState(false);
  const [dwg, setDwg] = useState({ size: 45, layers: 80, blocks: 150, hatches: 40, xrefs: 2, imported: true, raster: false, annotations: true, objects3d: false, entities: 1800, lines: 800, polylines: 220, circles: 45, dimensions: 80, splines: 18, duplicateEstimate: 36, tinyFragments: 20, unusedLayers: 18 });
  const [cleanupFlags, setCleanupFlags] = useState<AutoCadCleanupFlags>({ audit: true, purge: true, regapp: true, overkill: false, scalelist: true, xrefNote: true, hatchNote: true, flatten: false, saveCopy: false });
  const [cleanupPreviewReady, setCleanupPreviewReady] = useState(false);
  const [renderLag, setRenderLag] = useState({ software: 'Enscape', scene: 'Exterior', laptop: 'Mid-range laptop', quality: 'Presentation', lights: 8, vegetation: 35, texture: 'High', resolution: '3000px' });
  const [renderPackName, setRenderPackName] = useState(`render_optimizer_enscape_exterior_${new Date().toISOString().slice(0, 10)}`);
  const [renderScriptReady, setRenderScriptReady] = useState(false);
  const [renderToast, setRenderToast] = useState('');
  const [cadImport, setCadImport] = useState({ source: 'downloaded DWG', problem: 'no faces forming', sketchup: true });
  const lagLines = [
    '; ArchiVault AutoCAD Lag Fix Script',
    '; Warning: Deep cleanup may modify geometry. Always duplicate the DWG file before running this script.',
    '_UNDO', '_GROUP', '_FILEDIA', '0', '_CMDECHO', '0',
    lag.audit ? '_AUDIT\n_Y' : '; AUDIT skipped',
    lag.purge ? '_-PURGE\n_A\n*\n_N' : '; PURGE skipped',
    lag.regapp ? '_-PURGE\n_R\n*\n_N' : '; REGAPP purge skipped',
    lag.overkill ? '_OVERKILL\n_ALL\n' : '; OVERKILL skipped because it can modify geometry',
    lag.flatten ? '_FLATTEN\n_ALL\n_N' : '; FLATTEN skipped because it can modify geometry',
    lag.scalelist ? '_SCALELISTEDIT\n_R\n_Y\n_E' : '; SCALELISTEDIT skipped',
    lag.dgn ? '; DGN linetype cleanup reminder: use DGNPURGE tools when available.' : '; DGN reminder skipped',
    '_REGENALL', '_FILEDIA', '1', '_CMDECHO', '1',
    lag.qsave ? '_QSAVE' : '; QSAVE skipped by user setting',
    lag.close ? '_CLOSE' : '; CLOSE skipped by user setting',
    '_UNDO', '_END', '',
  ].join('\n');
  const dwgPenalty = dwg.size / 1.8 + dwg.layers / 7 + dwg.blocks / 10 + dwg.hatches / 5 + dwg.xrefs * 7 + dwg.entities / 420 + dwg.duplicateEstimate / 8 + dwg.tinyFragments / 8 + dwg.unusedLayers / 4 + (dwg.imported ? 13 : 0) + (dwg.raster ? 14 : 0) + (dwg.annotations ? 8 : 0) + (dwg.objects3d ? 14 : 0);
  const dwgScore = Math.max(0, Math.round(100 - dwgPenalty));
  const risk = dwgScore >= 85 ? 'Healthy' : dwgScore >= 70 ? 'Good' : dwgScore >= 50 ? 'Needs Cleanup' : dwgScore >= 30 ? 'Heavy' : 'Critical';
  const healthReasons = [
    dwg.layers > 120 ? 'Too many layers may slow navigation and plotting.' : dwg.layers > 70 ? 'Layer count is high; purge or merge unused layers.' : '',
    dwg.blocks > 220 ? 'High block count can slow opening, selection, and regeneration.' : dwg.blocks > 120 ? 'Block count is moderate; check repeated imported symbols.' : '',
    dwg.hatches > 80 ? 'Dense hatch usage is likely increasing file weight.' : dwg.hatches > 35 ? 'Hatch count is heavy; simplify patterns before plotting/importing.' : '',
    dwg.xrefs > 4 ? 'Many XREFs can cause missing links and long load times.' : dwg.xrefs > 0 ? 'XREF references detected; detach unused files.' : '',
    dwg.raster ? 'Raster/image references may slow panning, plotting, and render imports.' : '',
    dwg.imported ? 'Imported CAD geometry detected; duplicate lines and tiny fragments are likely.' : '',
    dwg.annotations ? 'Annotation scales/dim styles may need reset and purge.' : '',
    dwg.objects3d ? '3D objects detected; flatten only if the file is intended as 2D documentation.' : '',
    dwg.duplicateEstimate > 50 ? 'Duplicate or near-duplicate entity estimate is high.' : '',
    dwg.tinyFragments > 50 ? 'Tiny line fragments may prevent SketchUp face creation.' : '',
  ].filter(Boolean).slice(0, 3);
  const healthRecommendations = [
    dwg.duplicateEstimate > 0 || dwg.tinyFragments > 0 ? 'Run OVERKILL only after reviewing a backup copy to remove duplicate vectors and ghost geometry.' : '',
    dwg.layers > 60 || dwg.unusedLayers > 0 ? 'Run soft PURGE to remove unused layers, blocks, linetypes, and styles without deleting used content.' : '',
    dwg.hatches > 30 ? 'Reduce hatch density, simplify patterns, or freeze hatch-heavy reference layers before import/rendering.' : '',
    dwg.xrefs > 0 ? 'Detach unused XREFs, reload missing references, and bind only files that are really needed.' : '',
    dwg.raster ? 'Compress, relink, or remove raster images before plotting and model import.' : '',
    dwg.annotations ? 'Reset annotation scales and audit dimension/text styles.' : '',
    dwg.objects3d ? 'Flatten Z values only for a 2D copy; keep the original 3D model untouched.' : '',
  ].filter(Boolean);
  const estimatedImprovement = Math.min(35, Math.round((dwg.duplicateEstimate + dwg.tinyFragments) / 8 + dwg.unusedLayers / 3 + dwg.hatches / 12 + (dwg.raster ? 8 : 0)));
  const renderPenalty = renderLag.lights * 2 + renderLag.vegetation * 0.8 + (renderLag.texture === 'Ultra' ? 25 : renderLag.texture === 'High' ? 14 : 6) + (renderLag.laptop === 'Low-end laptop' ? 22 : renderLag.laptop === 'Mid-range laptop' ? 10 : 0);
  const renderPerformance = Math.max(0, Math.round(100 - renderPenalty));
  const renderSafeResolution = renderLag.laptop === 'Low-end laptop' ? '1920px preview first' : renderLag.laptop === 'Mid-range laptop' ? '2560px preview, final only after cleanup' : renderLag.resolution;
  const renderFileExt = renderLag.software === 'AutoCAD' ? 'scr' : renderLag.software === 'SketchUp' ? 'rb' : renderLag.software === 'Revit' ? 'txt' : renderLag.software === 'V-Ray' ? 'json' : 'txt';
  const sanitizedRenderPackName = (renderPackName.trim() || `render_optimizer_${renderLag.software}_${renderLag.scene}`).replace(/[^\w.-]+/g, '_');
  const renderDownloadName = `${sanitizedRenderPackName}.${renderFileExt}`;
  const renderActions = [
    renderLag.texture === 'Ultra' ? 'Reduce ultra textures to medium/high working previews.' : `Keep ${renderLag.texture.toLowerCase()} textures for test renders.`,
    renderLag.lights > 10 ? 'Disable or group excess lights before preview rendering.' : 'Keep current light count, then test exposure before final render.',
    renderLag.vegetation > 30 ? 'Proxy, hide, or replace heavy vegetation outside the camera view.' : 'Vegetation count is manageable for the selected scene.',
    renderLag.laptop === 'Low-end laptop' ? 'Use low preview quality and avoid final resolution until the scene is stable.' : 'Use preview resolution first, then final export after asset cleanup.',
  ];
  const renderWorkflowGuide = renderLag.software === 'AutoCAD'
    ? 'Drag the generated .scr file into the AutoCAD drawing canvas or run it using the SCRIPT command.'
    : renderLag.software === 'SketchUp'
      ? "Place the generated .rb file inside the SketchUp Plugins folder, restart SketchUp, then run it from the Extensions menu."
      : renderLag.software === 'Revit'
        ? 'Open Dynamo or the macro panel, review the generated optimization workflow, then run it on a backup copy of your model.'
        : 'Use the generated checklist/preset guide to reduce texture quality, optimize assets, lower preview resolution, and disable heavy scene elements before final render.';
  const renderPackContent = useMemo(() => {
    const header = [
      `ArchiVault Render Lag Optimizer`,
      `Software target: ${renderLag.software}`,
      `Scene type: ${renderLag.scene}`,
      `Laptop profile: ${renderLag.laptop}`,
      `Texture quality: ${renderLag.texture}`,
      `Lights: ${renderLag.lights}`,
      `Vegetation objects: ${renderLag.vegetation}`,
      `Target resolution: ${renderLag.resolution}`,
      `Recommended preview resolution: ${renderSafeResolution}`,
      `Estimated performance score: ${renderPerformance}/100`,
      '',
    ];
    if (renderLag.software === 'AutoCAD') {
      return [
        '; ArchiVault Render Lag Optimizer - AutoCAD .scr',
        '; Non-destructive render-prep script. Review the drawing before saving.',
        '; This script focuses on performance variables, regeneration, and visual cleanup helpers.',
        '_UNDO',
        '_GROUP',
        '_FILEDIA',
        '0',
        '_CMDECHO',
        '0',
        '_REGENALL',
        '_VIEWRES',
        '_Y',
        '100',
        '_SELECTIONPREVIEW',
        '0',
        '_HIGHLIGHT',
        '0',
        '; Recommended actions:',
        ...renderActions.map((action) => `; - ${action}`),
        '_FILEDIA',
        '1',
        '_CMDECHO',
        '1',
        '_UNDO',
        '_END',
        '',
        '',
      ].join('\n');
    }
    if (renderLag.software === 'SketchUp') {
      return [
        '# ArchiVault Render Lag Optimizer - SketchUp Ruby guide',
        '# Non-destructive helper: creates a review scene and prints optimization notes.',
        'model = Sketchup.active_model',
        'pages = model.pages',
        'page = pages.add("ARCHIVAULT_RENDER_SAFE_PREVIEW")',
        'page.use_camera = true',
        'page.use_rendering_options = true',
        'model.rendering_options["DisplayColorByLayer"] = false if model.rendering_options',
        `puts "Scene: ${renderLag.scene}"`,
        `puts "Safe preview resolution: ${renderSafeResolution}"`,
        ...renderActions.map((action) => `puts "${action.replace(/"/g, "'")}"`),
        'UI.messagebox("ArchiVault render optimization guide loaded. Review heavy assets before final render.")',
        '',
      ].join('\n');
    }
    if (renderLag.software === 'Revit') {
      return [
        ...header,
        'Revit Dynamo / macro checklist placeholder:',
        '- Duplicate the model before running optimization.',
        '- Open Manage Links and unload unused CAD/RVT links.',
        '- Purge unused families only after review.',
        '- Audit warnings before deleting or merging elements.',
        '- Lower preview visual style and render resolution while testing.',
        ...renderActions.map((action) => `- ${action}`),
        '',
      ].join('\n');
    }
    if (renderLag.software === 'V-Ray') {
      return JSON.stringify({
        source: 'ArchiVault Render Lag Optimizer',
        software: renderLag.software,
        scene: renderLag.scene,
        laptop: renderLag.laptop,
        score: renderPerformance,
        safePreviewResolution: renderSafeResolution,
        textureRecommendation: renderLag.texture === 'Ultra' ? 'Use high/medium for previews; reserve ultra for finals.' : `Current ${renderLag.texture} setting is acceptable for tests.`,
        lightOptimizationAdvice: renderLag.lights > 10 ? 'Reduce lights or group them into render layers.' : 'Light count is manageable.',
        vegetationOptimizationAdvice: renderLag.vegetation > 30 ? 'Use proxies or hide distant vegetation.' : 'Vegetation count is manageable.',
        actions: renderActions,
      }, null, 2);
    }
    return [
      ...header,
      'Optimization checklist:',
      ...renderActions.map((action) => `- ${action}`),
      '',
      'Export settings recommendation:',
      `- Use ${renderSafeResolution} for previews.`,
      '- Hide assets outside the camera frame.',
      '- Replace high-poly vegetation with proxies or low-poly assets.',
      '- Lower reflective material samples during working previews.',
      '- Save a separate optimized scene before final output.',
      '',
    ].join('\n');
  }, [renderActions, renderLag, renderPerformance, renderSafeResolution]);
  function generateRenderPack() {
    setRenderScriptReady(true);
    const activeFilters = `${renderLag.software} / ${renderLag.scene} / ${renderLag.laptop} / ${renderLag.texture} textures / ${renderLag.resolution}`;
    setRenderToast(`Optimization script ready. Active filters: ${activeFilters}`);
    window.setTimeout(() => setRenderToast(''), 4200);
  }
  async function logHealthWorkflow(action: string, summary: string, warnings: number) {
    try {
      await fetch(`${API_BASE}/api/v1/workflow/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: action,
          file_path: healthFile?.path ?? healthFile?.name ?? 'browser-selected-file',
          result_summary: summary,
          warnings_count: warnings,
        }),
      });
    } catch {
      // Local logging is best-effort so the UI still works when the backend is offline.
    }
  }
  async function saveAutoCadHealthCheck() {
    if (!healthFile) return;
    try {
      await fetch(`${API_BASE}/api/v1/autocad/health-checks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: healthFile.name,
          file_path: healthFile.path,
          file_type: healthFile.type,
          file_size_mb: dwg.size,
          layer_count: dwg.layers,
          block_count: dwg.blocks,
          hatch_count: dwg.hatches,
          xref_count: dwg.xrefs,
          raster_detected: dwg.raster,
          annotation_detected: dwg.annotations,
          objects3d_detected: dwg.objects3d,
          entity_count: dwg.entities,
          health_score: dwgScore,
          health_status: risk,
          recommendations: healthRecommendations.join('\n'),
        }),
      });
    } catch {
      // Database persistence is optional while the frontend remains usable offline.
    }
  }
  async function analyzeAutoCadFile(file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['dwg', 'dxf'].includes(extension)) {
      setHealthError('Unsupported file. Please upload a DWG or DXF file.');
      setHealthMessage('');
      return;
    }
    const sizeMb = Number((file.size / (1024 * 1024)).toFixed(2));
    const fileInfo: AutoCadHealthFile = {
      name: file.name,
      path: (file as File & { path?: string }).path ?? (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? 'Browser-selected local file',
      type: extension.toUpperCase() as 'DWG' | 'DXF',
      sizeMb,
      modified: new Date(file.lastModified).toLocaleString(),
      mode: extension === 'dxf' ? 'DXF text scan' : 'DWG basic safe estimate',
    };
    setHealthFile(fileInfo);
    setHealthError('');
    setHealthPreviewReady(true);

    if (extension === 'dxf') {
      try {
        const text = await file.text();
        const layerMatches = [...text.matchAll(/\n\s*8\s*\n\s*([^\n\r]+)/gi)].map((match) => match[1].trim()).filter(Boolean);
        const uniqueLayers = new Set(layerMatches);
        const hatches = countDxfEntity(text, 'HATCH');
        const inserts = countDxfEntity(text, 'INSERT');
        const lines = countDxfEntity(text, 'LINE');
        const polylines = countDxfEntity(text, 'LWPOLYLINE') + countDxfEntity(text, 'POLYLINE');
        const circles = countDxfEntity(text, 'CIRCLE') + countDxfEntity(text, 'ARC');
        const dimensions = countDxfEntity(text, 'DIMENSION');
        const splines = countDxfEntity(text, 'SPLINE');
        const textObjects = countDxfEntity(text, 'TEXT') + countDxfEntity(text, 'MTEXT') + dimensions;
        const raster = countDxfEntity(text, 'IMAGE') + countDxfEntity(text, 'IMAGEDEF') > 0;
        const objects3d = countDxfEntity(text, '3DSOLID') + countDxfEntity(text, 'MESH') + countDxfEntity(text, 'SURFACE') + countDxfEntity(text, 'POLYFACE') > 0;
        const xrefs = (text.match(/\n\s*1\s*\n\s*[^\n\r]*\.(dwg|dxf)/gi) ?? []).length;
        const entities = lines + polylines + circles + dimensions + splines + hatches + inserts + textObjects;
        const duplicateEstimate = Math.round(Math.max(0, lines + polylines - uniqueLayers.size * 12) * 0.025);
        const tinyFragments = Math.round(Math.max(0, lines - 400) * 0.035);
        const unusedLayers = Math.max(0, uniqueLayers.size - new Set(layerMatches.slice(0, Math.max(10, Math.floor(layerMatches.length * 0.75)))).size);
        setDwg({
          size: sizeMb,
          layers: Math.max(uniqueLayers.size, 1),
          blocks: inserts,
          hatches,
          xrefs,
          imported: text.toLowerCase().includes('acad') || inserts > 80 || uniqueLayers.size > 40,
          raster,
          annotations: textObjects > 0,
          objects3d,
          entities,
          lines,
          polylines,
          circles,
          dimensions,
          splines,
          duplicateEstimate,
          tinyFragments,
          unusedLayers,
        });
        setHealthMessage('File analyzed successfully. DXF entity data was auto-filled from the file text.');
        void logHealthWorkflow('autocad_file_health_check', `${file.name} analyzed as DXF with ${entities} entities.`, Math.max(0, healthReasons.length));
      } catch {
        setHealthError('Analysis failed. The DXF file cannot be read by the browser.');
      }
      return;
    }

    const sizeFactor = Math.max(sizeMb, 1);
    setDwg({
      size: sizeMb,
      layers: Math.round(25 + sizeFactor * 1.25),
      blocks: Math.round(40 + sizeFactor * 2.2),
      hatches: Math.round(8 + sizeFactor * 0.75),
      xrefs: sizeMb > 35 ? 2 : sizeMb > 18 ? 1 : 0,
      imported: sizeMb > 20,
      raster: sizeMb > 55,
      annotations: true,
      objects3d: sizeMb > 80,
      entities: Math.round(sizeFactor * 95),
      lines: Math.round(sizeFactor * 42),
      polylines: Math.round(sizeFactor * 12),
      circles: Math.round(sizeFactor * 3),
      dimensions: Math.round(sizeFactor * 4),
      splines: Math.round(sizeFactor * 1.5),
      duplicateEstimate: Math.round(sizeFactor * 1.8),
      tinyFragments: Math.round(sizeFactor * 1.2),
      unusedLayers: Math.round(sizeFactor * 0.4),
    });
    setHealthMessage('Full DWG analysis requires AutoCAD or DXF conversion. Basic health estimate is shown.');
    void logHealthWorkflow('autocad_file_health_check', `${file.name} analyzed in DWG basic estimate mode.`, sizeMb > 50 ? 2 : 1);
  }
  const cleanupScript = [
    '; ==================================================',
    '; ArchiVault AutoCAD File Health Cleanup Pack',
    '; Non-destructive safety-first script',
    '; This script is for cleanup and optimization. It does not erase geometry.',
    '; If you encounter errors or dislike the result, press Ctrl+Z to revert the undo group.',
    '; Run this on a duplicated DWG whenever possible.',
    '; ==================================================',
    '_UNDO',
    '_GROUP',
    '_FILEDIA',
    '0',
    '_CMDECHO',
    '0',
    cleanupFlags.audit ? '; [1] Database audit and repair\n_AUDIT\n_Y' : '; AUDIT skipped',
    cleanupFlags.purge ? '; [2] Soft purge unused objects\n_-PURGE\n_A\n*\n_N' : '; Soft PURGE skipped',
    cleanupFlags.regapp ? '; [3] Registered application purge\n_-PURGE\n_R\n*\n_N' : '; RegApp purge skipped',
    cleanupFlags.scalelist ? '; [4] Annotation scale reset\n_SCALELISTEDIT\n_R\n_Y\n_E' : '; Annotation scale reset skipped',
    cleanupFlags.overkill ? '; [5] Duplicate cleanup - review before using on active plates\n_OVERKILL\n_ALL\n\n' : '; OVERKILL skipped by default to avoid unintended geometry changes',
    cleanupFlags.flatten ? '; [6] Flatten Z values - only for copied 2D documentation files\n_FLATTEN\n_ALL\n_N' : '; FLATTEN skipped by default to preserve 3D/Z data',
    cleanupFlags.xrefNote ? '; [XREF note] Detach unused XREFs manually after checking which files are required.' : '; XREF note skipped',
    cleanupFlags.hatchNote ? '; [Hatch note] Reduce hatch density manually; this script does not delete hatch objects.' : '; Hatch note skipped',
    '_REGENALL',
    '_FILEDIA',
    '1',
    '_CMDECHO',
    '1',
    cleanupFlags.saveCopy ? '; Save cleaned copy requested: use SAVEAS manually now. QSAVE is intentionally not automated to avoid overwriting the active plate.' : '; Save skipped. No automatic overwrite.',
    '_UNDO',
    '_END',
    '',
    '',
  ].join('\n');
  const cleanupInstructions = [
    'ArchiVault Cleanup Pack Instructions',
    '',
    '1. Duplicate your DWG before running any cleanup.',
    '2. Open the duplicate in AutoCAD.',
    '3. Drag the generated .scr file into the drawing canvas or run SCRIPT.',
    '4. Review results carefully.',
    '5. If anything looks wrong, press Ctrl+Z once to revert the undo group.',
    '',
    `Analyzed file: ${healthFile?.name ?? 'No file selected'}`,
    `Health score: ${dwgScore}/100 - ${risk}`,
    '',
    'Recommended actions:',
    ...healthRecommendations.map((item) => `- ${item}`),
    '',
  ].join('\n');
  const cleanupGuide = [
    `CAD source: ${cadImport.source}`,
    `Problem: ${cadImport.problem}`,
    'AutoCAD pre-cleanup steps: AUDIT, soft PURGE, REGAPP purge, OVERKILL only on a duplicated file, FLATTEN only after confirming Z issues.',
    'Delete unnecessary hatches and dimensions only from a copied cleanup file.',
    'Check units before import and SAVE AS a clean copy.',
    cadImport.sketchup ? 'SketchUp import: import as DWG, check scale, group imported CAD immediately, lock reference group, and trace only needed walls.' : 'SketchUp import not required.',
  ].join('\n');
  return (
    <section className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <ScriptCard title="AutoCAD Lag Fix Script Builder" subtitle="Build a downloadable .scr with live preview, explanations, risk warning, and copy/download controls.">
          <div className="rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">Deep cleanup may modify geometry. Always duplicate the DWG file before running the script.</div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Cleanup intensity</span><select className={inputClass()} value={lag.intensity} onChange={(event) => setLag({ ...lag, intensity: event.target.value })}>{['Light', 'Standard', 'Deep'].map((item) => <option key={item}>{item}</option>)}</select></label>
            {(Object.keys(lag).filter((key) => key !== 'intensity') as Array<keyof LagFlags>).map((key) => <label key={key} className="flex items-center gap-2 rounded border border-white/10 bg-[#11151b] p-2 text-xs text-zinc-300"><input type="checkbox" checked={lag[key]} onChange={() => setLag({ ...lag, [key]: !lag[key] })} className="accent-cyan-300" />Include {key.toUpperCase()}</label>)}
          </div>
          <pre className="mt-4 max-h-72 overflow-auto rounded-md bg-black/30 p-3 font-mono text-xs text-emerald-300">{lagLines}</pre>
          <div className="mt-3 flex flex-wrap gap-2"><button className="rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-zinc-950" onClick={() => downloadText('ArchiVault_AutoCAD_Lag_Fix.scr', lagLines)}>Generate AutoCAD Lag Fix Script</button><button className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200" onClick={() => downloadText('ArchiVault_AutoCAD_Lag_Fix.scr', lagLines)}>Download .scr</button><button className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200" onClick={() => safeCopy(lagLines)}>Copy commands</button></div>
        </ScriptCard>
        <ScriptCard title="AutoCAD File Health Checker" subtitle="Estimate why a DWG is lagging and recommend a cleanup preset.">
          <input ref={autocadFileInputRef} type="file" accept=".dwg,.dxf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void analyzeAutoCadFile(file); event.currentTarget.value = ''; }} />
          <div
            className={`rounded-lg border border-dashed p-5 text-center transition ${healthDragActive ? 'border-cyan-300 bg-cyan-300/10' : healthFile ? 'border-emerald-300/40 bg-emerald-300/10' : healthError ? 'border-red-300/40 bg-red-300/10' : 'border-cyan-300/30 bg-[#11151b]'}`}
            onDragOver={(event) => { event.preventDefault(); setHealthDragActive(true); }}
            onDragLeave={() => setHealthDragActive(false)}
            onDrop={(event) => { event.preventDefault(); setHealthDragActive(false); const file = event.dataTransfer.files[0]; if (file) void analyzeAutoCadFile(file); }}
          >
            <UploadCloud className="mx-auto h-10 w-10 text-cyan-300" />
            <h4 className="mt-3 text-base font-semibold text-white">Drag and drop your DWG or DXF file here</h4>
            <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-zinc-400">Auto-detect file size, layers, blocks, hatches, xrefs, annotations, raster images, and possible lag sources.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button className="rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-zinc-950" onClick={() => autocadFileInputRef.current?.click()}>Browse File</button>
              <button className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200" onClick={() => { setHealthFile(null); setHealthMessage(''); setHealthError(''); setHealthPreviewReady(false); }}>Clear File</button>
              <button className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200" onClick={() => autocadFileInputRef.current?.click()}>Analyze File</button>
              <button className="rounded-md border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100" onClick={() => setCleanupPreviewReady(true)}>Generate Cleanup Script</button>
            </div>
          </div>
          <p className="mt-3 rounded-md border border-white/10 bg-[#11151b] p-2 text-xs leading-5 text-zinc-400">DWG full analysis may require AutoCAD installed or DXF conversion. DXF files can be analyzed directly in this browser workflow.</p>
          {healthError && <div className="mt-3 flex items-center gap-2 rounded-md border border-red-300/30 bg-red-300/10 p-3 text-xs text-red-100"><XCircle className="h-4 w-4" />{healthError}</div>}
          {healthMessage && <div className="mt-3 rounded-md border border-emerald-300/30 bg-emerald-300/10 p-3 text-xs text-emerald-100">{healthMessage}</div>}
          {healthFile && <div className="mt-4 grid gap-3 rounded-md border border-white/10 bg-[#11151b] p-3 text-xs text-zinc-300 sm:grid-cols-2"><span><strong className="text-white">File:</strong> {healthFile.name}</span><span><strong className="text-white">Path:</strong> {healthFile.path}</span><span><strong className="text-white">Size:</strong> {healthFile.sizeMb} MB</span><span><strong className="text-white">Type:</strong> {healthFile.type}</span><span><strong className="text-white">Modified:</strong> {healthFile.modified}</span><span><strong className="text-white">Mode:</strong> {healthFile.mode}</span></div>}
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3"><p className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">AutoCAD file health score</p><div className="mt-2 h-3 rounded-full bg-black/30"><div className={`h-full rounded-full ${dwgScore >= 70 ? 'bg-emerald-300' : dwgScore >= 50 ? 'bg-amber-300' : 'bg-red-300'}`} style={{ width: `${dwgScore}%` }} /></div><p className="mt-2 text-lg font-semibold text-white">{dwgScore}/100 · {risk}</p><p className="mt-1 text-xs text-cyan-50/80">Estimated improvement after cleanup: +{estimatedImprovement} points</p></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">{[['Layers', dwg.layers, 70, 120], ['Blocks', dwg.blocks, 120, 220], ['Hatches', dwg.hatches, 35, 80], ['Xrefs', dwg.xrefs, 1, 4], ['Entities', dwg.entities, 2500, 6500], ['Duplicates', dwg.duplicateEstimate, 20, 70], ['Tiny fragments', dwg.tinyFragments, 20, 70], ['Unused layers', dwg.unusedLayers, 10, 35]].map(([label, value, warning, critical]) => <div key={label as string} className={`rounded-md border p-2 ${riskTone(value as number, warning as number, critical as number)}`}><p className="text-[10px] uppercase tracking-[0.14em] opacity-80">{label}</p><p className="mt-1 text-base font-bold">{value}</p></div>)}</div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Auto-filled from file analysis. You can still edit values manually.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-5">{(['size', 'layers', 'blocks', 'hatches', 'xrefs'] as const).map((key) => <label key={key}><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">{key}</span><input className={inputClass()} type="number" value={dwg[key]} onChange={(event) => setDwg({ ...dwg, [key]: Number(event.target.value) })} /></label>)}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">{(['entities', 'lines', 'polylines', 'dimensions', 'splines', 'duplicateEstimate', 'tinyFragments', 'unusedLayers'] as const).map((key) => <label key={key}><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">{key}</span><input className={inputClass()} type="number" value={dwg[key]} onChange={(event) => setDwg({ ...dwg, [key]: Number(event.target.value) })} /></label>)}</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{(['imported', 'raster', 'annotations', 'objects3d'] as const).map((key) => <label key={key} className="flex items-center gap-2 rounded border border-white/10 bg-[#11151b] p-2 text-xs text-zinc-300"><input type="checkbox" checked={dwg[key]} onChange={() => setDwg({ ...dwg, [key]: !dwg[key] })} className="accent-cyan-300" />{key}</label>)}</div>
          {healthPreviewReady && <div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Top reasons</p><div className="mt-2 space-y-2">{(healthReasons.length ? healthReasons : ['No major file-health issue detected from available data.']).map((item) => <p key={item} className="rounded border border-white/10 bg-black/20 p-2 text-xs leading-5 text-zinc-300">{item}</p>)}</div></div><div className="rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Recommended cleanup actions</p><div className="mt-2 space-y-2">{(healthRecommendations.length ? healthRecommendations : ['Keep using soft AUDIT and REGENALL only. No aggressive cleanup is recommended.']).map((item) => <p key={item} className="rounded border border-white/10 bg-black/20 p-2 text-xs leading-5 text-zinc-300">{item}</p>)}</div></div></div>}
          <div className="mt-4 rounded-md border border-white/10 bg-[#11151b] p-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Cleanup preset checkboxes</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{([['audit', 'Run AUDIT'], ['purge', 'Purge unused objects'], ['regapp', 'Purge RegApps'], ['overkill', 'Run OVERKILL'], ['scalelist', 'Reset annotation scales'], ['xrefNote', 'Detach unused xrefs note'], ['hatchNote', 'Reduce hatch density note'], ['flatten', 'Flatten Z values'], ['saveCopy', 'Save cleaned copy']] as Array<[keyof AutoCadCleanupFlags, string]>).map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded border border-white/10 bg-black/20 p-2 text-xs text-zinc-300"><input type="checkbox" checked={cleanupFlags[key]} onChange={() => setCleanupFlags({ ...cleanupFlags, [key]: !cleanupFlags[key] })} className="accent-cyan-300" />{label}</label>)}</div></div>
          <div className="mt-4 flex flex-wrap gap-2"><button className="rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-zinc-950" onClick={() => { setCleanupPreviewReady(true); setHealthMessage('Cleanup script generated. Preview it before downloading.'); void saveAutoCadHealthCheck(); }}>Generate AutoCAD Cleanup Script</button><button className="rounded-md border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100" onClick={() => { setCleanupPreviewReady(true); downloadText('ArchiVault_AutoCAD_Cleanup_Pack.scr', cleanupScript); downloadText('ArchiVault_AutoCAD_Cleanup_Instructions.txt', cleanupInstructions); setHealthMessage('Script pack downloaded.'); void saveAutoCadHealthCheck(); void logHealthWorkflow('autocad_cleanup_script_pack', `${healthFile?.name ?? 'manual file'} cleanup script pack downloaded.`, healthReasons.length); }}>Download Drag-and-Drop Cleanup Pack</button><button className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200" onClick={() => setCleanupPreviewReady(true)}>Preview Script</button><button className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200" onClick={() => safeCopy(cleanupScript)}>Copy Script</button></div>
          <div className="mt-3 rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">Workflow Guide: Download the cleanup pack, extract it, then drag the generated .scr file into your active AutoCAD drawing canvas or run it using the SCRIPT command. The default script avoids erase/delete and does not save over the drawing unless you enable save.</div>
          {cleanupPreviewReady && <pre className="mt-4 max-h-72 overflow-auto rounded-md border border-white/10 bg-black/40 p-3 font-mono text-xs leading-5 text-emerald-300">{cleanupScript}</pre>}
        </ScriptCard>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ScriptCard title="Render Lag Optimizer" subtitle="Tune render settings to avoid crashes, slow previews, heavy textures, and vegetation overload.">
          <div className="grid gap-3 sm:grid-cols-4">
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Software</span><select className={inputClass()} value={renderLag.software} onChange={(event) => setRenderLag({ ...renderLag, software: event.target.value })}>{['AutoCAD', 'SketchUp', 'Revit', 'Enscape', 'Lumion', 'Twinmotion', 'D5 Render', 'V-Ray'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Scene</span><select className={inputClass()} value={renderLag.scene} onChange={(event) => setRenderLag({ ...renderLag, scene: event.target.value })}>{['Exterior', 'Interior', 'Site', 'Aerial', 'Detail Shot'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Laptop</span><select className={inputClass()} value={renderLag.laptop} onChange={(event) => setRenderLag({ ...renderLag, laptop: event.target.value })}>{['Low-end laptop', 'Mid-range laptop', 'Gaming laptop', 'Workstation'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Texture</span><select className={inputClass()} value={renderLag.texture} onChange={(event) => setRenderLag({ ...renderLag, texture: event.target.value })}>{['Medium', 'High', 'Ultra'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Lights</span><input className={inputClass()} type="number" value={renderLag.lights} onChange={(event) => setRenderLag({ ...renderLag, lights: Number(event.target.value) })} /></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Vegetation</span><input className={inputClass()} type="number" value={renderLag.vegetation} onChange={(event) => setRenderLag({ ...renderLag, vegetation: Number(event.target.value) })} /></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Resolution</span><input className={inputClass()} value={renderLag.resolution} onChange={(event) => setRenderLag({ ...renderLag, resolution: event.target.value })} /></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Optimization Pack Name</span><input className={inputClass()} placeholder="example: exterior_enscape_midrange_safe_preview" value={renderPackName} onChange={(event) => setRenderPackName(event.target.value)} /></label>
          </div>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm text-cyan-50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Render performance score: <strong>{renderPerformance}/100</strong> | Safe resolution: <strong>{renderSafeResolution}</strong></span>
              <span className="rounded bg-black/30 px-2 py-1 text-xs text-cyan-100">Output: {renderDownloadName}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-cyan-50/80">Use medium texture quality for working previews, hide objects not visible in camera, reduce reflective materials, and save before final render.</p>
          </div>
          <div className="mt-4 grid gap-2">
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 py-3 text-sm font-bold text-zinc-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200" onClick={generateRenderPack}>
              <FileCode2 className="h-4 w-4" />
              Generate Optimization Script
            </button>
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-cyan-300/40 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
              onClick={() => {
                generateRenderPack();
                downloadText(renderDownloadName, renderPackContent);
              }}
            >
              <Download className="h-4 w-4" />
              Download Drag-and-Drop Script Pack
            </button>
            <div className="grid gap-2 sm:grid-cols-3">
              <button className="rounded-md border border-white/10 bg-[#11151b] px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-cyan-300/40" onClick={generateRenderPack}>Preview Script</button>
              <button className="rounded-md border border-white/10 bg-[#11151b] px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-cyan-300/40" onClick={() => safeCopy(renderPackContent)}>Copy Script</button>
              <button
                className="rounded-md border border-white/10 bg-[#11151b] px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-cyan-300/40"
                onClick={() => {
                  setRenderLag({ software: 'Enscape', scene: 'Exterior', laptop: 'Mid-range laptop', quality: 'Presentation', lights: 8, vegetation: 35, texture: 'High', resolution: '3000px' });
                  setRenderPackName(`render_optimizer_enscape_exterior_${new Date().toISOString().slice(0, 10)}`);
                  setRenderScriptReady(false);
                }}
              >
                Reset
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-400">Generate a ready-to-use optimization script based on your selected software, scene type, laptop type, texture quality, lights, vegetation count, and target resolution.</p>
          <div className="mt-3 rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
            <strong>Workflow Guide:</strong> Download the script pack, extract the archive, then drag the generated script into the supported software workspace or run it from the software's scripting panel.
            <span className="mt-2 block text-amber-50/90">{renderWorkflowGuide}</span>
          </div>
          {renderToast && <div className="mt-3 rounded-md border border-emerald-300/30 bg-emerald-300/10 p-3 text-xs font-semibold text-emerald-50">{renderToast}</div>}
          {renderScriptReady && (
            <div className="mt-4 rounded-md border border-white/10 bg-[#080a0d]">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-4">
                <div>
                  <h4 className="text-sm font-semibold text-white">Generated Optimization Pack Preview</h4>
                  <p className="mt-1 text-xs text-zinc-500">{renderLag.software} | {renderLag.scene} | {renderDownloadName}</p>
                </div>
                <span className="rounded bg-cyan-300 px-2 py-1 text-xs font-bold text-zinc-950">{renderFileExt.toUpperCase()}</span>
              </div>
              <div className="grid gap-3 p-4 text-xs text-zinc-300 sm:grid-cols-2">
                <p><span className="text-zinc-500">Software target:</span> {renderLag.software}</p>
                <p><span className="text-zinc-500">Scene type:</span> {renderLag.scene}</p>
                <p><span className="text-zinc-500">Recommended preview resolution:</span> {renderSafeResolution}</p>
                <p><span className="text-zinc-500">Estimated performance score:</span> {renderPerformance}/100</p>
                <p><span className="text-zinc-500">Texture recommendation:</span> {renderLag.texture === 'Ultra' ? 'Reduce to medium/high while testing.' : `Use ${renderLag.texture.toLowerCase()} for previews.`}</p>
                <p><span className="text-zinc-500">Light optimization advice:</span> {renderLag.lights > 10 ? 'Disable extra lights before test renders.' : 'Current light count is manageable.'}</p>
                <p className="sm:col-span-2"><span className="text-zinc-500">Vegetation optimization advice:</span> {renderLag.vegetation > 30 ? 'Use proxies, hide distant trees, and replace high-poly planting.' : 'Vegetation load is acceptable for this profile.'}</p>
              </div>
              <div className="border-t border-white/10 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Active optimization actions</p>
                <div className="mb-3 grid gap-2 sm:grid-cols-2">{renderActions.map((action) => <span key={action} className="rounded border border-white/10 bg-[#11151b] p-2 text-xs text-zinc-300">{action}</span>)}</div>
                <pre className="max-h-72 overflow-auto rounded-md bg-black/40 p-3 font-mono text-xs leading-5 text-emerald-300">{renderPackContent}</pre>
              </div>
            </div>
          )}
        </ScriptCard>
        <ScriptCard title="CAD Import Cleanup Assistant" subtitle="Prepare imported CAD plans for SketchUp without dragging junk geometry into the model.">
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">CAD source</span><select className={inputClass()} value={cadImport.source} onChange={(event) => setCadImport({ ...cadImport, source: event.target.value })}>{['AutoCAD', 'downloaded DWG', 'classmate file', 'online block', 'exported PDF/DWG'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Problem</span><select className={inputClass()} value={cadImport.problem} onChange={(event) => setCadImport({ ...cadImport, problem: event.target.value })}>{['Lag', 'no faces forming', 'wrong scale', 'too many lines', 'broken walls'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="flex items-center gap-2 rounded border border-white/10 bg-[#11151b] p-2 text-xs text-zinc-300"><input type="checkbox" checked={cadImport.sketchup} onChange={() => setCadImport({ ...cadImport, sketchup: !cadImport.sketchup })} className="accent-cyan-300" />Need to import into SketchUp</label>
          </div>
          <pre className="mt-4 whitespace-pre-wrap rounded-md bg-black/30 p-3 text-xs leading-5 text-zinc-300">{cleanupGuide}</pre>
          <button className="mt-3 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200" onClick={() => downloadText('ArchiVault_CAD_Import_Cleanup_Guide.txt', cleanupGuide)}>Generate Cleanup Plan</button>
        </ScriptCard>
      </div>
    </section>
  );
}

export default function BimStudioTab() {
  const [form, setForm] = useState({
    width: 12,
    length: 10,
    height: 6,
    floors: 2,
    floorHeight: 3,
    sectionDirection: 'Longitudinal Section',
    scale: '1:100',
  });
  const [views, setViews] = useState<Record<ElevationKey, boolean>>({
    front: true,
    rear: true,
    left: true,
    right: true,
    roof: false,
    perspective: false,
  });
  const [sketchUpOpts, setSketchUpOpts] = useState({ elevations: true, parallel: true, sections: true });
  const [revitOpts, setRevitOpts] = useState({ purge: true, stripCad: true, clearLogs: false });
  const [generated, setGenerated] = useState(false);
  const [renderPrep, setRenderPrep] = useState({ software: 'Enscape', scene: 'Exterior', time: 'Golden Hour', style: 'Presentation Board' });
  const [concept, setConcept] = useState({ type: 'Community Center', location: 'urban corner lot', users: 'students and residents', inspiration: 'woven courtyard movement', climate: 'heat gain and monsoon rain', material: 'concrete, timber, and glass', mood: 'warm minimalist', spatial: 'central courtyard spine' });

  const selectedScenes = useMemo(() => elevationOptions.filter((item) => views[item.key]), [views]);
  const scaleSuffix = form.scale.replace(':', '-');
  const outputFiles = selectedScenes.map((item) => item.file.replace('1-100', scaleSuffix));
  const renderScore = 78 + (renderPrep.time === 'Golden Hour' ? 8 : 0) + (renderPrep.style === 'Realistic' ? 4 : 0);
  const renderChecklist = [
    `Camera composition: use eye-level view for ${renderPrep.scene.toLowerCase()} scenes and keep verticals straight.`,
    `Lighting: ${renderPrep.time} requires balanced exposure and soft shadow control.`,
    `Materials: verify texture scale, bump maps, and missing texture paths before export.`,
    `Model performance: hide unused tags, proxy heavy entourage, and purge imported mesh clutter.`,
    `Export settings: ${renderPrep.style === 'Competition' ? '3840px wide minimum with high AA' : '3000px wide PNG with transparent naming discipline'}.`,
  ];
  const conceptKeywords = [concept.inspiration.split(' ')[0] || 'Context', concept.material.split(',')[0] || 'Material', concept.spatial.split(' ')[0] || 'Space'];
  const conceptStatement = `${concept.type} in ${concept.location} shaped by ${concept.inspiration}, creating a ${concept.mood} environment for ${concept.users}.`;
  const conceptNarrative = `The proposal organizes the project around a ${concept.spatial}. It responds to ${concept.climate} through orientation, shaded edges, and breathable thresholds. ${concept.material} express the design mood while keeping the architecture clear, buildable, and easy to explain on presentation boards.`;

  const cameraGuide = [
    `Front camera: position at Y = -${form.length + 8}m, target center of model.`,
    `Rear camera: position at Y = ${form.length + 8}m, target center of model.`,
    `Left camera: position at X = -${form.width + 8}m, target center of model.`,
    `Right camera: position at X = ${form.width + 8}m, target center of model.`,
  ];

  function rubyGuide() {
    const scenes = selectedScenes.map((scene) => scene.scene);
    const sceneArray = scenes.map((scene) => `"${scene}"`).join(', ');
    return [
      '# ArchiVault SketchUp Ruby Automation Script',
      'model = Sketchup.active_model',
      'pages = model.pages',
      'view = model.active_view',
      'entities = model.entities',
      '',
      `scene_names = [${sceneArray}]`,
      'scene_names.each do |scene_name|',
      '  page = pages.add(scene_name)',
      '  page.use_camera = true',
      '  page.use_rendering_options = true',
      'end',
      '',
      'if view.camera.respond_to?(:perspective=)',
      '  view.camera.perspective = false',
      'end',
      '',
      'model.rendering_options["DisplayMode"] = 2',
      'model.rendering_options["SectionDisplayMode"] = 1',
      '',
      '# Section plane placeholders',
      `# Section direction: ${form.sectionDirection}`,
      'if entities.respond_to?(:add_section_plane)',
      '  entities.add_section_plane([0, 0, 0], [1, 0, 0])',
      'end',
      '',
      'model.pages.each { |page| page.update }',
      'UI.messagebox("ArchiVault SketchUp view setup scenes generated.")',
      '',
    ].join('\n');
  }

  function revitMacroPack() {
    const dyn = {
      name: 'ArchiVault_Revit_Cleanup',
      enabledDiagnostics: revitOpts,
      graphNotes: [
        'Purge unused RFA families',
        'Collect and remove imported DWG links',
        'Clear warning log review queue',
      ],
    };
    const cs = [
      '// ArchiVault Revit BIM Optimization Macro Pack',
      '// Use as a C# macro planning reference or Dynamo Player checklist.',
      revitOpts.purge ? 'Run: PurgeUnusedFamilies(document);' : '// Purge families disabled',
      revitOpts.stripCad ? 'Run: StripEmbeddedCadLinks(document);' : '// Strip CAD links disabled',
      revitOpts.clearLogs ? 'Run: ClearBackgroundWarningLogs(document);' : '// Clear warning logs disabled',
      '',
    ].join('\n');
    return `ARCHIVAULT_MACRO_PACK.zip\n\n--- ArchiVault_Revit_Cleanup.dyn ---\n${JSON.stringify(dyn, null, 2)}\n\n--- RevitCleanupMacro.cs ---\n${cs}`;
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-[#080a0d] p-5">
        <h2 className="text-lg font-semibold text-white">3D & BIM Studio</h2>
        <p className="mt-1 text-sm text-zinc-500">Tools for SketchUp, Revit, and BIM-oriented asset preparation.</p>
      </div>

      <SketchUpScriptSuite />
      <OptimizationUtilitySuite />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">SketchUp Auto Elevations & Sections Helper</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Generate clean section and elevation setup guides from a SketchUp model workflow.</p>
            </div>
            <ScanLine className="h-5 w-5 text-cyan-300" />
          </div>
          <p className="mb-5 text-sm leading-6 text-zinc-400">
            A lightweight assistant that prepares elevation views, section cuts, camera positions, scene names, and export instructions so students can create Revit-like drawing views inside SketchUp without manually setting everything from scratch.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Model Width, meters</span><input className={inputClass()} type="number" value={form.width} onChange={(event) => setForm({ ...form, width: Number(event.target.value) })} /></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Model Length, meters</span><input className={inputClass()} type="number" value={form.length} onChange={(event) => setForm({ ...form, length: Number(event.target.value) })} /></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Model Height, meters</span><input className={inputClass()} type="number" value={form.height} onChange={(event) => setForm({ ...form, height: Number(event.target.value) })} /></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Number of Floors</span><input className={inputClass()} type="number" value={form.floors} onChange={(event) => setForm({ ...form, floors: Number(event.target.value) })} /></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Floor-to-Floor Height</span><input className={inputClass()} type="number" value={form.floorHeight} onChange={(event) => setForm({ ...form, floorHeight: Number(event.target.value) })} /></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Output Drawing Scale</span><select className={inputClass()} value={form.scale} onChange={(event) => setForm({ ...form, scale: event.target.value })}><option>1:50</option><option>1:100</option><option>1:200</option></select></label>
          </div>
          <label className="mt-4 block"><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Section Cut Direction</span><select className={inputClass()} value={form.sectionDirection} onChange={(event) => setForm({ ...form, sectionDirection: event.target.value })}><option>Longitudinal Section</option><option>Cross Section</option><option>Center Section</option><option>Custom Section Line</option></select></label>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {elevationOptions.map((item) => (
              <label key={item.key} className="flex items-center gap-3 rounded-md border border-white/10 bg-[#11151b] p-3 text-sm text-zinc-200">
                <input type="checkbox" checked={views[item.key]} onChange={() => setViews((current) => ({ ...current, [item.key]: !current[item.key] }))} className="h-4 w-4 accent-cyan-300" />
                {item.label}
              </label>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => setGenerated(true)} className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-200">Generate SketchUp View Setup</button>
            <button onClick={() => downloadText('archivault_sketchup_view_guide.rb', rubyGuide())} className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-white/[0.08]"><Download className="h-4 w-4" /> Export SketchUp Ruby Guide</button>
          </div>
        </div>

        <ViewSetupPreview sectionDirection={form.sectionDirection} selectedViews={views} />
      </div>

      {generated && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-5">
            <h3 className="text-sm font-semibold text-cyan-100">Recommended Camera Positions</h3>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-cyan-50/80">{cameraGuide.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-white">Generated Scene Names</h3>
            <ul className="mt-3 space-y-2 font-mono text-xs text-zinc-400">{selectedScenes.map((item) => <li key={item.scene}>{item.scene}</li>)}<li>SKP_SECTION_AA</li><li>SKP_SECTION_BB</li></ul>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-white">Export File Names</h3>
            <ul className="mt-3 space-y-2 font-mono text-xs text-zinc-400">{outputFiles.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 lg:col-span-3">
            <h3 className="text-sm font-semibold text-white">Output Checklist</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {['Set camera to Parallel Projection', 'Use standard orthographic views', 'Turn off unnecessary tags/layers', 'Hide furniture for structural sections', 'Enable section fill', 'Use monochrome or hidden line style', 'Save each view as a SketchUp Scene', 'Export each scene at high resolution', 'Import exported views into layout board'].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-md bg-[#11151b] p-3 text-xs text-zinc-300"><CheckCircle2 className="h-4 w-4 text-cyan-300" />{item}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between"><h3 className="text-base font-semibold text-white">Render Scene Prep Assistant</h3><Sparkles className="h-5 w-5 text-cyan-300" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Render Software</span><select className={inputClass()} value={renderPrep.software} onChange={(e) => setRenderPrep({ ...renderPrep, software: e.target.value })}>{['SketchUp', 'Lumion', 'Enscape', 'Twinmotion', 'D5 Render', 'V-Ray'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Scene Type</span><select className={inputClass()} value={renderPrep.scene} onChange={(e) => setRenderPrep({ ...renderPrep, scene: e.target.value })}>{['Exterior', 'Interior', 'Site', 'Aerial', 'Detail Shot'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Time of Day</span><select className={inputClass()} value={renderPrep.time} onChange={(e) => setRenderPrep({ ...renderPrep, time: e.target.value })}>{['Morning', 'Noon', 'Golden Hour', 'Night'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Style</span><select className={inputClass()} value={renderPrep.style} onChange={(e) => setRenderPrep({ ...renderPrep, style: e.target.value })}>{['Realistic', 'Conceptual', 'Minimal', 'Presentation Board', 'Competition'].map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3"><p className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">Render readiness score</p><div className="mt-2 h-3 rounded-full bg-black/30"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.min(renderScore, 100)}%` }} /></div><p className="mt-2 text-lg font-semibold text-white">{Math.min(renderScore, 100)}/100</p></div>
          <div className="mt-3 space-y-2">{renderChecklist.map((item) => <p key={item} className="rounded-md border border-white/10 bg-[#11151b] p-2 text-xs leading-5 text-zinc-300">{item}</p>)}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between"><h3 className="text-base font-semibold text-white">Design Concept Helper</h3><Sparkles className="h-5 w-5 text-cyan-300" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(concept).map(([key, value]) => <label key={key}><span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-zinc-500">{key}</span><input className={inputClass()} value={value} onChange={(e) => setConcept({ ...concept, [key]: e.target.value })} /></label>)}
          </div>
          <div className="mt-4 rounded-md border border-cyan-300/20 bg-[#11151b] p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Design Concept</p>
            <p className="mt-2 text-sm font-semibold text-white">{conceptStatement}</p>
            <p className="mt-3 text-xs leading-5 text-zinc-400">{conceptNarrative}</p>
            <div className="mt-3 flex flex-wrap gap-2">{conceptKeywords.map((item) => <span key={item} className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">{item}</span>)}</div>
            <p className="mt-3 text-xs text-zinc-400">Suggested title: {conceptKeywords.join(' ')} {concept.type}</p>
            <p className="mt-1 text-xs text-zinc-400">Diagram labels: concept axis, climate buffer, material threshold, spatial hierarchy.</p>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between"><h3 className="text-base font-semibold text-white">SketchUp API Hub</h3><FileCode2 className="h-5 w-5 text-cyan-300" /></div>
          {[
            ['elevations', 'Generate Standard 4 Elevations'],
            ['parallel', 'Force Parallel Projection View'],
            ['sections', 'Auto-Setup Section Cut Planes'],
          ].map(([key, label]) => (
            <label key={key} className="mb-3 flex items-center gap-3 text-sm text-zinc-300"><input type="checkbox" checked={sketchUpOpts[key as keyof typeof sketchUpOpts]} onChange={() => setSketchUpOpts((current) => ({ ...current, [key]: !current[key as keyof typeof current] }))} className="accent-cyan-300" />{label}</label>
          ))}
          <button onClick={() => downloadText('sketchup_ruby_automation_script.rb', rubyGuide())} className="mt-2 w-full rounded-md border border-cyan-300/40 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-300/10">Compile Ruby Automation Script</button>
          <p className="mt-4 text-[11px] leading-5 text-zinc-500">Ruby Console Guide: Load the generated .rb file inside SketchUp's Ruby Console pipeline to automate view setups.</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between"><h3 className="text-base font-semibold text-white">Revit Project Auditing</h3><Layers3 className="h-5 w-5 text-cyan-300" /></div>
          {[
            ['purge', 'Deep Purge Unused RFA Families'],
            ['stripCad', 'Strip Embedded CAD Links (.dwg)'],
            ['clearLogs', 'Clear Background Database Warning Logs'],
          ].map(([key, label]) => (
            <label key={key} className="mb-3 flex items-center gap-3 text-sm text-zinc-300"><input type="checkbox" checked={revitOpts[key as keyof typeof revitOpts]} onChange={() => setRevitOpts((current) => ({ ...current, [key]: !current[key as keyof typeof current] }))} className="accent-cyan-300" />{label}</label>
          ))}
          <div className="mb-4 rounded-md border border-white/10 bg-[#080a0d] p-3">
            <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
              <div className={`rounded border p-2 ${revitOpts.purge ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : 'border-white/10 text-zinc-500'}`}>Families</div>
              <div className={`rounded border p-2 ${revitOpts.stripCad ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : 'border-white/10 text-zinc-500'}`}>CAD Links</div>
              <div className={`rounded border p-2 ${revitOpts.clearLogs ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : 'border-white/10 text-zinc-500'}`}>Warnings</div>
            </div>
          </div>
          <button onClick={() => downloadText('ArchiVault_Revit_BIM_Optimization_Macro_Pack.zip', revitMacroPack())} className="mt-2 w-full rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-200">Generate BIM Optimization Macro Pack</button>
          <p className="mt-4 text-[11px] leading-5 text-zinc-500">BIM Admin Guide: Import this layout automation graph into your Revit Dynamo Player to launch the database deep-cleansing pipeline.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['BIM Asset Checklist', 'Check model naming, family organization, scale, and metadata.'],
          ['OBJ Mesh Intake', 'Analyze uploaded .obj files for size and optimization.'],
          ['Render Prep Checklist', 'Prepare model for clean rendering output.'],
          ['Section/Elevation Checklist', 'Generate section and elevation setup instructions.'],
        ].map(([title, text]) => (
          <div key={title} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <Box className="mb-3 h-5 w-5 text-cyan-300" />
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
