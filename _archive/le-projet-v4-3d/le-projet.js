/* Lightweight page interactions for le-projet.html: cursor-follow ring and
   scroll-reveal. The pinned 3D terrain scene lives in terrain-3d.js. */
(function () {
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
    // Scroll-reveal (hero / manifesto / cta).
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
})();
