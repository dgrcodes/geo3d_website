/* =========================================================================
   GEO3D -- EXPLORER LES DONNÉES
   Immersive underground data explorer. The terrain cube IS the interface:
   each dataset lives inside the cube as its own visual phenomenon. Hover to
   reveal it, click to fly in; the cube opens along an animated clipping
   plane and scientific callouts anchor directly onto the anomaly.

   DATA-DRIVEN: everything visual (position, depth, size, color, labels,
   description, metadata) is generated from the DATASETS array below.
   To plug in real GEO3D data later, either edit DATASETS in place or drop
   a `geo3d-donnees.json` file next to this script (same shape as DATASETS)
   -- it is fetched automatically at load and replaces the placeholders
   without touching any animation or interface code.
   ========================================================================= */

function getCSSColor(varName, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return value || fallback;
}

/* =========================================================================
   CONFIG
   ========================================================================= */
const CONFIG = {
    cube: {
        size: 2,
        baseRotationX: 0,
        baseRotationY: 0,
        autoRotateSpeed: 0.0018, // rad/frame in overview mode
        parallax: { strengthX: 0.1, strengthY: 0.16, ease: 0.05 }
    },
    strata: [
        // bottom -> top, same vars as the homepage cube
        getCSSColor("--cube-band-0", "#2d1b12"),
        getCSSColor("--cube-band-1", "#3f2a1c"),
        getCSSColor("--cube-band-2", "#553a26"),
        getCSSColor("--cube-band-3", "#6f5136"),
        getCSSColor("--cube-band-4", "#93724f"),
        getCSSColor("--cube-band-5", "#bda28b")
    ],
    topColor: getCSSColor("--cube-top-color", "#556b2f"),
    style: {
        wireColor: getCSSColor("--cube-wire-color", "#3d2b1f"),
        rimColor: getCSSColor("--cube-rim-color", "#d8cfc2"),
        lineColor: getCSSColor("--nav-line-color", "#3d2b1f"),
        labelColor: getCSSColor("--nav-label-color", "#2a2a2a")
    },
    // Surface treatment ported from the homepage cube (assets/scripts/threejs.js):
    // random expanding ripple bursts on the point under the cursor, the ring's
    // color cycling between colorA <-> colorB as it grows.
    ripple: {
        colorA: getCSSColor("--cube-ripple-color-a", "#2b6d8b"),
        colorB: getCSSColor("--cube-ripple-color-b", "#a0846e"),
        speed: 0.5,      // how fast colorA <-> colorB cycles
        sharpness: 25.0, // higher = thinner ring line
        ringCount: 3,    // concentric trailing rings per burst
        ringSpacing: 0.16 // gap between them, world units (scales with cube size)
    },
    faceOpacity: 0.94,
    noise: { amplitude: 0.045, frequency: 9, segments: 24 },
    background: {
        dots: { size: 1.5, spacing: 48, opacityMin: 0.12, opacityMax: 0.45 },
        dotParallax: { strength: 18, ease: 0.05 }
    },
    focus: {
        flyDuration: 1.7, // seconds, camera fly-in
        cameraDistance: 2.1, // distance from anomaly center when focused
        anomalyScale: 1.35, // how much the selected anomaly expands
        dimOthers: 0.06 // opacity multiplier on non-selected anomalies
    },
    intro: { duration: 1.2 } // global fade-in on load
};

/* =========================================================================
   DATASETS -- placeholder data, replace freely (or via geo3d-donnees.json).
   position: local cube coordinates, each axis -1..1 (cube half = 1 unit).
   radius:   anomaly size in the same units.
   visualization: "cloud" | "flow" | "current" | "field" |
                  "gradient" | "fog" | "strata" | "risk"
   ========================================================================= */
const DATASETS = [
    {
        id: "01",
        title: "Métaux lourds",
        description: "Cette visualisation montre comment des concentrations de contaminants pourraient apparaître dans le sous-sol. Les valeurs affichées sont des exemples et seront remplacées par les mesures réelles du projet.",
        depth: "2.8–6.3 m",
        intensity: "Élevée",
        confidence: "89 %",
        visualization: "cloud",
        color: "#e26a3d",
        colorB: "#a92c1e",
        affectedVolume: "340 m²",
        notes: "Données de démonstration",
        position: [0.42, 0.28, 0.1],
        radius: 0.34
    },
    {
        id: "02",
        title: "Eau souterraine",
        description: "Volume translucide représentant une nappe et son écoulement. Le mouvement des particules indiquera plus tard la direction et la vitesse d'écoulement mesurées.",
        depth: "5.1–9.4 m",
        intensity: "Moyenne",
        confidence: "76 %",
        visualization: "flow",
        color: "#3d7ea6",
        colorB: "#7fc3d8",
        affectedVolume: "610 m²",
        notes: "Données de démonstration",
        position: [-0.35, -0.15, 0.3],
        radius: 0.42
    },
    {
        id: "03",
        title: "Conductivité électrique",
        description: "Chemins conducteurs illuminés traversant le terrain. L'animation des courants suivra les profils de résistivité obtenus sur le site.",
        depth: "1.2–4.0 m",
        intensity: "Variable",
        confidence: "82 %",
        visualization: "current",
        color: "#d9b13b",
        colorB: "#f2e29a",
        affectedVolume: "215 m²",
        notes: "Données de démonstration",
        position: [0.1, 0.05, -0.45],
        radius: 0.38
    },
    {
        id: "04",
        title: "Réponse magnétique",
        description: "Lignes de champ rendant visibles des forces invisibles. Le dipôle affiché sera positionné et orienté selon les relevés magnétométriques.",
        depth: "3.5–7.2 m",
        intensity: "Forte",
        confidence: "91 %",
        visualization: "field",
        color: "#8a5fb0",
        colorB: "#c9a7e8",
        affectedVolume: "180 m²",
        notes: "Données de démonstration",
        position: [-0.45, 0.4, -0.25],
        radius: 0.3
    },
    {
        id: "05",
        title: "Concentration minérale",
        description: "Coquilles concentriques colorées par intensité, du cœur vers la périphérie. Le gradient reflétera les teneurs estimées par interpolation.",
        depth: "6.0–11.8 m",
        intensity: "Élevée",
        confidence: "68 %",
        visualization: "gradient",
        color: "#3f9e6e",
        colorB: "#bfe6c8",
        affectedVolume: "420 m²",
        notes: "Données de démonstration",
        position: [0.4, -0.42, -0.3],
        radius: 0.33
    },
    {
        id: "06",
        title: "Densité",
        description: "Brouillard voxelisé en niveaux de gris : chaque point encode une densité locale. La grille sera densifiée avec les données d'inversion.",
        depth: "0.0–12.0 m",
        intensity: "Faible",
        confidence: "73 %",
        visualization: "fog",
        color: "#9c948a",
        colorB: "#d8d2c8",
        affectedVolume: "980 m²",
        notes: "Données de démonstration",
        position: [-0.1, 0.45, 0.42],
        radius: 0.32
    },
    {
        id: "07",
        title: "Composition du sol",
        description: "Micro-stratigraphie locale : transitions de matériaux et interfaces géologiques. Les couches suivront la lithologie décrite dans les forages.",
        depth: "0.4–8.6 m",
        intensity: "—",
        confidence: "94 %",
        visualization: "strata",
        color: "#a8763e",
        colorB: "#5c3d21",
        affectedVolume: "760 m²",
        notes: "Données de démonstration",
        position: [0.05, -0.35, 0.45],
        radius: 0.36
    },
    {
        id: "08",
        title: "Risque environnemental",
        description: "Zones d'alerte pulsantes et contours de probabilité. Les seuils et périmètres seront dérivés du modèle de risque du projet.",
        depth: "1.5–5.0 m",
        intensity: "Critique",
        confidence: "64 %",
        visualization: "risk",
        color: "#c8402e",
        colorB: "#f0a83c",
        affectedVolume: "130 m²",
        notes: "Données de démonstration",
        position: [-0.4, -0.45, -0.4],
        radius: 0.3
    }
];

