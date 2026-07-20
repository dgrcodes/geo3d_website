/* =========================================================================
   TERRAIN 3D -- reuses the homepage cube's own face material system
   (see FACE_VERTEX_SHADER / FACE_FRAGMENT_SHADER / noise3 / hash13 in
   threejs.js) instead of a separate hand-rolled heightmap: the exact same
   value-noise building block the cube uses for its small decorative
   surface bumps is reused here at mountain scale (much bigger amplitude,
   much lower frequency, summed over a few octaves with a ridge fold) to
   displace a flat plane into a terrain, entirely on the GPU in the vertex
   shader -- no JS-side heightmap array/blur pass at all. A CPU-side mirror
   of the same noise (same pattern as noise3JS/hash13JS in threejs.js) is
   kept only for placing waypoint markers and the camera's clearance check.

   Same fresnel rim glow, strata-band coloring (by height instead of a
   fixed per-face color), seam lines, and ripple bursts as the cube's
   fragment shader. Three layers (front/mid/back) at different world Z and
   noise seeds for a parallax mountain range; only the front layer carries
   waypoints/ripples. Renderer is transparent (no scene.background) so the
   page's own bg-dots parallax grid shows through, same as the cube.

   Camera travels in a straight line (fixed height, X only) while the
   .terrain-scene section is pinned by GSAP ScrollTrigger -- no
   FirstPersonControls (an ES-module addon not available on the classic
   r128 UMD build this site uses).
   ========================================================================= */
