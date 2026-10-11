import { loadImage } from './pbrProcessor';

export interface PreprocessOptions {
  vignetteRemoval?: boolean;
  vignetteStrength?: number; // 0.0 to 1.0 (default: 0.85)
  localHistEq?: boolean;     // CLAHE (Contrast Limited Adaptive Histogram Equalization)
  claheClipLimit?: number;   // 1.0 to 5.0 (default: 2.5)
  claheGridSize?: number;    // Contextual grid divisions (default: 8)
  balanceColor?: boolean;    // Neutralize slight color cast (default: true)
}

/**
 * High-performance Contrast Limited Adaptive Histogram Equalization (CLAHE)
 * with Vignette and Non-uniform Lighting Suppression.
 * 
 * Specifically designed for photographic texture acquisition:
 * - Equalizes dark edge/corner falloff so tiles never have dark seams.
 * - Spreads local micro-contrast without washing out or over-saturating.
 * - Perfectly preserves chromaticity and texture sharpness.
 */
export async function preprocessImportedPhoto(
  source: string | HTMLImageElement | HTMLCanvasElement,
  options: PreprocessOptions = {}
): Promise<{
  canvas: HTMLCanvasElement;
  dataUrl: string;
  appliedSettings: Required<PreprocessOptions>;
}> {
  const {
    vignetteRemoval = true,
    vignetteStrength = 0.85,
    localHistEq = true,
    claheClipLimit = 2.5,
    claheGridSize = 8,
    balanceColor = true,
  } = options;

  let imgElement: HTMLImageElement | HTMLCanvasElement;
  if (typeof source === 'string') {
    imgElement = await loadImage(source);
  } else {
    imgElement = source;
  }

  const width = imgElement.width;
  const height = imgElement.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  ctx.drawImage(imgElement, 0, 0);

  const imgData = ctx.getImageData(0, 0, width, height);
  const pix = imgData.data;
  const totalPixels = width * height;

  // Extract initial luminance and RGB buffers
  const lum = new Float32Array(totalPixels);
  let sumLum = 0;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r = pix[idx];
    const g = pix[idx + 1];
    const b = pix[idx + 2];
    // ITU-R BT.709 photometric luminance
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[i] = l;
    sumLum += l;
  }
  const meanLum = Math.max(10, sumLum / totalPixels);

  // =========================================================================
  // Step 1: Vignette Suppression & Flat-Field Illumination Equalization
  // =========================================================================
  if (vignetteRemoval) {
    // 1a. Estimate low-frequency illumination profile via downscaled thumbnail blur
    const thumbW = 64;
    const thumbH = 64;
    const thumbLum = new Float32Array(thumbW * thumbH);

    for (let ty = 0; ty < thumbH; ty++) {
      const sy = Math.floor((ty / (thumbH - 1)) * (height - 1));
      for (let tx = 0; tx < thumbW; tx++) {
        const sx = Math.floor((tx / (thumbW - 1)) * (width - 1));
        thumbLum[ty * thumbW + tx] = lum[sy * width + sx];
      }
    }

    // Separable 3-pass box blur on thumbnail luminance
    const blurLum = new Float32Array(thumbLum);
    const tempB = new Float32Array(thumbW * thumbH);
    const radius = 10;

    for (let pass = 0; pass < 3; pass++) {
      // Horizontal
      for (let y = 0; y < thumbH; y++) {
        for (let x = 0; x < thumbW; x++) {
          let s = 0, count = 0;
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = Math.max(0, Math.min(thumbW - 1, x + dx));
            s += blurLum[y * thumbW + nx];
            count++;
          }
          tempB[y * thumbW + x] = s / count;
        }
      }
      // Vertical
      for (let x = 0; x < thumbW; x++) {
        for (let y = 0; y < thumbH; y++) {
          let s = 0, count = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            const ny = Math.max(0, Math.min(thumbH - 1, y + dy));
            s += tempB[ny * thumbW + x];
            count++;
          }
          blurLum[y * thumbW + x] = s / count;
        }
      }
    }

    // 1b. Correct luminance and pixels using continuous flat-field gain
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

        const l00 = blurLum[y0 * thumbW + x0];
        const l10 = blurLum[y0 * thumbW + x1];
        const l01 = blurLum[y1 * thumbW + x0];
        const l11 = blurLum[y1 * thumbW + x1];
        const localIllum = (1 - dx) * (1 - dy) * l00 + dx * (1 - dy) * l10 + (1 - dx) * dy * l01 + dx * dy * l11;

        const gain = meanLum / Math.max(12, localIllum);
        const factor = 1.0 + (gain - 1.0) * vignetteStrength;

        const i = y * width + x;
        const idx = i * 4;

        lum[i] = Math.max(0, Math.min(255, lum[i] * factor));
        pix[idx]     = Math.max(0, Math.min(255, Math.round(pix[idx] * factor)));
        pix[idx + 1] = Math.max(0, Math.min(255, Math.round(pix[idx + 1] * factor)));
        pix[idx + 2] = Math.max(0, Math.min(255, Math.round(pix[idx + 2] * factor)));
      }
    }
  }

  // =========================================================================
  // Step 2: Contrast Limited Adaptive Histogram Equalization (CLAHE)
  // =========================================================================
  if (localHistEq) {
    const gridX = Math.max(4, Math.min(16, claheGridSize));
    const gridY = Math.max(4, Math.min(16, claheGridSize));

    const tileW = width / gridX;
    const tileH = height / gridY;
    const numTiles = gridX * gridY;

    // Allocate CDF arrays for each grid tile: numTiles x 256
    const cdfTable = new Float32Array(numTiles * 256);

    for (let gy = 0; gy < gridY; gy++) {
      const startY = Math.floor(gy * tileH);
      const endY = Math.floor((gy + 1) * tileH);

      for (let gx = 0; gx < gridX; gx++) {
        const startX = Math.floor(gx * tileW);
        const endX = Math.floor((gx + 1) * tileW);

        const tileIndex = gy * gridX + gx;
        const hist = new Float32Array(256);
        let tilePixCount = 0;

        for (let y = startY; y < endY; y++) {
          const rowOffset = y * width;
          for (let x = startX; x < endX; x++) {
            const v = Math.max(0, Math.min(255, Math.round(lum[rowOffset + x])));
            hist[v]++;
            tilePixCount++;
          }
        }

        if (tilePixCount === 0) continue;

        // Clip limit and redistribution
        const clipThreshold = (claheClipLimit * tilePixCount) / 256;
        let excess = 0;

        for (let v = 0; v < 256; v++) {
          if (hist[v] > clipThreshold) {
            excess += hist[v] - clipThreshold;
            hist[v] = clipThreshold;
          }
        }

        const bonusPerBin = excess / 256;
        for (let v = 0; v < 256; v++) {
          hist[v] += bonusPerBin;
        }

        // Construct normalized cumulative distribution function (CDF)
        let cum = 0;
        const cdfOffset = tileIndex * 256;
        for (let v = 0; v < 256; v++) {
          cum += hist[v];
          cdfTable[cdfOffset + v] = (cum / tilePixCount) * 255.0;
        }
      }
    }

    // Bilinear interpolation between neighboring contextual tile CDFs
    for (let y = 0; y < height; y++) {
      // Floating grid coordinate
      const gy = (y / tileH) - 0.5;
      const gy0 = Math.max(0, Math.min(gridY - 1, Math.floor(gy)));
      const gy1 = Math.max(0, Math.min(gridY - 1, gy0 + 1));
      const wy = Math.max(0, Math.min(1, gy - gy0));

      for (let x = 0; x < width; x++) {
        const gx = (x / tileW) - 0.5;
        const gx0 = Math.max(0, Math.min(gridX - 1, Math.floor(gx)));
        const gx1 = Math.max(0, Math.min(gridX - 1, gx0 + 1));
        const wx = Math.max(0, Math.min(1, gx - gx0));

        const pixelIdx = y * width + x;
        const oldL = Math.max(0, Math.min(255, Math.round(lum[pixelIdx])));

        const t00 = gy0 * gridX + gx0;
        const t10 = gy0 * gridX + gx1;
        const t01 = gy1 * gridX + gx0;
        const t11 = gy1 * gridX + gx1;

        const c00 = cdfTable[t00 * 256 + oldL];
        const c10 = cdfTable[t10 * 256 + oldL];
        const c01 = cdfTable[t01 * 256 + oldL];
        const c11 = cdfTable[t11 * 256 + oldL];

        // Bilinear blend
        const newL = (1 - wx) * (1 - wy) * c00 +
                     wx * (1 - wy) * c10 +
                     (1 - wx) * wy * c01 +
                     wx * wy * c11;

        // Apply new luminance while preserving original chromatic color ratios
        const ratio = newL / Math.max(1, oldL);
        // Soft blend (75% equalized, 25% original) to prevent harsh hyper-contrast
        const factor = 1.0 + (ratio - 1.0) * 0.75;

        const idx = pixelIdx * 4;
        pix[idx]     = Math.max(0, Math.min(255, Math.round(pix[idx] * factor)));
        pix[idx + 1] = Math.max(0, Math.min(255, Math.round(pix[idx + 1] * factor)));
        pix[idx + 2] = Math.max(0, Math.min(255, Math.round(pix[idx + 2] * factor)));
      }
    }
  }

  // =========================================================================
  // Step 3: Gentle White Balance / Color Cast Neutralization
  // =========================================================================
  if (balanceColor) {
    let rSum = 0, gSum = 0, bSum = 0;
    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      rSum += pix[idx];
      gSum += pix[idx + 1];
      bSum += pix[idx + 2];
    }
    const rMean = rSum / totalPixels;
    const gMean = gSum / totalPixels;
    const bMean = bSum / totalPixels;
    const gray = (rMean + gMean + bMean) / 3;

    // Subtle 20% Gray-World compensation (prevents heavy amber/blue photographic tint)
    const rGain = 1.0 + (gray / Math.max(10, rMean) - 1.0) * 0.20;
    const gGain = 1.0 + (gray / Math.max(10, gMean) - 1.0) * 0.20;
    const bGain = 1.0 + (gray / Math.max(10, bMean) - 1.0) * 0.20;

    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      pix[idx]     = Math.max(0, Math.min(255, Math.round(pix[idx] * rGain)));
      pix[idx + 1] = Math.max(0, Math.min(255, Math.round(pix[idx + 1] * gGain)));
      pix[idx + 2] = Math.max(0, Math.min(255, Math.round(pix[idx + 2] * bGain)));
    }
  }

  ctx.putImageData(imgData, 0, 0);

  return {
    canvas,
    dataUrl: canvas.toDataURL('image/png'),
    appliedSettings: {
      vignetteRemoval,
      vignetteStrength,
      localHistEq,
      claheClipLimit,
      claheGridSize,
      balanceColor,
    },
  };
}
