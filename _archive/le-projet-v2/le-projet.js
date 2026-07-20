/* Interactions for le-projet.html: constellation background, wireframe globe
   tilt, cursor-follow ring, scroll parallax/reveal, and the strata diagram
   <-> annotation hover sync. */
(function () {
    // ---------------------------------------------------------------------
    // Constellation network -- drifting nodes, connected by lines when close
    // enough, with a slow parallax shift toward the pointer for depth.
    // ---------------------------------------------------------------------
    const canvas = document.createElement("canvas");
    canvas.className = "constellation";
    document.body.insertBefore(canvas, document.body.firstChild);
    const ctx = canvas.getContext("2d");

    const NODE_COUNT = 70;
    const LINK_DIST = 130;
    const PARALLAX_STRENGTH = 24;
    let nodes = [];
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let panX = 0;
    let panY = 0;
    let panTargetX = 0;
    let panTargetY = 0;

    function resizeCanvas() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = window.innerWidth + "px";
        canvas.style.height = window.innerHeight + "px";
    }

    function seedNodes() {
        nodes = Array.from({ length: NODE_COUNT }, () => ({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            vx: (Math.random() - 0.5) * 0.15,
            vy: (Math.random() - 0.5) * 0.15,
        }));
    }

    resizeCanvas();
    seedNodes();
    window.addEventListener("resize", () => {
        resizeCanvas();
        seedNodes();
    });

    window.addEventListener("mousemove", (e) => {
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        panTargetX = -nx * PARALLAX_STRENGTH;
        panTargetY = -ny * PARALLAX_STRENGTH;
    });

    function stepConstellation() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        panX += (panTargetX - panX) * 0.04;
        panY += (panTargetY - panY) * 0.04;

        nodes.forEach((n) => {
            n.x += n.vx;
            n.y += n.vy;
            if (n.x < 0 || n.x > w) n.vx *= -1;
            if (n.y < 0 || n.y > h) n.vy *= -1;
            n.x = Math.min(Math.max(n.x, 0), w);
            n.y = Math.min(Math.max(n.y, 0), h);
        });

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.translate(panX, panY);

        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const dx = nodes[i].x - nodes[j].x;
                const dy = nodes[i].y - nodes[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < LINK_DIST) {
                    ctx.strokeStyle = `rgba(236, 238, 240, ${0.16 * (1 - dist / LINK_DIST)})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(nodes[i].x, nodes[i].y);
                    ctx.lineTo(nodes[j].x, nodes[j].y);
                    ctx.stroke();
                }
            }
        }
        nodes.forEach((n) => {
            ctx.fillStyle = "rgba(236, 238, 240, 0.55)";
            ctx.beginPath();
            ctx.arc(n.x, n.y, 1.4, 0, Math.PI * 2);
            ctx.fill();
        });

        requestAnimationFrame(stepConstellation);
    }
    requestAnimationFrame(stepConstellation);

    // ---------------------------------------------------------------------
    // Grain overlay -- static, purely CSS-driven div (see .grain-overlay).
    // ---------------------------------------------------------------------
    const grain = document.createElement("div");
    grain.className = "grain-overlay";
    document.body.appendChild(grain);

    // ---------------------------------------------------------------------
    // Wireframe globe -- continuous auto-spin is handled in CSS; this layer
    // adds a pointer-driven tilt on top of it.
    // ---------------------------------------------------------------------
    const globeTilt = document.querySelector(".globe-tilt");
    let globeTargetRX = 0;
    let globeTargetRY = 0;
    let globeRX = 0;
    let globeRY = 0;

    if (globeTilt) {
        window.addEventListener("mousemove", (e) => {
            const nx = e.clientX / window.innerWidth - 0.5;
            const ny = e.clientY / window.innerHeight - 0.5;
            globeTargetRY = nx * 40;
            globeTargetRX = -ny * 30;
        });

        (function tickGlobe() {
            globeRX += (globeTargetRX - globeRX) * 0.05;
            globeRY += (globeTargetRY - globeRY) * 0.05;
            globeTilt.style.transform = `rotateX(${globeRX.toFixed(2)}deg) rotateY(${globeRY.toFixed(2)}deg)`;
            requestAnimationFrame(tickGlobe);
        })();
    }

    // ---------------------------------------------------------------------
    // Cursor-follow ring, eased toward the pointer each frame.
    // ---------------------------------------------------------------------
    const ring = document.createElement("div");
    ring.className = "cursor-ring";
    document.body.appendChild(ring);

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;

    window.addEventListener("mousemove", (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        ring.style.opacity = "0.6";
    });
    window.addEventListener("mouseleave", () => {
        ring.style.opacity = "0";
    });

    function tickRing() {
        ringX += (mouseX - ringX) * 0.18;
        ringY += (mouseY - ringY) * 0.18;
        ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
        requestAnimationFrame(tickRing);
    }
    requestAnimationFrame(tickRing);

    // ---------------------------------------------------------------------
    // Scroll parallax -- each [data-parallax] element shifts vertically in
    // proportion to how far its center sits from the viewport center, times
    // its own speed factor. Negative speed = drifts the opposite way (used
    // on the strata diagram so it lags behind its annotation column).
    // ---------------------------------------------------------------------
    const parallaxItems = Array.from(document.querySelectorAll("[data-parallax]")).map((el) => ({
        el,
        speed: parseFloat(el.dataset.parallax) || 0,
    }));

    function tickParallax() {
        const viewportCenter = window.innerHeight / 2;
        parallaxItems.forEach(({ el, speed }) => {
            const rect = el.getBoundingClientRect();
            const elCenter = rect.top + rect.height / 2;
            const offset = (viewportCenter - elCenter) * speed;
            el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
        });
        requestAnimationFrame(tickParallax);
    }
    requestAnimationFrame(tickParallax);

    // ---------------------------------------------------------------------
    // Scroll-reveal.
    // ---------------------------------------------------------------------
    const revealItems = document.querySelectorAll(".reveal");
    const revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("in-view");
                    revealObserver.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.15 }
    );
    revealItems.forEach((el) => revealObserver.observe(el));

    // ---------------------------------------------------------------------
    // Strata diagram <-> annotation hover sync (matched via data-band).
    // ---------------------------------------------------------------------
    const bands = document.querySelectorAll(".strata-band");
    const rows = document.querySelectorAll(".strata-annotations li");

    function setActive(bandValue, active) {
        bands.forEach((b) => {
            if (b.dataset.band === bandValue) b.classList.toggle("is-active", active);
        });
        rows.forEach((r) => {
            if (r.dataset.band === bandValue) r.classList.toggle("is-active", active);
        });
    }

    bands.forEach((band) => {
        band.addEventListener("mouseenter", () => setActive(band.dataset.band, true));
        band.addEventListener("mouseleave", () => setActive(band.dataset.band, false));
    });
    rows.forEach((row) => {
        row.addEventListener("mouseenter", () => setActive(row.dataset.band, true));
        row.addEventListener("mouseleave", () => setActive(row.dataset.band, false));
    });
})();
