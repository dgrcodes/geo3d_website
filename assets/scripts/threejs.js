/* =========================================================================
   COLORS -- read from CSS custom properties on :root, so you can change
   every color from your stylesheet instead of editing this file.
   See the :root block you need to add to style.css at the bottom of this file
   (as a comment) for the full list of variable names and their defaults.
   Note: the cube itself is WebGL (Three.js), so these are read ONCE at page
   load -- changing them in devtools needs a page reload to take effect.
   The nav labels/lines are plain HTML/SVG and use var() directly, so those
   update live even without a reload.
   ========================================================================= */
function getCSSColor(varName, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return value || fallback;
}

/* =========================================================================
   CONFIG -- everything you'll want to tweak lives here.
   ========================================================================= */
const CONFIG = {
    // Set to false once you're done picking layerIndex/face values for CONFIG.nav.
    debug: {
        showFaceLabels: true
    },

    cube: {
        size: 2, // cube edge length
        baseRotationX: 0,
        baseRotationY: 0, // ~45°, classic isometric view
        parallax: {
            strengthX: 0.12, // how much vertical mouse movement tilts the cube
            strengthY: 0.18, // how much horizontal mouse movement turns the cube
            ease: 0.06 // lower = smoother/slower follow
        }
    },

    // Background dot grid: one uniform grid (all dots the same size/spacing),
    // each dot's opacity randomized so some read as fainter than others (see
    // buildDotGridTexture()). Shifts opposite the mouse, same direction/feel
    // as the cube's own parallax tilt, at a fixed distance "behind" it.
    background: {
        dots: {
            size: 1.5, // dot radius, px
            spacing: 48, // grid cell size, px
            opacityMin: 0.12,
            opacityMax: 0.45
        },
        dotParallax: {
            strength: 18, // px of shift at full mouse travel
            ease: 0.05 // lower = smoother/slower follow
        }
    },

    // The cube is sliced into horizontal bands. Each band exposes all 4 side
    // faces: "front" (+X), "back" (-X), "left" (+Z), "right" (-Z).
    // layerIndex 0 = bottom band, layerIndex (count - 1) = top band.
    // Plus two single, unsliced caps: "top" and "bottom".
    layers: {
        count: 6,
        colors: [
            getCSSColor("--cube-band-0", "#3b1552"), // bottom, deep violet
            getCSSColor("--cube-band-1", "#4a1c68"),
            getCSSColor("--cube-band-2", "#5a2380"),
            getCSSColor("--cube-band-3", "#6a2a98"),
            getCSSColor("--cube-band-4", "#7a31b0"),
            getCSSColor("--cube-band-5", "#8a38c8") // top, lighter violet
        ],
        // Per-layer base opacity (0-1), same order/index as colors above.
        // Falls back to interaction.baseOpacity for any index left out.
        opacities: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8]
    },

    topFace: {
        color: getCSSColor("--cube-top-color", "#8a38c8"),
        // Falls back to style.rimColor if this var isn't set.
        rimColor: getCSSColor("--cube-top-rim-color", "") || null
    },
    bottomFace: {
        color: getCSSColor("--cube-bottom-color", "#3b1552"),
        // Falls back to style.rimColor if this var isn't set.
        rimColor: getCSSColor("--cube-bottom-rim-color", "") || null
    },

    // Pick exactly which face each nav line connects to, and where on that
    // face it's anchored.
    // face: "top" | "bottom" | "front" | "back" | "left" | "right"
    //       -> for a band on a side face, append "-<layerIndex>", e.g. "front-5"
    //          (layerIndex 0 = bottom band, count-1 = top band)
    //       -> "top" and "bottom" have no index, there's only one of each
    // at: 0 to 1, horizontal position along that face, looking at it from
    //     outside. 0 = left edge, 1 = right edge, 0.5 = center (default).
    // side: "left" | "right" -> which side of the screen the label sits on
    // topPercent: vertical position of the label, in % of viewport height
    // elbow: { dx, dy } pixel offset from the cube-side point where the line bends.
    //        line goes cube-point -> (cube-point + elbow) -> label-point. 0/0 = straight line.
    nav: [
        {
            face: "front-4",
            at: 0.2,
            text: "découvrir le projet",
            href: "./le-projet.html",
            side: "right",
            topPercent: 20,
            elbow: { dx: 300, dy: -105 }
        },
        {
            face: "left-2",
            at: 0.1,
            text: "explorer le lab",
            href: "./jouer.html",
            side: "left",
            topPercent: 45,
            elbow: { dx: -400, dy: 10 }
        },
        {
            face: "left-1",
            at: 0.6,
            text: "analyser les données",
            href: "./donnees.html",
            side: "right",
            topPercent: 68,
            elbow: { dx: 300, dy: 90 }
        }
    ],

    interaction: {
        hoverColor: getCSSColor("--cube-hover-color", "#8b0000"),
        clickColor: getCSSColor("--cube-click-color", "#2979ff"),
        baseOpacity: 0.8,
        hoverOpacity: 1,
        clickOpacity: 1,
        borderOpacity: 0.1,
        // Random ripple bursts on the face currently under the cursor -- the
        // ring's color cycles between colorA <-> colorB as it expands. Not to
        // be confused with the always-on flowing line pattern (hardcoded
        // constants in FACE_FRAGMENT_SHADER, unrelated to this).
        ripple: {
            colorA: getCSSColor("--cube-ripple-color-a", "#ff2fd0"),
            colorB: getCSSColor("--cube-ripple-color-b", "#2fd0ff"),
            speed: 0.5, // how fast colorA <-> colorB cycles
            minInterval: 0.35, // seconds, shortest gap between two ripple bursts
            maxInterval: 0.6, // seconds, longest gap between two ripple bursts
            // Ring shape: higher sharpness = thinner line. ringCount = how many
            // concentric rings trail behind the leading edge of each burst
            // (1 = a single ring, like before). ringSpacing = gap between them,
            // in world units (scales with CONFIG.cube.size).
            sharpness: 25.0,
            ringCount: 3,
            ringSpacing: 0.16
        }
    },

    // Subtle surface irregularity so faces don't read as perfectly flat/straight.
    // Each face gets its own random noise seed (so the bumps don't repeat identically
    // on every side); amplitude/frequency can be overridden per layer at runtime,
    // see window.cubeNoise below.
    noise: {
        enabled: true,
        amplitude: 0.05, // how far a vertex can push out along its normal, in scene units
        frequency: 10, // how tightly packed the bumps are -- higher = more, smaller bumps
        segments: 8, // geometry subdivisions across a face's width; higher = smoother bump shapes, more triangles
        bandHeightSegments: 8 // subdivisions across a single band's height (bands are short, so this is set separately from `segments`)
    },

    style: {
        wireColor: getCSSColor("--cube-wire-color", "#c9b8f0"), // edges, corner dots, boundary lines
        cornerColor: getCSSColor("--cube-corner-color", "#ffffff"),
        rimColor: getCSSColor("--cube-rim-color", "#d6d9f5"), // silvery fresnel glow on face edges
        lineColor: getCSSColor("--nav-line-color", "#8be9fd"), // nav connector lines/dots (SVG, live via var())
        labelColor: getCSSColor("--nav-label-color", "#e8f6fb"),
        labelHoverColor: getCSSColor("--nav-label-hover-color", "#8b0000")
    },

    // On page load, faces start fully transparent (just the wireframe/wire
    // lines showing), stay that way for `delay` seconds, then fade in to
    // their normal opacity over `duration` seconds. Set enabled: false to
    // skip the intro and show faces at full opacity immediately.
    intro: {
        enabled: true,
        delay: 2, // seconds to hold fully transparent before fading starts
        duration: 0.5 // seconds the fade itself takes, after the delay
    },

    // Layer separation effect when hovering over a layer with navigation
    layerSeparation: {
        enabled: true,
        offset: 0.4, // how far the hovered layer pushes away from the cube center
        ease: 0.08, // animation smoothness (lower = smoother)
        groupEase: 0.08 // smoothness for the grouped layers below/above
    }
};

