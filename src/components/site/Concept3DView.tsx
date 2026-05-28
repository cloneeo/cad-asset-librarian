// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls, PerspectiveCamera, Text } from '@react-three/drei';
import * as THREE from 'three';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

type SiteBoundaryPoint = { x: number; y: number; lat: number; lng: number };
type SiteMassingState = { width: number; length: number; height: number; floors: number; rotation: number; x: number; y: number; enabled: boolean };

type Concept3DViewProps = {
  boundary: SiteBoundaryPoint[];
  massing: SiteMassingState;
  showSiteBoundary: boolean;
  hasSiteBoundary: boolean;
  threeD: {
    buildings: boolean;
    roads: boolean;
    sunShadow: boolean;
    massing: boolean;
    height: number;
    orbit: number;
    zoom: number;
  };
  climate: {
    month: string;
    time: string;
    buildingHeight: number;
    orientation: number;
  };
  onAddMassing?: () => void;
};

type LocalSiteModel = {
  shape: THREE.Shape;
  outline: THREE.Vector3[];
  extent: number;
  centroid: { x: number; z: number };
};

function buildSiteModel(boundary: SiteBoundaryPoint[]): LocalSiteModel | null {
  if (boundary.length < 3) return null;
  const centroidLat = boundary.reduce((sum, point) => sum + point.lat, 0) / boundary.length;
  const centroidLng = boundary.reduce((sum, point) => sum + point.lng, 0) / boundary.length;
  const metersPerLat = 111_320;
  const metersPerLng = metersPerLat * Math.cos((centroidLat * Math.PI) / 180);
  const projected = boundary.map((point) => ({
    x: (point.lng - centroidLng) * metersPerLng,
    z: (point.lat - centroidLat) * metersPerLat,
  }));
  const maxExtent = Math.max(1, ...projected.flatMap((point) => [Math.abs(point.x), Math.abs(point.z)]));
  const scale = 9 / maxExtent;
  const local = projected.map((point) => new THREE.Vector2(point.x * scale, point.z * scale));
  const shape = new THREE.Shape(local);
  const outline = local.map((point) => new THREE.Vector3(point.x, 0.14, point.y));
  outline.push(outline[0].clone());
  return { shape, outline, extent: Math.max(8, maxExtent * scale), centroid: { x: 0, z: 0 } };
}

function CameraRig({ viewMode, hasSite }: { viewMode: 'perspective' | 'top'; hasSite: boolean }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    if (viewMode === 'top') {
      camera.position.set(0, 28, 0.01);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.set(hasSite ? 18 : 12, hasSite ? 14 : 9, hasSite ? 18 : 12);
      camera.lookAt(0, 0, 0);
    }
    controlsRef.current?.target?.set(0, 0, 0);
    controlsRef.current?.update?.();
  }, [camera, hasSite, viewMode]);

  return <OrbitControls ref={controlsRef} makeDefault enablePan enableZoom enableRotate minDistance={5} maxDistance={70} />;
}

function SiteGeometry({ model, visible }: { model: LocalSiteModel | null; visible: boolean }) {
  const fillGeometry = useMemo(() => model ? new THREE.ShapeGeometry(model.shape) : null, [model]);
  const slabGeometry = useMemo(() => model ? new THREE.ExtrudeGeometry(model.shape, { depth: 0.16, bevelEnabled: false }) : null, [model]);
  const lineGeometry = useMemo(() => {
    if (!model) return null;
    return new THREE.BufferGeometry().setFromPoints(model.outline);
  }, [model]);
  const lineObject = useMemo(() => {
    if (!lineGeometry) return null;
    return new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: '#67e8f9' }));
  }, [lineGeometry]);

  useEffect(() => () => {
    fillGeometry?.dispose();
    slabGeometry?.dispose();
    if (lineObject?.material) (lineObject.material as THREE.Material).dispose();
    lineGeometry?.dispose();
  }, [fillGeometry, lineGeometry, lineObject, slabGeometry]);

  if (!model || !visible || !fillGeometry || !slabGeometry || !lineObject) return null;
  return (
    <group>
      <mesh geometry={slabGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <meshStandardMaterial color="#22d3ee" transparent opacity={0.28} roughness={0.48} metalness={0.08} />
      </mesh>
      <mesh geometry={fillGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.16, 0]}>
        <meshStandardMaterial color="#67e8f9" transparent opacity={0.20} side={THREE.DoubleSide} />
      </mesh>
      <primitive object={lineObject} />
    </group>
  );
}

