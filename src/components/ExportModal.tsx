import React, { useState } from 'react';
import JSZip from 'jszip';
import { MaterialMaps, PBRParameters, PhysicalEstimates } from '../types';
import { 
  Download, 
  X, 
  CheckCircle2, 
  Sparkles,
  Loader2,
  Box,
  Flame,
  Shapes,
  FolderArchive,
  Check
} from 'lucide-react';

export type ExportSoftwareTarget = 'unity' | 'unreal' | 'blender' | 'all';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  maps: MaterialMaps | null;
  materialName: string;
  prompt: string;
  params: PBRParameters;
  estimates?: PhysicalEstimates;
}

interface TargetOption {
  id: ExportSoftwareTarget;
  title: string;
  badge: string;
  mapsSummary: string[];
  packedNotice?: string;
  icon: React.ComponentType<{ className?: string }>;
  fileNameSuffix: string;
}

// Helpers for fast fallback client-side channel packing
const dataUrlToBlob = (dataUrl: string): Blob => {
  if (!dataUrl) return new Blob([]);
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

const loadImgData = (src: string): Promise<ImageData> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.width, img.height));
    };
    img.onerror = (e) => reject(e);
    img.src = src;
  });
};

const imageDataToBlob = (imgData: ImageData): Promise<Blob> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = imgData.width;
    canvas.height = imgData.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imgData, 0, 0);
    canvas.toBlob((blob) => resolve(blob || new Blob([])), 'image/png');
  });
};

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  maps,
  materialName,
  prompt,
  params,
  estimates,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<ExportSoftwareTarget>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !maps) return null;

  const cleanName = (materialName || 'materiau_pbr')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const targets: TargetOption[] = [
    {
      id: 'unity',
      title: 'Unity',
      badge: 'URP / Standard',
      mapsSummary: ['Albedo', 'Normal OpenGL', 'Metallic_Smoothness (RGBA)', 'AO', 'Height'],
      packedNotice: 'Metallic_Smoothness combinée',
      icon: Box,
      fileNameSuffix: `${cleanName}_Unity_URP.zip`,
    },
    {
      id: 'unreal',
      title: 'Unreal Engine 5',
      badge: 'UE5 Optimized',
      mapsSummary: ['BaseColor', 'Normal DirectX (-G)', 'ORM 3-en-1', 'Height'],
      packedNotice: 'ORM combiné (AO + Rough + Metal)',
      icon: Flame,
      fileNameSuffix: `${cleanName}_Unreal_Engine_5.zip`,
    },
    {
      id: 'blender',
      title: 'Blender',
      badge: 'PBR Standard',
      mapsSummary: ['Albedo', 'Normal OpenGL', 'Roughness', 'Metallic', 'AO', 'Height'],
      packedNotice: '6 cartes séparées Principled BSDF',
      icon: Shapes,
      fileNameSuffix: `${cleanName}_Blender_PBR.zip`,
    },
    {
      id: 'all',
      title: 'Pack Complet',
      badge: 'Tous Logiciels',
      mapsSummary: ['Dossier /Unity', 'Dossier /Unreal', 'Dossier /Blender', 'Guides README.txt'],
      packedNotice: 'Pack multi-moteurs tout-en-un',
      icon: FolderArchive,
      fileNameSuffix: `${cleanName}_Pack_Complet_PBR.zip`,
    },
  ];

  const currentOption = targets.find((t) => t.id === selectedTarget) || targets[3];

  const handleClientFallbackExport = async (targetId: ExportSoftwareTarget, targetMeta: TargetOption) => {
    const zip = new JSZip();

    const albedoBlob = dataUrlToBlob(maps.seamlessAlbedo || maps.rawAlbedo);
    const heightBlob = dataUrlToBlob(maps.height);
    const normalBlob = dataUrlToBlob(maps.normal);
    const roughBlob = dataUrlToBlob(maps.roughness);
    const aoBlob = dataUrlToBlob(maps.ao);
    const metalBlob = dataUrlToBlob(maps.metallic);

    let metallicSmoothnessBlob: Blob = metalBlob;
    let ormBlob: Blob = aoBlob;
    let normalDirectXBlob: Blob = normalBlob;

    try {
      const [albedoImgData, metalImgData, roughImgData, aoImgData, normalImgData] = await Promise.all([
        loadImgData(maps.seamlessAlbedo),
        loadImgData(maps.metallic),
        loadImgData(maps.roughness),
        loadImgData(maps.ao),
        loadImgData(maps.normal),
      ]);

      const w = albedoImgData.width;
      const h = albedoImgData.height;
      const total = w * h;
      const dummy = document.createElement('canvas');
      dummy.width = w;
      dummy.height = h;
      const dctx = dummy.getContext('2d')!;

      // Unity Metallic_Smoothness (RGB = Metallic, Alpha = 255 - Roughness)
      const unityData = dctx.createImageData(w, h);
      const uPix = unityData.data;
      const mPix = metalImgData.data;
      const rPix = roughImgData.data;
      for (let i = 0; i < total; i++) {
        const idx = i * 4;
        const mVal = mPix[idx];
        uPix[idx] = mVal;
        uPix[idx + 1] = mVal;
        uPix[idx + 2] = mVal;
        uPix[idx + 3] = Math.max(0, Math.min(255, 255 - rPix[idx]));
      }
      metallicSmoothnessBlob = await imageDataToBlob(unityData);

      // UE5 ORM (R = AO, G = Roughness, B = Metallic, A = 255)
      const ormData = dctx.createImageData(w, h);
      const oPix = ormData.data;
      const aPix = aoImgData.data;
      for (let i = 0; i < total; i++) {
        const idx = i * 4;
        oPix[idx] = aPix[idx];
        oPix[idx + 1] = rPix[idx];
        oPix[idx + 2] = mPix[idx];
        oPix[idx + 3] = 255;
      }
      ormBlob = await imageDataToBlob(ormData);

      // UE5 Normal DirectX (Invert Green channel)
      const normalDxData = dctx.createImageData(w, h);
      const ndxPix = normalDxData.data;
      const nPix = normalImgData.data;
      for (let i = 0; i < total; i++) {
        const idx = i * 4;
        ndxPix[idx] = nPix[idx];
        ndxPix[idx + 1] = 255 - nPix[idx + 1];
        ndxPix[idx + 2] = nPix[idx + 2];
        ndxPix[idx + 3] = 255;
      }
      normalDirectXBlob = await imageDataToBlob(normalDxData);
    } catch (e) {
      console.warn('Fallback canvas channel extraction:', e);
    }

    const readmeUnityText = `MATGEN PBR — UNITY (URP / STANDARD)\nMatériau: ${materialName}\n- Albedo.png\n- Normal_OpenGL.png\n- Metallic_Smoothness.png\n- AO.png\n- Height.png\n`;
    const readmeUnrealText = `MATGEN PBR — UNREAL ENGINE 5\nMatériau: ${materialName}\n- BaseColor.png\n- Normal_DirectX.png\n- ORM.png\n- Height.png\n`;
    const readmeBlenderText = `MATGEN PBR — BLENDER / PBR STANDARD\nMatériau: ${materialName}\n- Albedo, Normal, Roughness, Metallic, AO, Height\n`;

    if (targetId === 'unity') {
      zip.file('Albedo.png', albedoBlob);
      zip.file('Normal_OpenGL.png', normalBlob);
      zip.file('Metallic_Smoothness.png', metallicSmoothnessBlob);
      zip.file('AO.png', aoBlob);
      zip.file('Height.png', heightBlob);
      zip.file('README.txt', readmeUnityText);
    } else if (targetId === 'unreal') {
      zip.file('BaseColor.png', albedoBlob);
      zip.file('Normal_DirectX.png', normalDirectXBlob);
      zip.file('ORM.png', ormBlob);
      zip.file('Height.png', heightBlob);
      zip.file('README.txt', readmeUnrealText);
    } else if (targetId === 'blender') {
      zip.file('Albedo.png', albedoBlob);
      zip.file('Normal_OpenGL.png', normalBlob);
      zip.file('Roughness.png', roughBlob);
      zip.file('Metallic.png', metalBlob);
      zip.file('AO.png', aoBlob);
      zip.file('Height.png', heightBlob);
      zip.file('README.txt', readmeBlenderText);
    } else {
      const uFolder = zip.folder('Unity')!;
      uFolder.file('Albedo.png', albedoBlob);
      uFolder.file('Normal_OpenGL.png', normalBlob);
      uFolder.file('Metallic_Smoothness.png', metallicSmoothnessBlob);
      uFolder.file('AO.png', aoBlob);
      uFolder.file('Height.png', heightBlob);
      uFolder.file('README_Unity.txt', readmeUnityText);

      const ueFolder = zip.folder('Unreal')!;
      ueFolder.file('BaseColor.png', albedoBlob);
      ueFolder.file('Normal_DirectX.png', normalDirectXBlob);
      ueFolder.file('ORM.png', ormBlob);
      ueFolder.file('Height.png', heightBlob);
      ueFolder.file('README_Unreal.txt', readmeUnrealText);

      const bFolder = zip.folder('Blender')!;
      bFolder.file('Albedo.png', albedoBlob);
      bFolder.file('Normal_OpenGL.png', normalBlob);
      bFolder.file('Roughness.png', roughBlob);
      bFolder.file('Metallic.png', metalBlob);
      bFolder.file('AO.png', aoBlob);
      bFolder.file('Height.png', heightBlob);
      bFolder.file('README_Blender.txt', readmeBlenderText);

      zip.file('README.txt', `MATGEN PBR — PACK COMPLET MULTI-LOGICIELS\nConsultez les sous-dossiers /Unity, /Unreal et /Blender.\n`);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = targetMeta.fileNameSuffix;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = async (targetId: ExportSoftwareTarget = selectedTarget) => {
    try {
      setIsExporting(true);
      setErrorMessage(null);
      setExportComplete(null);

      const targetMeta = targets.find((t) => t.id === targetId) || currentOption;
      let success = false;
      let downloadFilename = targetMeta.fileNameSuffix;

      try {
        const response = await fetch('/api/export-textures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target: targetId,
            materialName,
            prompt,
            maps: {
              seamlessAlbedo: maps.seamlessAlbedo,
              normal: maps.normal,
              roughness: maps.roughness,
              ao: maps.ao,
              height: maps.height,
              metallic: maps.metallic,
            },
            params,
            estimates,
          }),
        });

        if (response.ok) {
          const contentDisposition = response.headers.get('Content-Disposition');
          if (contentDisposition && contentDisposition.includes('filename="')) {
            const match = contentDisposition.match(/filename="([^"]+)"/);
            if (match && match[1]) {
              downloadFilename = match[1];
            }
          }

          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = downloadFilename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
          success = true;
        }
      } catch (err) {
        console.warn('Backend export notice, switching to client channel packing:', err);
      }

      if (!success) {
        await handleClientFallbackExport(targetId, targetMeta);
      }

      setIsExporting(false);
      setExportComplete(`Pack ${targetMeta.title} téléchargé avec succès !`);
    } catch (err: any) {
      console.error('Export error:', err);
      setIsExporting(false);
      setErrorMessage(err.message || 'Échec du téléchargement');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in pointer-events-auto">
      <div className="relative w-full max-w-lg bg-[#13151b] rounded-2xl p-6 flex flex-col gap-4 text-white shadow-2xl border border-white/[0.08]">
        {/* Header (Clean & Professional) */}
        <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-white border border-white/[0.08]">
              <Download className="w-4 h-4 text-neutral-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
                <span>Exporter les textures</span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/[0.08] text-neutral-300 border border-white/[0.06]">
                  {materialName}
                </span>
              </h2>
              <p className="text-[11px] text-neutral-400">
                Cartes PBR optimisées avec fusion des canaux par moteur
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-neutral-400 hover:text-white transition-all border border-white/[0.06]"
            title="Fermer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 4 Software Options */}
        <div className="grid grid-cols-2 gap-2.5">
          {targets.map((target) => {
            const IconComp = target.icon;
            const isSelected = selectedTarget === target.id;
            return (
              <div
                key={target.id}
                onClick={() => {
                  setSelectedTarget(target.id);
                  setExportComplete(null);
                  setErrorMessage(null);
                }}
                className={`relative cursor-pointer rounded-xl p-3.5 transition-all flex flex-col justify-between gap-2 text-left border ${
                  isSelected
                    ? 'bg-[#1e222d] border-white/30 shadow-md text-white'
                    : 'bg-[#181a22] border-white/[0.06] text-neutral-400 hover:text-neutral-200 hover:bg-[#1b1e27]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                        isSelected ? 'bg-white text-black shadow-sm' : 'bg-white/[0.06] text-neutral-300'
                      }`}
                    >
                      <IconComp className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white leading-tight">
                        {target.title}
                      </div>
                      <span className="text-[10px] text-neutral-400 font-medium block">
                        {target.badge}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-white border-white text-black'
                        : 'border-white/20 text-transparent'
                    }`}
                  >
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                </div>

                {target.packedNotice && (
                  <div className="text-[10px] text-neutral-300 line-clamp-1 font-medium flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-neutral-400 shrink-0" />
                    <span>{target.packedNotice}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Visual Map Overview of Selected Software */}
        <div className="p-3 rounded-xl bg-[#181a22] border border-white/[0.06] flex flex-col gap-1.5 text-xs">
          <div className="flex items-center justify-between text-neutral-300 text-[11px] font-medium">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-neutral-400" />
              <span>Contenu de l'archive ({currentOption.title}) :</span>
            </span>
            <span className="font-mono text-[10px] text-neutral-500">PNG Lossless</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {currentOption.mapsSummary.map((mapName, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md text-[10px] bg-white/[0.05] text-neutral-300 border border-white/[0.06]"
              >
                {mapName}
              </span>
            ))}
          </div>
        </div>

        {/* Status Indicators */}
        {isExporting && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#181a22] border border-white/[0.08] text-xs text-white">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-white shrink-0" />
            <span>Création de l'archive ZIP en cours...</span>
          </div>
        )}

        {exportComplete && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-xs text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{exportComplete}</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/30 text-xs text-rose-300">
            <X className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={() => handleExport(selectedTarget)}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black font-semibold text-xs shadow-lg hover:bg-neutral-200 transition-all disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                <span>Téléchargement...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-black" />
                <span>Télécharger ({currentOption.title})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