(function () {
    const scene3dEl = document.querySelector(".terrain-3d");
    const sceneSection = document.querySelector(".terrain-scene");
    if (!scene3dEl || !sceneSection) return;
    if (typeof THREE === "undefined" || typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;
    gsap.registerPlugin(ScrollTrigger);

    function getCSSColor(varName, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return value || fallback;
    }

    // ---------------------------------------------------------------------
    // CPU-side mirror of the noise3/hash13 functions in FACE_VERTEX_SHADER
    // (threejs.js) -- same pattern as that file's own noise3JS/hash13JS,
    // just carried a step further into a ridge-folded fractal sum so it
    // reads as terrain instead of a single decorative bump. Only used here
    // to place waypoints and check camera clearance against the same
    // surface the GPU is displacing.
    // ---------------------------------------------------------------------
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
    // Ridge-folded fractal sum of the same noise3 building block -- reads
    // as mountain ridgelines instead of one smooth bump. Octave count /
    // lacunarity kept low enough that the finest octave still spans several
    // vertices at TERRAIN_FREQ below, so it doesn't alias into per-vertex
    // noise the way a naive high-octave version would.
    const TERRAIN_OCTAVES = 3;
    const TERRAIN_LACUNARITY = 1.8;
    // Flattening curve applied on top of the raw ridge-fbm sum: anything
    // below FLATTEN_LOW reads as dead flat ground, anything above
    // FLATTEN_HIGH saturates to full height, with a rise in between --
    // "mostly flat, with certain areas higher" instead of the raw fbm's
    // constant wave-like undulation everywhere. Shared with the GLSL
    // version below (kept in sync manually, same as the rest of this file's
    // CPU/GPU noise mirror).
    const FLATTEN_LOW = 0.45;
    const FLATTEN_HIGH = 0.88;
    function smoothstepJS(edge0, edge1, x) {
        const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }
    function terrainHeightJS(x, y, z, freq, seed) {
        let total = 0;
        let amp = 0.55;
        let f = freq;
        let norm = 0;
        for (let o = 0; o < TERRAIN_OCTAVES; o++) {
            const n = noise3JS(x * f + seed.x, y * f + seed.y, z * f + seed.z);
            const ridge = 1 - Math.abs(n);
            total += ridge * ridge * amp;
            norm += amp;
            amp *= 0.5;
            f *= TERRAIN_LACUNARITY;
        }
        const raw = total / norm; // 0..1
        const flat = smoothstepJS(FLATTEN_LOW, FLATTEN_HIGH, raw);
        return Math.min(1, flat + raw * 0.05);
    }

    // ---------------------------------------------------------------------
    // Config
    // ---------------------------------------------------------------------
    const WORLD_W = 200; // vertex grid columns (along travel axis, X)
    const WORLD_D = 80; // vertex grid rows (depth, Z)
    const PLANE_WIDTH = 5200;
    const PLANE_DEPTH = 2200;
    const TERRAIN_FREQ = 0.0011; // world-space noise frequency -- mountain scale, vs. the cube's fine decorative-bump frequency
    const TOP_CAP = 0.56; // top slice of normalized elevation painted green -- much bigger than the cube's own cap, per "more green"
    const WAYPOINT_DEPTH_Z = -300; // world Z in front of the camera track where waypoints sit
    const MAX_RIPPLES = 4; // one slot per waypoint

    const pageBg = 0xd3dada; // matches html,body background-color in style.css
    const fogColor = new THREE.Color(pageBg);
    const bandColors = [0, 1, 2, 3, 4, 5].map((i) => new THREE.Color(getCSSColor(`--cube-band-${i}`, "#4a3728")));
    const topColor = new THREE.Color(getCSSColor("--cube-top-color", "#556b2f"));
    const rimColor = new THREE.Color(getCSSColor("--cube-rim-color", "#d6d9f5"));
    const seamColor = new THREE.Color(getCSSColor("--cube-wire-color", "#3d2b1f"));
    const rippleColorA = new THREE.Color(getCSSColor("--cube-ripple-color-a", "#2b6d8b"));
    const rippleColorB = new THREE.Color(getCSSColor("--cube-ripple-color-b", "#a0846e"));

    // ---------------------------------------------------------------------
    // Shared shader source -- one material per layer (front/mid/back), only
    // the uniform *values* differ (seed, amplitude, haze, fog range, rim/
    // seam strength, whether ripples ever get fired into it). The vertex
    // shader's noise3/hash13 are copied verbatim from the cube's
    // FACE_VERTEX_SHADER; only what's built on top (amplitude/frequency,
    // ridge-folded octave sum, and displacing straight up instead of along
    // an arbitrary face normal) is terrain-specific.
    // ---------------------------------------------------------------------
    const TERRAIN_VERTEX_SHADER = `
      uniform float uNoiseAmp;
      uniform float uNoiseFreq;
      uniform vec3 uNoiseSeed;
      varying vec3 vNormalW;
      varying vec3 vViewPosition;
      varying vec3 vWorldPos;
      varying float vHeight01;

      float hash13(vec3 p3) {
        p3 = fract(p3 * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

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

      // Ridge-folded fractal sum of the same noise3 the cube uses for its
      // small surface bumps -- same building block, just summed over a few
      // octaves so it reads as ridgelines instead of one smooth bump.
      // octaves=0 lets the 4 finite-difference normal samples below run a
      // cheap single-octave version instead of paying for the full sum 5x
      // per vertex every frame.
      float terrainHeightOctaves(vec3 p, int octaves) {
        float total = 0.0;
        float amp = 0.55;
        float freq = 1.0;
        float norm = 0.0;
        for (int o = 0; o < ${TERRAIN_OCTAVES}; o++) {
          if (o >= octaves) break;
          float n = noise3(p * freq + uNoiseSeed);
          float ridge = 1.0 - abs(n);
          total += ridge * ridge * amp;
          norm += amp;
          amp *= 0.5;
          freq *= ${TERRAIN_LACUNARITY};
        }
        float raw = total / norm; // 0..1
        // Flatten: mostly flat ground, only rising where the raw noise is
        // genuinely high -- "less wavy, more flat, with certain areas
        // higher" instead of the raw fbm's constant undulation. A sliver of
        // the raw noise (0.05) is kept even in "flat" zones so they're never
        // perfectly coplanar -- large dead-flat areas viewed near edge-on
        // is what caused the z-fighting/moire mess in the previous pass.
        float flat = smoothstep(${FLATTEN_LOW}, ${FLATTEN_HIGH}, raw);
        return clamp(flat + raw * 0.05, 0.0, 1.0);
      }
      float terrainHeight(vec3 p) {
        return terrainHeightOctaves(p, ${TERRAIN_OCTAVES});
      }

      void main() {
        vec3 worldBase = (modelMatrix * vec4(position, 1.0)).xyz;
        float h = terrainHeight(worldBase * uNoiseFreq);
        vHeight01 = h;
        vec3 displaced = position + vec3(0.0, h * uNoiseAmp, 0.0);

        // Height-to-normal via central differences -- cheap and exact for a
        // flat base plane (unlike the cube's version, which has to recover
        // a bumped normal from an arbitrarily-oriented face). Uses a
        // single-octave height sample (the rim/fresnel effect it feeds
        // doesn't need full detail) instead of re-running the full sum 4
        // more times per vertex every frame.
        float eps = 30.0;
        float hL = terrainHeightOctaves((worldBase + vec3(-eps, 0.0, 0.0)) * uNoiseFreq, 1);
        float hR = terrainHeightOctaves((worldBase + vec3(eps, 0.0, 0.0)) * uNoiseFreq, 1);
        float hD = terrainHeightOctaves((worldBase + vec3(0.0, 0.0, -eps)) * uNoiseFreq, 1);
        float hU = terrainHeightOctaves((worldBase + vec3(0.0, 0.0, eps)) * uNoiseFreq, 1);
        float dHdx = (hR - hL) * uNoiseAmp / (2.0 * eps);
        float dHdz = (hU - hD) * uNoiseAmp / (2.0 * eps);
        vec3 bumpedNormal = normalize(vec3(-dHdx, 1.0, -dHdz));

        vNormalW = normalize((viewMatrix * vec4(bumpedNormal, 0.0)).xyz);
        vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
        vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const TERRAIN_FRAGMENT_SHADER = `
      uniform vec3 uBandColors[6];
      uniform vec3 uTopColor;
      uniform vec3 uRimColor;
      uniform vec3 uSeamColor;
      uniform float uTopCap;
      uniform float uRimStrength;
      uniform float uSeamStrength;
      uniform float uTime;
      uniform vec3 uRippleColorA;
      uniform vec3 uRippleColorB;
      uniform vec3 uRippleOrigin[${MAX_RIPPLES}];
      uniform float uRippleStart[${MAX_RIPPLES}];
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      varying vec3 vNormalW;
      varying vec3 vViewPosition;
      varying vec3 vWorldPos;
      varying float vHeight01;

      void main() {
        float bandF = vHeight01 * 6.0;
        int bandIdx = int(clamp(floor(bandF), 0.0, 5.0));
        vec3 baseColor = uBandColors[0];
        for (int i = 1; i < 6; i++) {
          if (i == bandIdx) baseColor = uBandColors[i];
        }
        if (vHeight01 >= uTopCap) baseColor = uTopColor;

        // Thin seam line at each band boundary -- the cube's own band edges,
        // ported here as a height-contour instead of a per-face edge.
        // Width is screen-space-derivative-based (fwidth) instead of a fixed
        // world-space threshold -- a fixed threshold reads as jagged/aliased
        // up close and as a blurry smear at distance/grazing angles, since
        // the same world-space band covers wildly different pixel counts
        // depending on how far away and how steep the surface is.
        float frac = fract(bandF);
        float distToSeam = min(frac, 1.0 - frac);
        float seamAA = max(fwidth(bandF) * 1.5, 0.015);
        float seam = (1.0 - smoothstep(0.0, seamAA, distToSeam)) * uSeamStrength;
        vec3 color = mix(baseColor, uSeamColor, seam * 0.55);

        // Fresnel rim glow at grazing angles, same as the cube's face shader.
        vec3 viewDir = normalize(vViewPosition);
        vec3 n = normalize(vNormalW);
        float fresnel = pow(1.0 - abs(dot(n, viewDir)), 2.2) * uRimStrength;
        color = mix(color, uRimColor, fresnel * 0.45);
        color += uRimColor * seam * fresnel * 0.2;

        // Ripple bursts -- one per waypoint, fired as the camera passes it
        // (see terrain-3d.js), same expanding-ring math as the cube's hover
        // ripples but simplified to a single ring per burst. Inert on
        // layers that never get a fireRipple() call (uRippleStart stays -1).
        float rippleSum = 0.0;
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          float start = uRippleStart[i];
          if (start < 0.0) continue;
          float elapsed = uTime - start;
          if (elapsed < 0.0 || elapsed > 2.6) continue;
          float dist = length(vWorldPos - uRippleOrigin[i]);
          float radius = elapsed * 480.0;
          float fade = exp(-elapsed * 1.1);
          float ring = exp(-pow((dist - radius) * 0.012, 2.0));
          rippleSum += ring * fade;
        }
        rippleSum = clamp(rippleSum, 0.0, 1.0);
        float rt = sin(uTime * 3.6) * 0.5 + 0.5;
        vec3 rippleColor = mix(uRippleColorA, uRippleColorB, rt);
        color += rippleColor * rippleSum;

        // Manual linear fog -- ShaderMaterial doesn't pick up scene.fog for
        // free the way MeshBasicMaterial does. Fog color matches the page
        // background so this layer's edge dissolves into it, not a hard cut.
        float depth = length(vViewPosition);
        float fogFactor = clamp((depth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
        color = mix(color, uFogColor, fogFactor);

        gl_FragColor = vec4(color, 1.0 - fogFactor);
      }
    `;

    const sharedTime = { value: 0 }; // one object, every layer's uTime points at this

    function buildLayer({ seed, ampScale, freqScale, zPosition, haze, rimStrength, seamStrength, fogNear, fogFar }) {
        const geometry = new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_DEPTH, WORLD_W - 1, WORLD_D - 1);
        geometry.rotateX(-Math.PI / 2);

        const hazedBands = bandColors.map((c) => c.clone().lerp(fogColor, haze));
        const hazedTop = topColor.clone().lerp(fogColor, haze);

        const material = new THREE.ShaderMaterial({
            transparent: true,
            extensions: { derivatives: true }, // needed for fwidth() in the seam anti-aliasing above
            uniforms: {
                uNoiseAmp: { value: 460 * ampScale },
                uNoiseFreq: { value: TERRAIN_FREQ * freqScale },
                uNoiseSeed: { value: seed },
                uBandColors: { value: hazedBands },
                uTopColor: { value: hazedTop },
                uRimColor: { value: rimColor },
                uSeamColor: { value: seamColor },
                uTopCap: { value: TOP_CAP },
                uRimStrength: { value: rimStrength },
                uSeamStrength: { value: seamStrength },
                uTime: sharedTime,
                uRippleColorA: { value: rippleColorA },
                uRippleColorB: { value: rippleColorB },
                uRippleOrigin: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3()) },
                uRippleStart: { value: new Array(MAX_RIPPLES).fill(-1) },
                uFogColor: { value: fogColor },
                uFogNear: { value: fogNear },
                uFogFar: { value: fogFar },
            },
            vertexShader: TERRAIN_VERTEX_SHADER,
            fragmentShader: TERRAIN_FRAGMENT_SHADER,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.z = zPosition;
        return { mesh, material, seed, ampScale, freqScale, zPosition };
    }

    // Front: full color, full detail, carries the waypoints/ripples.
    const front = buildLayer({
        seed: new THREE.Vector3(0, 0, 0),
        ampScale: 1.0,
        freqScale: 1.0,
        zPosition: 0,
        haze: 0,
        rimStrength: 1,
        seamStrength: 1,
        fogNear: 900,
        fogFar: 2600,
    });
    // Mid: a second range picking up past the front layer's far edge, its
    // own noise seed for a distinct silhouette, pulled in close so it stays
    // visually present instead of shrinking into a distant sliver.
    const mid = buildLayer({
        seed: new THREE.Vector3(500, 0, 120),
        ampScale: 0.88,
        freqScale: 1.15,
        zPosition: -900,
        haze: 0.22,
        rimStrength: 0.65,
        seamStrength: 0.65,
        fogNear: 700,
        fogFar: 1900,
    });
    // Back: furthest range, still close, just enough haze to read as
    // slightly behind the other two.
    const back = buildLayer({
        seed: new THREE.Vector3(950, 0, 340),
        ampScale: 0.78,
        freqScale: 1.3,
        zPosition: -1800,
        haze: 0.42,
        rimStrength: 0.4,
        seamStrength: 0.4,
        fogNear: 1400,
        fogFar: 2800,
    });

    // ---------------------------------------------------------------------
    // Scene / camera / renderer -- transparent canvas + no scene.background
    // so the page's own bg-dots parallax grid shows through, same as the
    // homepage cube.
    // ---------------------------------------------------------------------
    const scene = new THREE.Scene();
    scene.add(front.mesh, mid.mesh, back.mesh);

    // near=20 (not the usual 1) keeps the near/far ratio from being
    // needlessly extreme -- nothing in this scene is ever that close to the
    // camera, and a tighter ratio measurably reduces z-fighting risk on the
    // large flat ground at distance.
    const camera = new THREE.PerspectiveCamera(48, scene3dEl.clientWidth / scene3dEl.clientHeight, 20, 4500);
    const CAM_HEIGHT_OFFSET = 150; // modest clearance above the tallest peak on the flight row -- close/dominant, not a distant flyover
    const CAM_Z = 700;
    // Near-level angles stare almost edge-on across the (now mostly flat)
    // ground, which is what caused the moire/z-fighting mess -- steepened
    // back down a bit to cut across the flat ground at more of an angle
    // while still keeping the ridgeline fairly high in frame.
    const CAM_TILT = -0.2;
    camera.rotation.set(CAM_TILT, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(scene3dEl.clientWidth, scene3dEl.clientHeight);
    scene3dEl.appendChild(renderer.domElement);

    // Declared before ScrollTrigger init below since its onUpdate can fire
    // synchronously during setup/refresh and reaches for clock via fireRipple.
    const clock = new THREE.Clock();

    // ---------------------------------------------------------------------
    // Scroll-driven camera dolly -- pin the section, slide the camera along
    // X (sideways) as the user scrolls vertically, GSAP ScrollTrigger scrub.
    // Fixed altitude for the whole traversal -- a straight left-to-right
    // dolly, not a terrain-following flight.
    // ---------------------------------------------------------------------
    const CAM_MARGIN = 500;
    const camXStart = -PLANE_WIDTH / 2 + CAM_MARGIN;
    const camXEnd = PLANE_WIDTH / 2 - CAM_MARGIN;
    // Fixed altitude cleared against the tallest point actually along the
    // camera's flight row on the FRONT layer, using the CPU noise mirror
    // (not a whole-grid average, and not the more distant layers, which
    // the camera never flies close to).
    const frontFreq = TERRAIN_FREQ * front.freqScale;
    const frontAmp = 460 * front.ampScale;
    let maxAlongRow = 0;
    for (let x = 0; x < WORLD_W; x++) {
        const worldX = -PLANE_WIDTH / 2 + (x / (WORLD_W - 1)) * PLANE_WIDTH;
        const h = terrainHeightJS(worldX * frontFreq, 0, CAM_Z * frontFreq, 1, front.seed);
        maxAlongRow = Math.max(maxAlongRow, h);
    }
    const CAM_Y = maxAlongRow * frontAmp + CAM_HEIGHT_OFFSET;
    camera.position.set(camXStart, CAM_Y, CAM_Z);

    // Height sampler mirroring the front layer's GPU displacement -- used to
    // sit waypoint markers exactly on the surface.
    function worldHeightAt(worldX, worldZ) {
        const h = terrainHeightJS(worldX * frontFreq, 0, worldZ * frontFreq, 1, front.seed);
        return h * frontAmp;
    }

    const waypointEls = Array.from(sceneSection.querySelectorAll(".terrain-waypoint"));
    const progressFill = sceneSection.querySelector(".terrain-progress-fill");
    const progressIndex = sceneSection.querySelector(".terrain-progress-index");

    const waypoints = waypointEls.map((el) => {
        const progress = parseFloat(el.dataset.progress) || 0;
        const worldX = camXStart + progress * (camXEnd - camXStart);
        const worldY = worldHeightAt(worldX, WAYPOINT_DEPTH_Z) + 40;
        return { el, progress, fired: false, vec: new THREE.Vector3(worldX, worldY, WAYPOINT_DEPTH_Z) };
    });

    function fireRipple(index) {
        const slot = index % MAX_RIPPLES;
        front.material.uniforms.uRippleOrigin.value[slot].copy(waypoints[index].vec);
        front.material.uniforms.uRippleStart.value[slot] = clock.getElapsedTime();
    }

    let scrollTween = null;

    function initScrollTrigger() {
        if (scrollTween) scrollTween.scrollTrigger.kill();
        const pinDistance = window.innerHeight * 3;
        scrollTween = gsap.to(camera.position, {
            x: camXEnd,
            ease: "none",
            scrollTrigger: {
                trigger: sceneSection,
                start: "top top",
                end: "+=" + pinDistance,
                scrub: 0.6,
                pin: true,
                anticipatePin: 1,
                invalidateOnRefresh: true,
                onUpdate: (self) => {
                    if (progressFill) progressFill.style.width = `${self.progress * 100}%`;
                    if (progressIndex) {
                        const step = Math.min(
                            waypointEls.length,
                            Math.max(1, Math.ceil(self.progress * waypointEls.length))
                        );
                        progressIndex.textContent = String(step).padStart(2, "0");
                    }
                    waypoints.forEach((wp, i) => {
                        if (!wp.fired && self.progress >= wp.progress) {
                            wp.fired = true;
                            fireRipple(i);
                        } else if (wp.fired && self.progress < wp.progress - 0.02) {
                            wp.fired = false;
                        }
                    });
                },
            },
        });
    }
    initScrollTrigger();

    // ---------------------------------------------------------------------
    // Waypoint DOM callouts -- fixed world positions, projected to screen
    // space every frame so they track the 3D scene as the camera moves.
    // ---------------------------------------------------------------------
    const projected = new THREE.Vector3();

    function updateWaypointScreens() {
        const w = scene3dEl.clientWidth;
        const h = scene3dEl.clientHeight;
        waypoints.forEach(({ el, vec }) => {
            projected.copy(vec).project(camera);
            const behind = projected.z > 1;
            if (behind) {
                el.style.opacity = "0";
                el.style.pointerEvents = "none";
                return;
            }
            el.style.opacity = "1";
            el.style.pointerEvents = "auto";
            el.style.left = `${(projected.x * 0.5 + 0.5) * w}px`;
            el.style.top = `${(-projected.y * 0.5 + 0.5) * h}px`;
        });
    }

    // ---------------------------------------------------------------------
    // Render loop -- runs continuously so the GSAP-eased camera keeps
    // rendering (and waypoints keep tracking) between scroll events, not
    // just when ScrollTrigger fires onUpdate.
    // ---------------------------------------------------------------------
    function animate() {
        requestAnimationFrame(animate);
        sharedTime.value = clock.getElapsedTime();
        renderer.render(scene, camera);
        updateWaypointScreens();
    }
    requestAnimationFrame(animate);

    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            camera.aspect = scene3dEl.clientWidth / scene3dEl.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(scene3dEl.clientWidth, scene3dEl.clientHeight);
            initScrollTrigger();
            ScrollTrigger.refresh();
        }, 200);
    });
})();
