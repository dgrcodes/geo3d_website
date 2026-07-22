/* =========================================================================
   CUBE FACE -- a single face of the homepage cube, facing the camera
   head-on, filling the hero. Built exactly the way threejs.js builds one
   face: 6 stacked horizontal bands (PlaneGeometry per band), each using the
   cube's own FACE_VERTEX_SHADER/FACE_FRAGMENT_SHADER verbatim (noise-bump
   surface detail, fresnel rim glow, animated flowing wave lines), a shared
   per-face noise seed so the bump reads as one continuous surface across
   band seams, and wire boundary lines bent along that same noise field
   (displaceAlongNormal) instead of straight cuts -- same technique, same
   CPU-side noise mirror, as threejs.js's buildBoundaryLoopPoints(). No
   ripple bursts (those fire on hover in the real cube; this page has no
   mouse interaction) and no layer-separation hover effect -- just the face
   itself, animating the same way it does at rest on the homepage.
   ========================================================================= */
(function () {
    if (typeof THREE === "undefined") return;
    if (!document.body.classList.contains("cube-face-page")) return;

    function getCSSColor(varName, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return value || fallback;
    }

    const bandColors = [
        getCSSColor("--cube-band-0", "#2d1b12"),
        getCSSColor("--cube-band-1", "#4a3728"),
        getCSSColor("--cube-band-2", "#6b503d"),
        getCSSColor("--cube-band-3", "#8b6e56"),
        getCSSColor("--cube-band-4", "#a0846e"),
        getCSSColor("--cube-band-5", "#bda28b"),
    ];
    const rimColor = getCSSColor("--cube-rim-color", "#5c4033");
    const wireColor = getCSSColor("--cube-wire-color", "#3d2b1f");
    const baseOpacity = 0.8; // CONFIG.interaction.baseOpacity in threejs.js

    // Bigger than before, filling more of the frame.
    const FACE_WIDTH = 16;
    const FACE_HEIGHT = 7;
    const halfW = FACE_WIDTH / 2;
    const halfH = FACE_HEIGHT / 2;

    /* =====================================================================
       SCENE / CAMERA / RENDERER -- transparent canvas over the page's own
       bg-dots grid, same as the homepage cube.
       ===================================================================== */
    const scene = new THREE.Scene();
    const CAMERA_FOV = 40;
    const tanHalfFov = Math.tan((CAMERA_FOV / 2) * (Math.PI / 180));
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 100);
    // Actual position/distance is set by updateFraming() further down (it
    // needs FACE_WIDTH and the background terrain's offset, which aren't
    // defined yet at this point in the file) -- called once at startup and
    // again on every resize.

    // The screen-bottom world-Y at a given world Z, using the CAMERA'S
    // CURRENT (dynamic) position/distance: a perspective camera's frustum
    // widens with distance, so a point at the same world Y but further away
    // (more negative Z) projects higher on screen, not to the same spot --
    // any terrain sitting behind the main one needs this to find the world
    // Y that actually touches the visual bottom edge at ITS own depth, not
    // just copy the main terrain's own ground Y.
    function frameBottomWorldYAtZ(worldZ) {
        const depth = camera.position.z - worldZ;
        return camera.position.y - depth * tanHalfFov;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = "cube-face-canvas";
    document.body.appendChild(renderer.domElement);

    /* =====================================================================
       FACE SHADER -- copied verbatim from threejs.js's FACE_VERTEX_SHADER /
       FACE_FRAGMENT_SHADER, minus the ripple-burst uniforms/logic (no hover
       here to fire them).
       ===================================================================== */
    const clock = new THREE.Clock();
    const sharedTimeUniform = { value: 0 };

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
        vUv = uv * uUvScale + uUvOffset;

        vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vWorldPos = worldPos;
        float rawNoise = noise3(worldPos * uNoiseFreq + uNoiseSeed);
        vNoiseHeight = rawNoise;
        vec3 displaced = position + normal * rawNoise * uNoiseAmp;

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

    const FACE_FRAGMENT_SHADER = `
      uniform vec3 uBaseColor;
      uniform vec3 uRimColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uHalfH;
      uniform vec2 uRidgeSeed;
      uniform float uRidgeFreq;
      uniform float uRidgeSpreadX;
      uniform float uProfileAmplitude;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec2 vUv;
      varying float vNoiseHeight;
      varying vec3 vWorldPos;

      float hash13f(vec3 p3) {
        p3 = fract(p3 * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float noise3f(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n000 = hash13f(i + vec3(0.0, 0.0, 0.0));
        float n100 = hash13f(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash13f(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash13f(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash13f(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash13f(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash13f(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash13f(i + vec3(1.0, 1.0, 1.0));
        float nx00 = mix(n000, n100, f.x);
        float nx10 = mix(n010, n110, f.x);
        float nx01 = mix(n001, n101, f.x);
        float nx11 = mix(n011, n111, f.x);
        float nxy0 = mix(nx00, nx10, f.y);
        float nxy1 = mix(nx01, nx11, f.y);
        return mix(nxy0, nxy1, f.z) * 2.0 - 1.0;
      }
      // Same ridge-folded fbm + dome mask as mountainProfile() in JS --
      // kept in sync manually. Governs where fragments get discarded below,
      // so every band (not just the top one) is cut to the same mountain
      // silhouette running from base to peak, not just a jagged top edge.
      float mountainProfile(float x) {
        float total = 0.0;
        float amp = 0.55;
        float freqMul = 1.0;
        float norm = 0.0;
        for (int o = 0; o < 2; o++) {
          float n = noise3f(vec3(x * uRidgeFreq * freqMul + uRidgeSeed.x, uRidgeSeed.y, 0.0));
          float ridge = 1.0 - abs(n);
          total += ridge * amp;
          norm += amp;
          amp *= 0.5;
          freqMul *= 1.6;
        }
        float raw = total / norm;
        float distT = abs(x) / uRidgeSpreadX;
        float dome = pow(clamp(smoothstep(1.0, 0.0, distT), 0.0, 1.0), 1.2);
        float height01 = dome * (0.18 + 0.82 * raw);
        return height01 * uProfileAmplitude;
      }

      void main() {
        float silhouetteY = -uHalfH + mountainProfile(vWorldPos.x);
        if (vWorldPos.y > silhouetteY) discard;

        vec3 viewDir = normalize(vViewPosition);
        vec3 n = normalize(vNormal);
        float fresnel = pow(1.0 - abs(dot(n, viewDir)), 2.2);

        float wave = sin(vUv.y * 200.0 + sin(vUv.x * 5.0 + uTime * 0.25) * 2.5 + uTime * 0.4);
        float lines = smoothstep(0.99, 1.0, abs(wave)) * 0.5;

        vec3 color = mix(uBaseColor, uRimColor, fresnel * 0.8);
        color += lines * uRimColor;

        float heightShade = vNoiseHeight * 0.5 + 0.5;
        color = mix(color * 0.7, mix(color, uRimColor, 0.5), heightShade);
        float heightAlpha = (heightShade - 0.5) * 0.3;

        float alpha = clamp(uOpacity + fresnel * 0.35 + lines * 0.15 + heightAlpha, 0.0, 1.0);
        gl_FragColor = vec4(color, alpha);
      }
    `;

    const BAND_COUNT = bandColors.length;

    const noiseAmp = 0.12;
    const noiseFreq = 3.5;
    const RIDGE_FREQ = 1.1; // lower -- fewer, broader undulations

    /* =====================================================================
       CPU-side mirror of the noise3/hash13 building block above (same
       pattern as threejs.js's own noise3JS/hash13JS), used both for the
       jagged mountain-peak profile below and to bend each wire boundary
       line so it hugs the bumpy surface instead of cutting a straight edge
       through it -- verbatim technique from threejs.js's
       displaceAlongNormal()/buildBoundaryLoopPoints().
       ===================================================================== */
    function fract(v) {
        return v - Math.floor(v);
    }
    function hash13JS(x, y, z) {
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
        const n000 = hash13JS(ix, iy, iz), n100 = hash13JS(ix + 1, iy, iz);
        const n010 = hash13JS(ix, iy + 1, iz), n110 = hash13JS(ix + 1, iy + 1, iz);
        const n001 = hash13JS(ix, iy, iz + 1), n101 = hash13JS(ix + 1, iy, iz + 1);
        const n011 = hash13JS(ix, iy + 1, iz + 1), n111 = hash13JS(ix + 1, iy + 1, iz + 1);
        const nx00 = lerp(n000, n100, fx), nx10 = lerp(n010, n110, fx);
        const nx01 = lerp(n001, n101, fx), nx11 = lerp(n011, n111, fx);
        const nxy0 = lerp(nx00, nx10, fy), nxy1 = lerp(nx01, nx11, fy);
        return lerp(nxy0, nxy1, fz) * 2 - 1;
    }
    const WIRE_SEGMENTS = 120;

    // Builds one full terrain (bands + wires) as its own Group, so a second,
    // smaller one can sit behind the main one. Each instance gets its own
    // width/height/seeds/position -- the ridge-fbm + dome-mask silhouette
    // technique (same as the earlier standalone mountain, reworked with an
    // elliptical dome mask that fades to exactly 0 at the edges) is
    // identical, just re-scaled to that instance's own width/height.
    function buildTerrain({ width, height, offset, noiseSeedVec, ridgeSeedVec, opacity }) {
        const hw = width / 2;
        const hh = height / 2;
        const bandH = height / BAND_COUNT;
        const ridgeSpreadX = hw * 1.0;
        const profileAmplitude = height * 0.3;

        function ridgeFbm1D(x) {
            let total = 0, amp = 0.55, freqMul = 1, norm = 0;
            // Only 2 octaves -- each extra octave adds a higher-frequency
            // layer of detail on top; that fine detail is what reads as
            // small spikes. Fewer octaves = a smoother, broader silhouette.
            for (let o = 0; o < 2; o++) {
                const n = noise3JS(x * RIDGE_FREQ * freqMul + ridgeSeedVec.x, ridgeSeedVec.y, ridgeSeedVec.z);
                // Plain ridge (not ridge*ridge) -- squaring is what gives
                // the sharp, cusped peaks of an actual mountain; dropping
                // it reads as smoother, rounder, terrain-like undulation.
                const ridge = 1 - Math.abs(n);
                total += ridge * amp;
                norm += amp;
                amp *= 0.5;
                freqMul *= 1.6;
            }
            return total / norm; // 0..1
        }
        function smoothstepJS(edge0, edge1, x) {
            const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
        }
        function mountainProfile(x) {
            const raw = ridgeFbm1D(x);
            const distT = Math.abs(x) / ridgeSpreadX;
            const dome = Math.pow(smoothstepJS(1.0, 0.0, distT), 1.2);
            const height01 = dome * (0.18 + 0.82 * raw); // same as the shader's mix(0.18, 1.0, raw)
            return height01 * profileAmplitude;
        }
        function silhouetteYAt(x) {
            return -hh + mountainProfile(x);
        }
        function displaceAlongNormal(point, normal) {
            const n = noise3JS(
                point.x * noiseFreq + noiseSeedVec.x,
                point.y * noiseFreq + noiseSeedVec.y,
                point.z * noiseFreq + noiseSeedVec.z
            );
            return point.clone().addScaledVector(normal, n * noiseAmp);
        }

        const group = new THREE.Group();

        // Every band is a plain flat rectangle -- the mountain shape comes
        // entirely from FACE_FRAGMENT_SHADER discarding fragments above the
        // silhouette (a per-PIXEL cutoff, crisp regardless of how coarsely
        // each band's geometry is tessellated).
        for (let i = 0; i < BAND_COUNT; i++) {
            const yCenter = -hh + bandH * (i + 0.5);
            const material = new THREE.ShaderMaterial({
                transparent: true,
                depthWrite: false,
                uniforms: {
                    uBaseColor: { value: new THREE.Color(bandColors[i]) },
                    uRimColor: { value: new THREE.Color(rimColor) },
                    uOpacity: { value: opacity },
                    uTime: sharedTimeUniform,
                    uUvOffset: { value: new THREE.Vector2(0, i / BAND_COUNT) },
                    uUvScale: { value: new THREE.Vector2(1, 1 / BAND_COUNT) },
                    uNoiseAmp: { value: noiseAmp },
                    uNoiseFreq: { value: noiseFreq },
                    uNoiseSeed: { value: noiseSeedVec },
                    uHalfH: { value: hh },
                    uRidgeSeed: { value: new THREE.Vector2(ridgeSeedVec.x, ridgeSeedVec.y) },
                    uRidgeFreq: { value: RIDGE_FREQ },
                    uRidgeSpreadX: { value: ridgeSpreadX },
                    uProfileAmplitude: { value: profileAmplitude },
                },
                vertexShader: FACE_VERTEX_SHADER,
                fragmentShader: FACE_FRAGMENT_SHADER,
                side: THREE.DoubleSide,
            });
            const geometry = new THREE.PlaneGeometry(width, bandH, 24, 8);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(0, yCenter, 0);
            group.add(mesh);
        }

        // Boundary wires.
        const faceNormal = new THREE.Vector3(0, 0, 1);
        function buildWireLine(y, profileFn, lineOpacity) {
            const points = [];
            for (let s = 0; s <= WIRE_SEGMENTS; s++) {
                const x = -hw + (s / WIRE_SEGMENTS) * width;
                const py = profileFn ? y + profileFn(x) : y;
                points.push(displaceAlongNormal(new THREE.Vector3(x, py, 0), faceNormal));
            }
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const mat = new THREE.LineBasicMaterial({ color: wireColor, transparent: true, opacity: lineOpacity });
            return new THREE.Line(geo, mat);
        }
        group.add(buildWireLine(-hh, null, 0.9));
        group.add(buildWireLine(-hh, mountainProfile, 0.9));

        // Inter-band seams: unlike the two lines above, these sit at a
        // FIXED height and the silhouette dips below them well before the
        // edges -- a straight line would float over blank space out there.
        // Split into separate Line objects per contiguous visible run.
        function buildClippedWireLine(y, lineOpacity) {
            const runs = [];
            let current = null;
            for (let s = 0; s <= WIRE_SEGMENTS; s++) {
                const x = -hw + (s / WIRE_SEGMENTS) * width;
                if (y > silhouetteYAt(x) + 0.001) {
                    current = null;
                    continue;
                }
                if (!current) {
                    current = [];
                    runs.push(current);
                }
                current.push(displaceAlongNormal(new THREE.Vector3(x, y, 0), faceNormal));
            }
            return runs
                .filter((pts) => pts.length > 1)
                .map((pts) => {
                    const geo = new THREE.BufferGeometry().setFromPoints(pts);
                    const mat = new THREE.LineBasicMaterial({ color: wireColor, transparent: true, opacity: lineOpacity });
                    return new THREE.Line(geo, mat);
                });
        }
        for (let i = 1; i < BAND_COUNT; i++) {
            buildClippedWireLine(-hh + bandH * i, 0.5).forEach((line) => group.add(line));
        }

        group.position.copy(offset);
        return group;
    }

    const sceneGroup = new THREE.Group();
    scene.add(sceneGroup);

    const faceGroup = buildTerrain({
        width: FACE_WIDTH,
        height: FACE_HEIGHT,
        offset: new THREE.Vector3(0, 0, 0),
        noiseSeedVec: new THREE.Vector3(Math.random() * 1000, Math.random() * 1000, Math.random() * 1000),
        ridgeSeedVec: new THREE.Vector3(4.2, 7.8, 0),
        opacity: baseOpacity,
    });
    sceneGroup.add(faceGroup);

    // A second, bigger terrain behind the main one: 1.5x the size, shifted
    // left, sitting at the same VISUAL ground line as the main one (not
    // lifted) -- plus a touch less opacity, a simple depth/haze cue. Its Y
    // position depends on the camera's (dynamic, aspect-dependent) framing,
    // so it's set for real in updateFraming() below, not here.
    const backHeight = FACE_HEIGHT * 1.5;
    const backZ = -3;
    const backTerrain = buildTerrain({
        width: FACE_WIDTH * 1.5,
        height: backHeight,
        offset: new THREE.Vector3(-FACE_WIDTH * 0.35, 0, backZ),
        noiseSeedVec: new THREE.Vector3(Math.random() * 1000, Math.random() * 1000, Math.random() * 1000),
        ridgeSeedVec: new THREE.Vector3(9.1, 2.3, 0),
        opacity: baseOpacity * 0.85,
    });
    sceneGroup.add(backTerrain);

    /* =====================================================================
       RESPONSIVE FRAMING -- fit-width strategy: solves for the camera
       distance that keeps the main terrain's full WIDTH comfortably in
       frame at the CURRENT window aspect ratio (a fixed distance/FOV, as
       before, over-cropped severely on narrow/mobile aspect ratios, since
       horizontal FOV shrinks with aspect while vertical FOV stays fixed).
       Re-run on every resize; the background terrain's ground alignment is
       re-derived here too since it depends on the camera's own position.
       ===================================================================== */
    const TARGET_HALF_WIDTH = FACE_WIDTH * 0.62; // a little slack past the terrain's own half-width

    function updateFraming() {
        const aspect = window.innerWidth / window.innerHeight;
        camera.aspect = aspect;

        const distance = TARGET_HALF_WIDTH / (tanHalfFov * aspect);
        const visibleHalfHeight = distance * tanHalfFov;
        const cameraY = visibleHalfHeight - halfH;
        camera.position.set(0, cameraY, distance);
        camera.lookAt(0, cameraY, 0);
        camera.updateProjectionMatrix();

        backTerrain.position.y = frameBottomWorldYAtZ(backZ) + backHeight / 2;

        renderer.setSize(window.innerWidth, window.innerHeight);
    }
    updateFraming();
    window.addEventListener("resize", updateFraming);

    /* =====================================================================
       RENDER LOOP -- the wave-line animation (uTime) is the only motion,
       same as the cube at rest, PLUS the same mouse-parallax tilt the real
       cube has (CONFIG.cube.parallax in threejs.js): mouse position sets a
       target rotation, eased toward each frame rather than snapping.
       ===================================================================== */
    const PARALLAX_STRENGTH_X = 0.12; // vertical mouse movement -> tilt around X
    const PARALLAX_STRENGTH_Y = 0.18; // horizontal mouse movement -> turn around Y
    const PARALLAX_EASE = 0.06;
    let targetRotX = 0;
    let targetRotY = 0;

    window.addEventListener("mousemove", (e) => {
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        targetRotX = ny * PARALLAX_STRENGTH_X;
        targetRotY = nx * PARALLAX_STRENGTH_Y;
    });

    function animate() {
        requestAnimationFrame(animate);
        sharedTimeUniform.value = clock.getElapsedTime();

        sceneGroup.rotation.x += (targetRotX - sceneGroup.rotation.x) * PARALLAX_EASE;
        sceneGroup.rotation.y += (targetRotY - sceneGroup.rotation.y) * PARALLAX_EASE;

        renderer.render(scene, camera);
    }
    animate();
})();
