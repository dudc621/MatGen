import React, { useState } from 'react';
import { MaterialMaps, NormalFormat } from '../types';
import { 
  Download, 
  Layers, 
  Sliders, 
  Sparkles, 
  Columns, 
  Grid, 
  Maximize2,
  FileCode,
  Info
} from 'lucide-react';

interface MapInspectorProps {
  maps: MaterialMaps | null;
  materialName: string;
  normalFormat: NormalFormat;
}

type MapKey = 'seamlessAlbedo' | 'normal' | 'roughness' | 'height' | 'ao' | 'metallic';

interface MapDescriptor {
  key: MapKey;
  label: string;
  slotName: string;
  description: string;
  formatNote?: string;
}

export const MapInspector: React.FC<MapInspectorProps> = ({
  maps,
  materialName,
  normalFormat,
}) => {
  const [activeTab, setActiveTab] = useState<'grid' | 'split'>('grid');
  const [splitMapA, setSplitMapA] = useState<MapKey>('seamlessAlbedo');
  const [splitMapB, setSplitMapB] = useState<MapKey>('normal');
  const [splitPos, setSplitPos] = useState<number>(50);

  const mapList: MapDescriptor[] = [
    {
      key: 'seamlessAlbedo',
      label: 'Albedo (Base Color)',
      slotName: 'Base Color / Diffuse',
      description: 'Couleur diffuse pure sans ombres portées ni reflets spéculaires.',
    },
    {
      key: 'normal',
      label: `Normal Map (${normalFormat.toUpperCase()})`,
      slotName: 'Tangent Normal (+Y / -Y)',
      description: 'Orientation des micro-facettes de surface pour simuler le relief.',
      formatNote: normalFormat === 'opengl' ? 'Format OpenGL (+Y)' : 'Format DirectX (-Y)',
    },
    {
      key: 'roughness',
      label: 'Roughness',
      slotName: 'Roughness / Micro-surface',
      description: 'Diffusion de la lumière : 0 (miroir brillant) à 255 (mat complet).',
    },
    {
      key: 'height',
      label: 'Height / Displacement',
      slotName: 'Displacement / Bump',
      description: 'Élévation géométrique pour le bump mapping ou la tessellation réelle.',
    },
    {
      key: 'ao',
      label: 'Ambient Occlusion',
      slotName: 'AO / Cavity',
      description: 'Atténuation de la lumière ambiante dans les crevasses et creux.',
    },
    {
      key: 'metallic',
      label: 'Metallic',
      slotName: 'Metallic / Metalness',
      description: 'Distingue les diélectriques (0) des conducteurs métalliques (1).',
    },
  ];

  const handleDownloadSingleMap = (key: MapKey, label: string) => {
    if (!maps || !maps[key]) return;
    const cleanName = materialName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const a = document.createElement('a');
    a.href = maps[key];
    a.download = `${cleanName}_${key}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!maps) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
        <Layers className="w-12 h-12 text-slate-600 mb-3" />
        <h3 className="text-base font-semibold text-slate-200">Aucune carte générée</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Lancez une génération par prompt ou photo pour inspecter les cartes physiques PBR.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* View Switcher Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300">Mode d'inspection :</span>
          <div className="flex items-center gap-1 p-0.5 bg-slate-900 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('grid')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'grid'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Grille des cartes (6)</span>
            </button>
            <button
              onClick={() => setActiveTab('split')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'split'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Comparateur Split A/B</span>
            </button>
          </div>
        </div>

        <span className="text-xs text-slate-500 font-mono">1024 × 1024 px · RGBA 8-bit</span>
      </div>

      {/* Grid Mode */}
      {activeTab === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {mapList.map((item) => (
            <div
              key={item.key}
              className="group relative flex flex-col bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden hover:border-slate-700 transition-colors"
            >
              {/* Map Preview Image */}
              <div className="relative aspect-square w-full bg-slate-950 overflow-hidden">
                <img
                  src={maps[item.key]}
                  alt={item.label}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />

                {/* Download Overlay Button */}
                <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-4">
                  <button
                    onClick={() => handleDownloadSingleMap(item.key, item.label)}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium shadow-lg transition-transform transform active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Télécharger PNG</span>
                  </button>
                </div>

                {item.formatNote && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-slate-950/80 backdrop-blur-md rounded text-[10px] font-mono text-emerald-400 border border-slate-700">
                    {item.formatNote}
                  </div>
                )}
              </div>

              {/* Map Metadata Description */}
              <div className="p-3 flex flex-col gap-1 border-t border-slate-800/80 bg-slate-900/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">{item.label}</span>
                  <span className="text-[10px] font-mono text-slate-400">{item.slotName}</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Split A/B Comparison Mode */}
      {activeTab === 'split' && (
        <div className="flex flex-col gap-3">
          {/* A/B Selector */}
          <div className="flex items-center justify-between p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-blue-400 font-medium">Carte A (Gauche) :</span>
              <select
                value={splitMapA}
                onChange={(e) => setSplitMapA(e.target.value as MapKey)}
                className="bg-slate-800 text-slate-200 border border-slate-700 rounded-md px-2 py-1 text-xs outline-none focus:border-blue-500"
              >
                {mapList.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-medium">Carte B (Droite) :</span>
              <select
                value={splitMapB}
                onChange={(e) => setSplitMapB(e.target.value as MapKey)}
                className="bg-slate-800 text-slate-200 border border-slate-700 rounded-md px-2 py-1 text-xs outline-none focus:border-amber-500"
              >
                {mapList.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Interactive Split Viewport */}
          <div 
            className="relative w-full aspect-square max-h-[500px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 select-none cursor-ew-resize"
            onMouseMove={(e) => {
              if (e.buttons === 1) {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                setSplitPos(pct);
              }
            }}
          >
            {/* Layer B (Right / Background) */}
            <img
              src={maps[splitMapB]}
              alt="Carte B"
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />

            {/* Layer A (Left / Clipped) */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${splitPos}%` }}
            >
              <img
                src={maps[splitMapA]}
                alt="Carte A"
                className="absolute inset-0 w-full h-full object-cover max-w-none"
                style={{ width: '100%', height: '100%', transform: `scale(${100 / splitPos})`, transformOrigin: 'left' }}
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Divider Line & Handle */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-2xl z-10 pointer-events-none"
              style={{ left: `${splitPos}%` }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-slate-900 border-2 border-white shadow-xl flex items-center justify-center text-[10px] text-white font-bold">
                ⤹⤸
              </div>
            </div>

            {/* Labels overlay */}
            <div className="absolute top-3 left-3 px-2 py-1 rounded bg-slate-950/80 backdrop-blur-md text-xs text-blue-400 border border-slate-700">
              A: {mapList.find(m => m.key === splitMapA)?.label}
            </div>
            <div className="absolute top-3 right-3 px-2 py-1 rounded bg-slate-950/80 backdrop-blur-md text-xs text-amber-400 border border-slate-700">
              B: {mapList.find(m => m.key === splitMapB)?.label}
            </div>
          </div>

          <div className="text-center text-[11px] text-slate-500">
            Cliquez et glissez sur l'image pour déplacer la ligne de comparaison
          </div>
        </div>
      )}
    </div>
  );
};