/* =========================================================================
   BACKGROUND DOT GRID -- same treatment as the homepage
   ========================================================================= */
const DOT_CELLS_PER_TILE = 6;
function buildDotGridTexture() {
    const { size, spacing, opacityMin, opacityMax } = CONFIG.background.dots;
    const color = getCSSColor("--bg-dot-color", "#3d2b1f");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const tileSizePx = spacing * DOT_CELLS_PER_TILE;
    const c = document.createElement("canvas");
    c.width = tileSizePx * dpr;
    c.height = tileSizePx * dpr;
    const ctx = c.getContext("2d");
    ctx.fillStyle = color;
    for (let row = 0; row < DOT_CELLS_PER_TILE; row++) {
        for (let col = 0; col < DOT_CELLS_PER_TILE; col++) {
            ctx.globalAlpha = opacityMin + Math.random() * (opacityMax - opacityMin);
            ctx.beginPath();
            ctx.arc((col + 0.5) * spacing * dpr, (row + 0.5) * spacing * dpr, size * dpr, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    return { url: c.toDataURL(), size: tileSizePx };
}
const bgDots = document.createElement("div");
bgDots.className = "bg-dots";
const dotTile = buildDotGridTexture();
bgDots.style.backgroundImage = `url(${dotTile.url})`;
bgDots.style.backgroundSize = `${dotTile.size}px ${dotTile.size}px`;
document.body.appendChild(bgDots);

/* =========================================================================
   SCENE
   ========================================================================= */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
const OVERVIEW_CAM = new THREE.Vector3(2.6, 2.0, 3.6);
camera.position.copy(OVERVIEW_CAM);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
Object.assign(renderer.domElement.style, { position: "fixed", top: "0", left: "0" });
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const sharedTime = { value: 0 };

const cubeRoot = new THREE.Group();
cubeRoot.rotation.x = CONFIG.cube.baseRotationX;
cubeRoot.rotation.y = CONFIG.cube.baseRotationY;
scene.add(cubeRoot);

const half = CONFIG.cube.size / 2;

/* =========================================================================
   TERRAIN CUBE -- one shader for the whole box: strata colors picked from
   local height, vertex noise displacement, fresnel rim, and a manual
   clipping plane (discard) that lets the cube "open" toward the camera.
   ========================================================================= */
const clipUniforms = {
    uClipNormal: { value: new THREE.Vector3(0, 0, 1) },
    uClipConst: { value: 10.0 }, // > cube diagonal = no clipping
    uClipSoft: { value: 0.02 }
};

/* Hover-ripple state, ported from the homepage cube. Origins are stored in the
   cube's LOCAL space (not world) so a burst stays pinned to the surface while
   the cube keeps auto-rotating, instead of sliding across it. */
const MAX_RIPPLES = 3;
const RIPPLE_LIFETIME = 2.2; // seconds a burst stays visible
const RIPPLE_EXPAND_SPEED = 0.55 * CONFIG.cube.size; // world units/sec
const RIPPLE_SHARPNESS = CONFIG.ripple.sharpness / CONFIG.cube.size;
const RIPPLE_RING_COUNT = CONFIG.ripple.ringCount;
const RIPPLE_RING_SPACING = CONFIG.ripple.ringSpacing * CONFIG.cube.size;
const rippleState = {
    origins: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3()),
    starts: Array.from({ length: MAX_RIPPLES }, () => -1), // -1 = inactive slot
    cursor: 0
};

const CUBE_VERTEX = `
  uniform float uNoiseAmp;
  uniform float uNoiseFreq;
  varying vec3 vLocalPos;
  varying vec3 vLocalNormal;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying float vNoiseHeight;

  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i);
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);
    return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z) * 2.0 - 1.0;
  }

  void main() {
    vLocalPos = position;
    vLocalNormal = normal;
    vUv = uv;
    float n = noise3(position * uNoiseFreq);
    vNoiseHeight = n;
    vec3 displaced = position + normal * n * uNoiseAmp;
    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const CUBE_FRAGMENT = `
  uniform vec3 uBands[6];
  uniform vec3 uTopColor;
  uniform vec3 uRimColor;
  uniform float uOpacity;
  uniform float uHalf;
  uniform vec3 uClipNormal;
  uniform float uClipConst;
  uniform float uTime;
  uniform vec3 uRippleColorA;
  uniform vec3 uRippleColorB;
  uniform float uRippleSpeed;
  uniform vec3 uRippleOrigin[${MAX_RIPPLES}];
  uniform float uRippleStart[${MAX_RIPPLES}];
  varying vec3 vLocalPos;
  varying vec3 vLocalNormal;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying float vNoiseHeight;

  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    // Animated clipping plane: everything on the positive side is discarded,
    // which is what visually "opens" the cube during a focus fly-in.
    if (dot(vLocalPos, uClipNormal) > uClipConst) discard;

    float t = clamp((vLocalPos.y + uHalf) / (2.0 * uHalf), 0.0, 1.0);
    float f = t * 6.0;
    vec3 color = uBands[0];
    for (int i = 1; i < 6; i++) {
      color = mix(color, uBands[i], smoothstep(float(i) - 0.18, float(i) + 0.18, f + 0.5));
    }
    // Top cap reads as moss/surface
    color = mix(color, uTopColor, smoothstep(0.85, 0.98, vLocalNormal.y));

    // Grain so the cut faces don't read flat
    float grain = hash13(floor(vLocalPos * 90.0));
    color *= 0.92 + grain * 0.14;

    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.4);
    color = mix(color, uRimColor, fresnel * 0.35);

    // Flowing wavy lines drifting across the surface (homepage cube look).
    float wave = sin(vUv.y * 200.0 + sin(vUv.x * 5.0 + uTime * 0.25) * 2.5 + uTime * 0.4);
    float lines = smoothstep(0.99, 1.0, abs(wave)) * 0.5;
    color += lines * uRimColor;

    // Height-based shading so the vertex bumps stay legible even head-on,
    // where fresnel alone goes flat.
    float heightShade = vNoiseHeight * 0.5 + 0.5; // -1..1 -> 0..1
    color = mix(color * 0.82, color, heightShade);

    // Randomly-timed expanding ripple bursts under the cursor, in LOCAL space
    // so they stay stuck to the surface while the cube rotates.
    float rippleSum = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      float start = uRippleStart[i];
      if (start < 0.0) continue;
      float elapsed = uTime - start;
      if (elapsed < 0.0 || elapsed > ${RIPPLE_LIFETIME.toFixed(1)}) continue;

      float dist = length(vLocalPos - uRippleOrigin[i]);
      float radius = elapsed * ${RIPPLE_EXPAND_SPEED.toFixed(3)};
      float fade = exp(-elapsed * 1.1);

      for (int j = 0; j < ${RIPPLE_RING_COUNT}; j++) {
        float ringRadius = radius - float(j) * ${RIPPLE_RING_SPACING.toFixed(3)};
        if (ringRadius < 0.0) continue;
        float ring = exp(-pow((dist - ringRadius) * ${RIPPLE_SHARPNESS.toFixed(3)}, 2.0));
        float ringFalloff = 1.0 - float(j) / float(${RIPPLE_RING_COUNT});
        rippleSum += ring * fade * ringFalloff;
      }
    }
    rippleSum = clamp(rippleSum, 0.0, 1.0);
    float rt = sin(uTime * uRippleSpeed * 6.2831) * 0.5 + 0.5;
    vec3 rippleColor = mix(uRippleColorA, uRippleColorB, rt);
    color += rippleColor * rippleSum;

    // Backfaces = the cut interior once the clip opens: darker, like fresh earth
    if (!gl_FrontFacing) color *= 0.4;

    gl_FragColor = vec4(color, uOpacity + fresnel * 0.06 + lines * 0.12 + rippleSum * 0.5);
  }
