import { MaterialMaps, PBRParameters, PhysicalEstimates } from '../types';
import { processPBRSuite } from './pbrProcessor';

/**
 * Generates an initial procedural volcanic basalt rock texture on HTML5 Canvas
 */
export function generateBasaltTexture(size = 1024): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1e2124';
  ctx.fillRect(0, 0, size, size);

  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;

  const pseudoNoise = (x: number, y: number, scale: number) => {
    const s = Math.sin(x * scale + Math.cos(y * scale) * 1.5) * 43758.5453;
    return s - Math.floor(s);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      const n1 = pseudoNoise(x, y, 0.05);
      const n2 = pseudoNoise(x, y, 0.12);
      const n3 = pseudoNoise(x, y, 0.28);
      const grain = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) * 50;

      const baseR = 38 + grain * 0.8;
      const baseG = 40 + grain * 0.75;
      const baseB = 44 + grain * 0.9;

      const vein = Math.sin(x * 0.015 + Math.cos(y * 0.015) * 3);
      const isVein = Math.abs(vein) < 0.04;
      const lavaColor = isVein ? 35 : 0;

      data[idx] = Math.min(255, baseR + lavaColor);
      data[idx + 1] = Math.min(255, baseG + lavaColor * 0.3);
      data[idx + 2] = Math.min(255, baseB);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  ctx.strokeStyle = 'rgba(15, 16, 20, 0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const startX = (i * 73) % size;
    const startY = (i * 127) % size;
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(
      (startX + 120) % size,
      (startY + 90) % size,
      (startX - 60) % size,
      (startY + 240) % size,
      (startX + 180) % size,
      (startY + 320) % size
    );
  }
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

/**
 * Generates procedural rustic cobblestones / stone pavement texture with distinct features
 * Specifically designed to showcase breaking of visual repetition on large surfaces!
 */
export function generateCobblestoneTexture(size = 1024): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Dark mortar background
  ctx.fillStyle = '#22252a';
  ctx.fillRect(0, 0, size, size);

  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;

  const pseudoNoise = (x: number, y: number, s: number) => {
    const v = Math.sin(x * s + Math.cos(y * s) * 2.1) * 43758.5453;
    return v - Math.floor(v);
  };

  const cols = 8;
  const rows = 8;
  const cellW = size / cols;
  const cellH = size / rows;

  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / cellH);
    const rowOffset = (row % 2 === 0) ? 0 : cellW * 0.5;

    for (let x = 0; x < size; x++) {
      const shiftedX = (x + rowOffset) % size;
      const col = Math.floor(shiftedX / cellW);

      const localX = (shiftedX % cellW) / cellW;
      const localY = (y % cellH) / cellH;

      // Distance from cobblestone center
      const dx = (localX - 0.5) * 2.0;
      const dy = (localY - 0.5) * 2.0;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Unique stone shade variation
      const stoneSeed = Math.sin(col * 12.9898 + row * 78.233) * 43758.5453;
      const stoneVar = (stoneSeed - Math.floor(stoneSeed));

      const microGrain = pseudoNoise(x, y, 0.18) * 35;
      const coarseGrain = pseudoNoise(x, y, 0.04) * 25;

      const idx = (y * size + x) * 4;

      if (dist < 0.82) {
        // Inside cobblestone dome
        const domeHeight = Math.cos(dist * (Math.PI / 2.0));
        const baseLuma = 95 + stoneVar * 45 + domeHeight * 30 + microGrain + coarseGrain;

        // Warm granite tint
        data[idx] = Math.min(255, Math.max(0, baseLuma + 12));
        data[idx + 1] = Math.min(255, Math.max(0, baseLuma + 6));
        data[idx + 2] = Math.min(255, Math.max(0, baseLuma - 4));
        data[idx + 3] = 255;
      } else {
        // Mortar groove with dark sand particles
        const mortarLuma = 34 + pseudoNoise(x, y, 0.25) * 20;
        data[idx] = Math.min(255, mortarLuma + 4);
        data[idx + 1] = Math.min(255, mortarLuma + 3);
        data[idx + 2] = Math.min(255, mortarLuma + 5);
        data[idx + 3] = 255;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Add subtle stone edge bevels and surface cracks
  ctx.strokeStyle = 'rgba(20, 22, 28, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const rx = (i * 97) % size;
    const ry = (i * 151) % size;
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + 25, ry + 15);
  }
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

export function generateStarterTexture(): string {
  return generateCobblestoneTexture(1024);
}

export interface PresetMaterialConfig {
  name: string;
  description: string;
  estimates: PhysicalEstimates;
  params: PBRParameters;
  generator: (size?: number) => string;
}

export const PRESET_MATERIALS: Record<'cobblestone' | 'basalt', PresetMaterialConfig> = {
  cobblestone: {
    name: 'Pavés de Granit Rustique 4K',
    description: 'Dallage ancien en pierre taillée avec joints de mortier sombre. Idéal pour tester le bris de répétition sur grandes surfaces avec le tuilage stochastique.',
    estimates: {
      roughness: 0.65,
      metalness: 0.0,
      normalStrength: 1.8,
      heightContrast: 1.4,
      aoIntensity: 1.6,
      roughnessBias: 0.1,
      materialName: 'Pavés de Granit Rustique 4K',
      materialType: 'stone_pavement',
    },
    params: {
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
    },
    generator: generateCobblestoneTexture,
  },
  basalt: {
    name: 'Basalte Volcanique Fissuré 4K',
    description: 'Roche magmatique sombre avec micro-grains cristallins et fines veines minérales.',
    estimates: {
      roughness: 0.35,
      metalness: 0.1,
      normalStrength: 1.2,
      heightContrast: 0.9,
      aoIntensity: 1.3,
      roughnessBias: -0.2,
      materialName: 'Basalte Volcanique Fissuré 4K',
      materialType: 'volcanic_basalt',
    },
    params: {
      normalStrength: 1.2,
      normalFormat: 'opengl',
      heightContrast: 0.9,
      invertHeight: false,
      roughnessBias: -0.2,
      roughnessSpread: 1.0,
      invertRoughness: false,
      aoIntensity: 1.3,
      aoRadius: 3,
      metallic: 0.1,
      edgeBlendWidth: 0.18,
      displacementScale: 0.08,
    },
    generator: generateBasaltTexture,
  },
};

export async function createPresetMaterialMaps(
  presetKey: 'cobblestone' | 'basalt'
): Promise<{ maps: MaterialMaps; config: PresetMaterialConfig }> {
  const config = PRESET_MATERIALS[presetKey];
  const dataUrl = config.generator(1024);
  const maps = await processPBRSuite(dataUrl, config.params);
  return { maps, config };
}
