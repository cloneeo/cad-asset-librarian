import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Compass,
  Download,
  Lightbulb,
  Loader2,
  MapPin,
  Ruler,
  ShieldCheck,
  Wind,
  Sun,
  Zap,
  Calculator,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

type LotType = 'inside' | 'corner' | 'through';
type ZoningType = 'r1' | 'r2' | 'r3';

type PD1096Response = {
  status: string;
  code_reference: string;
  zoning_label: string;
  tosl: {
    percentage: number;
    required_open_space_sqm: number;
    formula: string;
  };
  ambf: {
    allowable_maximum_building_footprint_sqm: number;
    formula: string;
  };
  setbacks_m: Record<string, number>;
  notes: string[];
};

type TileResponse = {
  status: string;
  file_name: string;
  summary: {
    room_area_sqm: number;
    tile_area_sqm: number;
    raw_tiles_required: number;
    recommended_tiles_with_wastage: number;
    grid_columns: number;
    grid_rows: number;
    tile_size_mm: number;
    wastage_percent: number;
  };
  autocad_script: string;
};

function inputClass() {
  return 'w-full rounded-md border border-white/10 bg-[#11151b] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function buttonClass(variant: 'primary' | 'secondary' = 'primary') {
  if (variant === 'secondary') {
    return 'inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]';
  }
  return 'inline-flex items-center justify-center gap-2 rounded-md bg-cyan-400 px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300';
}

