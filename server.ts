import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sharp from 'sharp';
import JSZip from 'jszip';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Body parser with high limit for base64 images
app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));

// Helper: contextual local material calibration (zero network, zero API key required)
function getFallbackEstimates(prompt: string = '', filename: string = '') {
  let fallbackType = 'polished_stone';
  let fallbackName = 'Marbre Poli';
  let normStr = 0.25;
  let roughBias = -0.46;
  let heightContr = 0.35;
  let metal = 0.0;
  let ao = 1.15;

  const lowerText = ((prompt || '') + ' ' + (filename || '')).toLowerCase();
  if (lowerText.includes('volcan') || lowerText.includes('basalt') || lowerText.includes('brique') || lowerText.includes('roche') || lowerText.includes('pierre')) {
    fallbackType = 'rough_stone';
    fallbackName = 'Pierre Minérale Brut';
    normStr = 2.2;
    roughBias = 0.15;
    heightContr = 1.5;
  } else if (lowerText.includes('bois') || lowerText.includes('chêne') || lowerText.includes('wood')) {
    fallbackType = 'wood';
    fallbackName = 'Bois Veiné';
    normStr = 0.7;
    roughBias = -0.15;
    heightContr = 0.6;
  } else if (lowerText.includes('metal') || lowerText.includes('cuivre') || lowerText.includes('or') || lowerText.includes('acier') || lowerText.includes('fer')) {
    fallbackType = 'metal';
    fallbackName = 'Métal Satiné';
    normStr = 0.45;
    roughBias = -0.35;
    heightContr = 0.4;
    metal = 0.85;
  } else if (lowerText.includes('plast') || lowerText.includes('pvc') || lowerText.includes('resine') || lowerText.includes('acrylic') || lowerText.includes('polymer')) {
    fallbackType = 'plastic';
    fallbackName = 'Plastique Synthétique';
    normStr = 0.22;
    roughBias = -0.38;
    heightContr = 0.25;
    metal = 0.0;
    ao = 1.05;
  }

  return {
    materialName: fallbackName,
    materialType: fallbackType,
    optimizedPrompt: 'Flat 2D orthogonal top-down texture map, macro surface details, completely even diffuse ambient light, no directional shadows.',
    description: `Matière ${fallbackName} avec calibrage physique automatique : relief subtil adapté, rugosité polie et réflexion optimisée pour un rendu photoréaliste.`,
    physicalEstimates: {
      roughness: 0.1,
      roughnessBias: roughBias,
      metalness: metal,
      normalStrength: normStr,
      heightContrast: heightContr,
      aoIntensity: ao,
      invertHeight: false,
    },
  };
}

// Initialize GoogleGenAI SDK only if GEMINI_API_KEY is provided in environment variables
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * Technical Director: Analyzes material request or image
 */