/* =========================================================================
   BACKGROUND DOT GRID -- a uniform grid of same-size/same-spacing dots with
   each dot's opacity randomized (some fainter than others), parallaxing
   behind the cube. Positioning/animation class (.bg-dots) lives in
   style.css; this builds the actual dot texture and drives its parallax
   offset each frame (see updateBackgroundParallax() near the animation loop).
   ========================================================================= */
// Bakes a CELLS_PER_TILE x CELLS_PER_TILE grid of dots into one canvas, each
// dot with its own randomized opacity, then that whole tile repeats -- so
// the repeated pattern still reads as "random" over a large enough area
// instead of every dot on the page sharing one opacity.
const DOT_CELLS_PER_TILE = 6;
function buildDotGridTexture() {
    const { size, spacing, opacityMin, opacityMax } = CONFIG.background.dots;
    const color = getCSSColor("--bg-dot-color", "#3d2b1f");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const tileSizePx = spacing * DOT_CELLS_PER_TILE;

    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = tileSizePx * dpr;
    tileCanvas.height = tileSizePx * dpr;
    const ctx = tileCanvas.getContext("2d");
    ctx.fillStyle = color;

    for (let row = 0; row < DOT_CELLS_PER_TILE; row++) {
        for (let col = 0; col < DOT_CELLS_PER_TILE; col++) {
            const cx = (col + 0.5) * spacing * dpr;
            const cy = (row + 0.5) * spacing * dpr;
            ctx.globalAlpha = opacityMin + Math.random() * (opacityMax - opacityMin);
            ctx.beginPath();
            ctx.arc(cx, cy, size * dpr, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    return { url: tileCanvas.toDataURL(), size: tileSizePx };
}

const bgDots = document.createElement("div");
bgDots.className = "bg-dots";
const dotTile = buildDotGridTexture();
bgDots.style.backgroundImage = `url(${dotTile.url})`;
bgDots.style.backgroundSize = `${dotTile.size}px ${dotTile.size}px`;
document.body.appendChild(bgDots);

/* =========================================================================
   SCENE SETUP
   ========================================================================= */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(2.5, 2, 3.5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.domElement.style.position = "fixed";
renderer.domElement.style.top = "0";
renderer.domElement.style.left = "0";
document.body.appendChild(renderer.domElement);

/* =========================================================================
   INTRO LOADING BAR -- shown front-and-center over the (still transparent)
   cube while CONFIG.intro.delay elapses, then fades out right as the color
   fade-in starts. Purely cosmetic (not tied to any real asset loading).
   ========================================================================= */
if (CONFIG.intro.enabled && CONFIG.intro.delay > 0) {
    const introWrap = document.createElement("div");
    Object.assign(introWrap.style, {
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "14px",
        zIndex: "9998",
        transition: "opacity 0.5s ease"
    });

    const introLabel = document.createElement("div");
    Object.assign(introLabel.style, {
        fontFamily: "sans-serif",
        fontWeight: "600",
        fontSize: "0.85rem",
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        color: getCSSColor("--cube-wire-color", "#c9b8f0")
    });
    introLabel.textContent = "chargement";
    introWrap.appendChild(introLabel);

    const introBarTrack = document.createElement("div");
    Object.assign(introBarTrack.style, {
        width: "320px",
        height: "4px",
        borderRadius: "2px",
        background: "rgba(128, 128, 128, 0.25)",
        overflow: "hidden"
    });

    const introBarFill = document.createElement("div");
    const introWireColor = getCSSColor("--cube-wire-color", "#c9b8f0");
    Object.assign(introBarFill.style, {
        width: "0%",
        height: "100%",
        background: introWireColor,
        boxShadow: `0 0 12px 1px ${introWireColor}`,
        transition: `width ${CONFIG.intro.delay}s linear`
    });
    introBarTrack.appendChild(introBarFill);
    introWrap.appendChild(introBarTrack);
    document.body.appendChild(introWrap);

    // Two nested rAFs: a CSS transition needs the element painted at its
    // starting width (0%) on one frame before the target width change on a
    // later frame will actually animate instead of jumping instantly.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            introBarFill.style.width = "100%";
        });
    });

    setTimeout(() => {
        introWrap.style.opacity = "0";
        setTimeout(() => introWrap.remove(), 500);
    }, CONFIG.intro.delay * 1000);
}

/* =========================================================================
   CUBE
   ========================================================================= */
const size = CONFIG.cube.size;
const half = size / 2;

// The cube's wireframe edges are NOT one rigid box outline -- they're built
// per band further down (see "CUBE EDGES" below) so each segment can move
// with its own layer during separation, same as the fill faces do. `wireCube`
// stays a plain group: the shared parallax-rotating parent for all of it.
const wireCube = new THREE.Group();
wireCube.rotation.x = CONFIG.cube.baseRotationX;
wireCube.rotation.y = CONFIG.cube.baseRotationY;
scene.add(wireCube);

/* =========================================================================
   FACE MATERIAL -- iridescent "crystal" style: purple base color, silvery
   fresnel rim glow at grazing angles, and animated flowing wave lines
   across the surface. Same look on every face, just a different base color.
   ========================================================================= */
const clock = new THREE.Clock();
const sharedTimeUniform = { value: 0 }; // one object, shared by every face material