`;

const cubeMaterial = new THREE.ShaderMaterial({
    uniforms: {
        uBands: { value: CONFIG.strata.map((c) => new THREE.Color(c)) },
        uTopColor: { value: new THREE.Color(CONFIG.topColor) },
        uRimColor: { value: new THREE.Color(CONFIG.style.rimColor) },
        uOpacity: { value: CONFIG.faceOpacity },
        uHalf: { value: half },
        uNoiseAmp: { value: CONFIG.noise.amplitude },
        uNoiseFreq: { value: CONFIG.noise.frequency },
        uClipNormal: clipUniforms.uClipNormal,
        uClipConst: clipUniforms.uClipConst,
        uTime: sharedTime, // {value} object, incremented in animate()
        uRippleColorA: { value: new THREE.Color(CONFIG.ripple.colorA) },
        uRippleColorB: { value: new THREE.Color(CONFIG.ripple.colorB) },
        uRippleSpeed: { value: CONFIG.ripple.speed },
        uRippleOrigin: { value: rippleState.origins },
        uRippleStart: { value: rippleState.starts }
    },
    vertexShader: CUBE_VERTEX,
    fragmentShader: CUBE_FRAGMENT,
    transparent: true,
    side: THREE.DoubleSide
});

const seg = CONFIG.noise.segments;
const cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.cube.size, CONFIG.cube.size, CONFIG.cube.size, seg, seg, seg), cubeMaterial);
cubeRoot.add(cubeMesh);

// Wire outline (fades away while the cube is open)
const edgesMat = new THREE.LineBasicMaterial({ color: CONFIG.style.wireColor, transparent: true, opacity: 0.85 });
const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(CONFIG.cube.size, CONFIG.cube.size, CONFIG.cube.size)), edgesMat);
cubeRoot.add(edges);

/* =========================================================================
   SHARED HELPERS for anomaly builders
   ========================================================================= */
function glowTexture(hex) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, hex + "ff");
    g.addColorStop(0.35, hex + "66");
    g.addColorStop(1, hex + "00");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    return tex;
}
function hexWithAlpha(hex) {
    // ensures "#rrggbb" form for canvas gradients above
    const col = new THREE.Color(hex);
    return "#" + col.getHexString();
}
function randInSphere(r) {
    let v;
    do {
        v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    } while (v.lengthSq() > 1);
    return v.multiplyScalar(r);
}
function pointsMaterial(color, size, opacity, additive = true) {
    return new THREE.PointsMaterial({
        color,
        size,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        sizeAttenuation: true
    });
}
function circlePoints(r, n = 64, axis = "y") {
    const pts = [];
    for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        if (axis === "y") pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
        else if (axis === "x") pts.push(new THREE.Vector3(0, Math.cos(a) * r, Math.sin(a) * r));
        else pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    return pts;
}
function lineMat(color, opacity) {
    return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
}

/* =========================================================================
   ANOMALY BUILDERS -- one per visualization type. Each returns:
   { group, mats: [{ mat, base }], update(t) }
   Everything is parameterized by the dataset (color, radius), so swapping
   the data restyles the phenomenon automatically.
   ========================================================================= */
const BUILDERS = {

    // Glowing volumetric cloud + rotating contour rings (heavy metals)
    cloud(d) {
        const group = new THREE.Group();
        const mats = [];
        const r = d.radius;

        const count = 420;
        const pos = new Float32Array(count * 3);
        const colA = new THREE.Color(d.color);
        const colB = new THREE.Color(d.colorB || d.color);
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const p = randInSphere(r * 0.9).multiplyScalar(Math.pow(Math.random(), 0.6));
            pos.set([p.x, p.y, p.z], i * 3);
            const c = colA.clone().lerp(colB, p.length() / r); // gradient center -> edge
            colors.set([c.r, c.g, c.b], i * 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        const mat = pointsMaterial("#ffffff", 0.035, 0.85);
        mat.vertexColors = true;
        mats.push({ mat, base: 0.85 });
        group.add(new THREE.Points(geo, mat));

        const rings = [];
        [0.55, 0.75, 0.95].forEach((k, i) => {
            const m = lineMat(d.color, 0.5);
            mats.push({ mat: m, base: 0.5 });
            const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePoints(r * k)), m);
            ring.rotation.x = i * 0.5;
            group.add(ring);
            rings.push(ring);
        });

        return {
            group, mats,
            update(t) {
                group.rotation.y = t * 0.12;
                rings.forEach((ring, i) => {
                    ring.rotation.z = t * (0.15 + i * 0.07);
                    ring.rotation.x = i * 0.5 + Math.sin(t * 0.3 + i) * 0.15;
                });
            }
        };
    },

    // Blue translucent lens + particles drifting through it (groundwater)
    flow(d) {
        const group = new THREE.Group();
        const mats = [];
        const r = d.radius;

        const lensMat = new THREE.MeshBasicMaterial({
            color: d.color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide
        });
        mats.push({ mat: lensMat, base: 0.18 });
        const lens = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), lensMat);
        lens.scale.set(1.25, 0.45, 1.0); // flattened water body
        group.add(lens);

        const tableMat = lineMat(d.colorB || d.color, 0.6);
        mats.push({ mat: tableMat, base: 0.6 });
        const table = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePoints(r * 1.25)), tableMat);
        table.position.y = r * 0.32; // water table line
        group.add(table);

        const count = 260;
        const pos = new Float32Array(count * 3);
        const seeds = [];
        for (let i = 0; i < count; i++) {
            const p = randInSphere(1);
            seeds.push(p);
            pos.set([p.x * r * 1.25, p.y * r * 0.45, p.z * r], i * 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const pMat = pointsMaterial(d.colorB || d.color, 0.03, 0.8);
        mats.push({ mat: pMat, base: 0.8 });
        group.add(new THREE.Points(geo, pMat));

        return {
            group, mats,
            update(t) {
                const arr = geo.attributes.position.array;
                for (let i = 0; i < count; i++) {
                    const s = seeds[i];
                    // drift along +x, wrap inside the lens, slight vertical wave
                    let x = ((s.x + t * 0.12 + 1) % 2) - 1;
                    arr[i * 3] = x * r * 1.25;
                    arr[i * 3 + 1] = (s.y + Math.sin(t * 0.8 + s.z * 6.0) * 0.05) * r * 0.45;
                    arr[i * 3 + 2] = s.z * r;
                }
                geo.attributes.position.needsUpdate = true;
                table.position.y = r * 0.32 + Math.sin(t * 0.6) * r * 0.02; // breathing water table
            }
        };
    },

    // Glowing conductive paths with animated currents (electrical conductivity)
    current(d) {
        const group = new THREE.Group();
        const mats = [];
        const r = d.radius;
        const paths = [];

        for (let p = 0; p < 6; p++) {
            const pts = [];
            const y = (p / 5 - 0.5) * r * 1.4;
            for (let i = 0; i <= 24; i++) {
                const x = (i / 24 - 0.5) * r * 2.2;
                pts.push(new THREE.Vector3(
                    x,
                    y + Math.sin(x * 7 + p * 2.1) * r * 0.16,
                    Math.cos(x * 5 + p * 1.3) * r * 0.35
                ));
            }
            const curve = new THREE.CatmullRomCurve3(pts);
            const m = lineMat(d.color, 0.45);
            mats.push({ mat: m, base: 0.45 });
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(60)), m));
            paths.push(curve);
        }

        // pulses travelling along the paths
        const pulsesPerPath = 3;
        const total = paths.length * pulsesPerPath;
        const pos = new Float32Array(total * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const pMat = pointsMaterial(d.colorB || d.color, 0.06, 0.95);
        mats.push({ mat: pMat, base: 0.95 });
        group.add(new THREE.Points(geo, pMat));

        const _v = new THREE.Vector3();
        return {
            group, mats,
            update(t) {
                const arr = geo.attributes.position.array;
                let k = 0;
                paths.forEach((curve, p) => {
                    for (let j = 0; j < pulsesPerPath; j++) {
                        const u = (t * (0.25 + p * 0.04) + j / pulsesPerPath + p * 0.13) % 1;
                        curve.getPoint(u, _v);
                        arr[k++] = _v.x; arr[k++] = _v.y; arr[k++] = _v.z;
                    }
                });
                geo.attributes.position.needsUpdate = true;
            }
        };
    },

    // Dipole field lines + particles riding them (magnetic response)
    field(d) {
        const group = new THREE.Group();
        const mats = [];
        const r = d.radius;
        const curves = [];

        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < 5; i++) {
                const spread = 0.25 + i * 0.2;
                const pts = [
                    new THREE.Vector3(0, -r * 0.8, 0),
                    new THREE.Vector3(side * r * spread, -r * 0.3, side * r * spread * 0.4),
                    new THREE.Vector3(side * r * spread * 1.25, r * 0.1, 0),
                    new THREE.Vector3(side * r * spread, r * 0.5, -side * r * spread * 0.4),
                    new THREE.Vector3(0, r * 0.8, 0)
                ];
                const curve = new THREE.CatmullRomCurve3(pts);
                const m = lineMat(d.color, 0.5);
                mats.push({ mat: m, base: 0.5 });
                group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(50)), m));
                curves.push(curve);
            }
        }

        const perCurve = 2;
        const total = curves.length * perCurve;
        const pos = new Float32Array(total * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const pMat = pointsMaterial(d.colorB || d.color, 0.05, 0.9);
        mats.push({ mat: pMat, base: 0.9 });
        group.add(new THREE.Points(geo, pMat));

        const _v = new THREE.Vector3();
        return {
            group, mats,
            update(t) {
                group.rotation.y = t * 0.1;
                const arr = geo.attributes.position.array;
                let k = 0;
                curves.forEach((curve, i) => {
                    for (let j = 0; j < perCurve; j++) {
                        const u = (t * 0.14 + i * 0.07 + j * 0.5) % 1;
                        curve.getPoint(u, _v);
                        arr[k++] = _v.x; arr[k++] = _v.y; arr[k++] = _v.z;
                    }
                });
                geo.attributes.position.needsUpdate = true;
            }
        };
    },

    // Concentric shells colored by intensity (mineral concentration)
    gradient(d) {
        const group = new THREE.Group();
        const mats = [];
        const r = d.radius;
        const shells = [0.3, 0.55, 0.8, 1.0];
        const colA = new THREE.Color(d.color);
        const colB = new THREE.Color(d.colorB || d.color);

        shells.forEach((k, s) => {
            const count = 90 + s * 70;
            const pos = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                const p = randInSphere(1).normalize().multiplyScalar(r * k * (0.96 + Math.random() * 0.08));
                pos.set([p.x, p.y, p.z], i * 3);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
            const c = colA.clone().lerp(colB, s / (shells.length - 1));
            const m = pointsMaterial("#" + c.getHexString(), 0.03, 0.85 - s * 0.14);
            mats.push({ mat: m, base: 0.85 - s * 0.14 });
            const pts = new THREE.Points(geo, m);
            pts.userData.speed = 0.05 + s * 0.03;
            group.add(pts);
        });

        return {
            group, mats,
            update(t) {
                group.children.forEach((shell, i) => {
                    shell.rotation.y = t * shell.userData.speed * (i % 2 === 0 ? 1 : -1);
                });
            }
        };
    },

    // Grayscale voxel fog (density)
    fog(d) {
        const group = new THREE.Group();
        const mats = [];
        const r = d.radius;
        const n = 8; // voxels per axis
        const positions = [];
        for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
            const p = new THREE.Vector3((x / (n - 1) - 0.5) * 2, (y / (n - 1) - 0.5) * 2, (z / (n - 1) - 0.5) * 2);
            if (p.length() > 1) continue;
            positions.push(p.multiplyScalar(r));
        }
        const pos = new Float32Array(positions.length * 3);
        positions.forEach((p, i) => pos.set([p.x, p.y, p.z], i * 3));
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const m = pointsMaterial(d.color, 0.045, 0.55, false);
        mats.push({ mat: m, base: 0.55 });
        group.add(new THREE.Points(geo, m));

        return {
            group, mats,
            update(t) {
                m.opacity = Math.max(0.0, m.userData._dim ?? 1) * (0.45 + Math.sin(t * 0.7) * 0.1);
                group.rotation.y = t * 0.05;
            }
        };
    },

    // Local micro-stratigraphy: tilted colored plates (soil composition)
    strata(d) {
        const group = new THREE.Group();
        const mats = [];
        const r = d.radius;
        const colA = new THREE.Color(d.color);
        const colB = new THREE.Color(d.colorB || d.color);
        const layers = 5;
        for (let i = 0; i < layers; i++) {
            const c = colA.clone().lerp(colB, i / (layers - 1));
            const m = new THREE.MeshBasicMaterial({
                color: c, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide
            });
            mats.push({ mat: m, base: 0.55 });
            const plate = new THREE.Mesh(new THREE.CircleGeometry(r * (1.05 - i * 0.08), 32), m);
            plate.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.18;
            plate.rotation.z = (Math.random() - 0.5) * 0.2;
            plate.position.y = (i / (layers - 1) - 0.5) * r * 1.3;
            group.add(plate);

            const em = lineMat(CONFIG.style.wireColor, 0.4);
            mats.push({ mat: em, base: 0.4 });
            // circle built in the XY plane ("z" axis) so it can share the plate's rotation
            const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePoints(r * (1.05 - i * 0.08), 64, "z")), em);
            edge.rotation.copy(plate.rotation);
            edge.position.copy(plate.position);
            group.add(edge);
        }
        return {
            group, mats,
            update(t) { group.rotation.y = t * 0.06; }
        };
    },

    // Pulsing warning rings + probability contours (environmental risk)
    risk(d) {
        const group = new THREE.Group();
        const mats = [];
        const r = d.radius;
        const rings = [];
        for (let i = 0; i < 3; i++) {
            const m = lineMat(i === 0 ? d.color : (d.colorB || d.color), 0.8);
            mats.push({ mat: m, base: 0.8 });
            const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePoints(1)), m);
            ring.userData.phase = i / 3;
            group.add(ring);
            rings.push(ring);
        }
        const coreMat = new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.25, depthWrite: false });
        mats.push({ mat: coreMat, base: 0.25 });
        const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.35, 20, 14), coreMat);
        group.add(core);

        return {
            group, mats,
            update(t) {
                rings.forEach((ring) => {
                    const u = (t * 0.35 + ring.userData.phase) % 1;
                    const s = 0.2 + u * 1.0;
                    ring.scale.setScalar(s * r);
                    const dim = ring.material.userData._dim ?? 1;
                    ring.material.opacity = dim * 0.8 * (1 - u);
                });
                core.scale.setScalar(1 + Math.sin(t * 3.0) * 0.08); // pulse
            }
        };
    }
};

/* =========================================================================
   ANOMALY REGISTRY -- generated 100% from DATASETS
   ========================================================================= */
const anomalies = []; // { data, root, viz, proxy, glow, glowMat, hoverAmount }

function buildAnomalies(datasets) {
    datasets.forEach((d) => {
        const builder = BUILDERS[d.visualization] || BUILDERS.cloud;
        const viz = builder(d);

        const root = new THREE.Group();
        root.position.set(d.position[0] * half, d.position[1] * half, d.position[2] * half);
        root.add(viz.group);

        // Ghost glow: what you see (and hover) through the terrain in overview
        const glowMat = new THREE.SpriteMaterial({
            map: glowTexture(hexWithAlpha(d.color)),
            transparent: true,
            opacity: 0.22,
            depthTest: false,
            blending: THREE.AdditiveBlending
        });
        const glow = new THREE.Sprite(glowMat);
        glow.scale.setScalar(d.radius * 2.4);
        root.add(glow);

        // Invisible raycast proxy
        const proxy = new THREE.Mesh(
            new THREE.SphereGeometry(d.radius * 1.15, 12, 10),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        proxy.userData.anomaly = null; // filled below
        root.add(proxy);

        cubeRoot.add(root);

        const entry = { data: d, root, viz, proxy, glow, glowMat, hoverAmount: 0, dim: 1 };
        proxy.userData.anomaly = entry;
        anomalies.push(entry);
    });
}

/* =========================================================================
   DOM -- header caption, hover tag, callouts, retour, SVG leader lines
   ========================================================================= */
const svgNS = "http://www.w3.org/2000/svg";
const calloutSvg = document.createElementNS(svgNS, "svg");
Object.assign(calloutSvg.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "3" });
document.body.appendChild(calloutSvg);

const ui = document.createElement("div");
ui.className = "donnees-ui";
document.body.appendChild(ui);

const caption = document.createElement("div");
caption.className = "donnees-caption";
ui.appendChild(caption);

const hoverTag = document.createElement("div");
hoverTag.className = "donnees-hover-tag";
hoverTag.style.opacity = "0";
ui.appendChild(hoverTag);

const backLink = document.createElement("button");
backLink.className = "donnees-back";
backLink.textContent = "← retour au terrain";
backLink.style.opacity = "0";
backLink.style.pointerEvents = "none";
ui.appendChild(backLink);

function setCaption(count) {
    caption.innerHTML = `<span class="donnees-caption-num">${String(count).padStart(2, "0")}</span> anomalies détectées · survoler le cube ou utiliser la liste →`;
}

/* =========================================================================
   ANOMALY LIST -- a side panel of buttons so the datasets can be read without
   hunting for their glow in the cube. Each row expands to its full description
   + metrics, and carries an "explorer" link that flies the camera in (same as
   clicking the anomaly directly). Built 100% from the entries, in list order.
   ========================================================================= */
const listPanel = document.createElement("aside");
listPanel.className = "donnees-list";
listPanel.innerHTML = `<div class="donnees-list-head">anomalies</div>
    <div class="donnees-list-items"></div>`;
ui.appendChild(listPanel);
const listItemsWrap = listPanel.querySelector(".donnees-list-items");

function setListVisible(visible) {
    listPanel.classList.toggle("is-hidden", !visible);
}
setListVisible(false); // shown once the intro fade finishes (see updateIntro)

function buildAnomalyList(entries) {
    listItemsWrap.innerHTML = "";
    entries.forEach((entry) => {
        const d = entry.data;
        const item = document.createElement("div");
        item.className = "donnees-list-item";
        item.innerHTML = `
            <button class="donnees-list-btn" type="button">
                <span class="donnees-list-dot" style="background:${d.color}"></span>
                <span class="donnees-list-num">${d.id}</span>
                <span class="donnees-list-title">${d.title}</span>
                <span class="donnees-list-caret">+</span>
            </button>
            <div class="donnees-list-detail">
                <div class="donnees-list-detail-inner">
                    <p class="donnees-list-desc">${d.description}</p>
                    <dl class="donnees-list-meta">
                        <div><dt>profondeur</dt><dd>${d.depth}</dd></div>
                        <div><dt>intensité</dt><dd>${d.intensity}</dd></div>
                        <div><dt>confiance</dt><dd>${d.confidence}</dd></div>
                        <div><dt>volume affecté</dt><dd>${d.affectedVolume}</dd></div>
                    </dl>
                    <button class="donnees-list-explore" type="button">explorer dans le cube →</button>
                </div>
            </div>`;

        const btn = item.querySelector(".donnees-list-btn");
        const explore = item.querySelector(".donnees-list-explore");

        // Expand/collapse this row (accordion: only one open at a time).
        btn.addEventListener("click", () => {
            const alreadyOpen = item.classList.contains("is-open");
            listItemsWrap.querySelectorAll(".donnees-list-item.is-open")
                .forEach((el) => el.classList.remove("is-open"));
            if (!alreadyOpen) item.classList.add("is-open");
        });

        // Hovering the row lights up the matching anomaly's glow in the cube.
        btn.addEventListener("mouseenter", () => { entry.buttonHover = true; });
        btn.addEventListener("mouseleave", () => { entry.buttonHover = false; });

        explore.addEventListener("click", () => {
            entry.buttonHover = false;
            if (state === "overview") startFocus(entry);
        });

        listItemsWrap.appendChild(item);
    });
}

/* Callouts for the focused dataset: a main card + metric tags, each with an
   elbowed leader line anchored to a point on the anomaly itself. */
let activeCallouts = null; // { items: [{ el, line, dot, anchorLocal, elbow, align }] }

function clearCallouts() {
    if (!activeCallouts) return;
    activeCallouts.items.forEach((it) => {
        it.el.remove();
        it.line.remove();
        it.dot.remove();
    });
    activeCallouts = null;
}

function buildCallouts(entry) {
    clearCallouts();
    const d = entry.data;
    const r = d.radius;
    const items = [];

    function makeItem({ html, className, anchorLocal, screen, elbow, align }) {
        const el = document.createElement("div");
        el.className = "donnees-callout " + (className || "");
        el.innerHTML = html;
        Object.assign(el.style, screen);
        ui.appendChild(el);

        const line = document.createElementNS(svgNS, "polyline");
        line.setAttribute("fill", "none");
        line.style.stroke = "var(--nav-line-color, " + CONFIG.style.lineColor + ")";
        line.setAttribute("stroke-width", "1");
        line.setAttribute("stroke-opacity", "0.55");
        calloutSvg.appendChild(line);

        const dot = document.createElementNS(svgNS, "circle");
        dot.setAttribute("r", "3");
        dot.style.fill = "var(--nav-line-color, " + CONFIG.style.lineColor + ")";
        calloutSvg.appendChild(dot);

        items.push({ el, line, dot, anchorLocal, elbow, align });
    }

    makeItem({
        className: "donnees-callout-main",
        html: `
          <div class="donnees-callout-eyebrow">dataset ${d.id} · ${d.notes}</div>
          <h2>${d.title}</h2>
          <p>${d.description}</p>`,
        anchorLocal: new THREE.Vector3(0, r * 1.05, 0),
        screen: { right: "6%", top: "16%", maxWidth: "300px" },
        elbow: { dx: 90, dy: -70 },
        align: "left"
    });

    makeItem({
        html: `<span>profondeur</span>${d.depth}`,
        anchorLocal: new THREE.Vector3(-r * 1.05, r * 0.2, 0),
        screen: { left: "7%", top: "38%" },
        elbow: { dx: -90, dy: -30 },
        align: "right"
    });

    makeItem({
        html: `<span>intensité</span>${d.intensity} · <span>confiance</span>${d.confidence}`,
        anchorLocal: new THREE.Vector3(-r * 0.7, -r * 0.95, 0),
        screen: { left: "10%", top: "64%" },
        elbow: { dx: -70, dy: 50 },
        align: "right"
    });

    makeItem({
        html: `<span>volume affecté</span>${d.affectedVolume}`,
        anchorLocal: new THREE.Vector3(r * 1.0, -r * 0.6, 0),
        screen: { right: "9%", top: "62%" },
        elbow: { dx: 80, dy: 60 },
        align: "left"
    });

    activeCallouts = { entry, items };

    // fade in
    items.forEach((it, i) => {
        it.el.style.opacity = "0";
        it.el.style.transform = "translateY(6px)";
        setTimeout(() => {
            it.el.style.opacity = "1";
            it.el.style.transform = "translateY(0)";
        }, 350 + i * 130);
    });
}

const _calloutWorld = new THREE.Vector3();
function updateCallouts() {
    if (!activeCallouts) return;
    const entry = activeCallouts.entry;
    activeCallouts.items.forEach((it) => {
        _calloutWorld.copy(it.anchorLocal); // root scale is applied by localToWorld
        entry.root.localToWorld(_calloutWorld);
        _calloutWorld.project(camera);
        const x1 = (_calloutWorld.x * 0.5 + 0.5) * window.innerWidth;
        const y1 = (-_calloutWorld.y * 0.5 + 0.5) * window.innerHeight;
        const xm = x1 + it.elbow.dx;
        const ym = y1 + it.elbow.dy;
        const rect = it.el.getBoundingClientRect();
        const x2 = it.align === "left" ? rect.left : rect.right;
        const y2 = rect.top + rect.height / 2;
        it.line.setAttribute("points", `${x1},${y1} ${xm},${ym} ${x2},${y2}`);
        it.dot.setAttribute("cx", x1);
        it.dot.setAttribute("cy", y1);
    });
}

/* =========================================================================
   INTERACTION + STATE MACHINE
   overview  : auto-rotate + parallax, hover glows, click -> focus
   focusing  : camera tween + clip opening
   focus     : callouts visible, retour available
   returning : reverse tween back to overview
   ========================================================================= */
let state = "overview";
let focused = null;
let hoveredEntry = null;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-10, -10);
const mousePx = { x: -100, y: -100 };
let pendingRipple = false; // queue one ripple burst for the next frame after a move

const tween = {
    t: 0,
    camFrom: new THREE.Vector3(), camTo: new THREE.Vector3(),
    lookFrom: new THREE.Vector3(), lookTo: new THREE.Vector3(),
    clipFrom: 10, clipTo: 10,
    scaleFrom: 1, scaleTo: 1
};
const lookCurrent = new THREE.Vector3(0, 0, 0);

function smoothstep(t) { return t * t * (3 - 2 * t); }

function startFocus(entry) {
    focused = entry;
    state = "focusing";
    hoverTag.style.opacity = "0";

    // Anomaly world position with the cube's current (now frozen) rotation
    const anomalyWorld = new THREE.Vector3();
    entry.root.getWorldPosition(anomalyWorld);

    // Camera flies to a point past the anomaly, along center->anomaly
    const dir = anomalyWorld.clone().sub(cubeRoot.position);
    if (dir.lengthSq() < 0.0001) dir.set(0.5, 0.3, 1);
    dir.normalize();
    const camTo = anomalyWorld.clone().add(dir.multiplyScalar(CONFIG.focus.cameraDistance)).add(new THREE.Vector3(0, 0.25, 0));

    // Clip plane: opens the cube from the camera side down to the anomaly
    const camLocal = cubeRoot.worldToLocal(camTo.clone()).normalize();
    clipUniforms.uClipNormal.value.copy(camLocal);
    const anomalyLocal = entry.root.position;
    const clipTarget = anomalyLocal.dot(camLocal) - entry.data.radius * 0.15;

    tween.t = 0;
    tween.camFrom.copy(camera.position);
    tween.camTo.copy(camTo);
    tween.lookFrom.copy(lookCurrent);
    tween.lookTo.copy(anomalyWorld);
    tween.clipFrom = clipUniforms.uClipConst.value;
    tween.clipTo = clipTarget;
    tween.scaleFrom = entry.root.scale.x;
    tween.scaleTo = CONFIG.focus.anomalyScale;

    setTimeout(() => buildCallouts(entry), CONFIG.focus.flyDuration * 700);
    backLink.style.opacity = "1";
    backLink.style.pointerEvents = "auto";
    caption.style.opacity = "0";
    setListVisible(false);
    renderer.domElement.style.cursor = "default";
}

function startReturn() {
    if (!focused) return;
    state = "returning";
    clearCallouts();
    backLink.style.opacity = "0";
    backLink.style.pointerEvents = "none";

    tween.t = 0;
    tween.camFrom.copy(camera.position);
    tween.camTo.copy(OVERVIEW_CAM);
    tween.lookFrom.copy(lookCurrent);
    tween.lookTo.set(0, 0, 0);
    tween.clipFrom = clipUniforms.uClipConst.value;
    tween.clipTo = 10;
    tween.scaleFrom = focused.root.scale.x;
    tween.scaleTo = 1;
}

backLink.addEventListener("click", startReturn);
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (state === "focus" || state === "focusing")) startReturn();
});

// Free rotation: drag anywhere to turn the terrain; a clean click (no drag)
// on an anomaly opens it. Parallax stays layered on top of the user rotation.
let rotY = CONFIG.cube.baseRotationY;
let rotXUser = CONFIG.cube.baseRotationX;
const drag = { active: false, moved: false, lastX: 0, lastY: 0 };

renderer.domElement.addEventListener("pointermove", (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    mousePx.x = e.clientX;
    mousePx.y = e.clientY;
    pendingRipple = true;

    if (drag.active && state === "overview") {
        const dx = e.clientX - drag.lastX;
        const dy = e.clientY - drag.lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        rotY += dx * 0.005;
        rotXUser = Math.min(0.55, Math.max(-0.55, rotXUser + dy * 0.003));
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
    }
});

renderer.domElement.addEventListener("pointerdown", (e) => {
    drag.active = true;
    drag.moved = false;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
});

window.addEventListener("pointerup", () => {
    if (drag.active && !drag.moved && state === "overview" && hoveredEntry) {
        startFocus(hoveredEntry);
    }
    drag.active = false;
});

// Spawn one ripple burst at the point on the cube under the cursor, once per
// pointer move. Origin is converted into the cube's local space so the burst
// stays pinned to the surface as the cube rotates (see CUBE_FRAGMENT).
const _rippleLocal = new THREE.Vector3();
function updateCubeRipples() {
    if (!pendingRipple) return;
    pendingRipple = false;
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObject(cubeMesh)[0];
    if (!hit) return;
    _rippleLocal.copy(hit.point);
    cubeMesh.worldToLocal(_rippleLocal);
    const slot = rippleState.cursor;
    rippleState.origins[slot].copy(_rippleLocal);
    rippleState.starts[slot] = sharedTime.value;
    rippleState.cursor = (slot + 1) % MAX_RIPPLES;
}

function updateHover() {
    if (state !== "overview") { hoveredEntry = null; return; }
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(anomalies.map((a) => a.proxy));
    const entry = hits.length ? hits[0].object.userData.anomaly : null;
    if (entry !== hoveredEntry) {
        hoveredEntry = entry;
        if (entry) {
            hoverTag.innerHTML = `<span>${entry.data.id}</span> ${entry.data.title}`;
            hoverTag.style.opacity = "1";
        } else {
            hoverTag.style.opacity = "0";
        }
    }
    if (hoveredEntry) {
        hoverTag.style.left = mousePx.x + 18 + "px";
        hoverTag.style.top = mousePx.y - 10 + "px";
    }
    renderer.domElement.style.cursor = hoveredEntry ? "pointer" : "default";
}

/* =========================================================================
   PER-FRAME UPDATES
   ========================================================================= */
function applyDim(entry) {
    entry.viz.mats.forEach(({ mat, base }) => {
        mat.userData._dim = entry.dim;
        mat.opacity = base * entry.dim;
    });
}

function updateAnomalies(t) {
    anomalies.forEach((entry) => {
        // hover glow ramps up/down smoothly -- driven by the cursor over the
        // cube OR by hovering that anomaly's button in the side list.
        const targetHover = (state === "overview" && (entry === hoveredEntry || entry.buttonHover)) ? 1 : 0;
        entry.hoverAmount += (targetHover - entry.hoverAmount) * 0.12;

        // in focus, everything except the selection dims out
        const targetDim = (focused && entry !== focused && state !== "overview" ) ? CONFIG.focus.dimOthers
            : (state === "overview" ? 0.55 + entry.hoverAmount * 0.45 : 1);
        entry.dim += (targetDim - entry.dim) * 0.08;
        applyDim(entry);

        const pulse = 1 + Math.sin(t * 1.6 + entry.root.position.x * 5) * 0.06;
        entry.glowMat.opacity = (0.16 + entry.hoverAmount * 0.4) * pulse * (focused && entry !== focused ? 0.15 : 1);
        entry.glow.scale.setScalar(entry.data.radius * (2.4 + entry.hoverAmount * 0.8) * pulse);

        entry.viz.update(t);
    });
}

function updateTween(dt) {
    if (state !== "focusing" && state !== "returning") return;
    tween.t = Math.min(tween.t + dt / CONFIG.focus.flyDuration, 1);
    const e = smoothstep(tween.t);

    camera.position.lerpVectors(tween.camFrom, tween.camTo, e);
    lookCurrent.lerpVectors(tween.lookFrom, tween.lookTo, e);
    clipUniforms.uClipConst.value = tween.clipFrom + (tween.clipTo - tween.clipFrom) * e;
    if (focused) focused.root.scale.setScalar(tween.scaleFrom + (tween.scaleTo - tween.scaleFrom) * e);

    // wire outline fades while the cube is open
    edgesMat.opacity = 0.85 * (state === "focusing" ? 1 - e * 0.8 : 0.2 + e * 0.8);

    if (tween.t >= 1) {
        if (state === "focusing") {
            state = "focus";
        } else {
            state = "overview";
            focused = null;
            caption.style.opacity = "1";
            setListVisible(true);
        }
    }
}

let bgDotsX = 0, bgDotsY = 0;
function updateBackgroundParallax() {
    const { strength, ease } = CONFIG.background.dotParallax;
    bgDotsX += (-mouse.x * strength - bgDotsX) * ease;
    bgDotsY += (mouse.y * strength - bgDotsY) * ease;
    bgDots.style.transform = `translate(${bgDotsX.toFixed(2)}px, ${bgDotsY.toFixed(2)}px)`;
}

/* =========================================================================
   INTRO FADE
   ========================================================================= */
let introElapsed = 0;
function updateIntro(dt) {
    if (introElapsed >= CONFIG.intro.duration) return;
    introElapsed += dt;
    const e = smoothstep(Math.min(introElapsed / CONFIG.intro.duration, 1));
    renderer.domElement.style.opacity = e;
    ui.style.opacity = e;
    calloutSvg.style.opacity = e;
    if (introElapsed >= CONFIG.intro.duration) setListVisible(true);
}
renderer.domElement.style.opacity = 0;
ui.style.opacity = 0;

/* =========================================================================
   ANIMATION LOOP
   ========================================================================= */
function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    sharedTime.value += dt;
    const t = sharedTime.value;

    updateIntro(dt);
    updateHover();
    updateCubeRipples();
    updateTween(dt);
    updateAnomalies(t);
    updateBackgroundParallax();

    if (state === "overview") {
        if (!drag.active) rotY += CONFIG.cube.autoRotateSpeed;
        const targetRotY = rotY + mouse.x * CONFIG.cube.parallax.strengthY * 0.4;
        const targetRotX = rotXUser - mouse.y * CONFIG.cube.parallax.strengthX;
        cubeRoot.rotation.y += (targetRotY - cubeRoot.rotation.y) * (drag.active ? 0.35 : CONFIG.cube.parallax.ease);
        cubeRoot.rotation.x += (targetRotX - cubeRoot.rotation.x) * (drag.active ? 0.35 : CONFIG.cube.parallax.ease);
        camera.position.lerp(OVERVIEW_CAM, 0.04);
        lookCurrent.lerp(new THREE.Vector3(0, 0, 0), 0.04);
    } else if (state === "focus") {
        // tiny parallax drift around the anomaly, so the shot stays alive
        const drift = new THREE.Vector3(mouse.x * 0.08, mouse.y * 0.06, 0);
        camera.position.lerp(tween.camTo.clone().add(drift), 0.05);
    }
    camera.lookAt(lookCurrent);

    renderer.render(scene, camera);
    updateCallouts();
}

/* =========================================================================
   BOOT -- fetch real data if present, otherwise placeholders
   ========================================================================= */
function boot(datasets) {
    buildAnomalies(datasets);
    buildAnomalyList(anomalies);
    setCaption(datasets.length);
    animate();
}

fetch("./geo3d-donnees.json")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((json) => boot(Array.isArray(json) ? json : json.datasets || DATASETS))
    .catch(() => boot(DATASETS));

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});