app.post('/api/analyze-material', async (req, res) => {
  try {
    const { prompt, imageBase64, mimeType, filename } = req.body;

    // Fast local calibration if no API key is set
    if (!ai) {
      return res.json(getFallbackEstimates(prompt, filename));
    }

    if (!prompt && !imageBase64) {
      return res.status(400).json({ error: 'Either prompt or image is required' });
    }

    const systemInstruction = `You are an elite 3D Technical Artist and PBR (Physically-Based Rendering) Material Specialist.
Your task is to analyze a requested material or uploaded photo and calibrate its exact physical PBR properties for real-time 3D lookdev.

Critical Calibration Guidelines:
1. "materialName": Short descriptive name in French (e.g. "Marbre Blanc Calacatta", "Plastique Lisse Brillant", "Basalte Volcanique", "Chêne Massif Huilé", "Cuivre Brossé").
2. "materialType": Category: "polished_stone" (marble, granite, polished tile), "rough_stone" (volcanic stone, slate, brick, raw concrete), "plastic" (smooth polymers, acrylic, PVC, molded plastic, glossy resin), "wood", "metal", "fabric", or "organic".
3. "physicalEstimates":
   CRITICAL FOR PHOTOREALISM:
   - "normalStrength": float 0.1 to 3.0.
     * FOR POLISHED SURFACES (marble, polished granite, tiles, glass): MUST be LOW (0.15 to 0.35). Surface veins are 2D pigment color variations, NOT deep gouged canyons or trenches! High relief ruins marble!
     * FOR PLASTIC (molded resin, acrylic, PVC): LOW (0.15 to 0.35). Uniform surface without deep fissures.
     * FOR ROUGH SURFACES (volcanic rock, brick, bark, gravel): 1.5 to 2.8.
     * FOR METALS or SATIN SURFACES: 0.3 to 0.7.
   - "roughnessBias": float -0.50 to +0.50.
     * For mirror polished stones (marble, ceramic tiles): -0.48 to -0.40 (smooth, highly reflective, glossy specular highlights).
     * For smooth plastic (molded polymer, glossy resin): -0.42 to -0.30 (clean specular reflection).
     * For semi-gloss / satin (varnished wood, worn leather): -0.25 to -0.05.
     * For matte / rough (limestone, clay, chalk, brick): +0.10 to +0.35.
   - "heightContrast": float 0.2 to 2.5.
     * For flat polished stones (marble): 0.25 to 0.45 (avoids digging deep craters into flat stone).
     * For rough relief surfaces: 1.2 to 2.0.
   - "metalness": float 0.0 to 1.0 (0.0 for all stones, marble, wood, ceramic; 0.7 to 1.0 for true metals).
   - "aoIntensity": float 0.5 to 2.5 (1.0 to 1.3 for polished stone; 1.5 to 2.0 for deep rock crevices).
   - "invertHeight": boolean (false by default; true only if dark areas represent elevated ridges instead of crevices).
   - "roughness": float 0.0 to 1.0 (approximate absolute roughness: 0.1 for marble, 0.8 for concrete).
4. "description": A concise 2-sentence summary in French explaining the material physical properties and why these specific PBR parameters were chosen for the best visual result.
5. "optimizedPrompt": Re-write the idea into an exact 2D flat orthogonal diffuse scan prompt.`;

    const contents: any[] = [];

    if (imageBase64) {
      contents.push({
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
        },
      });
      contents.push({
        text: `Analyze this reference photo texture for PBR extraction. ${prompt ? `User note: ${prompt}` : ''}`,
      });
    } else {
      contents.push({
        text: `Analyze this material concept for PBR extraction: "${prompt}"`,
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts: contents },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            materialName: { type: Type.STRING },
            materialType: { type: Type.STRING },
            optimizedPrompt: { type: Type.STRING },
            description: { type: Type.STRING },
            physicalEstimates: {
              type: Type.OBJECT,
              properties: {
                roughness: { type: Type.NUMBER },
                roughnessBias: { type: Type.NUMBER },
                metalness: { type: Type.NUMBER },
                normalStrength: { type: Type.NUMBER },
                heightContrast: { type: Type.NUMBER },
                aoIntensity: { type: Type.NUMBER },
                invertHeight: { type: Type.BOOLEAN },
              },
              required: ['roughness', 'roughnessBias', 'metalness', 'normalStrength', 'heightContrast', 'aoIntensity', 'invertHeight'],
            },
          },
          required: ['materialName', 'materialType', 'optimizedPrompt', 'description', 'physicalEstimates'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.warn('AI analysis API notice (local fallback activated):', error?.message);
    return res.json(getFallbackEstimates(req.body.prompt, req.body.filename));
  }
});

/**
 * Base Albedo Synthesizer: Synthesizes high-resolution 1:1 diffuse map using gemini-nano-banana-2.1
 */
app.post('/api/generate-albedo', async (req, res) => {
  try {
    const { prompt, imageBase64, mimeType } = req.body;

    if (!ai) {
      return res.status(400).json({ error: 'GEMINI_API_KEY non configurée dans les variables d\'environnement.' });
    }

    if (!prompt && !imageBase64) {
      return res.status(400).json({ error: 'Prompt is required for texture generation' });
    }

    const parts: any[] = [];

    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
        },
      });
      parts.push({
        text: `${prompt || 'Generate a clean, high-resolution flat orthogonal 2D diffuse albedo texture map based on this reference photo. Flat lighting, zero directional cast shadows, no perspective distortion.'}`,
      });
    } else {
      parts.push({
        text: `${prompt}. Flat 2D top-down orthogonal texture map, completely diffuse even lighting, zero cast shadows, no perspective angle, macro surface texture, high resolution.`,
      });
    }

    // Call gemini-nano-banana-2.1 for image generation
    let imageUrl: string | null = null;
    let fallbackText = '';

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-nano-banana-2.1',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: '1:1',
            imageSize: '1K',
          },
        },
      });

      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          } else if (part.text) {
            fallbackText += part.text;
          }
        }
      }
    } catch (modelError: any) {
      console.warn('Primary image generation error:', modelError?.message);
      // Check if it is a quota/rate-limit error
      const isQuota = modelError?.message?.includes('429') || modelError?.message?.includes('quota') || modelError?.message?.includes('RESOURCE_EXHAUSTED');
      if (isQuota) {
        return res.status(429).json({
          error: 'quota_exceeded',
          message: 'Le quota de génération d\'image par IA est dépassé sur ce projet. Vous pouvez directement glisser-déposer n\'importe quelle photo ou texture pour la convertir instantanément en PBR sans limite !',
        });
      }
      throw modelError;
    }

    if (!imageUrl) {
      return res.status(500).json({
        error: 'No image was generated by the model.',
        details: fallbackText,
      });
    }

    return res.json({ imageUrl });
  } catch (error: any) {
    console.error('Error generating albedo texture:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to generate texture albedo',
    });
  }
});