function downloadScript(fileName: string, scriptContent: string) {
  const blob = new Blob([scriptContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function EnvironmentalCompass({ northAngle, setNorthAngle }: { northAngle: number; setNorthAngle: (value: number) => void }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [windowHeight, setWindowHeight] = useState(2.5);
  const [targetMonth, setTargetMonth] = useState('december');

  // Complete 12-month tropical solar altitude angles for Manila (14.6°N)
  // Data based on Philippine astronomical profiles
  const monthData: Record<string, { label: string; solarAltitude: number; category: 'high' | 'low' | 'equinox' }> = {
    january: { label: 'January (Winter Solstice Cycle - Low Sun Angle)', solarAltitude: 35, category: 'low' },
    february: { label: 'February (Early Spring Transition - Mid-Low Angle)', solarAltitude: 40, category: 'equinox' },
    march: { label: 'March (Vernal Equinox Cycle - Neutral Angle)', solarAltitude: 50, category: 'equinox' },
    april: { label: 'April (Dry Season Ascent - Rising Sun Angle)', solarAltitude: 60, category: 'equinox' },
    may: { label: 'May (Peak Dry Season - High Sun Angle)', solarAltitude: 72, category: 'high' },
    june: { label: 'June (Summer Solstice Peak - Maximum High Sun)', solarAltitude: 78, category: 'high' },
    july: { label: 'July (Monsoon Solstice Split - High Sun Angle)', solarAltitude: 76, category: 'high' },
    august: { label: 'August (Late Summer Transition - Mid-High Angle)', solarAltitude: 68, category: 'equinox' },
    september: { label: 'September (Autumnal Equinox Cycle - Neutral Angle)', solarAltitude: 55, category: 'equinox' },
    october: { label: 'October (Late Rain Transition - Mid-Low Angle)', solarAltitude: 45, category: 'equinox' },
    november: { label: 'November (Winter Solstice Ascent - Low Sun Angle)', solarAltitude: 38, category: 'low' },
    december: { label: 'December (Winter Solstice Peak - Maximum Low Sun)', solarAltitude: 32, category: 'low' },
  };

  // Calculate overhang depth with scaling coefficients based on sun angle category
  const overhanDepth = useMemo(() => {
    const monthInfo = monthData[targetMonth];
    const angle = monthInfo?.solarAltitude || 50;
    const category = monthInfo?.category || 'equinox';
    
    const radians = (angle * Math.PI) / 180;
    let baseDepth = windowHeight / Math.tan(radians);
    
    // Apply scaling coefficients based on season
    // High sun (May-July): Less overhang needed (shorter shadow projection)
    // Low sun (November-January): More overhang needed (longer shadow projection)
    // Equinox: Standard calculation
    let scaledDepth = baseDepth;
    if (category === 'high') {
      scaledDepth = baseDepth * 0.65; // Reduce by 35% for high sun
    } else if (category === 'low') {
      scaledDepth = baseDepth * 1.8; // Increase by 80% for low sun
    }
    
    return Math.round(scaledDepth * 1000); // Convert to mm
  }, [windowHeight, targetMonth, monthData]);

  // Check if structural warning is needed
  const needsStructuralWarning = overhanDepth > 1200;

  // Get material specification based on month category
  const getMaterialSpec = () => {
    const monthInfo = monthData[targetMonth];
    const category = monthInfo?.category || 'equinox';

    if (category === 'low') {
      return {
        title: 'Thermal Mass Check',
        content: 'Lower winter sun vectors optimize daylight penetration. Ensure clear-pane solar window assemblies on southern exposure walls to capture passive morning warmth. Consider lighter colored exterior finishes to reflect excess solar radiation.'
      };
    } else if (category === 'high') {
      return {
        title: 'Heat Mitigation Check',
        content: 'Use double-insulated concrete masonry structures or exterior structural shade louvers on western vectors to block intensive radiant heat loads. High thermal mass brick aggregates recommended for heat damping.'
      };
    } else {
      return {
        title: 'Moderate Climate Balance',
        content: 'During equinox periods, design for flexible solar control. Operable shading devices and moderate thermal mass provide balance. Prioritize cross-ventilation pathways.'
      };
    }
  };

  // Dynamic recommendations including afternoon sun
  const recommendations = useMemo(() => {
    const normalizedAngle = ((northAngle % 360) + 360) % 360;
    
    // Check each quadrant for solar exposure
    const morningLight = normalizedAngle >= 45 && normalizedAngle <= 135;
    const afternoonHeat = normalizedAngle >= 225 && normalizedAngle <= 315;
    const coolWinds = normalizedAngle >= 45 && normalizedAngle <= 225;
    const monsoonWinds = normalizedAngle >= 225 || normalizedAngle <= 45;

    const recs = [];

    if (morningLight) {
      recs.push({
        icon: Sun,
        title: 'Morning Light Opportunity',
        content: 'Place bedrooms and living zones on the east-facing side to capture morning light and natural warmth. This promotes circadian rhythm alignment and passive solar heating.',
        category: 'Living Zones'
      });
    }

    if (afternoonHeat) {
      recs.push({
        icon: MapPin,
        title: 'Afternoon Solar Buffer Zones',
        content: 'Locate toilets, stairwells, and utility areas on the western facade to absorb harsh afternoon solar gain. Add deep eaves/overhangs (use calculator above) to block afternoon sun while maintaining ventilation.',
        category: 'Critical - Buffer Zones'
      });
    }

    if (coolWinds) {
      recs.push({
        icon: Wind,
        title: 'Cross-Ventilation Strategy (Amihan)',
        content: 'Position windows perpendicular to the Amihan pathway (NE-SW vectors). Open windows on the northeast side for incoming cool breezes; exhaust through southwest openings for optimal air circulation.',
        category: 'Ventilation'
      });
    }

    if (monsoonWinds) {
      recs.push({
        icon: Wind,
        title: 'Monsoon Window Placement (Habagat)',
        content: 'Align secondary ventilation with Habagat vectors (SW-NE). Position operable louvers on southwest-facing walls to capture monsoon moisture and cooling airflow.',
        category: 'Ventilation'
      });
    }

    return recs;
  }, [northAngle]);

  async function exportSiteAnalysis() {
    setExporting(true);
    setExportError('');
    try {
      const response = await fetch(`${API_BASE}/api/v1/environmental/export-vector-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ north_angle: northAngle }),
      });
      if (!response.ok) throw new Error(await response.text());
      
      const blob = new Blob([await response.arrayBuffer()], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Site_Analysis_Vectors.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  const materialSpec = getMaterialSpec();

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 space-y-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Environmental Compass</h3>
          <p className="mt-1 text-xs text-zinc-500">Orient the site north angle to preview wind and solar vectors with dynamic calculations.</p>
        </div>
        <Compass className="h-5 w-5 text-cyan-300" />
      </div>

      <Field label={`North orientation angle: ${northAngle}°`}>
        <input
          className="w-full accent-cyan-300"
          type="range"
          min="0"
          max="360"
          step="5"
          value={northAngle}
          onChange={(event) => setNorthAngle(Number(event.target.value))}
        />
      </Field>

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.95fr_1.05fr_0.8fr]">
        {/* Compass Visualization */}
        <div className="mx-auto aspect-square w-full max-w-[280px] rounded-full border border-cyan-300/30 bg-[#080a0d] p-5">
          <div
            className="relative h-full w-full rounded-full border border-white/10 bg-[radial-gradient(circle,rgba(34,211,238,0.12)_1px,transparent_1px)] bg-[size:24px_24px]"
            style={{ transform: `rotate(${northAngle}deg)` }}
          >
            {/* Cardinal directions (rotate with north) */}
            <div className="absolute left-1/2 top-2 -translate-x-1/2 text-xs font-bold text-cyan-100">N</div>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-bold text-zinc-500">S</div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">E</div>
            <div className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">W</div>

            {/* Amihan vector (NE-SW, cyan, rotates with north) */}
            <div className="absolute left-1/2 top-1/2 h-[2px] w-[72%] origin-left -translate-y-1/2 rotate-45 bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.55)]" />
            
            {/* Habagat vector (SW-NE, green, rotates with north) */}
            <div className="absolute left-1/2 top-1/2 h-[2px] w-[72%] origin-left -translate-y-1/2 rotate-[225deg] bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.45)]" />
            
            {/* Morning Sun vector (locked to East, yellow, counter-rotates) */}
            <div 
              className="absolute left-1/2 top-1/2 h-[2px] w-[58%] origin-left -translate-y-1/2 bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.45)]"
              style={{ transform: `rotate(${-northAngle}deg)` }}
            />
            
            {/* Afternoon Sun vector (locked to West, orange/red, counter-rotates) */}
            <div 
              className="absolute left-1/2 top-1/2 h-[2px] w-[58%] origin-left -translate-y-1/2 bg-orange-500 shadow-[0_0_14px_rgba(249,115,22,0.55)]"
              style={{ transform: `rotate(${180 - northAngle}deg)` }}
            />
            
            {/* Center point */}
            <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
          </div>
        </div>

        {/* Vector Legend */}
        <div className="grid content-start gap-3">
          {[
            ['Amihan pathway', 'Northeast wind (cool breeze)', 'bg-cyan-300'],
            ['Habagat pathway', 'Southwest monsoon moisture', 'bg-emerald-300'],
            ['Morning Solar Entry', 'East-facing warm light', 'bg-amber-300'],
            ['Afternoon Solar Track', 'West-facing harsh heat', 'bg-orange-500'],
          ].map(([label, description, color]) => (
            <div key={label} className="rounded-md border border-white/10 bg-[#11151b] p-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-8 rounded-full ${color}`} />
                <p className="text-sm font-semibold text-white">{label}</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-400">{description}</p>
            </div>
          ))}
        </div>

        {/* Eaves & Overhang Calculator */}
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 flex flex-col">
          <div className="mb-3 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-cyan-300" />
            <h4 className="text-sm font-semibold text-white">Overhang Calculator</h4>
          </div>
          
          <label className="mb-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500 mb-1 block">Window Height (m)</span>
            <input
              type="number"
              min="1"
              max="5"
              step="0.1"
              value={windowHeight}
              onChange={(e) => setWindowHeight(Number(e.target.value))}
              className="w-full bg-[#0c1016] border border-white/10 rounded px-2 py-1.5 text-xs text-cyan-100 focus:border-cyan-300/50 focus:outline-none transition"
            />
          </label>

          <label className="mb-4">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500 mb-1 block">Target Month</span>
            <select
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value)}
              className="w-full bg-[#0c1016] border border-white/10 rounded px-2 py-1.5 text-xs text-cyan-100 focus:border-cyan-300/50 focus:outline-none transition"
            >
              {Object.entries(monthData).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>

          <div className={`rounded-md p-3 mt-auto ${needsStructuralWarning ? 'bg-amber-300/10 border border-amber-300/30' : 'bg-cyan-300/10 border border-cyan-300/30'}`}>
            <p className={`text-[10px] font-medium uppercase tracking-[0.14em] ${needsStructuralWarning ? 'text-amber-200' : 'text-cyan-200'} mb-1`}>Eaves Depth Required</p>
            <p className={`text-lg font-bold ${needsStructuralWarning ? 'text-amber-100' : 'text-cyan-100'}`}>{overhanDepth} <span className="text-xs text-zinc-500">mm</span></p>
            <p className="text-[10px] text-zinc-400 mt-1">Use deep overhangs to block afternoon/summer sun while preserving cross-ventilation.</p>
            {needsStructuralWarning && (
              <div className="mt-3 pt-3 border-t border-amber-300/20">
                <p className="text-[10px] text-amber-200 font-medium">⚠️ Structural Alert: Overhang depth is highly extensive. Structural support elements like concrete columns or structural canopy cantilever framing brackets are highly recommended.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Design Advisory Studio */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-300" />
          <h4 className="text-base font-semibold text-white">Design Advisory Studio</h4>
        </div>
        
        {/* Material Specification Section */}
        <div className="rounded-md border border-emerald-300/30 bg-emerald-300/10 p-3">
          <div className="flex items-start gap-2 mb-2">
            <span className="text-lg">🧱</span>
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">Material Specification Study</p>
              <p className="mt-1 text-sm font-medium text-white">{materialSpec.title}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">{materialSpec.content}</p>
            </div>
          </div>
        </div>

        {/* Location-Based Recommendations */}
        {recommendations.length > 0 ? (
          <div className="space-y-3">
            {recommendations.map((rec, idx) => {
              const Icon = rec.icon;
              return (
                <div key={idx} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">{rec.category}</p>
                      <p className="mt-1 text-sm font-medium text-white">{rec.title}</p>
                      <p className="mt-2 text-xs leading-5 text-zinc-400">{rec.content}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 italic">Adjust site orientation to receive location-specific design recommendations.</p>
        )}
      </div>

      {/* Export Button */}
      <button
        onClick={exportSiteAnalysis}
        disabled={exporting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Export Site Analysis Diagram Script
      </button>

      {exportError && <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{exportError}</p>}
    </div>
  );
}

export default function ComplianceLab() {
  const [complianceForm, setComplianceForm] = useState({
    lot_area_sqm: 240,
    lot_type: 'inside' as LotType,
    zoning: 'r1' as ZoningType,
  });
  const [tileForm, setTileForm] = useState({
    room_width_meters: 4.2,
    room_length_meters: 3.6,
    tile_size_mm: 600,
    wastage_percent: 10,
  });
  const [northAngle, setNorthAngle] = useState(0);
  const [complianceResult, setComplianceResult] = useState<PD1096Response | null>(null);
  const [tileResult, setTileResult] = useState<TileResponse | null>(null);
  const [complianceBusy, setComplianceBusy] = useState(false);
  const [tileBusy, setTileBusy] = useState(false);
  const [error, setError] = useState('');

  const tileGridPreview = useMemo(() => {
    if (!tileResult) return null;
    return {
      columns: Math.min(tileResult.summary.grid_columns, 18),
      rows: Math.min(tileResult.summary.grid_rows, 18),
    };
  }, [tileResult]);

  async function computeCompliance() {
    setComplianceBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/v1/compliance/pd1096`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(complianceForm),
      });
      if (!response.ok) throw new Error(await response.text());
      setComplianceResult(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compliance calculation failed.');
    } finally {
      setComplianceBusy(false);
    }
  }

  async function computeTileEstimate(download = false) {
    setTileBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/v1/quantity/tile-estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tileForm),
      });
      if (!response.ok) throw new Error(await response.text());
      const payload: TileResponse = await response.json();
      setTileResult(payload);
      if (download) downloadScript(payload.file_name, payload.autocad_script);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tile estimate failed.');
    } finally {
      setTileBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-[#080a0d] p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Compliance & Environmental Lab</h2>
            <p className="mt-1 text-sm text-zinc-500">PD 1096 planning checks, tile quantity scripting, and climate orientation previews.</p>
          </div>
          <ShieldCheck className="h-6 w-6 text-cyan-300" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* PD 1096 Compliance Calculator */}
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Ruler className="h-5 w-5 text-cyan-300" />
            <h3 className="text-base font-semibold text-white">PD 1096 Compliance Check</h3>
          </div>

          <div className="space-y-4">
            <Field label="Lot Area (sqm)">
              <input
                type="number"
                min="100"
                max="5000"
                step="10"
                value={complianceForm.lot_area_sqm}
                onChange={(e) => setComplianceForm({ ...complianceForm, lot_area_sqm: Number(e.target.value) })}
                className={inputClass()}
              />
            </Field>

            <Field label="Lot Type">
              <select
                value={complianceForm.lot_type}
                onChange={(e) => setComplianceForm({ ...complianceForm, lot_type: e.target.value as LotType })}
                className={inputClass()}
              >
                <option value="inside">Inside Lot</option>
                <option value="corner">Corner Lot</option>
                <option value="through">Through Lot</option>
              </select>
            </Field>

            <Field label="Zoning Classification">
              <select
                value={complianceForm.zoning}
                onChange={(e) => setComplianceForm({ ...complianceForm, zoning: e.target.value as ZoningType })}
                className={inputClass()}
              >
                <option value="r1">R1 (Residential Low Density)</option>
                <option value="r2">R2 (Residential Medium Density)</option>
                <option value="r3">R3 (Residential High Density)</option>
              </select>
            </Field>

            <button onClick={computeCompliance} disabled={complianceBusy} className={buttonClass()}>
              {complianceBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              Compute Compliance
            </button>
          </div>

          {complianceResult && (
            <div className="mt-5 space-y-3 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">{complianceResult.code_reference}</p>
              <div>
                <p className="text-sm font-semibold text-white">{complianceResult.zoning_label}</p>
                <div className="mt-3 space-y-2 text-xs text-zinc-400">
                  <p><strong className="text-white">TOSL:</strong> {complianceResult.tosl.percentage}% ({complianceResult.tosl.required_open_space_sqm} sqm)</p>
                  <p><strong className="text-white">AMBF:</strong> {complianceResult.ambf.allowable_maximum_building_footprint_sqm} sqm</p>
                  {Object.entries(complianceResult.setbacks_m).map(([side, val]) => (
                    <p key={side}><strong className="text-white">{side}:</strong> {val}m</p>
                  ))}
                </div>
              </div>
              {complianceResult.notes.length > 0 && (
                <div className="rounded border border-white/10 bg-black/20 p-2">
                  {complianceResult.notes.map((note, i) => <p key={i} className="text-xs leading-5 text-zinc-300">{note}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tile Quantity Estimator */}
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-cyan-300" />
            <h3 className="text-base font-semibold text-white">Tile Quantity Estimator</h3>
          </div>

          <div className="space-y-4">
            <Field label="Room Width (m)">
              <input
                type="number"
                min="1"
                max="20"
                step="0.1"
                value={tileForm.room_width_meters}
                onChange={(e) => setTileForm({ ...tileForm, room_width_meters: Number(e.target.value) })}
                className={inputClass()}
              />
            </Field>

            <Field label="Room Length (m)">
              <input
                type="number"
                min="1"
                max="20"
                step="0.1"
                value={tileForm.room_length_meters}
                onChange={(e) => setTileForm({ ...tileForm, room_length_meters: Number(e.target.value) })}
                className={inputClass()}
              />
            </Field>

            <Field label="Tile Size (mm)">
              <select
                value={tileForm.tile_size_mm}
                onChange={(e) => setTileForm({ ...tileForm, tile_size_mm: Number(e.target.value) })}
                className={inputClass()}
              >
                <option value={300}>300 mm (small)</option>
                <option value={400}>400 mm (standard)</option>
                <option value={600}>600 mm (medium)</option>
                <option value={800}>800 mm (large)</option>
              </select>
            </Field>

            <Field label="Wastage %">
              <input
                type="number"
                min="5"
                max="30"
                step="1"
                value={tileForm.wastage_percent}
                onChange={(e) => setTileForm({ ...tileForm, wastage_percent: Number(e.target.value) })}
                className={inputClass()}
              />
            </Field>

            <div className="flex gap-2">
              <button onClick={() => computeTileEstimate(false)} disabled={tileBusy} className={buttonClass()}>
                {tileBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Calculate
              </button>
              <button onClick={() => computeTileEstimate(true)} disabled={tileBusy || !tileResult} className={buttonClass('secondary')}>
                <Download className="h-4 w-4" />
                Export Script
              </button>
            </div>
          </div>

          {tileResult && (
            <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-md border border-white/10 bg-[#11151b] p-4">
                <p className="text-sm font-semibold text-white">{tileResult.summary.recommended_tiles_with_wastage} tiles recommended</p>
                <p className="mt-2 text-xs leading-5 text-zinc-400">
                  {tileResult.summary.room_area_sqm} sqm room, {tileResult.summary.raw_tiles_required} raw tiles, {tileResult.summary.wastage_percent}% wastage.
                </p>
              </div>
              <div className="aspect-[1.25/1] rounded-md border border-cyan-300/20 bg-[#080a0d] p-3">
                <div
                  className="h-full w-full rounded border border-cyan-300/30 bg-cyan-300/10"
                  style={{
                    backgroundImage: 'linear-gradient(90deg, rgba(34,211,238,0.35) 1px, transparent 1px), linear-gradient(rgba(34,211,238,0.35) 1px, transparent 1px)',
                    backgroundSize: tileGridPreview ? `${100 / tileGridPreview.columns}% ${100 / tileGridPreview.rows}%` : '20% 20%',
                  }}
                />
              </div>
              <pre className="lg:col-span-2 max-h-48 overflow-auto rounded-md border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-5 text-emerald-300 [scrollbar-color:rgba(34,211,238,0.45)_rgba(255,255,255,0.06)] [scrollbar-width:thin]">{tileResult.autocad_script}</pre>
            </div>
          )}
        </div>
      </div>

      <EnvironmentalCompass northAngle={northAngle} setNorthAngle={setNorthAngle} />

      {error && <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</p>}
    </section>
  );
}
