/* =========================================================================
   TERRAIN 3D -- ONE real heightmap terrain, modeled directly on three.js's
   own "webgl_geometry_terrain" example (PlaneGeometry rotated flat, height
   baked into vertices, camera flying forward, FogExp2 fading the distance)
   -- but "as if it's on the cube": instead of the example's baked canvas
   lighting texture, the surface uses the homepage cube's own material
   (FACE_VERTEX_SHADER/FACE_FRAGMENT_SHADER from threejs.js, copied here):
   noise-bump surface detail, height-based strata bands in the cube's own
   colors, a fresnel rim glow, animated flowing wave lines, and
   color-cycling ripple bursts. Scrolling flies the camera forward over the
   one continuous terrain -- fog does the "parallax" depth read instead of
   a stack of separate layers.
   ========================================================================= */
(function () {
    const container = document.querySelector(".terrain-2d");
    const sceneSection = document.querySelector(".terrain-scene");
    if (!container || !sceneSection) return;
    if (typeof THREE === "undefined") return;
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;
    gsap.registerPlugin(ScrollTrigger);

    function getCSSColor(varName, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return value || fallback;
    }

    const topColor = getCSSColor("--cube-top-color", "#556b2f");
    const rimColor = getCSSColor("--cube-rim-color", "#5c4033");
    const rippleColorA = getCSSColor("--cube-ripple-color-a", "#2b6d8b");
    const rippleColorB = getCSSColor("--cube-ripple-color-b", "#a0846e");
    const skyColor = "#dcece4"; // matches .terrain-scene's CSS sky -- fog target + page bg above the horizon

    const ALL_BAND_COLORS = [
        getCSSColor("--cube-band-0", "#2d1b12"),
        getCSSColor("--cube-band-1", "#4a3728"),
        getCSSColor("--cube-band-2", "#6b503d"),
        getCSSColor("--cube-band-3", "#8b6e56"),
        getCSSColor("--cube-band-4", "#a0846e"),
        getCSSColor("--cube-band-5", "#bda28b"),
    ];
    // 4 of the cube's 6 bands, spread across the full range -- bolder, wider
    // strata read more clearly on real terrain than 6 thin ones would.
    const BAND_COLORS = [ALL_BAND_COLORS[0], ALL_BAND_COLORS[2], ALL_BAND_COLORS[4], ALL_BAND_COLORS[5]];

    function mixColor(hexA, hexB, t) {
        return new THREE.Color(hexA).lerp(new THREE.Color(hexB), t);
    }

    /* =====================================================================
       HEIGHTMAP -- CPU-baked, same spirit as the reference's generateHeight
       (fbm noise summed over a few octaves), except a smooth value noise
       instead of Perlin (no extra library) and ridge-folded so it reads as
       rolling dunes/hills rather than jagged Perlin static.
       ===================================================================== */
    function hash2(x, y) {
        const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
        return s - Math.floor(s);
    }
    function valueNoise2D(x, y) {
        const xi = Math.floor(x), yi = Math.floor(y);
        const xf = x - xi, yf = y - yi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        const n00 = hash2(xi, yi), n10 = hash2(xi + 1, yi);
        const n01 = hash2(xi, yi + 1), n11 = hash2(xi + 1, yi + 1);
        const nx0 = n00 + (n10 - n00) * u, nx1 = n01 + (n11 - n01) * u;
        return nx0 + (nx1 - nx0) * v; // 0..1
    }
    // 4 distinct parallax ridge rows baked right into the heightmap -- each
    // its own Z position (front to back) and its own peak height.
    // Farthest is tallest, closest is shortest here -- the opposite of what
    // was tried first (front tallest): with the camera sitting near ground
    // level, a near-tall ridge fills the whole frame and hides everything
    // behind it, so only one layer ever showed. Making distant ridges
    // progressively taller compensates for perspective shrinking them with
    // distance, so all 4 actually peek out above one another on screen.
    const RIDGES = [
        { z: -280, amp: 0.42, seed: 0 },
        { z: -105, amp: 0.68, seed: 40 },
        { z: 55, amp: 0.95, seed: 90 },
        { z: 205, amp: 1.25, seed: 150 },
    ];
    const RIDGE_WIDTH = 34; // narrower spread -- crisper, more separated ranges with sky/valley gaps between them, like layered-poster references

    function heightAt(x, z) {
        // Gentle base rolling ground, low amplitude -- the RIDGES below do
        // the actual "4 distinct levels" work.
        let h = valueNoise2D(x * 0.012, z * 0.012) * 0.08 + valueNoise2D(x * 0.08 + 130, z * 0.08 + 130) * 0.04;

        for (const r of RIDGES) {
            const dz = z - r.z;
            const gaussian = Math.exp(-(dz * dz) / (2 * RIDGE_WIDTH * RIDGE_WIDTH));
            if (gaussian < 0.002) continue;
            const peakNoise = 0.3 + 0.7 * valueNoise2D(x * 0.018 + r.seed, r.seed * 1.7);
            h += Math.pow(gaussian, 1.3) * r.amp * peakNoise;
        }
        return h;
    }

    // Wide in X (the travel axis, left-to-right), deep enough in Z to fit
    // all 4 ridge rows plus fog falloff behind the last one -- the camera
    // sweeps along X on scroll instead of flying forward into Z.
    const TERRAIN_WIDTH = 900;
    const TERRAIN_DEPTH = 900;
    const SEG_W = 160;
    const SEG_D = 150;
    const MAX_ELEVATION = 46;

    const geometry = new THREE.PlaneGeometry(TERRAIN_WIDTH, TERRAIN_DEPTH, SEG_W, SEG_D);
    geometry.rotateX(-Math.PI / 2);
    const posAttr = geometry.attributes.position;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        const y = heightAt(x, z) * MAX_ELEVATION;
        posAttr.setY(i, y);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();

    const elevationRange = maxY - minY;
    const CAP_FRAC = 0.6; // more green, minimal brown -- most of the terrain is grass cap, brown only shows in the low valleys
    const capThresholdY = maxY - elevationRange * CAP_FRAC;
    const bandHeight = (elevationRange * (1 - CAP_FRAC)) / BAND_COLORS.length;

    /* =====================================================================
       SHADER -- copied verbatim from threejs.js's FACE_VERTEX_SHADER /
       FACE_FRAGMENT_SHADER (noise-bump surface detail, fresnel rim,
       animated wave lines, color-cycling ripple bursts), with the strata
       lookup changed from the wall version's "distance below the ridge" to
       real world-space elevation, since this is now actual terrain height.
       ===================================================================== */
    const clock = new THREE.Clock();
    const sharedTimeUniform = { value: 0 };

    const FACE_VERTEX_SHADER = `
      uniform float uNoiseAmp;
      uniform float uNoiseFreq;
      uniform vec3 uNoiseSeed;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying float vNoiseHeight;
      varying vec3 vWorldPos;

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
        return mix(nxy0, nxy1, f.z) * 2.0 - 1.0;
      }

      float displacementAt(vec3 worldPos) {
        return noise3(worldPos * uNoiseFreq + uNoiseSeed) * uNoiseAmp;
      }

      void main() {
        vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        float rawNoise = noise3(worldPos * uNoiseFreq + uNoiseSeed);
        vNoiseHeight = rawNoise;
        vec3 displaced = position + normal * rawNoise * uNoiseAmp;
        vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;

        vec3 worldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec3 tangent = normalize((modelMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        vec3 bitangent = normalize((modelMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
        float eps = 0.05;
        float dHu = (displacementAt(worldPos + tangent * eps) - displacementAt(worldPos - tangent * eps)) / (2.0 * eps);
        float dHv = (displacementAt(worldPos + bitangent * eps) - displacementAt(worldPos - bitangent * eps)) / (2.0 * eps);
        vec3 bumpedWorldNormal = normalize(worldNormal - dHu * tangent - dHv * bitangent);

        vNormal = normalize((viewMatrix * vec4(bumpedWorldNormal, 0.0)).xyz);
        vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    // Tuned for this scene's much larger world scale (terrain spans ~900
    // units) -- the old wall-scale values (14 units/sec, 4-unit ring
    // spacing) produced rings too thin/fast to ever notice against ground
    // this size.
    const MAX_RIPPLES = 3;
    const RIPPLE_LIFETIME = 3.5;
    const RIPPLE_EXPAND_SPEED = 40.0;
    const RIPPLE_SHARPNESS = 0.22;
    const RIPPLE_RING_COUNT = 3;
    const RIPPLE_RING_SPACING = 10.0;

    const FACE_FRAGMENT_SHADER = `
      uniform vec3 uCapColor;
      uniform vec3 uBandColor0;
      uniform vec3 uBandColor1;
      uniform vec3 uBandColor2;
      uniform vec3 uBandColor3;
      uniform float uCapThresholdY;
      uniform float uBandHeight;
      uniform float uMinY;
      uniform vec3 uRimColor;
      uniform float uTime;
      uniform vec3 uRippleColorA;
      uniform vec3 uRippleColorB;
      uniform float uRippleSpeed;
      uniform vec3 uRippleOrigin[${MAX_RIPPLES}];
      uniform float uRippleStart[${MAX_RIPPLES}];
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying float vNoiseHeight;
      varying vec3 vWorldPos;

      // Strata by real world elevation -- like the cube's own bedrock-to-
      // topsoil bands, just driven by actual terrain height instead of a
      // per-face index, with a soft smoothstep seam instead of a hard cut.
      vec3 strataColor(float y) {
        if (y >= uCapThresholdY) return uCapColor;
        float d = uCapThresholdY - y;
        float t0 = smoothstep(uBandHeight * 0.92, uBandHeight * 1.08, d);
        vec3 c = mix(uBandColor3, uBandColor2, t0);
        float t1 = smoothstep(uBandHeight * 1.92, uBandHeight * 2.08, d);
        c = mix(c, uBandColor1, t1);
        float t2 = smoothstep(uBandHeight * 2.92, uBandHeight * 3.08, d);
        c = mix(c, uBandColor0, t2);
        return c;
      }

      void main() {
        // Flat, Firewatch-style read -- almost no surface shading (no
        // fresnel rim glow, no flowing wave lines, barely any bump-height
        // contrast) since those all made this look like a rendered/textured
        // 3D surface instead of a clean flat-color silhouette. Fog (scene
        // fog, not this shader) is what carries the depth read instead.
        vec3 color = strataColor(vWorldPos.y);
        float heightShade = vNoiseHeight * 0.5 + 0.5;
        color = mix(color * 0.94, color, heightShade);

        float rippleSum = 0.0;
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          float start = uRippleStart[i];
          if (start < 0.0) continue;
          float elapsed = uTime - start;
          if (elapsed < 0.0 || elapsed > ${RIPPLE_LIFETIME.toFixed(1)}) continue;

          float dist = length(vWorldPos - uRippleOrigin[i]);
          float radius = elapsed * ${RIPPLE_EXPAND_SPEED.toFixed(3)};
          float fade = exp(-elapsed * 1.0);

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

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    function createRippleState() {
        return {
            origins: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3()),
            starts: Array.from({ length: MAX_RIPPLES }, () => -1),
            slotCursor: 0,
        };
    }
    function fireRipple(rippleState, worldPos) {
        const slot = rippleState.slotCursor % MAX_RIPPLES;
        rippleState.origins[slot].copy(worldPos);
        rippleState.starts[slot] = sharedTimeUniform.value;
        rippleState.slotCursor++;
    }

    const rippleState = createRippleState();

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uCapColor: { value: new THREE.Color(mixColor(topColor, skyColor, 0)) },
            uBandColor0: { value: new THREE.Color(BAND_COLORS[0]) },
            uBandColor1: { value: new THREE.Color(BAND_COLORS[1]) },
            uBandColor2: { value: new THREE.Color(BAND_COLORS[2]) },
            uBandColor3: { value: new THREE.Color(BAND_COLORS[3]) },
            uCapThresholdY: { value: capThresholdY },
            uBandHeight: { value: bandHeight },
            uMinY: { value: minY },
            uRimColor: { value: new THREE.Color(rimColor) },
            uTime: sharedTimeUniform,
            // Much smaller than before -- this was displacing the actual
            // surface geometry, making the silhouette itself look noisy
            // and "rendered" instead of a clean flat shape.
            uNoiseAmp: { value: 0.04 },
            uNoiseFreq: { value: 0.6 },
            uNoiseSeed: { value: new THREE.Vector3(Math.random() * 1000, Math.random() * 1000, Math.random() * 1000) },
            uRippleColorA: { value: new THREE.Color(rippleColorA) },
            uRippleColorB: { value: new THREE.Color(rippleColorB) },
            uRippleSpeed: { value: 0.5 },
            uRippleOrigin: { value: rippleState.origins },
            uRippleStart: { value: rippleState.starts },
        },
        vertexShader: FACE_VERTEX_SHADER,
        fragmentShader: FACE_FRAGMENT_SHADER,
        side: THREE.DoubleSide,
    });

    /* =====================================================================
       SCENE -- fog fading the far ground into the page's own sky color,
       flying-over camera like the reference example.
       ===================================================================== */
    // Lower density than the first pass -- the terrain now reaches much
    // farther in Z (4 ridge rows spread across ~700 units) than the old
    // single-hill version, and the old density fogged the 4th ridge out to
    // nothing.
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(new THREE.Color(skyColor).getHex(), 0.0026);

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const camera = new THREE.PerspectiveCamera(60, 1, 1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    container.appendChild(renderer.domElement);

    function resizeRenderer() {
        const w = sceneSection.clientWidth;
        const h = sceneSection.clientHeight;
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    resizeRenderer();

    // Fixed depth near the front edge; the camera sweeps left-to-right
    // along X on scroll and always looks forward into the terrain's depth.
    const FLY_START_X = -TERRAIN_WIDTH / 2 + 40;
    const FLY_END_X = TERRAIN_WIDTH / 2 - 60;
    const FIXED_Z = RIDGES[0].z - 90; // just in front of the first (tallest, closest) ridge row
    const CAMERA_HEIGHT = MAX_ELEVATION * 0.9;
    camera.position.set(FLY_START_X, CAMERA_HEIGHT, FIXED_Z);
    camera.lookAt(FLY_START_X, CAMERA_HEIGHT - 6, FIXED_Z + 120);

    /* =====================================================================
       WAYPOINTS -- fixed (x, z) points along the flight path, height
       sampled from the same heightmap, projected onto screen each frame.
       ===================================================================== */
    const waypointEls = Array.from(sceneSection.querySelectorAll(".terrain-waypoint"));
    const progressFill = sceneSection.querySelector(".terrain-progress-fill");
    const progressIndex = sceneSection.querySelector(".terrain-progress-index");

    const waypointWorld = waypointEls.map((elm, i) => {
        const progress = parseFloat(elm.dataset.progress) || i / Math.max(1, waypointEls.length - 1);
        const x = FLY_START_X + progress * (FLY_END_X - FLY_START_X);
        const z = FIXED_Z + 60 + (hash2(i * 3.1, 7.7) - 0.5) * TERRAIN_DEPTH * 0.4;
        const y = heightAt(x, z) * MAX_ELEVATION + 2;
        return new THREE.Vector3(x, y, z);
    });

    waypointEls.forEach((elm) => {
        if (!elm.querySelector(".terrain-ripple")) {
            for (let r = 0; r < 3; r++) {
                const ripple = document.createElement("span");
                ripple.className = "terrain-ripple";
                ripple.style.animationDelay = `${r * 0.12}s`;
                elm.appendChild(ripple);
            }
        }
    });

    const _wp = new THREE.Vector3();
    function updateWaypoints() {
        waypointEls.forEach((elm, i) => {
            _wp.copy(waypointWorld[i]);
            _wp.project(camera);
            const x = (_wp.x * 0.5 + 0.5) * sceneSection.clientWidth;
            const y = (-_wp.y * 0.5 + 0.5) * sceneSection.clientHeight;
            elm.style.left = `${x}px`;
            elm.style.top = `${y}px`;
            elm.style.opacity = _wp.z > 1 ? "0" : "1";
        });
    }

    /* =====================================================================
       SCROLL -- fly the camera forward through the one terrain; fog does
       the "parallax" depth read as the ground resolves out of the haze.
       ===================================================================== */
    const pinDistance = window.innerHeight * 3;
    let scrollTrigger = null;

    function layout() {
        resizeRenderer();
        if (scrollTrigger) scrollTrigger.kill();
        scrollTrigger = ScrollTrigger.create({
            trigger: sceneSection,
            start: "top top",
            end: "+=" + pinDistance,
            scrub: 0.5,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
                const x = FLY_START_X + self.progress * (FLY_END_X - FLY_START_X);
                camera.position.x = x;
                camera.position.y = heightAt(x, FIXED_Z) * MAX_ELEVATION + CAMERA_HEIGHT * 0.4;
                camera.lookAt(x, camera.position.y - 6, FIXED_Z + 120);

                if (progressFill) progressFill.style.width = `${self.progress * 100}%`;
                if (progressIndex) {
                    const step = Math.min(waypointEls.length, Math.max(1, Math.ceil(self.progress * waypointEls.length)));
                    progressIndex.textContent = String(step).padStart(2, "0");
                }
                waypointEls.forEach((elm, i) => {
                    const active = x + 40 >= waypointWorld[i].x;
                    if (active && !elm.classList.contains("is-passed")) {
                        elm.classList.add("is-passed");
                        fireRipple(rippleState, waypointWorld[i]);
                        elm.querySelectorAll(".terrain-ripple").forEach((ripple) => {
                            ripple.classList.remove("is-pulsing");
                            void ripple.offsetWidth;
                            ripple.classList.add("is-pulsing");
                        });
                    } else if (!active && elm.classList.contains("is-passed")) {
                        elm.classList.remove("is-passed");
                    }
                });
            },
        });
    }

    layout();

    function tick() {
        sharedTimeUniform.value = clock.getElapsedTime();
        updateWaypoints();
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
    }
    tick();

    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            layout();
            ScrollTrigger.refresh();
        }, 200);
    });
})();
