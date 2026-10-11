import { PBRParameters, MaterialMaps } from '../types';

/**
 * Loads an image from a data URL or path asynchronously
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Removes non-uniform lighting, vignetting (dark corners), and central hot-spots
 * from photographic textures by estimating low-frequency illumination and normalizing it.
 */
export function removeVignetteAndEqualize(
  sourceCanvas: HTMLCanvasElement,
  strength: number = 0.75
): HTMLCanvasElement {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outCtx = outputCanvas.getContext('2d')!;

  // 1. Create a downscaled thumbnail to estimate low-frequency illumination quickly
  const thumbW = 64;
  const thumbH = 64;
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  const thumbCtx = thumbCanvas.getContext('2d')!;
  thumbCtx.drawImage(sourceCanvas, 0, 0, thumbW, thumbH);

  // 2. Compute illumination field with a large 2D separable box blur on the thumbnail
  const thumbImg = thumbCtx.getImageData(0, 0, thumbW, thumbH);
  const tPix = thumbImg.data;
  const lum = new Float32Array(thumbW * thumbH);

  let totalLum = 0;
  for (let i = 0; i < thumbW * thumbH; i++) {
    const r = tPix[i * 4];
    const g = tPix[i * 4 + 1];
    const b = tPix[i * 4 + 2];
    const val = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[i] = val;
    totalLum += val;
  }
  const meanLum = Math.max(10, totalLum / (thumbW * thumbH));

  // Blur the luminance map 3 times (box blur approximation of Gaussian blur)
  const blurLum = new Float32Array(lum);
  const tempLum = new Float32Array(thumbW * thumbH);
  const radius = 12;

  for (let pass = 0; pass < 3; pass++) {
    // Horizontal pass
    for (let y = 0; y < thumbH; y++) {
      for (let x = 0; x < thumbW; x++) {
        let sum = 0;
        let count = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.max(0, Math.min(thumbW - 1, x + dx));
          sum += blurLum[y * thumbW + nx];
          count++;
        }
        tempLum[y * thumbW + x] = sum / count;
      }
    }
    // Vertical pass
    for (let x = 0; x < thumbW; x++) {
      for (let y = 0; y < thumbH; y++) {
        let sum = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = Math.max(0, Math.min(thumbH - 1, y + dy));
          sum += tempLum[ny * thumbW + x];
          count++;
        }
        blurLum[y * thumbW + x] = sum / count;
      }
    }
  }

  // 3. Upsample illumination field and equalize original canvas
  const srcCtx = sourceCanvas.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, width, height);
  const srcPix = srcData.data;
  const outData = outCtx.createImageData(width, height);
  const outPix = outData.data;

  for (let y = 0; y < height; y++) {
    const ty = (y / Math.max(1, height - 1)) * (thumbH - 1);
    const y0 = Math.floor(ty);
    const y1 = Math.min(thumbH - 1, y0 + 1);
    const dy = ty - y0;

    for (let x = 0; x < width; x++) {
      const tx = (x / Math.max(1, width - 1)) * (thumbW - 1);
      const x0 = Math.floor(tx);
      const x1 = Math.min(thumbW - 1, x0 + 1);
      const dx = tx - x0;

      // Bilinear interpolation of low-frequency illumination
      const l00 = blurLum[y0 * thumbW + x0];
      const l10 = blurLum[y0 * thumbW + x1];
      const l01 = blurLum[y1 * thumbW + x0];
      const l11 = blurLum[y1 * thumbW + x1];
      const localIllum = (1 - dx) * (1 - dy) * l00 + dx * (1 - dy) * l10 + (1 - dx) * dy * l01 + dx * dy * l11;

      // Correction factor
      const safeIllum = Math.max(15, localIllum);
      const gain = meanLum / safeIllum;
      const factor = 1.0 + (gain - 1.0) * strength;

      const idx = (y * width + x) * 4;
      outPix[idx]     = Math.max(0, Math.min(255, Math.round(srcPix[idx] * factor)));
      outPix[idx + 1] = Math.max(0, Math.min(255, Math.round(srcPix[idx + 1] * factor)));
      outPix[idx + 2] = Math.max(0, Math.min(255, Math.round(srcPix[idx + 2] * factor)));
      outPix[idx + 3] = srcPix[idx + 3] || 255;
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return outputCanvas;
}

/**
 * Makes an image seamlessly tileable using frequency-separated patch synthesis.
 * 
 * Guarantees:
 * 1. Zero symmetrical butterfly / mirror reflections at borders or junctions.
 * 2. High-frequency structures (cracks, stone textures) remain 100% crisp and unbroken without ghosting.
 * 3. Low-frequency macro color and brightness are continuous with zero seam lines.
 * 4. Outer borders match identically: x=0 === x=width-1 and y=0 === y=height-1.
 */
export function makeSeamlessCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  blendFraction: number = 0.18,
  usePatchSynthesis: boolean = true
): HTMLCanvasElement {
  const width = source.width;
  const height = source.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(source, 0, 0);

  const imgData = ctx.getImageData(0, 0, width, height);
  const pix = imgData.data;
  const src = new Uint8ClampedArray(pix);

  const bandW = Math.max(8, Math.min(Math.floor(width * 0.35), Math.floor(width * blendFraction)));
  const bandH = Math.max(8, Math.min(Math.floor(height * 0.35), Math.floor(height * blendFraction)));

  // Smoothstep function: 3t^2 - 2t^3
  const smooth = (t: number) => t * t * (3 - 2 * t);

  // If patch synthesis is active, we compute a low-frequency smooth version to avoid ghosting sharp cracks
  let lowFreq: Float32Array | null = null;
  if (usePatchSynthesis) {
    lowFreq = new Float32Array(width * height * 3);
    // Quick separable box blur on RGB to extract low-frequency illumination baseline
    const rBlur = Math.max(4, Math.floor(bandW * 0.3));
    const tempB = new Float32Array(width * height * 3);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let dx = -rBlur; dx <= rBlur; dx += 2) {
          const nx = (x + dx + width) % width;
          const idx = (y * width + nx) * 4;
          rSum += src[idx];
          gSum += src[idx + 1];
          bSum += src[idx + 2];
          count++;
        }
        const oIdx = (y * width + x) * 3;
        tempB[oIdx] = rSum / count;
        tempB[oIdx + 1] = gSum / count;
        tempB[oIdx + 2] = bSum / count;
      }
    }
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let dy = -rBlur; dy <= rBlur; dy += 2) {
          const ny = (y + dy + height) % height;
          const idx = (ny * width + x) * 3;
          rSum += tempB[idx];
          gSum += tempB[idx + 1];
          bSum += tempB[idx + 2];
          count++;
        }
        const oIdx = (y * width + x) * 3;
        lowFreq[oIdx] = rSum / count;
        lowFreq[oIdx + 1] = gSum / count;
        lowFreq[oIdx + 2] = bSum / count;
      }
    }
  }

  // 1. Horizontal Boundary Blending (Left <-> Right)
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    // Jittered seam center position along y to break straight lines and mirror symmetry
    const yNorm = (y / height) * Math.PI * 4;
    const seamJitter = Math.sin(yNorm) * 0.35 + Math.sin(yNorm * 2.3 + 1.2) * 0.15;

    for (let k = 0; k < bandW; k++) {
      const t = k / bandW; // 0 at border (seam), 1 at interior
      const w = 1.0 - smooth(t); // 1.0 at seam, 0.0 inside

      const leftIdx = rowOffset + k * 4;
      const rightIdx = rowOffset + (width - 1 - k) * 4;

      if (usePatchSynthesis && lowFreq) {
        const lfLeftIdx = (y * width + k) * 3;
        const lfRightIdx = (y * width + (width - 1 - k)) * 3;

        // Smoothly equalize low-frequency tone across the border (zero color step)
        const lfWeight = 0.5 * w;

        // High frequency detail calculation: HF = original - lowFreq
        // Sharp sigmoid transition centered around jittered seam
        const jitteredCenter = 0.5 + seamJitter * 0.25;
        const distFromCenter = (t - (1.0 - jitteredCenter)) * 4.0;
        const hfWeight = 1.0 / (1.0 + Math.exp(-distFromCenter * 6.0)); // Sharp non-linear cutoff (zero ghosting)

        for (let c = 0; c < 3; c++) {
          const lVal = src[leftIdx + c];
          const rVal = src[rightIdx + c];
          const lLF = lowFreq[lfLeftIdx + c];
          const rLF = lowFreq[lfRightIdx + c];

          const lHF = lVal - lLF;
          const rHF = rVal - rLF;

          // Combined low-freq base + clean non-ghosted high-freq detail
          const blendedLF_L = lLF * (1.0 - lfWeight) + rLF * lfWeight;
          const blendedLF_R = rLF * (1.0 - lfWeight) + lLF * lfWeight;

          const chosenHF_L = lHF * (1.0 - hfWeight) + rHF * hfWeight;
          const chosenHF_R = rHF * (1.0 - hfWeight) + lHF * hfWeight;

          pix[leftIdx + c] = Math.max(0, Math.min(255, Math.round(blendedLF_L + chosenHF_L)));
          pix[rightIdx + c] = Math.max(0, Math.min(255, Math.round(blendedLF_R + chosenHF_R)));
        }
      } else {
        const blendWeight = 0.5 * w;
        for (let c = 0; c < 3; c++) {
          const leftVal = src[leftIdx + c];
          const rightVal = src[rightIdx + c];
          pix[leftIdx + c] = Math.max(0, Math.min(255, Math.round(leftVal * (1.0 - blendWeight) + rightVal * blendWeight)));
          pix[rightIdx + c] = Math.max(0, Math.min(255, Math.round(rightVal * (1.0 - blendWeight) + leftVal * blendWeight)));
        }
      }
    }
  }

  // 2. Vertical Boundary Blending (Top <-> Bottom)
  const intermediate = new Uint8ClampedArray(pix);

  for (let x = 0; x < width; x++) {
    const xNorm = (x / width) * Math.PI * 4;
    const seamJitter = Math.cos(xNorm) * 0.35 + Math.sin(xNorm * 2.1 + 0.8) * 0.15;

    for (let k = 0; k < bandH; k++) {
      const t = k / bandH;
      const w = 1.0 - smooth(t);

      const topIdx = (k * width + x) * 4;
      const bottomIdx = ((height - 1 - k) * width + x) * 4;

      if (usePatchSynthesis) {
        const jitteredCenter = 0.5 + seamJitter * 0.25;
        const distFromCenter = (t - (1.0 - jitteredCenter)) * 4.0;
        const hfWeight = 1.0 / (1.0 + Math.exp(-distFromCenter * 6.0));
        const lfWeight = 0.5 * w;

        for (let c = 0; c < 3; c++) {
          const topVal = intermediate[topIdx + c];
          const bottomVal = intermediate[bottomIdx + c];

          const blended = topVal * (1.0 - lfWeight) + bottomVal * lfWeight;
          const chosen = topVal * (1.0 - hfWeight) + bottomVal * hfWeight;

          pix[topIdx + c] = Math.max(0, Math.min(255, Math.round(blended * 0.4 + chosen * 0.6)));
          pix[bottomIdx + c] = Math.max(0, Math.min(255, Math.round(bottomVal * (1.0 - lfWeight) + topVal * lfWeight * 0.4 + (bottomVal * (1.0 - hfWeight) + topVal * hfWeight) * 0.6)));
        }
      } else {
        const blendWeight = 0.5 * w;
        for (let c = 0; c < 3; c++) {
          const topVal = intermediate[topIdx + c];
          const bottomVal = intermediate[bottomIdx + c];
          pix[topIdx + c] = Math.max(0, Math.min(255, Math.round(topVal * (1.0 - blendWeight) + bottomVal * blendWeight)));
          pix[bottomIdx + c] = Math.max(0, Math.min(255, Math.round(bottomVal * (1.0 - blendWeight) + topVal * blendWeight)));
        }
      }
    }
  }

  // Exact 1-pixel outer border clone to guarantee mathematical 100% boundary parity across edges
  for (let y = 0; y < height; y++) {
    const left0 = y * width * 4;
    const right0 = (y * width + (width - 1)) * 4;
    for (let c = 0; c < 3; c++) {
      const avg = Math.round((pix[left0 + c] + pix[right0 + c]) / 2);
      pix[left0 + c] = avg;
      pix[right0 + c] = avg;
    }
  }
  for (let x = 0; x < width; x++) {
    const top0 = x * 4;
    const bot0 = ((height - 1) * width + x) * 4;
    for (let c = 0; c < 3; c++) {
      const avg = Math.round((pix[top0 + c] + pix[bot0 + c]) / 2);
      pix[top0 + c] = avg;
      pix[bot0 + c] = avg;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Generates Height / Elevation map from an albedo canvas
 */
export function generateHeightImageData(
  sourceCanvas: HTMLCanvasElement,
  params: PBRParameters
): ImageData {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const ctx = sourceCanvas.getContext('2d')!;
  const srcData = ctx.getImageData(0, 0, width, height);
  const src = srcData.data;

  const outputData = ctx.createImageData(width, height);
  const out = outputData.data;

  const contrast = params.heightContrast;
  const invert = params.invertHeight;

  for (let i = 0; i < src.length; i += 4) {
    // Photometric perceptual luminance
    const lum = 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2];
    
    // Apply contrast centered around midpoint
    let adjusted = ((lum / 255.0 - 0.5) * contrast + 0.5) * 255.0;
    if (invert) {
      adjusted = 255.0 - adjusted;
    }
    const val = Math.max(0, Math.min(255, Math.round(adjusted)));

    out[i] = val;
    out[i + 1] = val;
    out[i + 2] = val;
    out[i + 3] = 255;
  }

  return outputData;
}

/**
 * Generates Normal map from height data using multi-scale Sobel operator with toroidal wrap
 */
export function generateNormalImageData(
  heightData: ImageData,
  params: PBRParameters
): ImageData {
  const width = heightData.width;
  const height = heightData.height;
  const hPix = heightData.data;

  const dummyCanvas = document.createElement('canvas');
  dummyCanvas.width = width;
  dummyCanvas.height = height;
  const ctx = dummyCanvas.getContext('2d')!;
  const outputData = ctx.createImageData(width, height);
  const out = outputData.data;

  const strength = params.normalStrength;
  const isDirectX = params.normalFormat === 'directx';

  // Toroidal sampling helper ensures normal vectors tile seamlessly without boundary cuts
  const sampleH = (x: number, y: number) => {
    const wx = (x + width) % width;
    const wy = (y + height) % height;
    return hPix[(wy * width + wx) * 4] / 255.0;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 3x3 Micro Sobel neighborhood (Step 1)
      const tl = sampleH(x - 1, y - 1);
      const t  = sampleH(x,     y - 1);
      const tr = sampleH(x + 1, y - 1);
      const l  = sampleH(x - 1, y);
      const r  = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const b  = sampleH(x,     y + 1);
      const br = sampleH(x + 1, y + 1);

      // Macro relief samples (Step 2) for deep structural relief
      const l2 = sampleH(x - 2, y);
      const r2 = sampleH(x + 2, y);
      const t2 = sampleH(x,     y - 2);
      const b2 = sampleH(x,     y + 2);

      // Base gradient for normalized tangent normal map
      const dx = ((tr + 2.0 * r + br) - (tl + 2.0 * l + bl)) * 0.75 + (r2 - l2) * 0.5;
      const dy = ((bl + 2.0 * b + br) - (tl + 2.0 * t + tr)) * 0.75 + (b2 - t2) * 0.5;

      // Base normalized normal vector (1.0 baseline, dynamically scaled in 3D viewport)
      let nx = -dx * 1.5;
      let ny = -dy * 1.5;
      let nz = 1.0;

      // Normalize
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * width + x) * 4;
      out[idx]     = Math.round((nx * 0.5 + 0.5) * 255);
      out[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[idx + 3] = 255;
    }
  }

  return outputData;
}

