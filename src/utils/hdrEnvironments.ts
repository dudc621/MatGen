import * as THREE from 'three';
import { EnvironmentPreset } from '../types';

/**
 * Procedural HDR Image-Based Lighting (IBL) Environment Generator
 * 
 * Generates equirectangular Radiance Environment Maps using Three.js PMREMGenerator
 * to provide physically accurate PBR reflections and ambient light for:
 * - Studio: Clean, controlled three-point softbox reflections
 * - Extérieur: Natural open-sky golden hour with warm sun disc & blue zenith
 * - Intérieur: Warm architectural showroom with tungsten downlights & warm bounce
 */

export interface EnvironmentPresetConfig {
  envMap: THREE.Texture;
  backgroundColor: number;
  keyLightColor: number;
  keyLightIntensity: number;
  fillLightColor: number;
  fillLightIntensity: number;
  rimLightColor: number;
  rimLightIntensity: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  hemiIntensity: number;
}

export function generateEnvironmentPresets(renderer: THREE.WebGLRenderer): Record<EnvironmentPreset, EnvironmentPresetConfig> {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const w = 512;
  const h = 256;

  // 1. STUDIO PRESET (Clean, balanced softboxes)
  const studioCanvas = document.createElement('canvas');
  studioCanvas.width = w;
  studioCanvas.height = h;
  const sCtx = studioCanvas.getContext('2d')!;

  // Neutral studio backdrop
  const sGrad = sCtx.createLinearGradient(0, 0, 0, h);
  sGrad.addColorStop(0, '#1c222d');
  sGrad.addColorStop(0.5, '#11151c');
  sGrad.addColorStop(1, '#090b0e');
  sCtx.fillStyle = sGrad;
  sCtx.fillRect(0, 0, w, h);

  // Softbox 1 (Key Light, high luminance)
  const sBox1 = sCtx.createRadialGradient(w * 0.25, h * 0.4, 5, w * 0.25, h * 0.4, 75);
  sBox1.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  sBox1.addColorStop(0.4, 'rgba(240, 245, 255, 0.85)');
  sBox1.addColorStop(1, 'rgba(240, 245, 255, 0.0)');
  sCtx.fillStyle = sBox1;
  sCtx.fillRect(w * 0.1, h * 0.15, 160, 130);

  // Softbox 2 (Fill Light, cooler soft luminance)
  const sBox2 = sCtx.createRadialGradient(w * 0.75, h * 0.45, 5, w * 0.75, h * 0.45, 80);
  sBox2.addColorStop(0, 'rgba(215, 235, 255, 0.8)');
  sBox2.addColorStop(0.5, 'rgba(180, 210, 245, 0.4)');
  sBox2.addColorStop(1, 'rgba(180, 210, 245, 0.0)');
  sCtx.fillStyle = sBox2;
  sCtx.fillRect(w * 0.6, h * 0.2, 170, 140);

  // Overhead Strip Light
  const sStrip = sCtx.createLinearGradient(w * 0.35, 0, w * 0.65, 0);
  sStrip.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
  sStrip.addColorStop(0.5, 'rgba(255, 255, 255, 0.9)');
  sStrip.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  sCtx.fillStyle = sStrip;
  sCtx.fillRect(w * 0.35, 5, w * 0.3, 35);

  const studioTex = new THREE.CanvasTexture(studioCanvas);
  const studioEnvMap = pmremGenerator.fromEquirectangular(studioTex).texture;
  studioTex.dispose();

  // 2. EXTERIOR PRESET (Golden Hour Sunset Sky with Radiant Sun)
  const extCanvas = document.createElement('canvas');
  extCanvas.width = w;
  extCanvas.height = h;
  const eCtx = extCanvas.getContext('2d')!;

  // Natural Sky & Earth Horizon Gradient
  const eGrad = eCtx.createLinearGradient(0, 0, 0, h);
  eGrad.addColorStop(0, '#1e3a8a');   // Deep blue zenith
  eGrad.addColorStop(0.35, '#38bdf8'); // Sky cyan
  eGrad.addColorStop(0.48, '#fbbf24'); // Golden horizon
  eGrad.addColorStop(0.52, '#f97316'); // Warm sunset glow
  eGrad.addColorStop(0.65, '#291b12'); // Earth terrain
  eGrad.addColorStop(1, '#110c08');    // Deep ground
  eCtx.fillStyle = eGrad;
  eCtx.fillRect(0, 0, w, h);

  // Radiant Golden Sun Disc & Atmospheric Flare
  const sunGrad = eCtx.createRadialGradient(w * 0.3, h * 0.44, 2, w * 0.3, h * 0.44, 90);
  sunGrad.addColorStop(0, 'rgba(255, 255, 245, 1.0)');
  sunGrad.addColorStop(0.15, 'rgba(255, 235, 170, 0.95)');
  sunGrad.addColorStop(0.4, 'rgba(251, 146, 60, 0.55)');
  sunGrad.addColorStop(1, 'rgba(251, 146, 60, 0.0)');
  eCtx.fillStyle = sunGrad;
  eCtx.beginPath();
  eCtx.arc(w * 0.3, h * 0.44, 90, 0, Math.PI * 2);
  eCtx.fill();

  const extTex = new THREE.CanvasTexture(extCanvas);
  const extEnvMap = pmremGenerator.fromEquirectangular(extTex).texture;
  extTex.dispose();

  // 3. INTERIOR PRESET (Warm Architectural Showroom)
  const intCanvas = document.createElement('canvas');
  intCanvas.width = w;
  intCanvas.height = h;
  const iCtx = intCanvas.getContext('2d')!;

  // Warm interior room ambient
  const iGrad = iCtx.createLinearGradient(0, 0, 0, h);
  iGrad.addColorStop(0, '#2e2319');   // Ceiling warm timber
  iGrad.addColorStop(0.45, '#1e1814'); // Neutral wall level
  iGrad.addColorStop(0.55, '#17120e'); // Floor horizon
  iGrad.addColorStop(1, '#0c0906');    // Parquet dark floor
  iCtx.fillStyle = iGrad;
  iCtx.fillRect(0, 0, w, h);

  // Warm Spotlights cluster on ceiling
  for (let i = 0; i < 4; i++) {
    const spotX = w * (0.15 + i * 0.23);
    const spotY = h * 0.25;
    const spotGrad = iCtx.createRadialGradient(spotX, spotY, 2, spotX, spotY, 45);
    spotGrad.addColorStop(0, 'rgba(255, 240, 205, 1.0)');
    spotGrad.addColorStop(0.35, 'rgba(251, 191, 36, 0.65)');
    spotGrad.addColorStop(1, 'rgba(251, 191, 36, 0.0)');
    iCtx.fillStyle = spotGrad;
    iCtx.beginPath();
    iCtx.arc(spotX, spotY, 45, 0, Math.PI * 2);
    iCtx.fill();
  }

  // Soft warm wall lamp glow
  const wallGlow = iCtx.createRadialGradient(w * 0.85, h * 0.45, 2, w * 0.85, h * 0.45, 70);
  wallGlow.addColorStop(0, 'rgba(255, 220, 160, 0.9)');
  wallGlow.addColorStop(0.4, 'rgba(245, 158, 11, 0.4)');
  wallGlow.addColorStop(1, 'rgba(245, 158, 11, 0.0)');
  iCtx.fillStyle = wallGlow;
  iCtx.beginPath();
  iCtx.arc(w * 0.85, h * 0.45, 70, 0, Math.PI * 2);
  iCtx.fill();

  const intTex = new THREE.CanvasTexture(intCanvas);
  const intEnvMap = pmremGenerator.fromEquirectangular(intTex).texture;
  intTex.dispose();

  pmremGenerator.dispose();

  return {
    studio: {
      envMap: studioEnvMap,
      backgroundColor: 0x0f1115,
      keyLightColor: 0xfff8ee,
      keyLightIntensity: 3.2,
      fillLightColor: 0xb4d2ff,
      fillLightIntensity: 1.2,
      rimLightColor: 0xffffff,
      rimLightIntensity: 1.8,
      hemiSkyColor: 0x2a3342,
      hemiGroundColor: 0x111317,
      hemiIntensity: 0.8,
    },
    exterior: {
      envMap: extEnvMap,
      backgroundColor: 0x0b111c,
      keyLightColor: 0xffa434, // Golden sunlight
      keyLightIntensity: 4.2,
      fillLightColor: 0x60a5fa, // Sky blue fill
      fillLightIntensity: 1.6,
      rimLightColor: 0xffedd5, // Warm rim
      rimLightIntensity: 2.2,
      hemiSkyColor: 0x38bdf8,
      hemiGroundColor: 0x291b12,
      hemiIntensity: 1.1,
    },
    interior: {
      envMap: intEnvMap,
      backgroundColor: 0x13100c,
      keyLightColor: 0xffe8c8, // Warm halogen
      keyLightIntensity: 2.9,
      fillLightColor: 0xfde68a, // Soft amber fill
      fillLightIntensity: 1.6,
      rimLightColor: 0xffedd5, // Warm backlight
      rimLightIntensity: 1.4,
      hemiSkyColor: 0x451a03,
      hemiGroundColor: 0x1c1917,
      hemiIntensity: 0.85,
    },
  };
}
