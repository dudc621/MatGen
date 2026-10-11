import React, { useState } from 'react';
import { MaterialMaps } from '../types';
import { 
  Grid3X3, 
  ZoomIn, 
  ZoomOut, 
  CheckCircle2, 
  AlertCircle
} from 'lucide-react';

interface SeamlessGrid3x3Props {
  maps: MaterialMaps | null;
}

export const SeamlessGrid3x3: React.FC<SeamlessGrid3x3Props> = ({ maps }) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [showSeamLines, setShowSeamLines] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [activeMapType, setActiveMapType] = useState<'albedo' | 'normal' | 'roughness' | 'height'>('albedo');

  if (!maps) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-white/50 liquid-glass-pill rounded-2xl">
        <Grid3X3 className="w-8 h-8 text-white/30 mb-2" />
        <h3 className="text-xs font-semibold text-white/80">Mosaïque indisponible</h3>
        <p className="text-[10px] text-white/40 mt-1 max-w-xs">
          Générez une texture pour inspecter la répétition sans couture.
        </p>
      </div>
    );
  }

  const getActiveImageUrl = () => {
    if (showOriginal) {
      return maps.rawAlbedo;
    }
    switch (activeMapType) {
      case 'normal':
        return maps.normal;
      case 'roughness':
        return maps.roughness;
      case 'height':
        return maps.height;
      default:
        return maps.seamlessAlbedo;
    }
  };

  const currentImage = getActiveImageUrl();

  return (
    <div className="flex flex-col gap-3">
      {/* Controls Bar (Liquid Glass Capsule) */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 liquid-glass-pill rounded-2xl text-xs">
        {/* Map Type Switcher */}
        <div className="flex items-center gap-1">
          {(['albedo', 'normal', 'roughness', 'height'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setActiveMapType(type)}
              className={`px-2 py-1 text-[11px] font-medium rounded-full capitalize transition-all ${
                activeMapType === type
                  ? 'liquid-glass-active font-semibold shadow-sm'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Zoom controls & Compare */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-full transition-all ${
              showOriginal
                ? 'liquid-glass-active'
                : 'text-white/70 hover:text-white'
            }`}
          >
            {showOriginal ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
            <span>{showOriginal ? 'Original' : 'Seamless'}</span>
          </button>

          <div className="flex items-center gap-0.5 liquid-glass-pill rounded-full p-0.5">
            <button
              onClick={() => setZoom(Math.max(0.6, zoom - 0.2))}
              className="p-1 text-white/60 hover:text-white rounded-full"
              title="Zoom arrière"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="text-[10px] font-mono text-white/70 px-1 tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(Math.min(2.0, zoom + 0.2))}
              className="p-1 text-white/60 hover:text-white rounded-full"
              title="Zoom avant"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 3x3 Tile Grid Visualizer Container */}
      <div className="relative w-full aspect-square bg-[#06070a] rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center p-2 shadow-2xl">
        <div 
          className="relative grid grid-cols-3 grid-rows-3 w-full h-full transition-transform duration-200 select-none"
          style={{ transform: `scale(${zoom})` }}
        >
          {Array.from({ length: 9 }).map((_, index) => (
            <div 
              key={index} 
              className={`relative overflow-hidden ${
                showSeamLines ? 'border border-white/20' : ''
              }`}
            >
              <img
                src={currentImage}
                alt={`Tuile ${index + 1}`}
                className="w-full h-full object-cover select-none pointer-events-none"
                referrerPolicy="no-referrer"
              />
              {index === 4 && (
                <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded-full text-[8px] font-mono text-white/90 border border-white/20">
                  Centre
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Legend status badge */}
        <div className="absolute bottom-2 left-2 px-2.5 py-1 liquid-glass-pill rounded-full text-[10px] flex items-center gap-1.5 text-white/70 shadow-lg">
          <div className={`w-1.5 h-1.5 rounded-full ${showOriginal ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          <span>{showOriginal ? 'Bordures brutes' : 'Bouclage sans couture actif'}</span>
        </div>
      </div>
    </div>
  );
};
