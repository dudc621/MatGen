import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MaterialState, 
  PBRParameters, 
  ViewportSettings, 
  PhysicalEstimates 
} from './types';
import { processPBRSuite } from './utils/pbrProcessor';
import { regenerateHighQualityAlbedo } from './utils/aiTextureEnhancer';
import { createPresetMaterialMaps } from './utils/proceduralStarter';
import { Viewport3D } from './components/Viewport3D';
import { TechnicalDrawer } from './components/TechnicalDrawer';
import { ExportModal } from './components/ExportModal';
import { 
  Box, 
  Download, 
  Sliders, 
  Upload, 
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Cpu
} from 'lucide-react';

const DEFAULT_PBR_PARAMS: PBRParameters = {
  normalStrength: 1.8,
  normalFormat: 'opengl',
  heightContrast: 1.4,
  invertHeight: false,
  roughnessBias: 0.1,
  roughnessSpread: 1.1,
  invertRoughness: false,
  aoIntensity: 1.6,
  aoRadius: 4,
  metallic: 0.0,
  edgeBlendWidth: 0.18,
  displacementScale: 0.12,
};

const DEFAULT_VIEWPORT_SETTINGS: ViewportSettings = {
  geometry: 'sphere',
  environment: 'studio',
  uvTiling: 2,
  displacement: false,
  wireframe: false,
  autoRotate: false,
  lightIntensity: 3.2,
  lightAngle: 55,
  lightElevation: 48,
  stochasticTiling: true,
  stochasticNoiseScale: 2.5,
  stochasticSharpness: 4.5,
  stochasticJitter: 0.85,
  stochasticHeightBlend: true,
  stochasticSplitCompare: false,
  stochasticSplitPosition: 50,
};