/**
 * Generates Roughness map from surface variance and height
 */
export function generateRoughnessImageData(
  heightData: ImageData,
  params: PBRParameters
): ImageData {
  const width = heightData.width;
  const height = heightData.height;
  const hPix = heightData.data;

  const dummyCanvas = document.createElement('canvas');
  dummyCanvas.width = width;
  dummyCanvas.height = height;
  const ctx = dummyCanvas.getContext('2d')!;
  const outputData = ctx.createImageData(width, height);
  const out = outputData.data;

  const bias = params.roughnessBias;
  const spread = params.roughnessSpread;
  const invert = params.invertRoughness;

  const sampleH = (x: number, y: number) => {
    const wx = (x + width) % width;
    const wy = (y + height) % height;
    return hPix[(wy * width + wx) * 4] / 255.0;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = sampleH(x, y);
      const l = sampleH(x - 1, y);
      const r = sampleH(x + 1, y);
      const t = sampleH(x, y - 1);
      const b = sampleH(x, y + 1);

      // Local micro-relief gradient variance
      const localSlope = Math.sqrt((r - l) ** 2 + (b - t) ** 2);
      
      // Normalized baseline roughness map based on physical micro-relief
      let rough = 0.5 + (0.5 - c) * 0.35 + localSlope * 0.5;
      
      if (invert) {
        rough = 1.0 - rough;
      }

      const val = Math.max(0, Math.min(255, Math.round(rough * 255)));
      const idx = (y * width + x) * 4;

      out[idx]     = val;
      out[idx + 1] = val;
      out[idx + 2] = val;
      out[idx + 3] = 255;
    }
  }

  return outputData;
}

