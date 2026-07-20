/* Interactions for le-projet.html: cursor-follow ring, scroll-reveal, and
   the strata diagram <-> annotation hover sync. */
(function () {
    // Cursor-follow ring, eased toward the pointer each frame.
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

    // Scroll parallax -- each [data-parallax] element shifts vertically in
    // proportion to how far its center sits from the viewport center, times
    // its own speed factor. Negative speed = drifts the opposite way (used
    // on the strata diagram so it lags behind its annotation column).
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

    // Scroll-reveal.
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

    // Strata diagram <-> annotation hover sync (matched via data-band).
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
