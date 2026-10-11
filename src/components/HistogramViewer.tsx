import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  BarChart3, 
  Layers, 
  Activity, 
  HelpCircle, 
  Maximize2,
  TrendingUp,
  Sparkles,
  Info
} from 'lucide-react';

export type HistogramMapType = 'roughness' | 'height' | 'dual';

interface HistogramStats {
  bins: Uint32Array;
  maxBinCount: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  blackClip: number; // % pixels at 0
  whiteClip: number; // % pixels at 255
}

interface HistogramViewerProps {
  roughnessMapUrl?: string | null;
  heightMapUrl?: string | null;
  compact?: boolean;
  className?: string;
  defaultMode?: HistogramMapType;
}

export const HistogramViewer: React.FC<HistogramViewerProps> = ({
  roughnessMapUrl,
  heightMapUrl,
  compact = false,
  className = '',
  defaultMode = 'roughness',
}) => {
  const [activeMode, setActiveMode] = useState<HistogramMapType>(defaultMode);
  const [roughnessStats, setRoughnessStats] = useState<HistogramStats | null>(null);
  const [heightStats, setHeightStats] = useState<HistogramStats | null>(null);
  const [hoveredBin, setHoveredBin] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Compute histogram from an image URL
  const analyzeImage = (url: string): Promise<HistogramStats | null> => {
    return new Promise((resolve) => {
      if (!url) {
        resolve(null);
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const sampleSize = 256; // 256x256 = 65k samples for instant calculation
          const canvas = document.createElement('canvas');
          canvas.width = sampleSize;
          canvas.height = sampleSize;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            resolve(null);
            return;
          }

          ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
          const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
          const data = imageData.data;

          const bins = new Uint32Array(256);
          let sum = 0;
          let min = 255;
          let max = 0;
          const totalPixels = sampleSize * sampleSize;

          for (let i = 0; i < data.length; i += 4) {
            const gray = data[i]; // Grayscale: R = G = B
            bins[gray]++;
            sum += gray;
            if (gray < min) min = gray;
            if (gray > max) max = gray;
          }

          let maxBinCount = 0;
          for (let b = 0; b < 256; b++) {
            if (bins[b] > maxBinCount) {
              maxBinCount = bins[b];
            }
          }

          const mean = sum / totalPixels;

          // Median calculation
          let cumulative = 0;
          let median = 128;
          for (let b = 0; b < 256; b++) {
            cumulative += bins[b];
            if (cumulative >= totalPixels / 2) {
              median = b;
              break;
            }
          }

          // Variance & StdDev
          let varianceSum = 0;
          for (let b = 0; b < 256; b++) {
            varianceSum += bins[b] * Math.pow(b - mean, 2);
          }
          const stdDev = Math.sqrt(varianceSum / totalPixels);

          const blackClip = (bins[0] / totalPixels) * 100;
          const whiteClip = (bins[255] / totalPixels) * 100;

          resolve({
            bins,
            maxBinCount,
            mean,
            median,
            stdDev,
            min,
            max,
            blackClip,
            whiteClip,
          });
        } catch (e) {
          console.error('Error analyzing histogram:', e);
          resolve(null);
        }
      };

      img.onerror = () => resolve(null);
      img.src = url;
    });
  };

  // Recalculate stats when maps change
  useEffect(() => {
    let isCancelled = false;
    setIsCalculating(true);

    const run = async () => {
      const [rStats, hStats] = await Promise.all([
        roughnessMapUrl ? analyzeImage(roughnessMapUrl) : Promise.resolve(null),
        heightMapUrl ? analyzeImage(heightMapUrl) : Promise.resolve(null),
      ]);

      if (!isCancelled) {
        setRoughnessStats(rStats);
        setHeightStats(hStats);
        setIsCalculating(false);
      }
    };

    run();
    return () => {
      isCancelled = true;
    };
  }, [roughnessMapUrl, heightMapUrl]);

  // Render histogram on HTML Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Background grid
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, width, height);

    // Subtle horizontal gridlines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = (height * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const drawCurve = (
      stats: HistogramStats,
      fillColor: string,
      strokeColor: string,
      meanLineColor: string
    ) => {
      const maxVal = Math.max(stats.maxBinCount * 0.9, 1);
      const points: { x: number; y: number }[] = [];

      for (let b = 0; b < 256; b++) {
        const x = (b / 255) * width;
        const normalized = stats.bins[b] / maxVal;
        const clampedNorm = Math.min(normalized, 1);
        const y = height - clampedNorm * (height - 10) - 2;
        points.push({ x, y });
      }

      // Draw filled area
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let i = 0; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Draw stroke curve
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        if (i === 0) ctx.moveTo(points[i].x, points[i].y);
        else ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Mean indicator line
      const meanX = (stats.mean / 255) * width;
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(meanX, 0);
      ctx.lineTo(meanX, height);
      ctx.strokeStyle = meanLineColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    };

    if (activeMode === 'dual') {
      if (heightStats) {
        drawCurve(
          heightStats,
          'rgba(245, 158, 11, 0.25)',
          'rgba(245, 158, 11, 0.85)',
          'rgba(245, 158, 11, 0.7)'
        );
      }
      if (roughnessStats) {
        drawCurve(
          roughnessStats,
          'rgba(16, 185, 129, 0.28)',
          'rgba(16, 185, 129, 0.95)',
          'rgba(16, 185, 129, 0.8)'
        );
      }
    } else if (activeMode === 'roughness' && roughnessStats) {
      drawCurve(
        roughnessStats,
        'rgba(16, 185, 129, 0.35)',
        'rgba(16, 185, 129, 1.0)',
        'rgba(16, 185, 129, 0.9)'
      );
    } else if (activeMode === 'height' && heightStats) {
      drawCurve(
        heightStats,
        'rgba(245, 158, 11, 0.35)',
        'rgba(245, 158, 11, 1.0)',
        'rgba(245, 158, 11, 0.9)'
      );
    }

    // Hovered bin cursor line
    if (hoveredBin !== null) {
      const hoverX = (hoveredBin / 255) * width;
      ctx.beginPath();
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }, [activeMode, roughnessStats, heightStats, hoveredBin]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const bin = Math.max(0, Math.min(255, Math.round((x / rect.width) * 255)));
    setHoveredBin(bin);
  };

  const handleMouseLeave = () => {
    setHoveredBin(null);
  };

  const currentStats = activeMode === 'height' ? heightStats : roughnessStats;

  return (
    <div className={`flex flex-col gap-3 p-3.5 bg-slate-900/90 rounded-xl border border-slate-800 text-xs text-slate-300 ${className}`}>
      {/* Top Header & Switcher */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold text-slate-100">
            {compact ? 'Histogramme des Niveaux' : 'Histogramme PBR & Niveaux de Gris'}
          </span>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-1 p-0.5 bg-slate-950 rounded-lg border border-slate-800 text-[10px]">
          <button
            type="button"
            onClick={() => setActiveMode('roughness')}
            className={`px-2 py-0.5 rounded transition-colors ${
              activeMode === 'roughness'
                ? 'bg-emerald-600 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Rugosité
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('height')}
            className={`px-2 py-0.5 rounded transition-colors ${
              activeMode === 'height'
                ? 'bg-amber-600 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Hauteur
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('dual')}
            className={`px-2 py-0.5 rounded transition-colors ${
              activeMode === 'dual'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Superposé
          </button>
        </div>
      </div>

      {/* Canvas Histogram Display */}
      <div className="relative flex flex-col gap-1">
        <div className="w-full h-28 bg-[#0a0d14] rounded-lg overflow-hidden border border-slate-800 relative">
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="w-full h-full cursor-crosshair block"
          />

          {/* Hover Value Badge */}
          {hoveredBin !== null && (
            <div className="absolute top-2 right-2 px-2 py-1 bg-slate-900/90 border border-slate-700 rounded text-[10px] font-mono text-slate-200 shadow-md backdrop-blur-sm pointer-events-none">
              Niveau: <span className="font-bold text-white">{hoveredBin}</span> ({Math.round((hoveredBin / 255) * 100)}%)
              {currentStats && (
                <span className="text-slate-400 ml-1.5">
                  · {currentStats.bins[hoveredBin]} px
                </span>
              )}
            </div>
          )}

          {/* Legend indicators */}
          <div className="absolute bottom-1.5 left-2 flex items-center gap-2.5 text-[9px] pointer-events-none">
            {(activeMode === 'roughness' || activeMode === 'dual') && (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Rugosité (Moy: {roughnessStats ? Math.round(roughnessStats.mean) : '--'})
              </span>
            )}
            {(activeMode === 'height' || activeMode === 'dual') && (
              <span className="flex items-center gap-1 text-amber-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Hauteur (Moy: {heightStats ? Math.round(heightStats.mean) : '--'})
              </span>
            )}
          </div>
        </div>

        {/* Gradient reference bar: Black 0 -> White 255 */}
        <div className="flex flex-col gap-0.5">
          <div 
            className="w-full h-1.5 rounded-full overflow-hidden border border-slate-800"
            style={{
              background: 'linear-gradient(to right, #000000 0%, #7f7f7f 50%, #ffffff 100%)',
            }}
          />
          <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 px-0.5">
            <span>0 (Noir / Poli / Creux)</span>
            <span>128 (Neutre 50%)</span>
            <span>255 (Blanc / Mat / Sommet)</span>
          </div>
        </div>
      </div>

      {/* Metrics & Statistical Cards */}
      {currentStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 text-[11px] font-mono">
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex flex-col">
            <span className="text-[10px] text-slate-500">Moyenne</span>
            <span className="font-bold text-slate-200">
              {Math.round(currentStats.mean)} / 255
            </span>
            <span className="text-[9px] text-slate-400">
              ({Math.round((currentStats.mean / 255) * 100)}%)
            </span>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex flex-col">
            <span className="text-[10px] text-slate-500">Médiane</span>
            <span className="font-bold text-slate-200">
              {Math.round(currentStats.median)} / 255
            </span>
            <span className="text-[9px] text-slate-400">
              ({Math.round((currentStats.median / 255) * 100)}%)
            </span>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex flex-col">
            <span className="text-[10px] text-slate-500">Dispersion (σ)</span>
            <span className="font-bold text-slate-200">
              ±{Math.round(currentStats.stdDev)}
            </span>
            <span className="text-[9px] text-slate-400">
              {currentStats.stdDev < 20 ? 'Uniforme' : 'Contraste élevé'}
            </span>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex flex-col">
            <span className="text-[10px] text-slate-500">Écrêtage (0 / 255)</span>
            <div className="flex items-center gap-1 font-bold text-slate-200">
              <span className={currentStats.blackClip > 5 ? 'text-amber-400' : 'text-slate-300'}>
                {currentStats.blackClip.toFixed(1)}%
              </span>
              <span className="text-slate-600">/</span>
              <span className={currentStats.whiteClip > 5 ? 'text-amber-400' : 'text-slate-300'}>
                {currentStats.whiteClip.toFixed(1)}%
              </span>
            </div>
            <span className="text-[9px] text-slate-400">
              {currentStats.blackClip + currentStats.whiteClip > 10 ? 'Risque saturation' : 'Gamme équilibrée'}
            </span>
          </div>
        </div>
      )}

      {/* Contextual PBR Reading Guidance */}
      {!compact && (
        <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2 leading-relaxed">
          <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
          <span>
            {activeMode === 'roughness' && (
              <>
                <strong className="text-slate-200">Lecture Rugosité :</strong> Les valeurs sombres (à gauche) produisent des reflets nets spéculaires (verre, marbre poli). Les valeurs claires (à droite) diffusent la lumière pour un aspect mat/brut.
              </>
            )}
            {activeMode === 'height' && (
              <>
                <strong className="text-slate-200">Lecture Hauteur :</strong> Représente le relief topographique. Les zones noires indiquent les creux et sillons, tandis que les zones blanches représentent les sommets extrêmes.
              </>
            )}
            {activeMode === 'dual' && (
              <>
                <strong className="text-slate-200">Vue Superposée :</strong> Permet de vérifier la cohérence physique entre la topographie (Hauteur, en ambre) et la micro-finition de surface (Rugosité, en vert).
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
};
