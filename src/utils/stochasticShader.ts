import * as THREE from 'three';

export interface StochasticUniforms {
  uStochasticEnabled: { value: number };
  uStochasticNoiseScale: { value: number };
  uStochasticSharpness: { value: number };
  uStochasticJitter: { value: number };
  uStochasticHeightBlend: { value: number };
  uUvTiling: { value: number };
  uSplitCompare: { value: number };
  uSplitPosition: { value: number };
  uResolution: { value: THREE.Vector2 };
}

export function createStochasticUniforms(): StochasticUniforms {
  return {
    uStochasticEnabled: { value: 1.0 },
    uStochasticNoiseScale: { value: 2.5 },
    uStochasticSharpness: { value: 4.5 },
    uStochasticJitter: { value: 0.85 },
    uStochasticHeightBlend: { value: 1.0 },
    uUvTiling: { value: 2.0 },
    uSplitCompare: { value: 0.0 },
    uSplitPosition: { value: 0.5 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  };
}

// Shared Perlin noise & triangular stochastic grid math (Safe for BOTH Vertex and Fragment shaders)
const STOCHASTIC_SHARED_NOISE_GLSL = /* glsl */ `
uniform float uStochasticEnabled;
uniform float uStochasticNoiseScale;
uniform float uStochasticSharpness;
uniform float uStochasticJitter;
uniform float uStochasticHeightBlend;
uniform float uUvTiling;
uniform float uSplitCompare;
uniform float uSplitPosition;
uniform vec2 uResolution;

// 2D Simplex / Perlin Noise analytical implementation
vec3 mod289_stoch(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289_stoch(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute_stoch(vec3 x) { return mod289_stoch(((x * 34.0) + 1.0) * x); }

float snoise2D_stoch(vec2 v) {
  const vec4 C = vec4(0.211324865405187,  // (3.0 - sqrt(3.0)) / 6.0
                      0.366025403784439,  // 0.5 * (sqrt(3.0) - 1.0)
                     -0.577350269189626,  // -1.0 + 2.0 * C.x
                      0.024390243902439); // 1.0 / 41.0
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289_stoch(i);
  vec3 p = permute_stoch(permute_stoch(i.y + vec3(0.0, i1.y, 1.0))
        + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Multi-octave Perlin fractal Brownian motion for continuous macro natural distribution
float perlinFbm_stoch(vec2 p) {
  float f = snoise2D_stoch(p) * 0.62;
  f += snoise2D_stoch(p * 2.04 + vec2(1.7, 4.3)) * 0.28;
  f += snoise2D_stoch(p * 4.19 + vec2(5.2, 1.3)) * 0.10;
  return f;
}

vec4 hash42_stoch(vec2 p) {
  vec4 p4 = fract(sin(vec4(
    dot(p, vec2(127.1, 311.7)),
    dot(p, vec2(269.5, 183.3)),
    dot(p, vec2(419.2, 371.9)),
    dot(p, vec2(391.1, 623.5))
  )) * 43758.5453123);
  return p4;
}

vec2 rotateUV_stoch(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c) * uv;
}

// Pure geometric & Perlin-weighted calculation (Zero fragment-only builtins)
void computeStochasticCoordsAndWeights(
  in vec2 uvIn,
  out vec2 uv0, out vec2 uv1, out vec2 uv2,
  out vec3 weights,
  out float a0, out float a1, out float a2
) {
  const mat2 gridToSkew = mat2(1.0, 0.0, -0.57735027, 1.15470054);
  vec2 s = gridToSkew * uvIn;
  vec2 baseId = floor(s);
  vec2 f = fract(s);

  vec2 v0, v1, v2;
  vec3 rawW;

  if (f.x + f.y < 1.0) {
    v0 = baseId;
    v1 = baseId + vec2(1.0, 0.0);
    v2 = baseId + vec2(0.0, 1.0);
    rawW = vec3(1.0 - f.x - f.y, f.x, f.y);
  } else {
    v0 = baseId + vec2(1.0, 1.0);
    v1 = baseId + vec2(1.0, 0.0);
    v2 = baseId + vec2(0.0, 1.0);
    rawW = vec3(f.x + f.y - 1.0, 1.0 - f.y, 1.0 - f.x);
  }

  vec4 h0 = hash42_stoch(v0);
  vec4 h1 = hash42_stoch(v1);
  vec4 h2 = hash42_stoch(v2);

  a0 = h0.z * 6.2831853 * uStochasticJitter;
  a1 = h1.z * 6.2831853 * uStochasticJitter;
  a2 = h2.z * 6.2831853 * uStochasticJitter;

  uv0 = rotateUV_stoch(uvIn, a0) + h0.xy;
  uv1 = rotateUV_stoch(uvIn, a1) + h1.xy;
  uv2 = rotateUV_stoch(uvIn, a2) + h2.xy;

  float p0 = perlinFbm_stoch(uvIn * uStochasticNoiseScale + h0.xy * 3.14);
  float p1 = perlinFbm_stoch(uvIn * uStochasticNoiseScale + h1.xy * 3.14);
  float p2 = perlinFbm_stoch(uvIn * uStochasticNoiseScale + h2.xy * 3.14);

  vec3 pw = rawW * (vec3(1.0) + 0.85 * vec3(p0, p1, p2));
  pw = max(pw, 0.0001);

  pw = pow(pw, vec3(max(uStochasticSharpness, 1.0)));
  weights = pw / (pw.x + pw.y + pw.z);
}
`;

// Vertex Shader specifics (Zero references to gl_FragCoord)
const STOCHASTIC_VERTEX_GLSL = /* glsl */ `
${STOCHASTIC_SHARED_NOISE_GLSL}
`;

// Fragment Shader specifics (Includes gl_FragCoord for A/B split-screen compare and PBR texture sampling)
const STOCHASTIC_FRAGMENT_GLSL = /* glsl */ `
${STOCHASTIC_SHARED_NOISE_GLSL}

struct StochasticContext {
  vec2 uv0;
  vec2 uv1;
  vec2 uv2;
  vec3 weights;
  float a0;
  float a1;
  float a2;
  bool isSplitStandard;
};

void computeStochasticContext(
  in vec2 uvIn,
  out StochasticContext ctx
) {
  ctx.isSplitStandard = false;
  if (uSplitCompare > 0.5) {
    float screenX = gl_FragCoord.x / max(uResolution.x, 1.0);
    if (screenX < uSplitPosition) {
      ctx.isSplitStandard = true;
      ctx.uv0 = uvIn;
      ctx.uv1 = uvIn;
      ctx.uv2 = uvIn;
      ctx.weights = vec3(1.0, 0.0, 0.0);
      ctx.a0 = 0.0;
      ctx.a1 = 0.0;
      ctx.a2 = 0.0;
      return;
    }
  }

  computeStochasticCoordsAndWeights(
    uvIn,
    ctx.uv0, ctx.uv1, ctx.uv2,
    ctx.weights,
    ctx.a0, ctx.a1, ctx.a2
  );
}

// Sampling helpers for PBR maps
vec4 sampleStochasticAlbedo(sampler2D tex, vec2 uv0, vec2 uv1, vec2 uv2, vec3 w) {
  return texture2D(tex, uv0) * w.x + texture2D(tex, uv1) * w.y + texture2D(tex, uv2) * w.z;
}

vec3 sampleStochasticNormal(
  sampler2D tex, 
  vec2 uv0, vec2 uv1, vec2 uv2, 
  vec3 w, 
  float a0, float a1, float a2
) {
  vec3 n0 = texture2D(tex, uv0).xyz * 2.0 - 1.0;
  vec3 n1 = texture2D(tex, uv1).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tex, uv2).xyz * 2.0 - 1.0;

  // Un-rotate the tangent space normal vectors to align with surface frame
  n0.xy = rotateUV_stoch(n0.xy, -a0);
  n1.xy = rotateUV_stoch(n1.xy, -a1);
  n2.xy = rotateUV_stoch(n2.xy, -a2);

  return normalize(n0 * w.x + n1 * w.y + n2 * w.z);
}

vec4 sampleStochasticScalar(sampler2D tex, vec2 uv0, vec2 uv1, vec2 uv2, vec3 w) {
  return texture2D(tex, uv0) * w.x + texture2D(tex, uv1) * w.y + texture2D(tex, uv2) * w.z;
}
`;

export function applyStochasticToMaterial(
  material: THREE.MeshStandardMaterial,
  uniforms: StochasticUniforms
): void {
  // Attach uniforms to userData for live updates
  material.userData.stochasticUniforms = uniforms;
  material.customProgramCacheKey = () => 'stochastic_pbr_shader_v3';

  material.onBeforeCompile = (shader) => {
    // 1. Link uniforms
    shader.uniforms.uStochasticEnabled = uniforms.uStochasticEnabled;
    shader.uniforms.uStochasticNoiseScale = uniforms.uStochasticNoiseScale;
    shader.uniforms.uStochasticSharpness = uniforms.uStochasticSharpness;
    shader.uniforms.uStochasticJitter = uniforms.uStochasticJitter;
    shader.uniforms.uStochasticHeightBlend = uniforms.uStochasticHeightBlend;
    shader.uniforms.uUvTiling = uniforms.uUvTiling;
    shader.uniforms.uSplitCompare = uniforms.uSplitCompare;
    shader.uniforms.uSplitPosition = uniforms.uSplitPosition;
    shader.uniforms.uResolution = uniforms.uResolution;

    // 2. Vertex Shader: Safe stochastic displacement calculation (NO gl_FragCoord)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
${STOCHASTIC_VERTEX_GLSL}
`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <displacementmap_vertex>',
      /* glsl */ `
#ifdef USE_DISPLACEMENTMAP
  float dispVal = 0.0;
  if (uStochasticEnabled > 0.5) {
    vec2 dUv0, dUv1, dUv2;
    vec3 dWeights;
    float da0, da1, da2;
    computeStochasticCoordsAndWeights(vDisplacementMapUv, dUv0, dUv1, dUv2, dWeights, da0, da1, da2);
    dispVal = (
      texture2D(displacementMap, dUv0).x * dWeights.x +
      texture2D(displacementMap, dUv1).x * dWeights.y +
      texture2D(displacementMap, dUv2).x * dWeights.z
    );
  } else {
    dispVal = texture2D( displacementMap, vDisplacementMapUv ).x;
  }
	transformed += normalize( objectNormal ) * ( dispVal * displacementScale + displacementBias );
#endif
`
    );

    // 3. Fragment Shader: Stochastic Common functions & Context initialization
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
${STOCHASTIC_FRAGMENT_GLSL}
`
    );

    // Initialize StochasticContext at start of main()
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <logdepthbuf_fragment>',
      /* glsl */ `
#include <logdepthbuf_fragment>

  // Compute stochastic context once per fragment
  StochasticContext stochCtx;
  #ifdef USE_MAP
    computeStochasticContext(vMapUv, stochCtx);
  #elif defined(USE_NORMALMAP)
    computeStochasticContext(vNormalMapUv, stochCtx);
  #elif defined(USE_ROUGHNESSMAP)
    computeStochasticContext(vRoughnessMapUv, stochCtx);
  #elif defined(USE_UV)
    computeStochasticContext(vUv * uUvTiling, stochCtx);
  #else
    computeStochasticContext(vec2(0.0), stochCtx);
  #endif
`
    );

    // Patch Albedo Map (map_fragment)
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 sampledDiffuseColor = texture2D( map, vMapUv );',
      /* glsl */ `
	vec4 sampledDiffuseColor;
	if (uStochasticEnabled > 0.5 && !stochCtx.isSplitStandard) {
		sampledDiffuseColor = sampleStochasticAlbedo(map, stochCtx.uv0, stochCtx.uv1, stochCtx.uv2, stochCtx.weights);
	} else {
		sampledDiffuseColor = texture2D( map, vMapUv );
	}

  // Visual divider line for A/B Split Comparison mode
  if (uSplitCompare > 0.5) {
    float screenRatio = gl_FragCoord.x / max(uResolution.x, 1.0);
    float distToSplit = abs(screenRatio - uSplitPosition);
    if (distToSplit < 0.0016) {
      sampledDiffuseColor = vec4(0.2, 0.75, 1.0, 1.0); // Bright cyan divider line
    }
  }
`
    );

    // Patch Normal Map (normal_fragment_maps)
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
      /* glsl */ `
	vec3 mapN;
	if (uStochasticEnabled > 0.5 && !stochCtx.isSplitStandard) {
		mapN = sampleStochasticNormal(
      normalMap, 
      stochCtx.uv0, stochCtx.uv1, stochCtx.uv2, 
      stochCtx.weights, 
      stochCtx.a0, stochCtx.a1, stochCtx.a2
    );
	} else {
		mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	}
`
    );

    // Patch Roughness Map (roughnessmap_fragment)
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );',
      /* glsl */ `
	vec4 texelRoughness;
	if (uStochasticEnabled > 0.5 && !stochCtx.isSplitStandard) {
		texelRoughness = sampleStochasticScalar(roughnessMap, stochCtx.uv0, stochCtx.uv1, stochCtx.uv2, stochCtx.weights);
	} else {
		texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	}
`
    );

    // Patch Metalness Map (metalnessmap_fragment)
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );',
      /* glsl */ `
	vec4 texelMetalness;
	if (uStochasticEnabled > 0.5 && !stochCtx.isSplitStandard) {
		texelMetalness = sampleStochasticScalar(metalnessMap, stochCtx.uv0, stochCtx.uv1, stochCtx.uv2, stochCtx.weights);
	} else {
		texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	}
`
    );

    // Patch Ambient Occlusion Map (aomap_fragment)
    shader.fragmentShader = shader.fragmentShader.replace(
      'float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;',
      /* glsl */ `
	float aoVal;
	if (uStochasticEnabled > 0.5 && !stochCtx.isSplitStandard) {
		aoVal = sampleStochasticScalar(aoMap, stochCtx.uv0, stochCtx.uv1, stochCtx.uv2, stochCtx.weights).r;
	} else {
		aoVal = texture2D( aoMap, vAoMapUv ).r;
	}
	float ambientOcclusion = ( aoVal - 1.0 ) * aoMapIntensity + 1.0;
`
    );
  };
}