const FACE_VERTEX_SHADER = `
  uniform vec2 uUvOffset;
  uniform vec2 uUvScale;
  uniform float uNoiseAmp;
  uniform float uNoiseFreq;
  uniform vec3 uNoiseSeed;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying float vNoiseHeight;
  varying vec3 vWorldPos; // used to render ripples in world space, so they carry across face seams

  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Cheap trilinear value noise -- just enough to break up a perfectly flat face.
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
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
    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);
    return mix(nxy0, nxy1, f.z) * 2.0 - 1.0; // -1..1
  }

  float displacementAt(vec3 worldPos) {
    return noise3(worldPos * uNoiseFreq + uNoiseSeed) * uNoiseAmp;
  }

  void main() {
    // Remaps this band's own 0-1 uv into the whole face's 0-1 uv space, so a
    // ripple's position/radius line up across band seams instead of each
    // band replaying its own copy of the ripple in local coordinates.
    vUv = uv * uUvScale + uUvOffset;

    // Displace along the normal using world-space position (not local position),
    // so bands of the same physical face line up into one continuous bumpy
    // surface instead of each band having its own disconnected bump pattern.
    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vWorldPos = worldPos;
    float rawNoise = noise3(worldPos * uNoiseFreq + uNoiseSeed); // -1..1, same field as displacementAt
    vNoiseHeight = rawNoise;
    vec3 displaced = position + normal * rawNoise * uNoiseAmp;

    // The fresnel/rim shading only reacts to vNormal, not raw vertex position, so
    // without this the bumps move geometry but look completely flat-shaded.
    // Recover a bumped normal via finite differences of the same displacement
    // function along the face's tangent/bitangent, then perturb the flat normal.
    vec3 worldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vec3 tangent = normalize((modelMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
    vec3 bitangent = normalize((modelMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    float eps = 0.03;
    float dHu = (displacementAt(worldPos + tangent * eps) - displacementAt(worldPos - tangent * eps)) / (2.0 * eps);
    float dHv = (displacementAt(worldPos + bitangent * eps) - displacementAt(worldPos - bitangent * eps)) / (2.0 * eps);
    vec3 bumpedWorldNormal = normalize(worldNormal - dHu * tangent - dHv * bitangent);

    vNormal = normalize((viewMatrix * vec4(bumpedWorldNormal, 0.0)).xyz);
    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const MAX_RIPPLES = 3; // must match the array size declared in the shader below
const RIPPLE_LIFETIME = 2.2; // seconds a ripple stays visible before fully fading
// The old ripple math ran in per-face UV space (face width = 1 unit); these
// scale that same visual speed/sharpness into world space (face width =
// CONFIG.cube.size units) so ripples look the same size/speed as before,
// just no longer clipped to a single face's UV rectangle.
// Ring thinness/count/spacing: edit CONFIG.interaction.ripple (sharpness,
// ringCount, ringSpacing) above -- these just read that config in.
const RIPPLE_EXPAND_SPEED = 0.55 * CONFIG.cube.size; // world units/sec
const RIPPLE_SHARPNESS = CONFIG.interaction.ripple.sharpness / CONFIG.cube.size;
const RIPPLE_RING_COUNT = CONFIG.interaction.ripple.ringCount;
const RIPPLE_RING_SPACING = CONFIG.interaction.ripple.ringSpacing * CONFIG.cube.size;

const FACE_FRAGMENT_SHADER = `
  uniform vec3 uBaseColor;
  uniform vec3 uRimColor;
  uniform float uOpacity;
  uniform float uColorAmount; // 0 = grayscale/neutral (intro), 1 = full color (normal)
  uniform float uTime;
  uniform vec3 uRippleColorA;
  uniform vec3 uRippleColorB;
  uniform float uRippleSpeed;
  uniform vec3 uRippleOrigin[${MAX_RIPPLES}];
  uniform float uRippleStart[${MAX_RIPPLES}];
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying float vNoiseHeight;
  varying vec3 vWorldPos;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 n = normalize(vNormal);
    float fresnel = pow(1.0 - abs(dot(n, viewDir)), 2.2);

    // Flowing wavy lines across the face, slowly animated
    float wave = sin(vUv.y * 200.0 + sin(vUv.x * 5.0 + uTime * 0.25) * 2.5 + uTime * 0.4);
    float lines = smoothstep(0.99, 1.0, abs(wave)) * 0.5;

    vec3 color = mix(uBaseColor, uRimColor, fresnel * 0.8);
    color += lines * uRimColor;

    // Height-based shading: valleys read darker/more transparent, peaks read
    // brighter/lighter, regardless of viewing angle -- fresnel alone goes flat
    // when a face is viewed near head-on, so this keeps the bumps visible everywhere.
    float heightShade = vNoiseHeight * 0.5 + 0.5; // -1..1 -> 0..1
    color = mix(color * 0.7, mix(color, uRimColor, 0.5), heightShade);
    float heightAlpha = (heightShade - 0.5) * 0.3;

    // Randomly-timed expanding ripple bursts, computed in WORLD space (not
    // per-face UV) so a ripple travels across face seams instead of stopping
    // dead at the edge of whichever face it started on.
    float rippleSum = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      float start = uRippleStart[i];
      if (start < 0.0) continue;
      float elapsed = uTime - start;
      if (elapsed < 0.0 || elapsed > ${RIPPLE_LIFETIME.toFixed(1)}) continue;

      float dist = length(vWorldPos - uRippleOrigin[i]);
      float radius = elapsed * ${RIPPLE_EXPAND_SPEED.toFixed(3)};
      float fade = exp(-elapsed * 1.1);

      // Concentric trailing rings behind the leading edge (a real ripple has
      // more than one wavefront), each fainter than the last.
      for (int j = 0; j < ${RIPPLE_RING_COUNT}; j++) {
        float ringRadius = radius - float(j) * ${RIPPLE_RING_SPACING.toFixed(3)};
        if (ringRadius < 0.0) continue;
        float ring = exp(-pow((dist - ringRadius) * ${RIPPLE_SHARPNESS.toFixed(3)}, 2.0));
        float ringFalloff = 1.0 - float(j) / float(${RIPPLE_RING_COUNT});
        rippleSum += ring * fade * ringFalloff;
      }
    }
    rippleSum = clamp(rippleSum, 0.0, 1.0);

    float t = sin(uTime * uRippleSpeed * 6.2831) * 0.5 + 0.5;
    vec3 rippleColor = mix(uRippleColorA, uRippleColorB, t);
    color += rippleColor * rippleSum;

    // During the intro, desaturate everything toward its own grayscale
    // luminance (reads as black/white/gray wireframe) instead of showing the
    // real band/rim/wave hues; uColorAmount ramps 0 -> 1 alongside the
    // opacity fade-in to bring the real colors back.
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luminance), color, uColorAmount);

    float alpha = clamp(uOpacity + fresnel * 0.35 + lines * 0.15 + rippleSum * 0.5 + heightAlpha, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`;

function createRippleState() {
    return {
        origins: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3()), // world-space points
        starts: Array.from({ length: MAX_RIPPLES }, () => -1), // -1 = inactive slot
        slotCursor: 0
    };
}


function randomNoiseSeed() {
    return new THREE.Vector3(Math.random() * 1000, Math.random() * 1000, Math.random() * 1000);
}

/* CPU-side mirror of the noise3/hash13 functions in FACE_VERTEX_SHADER above,
   used to bend the (non-shader) boundary wires so they hug the same bumps as
   the faces they sit on top of instead of cutting straight across them. */
function fract(v) {
    return v - Math.floor(v);
}
function hash13(x, y, z) {
    x = fract(x * 0.1031);
    y = fract(y * 0.1031);
    z = fract(z * 0.1031);
    const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33);
    x += d;
    y += d;
    z += d;
    return fract((x + y) * z);
}
function lerp(a, b, t) {
    return a + (b - a) * t;
}
function noise3JS(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    fz = fz * fz * (3 - 2 * fz);
    const n000 = hash13(ix, iy, iz), n100 = hash13(ix + 1, iy, iz);
    const n010 = hash13(ix, iy + 1, iz), n110 = hash13(ix + 1, iy + 1, iz);
    const n001 = hash13(ix, iy, iz + 1), n101 = hash13(ix + 1, iy, iz + 1);
    const n011 = hash13(ix, iy + 1, iz + 1), n111 = hash13(ix + 1, iy + 1, iz + 1);
    const nx00 = lerp(n000, n100, fx), nx10 = lerp(n010, n110, fx);
    const nx01 = lerp(n001, n101, fx), nx11 = lerp(n011, n111, fx);
    const nxy0 = lerp(nx00, nx10, fy), nxy1 = lerp(nx01, nx11, fy);
    return lerp(nxy0, nxy1, fz) * 2 - 1; // -1..1
}
// Displaces a point along `normal` by the same bump amount the face shader
// would apply at that local position, using that face's own noise seed.
function displaceAlongNormal(point, normal, seed) {
    const freq = CONFIG.noise.frequency;
    const amp = CONFIG.noise.enabled ? CONFIG.noise.amplitude : 0;
    const n = noise3JS(point.x * freq + seed.x, point.y * freq + seed.y, point.z * freq + seed.z);
    return point.clone().addScaledVector(normal, n * amp);
}

function createFaceMaterial(color, opacity, rippleState = null, uvOffset = null, uvScale = null, noiseSeed = null, noiseAmp = null, noiseFreq = null, colorAmount = 1, rimColor = null) {
    const rippleStateRef = rippleState || createRippleState();
    const rippleOrigins = rippleStateRef.origins;
    const rippleStarts = rippleStateRef.starts;

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uBaseColor: { value: new THREE.Color(color) },
            uRimColor: { value: new THREE.Color(rimColor || CONFIG.style.rimColor) },
            uOpacity: { value: opacity },
            uColorAmount: { value: colorAmount },
            uTime: sharedTimeUniform,
            uUvOffset: { value: uvOffset || new THREE.Vector2(0, 0) },
            uUvScale: { value: uvScale || new THREE.Vector2(1, 1) },
            uNoiseAmp: { value: CONFIG.noise.enabled ? noiseAmp ?? CONFIG.noise.amplitude : 0 },
            uNoiseFreq: { value: noiseFreq ?? CONFIG.noise.frequency },
            uNoiseSeed: { value: noiseSeed || randomNoiseSeed() },
            uRippleColorA: { value: new THREE.Color(CONFIG.interaction.ripple.colorA) },
            uRippleColorB: { value: new THREE.Color(CONFIG.interaction.ripple.colorB) },
            uRippleSpeed: { value: CONFIG.interaction.ripple.speed },
            uRippleOrigin: { value: rippleOrigins },
            uRippleStart: { value: rippleStarts }
        },
        vertexShader: FACE_VERTEX_SHADER,
        fragmentShader: FACE_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    material.userData.rippleState = rippleStateRef;

    return material;
}

/* =========================================================================
   LAYERS -- horizontal bands (all 4 side faces) + top and bottom caps.
   Every one of these is individually hoverable/clickable. `layers` holds
   them all so the nav-line lookup and the interaction code can find them.
   ========================================================================= */
const layerGroup = new THREE.Group();
const layers = []; // { fill, border, baseColor, anchorLocal, layerIndex, face }

// Layer separation effect tracking
const layerOffsets = {}; // layerIndex -> current offset value for animation
const layerInitialPositions = {}; // layerIndex -> { fill: Vector3, border: Vector3, ... }
const layerMeshes = {}; // layerIndex -> array of all meshes (fill, border, wires) for that layer

function initializeLayerPosition(layer) {
   // Store initial positions of layer meshes for later offset application.
   // Each band calls this once per side face (front/back/left/right), so the
   // per-layerIndex bookkeeping below must happen every time, not just on
   // the first face -- otherwise only that first face ends up in
   // layerMeshes and the other 3 sides never move on hover/separation.
   if (layer.layerIndex === null) return;

   if (!(layer.layerIndex in layerInitialPositions)) {
       layerInitialPositions[layer.layerIndex] = {
           fill: layer.fill.position.clone(),
           border: layer.border ? layer.border.position.clone() : null
       };
       layerOffsets[layer.layerIndex] = 0;
   }

   if (!(layer.layerIndex in layerMeshes)) {
       layerMeshes[layer.layerIndex] = [];
   }
   layerMeshes[layer.layerIndex].push(layer.fill);
   if (layer.border) {
       layerMeshes[layer.layerIndex].push(layer.border);
   }
}

function addFace({ layerIndex, face, color, opacity, rimColor, fillGeo, fillPos, fillRot, borderPoints, anchorLocal, rippleState, uvOffset, uvScale, noiseSeed, noiseAmp, noiseFreq }) {
    const baseOpacity = opacity !== undefined ? opacity : CONFIG.interaction.baseOpacity;
    // Start invisible and grayscale (just the wireframe showing, no color) when
    // the intro fade is on -- updateIntroFade() ramps both uOpacity and
    // uColorAmount up together over CONFIG.intro.duration.
    const initialOpacity = CONFIG.intro.enabled ? 0 : baseOpacity;
    const initialColorAmount = CONFIG.intro.enabled ? 0 : 1;
    const fillMat = createFaceMaterial(color, initialOpacity, rippleState, uvOffset, uvScale, noiseSeed, noiseAmp, noiseFreq, initialColorAmount, rimColor);
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.position.copy(fillPos);
    fill.rotation.copy(fillRot);
    layerGroup.add(fill);

    let border = null;
    if (borderPoints) {
        const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
        const borderMat = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: CONFIG.interaction.borderOpacity
        });
        border = new THREE.Line(borderGeo, borderMat);
        layerGroup.add(border);
    }

    const layerData = { fill, border, baseColor: color, baseOpacity, anchorLocal, layerIndex, face };
    fill.userData.layerRef = layerData;
    layers.push(layerData);
    initializeLayerPosition(layerData);
    return layerData;
}

// Horizontal bands: all 4 side faces (front/back/left/right) per band.
// Each band+face combo (e.g. "right-3") is its own independent hover/click
// unit, matched 1:1 with its own nav label.
const bandCount = CONFIG.layers.count;
const bandHeight = size / bandCount;

// key, axis the face sits on, sign of that axis, and the Y-rotation that
// points the plane's normal outward on that side.
const SIDE_FACES = [
    { key: "front", axis: "x", sign: 1, rotY: Math.PI / 2 },
    { key: "back", axis: "x", sign: -1, rotY: -Math.PI / 2 },
    { key: "left", axis: "z", sign: 1, rotY: 0 },
    { key: "right", axis: "z", sign: -1, rotY: Math.PI }
];

// Ripples are rendered in world space (see FACE_FRAGMENT_SHADER), so ONE
// shared ripple state now covers the whole cube -- a ripple started on one
// face naturally carries across the seam onto its neighbors instead of being
// confined to whichever face it was spawned on.
const globalRippleState = createRippleState();
const faceRippleStates = {
    front: globalRippleState,
    back: globalRippleState,
    left: globalRippleState,
    right: globalRippleState,
    top: globalRippleState,
    bottom: globalRippleState
};

// One noise seed per physical face (shared by every band on that face), so the
// bump pattern is continuous across band seams instead of restarting per band.
// See window.cubeNoise for randomizing these / tweaking amplitude at runtime.
const faceNoiseSeeds = {
    front: randomNoiseSeed(),
    back: randomNoiseSeed(),
    left: randomNoiseSeed(),
    right: randomNoiseSeed(),
    top: randomNoiseSeed(),
    bottom: randomNoiseSeed()
};

const bandWidthSegments = CONFIG.noise.segments;
const bandHeightSegments = CONFIG.noise.bandHeightSegments;

for (let i = 0; i < bandCount; i++) {
    const yCenter = -half + bandHeight * (i + 0.5);
    const color = CONFIG.layers.colors[i % CONFIG.layers.colors.length];
    const opacity = CONFIG.layers.opacities[i % CONFIG.layers.opacities.length];

    SIDE_FACES.forEach((sf) => {
        const pos =
            sf.axis === "x"
                ? new THREE.Vector3(sf.sign * half, yCenter, 0)
                : new THREE.Vector3(0, yCenter, sf.sign * half);

        const layerData = addFace({
            layerIndex: i,
            face: sf.key,
            color,
            opacity,
            fillGeo: new THREE.PlaneGeometry(size, bandHeight, bandWidthSegments, bandHeightSegments),
            fillPos: pos,
            fillRot: new THREE.Euler(0, sf.rotY, 0),
            borderPoints: null, // boundary loops are drawn once below, shared across all 4 faces
            anchorLocal: pos.clone(), // middle of this band's face
            rippleState: faceRippleStates[sf.key],
            // Maps this band's local 0-1 v range onto its slice of the whole face's v range,
            // so a ripple spawned in one band renders correctly (radius, position) in its neighbors too.
            uvOffset: new THREE.Vector2(0, i / bandCount),
            uvScale: new THREE.Vector2(1, 1 / bandCount),
            noiseSeed: faceNoiseSeeds[sf.key]
        });
        // Each band is its own selectable unit (e.g. "right-3" highlights only that
        // single face+band), so its hover/click group is just itself, not a ring or column.
        layerData.group = [layerData];
    });
}

// TOP + BOTTOM caps -- single faces, not sliced into bands
const topData = addFace({
    layerIndex: null,
    face: "top",
    color: CONFIG.topFace.color,
    rimColor: CONFIG.topFace.rimColor,
    fillGeo: new THREE.PlaneGeometry(size, size, CONFIG.noise.segments, CONFIG.noise.segments),
    fillPos: new THREE.Vector3(0, half, 0),
    fillRot: new THREE.Euler(-Math.PI / 2, 0, 0),
    borderPoints: null, // cube's own edges already outline it
    anchorLocal: new THREE.Vector3(half, half, half), // front corner of the top face
    rippleState: faceRippleStates.top,
    noiseSeed: faceNoiseSeeds.top
});
topData.group = [topData];

const bottomData = addFace({
    layerIndex: null,
    face: "bottom",
    color: CONFIG.bottomFace.color,
    rimColor: CONFIG.bottomFace.rimColor,
    fillGeo: new THREE.PlaneGeometry(size, size, CONFIG.noise.segments, CONFIG.noise.segments),
    fillPos: new THREE.Vector3(0, -half, 0),
    fillRot: new THREE.Euler(Math.PI / 2, 0, 0),
    borderPoints: null,
    anchorLocal: new THREE.Vector3(half, -half, half), // front corner of the bottom face
    rippleState: faceRippleStates.bottom,
    noiseSeed: faceNoiseSeeds.bottom
});
bottomData.group = [bottomData];

// Attach the top/bottom caps to the outermost bands so they ride along with
// them during layer separation instead of staying fixed while every band
// pulls away underneath/above them.
if (!(bandCount - 1 in layerMeshes)) {
    layerMeshes[bandCount - 1] = [];
}
layerMeshes[bandCount - 1].push(topData.fill);
if (!(0 in layerMeshes)) {
    layerMeshes[0] = [];
}
layerMeshes[0].push(bottomData.fill);

// Boundary lines: ONE continuous loop per height level, running across both the
// left and front visible faces (and the hidden back ones) so there's no seam
// at the shared front edge -- this is what was missing before.
// Each edge of the loop is subdivided and displaced along that edge's face
// normal using the same noise field the face shader bumps its geometry with,
// so the wire hugs the wavy surface instead of cutting a straight line
// through it.
const WIRE_SEGMENTS_PER_EDGE = 10;
const loopEdgeFaces = [
    { key: "left", normal: new THREE.Vector3(0, 0, 1) },
    { key: "front", normal: new THREE.Vector3(1, 0, 0) },
    { key: "right", normal: new THREE.Vector3(0, 0, -1) },
    { key: "back", normal: new THREE.Vector3(-1, 0, 0) }
];
function buildBoundaryLoopPoints(yLevel) {
    const corners = [
        new THREE.Vector3(-half, yLevel, half),
        new THREE.Vector3(half, yLevel, half),
        new THREE.Vector3(half, yLevel, -half),
        new THREE.Vector3(-half, yLevel, -half),
        new THREE.Vector3(-half, yLevel, half)
    ];
    const points = [];
    for (let e = 0; e < 4; e++) {
        const start = corners[e];
        const end = corners[e + 1];
        const { key, normal } = loopEdgeFaces[e];
        const seed = faceNoiseSeeds[key];
        for (let s = 0; s < WIRE_SEGMENTS_PER_EDGE; s++) {
            const t = s / WIRE_SEGMENTS_PER_EDGE;
            const flat = start.clone().lerp(end, t);
            points.push(displaceAlongNormal(flat, normal, seed));
        }
    }
    points.push(points[0].clone());
    return points;
}

const layerBoundaryLines = {}; // layerIndex -> array of wire meshes for that layer
for (let i = 0; i < bandCount; i++) {
    // Bottom boundary of this layer (between layer i-1 and i)
    if (i > 0) {
        const yLevel = -half + bandHeight * i;
        const loopPoints = buildBoundaryLoopPoints(yLevel);
        // Two coincident copies of the same boundary loop, one owned by each
        // adjacent layer, so the seam can visibly split open on both sides
        // instead of only following whichever layer is processed last.
        const makeLoopLine = () => {
            const loopGeo = new THREE.BufferGeometry().setFromPoints(loopPoints);
            const loopMat = new THREE.LineBasicMaterial({
                color: CONFIG.style.wireColor,
                transparent: true,
                opacity: CONFIG.interaction.borderOpacity
            });
            const loopLine = new THREE.Line(loopGeo, loopMat);
            loopLine.userData.initialYPos = 0; // Wires start at Y=0 in local space
            layerGroup.add(loopLine);
            return loopLine;
        };

        if (!(i in layerBoundaryLines)) {
            layerBoundaryLines[i] = [];
        }
        layerBoundaryLines[i].push(makeLoopLine());

        if (!((i - 1) in layerBoundaryLines)) {
            layerBoundaryLines[i - 1] = [];
        }
        layerBoundaryLines[i - 1].push(makeLoopLine());
    }
}

// Add boundary wires to layerMeshes for separation tracking
Object.keys(layerBoundaryLines).forEach((layerIndex) => {
    const idx = parseInt(layerIndex, 10);
    if (!(idx in layerMeshes)) {
        layerMeshes[idx] = [];
    }
    layerBoundaryLines[idx].forEach((wireMesh) => {
        layerMeshes[idx].push(wireMesh);
    });
});

/* =========================================================================
   CUBE EDGES -- the box's own outline (4 vertical corner struts + top/bottom
   perimeters), built per band instead of as one rigid EdgesGeometry so every
   segment moves with its own layer during separation, same as the fill faces
   and the horizontal boundary wires above.
   ========================================================================= */
function registerLayerMesh(idx, mesh) {
    if (!(idx in layerMeshes)) {
        layerMeshes[idx] = [];
    }
    layerMeshes[idx].push(mesh);
}
function makeStraightLine(points) {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
        color: CONFIG.style.wireColor,
        transparent: true,
        opacity: 0.9
    });
    const line = new THREE.Line(geo, mat);
    line.userData.initialYPos = 0;
    layerGroup.add(line);
    return line;
}

// 4 vertical corner struts, each split into one segment per band.
const cubeCornersXZ = [
    [half, half], [half, -half], [-half, half], [-half, -half]
];
cubeCornersXZ.forEach(([x, z]) => {
    for (let i = 0; i < bandCount; i++) {
        const yBottom = -half + bandHeight * i;
        const yTop = yBottom + bandHeight;
        const segment = makeStraightLine([
            new THREE.Vector3(x, yBottom, z),
            new THREE.Vector3(x, yTop, z)
        ]);
        registerLayerMesh(i, segment);
    }
});

// Top/bottom perimeter loops, attached to the outermost bands so they ride
// along with the top/bottom caps.
const topPerimeter = makeStraightLine([
    new THREE.Vector3(-half, half, half),
    new THREE.Vector3(half, half, half),
    new THREE.Vector3(half, half, -half),
    new THREE.Vector3(-half, half, -half),
    new THREE.Vector3(-half, half, half)
]);
registerLayerMesh(bandCount - 1, topPerimeter);

const bottomPerimeter = makeStraightLine([
    new THREE.Vector3(-half, -half, half),
    new THREE.Vector3(half, -half, half),
    new THREE.Vector3(half, -half, -half),
    new THREE.Vector3(-half, -half, -half),
    new THREE.Vector3(-half, -half, half)
]);
registerLayerMesh(0, bottomPerimeter);

wireCube.add(layerGroup);

/* =========================================================================
   DEBUG FACE LABELS -- shows "left-2", "front-0", "top" etc. right on each
   face so you can read off the values to use in CONFIG.nav. Turn off by
   setting CONFIG.debug.showFaceLabels = false once you're done referencing.
   ========================================================================= */
/* let updateDebugLabels = () => { };
if (CONFIG.debug.showFaceLabels) {
    const debugContainer = document.createElement("div");
    Object.assign(debugContainer.style, {
        position: "fixed",
        inset: "0",
        pointerEvents: "none",
        zIndex: "3"
    });
    document.body.appendChild(debugContainer);

    const debugLabels = layers.map((layerData) => {
        const el = document.createElement("div");
        el.textContent = layerData.layerIndex === null ? layerData.face : `${layerData.face}-${layerData.layerIndex}`;
        Object.assign(el.style, {
            position: "fixed",
            transform: "translate(-50%, -50%)",
            color: "#ffb454",
            background: "rgba(0,0,0,0.55)",
            padding: "1px 5px",
            borderRadius: "3px",
            fontFamily: "monospace",
            fontSize: "11px",
            whiteSpace: "nowrap"
        });
        debugContainer.appendChild(el);
        return { el, anchorLocal: layerData.anchorLocal };
    });

    const _debugWorldPos = new THREE.Vector3();
    updateDebugLabels = () => {
        debugLabels.forEach((d) => {
            _debugWorldPos.copy(d.anchorLocal);
            wireCube.localToWorld(_debugWorldPos);
            _debugWorldPos.project(camera);
            d.el.style.left = ((_debugWorldPos.x * 0.5 + 0.5) * window.innerWidth) + "px";
            d.el.style.top = ((-_debugWorldPos.y * 0.5 + 0.5) * window.innerHeight) + "px";
        });
    };
} */

/* =========================================================================
   NAV LINES -- bent (elbowed) connector from a chosen face to its label
   ========================================================================= */

// "front-5" -> { face: "front", layerIndex: 5 }. "top" -> { face: "top", layerIndex: null }.
function parseFaceKey(key) {
    const dash = key.lastIndexOf("-");
    if (dash === -1) return { face: key, layerIndex: null };
    const layerIndex = parseInt(key.slice(dash + 1), 10);
    if (Number.isNaN(layerIndex)) return { face: key, layerIndex: null };
    return { face: key.slice(0, dash), layerIndex };
}

// Anchor point on a face at horizontal position `at` (0 = left edge, 1 = right
// edge, looking at that face from outside; 0.5 = center). For side-face bands,
// layerIndex picks the vertical band; top/bottom ignore it (only one each).
function computeAnchor(face, layerIndex, at = 0.5) {
    const bandHeight = size / CONFIG.layers.count;
    const yCenter = layerIndex !== null ? -half + bandHeight * (layerIndex + 0.5) : 0;
    const t = -half + at * size; // 0 -> -half, 1 -> +half

    switch (face) {
        case "front": // +X, left edge = +Z, right edge = -Z
            return new THREE.Vector3(half, yCenter, half - at * size);
        case "back": // -X, left edge = -Z, right edge = +Z
            return new THREE.Vector3(-half, yCenter, t);
        case "left": // +Z, left edge = -X, right edge = +X
            return new THREE.Vector3(t, yCenter, half);
        case "right": // -Z, left edge = +X, right edge = -X
            return new THREE.Vector3(half - at * size, yCenter, -half);
        case "top": // anchored along the front edge, sliding left/right along X
            return new THREE.Vector3(t, half, half);
        case "bottom":
            return new THREE.Vector3(t, -half, half);
        default:
            console.warn(`computeAnchor: unknown face "${face}"`);
            return new THREE.Vector3();
    }
}

function findLayer(face, layerIndex) {
    return layers.find((l) => l.face === face && (face === "top" || face === "bottom" || l.layerIndex === layerIndex));
}

/* =========================================================================
   NOISE CONTROLS -- console/devtools API for tweaking the bump texture live
   without reloading. Open devtools and try e.g.:
     cubeNoise.randomize()                     // new bump pattern, same depth
     cubeNoise.randomizeAmplitude(0.01, 0.05)   // new random depth per layer
     cubeNoise.setAmplitude("right", 3, 0.06)   // depth for one band ("top"/"bottom" ignore layerIndex)
     cubeNoise.setFrequency("right", 3, 8)      // bump size for one band
     cubeNoise.setAll({ amplitude: 0.03, frequency: 6 }) // depth/size for every face
   ========================================================================= */
window.cubeNoise = {
    // New random bump pattern. Pass a face key ("front"/"back"/"left"/"right"/"top"/"bottom")
    // to reseed just that physical face, or omit it to reseed all of them.
    randomize(faceKey) {
        const keys = faceKey ? [faceKey] : Object.keys(faceNoiseSeeds);
        keys.forEach((key) => {
            if (!faceNoiseSeeds[key]) return;
            faceNoiseSeeds[key].copy(randomNoiseSeed());
            layers
                .filter((l) => l.face === key)
                .forEach((l) => l.fill.material.uniforms.uNoiseSeed.value.copy(faceNoiseSeeds[key]));
        });
    },
    // Randomizes how deep the bumps are, per layer, within [min, max].
    randomizeAmplitude(min = 0.01, max = 0.05) {
        layers.forEach((l) => {
            l.fill.material.uniforms.uNoiseAmp.value = min + Math.random() * (max - min);
        });
    },
    setAmplitude(face, layerIndex, amplitude) {
        const layerData = findLayer(face, layerIndex);
        if (!layerData) return;
        layerData.fill.material.uniforms.uNoiseAmp.value = amplitude;
    },
    setFrequency(face, layerIndex, frequency) {
        const layerData = findLayer(face, layerIndex);
        if (!layerData) return;
        layerData.fill.material.uniforms.uNoiseFreq.value = frequency;
    },
    setAll({ amplitude, frequency } = {}) {
        layers.forEach((l) => {
            if (typeof amplitude === "number") l.fill.material.uniforms.uNoiseAmp.value = amplitude;
            if (typeof frequency === "number") l.fill.material.uniforms.uNoiseFreq.value = frequency;
        });
    }
};

// Nav opacity starts dim during the intro (so the loading bar reads as the
// focal point) and ramps up to full alongside the cube's color fade-in --
// see updateIntroFade() below.
const NAV_INTRO_MIN_OPACITY = 0.15;
const navContainer = document.createElement("div");
Object.assign(navContainer.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "2",
    opacity: CONFIG.intro.enabled ? NAV_INTRO_MIN_OPACITY : 1
});
document.body.appendChild(navContainer);

const svgNS = "http://www.w3.org/2000/svg";
const navSvg = document.createElementNS(svgNS, "svg");
Object.assign(navSvg.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "1",
    opacity: CONFIG.intro.enabled ? NAV_INTRO_MIN_OPACITY : 1
});
document.body.appendChild(navSvg);

const navLinks = CONFIG.nav.map((item) => {
    const { face, layerIndex } = parseFaceKey(item.face);
    const targetLayer = findLayer(face, layerIndex);
    if (!targetLayer) {
        console.warn(`Nav item "${item.text}": no layer found for face="${item.face}"`);
    }
    const anchor = computeAnchor(face, layerIndex, item.at ?? 0.5);

    // Font/spacing/padding/etc. for these labels live in style.css under
    // .cube-nav-label -- edit them there. Only per-item positioning (which
    // varies per nav entry) is set inline here.
    const label = document.createElement("a");
    label.href = item.href;
    label.textContent = item.text;
    label.className = "cube-nav-label";
    Object.assign(label.style, {
        position: "fixed",
        top: item.topPercent + "%",
        [item.side]: "8%",
        color: "var(--nav-label-color, " + CONFIG.style.labelColor + ")"
    });
    navContainer.appendChild(label);

    label.addEventListener("mouseenter", () => {
        if (!introDone) return; // no hover/click while the intro is still playing
        labelHoverActive = true;
        if (hoveredGroup && hoveredGroup !== targetLayer?.group) hoverOut(hoveredGroup);
        hoveredGroup = targetLayer ? targetLayer.group : null;
        hoverIn(hoveredGroup);
        renderer.domElement.style.cursor = "pointer";
    });
    label.addEventListener("mouseleave", () => {
        labelHoverActive = false;
        hoverOut(hoveredGroup);
        hoveredGroup = null;
        renderer.domElement.style.cursor = "default";
    });
    label.addEventListener("click", (e) => {
        if (!introDone) e.preventDefault(); // block navigation while the intro is still playing
    });

    const polyline = document.createElementNS(svgNS, "polyline");
    polyline.setAttribute("fill", "none");
    polyline.style.stroke = "var(--nav-line-color, " + CONFIG.style.lineColor + ")";
    polyline.setAttribute("stroke-width", "1");
    polyline.setAttribute("stroke-opacity", "0.55");
    navSvg.appendChild(polyline);

    const cubeDot = document.createElementNS(svgNS, "circle");
    cubeDot.setAttribute("r", "3");
    cubeDot.style.fill = "var(--nav-line-color, " + CONFIG.style.lineColor + ")";
    navSvg.appendChild(cubeDot);

    const elbowDot = document.createElementNS(svgNS, "circle");
    elbowDot.setAttribute("r", "2");
    elbowDot.style.fill = "var(--nav-line-color, " + CONFIG.style.lineColor + ")";
    elbowDot.setAttribute("fill-opacity", "0.6");
    navSvg.appendChild(elbowDot);

    const labelDot = document.createElementNS(svgNS, "circle");
    labelDot.setAttribute("r", "2.5");
    labelDot.style.fill = "var(--nav-label-color, " + CONFIG.style.labelColor + ")";
    navSvg.appendChild(labelDot);

    return {
        layer: targetLayer,
        localAnchor: anchor,
        label,
        polyline,
        cubeDot,
        elbowDot,
        labelDot,
        side: item.side,
        elbow: item.elbow || { dx: 0, dy: 0 }
    };
});

const _navWorldPos = new THREE.Vector3();
function updateNavLines() {
    navLinks.forEach((nav) => {
        _navWorldPos.copy(nav.localAnchor);
        wireCube.localToWorld(_navWorldPos);
        _navWorldPos.project(camera);

        const x1 = (_navWorldPos.x * 0.5 + 0.5) * window.innerWidth;
        const y1 = (-_navWorldPos.y * 0.5 + 0.5) * window.innerHeight;

        const xm = x1 + nav.elbow.dx;
        const ym = y1 + nav.elbow.dy;

        const rect = nav.label.getBoundingClientRect();
        const x2 = nav.side === "left" ? rect.right : rect.left;
        const y2 = rect.top + rect.height / 2;

        nav.polyline.setAttribute("points", `${x1},${y1} ${xm},${ym} ${x2},${y2}`);

        nav.cubeDot.setAttribute("cx", x1);
        nav.cubeDot.setAttribute("cy", y1);
        nav.elbowDot.setAttribute("cx", xm);
        nav.elbowDot.setAttribute("cy", ym);
        nav.labelDot.setAttribute("cx", x2);
        nav.labelDot.setAttribute("cy", y2);
    });
}

/* =========================================================================
   INTERACTION -- hover + click state, applied to the whole band (all its
   side faces together) so the whole layer lights up as one, not just the
   face you touched. Hovering the cube AND hovering its nav label both
   trigger the same state, in both directions.
   ========================================================================= */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-10, -10); // start off-screen
let hoveredGroup = null;
let activeGroup = null;
let labelHoverActive = false; // true while the pointer is over a nav label (pauses raycasting)
let hoveredMesh = null; // the exact face mesh under the cursor -- drives the ripple wave
let pendingRipple = false; // queue one ripple burst for the next frame after each pointer move
const hoveredWorldPoint = new THREE.Vector3(); // world-space point under the cursor, for ripple origins

// Layer separation effect tracking (continued from layers section)
let targetHoveredLayerIndex = null; // the layerIndex we're trying to separate
let currentHoveredLayerIndex = null; // smoothly animating toward target

// Cursor ring
const cursorRing = document.createElement("div");
Object.assign(cursorRing.style, {
    position: "fixed",
    width: "40px",
    height: "40px",
    border: "2px solid var(--nav-label-color, #999)",
    borderRadius: "50%",
    pointerEvents: "none",
    zIndex: "9999",
    transform: "translate(-50%, -50%) scale(1)",
    left: "-50px",
    top: "-50px",
    opacity: "0.6",
    transition: "transform 0.2s ease, opacity 0.2s ease"
});
document.body.appendChild(cursorRing);

// Track if cursor is over an interactive element
let cursorRingHovering = false;

function layerHasNavigation(layerIndex) {
   // Check if this layer has a nav item pointing to it
   return CONFIG.nav.some((navItem) => {
       const parsed = parseFaceKey(navItem.face);
       return parsed.layerIndex === layerIndex;
   });
}

// Top/bottom caps (layerIndex === null) are intentionally not hoverable --
// no highlight color, no cursor change, no separation -- but the mouse-move
// ripple effect still works on them since that's driven independently by
// raw raycasting in updateHover()/updateRippleSpawns(), not by this check.
function isInteractiveGroup(group) {
    const layer = group && group[0];
    return !!layer && layer.layerIndex !== null && layerHasNavigation(layer.layerIndex);
}

function setGroupOpacity(group, opacity) {
    group.forEach((l) => (l.fill.material.uniforms.uOpacity.value = opacity));
}
// Resets each layer in the group to its own configured base opacity
// (CONFIG.layers.opacities), rather than a single shared value.
function resetGroupOpacity(group) {
    group.forEach((l) => (l.fill.material.uniforms.uOpacity.value = l.baseOpacity));
}
function setGroupColor(group, color) {
    group.forEach((l) => l.fill.material.uniforms.uBaseColor.value.set(color));
}
function resetGroupColor(group) {
    group.forEach((l) => l.fill.material.uniforms.uBaseColor.value.set(l.baseColor));
}
function labelsForGroup(group) {
    return navLinks.filter((n) => n.layer && n.layer.group === group).map((n) => n.label);
}

function hoverIn(group) {
    if (!group || group === activeGroup) return;
    
    // Get the layerIndex from this group
    const layer = group[0];
    if (!layer || layer.layerIndex === null) {
        // Top/bottom caps: no hover highlight at all (ripples still fire
        // independently -- see isInteractiveGroup above).
        return;
    }

    // Only apply color if this layer has navigation
    const layerIdx = layer.layerIndex;
    if (!layerHasNavigation(layerIdx)) return;
    
    // Apply color change to ALL faces of this layer (all 4 sides)
    layers.forEach((l) => {
        if (l.layerIndex === layerIdx) {
            setGroupColor([l], CONFIG.interaction.hoverColor);
            setGroupOpacity([l], CONFIG.interaction.hoverOpacity);
        }
    });
    
    // Change label color
    labelsForGroup(group).forEach((el) => (el.style.color = "var(--nav-label-hover-color, " + CONFIG.style.labelHoverColor + ")"));
    
    // Trigger layer separation
    if (CONFIG.layerSeparation.enabled) {
        targetHoveredLayerIndex = layerIdx;
    }
    
    // Update cursor ring
    cursorRingHovering = true;
    cursorRing.style.transform = "translate(-50%, -50%) scale(1.3)";
}

function hoverOut(group) {
    if (!group || group === activeGroup) return;
    
    // Get the layerIndex from this group
    const layer = group[0];
    if (!layer || layer.layerIndex === null) {
        // Top/bottom caps: nothing to reset, they were never highlighted.
        return;
    }

    // Only reset if this layer has navigation
    const layerIdx = layer.layerIndex;
    if (!layerHasNavigation(layerIdx)) return;
    
    // Reset color for ALL faces of this layer
    layers.forEach((l) => {
        if (l.layerIndex === layerIdx) {
            resetGroupColor([l]);
            resetGroupOpacity([l]);
        }
    });
    
    labelsForGroup(group).forEach((el) => (el.style.color = "var(--nav-label-color, " + CONFIG.style.labelColor + ")"));
    
    // Stop layer separation
    targetHoveredLayerIndex = null;
    
    // Update cursor ring
    cursorRingHovering = false;
    cursorRing.style.transform = "translate(-50%, -50%) scale(1)";
}

renderer.domElement.addEventListener("pointermove", (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    pendingRipple = !labelHoverActive;
    
    // Always update cursor ring position (even over nav labels)
    cursorRing.style.left = e.clientX + "px";
    cursorRing.style.top = e.clientY + "px";
}, true); // Use capturing phase to ensure we catch every movement

renderer.domElement.addEventListener("pointerdown", () => {
    if (!introDone || !isInteractiveGroup(hoveredGroup)) return;
    activeGroup = hoveredGroup;
    setGroupColor(activeGroup, CONFIG.interaction.clickColor);
    setGroupOpacity(activeGroup, CONFIG.interaction.clickOpacity);
});

window.addEventListener("pointerup", () => {
    if (!activeGroup) return;
    const wasActive = activeGroup;
    activeGroup = null;
    if (wasActive === hoveredGroup) {
        hoverIn(wasActive); // still hovered -> settle back into hover state, not base
    } else {
        resetGroupColor(wasActive);
        resetGroupOpacity(wasActive);
    }
});

function updateHover() {
    // No hover/click interaction while the intro (delay + fade-in) is still
    // playing -- the cube keeps rotating via parallax regardless, this only
    // blocks raycasting/hover-driven state.
    if (!introDone) {
        hoveredMesh = null;
        return;
    }

    if (labelHoverActive) {
        hoveredMesh = null; // no direct mouse-on-face point while a label drives the hover
        return;
    }

    raycaster.setFromCamera(mouse, camera);
    const fillMeshes = layers.map((l) => l.fill);
    const intersects = raycaster.intersectObjects(fillMeshes);
    const hit = intersects.length > 0 ? intersects[0] : null;
    const newHoverGroup = hit ? hit.object.userData.layerRef.group : null;

    if (newHoverGroup !== hoveredGroup) {
        hoverOut(hoveredGroup);
        hoveredGroup = newHoverGroup;
        hoverIn(hoveredGroup);
    }

    hoveredMesh = hit ? hit.object : null;
    if (hit) {
        hoveredWorldPoint.copy(hit.point);
    }

    renderer.domElement.style.cursor = isInteractiveGroup(hoveredGroup) ? "pointer" : "default";
}

// Spawn a single ripple burst for the current pointer position, once per
// mouse movement. Ripples are rendered in world space off a single shared
// rippleState (see globalRippleState), so a burst spawned on one face
// naturally carries across the seam onto its neighbors.
function updateRippleSpawns() {
    if (!pendingRipple || !hoveredMesh) return;

    const now = sharedTimeUniform.value;
    const rippleState = hoveredMesh.material.userData.rippleState;
    const slot = rippleState.slotCursor;

    rippleState.origins[slot].copy(hoveredWorldPoint);
    rippleState.starts[slot] = now;
    rippleState.slotCursor = (slot + 1) % MAX_RIPPLES;

    pendingRipple = false;
}

// Update layer separation animations and apply offsets to layer positions
function updateLayerSeparation() {
   if (!CONFIG.layerSeparation.enabled) return;

   // Smoothly animate toward the target hovered layer
   if (targetHoveredLayerIndex !== currentHoveredLayerIndex) {
       currentHoveredLayerIndex = targetHoveredLayerIndex;
   }

   // Process each layer
   for (let layerIdx = 0; layerIdx < CONFIG.layers.count; layerIdx++) {
       let targetOffset = 0;

       if (currentHoveredLayerIndex !== null) {
           const hoveredIndex = currentHoveredLayerIndex;

           if (layerIdx === hoveredIndex) {
               // The hovered layer STAYS IN PLACE
               targetOffset = 0;
           } else if (layerIdx < hoveredIndex) {
               // ALL layers below move DOWN together (same amount)
               targetOffset = CONFIG.layerSeparation.offset * -0.5;
           } else {
               // ALL layers above move UP together (same amount)
               targetOffset = CONFIG.layerSeparation.offset * 0.5;
           }
       }

       // Initialize offset if needed
       if (!(layerIdx in layerOffsets)) {
           layerOffsets[layerIdx] = 0;
       }

       // Smoothly interpolate current offset toward target
       const currentOffset = layerOffsets[layerIdx];
        
       // Use different ease values for hovered vs grouped layers
       let easeValue = CONFIG.layerSeparation.ease;
       if (currentHoveredLayerIndex !== null && layerIdx !== currentHoveredLayerIndex) {
           easeValue = CONFIG.layerSeparation.groupEase;
       }
        
       layerOffsets[layerIdx] = currentOffset + (targetOffset - currentOffset) * easeValue;
       const newOffset = layerOffsets[layerIdx];

       // Apply offset to ALL meshes of this layer (fill, border, and wires)
       if (layerIdx in layerMeshes) {
           layerMeshes[layerIdx].forEach((mesh) => {
               // Initialize userData if needed
               if (mesh.userData.initialYPos === undefined) {
                   mesh.userData.initialYPos = mesh.position.y;
               }
               // Move the mesh
               mesh.position.y = mesh.userData.initialYPos + newOffset;
           });
       }
   }
}

// Ramps every face's fill opacity AND color (grayscale -> real hue) from 0 up
// to normal over CONFIG.intro.duration seconds, using clock time so it's
// independent of framerate. Skips faces currently under hover/click so it
// doesn't fight with those opacity overrides if the user interacts during
// the intro.
let introDone = !CONFIG.intro.enabled;
function updateIntroFade(elapsed) {
    if (introDone) return;
    const t = Math.min(Math.max(elapsed - CONFIG.intro.delay, 0) / CONFIG.intro.duration, 1);
    const eased = t * t * (3 - 2 * t); // smoothstep
    layers.forEach((l) => {
        if ((hoveredGroup && hoveredGroup.includes(l)) || (activeGroup && activeGroup.includes(l))) return;
        l.fill.material.uniforms.uOpacity.value = l.baseOpacity * eased;
        l.fill.material.uniforms.uColorAmount.value = eased;
    });
    const navOpacity = NAV_INTRO_MIN_OPACITY + (1 - NAV_INTRO_MIN_OPACITY) * eased;
    navContainer.style.opacity = navOpacity;
    navSvg.style.opacity = navOpacity;
    if (t >= 1) introDone = true;
}

// Background dots drift opposite the mouse, same lean as the cube's own
// parallax tilt above, just in screen-space pixels instead of rotation.
let bgDotsX = 0, bgDotsY = 0;
function updateBackgroundParallax() {
    const { strength, ease } = CONFIG.background.dotParallax;

    const targetX = -mouse.x * strength;
    const targetY = mouse.y * strength;

    bgDotsX += (targetX - bgDotsX) * ease;
    bgDotsY += (targetY - bgDotsY) * ease;

    bgDots.style.transform = `translate(${bgDotsX.toFixed(2)}px, ${bgDotsY.toFixed(2)}px)`;
}

/* =========================================================================
   ANIMATION LOOP
   ========================================================================= */
function animate() {
    requestAnimationFrame(animate);
    updateHover();
    updateRippleSpawns();
    updateLayerSeparation();
    sharedTimeUniform.value = clock.getElapsedTime();
    updateIntroFade(sharedTimeUniform.value);

    const targetRotX = CONFIG.cube.baseRotationX - mouse.y * CONFIG.cube.parallax.strengthX;
    const targetRotY = CONFIG.cube.baseRotationY + mouse.x * CONFIG.cube.parallax.strengthY;
    wireCube.rotation.x += (targetRotX - wireCube.rotation.x) * CONFIG.cube.parallax.ease;
    wireCube.rotation.y += (targetRotY - wireCube.rotation.y) * CONFIG.cube.parallax.ease;
    updateBackgroundParallax();

    renderer.render(scene, camera);
    updateNavLines();
    updateDebugLabels();
}
animate();

// Responsive resize
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});