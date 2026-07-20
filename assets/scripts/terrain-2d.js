/* =========================================================================
   TERRAIN 2D -- scratched and rebuilt flat, starting from literally one of
   the homepage cube's own side faces: a flat rectangle sliced into the
   cube's own horizontal strata bands (--cube-band-0..5) with a solid grass
   --cube-top-color cap along the top edge, a subtle per-band bevel
   gradient, animated horizontal "flowing wave" lines (2D stand-in for the
   cube's animated wave-line shader), and a stroked-edge + soft rim glow on
   the front layer's top edge (2D stand-in for the cube's fresnel rim).
   No mountain silhouette, no noise, no clipPath -- straight flat bands,
   like a cube face, just five of them stacked at different heights/depths
   for parallax. No plants.

   Movement is still horizontal (this project's own spin on Firewatch,
   whose site parallaxes on mouse move / vertical scroll): five layers
   translate sideways at different rates on one GSAP ScrollTrigger scrub,
   pinned while the user scrolls vertically through the section.
   ========================================================================= */
(function () {
    const container = document.querySelector(".terrain-2d");
    const sceneSection = document.querySelector(".terrain-scene");
    if (!container || !sceneSection) return;
    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;
    gsap.registerPlugin(ScrollTrigger);

    const SVG_NS = "http://www.w3.org/2000/svg";

    function getCSSColor(varName, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return value || fallback;
    }
    function hexToRgb(hex) {
        const m = hex.replace("#", "");
        const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
        const n = parseInt(full, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function rgbToHex(r, g, b) {
        return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    }
    function mixHex(hexA, hexB, t) {
        const a = hexToRgb(hexA);
        const b = hexToRgb(hexB);
        return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    }

    const topColor = getCSSColor("--cube-top-color", "#556b2f");
    const wireColor = getCSSColor("--cube-wire-color", "#3d2b1f");
    const rimColor = getCSSColor("--cube-rim-color", "#5c4033");
    const skyColor = "#dcece4"; // matches .terrain-scene's gradient midtone, for hazing distant layers

    // The cube's own bedrock-to-topsoil band ramp -- same "layers" as the
    // homepage cube, reused here instead of a bespoke gradient.
    const BAND_COLORS = [
        getCSSColor("--cube-band-0", "#2d1b12"),
        getCSSColor("--cube-band-1", "#4a3728"),
        getCSSColor("--cube-band-2", "#6b503d"),
        getCSSColor("--cube-band-3", "#8b6e56"),
        getCSSColor("--cube-band-4", "#a0846e"),
        getCSSColor("--cube-band-5", "#bda28b"),
    ];
    const BAND_COUNT = BAND_COLORS.length;

    // Five depth layers, back to front -- haze steps down toward the front
    // (0 = no haze, full strata contrast); topFrac is how far up the scene
    // each flat wall's top edge sits (bigger = taller wall, closer to
    // camera); only the front layer is "bordered" (cube-style stroked edge
    // + rim glow) and carries the waypoints/ripples.
    const LAYER_DEFS = [
        { key: "layer0", topFrac: 0.62, parallax: 0.12, haze: 0.78 },
        { key: "layer1", topFrac: 0.52, parallax: 0.28, haze: 0.58 },
        { key: "layer2", topFrac: 0.42, parallax: 0.46, haze: 0.38 },
        { key: "layer3", topFrac: 0.3, parallax: 0.68, haze: 0.18 },
        { key: "layer4", topFrac: 0.16, parallax: 1, haze: 0, interactive: true, bordered: true },
    ].map((def, i) => ({ ...def, className: `terrain-layer--${i}` }));

    const WORLD_WIDTH = 4600; // px, wider than any viewport so there's room to scroll across

    let layers = []; // built/rebuilt in layout()

    function el(tag, attrs) {
        const node = document.createElementNS(SVG_NS, tag);
        for (const k in attrs) node.setAttribute(k, attrs[k]);
        return node;
    }

    function buildLayerSVG(def, sceneHeight) {
        const baseline = sceneHeight;
        const topY = sceneHeight * (1 - def.topFrac);
        const wallHeight = baseline - topY;

        const svg = el("svg", {
            class: "terrain-layer-svg",
            width: WORLD_WIDTH,
            height: sceneHeight,
            viewBox: `0 0 ${WORLD_WIDTH} ${sceneHeight}`,
            preserveAspectRatio: "none",
        });
        const uid = Math.random().toString(36).slice(2, 8);
        const defs = el("defs", {});
        svg.appendChild(defs);

        const CAP_FRAC = 0.14; // thin grass cap along the top edge, like the cube's top face
        const capHeight = wallHeight * CAP_FRAC;
        const rockHeight = wallHeight - capHeight;
        const bandHeight = rockHeight / BAND_COUNT;

        // Rock strata -- flat rectangles, bottom (bedrock) to top (topsoil),
        // exactly like one column of the cube's own side-face bands.
        for (let b = 0; b < BAND_COUNT; b++) {
            const y = baseline - capHeight - bandHeight * (b + 1);
            const color = mixHex(BAND_COLORS[b], skyColor, def.haze);

            // Vertical light-to-dark gradient within each band -- a cheap
            // "tiny 3d" bevel so the strata read as having real thickness
            // instead of a flat printed stripe.
            const gradId = `terrain-bandgrad-${def.key}-${uid}-${b}`;
            const grad = el("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1" });
            grad.appendChild(el("stop", { offset: "0%", "stop-color": mixHex(color, "#ffffff", 0.3) }));
            grad.appendChild(el("stop", { offset: "100%", "stop-color": mixHex(color, "#000000", 0.2) }));
            defs.appendChild(grad);

            svg.appendChild(
                el("rect", { x: 0, y: y.toFixed(1), width: WORLD_WIDTH, height: (bandHeight + 0.5).toFixed(1), fill: `url(#${gradId})` })
            );

            // Flowing horizontal wave line through the middle of the band --
            // the cube's animated flowing wave-line shader, in 2D: a straight
            // line whose dashes slide sideways via CSS animation.
            const streakY = y + bandHeight * 0.5;
            svg.appendChild(
                el("line", {
                    class: "terrain-wave-streak",
                    x1: 0,
                    y1: streakY.toFixed(1),
                    x2: WORLD_WIDTH,
                    y2: streakY.toFixed(1),
                    stroke: mixHex("#ffffff", skyColor, Math.min(0.9, def.haze + 0.15)),
                    "stroke-width": "1.2",
                    "stroke-opacity": (0.4 * (1 - def.haze * 0.6)).toFixed(2),
                    "stroke-dasharray": "10 9",
                })
            );

            // Seam line at each band boundary, like the cube's boundary wires.
            if (b > 0) {
                svg.appendChild(
                    el("line", {
                        x1: 0,
                        y1: y.toFixed(1),
                        x2: WORLD_WIDTH,
                        y2: y.toFixed(1),
                        stroke: mixHex(wireColor, skyColor, def.haze * 0.7),
                        "stroke-width": "1",
                        "stroke-opacity": "0.55",
                    })
                );
            }
        }

        // Grass cap -- solid across the FULL top edge, like the cube's top
        // face, not just a sliver.
        const capColor = mixHex(topColor, skyColor, def.haze);
        const capGradId = `terrain-capgrad-${def.key}-${uid}`;
        const capGrad = el("linearGradient", { id: capGradId, x1: "0", y1: "0", x2: "0", y2: "1" });
        capGrad.appendChild(el("stop", { offset: "0%", "stop-color": mixHex(capColor, "#ffffff", 0.32) }));
        capGrad.appendChild(el("stop", { offset: "100%", "stop-color": mixHex(capColor, "#000000", 0.12) }));
        defs.appendChild(capGrad);
        svg.appendChild(
            el("rect", { x: 0, y: topY.toFixed(1), width: WORLD_WIDTH, height: (capHeight + 0.5).toFixed(1), fill: `url(#${capGradId})` })
        );

        // Front layer only: crisp stroked top edge + a soft wider glow behind
        // it, echoing the cube's stroked edges + fresnel rim -- back/mid
        // layers stay borderless so they read as hazy/distant.
        if (def.bordered) {
            svg.appendChild(
                el("line", {
                    x1: 0, y1: topY.toFixed(1), x2: WORLD_WIDTH, y2: topY.toFixed(1),
                    stroke: rimColor, "stroke-width": "7", "stroke-opacity": "0.4", class: "terrain-rim-glow",
                })
            );
            svg.appendChild(
                el("line", {
                    x1: 0, y1: topY.toFixed(1), x2: WORLD_WIDTH, y2: topY.toFixed(1),
                    stroke: wireColor, "stroke-width": "1.5", "stroke-opacity": "0.85",
                })
            );
        }

        return { svg, topY };
    }

    // ---------------------------------------------------------------------
    // Waypoints -- kept as the existing static markup (already-authored
    // copy), just reparented into the front layer's track so they inherit
    // its scroll-driven transform for free instead of needing a per-frame
    // projection loop. The front wall's top edge is flat, so they just sit
    // on it directly -- no peak-finding needed anymore.
    // ---------------------------------------------------------------------
    const waypointEls = Array.from(sceneSection.querySelectorAll(".terrain-waypoint"));
    const progressFill = sceneSection.querySelector(".terrain-progress-fill");
    const progressIndex = sceneSection.querySelector(".terrain-progress-index");

    let scrollTween = null;
    let waypointWorldX = [];

    function layout() {
        const sceneHeight = sceneSection.clientHeight;
        container.innerHTML = "";
        layers = LAYER_DEFS.map((def) => {
            const built = buildLayerSVG(def, sceneHeight);
            const wrap = document.createElement("div");
            wrap.className = `terrain-layer ${def.className}`;
            wrap.style.width = `${WORLD_WIDTH}px`;
            wrap.appendChild(built.svg);
            container.appendChild(wrap);
            return { ...built, def, wrap };
        });

        const front = layers[layers.length - 1];
        const frontTrack = front.wrap;

        waypointWorldX = [];
        waypointEls.forEach((elm, i) => {
            const progress = parseFloat(elm.dataset.progress) || i / Math.max(1, waypointEls.length - 1);
            const worldX = progress * (WORLD_WIDTH - 400) + 200;
            waypointWorldX[i] = worldX;
            elm.style.left = `${worldX}px`;
            elm.style.top = `${front.topY}px`;
            frontTrack.appendChild(elm);

            // layout() re-runs on resize and reattaches these same waypoint
            // nodes rather than recreating them, so guard against adding
            // duplicate ripple rings each time. Three staggered rings (cube's
            // ringCount) instead of one plain pulse.
            if (!elm.querySelector(".terrain-ripple")) {
                for (let r = 0; r < 3; r++) {
                    const ripple = document.createElement("span");
                    ripple.className = "terrain-ripple";
                    ripple.style.animationDelay = `${r * 0.12}s`;
                    elm.appendChild(ripple);
                }
            }
        });

        const maxDistance = WORLD_WIDTH - window.innerWidth;
        if (scrollTween) scrollTween.scrollTrigger.kill();
        const pinDistance = window.innerHeight * 3;
        // Animates a throwaway property -- the actual visual work happens in
        // onUpdate below, but scrub needs a real tweened value to smooth
        // against (an empty-object tween with nothing to animate isn't a
        // reliable way to get scrub's easing behavior).
        scrollTween = gsap.to(
            { p: 0 },
            {
                p: 1,
                duration: 1,
                ease: "none",
                scrollTrigger: {
                    trigger: sceneSection,
                    start: "top top",
                    end: "+=" + pinDistance,
                    scrub: 0.5,
                    pin: true,
                    anticipatePin: 1,
                    invalidateOnRefresh: true,
                    onUpdate: (self) => {
                        layers.forEach((layer) => {
                            const dist = maxDistance * layer.def.parallax;
                            layer.wrap.style.transform = `translate3d(${(-self.progress * dist).toFixed(1)}px,0,0)`;
                        });
                        if (progressFill) progressFill.style.width = `${self.progress * 100}%`;
                        if (progressIndex) {
                            const step = Math.min(
                                waypointEls.length,
                                Math.max(1, Math.ceil(self.progress * waypointEls.length))
                            );
                            progressIndex.textContent = String(step).padStart(2, "0");
                        }
                        const frontProgressPx = self.progress * maxDistance;
                        waypointEls.forEach((elm, i) => {
                            const reachedX = frontProgressPx + window.innerWidth * 0.5;
                            const active = reachedX >= waypointWorldX[i];
                            if (active && !elm.classList.contains("is-passed")) {
                                elm.classList.add("is-passed");
                                elm.querySelectorAll(".terrain-ripple").forEach((ripple) => {
                                    ripple.classList.remove("is-pulsing");
                                    void ripple.offsetWidth; // restart the CSS animation
                                    ripple.classList.add("is-pulsing");
                                });
                            } else if (!active && elm.classList.contains("is-passed")) {
                                elm.classList.remove("is-passed");
                            }
                        });
                    },
                },
            }
        );
    }

    layout();

    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            layout();
            ScrollTrigger.refresh();
        }, 200);
    });
})();
