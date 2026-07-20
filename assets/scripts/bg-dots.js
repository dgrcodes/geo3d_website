/* Standalone background dot grid -- same look as the accueil page's cube
   background, but without pulling in three.js. Used on pages (like jouer.html)
   that don't need the interactive 3D cube. Values mirror CONFIG.background.dots
   in threejs.js. */
(function () {
    const DOTS = { size: 1.5, spacing: 48, opacityMin: 0.12, opacityMax: 0.45 };
    const CELLS_PER_TILE = 6;

    function getCSSColor(varName, fallback) {
        const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return val || fallback;
    }

    function buildDotGridTexture() {
        const { size, spacing, opacityMin, opacityMax } = DOTS;
        const color = getCSSColor("--bg-dot-color", "#3d2b1f");
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const tileSizePx = spacing * CELLS_PER_TILE;

        const tileCanvas = document.createElement("canvas");
        tileCanvas.width = tileSizePx * dpr;
        tileCanvas.height = tileSizePx * dpr;
        const ctx = tileCanvas.getContext("2d");
        ctx.fillStyle = color;

        for (let row = 0; row < CELLS_PER_TILE; row++) {
            for (let col = 0; col < CELLS_PER_TILE; col++) {
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
    document.body.insertBefore(bgDots, document.body.firstChild);

    // Mouse parallax -- same feel as the cube's own background parallax on
    // the homepage (CONFIG.background.dotParallax in threejs.js), reproduced
    // here so pages without the 3D cube still get the shifting depth cue.
    const PARALLAX_STRENGTH = 18;
    const PARALLAX_EASE = 0.05;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    window.addEventListener("mousemove", (e) => {
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        targetX = -nx * PARALLAX_STRENGTH;
        targetY = -ny * PARALLAX_STRENGTH;
    });

    function tickDotParallax() {
        currentX += (targetX - currentX) * PARALLAX_EASE;
        currentY += (targetY - currentY) * PARALLAX_EASE;
        bgDots.style.transform = `translate3d(${currentX.toFixed(1)}px, ${currentY.toFixed(1)}px, 0)`;
        requestAnimationFrame(tickDotParallax);
    }
    requestAnimationFrame(tickDotParallax);
})();