/**
 * Backend Channel Packing & Multi-Software PBR Texture Exporter
 * Performs GPU/CPU fast channel blending via Sharp before generating targeted ZIP archives.
 */
app.post('/api/export-textures', async (req, res) => {
  try {
    const {
      target = 'all', // 'unity' | 'unreal' | 'blender' | 'all'
      materialName = 'materiau_pbr',
      maps,
      params = {},
      estimates = null,
      prompt = '',
    } = req.body;

    if (!maps) {
      return res.status(400).json({ error: 'Texture maps are required for export' });
    }

    const cleanName = (materialName || 'materiau_pbr')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    // Helper: Safely Convert Data URL or Base64 to Buffer
    const toBuffer = (dataUrl: string): Buffer => {
      if (!dataUrl || typeof dataUrl !== 'string') return Buffer.alloc(0);
      try {
        let b64 = dataUrl;
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx !== -1) {
          b64 = dataUrl.substring(commaIdx + 1);
        }
        b64 = b64.replace(/\s+/g, '');
        return Buffer.from(b64, 'base64');
      } catch (err) {
        console.warn('Could not parse base64 string to buffer:', err);
        return Buffer.alloc(0);
      }
    };

    const albedoBuf = toBuffer(maps.seamlessAlbedo || maps.rawAlbedo);
    const normalBuf = toBuffer(maps.normal);
    const roughBuf = toBuffer(maps.roughness);
    const aoBuf = toBuffer(maps.ao);
    const heightBuf = toBuffer(maps.height);
    const metalBuf = toBuffer(maps.metallic);

    // Determine target dimension from albedo
    let width = 1024;
    let height = 1024;
    if (albedoBuf.length > 0) {
      try {
        const meta = await sharp(albedoBuf).metadata();
        if (meta.width && meta.height) {
          width = meta.width;
          height = meta.height;
        }
      } catch (e) {
        console.warn('Could not read albedo metadata, using 1024x1024 fallback', e);
      }
    }

    // Helper to get normalized raw RGBA buffer safely
    const getRgba = async (buf: Buffer, fallbackGray = 128): Promise<Buffer> => {
      const makeFallback = () => {
        const fallback = Buffer.alloc(width * height * 4);
        for (let i = 0; i < width * height; i++) {
          fallback[i * 4] = fallbackGray;
          fallback[i * 4 + 1] = fallbackGray;
          fallback[i * 4 + 2] = fallbackGray;
          fallback[i * 4 + 3] = 255;
        }
        return fallback;
      };

      if (!buf || buf.length === 0) {
        return makeFallback();
      }

      try {
        return await sharp(buf)
          .resize(width, height, { fit: 'fill' })
          .ensureAlpha()
          .raw()
          .toBuffer();
      } catch (err) {
        console.warn('sharp getRgba decode warning, using fallback buffer:', err);
        return makeFallback();
      }
    };

    // Helper to produce PNG from buffer safely
    const toPng = async (buf: Buffer, fallbackGray = 128): Promise<Buffer> => {
      const makeFallbackPng = async () => {
        return await sharp({
          create: {
            width,
            height,
            channels: 4,
            background: { r: fallbackGray, g: fallbackGray, b: fallbackGray, alpha: 1 },
          },
        }).png().toBuffer();
      };

      if (!buf || buf.length === 0) {
        return await makeFallbackPng();
      }

      try {
        return await sharp(buf).resize(width, height, { fit: 'fill' }).png().toBuffer();
      } catch (err) {
        console.warn('sharp toPng warning, using fallback PNG:', err);
        return await makeFallbackPng();
      }
    };

    const totalPixels = width * height;

    // 1. Prepare base map buffers
    const albedoPng = await toPng(albedoBuf, 180);
    const heightPng = await toPng(heightBuf, 128);
    const normalRaw = await getRgba(normalBuf, 128);
    const roughRaw = await getRgba(roughBuf, 100);
    const aoRaw = await getRgba(aoBuf, 255);
    const metalRaw = await getRgba(metalBuf, 0);

    // 2. Generate Normal_OpenGL & Normal_DirectX
    // Normal OpenGL: Standard tangent space (X+, Y+, Z+)
    const normalOpenGLPng = await sharp(normalRaw, {
      raw: { width, height, channels: 4 },
    }).png().toBuffer();

    // Normal DirectX (Unreal Engine): Invert Green Channel (255 - G)
    const normalDirectXBuf = Buffer.alloc(totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      normalDirectXBuf[idx] = normalRaw[idx];                 // R
      normalDirectXBuf[idx + 1] = 255 - normalRaw[idx + 1];   // Invert G: 255 - G
      normalDirectXBuf[idx + 2] = normalRaw[idx + 2];         // B
      normalDirectXBuf[idx + 3] = 255;
    }
    const normalDirectXPng = await sharp(normalDirectXBuf, {
      raw: { width, height, channels: 4 },
    }).png().toBuffer();

    // 3. Generate Unity Metallic_Smoothness.png
    // RGB = Metallic, Alpha = Smoothness (255 - Roughness)
    const unityMetallicSmoothnessBuf = Buffer.alloc(totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      const metalVal = metalRaw[idx];
      const roughVal = roughRaw[idx];
      const smoothnessVal = Math.max(0, Math.min(255, 255 - roughVal));

      unityMetallicSmoothnessBuf[idx] = metalVal;          // R = Metallic
      unityMetallicSmoothnessBuf[idx + 1] = metalVal;      // G = Metallic
      unityMetallicSmoothnessBuf[idx + 2] = metalVal;      // B = Metallic
      unityMetallicSmoothnessBuf[idx + 3] = smoothnessVal; // A = Smoothness (255 - Roughness)
    }
    const metallicSmoothnessPng = await sharp(unityMetallicSmoothnessBuf, {
      raw: { width, height, channels: 4 },
    }).png().toBuffer();

    // 4. Generate Unreal Engine ORM.png
    // R = Ambient Occlusion, G = Roughness, B = Metallic, A = 255
    const ueOrmBuf = Buffer.alloc(totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      ueOrmBuf[idx] = aoRaw[idx];        // R = Ambient Occlusion
      ueOrmBuf[idx + 1] = roughRaw[idx]; // G = Roughness
      ueOrmBuf[idx + 2] = metalRaw[idx]; // B = Metallic
      ueOrmBuf[idx + 3] = 255;           // A = 255
    }
    const ormPng = await sharp(ueOrmBuf, {
      raw: { width, height, channels: 4 },
    }).png().toBuffer();

    // 5. Separate clean grayscale maps for Blender & Standard
    const roughnessPng = await sharp(roughRaw, {
      raw: { width, height, channels: 4 },
    }).png().toBuffer();

    const aoPng = await sharp(aoRaw, {
      raw: { width, height, channels: 4 },
    }).png().toBuffer();

    const metallicPng = await sharp(metalRaw, {
      raw: { width, height, channels: 4 },
    }).png().toBuffer();

    // Build README documentation files
    const readmeUnity = `======================================================================
MATGEN PBR STUDIO — GUIDE D'IMPORTATION UNITY (URP / STANDARD)
Matériau : ${materialName}
Résolution : ${width}x${height} px
======================================================================

FICHIERS INCLUS :
1. Albedo.png
   - Carte de couleur diffuse (sRGB : activé).
2. Normal_OpenGL.png
   - Carte de relief normale en espace tangent (OpenGL +Y).
3. Metallic_Smoothness.png
   - TEXTURE COMBINÉE ULTRA-OPTIMISÉE CRÉÉE PAR LE BACKEND :
     * Canaux RGB  = Réflectance Métallique (Metallic)
     * Canal Alpha = Lissage de surface (Smoothness = 255 - Roughness)
4. AO.png
   - Occlusion ambiante pour ombrer les micro-cavités et creux.
5. Height.png
   - Carte de hauteur et de déplacement (Displacement / Parallax).

ÉTAPES DE CONFIGURATION DANS UNITY (URP Lit / Built-in Standard) :
1. Glissez les fichiers dans votre dossier Assets/Textures de votre projet Unity.
2. Cliquez sur 'Normal_OpenGL.png' dans l'Inspecteur :
   - Réglez 'Texture Type' sur 'Normal map'.
   - Cliquez sur 'Apply'.
3. Cliquez sur 'Metallic_Smoothness.png' :
   - Dans l'Inspecteur, assurez-vous que 'Alpha Source' est bien sur 'Input Texture Alpha'.
   - Laissez 'sRGB (Color Texture)' décoché (Non-Color linear data).
4. Créez votre Material (Shader: Universal Render Pipeline/Lit ou Standard) :
   - Slot 'Base Map' (ou Albedo)        -> Albedo.png
   - Slot 'Metallic Map'                -> Metallic_Smoothness.png (Source: Metallic Alpha)
   - Slot 'Normal Map'                  -> Normal_OpenGL.png
   - Slot 'Occlusion'                   -> AO.png
   - Slot 'Height Map'                  -> Height.png
`;

    const readmeUnreal = `======================================================================
MATGEN PBR STUDIO — GUIDE D'IMPORTATION UNREAL ENGINE 5
Matériau : ${materialName}
Résolution : ${width}x${height} px
======================================================================

FICHIERS INCLUS :
1. BaseColor.png
   - Carte de couleur diffuse (sRGB activé).
2. Normal_DirectX.png
   - Carte de normales avec canal Vert inversé (-Y DirectX conforme au moteur UE5).
3. ORM.png
   - TEXTURE COMBINÉE 3-EN-1 OPTIMISÉE POUR PERFORMANCE GPU :
     * Canal R (Rouge) = Ambient Occlusion (AO)
     * Canal G (Vert)  = Roughness (Rugosité)
     * Canal B (Bleu)  = Metallic (Métallique)
4. Height.png
   - Carte de hauteur (World Position Offset / Virtual Heightfield Mesh / Bump Offset).

ÉTAPES DE CONFIGURATION DANS UNREAL ENGINE 5 :
1. Glissez-déposez les fichiers PNG dans votre Content Browser.
2. Double-cliquez sur 'ORM.png' dans l'éditeur de texture UE5 :
   - DÉCOCHEZ impérativement la case 'sRGB' (Texture linéaire de données physiques) !
   - Enregistrez la texture.
3. Vérifiez 'Normal_DirectX.png' :
   - UE5 détecte automatiquement les normales et active 'Compression Settings: Normalmap (DXT5/BC5)'.
4. Ouvrez votre Material Graph et connectez les sorties Texture Sample :
   - BaseColor (RGB)       -> Base Color
   - ORM (Canal Rouge R)   -> Ambient Occlusion
   - ORM (Canal Vert G)    -> Roughness
   - ORM (Canal Bleu B)    -> Metallic
   - Normal_DirectX (RGB)  -> Normal
`;

    const readmeBlender = `======================================================================
MATGEN PBR STUDIO — GUIDE D'IMPORTATION BLENDER (PRINCIPLED BSDF)
Matériau : ${materialName}
Résolution : ${width}x${height} px
======================================================================

FICHIERS INCLUS (CARTES SÉPARÉES STANDARD) :
- Albedo.png           : Couleur diffuse (Color Space: sRGB)
- Normal_OpenGL.png    : Carte de relief normale (Color Space: Non-Color)
- Roughness.png        : Rugosité de surface (Color Space: Non-Color)
- Metallic.png         : Conductivité métallique (Color Space: Non-Color)
- AO.png               : Cavités et occlusion ambiante (Color Space: Non-Color)
- Height.png           : Hauteur et déplacement (Color Space: Non-Color)

MÉTHODE ULTRA-RAPIDE AVEC 'NODE WRANGLER' (1 CLIC) :
1. Activez l'add-on inclus 'Node Wrangler' dans Blender (Edit > Preferences > Add-ons).
2. Dans le Shader Workspace, sélectionnez votre nœud 'Principled BSDF'.
3. Appuyez sur le raccourci clavier : Ctrl + Shift + T.
4. Sélectionnez tous les fichiers de ce dossier. Blender effectue instantanément tous les branchements !

BRANCHEMENT MANUEL :
- Albedo.png           -> Principled BSDF 'Base Color' (Color Space: sRGB)
- Roughness.png        -> Principled BSDF 'Roughness' (Color Space: Non-Color)
- Metallic.png         -> Principled BSDF 'Metallic' (Color Space: Non-Color)
- Normal_OpenGL.png    -> Nœud 'Normal Map' (Color Space: Non-Color) -> Principled BSDF 'Normal'
- Height.png           -> Nœud 'Displacement' (Color Space: Non-Color) -> Material Output 'Displacement'
`;

    const readmeRootPack = `======================================================================
MATGEN PBR STUDIO — PACK COMPLET MULTI-LOGICIELS
Matériau : ${materialName}
Résolution : ${width}x${height} px
======================================================================

Ce pack complet regroupe toutes les déclinaisons de textures PBR optimisées pour
les trois écosystèmes majeurs de la 3D et du jeu vidéo contemporain :

DOSSIERS :
/Unity/      -> Textures prêtes pour Unity URP et Standard.
                Contient la texture fusionnée 'Metallic_Smoothness.png'
                (RGB = Métallique, Alpha = Lissage), Albedo, Normal OpenGL, AO et Height.

/Unreal/     -> Textures prêtes pour Unreal Engine 5.
                Contient la texture fusionnée 'ORM.png' (R=AO, G=Roughness, B=Metallic),
                la normale inversée 'Normal_DirectX.png', BaseColor et Height.

/Blender/    -> Suite classique complète à cartes séparées pour Blender (Principled BSDF)
                et moteurs PBR standards (Godot, Cinema4D, Maya, 3ds Max).

Chaque dossier contient son propre fichier README détaillé avec le guide de câblage pas-à-pas.
Généré avec MatGen PBR Studio.
`;

    const pbrSpecJson = JSON.stringify(
      {
        materialName,
        sourcePrompt: prompt,
        generatedWith: 'MatGen PBR Studio',
        exportDate: new Date().toISOString(),
        resolution: `${width}x${height}`,
        exportTarget: target,
        pbrParameters: params,
        physicalEstimates: estimates || null,
        channelPackingSpecs: {
          unity: {
            metallicSmoothness: 'RGB = Metallic, Alpha = 255 - Roughness',
            normalFormat: 'OpenGL (+Y)',
          },
          unrealEngine: {
            orm: 'Red = Ambient Occlusion, Green = Roughness, Blue = Metallic',
            normalFormat: 'DirectX (-Y with inverted Green channel)',
          },
          blender: {
            workflow: 'Metallic/Roughness Standard PBR with OpenGL Normals',
          },
        },
      },
      null,
      2
    );

    // Create ZIP archive with JSZip
    const zip = new JSZip();
    let zipFilename = `${cleanName}_pbr_pack.zip`;

    if (target === 'unity') {
      zipFilename = `${cleanName}_Unity_URP.zip`;
      zip.file('Albedo.png', albedoPng);
      zip.file('Normal_OpenGL.png', normalOpenGLPng);
      zip.file('Metallic_Smoothness.png', metallicSmoothnessPng);
      zip.file('AO.png', aoPng);
      zip.file('Height.png', heightPng);
      zip.file('README.txt', readmeUnity);
      zip.file('pbr_spec.json', pbrSpecJson);
    } else if (target === 'unreal') {
      zipFilename = `${cleanName}_Unreal_Engine_5.zip`;
      zip.file('BaseColor.png', albedoPng);
      zip.file('Normal_DirectX.png', normalDirectXPng);
      zip.file('ORM.png', ormPng);
      zip.file('Height.png', heightPng);
      zip.file('README.txt', readmeUnreal);
      zip.file('pbr_spec.json', pbrSpecJson);
    } else if (target === 'blender') {
      zipFilename = `${cleanName}_Blender_PBR.zip`;
      zip.file('Albedo.png', albedoPng);
      zip.file('Normal_OpenGL.png', normalOpenGLPng);
      zip.file('Roughness.png', roughnessPng);
      zip.file('Metallic.png', metallicPng);
      zip.file('AO.png', aoPng);
      zip.file('Height.png', heightPng);
      zip.file('README.txt', readmeBlender);
      zip.file('pbr_spec.json', pbrSpecJson);
    } else {
      // Pack Complet (Tous logiciels) - 3 sub-folders
      zipFilename = `${cleanName}_Pack_Complet_PBR.zip`;

      const unityFolder = zip.folder('Unity');
      if (unityFolder) {
        unityFolder.file('Albedo.png', albedoPng);
        unityFolder.file('Normal_OpenGL.png', normalOpenGLPng);
        unityFolder.file('Metallic_Smoothness.png', metallicSmoothnessPng);
        unityFolder.file('AO.png', aoPng);
        unityFolder.file('Height.png', heightPng);
        unityFolder.file('README_Unity.txt', readmeUnity);
      }

      const unrealFolder = zip.folder('Unreal');
      if (unrealFolder) {
        unrealFolder.file('BaseColor.png', albedoPng);
        unrealFolder.file('Normal_DirectX.png', normalDirectXPng);
        unrealFolder.file('ORM.png', ormPng);
        unrealFolder.file('Height.png', heightPng);
        unrealFolder.file('README_Unreal.txt', readmeUnreal);
      }

      const blenderFolder = zip.folder('Blender');
      if (blenderFolder) {
        blenderFolder.file('Albedo.png', albedoPng);
        blenderFolder.file('Normal_OpenGL.png', normalOpenGLPng);
        blenderFolder.file('Roughness.png', roughnessPng);
        blenderFolder.file('Metallic.png', metallicPng);
        blenderFolder.file('AO.png', aoPng);
        blenderFolder.file('Height.png', heightPng);
        blenderFolder.file('README_Blender.txt', readmeBlender);
      }

      zip.file('README.txt', readmeRootPack);
      zip.file('pbr_spec.json', pbrSpecJson);
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Archive-Name');
    res.setHeader('X-Archive-Name', zipFilename);
    return res.send(zipBuffer);
  } catch (error: any) {
    console.error('Error packing PBR textures in backend:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to pack and export PBR textures',
    });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', studio: 'MatGen PBR' });
});

// Setup Vite middleware in dev or serve static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[MatGen PBR] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