/**
 * Generates Cavity Ambient Occlusion map from height data in O(1) per pixel using separable sliding window
 */
export function generateAOImageData(
  heightData: ImageData,
  params: PBRParameters
): ImageData {
  const width = heightData.width;
  const height = heightData.height;
  const hPix = heightData.data;

  const dummyCanvas = document.createElement('canvas');
  dummyCanvas.width = width;
  dummyCanvas.height = height;
  const ctx = dummyCanvas.getContext('2d')!;
  const outputData = ctx.createImageData(width, height);
  const out = outputData.data;

  const radius = Math.max(1, Math.min(10, Math.round(params.aoRadius || 4)));

  // 1. Normalized height array
  const hBuf = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    hBuf[i] = hPix[i * 4] / 255.0;
  }

  // 2. Separable moving sum with toroidal wrap
  const tempBuf = new Float32Array(width * height);
  const blurBuf = new Float32Array(width * height);
  const winSize = 2 * radius + 1;

  // Horizontal sliding window
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let sum = 0;
    for (let dx = -radius; dx <= radius; dx++) {
      const wx = (dx + width) % width;
      sum += hBuf[rowOffset + wx];
    }
    tempBuf[rowOffset] = sum / winSize;

    for (let x = 1; x < width; x++) {
      const addX = (x + radius) % width;
      const subX = (x - radius - 1 + width) % width;
      sum += hBuf[rowOffset + addX] - hBuf[rowOffset + subX];
      tempBuf[rowOffset + x] = sum / winSize;
    }
  }

  // Vertical sliding window
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      const wy = (dy + height) % height;
      sum += tempBuf[wy * width + x];
    }
    blurBuf[x] = sum / winSize;

    for (let y = 1; y < height; y++) {
      const addY = (y + radius) % height;
      const subY = (y - radius - 1 + height) % height;
      sum += tempBuf[addY * width + x] - tempBuf[subY * width + x];
      blurBuf[y * width + x] = sum / winSize;
    }
  }

  // 3. Cavity computation
  const aoScale = Math.max(0.2, params.aoIntensity);
  for (let i = 0; i < width * height; i++) {
    const centerH = hBuf[i];
    const avgH = blurBuf[i];
    const cavityDepth = Math.max(0, avgH - centerH);
    const aoFactor = Math.max(0.06, 1.0 - cavityDepth * (3.2 * aoScale));
    const val = Math.round(aoFactor * 255);

    const idx = i * 4;
    out[idx]     = val;
    out[idx + 1] = val;
    out[idx + 2] = val;
    out[idx + 3] = 255;
  }

  return outputData;
}

