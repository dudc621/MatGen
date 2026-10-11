export type NormalFormat = 'opengl' | 'directx';
export type ViewportGeometry = 'shaderball' | 'sphere' | 'cube' | 'cylinder' | 'plane' | 'ground';

export interface PhysicalEstimates {
  roughness: number;
  metalness: number;
  normalStrength: number;
  heightContrast: number;
  aoIntensity: number;
  roughnessBias?: number;
  invertHeight?: boolean;
  materialType?: string;
  description?: string;
  materialName?: string;
  optimizedPrompt?: string;
}

export interface PBRParameters {
  normalStrength: number;
  normalFormat: NormalFormat;
  heightContrast: number;
  invertHeight: boolean;
  roughnessBias: number;
  roughnessSpread: number;
  invertRoughness: boolean;
  aoIntensity: number;
  aoRadius: number;
  metallic: number;
  edgeBlendWidth: number;
  displacementScale: number;
  vignetteCorrection?: boolean;
  equalizeLuminance?: number;
  patchSynthesis?: boolean;
}

export interface MaterialMaps {
  rawAlbedo: string;          // Before seamless processing
  seamlessAlbedo: string;     // Seamless diffuse map
  height: string;             // Height / displacement map
  normal: string;             // Normal map (RGB)
  roughness: string;          // Roughness map (grayscale)
  ao: string;                 // Ambient occlusion / cavity map
  metallic: string;           // Metallic map (grayscale)
  canvases?: {
    seamlessAlbedo?: HTMLCanvasElement;
    height?: HTMLCanvasElement;
    normal?: HTMLCanvasElement;
    roughness?: HTMLCanvasElement;
    ao?: HTMLCanvasElement;
    metallic?: HTMLCanvasElement;
  };
}

export interface MaterialState {
  name: string;
  prompt: string;
  optimizedPrompt?: string;
  description?: string;
  referenceImage?: string;
  physicalEstimates?: PhysicalEstimates;
  maps: MaterialMaps | null;
}

export type EnvironmentPreset = 'studio' | 'exterior' | 'interior';

export interface ViewportSettings {
  geometry: ViewportGeometry;
  environment: EnvironmentPreset;
  uvTiling: number;
  displacement: boolean;
  wireframe: boolean;
  autoRotate: boolean;
  lightIntensity: number;
  lightAngle: number;
  lightElevation: number;
  // Stochastic Tiling Settings (Perlin Noise & 4K Detail Conservation)
  stochasticTiling: boolean;
  stochasticNoiseScale: number;
  stochasticSharpness: number;
  stochasticJitter: number;
  stochasticHeightBlend: boolean;
  stochasticSplitCompare: boolean;
  stochasticSplitPosition: number;
}