function Roads({ extent }: { extent: number }) {
  return (
    <group>
      <mesh position={[0, 0.03, extent * 0.76]} receiveShadow>
        <boxGeometry args={[extent * 2.7, 0.05, 1.05]} />
        <meshStandardMaterial color="#2f3742" roughness={0.82} />
      </mesh>
      <mesh position={[extent * 0.82, 0.035, 0]} receiveShadow>
        <boxGeometry args={[1.05, 0.05, extent * 2.55]} />
        <meshStandardMaterial color="#252c36" roughness={0.82} />
      </mesh>
      <Text position={[-extent * 0.85, 0.16, extent * 0.76]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.32} color="#94a3b8">road / access edge</Text>
    </group>
  );
}

function SurroundingBuildings({ extent }: { extent: number }) {
  const buildings = useMemo(() => [
    [-0.95, -0.72, 1.6, 1.2, 2.4],
    [0.72, -0.82, 1.25, 1.7, 4.1],
    [-0.78, 0.86, 1.1, 1.5, 2.9],
    [0.96, 0.42, 1.75, 1.1, 3.3],
    [0.25, 1.05, 1.0, 1.35, 1.8],
    [-1.18, 0.18, 0.9, 1.15, 3.9],
  ], []);
  return (
    <group>
      {buildings.map(([x, z, width, depth, height], index) => (
        <mesh key={index} position={[x * extent, height / 2, z * extent]} castShadow receiveShadow>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial color={index % 2 ? '#1f2937' : '#263241'} roughness={0.72} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

function Trees({ extent }: { extent: number }) {
  return (
    <group>
      {[-0.55, -0.38, -0.22, 0.44].map((x, index) => (
        <group key={x} position={[x * extent, 0, -extent * (0.98 + index * 0.04)]}>
          <mesh position={[0, 0.24, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.07, 0.48, 8]} />
            <meshStandardMaterial color="#5b4636" />
          </mesh>
          <mesh position={[0, 0.75, 0]} castShadow>
            <sphereGeometry args={[0.32, 16, 16]} />
            <meshStandardMaterial color="#2f7d55" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Massing({ massing, extent }: { massing: SiteMassingState; extent: number }) {
  if (!massing.enabled) return null;
  const width = Math.max(0.7, (massing.width / 18) * extent * 0.55);
  const depth = Math.max(0.7, (massing.length / 18) * extent * 0.55);
  const height = Math.max(0.8, (massing.height || massing.floors * 3) / 2.2);
  const x = ((massing.x - 50) / 50) * extent * 0.7;
  const z = ((massing.y - 50) / 50) * extent * 0.7;
  return (
    <group position={[x, 0, z]} rotation={[0, (massing.rotation * Math.PI) / 180, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#22d3ee" transparent opacity={0.62} roughness={0.34} metalness={0.08} />
      </mesh>
      <lineSegments position={[0, height / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
        <lineBasicMaterial color="#cffafe" />
      </lineSegments>
      <Text position={[0, height + 0.35, 0]} fontSize={0.35} color="#fef9c3" anchorX="center">
        {massing.floors} floors / {Math.round(massing.height || massing.floors * 3)}m
      </Text>
    </group>
  );
}

function SunAndNorth({ orientation, showSun }: { orientation: number; showSun: boolean }) {
  const northRadians = (orientation * Math.PI) / 180;
  return (
    <group>
      <group position={[8, 0.1, -8]} rotation={[0, northRadians, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <coneGeometry args={[0.22, 1.2, 24]} />
          <meshStandardMaterial color="#facc15" emissive="#854d0e" emissiveIntensity={0.35} />
        </mesh>
        <Text position={[0, 1.05, 0]} fontSize={0.45} color="#facc15">N</Text>
      </group>
      {showSun && (
        <group position={[-7, 5, -5]} rotation={[0.35, -0.65, 0.25]}>
          <mesh castShadow>
            <sphereGeometry args={[0.35, 24, 24]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f97316" emissiveIntensity={1.2} />
          </mesh>
          <mesh position={[2.4, -1.6, 2.2]} rotation={[0.9, 0.65, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 5.8, 12]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f97316" emissiveIntensity={0.55} />
          </mesh>
          <Text position={[0, 0.65, 0]} fontSize={0.34} color="#fed7aa">sun</Text>
        </group>
      )}
    </group>
  );
}

function Scene({
  boundary,
  massing,
  showSiteBoundary,
  viewMode,
  localToggles,
  climate,
}: {
  boundary: SiteBoundaryPoint[];
  massing: SiteMassingState;
  showSiteBoundary: boolean;
  viewMode: 'perspective' | 'top';
  localToggles: { roads: boolean; surroundings: boolean; sunShadow: boolean; grid: boolean; massing: boolean };
  climate: Concept3DViewProps['climate'];
}) {
  const model = useMemo(() => buildSiteModel(boundary), [boundary]);
  const extent = model?.extent ?? 9;
  return (
    <>
      <PerspectiveCamera makeDefault position={[18, 14, 18]} fov={48} />
      <CameraRig viewMode={viewMode} hasSite={Boolean(model)} />
      <color attach="background" args={['#05070a']} />
      <ambientLight intensity={0.52} />
      <directionalLight position={[-10, 18, 8]} intensity={1.15} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <directionalLight position={[8, 8, -12]} intensity={0.36} color="#67e8f9" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[44, 44]} />
        <meshStandardMaterial color="#08111a" roughness={0.92} />
      </mesh>
      {localToggles.grid && <Grid args={[44, 44]} cellSize={1} cellThickness={0.45} cellColor="#123143" sectionSize={5} sectionThickness={1.0} sectionColor="#155e75" fadeDistance={46} fadeStrength={1.4} position={[0, 0.005, 0]} />}
      {localToggles.roads && <Roads extent={extent} />}
      {localToggles.surroundings && <SurroundingBuildings extent={extent} />}
      {localToggles.surroundings && <Trees extent={extent} />}
      <SiteGeometry model={model} visible={showSiteBoundary} />
      {localToggles.massing && <Massing massing={massing} extent={extent} />}
      <SunAndNorth orientation={climate.orientation} showSun={localToggles.sunShadow} />
    </>
  );
}

function EmptyState({ onBackTo2D }: { onBackTo2D?: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#080a0d] p-6">
      <div className="max-w-md rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-6 text-center">
        <p className="text-base font-semibold text-cyan-50">Draw a site boundary first</p>
        <p className="mt-2 text-sm leading-6 text-cyan-100/70">Draw a site boundary in 2D Map first to generate Concept 3D.</p>
        {onBackTo2D && <button className="mt-4 rounded-lg border border-cyan-300/35 bg-cyan-300/15 px-3 py-2 text-xs font-semibold text-cyan-50 hover:bg-cyan-300/25" onClick={onBackTo2D}>Return to 2D Map</button>}
      </div>
    </div>
  );
}

export default function Concept3DView({ boundary, massing, showSiteBoundary, hasSiteBoundary, threeD, climate, onAddMassing }: Concept3DViewProps) {
  const [renderError, setRenderError] = useState(false);
  const [viewMode, setViewMode] = useState<'perspective' | 'top'>('perspective');
  const [localToggles, setLocalToggles] = useState({
    roads: threeD.roads,
    surroundings: threeD.buildings,
    sunShadow: threeD.sunShadow,
    grid: true,
    massing: threeD.massing,
  });
  const hasValidBoundary = hasSiteBoundary && boundary.length >= 3;

  useEffect(() => {
    setLocalToggles((current) => ({
      ...current,
      roads: threeD.roads,
      surroundings: threeD.buildings,
      sunShadow: threeD.sunShadow,
      massing: threeD.massing,
    }));
  }, [threeD.buildings, threeD.massing, threeD.roads, threeD.sunShadow]);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      if (!canvas.getContext('webgl') && !canvas.getContext('experimental-webgl')) setRenderError(true);
    } catch {
      setRenderError(true);
    }
  }, []);

  if (renderError) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-[#080a0d] p-6 text-center">
        <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-5 text-amber-50">
          <p className="font-semibold">Concept 3D failed to load.</p>
          <p className="mt-2 text-sm text-amber-50/75">Return to 2D Map.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 h-full w-full bg-[#05070a]">
      {hasValidBoundary ? (
        <Canvas shadows gl={{ antialias: true, preserveDrawingBuffer: true }} dpr={[1, 1.75]} className="h-full w-full">
          <Scene boundary={boundary} massing={massing} showSiteBoundary={showSiteBoundary} viewMode={viewMode} localToggles={localToggles} climate={climate} />
        </Canvas>
      ) : (
        <EmptyState />
      )}

      <div className="absolute left-4 top-4 z-10 max-w-sm rounded-xl border border-cyan-300/20 bg-black/65 p-3 text-xs leading-5 text-cyan-100 backdrop-blur">
        <p className="font-semibold">Concept 3D WebGL Scene</p>
        <p className="mt-1 text-cyan-50/75">{hasValidBoundary ? 'Orbit, pan, and zoom around the site model. Boundary updates from the 2D map.' : 'No boundary yet. Draw in 2D Map first.'}</p>
      </div>

      {hasValidBoundary && (
        <div className="absolute right-4 top-4 z-10 grid max-h-[calc(100%-2rem)] w-44 gap-1.5 overflow-auto rounded-xl border border-white/10 bg-black/65 p-2 text-xs backdrop-blur">
          <button className="rounded-lg border border-cyan-300/35 bg-cyan-300/15 px-2 py-1.5 text-cyan-50 hover:bg-cyan-300/25" onClick={() => setViewMode('perspective')}>Perspective View</button>
          <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-zinc-200 hover:border-cyan-300/35" onClick={() => setViewMode('top')}>Top View</button>
          <button className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-zinc-200 hover:border-cyan-300/35" onClick={() => setViewMode((value) => value === 'top' ? 'perspective' : 'top')}>Reset Camera</button>
          {[
            ['roads', 'Roads'],
            ['surroundings', 'Surroundings'],
            ['sunShadow', 'Sun/Shadows'],
            ['grid', 'Grid'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-zinc-200">
              <span>{label}</span>
              <input type="checkbox" checked={localToggles[key as keyof typeof localToggles]} onChange={(event) => setLocalToggles((current) => ({ ...current, [key]: event.target.checked }))} />
            </label>
          ))}
          <button className={`rounded-lg border px-2 py-1.5 text-left ${massing.enabled ? 'border-white/10 bg-white/5 text-zinc-300' : 'border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20'}`} onClick={onAddMassing}>
            {massing.enabled ? 'Building Mass Active' : 'Add Building Mass'}
          </button>
          {!massing.enabled && <p className="rounded-lg border border-white/10 bg-white/5 p-2 text-[11px] leading-4 text-zinc-300">Add Building Mass to test height, GFA, FAR, and open space.</p>}
        </div>
      )}
    </div>
  );
}
