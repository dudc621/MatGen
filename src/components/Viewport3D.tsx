import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { MaterialMaps, PBRParameters, ViewportGeometry, ViewportSettings, EnvironmentPreset } from '../types';
import { generateEnvironmentPresets, EnvironmentPresetConfig } from '../utils/hdrEnvironments';
import { 
  RotateCw, 
  Maximize2, 
  Minimize2,
  Grid3X3, 
  Sun, 
  Sparkles, 
  Layers, 
  Eye, 
  Move3d,
  Disc,
  Box,
  Circle,
  Square,
  Building
} from 'lucide-react';

interface Viewport3DProps {
  maps: MaterialMaps | null;
  params: PBRParameters;
  settings: ViewportSettings;
  onUpdateSettings: (newSettings: Partial<ViewportSettings>) => void;
}

export const Viewport3D: React.FC<Viewport3DProps> = ({
  maps,
  params,
  settings,
  onUpdateSettings,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const currentMeshRef = useRef<THREE.Group | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const envPresetsRef = useRef<Record<EnvironmentPreset, EnvironmentPresetConfig> | null>(null);
  const loadedUrlsRef = useRef<{
    albedo?: string;
    normal?: string;
    roughness?: string;
    ao?: string;
    height?: string;
    metallic?: string;
    tiling?: number;
  }>({});

  // Settings Ref to always have the latest settings inside 60fps animate loop without stale closures
  const settingsRef = useRef<ViewportSettings>(settings);
  settingsRef.current = settings;

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Mouse interaction for camera orbit
  const orbitState = useRef({
    isMouseDown: false,
    isRightDown: false,
    prevMouseX: 0,
    prevMouseY: 0,
    spherical: new THREE.Spherical(4.6, Math.PI / 2.7, Math.PI / 4),
    target: new THREE.Vector3(0, 0, 0),
  });

  // Native Fullscreen API + Fallback handler
  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    try {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if ((el as any).webkitRequestFullscreen) {
          await (el as any).webkitRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch {
      // CSS fullscreen fallback if permission denied
      setIsFullscreen((prev) => !prev);
    }
  }, []);

  // Listen for fullscreen change events (e.g. user presses Esc key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Resize handler
  const handleResize = useCallback(() => {
    const container = mountRef.current;
    if (!container || !rendererRef.current || !cameraRef.current) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    cameraRef.current.aspect = w / h;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(w, h);
  }, []);

  // Trigger resize on fullscreen state toggle
  useEffect(() => {
    const timer = setTimeout(() => {
      handleResize();
    }, 50);
    return () => clearTimeout(timer);
  }, [isFullscreen, handleResize]);

  // Setup Three.js Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0d12);
    sceneRef.current = scene;

    // Camera (near 0.05 prevents clipping when zooming close)
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 100);
    camera.position.setFromSpherical(orbitState.current.spherical);
    camera.lookAt(orbitState.current.target);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Generate HDR Radiance Environment Maps
    const envPresets = generateEnvironmentPresets(renderer);
    envPresetsRef.current = envPresets;

    // 1. Key Light (Main directional light with soft dynamic shadow)
    const keyLight = new THREE.DirectionalLight(0xfff8ee, 3.2);
    keyLight.position.set(4, 5, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 15;
    keyLight.shadow.camera.left = -3;
    keyLight.shadow.camera.right = 3;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -3;
    keyLight.shadow.bias = -0.0003;
    scene.add(keyLight);
    keyLightRef.current = keyLight;

    // 2. Fill Light (Cool, soft sky)
    const fillLight = new THREE.DirectionalLight(0xb4d2ff, 1.2);
    fillLight.position.set(-4, 2, -2);
    scene.add(fillLight);
    fillLightRef.current = fillLight;

    // 3. Rim Light (Back highlight for edge separation)
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.8);
    rimLight.position.set(0, 4, -5);
    scene.add(rimLight);
    rimLightRef.current = rimLight;

    // 4. Soft Ambient Floor/Ceiling light
    const hemiLight = new THREE.HemisphereLight(0x2a3342, 0x111317, 0.8);
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;

    // Ground Shadow Catcher Plane
    const shadowPlaneGeo = new THREE.PlaneGeometry(16, 16);
    const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.6;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // Subtle Studio Grid Floor
    const gridHelper = new THREE.GridHelper(10, 20, 0x222632, 0x14161f);
    gridHelper.position.y = -1.6;
    scene.add(gridHelper);

    // Pre-create neutral displacement texture so #ifdef USE_DISPLACEMENTMAP is compiled from frame 1
    const dummyDisplaceData = new Uint8Array([128, 128, 128, 255]);
    const dummyDisplaceTex = new THREE.DataTexture(dummyDisplaceData, 1, 1, THREE.RGBAFormat);
    dummyDisplaceTex.wrapS = THREE.RepeatWrapping;
    dummyDisplaceTex.wrapT = THREE.RepeatWrapping;
    dummyDisplaceTex.needsUpdate = true;

    // Standard Native Three.js PBR Material (Clean, robust, rock-solid displacement)
    const pbrMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.0,
      envMapIntensity: 1.0,
      displacementMap: dummyDisplaceTex,
      displacementScale: 0,
      displacementBias: 0,
    });
    materialRef.current = pbrMaterial;

    // Resize Observer
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Animation Loop with dynamic settingsRef evaluation
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Auto-rotate evaluated dynamically at 60fps via settingsRef
      if (settingsRef.current.autoRotate && currentMeshRef.current && !orbitState.current.isMouseDown) {
        currentMeshRef.current.rotation.y += 0.005;
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [handleResize]);

  // Update HDR Environment & Lights when environment preset changes
  useEffect(() => {
    if (!sceneRef.current || !envPresetsRef.current) return;
    const scene = sceneRef.current;
    const currentEnv = settings.environment || 'studio';
    const preset = envPresetsRef.current[currentEnv] || envPresetsRef.current.studio;

    scene.environment = preset.envMap;
    scene.background = new THREE.Color(preset.backgroundColor);

    if (keyLightRef.current) {
      keyLightRef.current.color.setHex(preset.keyLightColor);
      keyLightRef.current.intensity = preset.keyLightIntensity * (settings.lightIntensity / 3.2);
    }
    if (fillLightRef.current) {
      fillLightRef.current.color.setHex(preset.fillLightColor);
      fillLightRef.current.intensity = preset.fillLightIntensity;
    }
    if (rimLightRef.current) {
      rimLightRef.current.color.setHex(preset.rimLightColor);
      rimLightRef.current.intensity = preset.rimLightIntensity;
    }
    if (hemiLightRef.current) {
      hemiLightRef.current.color.setHex(preset.hemiSkyColor);
      hemiLightRef.current.groundColor.setHex(preset.hemiGroundColor);
      hemiLightRef.current.intensity = preset.hemiIntensity;
    }
  }, [settings.environment, settings.lightIntensity]);

  // Update Key Light Position from Settings
  useEffect(() => {
    if (!keyLightRef.current) return;
    const rad = (settings.lightAngle * Math.PI) / 180;
    const elev = (settings.lightElevation * Math.PI) / 180;
    const distance = 6;
    const x = distance * Math.cos(elev) * Math.sin(rad);
    const y = distance * Math.sin(elev);
    const z = distance * Math.cos(elev) * Math.cos(rad);

    keyLightRef.current.position.set(x, y, z);
  }, [settings.lightAngle, settings.lightElevation]);

  // 1. Textures Loading Effect: Runs ONLY when maps change or tiling changes
  useEffect(() => {
    if (!materialRef.current) return;
    const mat = materialRef.current;
    const loader = new THREE.TextureLoader();

    const configureTexture = (tex: THREE.Texture, isColorMap: boolean = false) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(settings.uvTiling, settings.uvTiling);
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 16;
      tex.colorSpace = isColorMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.channel = 0;
      tex.needsUpdate = true;
    };

    const configureCanvasTexture = (canvas: HTMLCanvasElement, isColorMap: boolean = false) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(settings.uvTiling, settings.uvTiling);
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 16;
      tex.colorSpace = isColorMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.channel = 0;
      tex.needsUpdate = true;
      return tex;
    };

    if (!maps || !maps.seamlessAlbedo) {
      mat.map = null;
      mat.normalMap = null;
      mat.roughnessMap = null;
      mat.aoMap = null;
      mat.metalnessMap = null;
      mat.color.setHex(0x8a929e);
      mat.needsUpdate = true;
      loadedUrlsRef.current = {};
      return;
    }

    mat.color.setHex(0xffffff);

    // If only UV tiling changed, update all existing textures directly on GPU without reloading!
    if (loadedUrlsRef.current.tiling !== settings.uvTiling) {
      loadedUrlsRef.current.tiling = settings.uvTiling;
      [mat.map, mat.normalMap, mat.roughnessMap, mat.aoMap, mat.metalnessMap, mat.displacementMap].forEach((t) => {
        if (t) {
          t.repeat.set(settings.uvTiling, settings.uvTiling);
          t.needsUpdate = true;
        }
      });
    }

    // Direct synchronous GPU upload if HTML5 Canvases are present (0ms delay, zero base64 decoding)
    if (maps.canvases) {
      if (maps.canvases.seamlessAlbedo && loadedUrlsRef.current.albedo !== maps.seamlessAlbedo) {
        loadedUrlsRef.current.albedo = maps.seamlessAlbedo;
        mat.map = configureCanvasTexture(maps.canvases.seamlessAlbedo, true);
      }
      if (maps.canvases.normal && loadedUrlsRef.current.normal !== maps.normal) {
        loadedUrlsRef.current.normal = maps.normal;
        mat.normalMap = configureCanvasTexture(maps.canvases.normal, false);
      }
      if (maps.canvases.roughness && loadedUrlsRef.current.roughness !== maps.roughness) {
        loadedUrlsRef.current.roughness = maps.roughness;
        mat.roughnessMap = configureCanvasTexture(maps.canvases.roughness, false);
      }
      if (maps.canvases.ao && loadedUrlsRef.current.ao !== maps.ao) {
        loadedUrlsRef.current.ao = maps.ao;
        mat.aoMap = configureCanvasTexture(maps.canvases.ao, false);
      }
      if (maps.canvases.metallic && loadedUrlsRef.current.metallic !== maps.metallic) {
        loadedUrlsRef.current.metallic = maps.metallic;
        mat.metalnessMap = configureCanvasTexture(maps.canvases.metallic, false);
      }
      if (maps.canvases.height && loadedUrlsRef.current.height !== maps.height) {
        loadedUrlsRef.current.height = maps.height;
        mat.displacementMap = configureCanvasTexture(maps.canvases.height, false);
      }
      mat.needsUpdate = true;
      mat.wireframe = settings.wireframe;
      return;
    }

    // Fallback URL image loading
    // 1. Albedo
    if (maps.seamlessAlbedo && loadedUrlsRef.current.albedo !== maps.seamlessAlbedo) {
      loadedUrlsRef.current.albedo = maps.seamlessAlbedo;
      loader.load(maps.seamlessAlbedo, (tex) => {
        configureTexture(tex, true);
        mat.map = tex;
        mat.needsUpdate = true;
      });
    }

    // 2. Normal Map
    if (maps.normal && loadedUrlsRef.current.normal !== maps.normal) {
      loadedUrlsRef.current.normal = maps.normal;
      loader.load(maps.normal, (tex) => {
        configureTexture(tex, false);
        mat.normalMap = tex;
        mat.needsUpdate = true;
      });
    }

    // 3. Roughness Map
    if (maps.roughness && loadedUrlsRef.current.roughness !== maps.roughness) {
      loadedUrlsRef.current.roughness = maps.roughness;
      loader.load(maps.roughness, (tex) => {
        configureTexture(tex, false);
        mat.roughnessMap = tex;
        mat.needsUpdate = true;
      });
    }

    // 4. Ambient Occlusion Map
    if (maps.ao && loadedUrlsRef.current.ao !== maps.ao) {
      loadedUrlsRef.current.ao = maps.ao;
      loader.load(maps.ao, (tex) => {
        configureTexture(tex, false);
        mat.aoMap = tex;
        mat.needsUpdate = true;
      });
    }

    // 5. Metallic Map
    if (maps.metallic && loadedUrlsRef.current.metallic !== maps.metallic) {
      loadedUrlsRef.current.metallic = maps.metallic;
      loader.load(maps.metallic, (tex) => {
        configureTexture(tex, false);
        mat.metalnessMap = tex;
        mat.needsUpdate = true;
      });
    }

    // 6. Displacement Map
    if (maps.height && loadedUrlsRef.current.height !== maps.height) {
      loadedUrlsRef.current.height = maps.height;
      loader.load(maps.height, (tex) => {
        configureTexture(tex, false);
        mat.displacementMap = tex;
        mat.needsUpdate = true;
      });
    }

    mat.wireframe = settings.wireframe;
  }, [maps, settings.uvTiling, settings.wireframe]);

  // 2. Real-time GPU Parameters Effect (0ms latency, continuous 60fps slider reaction)
  useEffect(() => {
    if (!materialRef.current) return;
    const mat = materialRef.current;

    // Normal scale & format (OpenGL +Y vs DirectX -Y inverted Green channel)
    const isDirectX = params.normalFormat === 'directx';
    const effectiveNormalStrength = params.normalStrength * Math.max(0.4, params.heightContrast);
    mat.normalScale.set(
      effectiveNormalStrength,
      isDirectX ? -effectiveNormalStrength : effectiveNormalStrength
    );

    // Roughness calibrated scalar:
    // User range: -0.5 (Glossy / Specular mirror) to +0.5 (Matte / Rough)
    // When roughnessBias is -0.5: scalar = 0.04 (pure mirror)
    // When roughnessBias is  0.0: scalar = 1.0 (texture baseline)
    // When roughnessBias is +0.5: scalar = 2.8 (saturates GGX BRDF to 1.0 matte)
    const bias = params.roughnessBias;
    const roughMultiplier = bias < 0
      ? Math.max(0.04, 1.0 + bias * 1.92)
      : 1.0 + bias * 3.6;
    mat.roughness = roughMultiplier;

    // Metallic scalar
    mat.metalness = params.metallic;

    // AO Intensity
    mat.aoMapIntensity = params.aoIntensity;

    // 3D Displacement (Relief 3D) scale & bias
    if (settings.displacement && mat.displacementMap) {
      const baseScale = params.displacementScale ?? 0.12;
      const contrastMult = Math.max(0.2, params.heightContrast);
      const effectiveScale = baseScale * contrastMult * (params.invertHeight ? -1 : 1);
      mat.displacementScale = effectiveScale;
      mat.displacementBias = -effectiveScale * 0.5;
    } else {
      mat.displacementScale = 0;
      mat.displacementBias = 0;
    }
  }, [
    params.normalStrength,
    params.normalFormat,
    params.roughnessBias,
    params.metallic,
    params.aoIntensity,
    params.displacementScale,
    params.heightContrast,
    params.invertHeight,
    settings.displacement,
  ]);

  // Re-build 3D Mesh when Geometry changes
  useEffect(() => {
    if (!sceneRef.current || !materialRef.current) return;
    const scene = sceneRef.current;
    const mat = materialRef.current;

    if (currentMeshRef.current) {
      scene.remove(currentMeshRef.current);
      currentMeshRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      });
    }

    const group = new THREE.Group();

    // Setup Geometry with proper normals and cloned UV2 for rock-solid AO & Relief mapping
    const setupGeo = (geo: THREE.BufferGeometry) => {
      geo.computeVertexNormals();
      if (!geo.attributes.uv2 && geo.attributes.uv) {
        geo.setAttribute('uv2', geo.attributes.uv.clone());
      }
      return geo;
    };

    if (settings.geometry === 'shaderball') {
      const outerGeo = setupGeo(new THREE.SphereGeometry(1.35, 128, 128));
      const outerMesh = new THREE.Mesh(outerGeo, mat);
      outerMesh.castShadow = true;
      outerMesh.receiveShadow = true;
      group.add(outerMesh);

      const innerCoreGeo = setupGeo(new THREE.SphereGeometry(0.85, 64, 64));
      const innerCoreMesh = new THREE.Mesh(innerCoreGeo, mat);
      innerCoreMesh.position.set(0, 0, 0.35);
      group.add(innerCoreMesh);

      const baseGeo = setupGeo(new THREE.CylinderGeometry(1.1, 1.3, 0.25, 64));
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x1a1c23,
        roughness: 0.3,
        metalness: 0.8,
      });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.y = -1.45;
      baseMesh.receiveShadow = true;
      group.add(baseMesh);
      group.position.y = 0.2;
    } else if (settings.geometry === 'sphere') {
      // Subdivided sphere for crisp 3D displacement
      const geo = setupGeo(new THREE.SphereGeometry(1.5, 192, 192));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      group.position.y = 0;
    } else if (settings.geometry === 'cube') {
      const geo = setupGeo(new THREE.BoxGeometry(2.0, 2.0, 2.0, 64, 64, 64));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      group.position.y = 0;
    } else if (settings.geometry === 'cylinder') {
      const geo = setupGeo(new THREE.CylinderGeometry(1.1, 1.1, 2.2, 128, 64));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      group.position.y = 0;
    } else if (settings.geometry === 'plane') {
      // High subdivision plane for pristine relief detail
      const geo = setupGeo(new THREE.PlaneGeometry(3.2, 3.2, 256, 256));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 4;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      group.position.y = 0;
    } else if (settings.geometry === 'ground') {
      const geo = setupGeo(new THREE.PlaneGeometry(22, 22, 256, 256));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -1.1;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      group.position.y = 0;
    }

    scene.add(group);
    currentMeshRef.current = group;
  }, [settings.geometry]);

  // Mouse Orbit Interaction
  const handleMouseDown = (e: React.MouseEvent) => {
    orbitState.current.isMouseDown = true;
    orbitState.current.isRightDown = e.button === 2;
    orbitState.current.prevMouseX = e.clientX;
    orbitState.current.prevMouseY = e.clientY;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!orbitState.current.isMouseDown || !cameraRef.current) return;
    const deltaX = e.clientX - orbitState.current.prevMouseX;
    const deltaY = e.clientY - orbitState.current.prevMouseY;
    orbitState.current.prevMouseX = e.clientX;
    orbitState.current.prevMouseY = e.clientY;

    if (orbitState.current.isRightDown) {
      const panSpeed = 0.005 * orbitState.current.spherical.radius;
      orbitState.current.target.x -= deltaX * panSpeed;
      orbitState.current.target.y += deltaY * panSpeed;
    } else {
      const rotateSpeed = 0.006;
      orbitState.current.spherical.theta -= deltaX * rotateSpeed;
      orbitState.current.spherical.phi = Math.max(
        0.1,
        Math.min(Math.PI / 2 + 0.1, orbitState.current.spherical.phi - deltaY * rotateSpeed)
      );
    }

    cameraRef.current.position.setFromSpherical(orbitState.current.spherical).add(orbitState.current.target);
    cameraRef.current.lookAt(orbitState.current.target);
  };

  const handleMouseUp = () => {
    orbitState.current.isMouseDown = false;
    orbitState.current.isRightDown = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!cameraRef.current) return;
    const zoomFactor = e.deltaY * 0.0028;
    orbitState.current.spherical.radius = Math.max(
      1.95,
      Math.min(8.5, orbitState.current.spherical.radius + zoomFactor)
    );
    cameraRef.current.position.setFromSpherical(orbitState.current.spherical).add(orbitState.current.target);
    cameraRef.current.lookAt(orbitState.current.target);
  };

  const resetCamera = () => {
    if (!cameraRef.current) return;
    if (settings.geometry === 'ground') {
      orbitState.current.spherical.set(7.5, Math.PI / 3.0, Math.PI / 4);
    } else {
      orbitState.current.spherical.set(4.6, Math.PI / 2.7, Math.PI / 4);
    }
    orbitState.current.target.set(0, 0, 0);
    cameraRef.current.position.setFromSpherical(orbitState.current.spherical);
    cameraRef.current.lookAt(orbitState.current.target);
    if (currentMeshRef.current) {
      currentMeshRef.current.rotation.set(0, 0, 0);
    }
  };

  const currentEnv = settings.environment || 'studio';

  const geometries: { id: ViewportGeometry; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'sphere', label: 'Sphère', icon: Circle },
    { id: 'shaderball', label: 'Shaderball', icon: Disc },
    { id: 'cube', label: 'Cube', icon: Box },
    { id: 'plane', label: 'Plan', icon: Square },
    { id: 'cylinder', label: 'Cylindre', icon: Square },
    { id: 'ground', label: 'Sol', icon: Layers },
  ];

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full min-h-[460px] bg-[#0c0d12] select-none overflow-hidden ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'rounded-none'
      }`}
    >
      {/* Three.js Canvas Container */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Floating Top Controls HUD */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none flex-wrap gap-2">
        <div className="flex items-center gap-2 pointer-events-auto flex-wrap">
          {/* Geometry Switcher */}
          <div className="flex items-center gap-1 p-1 bg-[#14161f]/90 backdrop-blur-xl rounded-xl border border-white/[0.08] shadow-2xl">
            {geometries.map(({ id, label, icon: Icon }) => {
              const isActive = settings.geometry === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    onUpdateSettings({ geometry: id });
                    if (id === 'ground' && cameraRef.current) {
                      orbitState.current.spherical.set(7.5, Math.PI / 3.0, Math.PI / 4);
                      cameraRef.current.position.setFromSpherical(orbitState.current.spherical);
                      cameraRef.current.lookAt(orbitState.current.target);
                    }
                  }}
                  title={label}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    isActive
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${id === 'cylinder' ? 'rotate-45 scale-75' : ''}`} />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              );
            })}
          </div>

          {/* HDR Environment Selector */}
          <div className="flex items-center gap-1 p-1 bg-[#14161f]/90 backdrop-blur-xl rounded-xl border border-white/[0.08] shadow-2xl">
            <span className="text-[11px] text-neutral-500 font-medium px-1.5 hidden md:inline">Éclairage :</span>
            <button
              onClick={() => onUpdateSettings({ environment: 'studio' })}
              title="Studio neutre"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                currentEnv === 'studio'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Studio</span>
            </button>

            <button
              onClick={() => onUpdateSettings({ environment: 'exterior' })}
              title="Extérieur ciel & soleil"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                currentEnv === 'exterior'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Extérieur</span>
            </button>

            <button
              onClick={() => onUpdateSettings({ environment: 'interior' })}
              title="Intérieur showroom"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                currentEnv === 'interior'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <Building className="w-3.5 h-3.5" />
              <span>Intérieur</span>
            </button>
          </div>
        </div>

        {/* Viewport Action Tools */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* UV Tiling Selector */}
          <div className="flex items-center gap-1 px-2.5 py-1 bg-[#14161f]/90 backdrop-blur-xl rounded-xl border border-white/[0.08] text-xs text-neutral-300 shadow-2xl">
            <Grid3X3 className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-neutral-500 mr-1 hidden sm:inline">Répétition :</span>
            {[1, 2, 4, 8].map((tile) => (
              <button
                key={tile}
                onClick={() => onUpdateSettings({ uvTiling: tile })}
                className={`px-1.5 py-0.5 rounded-md text-xs font-mono font-medium transition-colors ${
                  settings.uvTiling === tile
                    ? 'bg-white text-black font-semibold'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {tile}×
              </button>
            ))}
          </div>

          {/* Reset Camera */}
          <button
            onClick={resetCamera}
            title="Recentrer la caméra"
            className="p-2 bg-[#14161f]/90 hover:bg-white/[0.08] text-neutral-400 hover:text-white rounded-xl border border-white/[0.08] backdrop-blur-xl shadow-2xl transition-colors"
          >
            <Move3d className="w-4 h-4" />
          </button>

          {/* Fullscreen Toggle (Native HTML5 API + CSS Fallback) */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
            className={`p-2 rounded-xl border backdrop-blur-xl shadow-2xl transition-colors ${
              isFullscreen
                ? 'bg-white text-black border-white shadow-sm'
                : 'bg-[#14161f]/90 hover:bg-white/[0.08] text-neutral-400 hover:text-white border-white/[0.08]'
            }`}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Floating Bottom Viewport HUD */}
      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between pointer-events-none gap-2">
        {/* Quick Toggles bar */}
        <div className="flex items-center gap-1.5 p-1 bg-[#14161f]/90 backdrop-blur-xl rounded-xl border border-white/[0.08] pointer-events-auto shadow-2xl text-xs">
          {/* Rotation automatique */}
          <button
            onClick={() => onUpdateSettings({ autoRotate: !settings.autoRotate })}
            title="Activer ou désactiver la rotation automatique"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              settings.autoRotate
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <RotateCw className={`w-3.5 h-3.5 ${settings.autoRotate ? 'animate-spin' : ''}`} />
            <span>Rotation auto</span>
          </button>

          {/* Relief 3D Displace */}
          <button
            onClick={() => onUpdateSettings({ displacement: !settings.displacement })}
            title="Activer/Désactiver le relief 3D géométrique (Displacement Map)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              settings.displacement
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Relief 3D</span>
          </button>

          {/* Fil de fer */}
          <button
            onClick={() => onUpdateSettings({ wireframe: !settings.wireframe })}
            title="Affichage fil de fer"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              settings.wireframe
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Fil de fer</span>
          </button>
        </div>

        {/* Dynamic Light Controller Widget */}
        <div className="p-3 bg-[#14161f]/90 backdrop-blur-xl rounded-xl border border-white/[0.08] pointer-events-auto shadow-2xl flex flex-col gap-2 min-w-[200px]">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-neutral-200">
              <Sun className="w-3.5 h-3.5 text-neutral-400" />
              Source lumineuse
            </span>
            <span className="font-mono text-neutral-400 tabular-nums text-[11px]">
              {Math.round(settings.lightAngle)}° / {Math.round(settings.lightElevation)}°
            </span>
          </div>

          {/* Azimuth / Horizontal Angle Slider */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[10px] text-neutral-500">
              <span>Orientation</span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              value={settings.lightAngle}
              onChange={(e) => onUpdateSettings({ lightAngle: parseFloat(e.target.value) })}
              className="w-full accent-neutral-200 h-1.5 bg-[#252834] rounded-lg cursor-pointer"
            />
          </div>

          {/* Elevation Slider */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[10px] text-neutral-500">
              <span>Élévation</span>
            </div>
            <input
              type="range"
              min="10"
              max="85"
              value={settings.lightElevation}
              onChange={(e) => onUpdateSettings({ lightElevation: parseFloat(e.target.value) })}
              className="w-full accent-neutral-200 h-1.5 bg-[#252834] rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