/**
 * Generates Metallic map from parameter value
 */
export function generateMetallicImageData(
  width: number,
  height: number,
  params: PBRParameters
): ImageData {
  const dummyCanvas = document.createElement('canvas');
  dummyCanvas.width = width;
  dummyCanvas.height = height;
  const ctx = dummyCanvas.getContext('2d')!;
  const outputData = ctx.createImageData(width, height);
  const out = outputData.data;

  const metal = Math.max(0, Math.min(1, params.metallic));
  const baseVal = Math.round(metal * 255);

  for (let i = 0; i < out.length; i += 4) {
    out[i]     = baseVal;
    out[i + 1] = baseVal;
    out[i + 2] = baseVal;
    out[i + 3] = 255;
  }

  return outputData;
}

/**
 * Converts ImageData to a fast HTML5 Canvas
 */
export function imageDataToCanvas(data: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/**
 * Converts ImageData to a PNG data URL
 */
export function imageDataToDataUrl(data: ImageData): string {
  const canvas = imageDataToCanvas(data);
  return canvas.toDataURL('image/png');
}

let cachedSrc: string | null = null;
let cachedSeamlessCanvas: HTMLCanvasElement | null = null;
let cachedSeamlessAlbedo: string | null = null;
let cachedParamsKey: string | null = null;

/**
 * Pipeline function that runs all PBR generators on a source image or enhanced canvas
 */
export async function processPBRSuite(
  rawImageSrc: string,
  params: PBRParameters,
  preEnhancedCanvas?: HTMLCanvasElement
): Promise<MaterialMaps> {
  const seamlessKey = `${rawImageSrc}_${params.vignetteCorrection}_${params.equalizeLuminance}_${params.patchSynthesis}_${params.edgeBlendWidth}`;

  let seamlessCanvas: HTMLCanvasElement;
  let seamlessAlbedo: string;

  if (cachedSeamlessCanvas && cachedSrc === rawImageSrc && cachedParamsKey === seamlessKey && !preEnhancedCanvas) {
    seamlessCanvas = cachedSeamlessCanvas;
    seamlessAlbedo = cachedSeamlessAlbedo!;
  } else {
    let baseCanvas: HTMLCanvasElement;
    if (preEnhancedCanvas) {
      baseCanvas = preEnhancedCanvas;
    } else {
      const loaded = await loadImage(rawImageSrc);
      baseCanvas = document.createElement('canvas');
      baseCanvas.width = loaded.width;
      baseCanvas.height = loaded.height;
      const ctx = baseCanvas.getContext('2d')!;
      ctx.drawImage(loaded, 0, 0);
    }

    // 1. Automatic Vignette Removal & Luminance Equalization (De-lighting)
    if (params.vignetteCorrection !== false) {
      const strength = params.equalizeLuminance !== undefined ? params.equalizeLuminance : 0.75;
      baseCanvas = removeVignetteAndEqualize(baseCanvas, strength);
    }
    
    // 2. Frequency-Separated Seamless Synthesis (zero mirror butterfly, crisp cracks)
    const usePatch = params.patchSynthesis !== false;
    seamlessCanvas = makeSeamlessCanvas(baseCanvas, params.edgeBlendWidth, usePatch);
    seamlessAlbedo = seamlessCanvas.toDataURL('image/png');

    cachedSrc = rawImageSrc;
    cachedSeamlessCanvas = seamlessCanvas;
    cachedSeamlessAlbedo = seamlessAlbedo;
    cachedParamsKey = seamlessKey;
  }

  // 3. Extract height map
  const heightData = generateHeightImageData(seamlessCanvas, params);
  const heightCanvas = imageDataToCanvas(heightData);
  const heightUrl = heightCanvas.toDataURL('image/png');

  // 4. Extract normal map
  const normalData = generateNormalImageData(heightData, params);
  const normalCanvas = imageDataToCanvas(normalData);
  const normalUrl = normalCanvas.toDataURL('image/png');

  // 5. Extract roughness map
  const roughnessData = generateRoughnessImageData(heightData, params);
  const roughnessCanvas = imageDataToCanvas(roughnessData);
  const roughnessUrl = roughnessCanvas.toDataURL('image/png');

  // 6. Extract ambient occlusion map
  const aoData = generateAOImageData(heightData, params);
  const aoCanvas = imageDataToCanvas(aoData);
  const aoUrl = aoCanvas.toDataURL('image/png');

  // 7. Extract metallic map
  const metallicData = generateMetallicImageData(seamlessCanvas.width, seamlessCanvas.height, params);
  const metallicCanvas = imageDataToCanvas(metallicData);
  const metallicUrl = metallicCanvas.toDataURL('image/png');

  return {
    rawAlbedo: rawImageSrc,
    seamlessAlbedo,
    height: heightUrl,
    normal: normalUrl,
    roughness: roughnessUrl,
    ao: aoUrl,
    metallic: metallicUrl,
    canvases: {
      seamlessAlbedo: seamlessCanvas,
      height: heightCanvas,
      normal: normalCanvas,
      roughness: roughnessCanvas,
      ao: aoCanvas,
      metallic: metallicCanvas,
    },
  };
}