export default function App() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [currentStepText, setCurrentStepText] = useState('');
  const [isProcessingParams, setIsProcessingParams] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);

  const [pbrParams, setPbrParams] = useState<PBRParameters>(DEFAULT_PBR_PARAMS);
  const [viewportSettings, setViewportSettings] = useState<ViewportSettings>(DEFAULT_VIEWPORT_SETTINGS);

  // Initial State: Neutral Gray Studio Sphere on arrival
  const [material, setMaterial] = useState<MaterialState>({
    name: 'Sphère Neutre',
    prompt: '',
    description: 'Sphère studio neutre prête pour l\'application d\'une texture PBR.',
    physicalEstimates: {
      roughness: 0.15,
      metalness: 0.2,
      normalStrength: 0.9,
      heightContrast: 0.5,
      aoIntensity: 1.4,
      materialName: 'Sphère Neutre',
    },
    maps: null,
  });

  const rawImageRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4500);
  };

  const handleLoadDemoTexture = useCallback(async (preset: 'cobblestone' | 'basalt' = 'cobblestone') => {
    try {
      setIsGenerating(true);
      setCurrentStepIndex(1);
      setCurrentStepText(`Chargement de la matière de démonstration (${preset === 'cobblestone' ? 'Pavés de Granit' : 'Basalte'})...`);
      const { maps, config } = await createPresetMaterialMaps(preset);
      rawImageRef.current = maps.seamlessAlbedo;
      setPbrParams(config.params);
      setMaterial({
        name: config.name,
        prompt: config.name,
        description: config.description,
        physicalEstimates: config.estimates,
        maps,
      });
    } catch (err: any) {
      console.error(err);
      showToast(`Erreur chargement texture : ${err.message}`, 'error');
    } finally {
      setIsGenerating(false);
      setCurrentStepIndex(0);
      setCurrentStepText('');
    }
  }, []);

  // Auto-load starter texture on initial mount
  useEffect(() => {
    handleLoadDemoTexture('cobblestone');
  }, [handleLoadDemoTexture]);

  // Debounced Map Re-processing when sliders move
  const reprocessCurrentMaps = useCallback((newParams: PBRParameters) => {
    if (!rawImageRef.current) return;
    setIsProcessingParams(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        if (!rawImageRef.current) return;
        const updatedMaps = await processPBRSuite(rawImageRef.current, newParams);
        setMaterial((prev) => ({
          ...prev,
          maps: updatedMaps,
        }));
      } catch (err) {
        console.error('Error reprocessing PBR maps:', err);
      } finally {
        setIsProcessingParams(false);
      }
    }, 250);
  }, []);

  const handleUpdateParams = (changed: Partial<PBRParameters>) => {
    const next = { ...pbrParams, ...changed };
    setPbrParams(next);

    // Only regenerate 2D map textures when pixel structure actually changes (delighting / synthesis)
    const needsImageRegeneration = 
      changed.vignetteCorrection !== undefined ||
      changed.equalizeLuminance !== undefined ||
      changed.patchSynthesis !== undefined ||
      changed.edgeBlendWidth !== undefined;

    if (needsImageRegeneration) {
      reprocessCurrentMaps(next);
    }
  };

  const handleResetToEstimates = () => {
    if (!material.physicalEstimates) return;
    const est = material.physicalEstimates;
    const resetParams: PBRParameters = {
      ...pbrParams,
      normalStrength: est.normalStrength,
      normalFormat: 'opengl',
      heightContrast: est.heightContrast,
      invertHeight: est.invertHeight ?? false,
      roughnessBias: est.roughnessBias ?? -0.45,
      aoIntensity: est.aoIntensity,
      metallic: est.metalness,
    };
    setPbrParams(resetParams);
    showToast(`Paramètres rétablis pour ${est.materialName || 'cette matière'}`, 'info');
  };

  // Image Processing Pipeline: Surface analysis, Equalization, Seamless looping & PBR Extraction
  const handleRegenerateFromImage = async (base64: string, filename?: string) => {
    try {
      setIsGenerating(true);
      const fallbackName = filename ? filename.replace(/\.[^/.]+$/, '') : 'Texture';

      // Step 1: Surface & Physical Analysis
      setCurrentStepIndex(1);
      setCurrentStepText('1/4 Analyse de la surface et détection physique...');

      let materialName = fallbackName;
      let est: PhysicalEstimates = {
        roughness: 0.1,
        roughnessBias: -0.45,
        metalness: 0.0,
        normalStrength: 0.25,
        heightContrast: 0.35,
        aoIntensity: 1.2,
        invertHeight: false,
        materialType: 'polished_stone',
        materialName: fallbackName,
      };

      try {
        const analyzeRes = await fetch('/api/analyze-material', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, filename }),
        });

        if (analyzeRes.ok) {
          const analysisData = await analyzeRes.json();
          materialName = analysisData.materialName || fallbackName;
          const pe = analysisData.physicalEstimates;
          est = {
            roughness: pe?.roughness ?? 0.1,
            roughnessBias: pe?.roughnessBias ?? -0.45,
            metalness: pe?.metalness ?? 0.0,
            normalStrength: pe?.normalStrength ?? 0.25,
            heightContrast: pe?.heightContrast ?? 0.35,
            aoIntensity: pe?.aoIntensity ?? 1.2,
            invertHeight: pe?.invertHeight ?? false,
            materialType: analysisData.materialType || 'polished_stone',
            materialName,
            description: analysisData.description,
          };
        }
      } catch (e) {
        console.warn('Physical analysis notice:', e);
      }

      await new Promise((r) => setTimeout(r, 250));

      // Step 2: High-Quality Illumination Equalization & De-vignetting
      setCurrentStepIndex(2);
      setCurrentStepText('2/4 Égalisation diffuse & correction du vignettage...');

      const isPolished = est.materialType === 'polished_stone' || (est.roughnessBias ?? 0) < -0.3;

      const enhancedCanvas = await regenerateHighQualityAlbedo(base64, {
        sharpness: 1.35,
        flattenLighting: true,
        saturationBoost: 1.02,
        targetResolution: 2048,
        isPolishedStone: isPolished,
      });

      const enhancedDataUrl = enhancedCanvas.toDataURL('image/png');
      rawImageRef.current = enhancedDataUrl;

      await new Promise((r) => setTimeout(r, 250));

      // Step 3: Seamless Boundary Synthesis
      setCurrentStepIndex(3);
      setCurrentStepText('3/4 Synthèse de raccord sans couture (Seamless)...');

      await new Promise((r) => setTimeout(r, 250));

      // Step 4: Calibrate & Extract PBR Maps
      setCurrentStepIndex(4);
      setCurrentStepText(`4/4 Génération des cartes PBR (Normal, Roughness, Height, AO)...`);

      const calibratedParams: PBRParameters = {
        ...pbrParams,
        normalStrength: est.normalStrength,
        normalFormat: 'opengl',
        heightContrast: est.heightContrast,
        invertHeight: est.invertHeight ?? false,
        roughnessBias: est.roughnessBias ?? -0.45,
        aoIntensity: est.aoIntensity,
        metallic: est.metalness,
      };
      setPbrParams(calibratedParams);

      const pbrMaps = await processPBRSuite(enhancedDataUrl, calibratedParams, enhancedCanvas);

      setMaterial({
        name: materialName,
        prompt: `Reproduction de ${materialName}`,
        description: est.description || `Matière ${est.materialType || 'détectée'} calibrée automatiquement.`,
        physicalEstimates: est,
        maps: pbrMaps,
      });

      showToast(`Matériau "${materialName}" converti en PBR avec succès !`, 'success');
    } catch (error: any) {
      console.error('Failed to process texture:', error);
      showToast(`Erreur : ${error.message || 'Impossible de traiter la texture.'}`, 'error');
    } finally {
      setIsGenerating(false);
      setCurrentStepIndex(0);
      setCurrentStepText('');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleRegenerateFromImage(reader.result as string, file.name);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  // Global Drag & Drop Listeners
  const handleWindowDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleWindowDragLeave = (e: React.DragEvent) => {
    if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      setIsDraggingFile(false);
    }
  };

  const handleWindowDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleRegenerateFromImage(reader.result as string, file.name);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div 
      className="relative w-screen h-screen bg-[#0c0d12] text-neutral-200 flex flex-col font-sans overflow-hidden select-none"
      onDragOver={handleWindowDragOver}
      onDragLeave={handleWindowDragLeave}
      onDrop={handleWindowDrop}
    >
      {/* Fullscreen Drag Overlay */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center border-2 border-dashed border-white/30 p-6 pointer-events-none animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.08] flex items-center justify-center border border-white/20 mb-4 animate-bounce">
            <Upload className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-white">Déposez votre texture ou photo ici</h2>
          <p className="text-sm text-neutral-400 mt-1">
            Conversion automatique en cartes PBR (Normal, Roughness, Height, AO)
          </p>
        </div>
      )}

      {/* TOP NAVIGATION BAR (Clean, Sleek, Professional) */}
      <header className="h-14 w-full bg-[#13151b] border-b border-white/[0.08] px-5 flex items-center justify-between z-30 shrink-0">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <div className="w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center border border-white/[0.12] shadow-sm">
            <Box className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold tracking-tight text-white">MatGen PBR</span>
            <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-400 font-semibold px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.06] hidden sm:inline">
              Studio
            </span>
          </div>
        </div>

        {/* Center: Clean Import Trigger */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-neutral-200 rounded-xl text-xs font-semibold shadow-md transition-all shrink-0 disabled:opacity-50 active:scale-95 cursor-pointer"
            title="Importer une texture ou photo depuis votre ordinateur"
          >
            <Upload className="w-3.5 h-3.5 text-black" />
            <span>Importer une texture</span>
          </button>
          <span className="text-neutral-500 text-xs hidden md:inline">ou glissez-déposez une image</span>
        </div>

        {/* Right: Technical Details & Export */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
              isDrawerOpen
                ? 'bg-white text-black border-white shadow-sm'
                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-neutral-300 hover:text-white'
            }`}
            title="Ouvrir les réglages physiques PBR"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Paramètres PBR</span>
          </button>

          <button
            onClick={() => setIsExportModalOpen(true)}
            disabled={!material.maps}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border border-white/[0.08] rounded-xl text-xs font-medium transition-colors disabled:opacity-40"
            title="Exporter l'archive ZIP"
          >
            <Download className="w-3.5 h-3.5 text-neutral-400" />
            <span className="hidden sm:inline">Exporter</span>
          </button>
        </div>
      </header>

      {/* Floating Status Notification Toast */}
      {notification && (
        <div className="absolute top-16 right-4 z-40 max-w-sm">
          <div 
            className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs shadow-2xl backdrop-blur-md animate-fade-in ${
              notification.type === 'success'
                ? 'bg-[#14161f] border-emerald-500/40 text-emerald-300'
                : notification.type === 'error'
                ? 'bg-[#14161f] border-rose-500/40 text-rose-300'
                : 'bg-[#14161f] border-white/[0.1] text-neutral-200'
            }`}
          >
            {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {notification.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {notification.type === 'info' && <Sparkles className="w-4 h-4 text-neutral-400 shrink-0" />}
            <span className="flex-1 leading-snug">{notification.message}</span>
          </div>
        </div>
      )}

      {/* Central Processing Multi-Step Modal */}
      {isGenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in pointer-events-auto">
          <div className="w-full max-w-md bg-[#13151b] border border-white/[0.08] rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white">
                <Cpu className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-white">Conversion PBR Haute Fidélité</h3>
                <p className="text-xs text-neutral-400">Synthèse physique et extraction des textures...</p>
              </div>
            </div>

            {/* Step Indicators */}
            <div className="flex flex-col gap-2.5 p-3.5 bg-[#0c0d12] rounded-xl border border-white/[0.06] text-xs">
              <div className="flex items-center gap-2.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  currentStepIndex > 1 ? 'bg-emerald-500 text-white' : currentStepIndex === 1 ? 'bg-white text-black animate-pulse' : 'bg-white/[0.06] text-neutral-500'
                }`}>
                  {currentStepIndex > 1 ? '✓' : '1'}
                </div>
                <span className={currentStepIndex === 1 ? 'text-white font-medium' : currentStepIndex > 1 ? 'text-neutral-500 line-through' : 'text-neutral-500'}>
                  Analyse de surface & détection physique
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  currentStepIndex > 2 ? 'bg-emerald-500 text-white' : currentStepIndex === 2 ? 'bg-white text-black animate-pulse' : 'bg-white/[0.06] text-neutral-500'
                }`}>
                  {currentStepIndex > 2 ? '✓' : '2'}
                </div>
                <span className={currentStepIndex === 2 ? 'text-white font-medium' : currentStepIndex > 2 ? 'text-neutral-500 line-through' : 'text-neutral-500'}>
                  Égalisation diffuse & correction du vignettage
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  currentStepIndex > 3 ? 'bg-emerald-500 text-white' : currentStepIndex === 3 ? 'bg-white text-black animate-pulse' : 'bg-white/[0.06] text-neutral-500'
                }`}>
                  {currentStepIndex > 3 ? '✓' : '3'}
                </div>
                <span className={currentStepIndex === 3 ? 'text-white font-medium' : currentStepIndex > 3 ? 'text-neutral-500 line-through' : 'text-neutral-500'}>
                  Synthèse de raccord sans couture (Seamless)
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  currentStepIndex === 4 ? 'bg-white text-black animate-pulse' : 'bg-white/[0.06] text-neutral-500'
                }`}>
                  4
                </div>
                <span className={currentStepIndex === 4 ? 'text-white font-medium' : 'text-neutral-500'}>
                  Génération des cartes physiques PBR
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{currentStepText}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MAIN 3D HERO VIEWPORT CONTAINER */}
      <main className="flex-1 w-full h-[calc(100vh-3.5rem)] relative overflow-hidden bg-[#0c0d12]">
        {/* Active Material Floating Indicator */}
        <div className="absolute top-16 left-4 z-20 pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#14161f]/90 backdrop-blur-xl rounded-xl border border-white/[0.08] text-xs shadow-2xl">
            <span className={`w-2 h-2 rounded-full shrink-0 ${material.maps ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
            <span className="font-semibold text-white">{material.name}</span>
            <span className="text-neutral-500 text-[11px]">
              {material.maps ? '· Cartes PBR prêtes' : '· En attente de texture'}
            </span>
          </div>
        </div>

        {/* 3D Viewport Component */}
        <Viewport3D
          maps={material.maps}
          params={pbrParams}
          settings={viewportSettings}
          onUpdateSettings={(changed) => setViewportSettings((prev) => ({ ...prev, ...changed }))}
        />
      </main>

      {/* Slide-over Technical Details Drawer */}
      <TechnicalDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        params={pbrParams}
        onChangeParams={handleUpdateParams}
        onResetToEstimates={handleResetToEstimates}
        estimates={material.physicalEstimates}
        maps={material.maps}
        materialName={material.name}
        isProcessing={isProcessingParams}
        onOpenExport={() => setIsExportModalOpen(true)}
        displacementEnabled={viewportSettings.displacement}
        onToggleDisplacement={(val) => setViewportSettings((prev) => ({ ...prev, displacement: val }))}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        maps={material.maps}
        materialName={material.name}
        prompt={material.prompt}
        params={pbrParams}
        estimates={material.physicalEstimates}
      />
    </div>
  );
}
