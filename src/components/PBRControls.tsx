import React from 'react';
import { PBRParameters, PhysicalEstimates } from '../types';
import { 
  Sliders, 
  RotateCcw
} from 'lucide-react';

interface PBRControlsProps {
  params: PBRParameters;
  estimates?: PhysicalEstimates;
  onChangeParams: (newParams: Partial<PBRParameters>) => void;
  onResetToEstimates: () => void;
  isProcessing?: boolean;
  displacementEnabled?: boolean;
  onToggleDisplacement?: (enabled: boolean) => void;
}

export const PBRControls: React.FC<PBRControlsProps> = ({
  params,
  estimates,
  onChangeParams,
  onResetToEstimates,
  isProcessing = false,
  displacementEnabled = false,
  onToggleDisplacement,
}) => {
  return (
    <div className="flex flex-col gap-4 p-4 bg-[#181a22] rounded-xl border border-white/[0.08] text-xs text-neutral-300">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 font-medium text-neutral-100">
          <Sliders className="w-3.5 h-3.5 text-neutral-400" />
          <span>Réglages Physiques</span>
        </div>
        {estimates && (
          <button
            onClick={onResetToEstimates}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-neutral-400 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] rounded-md transition-colors border border-white/[0.06]"
            title="Rétablir les valeurs recommandées"
          >
            <RotateCcw className="w-3 h-3 text-neutral-400" />
            <span>Réinitialiser</span>
          </button>
        )}
      </div>

      {/* 1. Relief & Normales */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center text-neutral-200 font-medium">
          <span>Relief (Normal Map)</span>
          <span className="font-mono text-neutral-400">{params.normalStrength.toFixed(1)}×</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="3.5"
          step="0.1"
          value={params.normalStrength}
          onChange={(e) => onChangeParams({ normalStrength: parseFloat(e.target.value) })}
          className="w-full accent-neutral-200 h-1.5 bg-[#252834] rounded-lg cursor-pointer"
        />
        <div className="flex items-center justify-between pt-0.5 text-[11px]">
          <span className="text-neutral-400">Normale :</span>
          <div className="flex items-center gap-1 bg-[#101217] p-0.5 rounded-lg border border-white/[0.06]">
            <button
              onClick={() => onChangeParams({ normalFormat: 'opengl' })}
              className={`px-2.5 py-1 rounded-md text-[10px] font-mono transition-colors ${
                params.normalFormat === 'opengl'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              OpenGL (+Y)
            </button>
            <button
              onClick={() => onChangeParams({ normalFormat: 'directx' })}
              className={`px-2.5 py-1 rounded-md text-[10px] font-mono transition-colors ${
                params.normalFormat === 'directx'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              DirectX (-Y)
            </button>
          </div>
        </div>
      </div>

      {/* 2. Rugosité (Roughness) */}
      <div className="flex flex-col gap-2 pt-2.5 border-t border-white/[0.06]">
        <div className="flex justify-between items-center text-neutral-200 font-medium">
          <span>Rugosité (Roughness)</span>
          <span className="font-mono text-neutral-400">
            {params.roughnessBias >= 0 ? `+${params.roughnessBias.toFixed(2)}` : params.roughnessBias.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-[10px] text-neutral-500">
          <span>Brillant (Poli)</span>
          <span>Mat (Brut)</span>
        </div>
        <input
          type="range"
          min="-0.5"
          max="0.5"
          step="0.05"
          value={params.roughnessBias}
          onChange={(e) => onChangeParams({ roughnessBias: parseFloat(e.target.value) })}
          className="w-full accent-neutral-200 h-1.5 bg-[#252834] rounded-lg cursor-pointer"
        />
      </div>

      {/* 3. Hauteur & Creux (Height) */}
      <div className="flex flex-col gap-2.5 pt-2.5 border-t border-white/[0.06]">
        <div className="flex justify-between items-center text-neutral-200 font-medium">
          <span>Relief Géométrique 3D</span>
          <button
            type="button"
            onClick={() => onToggleDisplacement && onToggleDisplacement(!displacementEnabled)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              displacementEnabled
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'bg-white/[0.06] text-neutral-400 hover:text-white'
            }`}
          >
            {displacementEnabled ? 'Activé (Tessellation)' : 'Désactivé'}
          </button>
        </div>

        <div className="flex justify-between items-center text-neutral-200 font-medium pt-0.5">
          <span>Amplitude Relief 3D</span>
          <span className="font-mono text-neutral-400">{(params.displacementScale ?? 0.12).toFixed(2)}×</span>
        </div>
        <input
          type="range"
          min="0.01"
          max="0.40"
          step="0.01"
          value={params.displacementScale ?? 0.12}
          onChange={(e) => {
            if (!displacementEnabled && onToggleDisplacement) onToggleDisplacement(true);
            onChangeParams({ displacementScale: parseFloat(e.target.value) });
          }}
          className="w-full accent-neutral-200 h-1.5 bg-[#252834] rounded-lg cursor-pointer"
        />

        <div className="flex justify-between items-center text-neutral-200 font-medium pt-0.5">
          <span>Contraste Hauteur</span>
          <span className="font-mono text-neutral-400">{params.heightContrast.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="2.5"
          step="0.1"
          value={params.heightContrast}
          onChange={(e) => onChangeParams({ heightContrast: parseFloat(e.target.value) })}
          className="w-full accent-neutral-200 h-1.5 bg-[#252834] rounded-lg cursor-pointer"
        />

        <label className="flex items-center gap-2 cursor-pointer text-[11px] text-neutral-400 hover:text-neutral-200">
          <input
            type="checkbox"
            checked={params.invertHeight}
            onChange={(e) => onChangeParams({ invertHeight: e.target.checked })}
            className="rounded accent-neutral-200 bg-[#252834] border-white/10"
          />
          <span>Inverser relief (Creux ↔ Sommets)</span>
        </label>
      </div>

      {/* 4. Occlusion Ambiante */}
      <div className="flex flex-col gap-2 pt-2.5 border-t border-white/[0.06]">
        <div className="flex justify-between items-center text-neutral-200 font-medium">
          <span>Ombres de Creux (AO)</span>
          <span className="font-mono text-neutral-400">{params.aoIntensity.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min="0.0"
          max="2.5"
          step="0.1"
          value={params.aoIntensity}
          onChange={(e) => onChangeParams({ aoIntensity: parseFloat(e.target.value) })}
          className="w-full accent-neutral-200 h-1.5 bg-[#252834] rounded-lg cursor-pointer"
        />
      </div>

      {/* 5. Métallicité */}
      <div className="flex flex-col gap-2 pt-2.5 border-t border-white/[0.06]">
        <div className="flex justify-between items-center text-neutral-200 font-medium">
          <span>Aspect Métallique</span>
          <span className="font-mono text-neutral-400">{Math.round(params.metallic * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.0"
          max="1.0"
          step="0.05"
          value={params.metallic}
          onChange={(e) => onChangeParams({ metallic: parseFloat(e.target.value) })}
          className="w-full accent-neutral-200 h-1.5 bg-[#252834] rounded-lg cursor-pointer"
        />
      </div>

      {/* 6. Raccord & Correction Vignettage */}
      <div className="flex flex-col gap-2.5 pt-2.5 border-t border-white/[0.06]">
        <div className="flex justify-between items-center text-neutral-200 font-medium">
          <span>Raccord & Égalisation (Seamless)</span>
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-neutral-300 hover:text-white transition-colors">
          <input
            type="checkbox"
            checked={params.vignetteCorrection !== false}
            onChange={(e) => onChangeParams({ vignetteCorrection: e.target.checked })}
            className="rounded accent-neutral-200 bg-[#252834] border-white/10"
          />
          <span>Égalisation de luminosité (De-lighting photo)</span>
        </label>

        {params.vignetteCorrection !== false && (
          <div className="flex flex-col gap-1 pl-5">
            <div className="flex justify-between text-[11px] text-neutral-400">
              <span>Intensité de correction</span>
              <span className="font-mono">{Math.round((params.equalizeLuminance ?? 0.75) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={params.equalizeLuminance ?? 0.75}
              onChange={(e) => onChangeParams({ equalizeLuminance: parseFloat(e.target.value) })}
              className="w-full accent-neutral-200 h-1.5 bg-[#252834] rounded-lg cursor-pointer"
            />
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer text-neutral-300 hover:text-white transition-colors">
          <input
            type="checkbox"
            checked={params.patchSynthesis !== false}
            onChange={(e) => onChangeParams({ patchSynthesis: e.target.checked })}
            className="rounded accent-neutral-200 bg-[#252834] border-white/10"
          />
          <span>Synthèse par patchs sans flou (Zéro miroir)</span>
        </label>
      </div>
    </div>
  );
};
