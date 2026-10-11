# MatGen PBR — Studio Lookdev & PBR Texture Suite

MatGen PBR est un studio moderne de génération et de calibration de textures PBR (Physically-Based Rendering) en temps réel. Importez n'importe quelle photographie ou texture et transformez-la instantanément en matériau 3D complet prêt pour les moteurs de jeux et logiciels 3D (Blender, Unreal Engine, Unity).

##  Fonctionnalités Clés

- **Conversion Photo vers PBR 100% Locale :**
  - Extraction de carte de normales (Normal Map) avec support OpenGL (+Y) et DirectX (-Y).
  - Rugosité calibrée (Roughness Map) du miroir spéculaire pur au mat diffus.
  - Carte de hauteur et déplacement géométrique (Height / Displacement Map).
  - Occlusion ambiante de creux rapide en temps réel (Cavity AO Map).
  - Aspect métallique (Metallic Map).
- **Raccord Sans Couture (Seamless Tiling) :**
  - Synthèse par patchs et élimination des artefacts miroir / kaléidoscope.
  - Égalisation de luminosité et suppression automatique du vignettage (*de-lighting*).
- **Visualiseur 3D Lookdev Temps Réel :**
  - Moteur de rendu WebGL Three.js à 60 FPS avec éclairage studio dynamique et préréglages d'environnement HDR.
  - Géométries multiples : Sphère, Shaderball, Cube, Plan, Cylindre, Sol.
  - Relief 3D géométrique temps réel (Tessellation & Displacement).
  - Mode fil de fer, rotation automatique et plein écran.
- **Export Multi-Moteurs :**
  - Téléchargement individuel des cartes PNG.
  - Exportation en archives ZIP prêtes à l'emploi avec channel packing optimisé pour **Blender**, **Unreal Engine** (ORM) et **Unity** (Standard / URP).

##  Démarrage Rapide

### Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou supérieure)

### Installation
```bash
# Installer les dépendances
npm install

# Lancer le serveur de développement local
npm run dev
```

L'application est accessible sur : `http://localhost:3000`

### Build pour la production
```bash
npm run build
npm start
```

##  Configuration Optionnelle

L'application fonctionne de manière autonome en local sans clé d'API. Si vous souhaitez activer l'analyse IA via Google Gemini, vous pouvez créer un fichier `.env` à la racine :

```env
GEMINI_API_KEY="votre_cle_api_ici"
PORT=3000
```

##  Licence
Ce projet est open source et distribué sous licence MIT.
