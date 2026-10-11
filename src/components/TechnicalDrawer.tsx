import React from 'react';
import { PBRParameters, MaterialMaps, PhysicalEstimates } from '../types';
import { PBRControls } from './PBRControls';
import { X, Sliders } from 'lucide-react';

interface TechnicalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  params: PBRParameters;
  onChangeParams: (newParams: Partial<PBRParameters>) => void;
  onResetToEstimates: () => void;
  estimates?: PhysicalEstimates;
  maps: MaterialMaps | null;
  materialName: string;
  isProcessing?: boolean;
  onOpenExport?: () => void;
  displacementEnabled?: boolean;
  onToggleDisplacement?: (enabled: boolean) => void;
}

export const TechnicalDrawer: React.FC<TechnicalDrawerProps> = ({
  isOpen,
  onClose,
  params,
  onChangeParams,
  onResetToEstimates,
  estimates,
  materialName,
  isProcessing = false,
  displacementEnabled = false,
  onToggleDisplacement,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#13151b]/98 backdrop-blur-2xl border-l border-white/[0.08] shadow-2xl flex flex-col animate-slide-left select-none">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-neutral-300" />
          <h2 className="text-sm font-semibold tracking-tight text-white">Paramètres PBR</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
          title="Fermer le panneau"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Content Body */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex flex-col gap-4">
          {estimates?.description && (
            <div className="p-3 bg-[#0d0e12]/80 rounded-xl border border-white/[0.06] text-[11px] text-neutral-400 leading-relaxed">
              <span className="text-neutral-200 font-semibold block mb-0.5">
                Analyse de surface ({estimates.materialName || materialName}) :
              </span>
              {estimates.description}
            </div>
          )}

          <PBRControls
            params={params}
            estimates={estimates}
            onChangeParams={onChangeParams}
            onResetToEstimates={onResetToEstimates}
            isProcessing={isProcessing}
            displacementEnabled={displacementEnabled}
            onToggleDisplacement={onToggleDisplacement}
          />
        </div>
      </div>

      {/* Footer info */}
      <div className="p-4 border-t border-white/[0.08] bg-[#0d0e12]/60 flex items-center justify-between text-[11px] text-neutral-500">
        <span>Moteur PBR MatGen</span>
        <span>OpenGL & DirectX</span>
      </div>
    </div>
  );
};
