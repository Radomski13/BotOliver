/* Click-to-enlarge photo viewer.
   Lightbox.open(['url1', 'url2'], startIndex, 'Product name')
   Uses a <dialog> so it shows above other open windows (like the buy menu). */
(function () {
    let dialog, img, counter, prevBtn, nextBtn, caption;
    let images = [];
    let index = 0;

    function build() {
        const style = document.createElement('style');
        style.textContent = `
            .lb-dialog { padding: 0; border: none; background: transparent; max-width: 100vw; max-height: 100vh;
                width: 100vw; height: 100vh; margin: 0; overflow: hidden; }
            .lb-dialog::backdrop { background: rgba(0, 0, 0, 0.88); }
            .lb-dialog[open] { display: flex; align-items: center; justify-content: center; }
            .lb-stage { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
            .lb-img { max-width: calc(100vw - 32px); max-height: calc(100vh - 90px); object-fit: contain;
                box-shadow: 0 8px 40px rgba(0,0,0,.6); background: #1b1d18; user-select: none; }
            .lb-btn { position: absolute; background: rgba(20, 24, 18, 0.75); color: #dedfd6; border: 1px solid #8c9284;
                font: 28px/1 Arial, sans-serif; width: 48px; height: 48px; cursor: pointer; display: flex;
                align-items: center; justify-content: center; }
            .lb-btn:hover { color: #c4b550; border-color: #c4b550; }
            .lb-close { top: 12px; right: 12px; }
            .lb-prev { left: 12px; top: 50%; transform: translateY(-50%); }
            .lb-next { right: 12px; top: 50%; transform: translateY(-50%); }
            .lb-bottom { position: absolute; bottom: 14px; left: 0; right: 0; text-align: center; color: #dedfd6;
                font: 15px/1.3 Arial, sans-serif; text-shadow: 1px 1px 0 #000; pointer-events: none; }
            @media (max-width: 600px) {
                .lb-btn { width: 40px; height: 40px; font-size: 22px; }
                .lb-prev { left: 6px; } .lb-next { right: 6px; }
                .lb-img { max-width: 100vw; }
            }
            .zoomable { cursor: zoom-in; }
        `;
        document.head.appendChild(style);

        dialog = document.createElement('dialog');
        dialog.className = 'lb-dialog';
        dialog.setAttribute('aria-label', 'Photo viewer');
        dialog.innerHTML = `
            <div class="lb-stage">
                <img class="lb-img" alt="">
                <button type="button" class="lb-btn lb-close" aria-label="Close">&times;</button>
                <button type="button" class="lb-btn lb-prev" aria-label="Previous photo">&#8249;</button>
                <button type="button" class="lb-btn lb-next" aria-label="Next photo">&#8250;</button>
                <div class="lb-bottom"><span class="lb-caption"></span> <span class="lb-counter"></span></div>
            </div>`;
        document.body.appendChild(dialog);

        img = dialog.querySelector('.lb-img');
        counter = dialog.querySelector('.lb-counter');
        caption = dialog.querySelector('.lb-caption');
        prevBtn = dialog.querySelector('.lb-prev');
        nextBtn = dialog.querySelector('.lb-next');

        dialog.querySelector('.lb-close').addEventListener('click', close);
        prevBtn.addEventListener('click', (e) => { e.stopPropagation(); show(index - 1); });
        nextBtn.addEventListener('click', (e) => { e.stopPropagation(); show(index + 1); });
        // Click on the dark area closes.
        dialog.querySelector('.lb-stage').addEventListener('click', (e) => { if (e.target.classList.contains('lb-stage')) close(); });
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') show(index - 1);
            if (e.key === 'ArrowRight') show(index + 1);
        });

        // Swipe on phones.
        let startX = null;
        dialog.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
        dialog.addEventListener('touchend', (e) => {
            if (startX === null) return;
            const dx = e.changedTouches[0].clientX - startX;
            if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
            startX = null;
        });
    }

    function show(i) {
        if (!images.length) return;
        index = (i + images.length) % images.length;
        img.src = images[index];
        const many = images.length > 1;
        prevBtn.hidden = nextBtn.hidden = !many;
        counter.textContent = many ? `${index + 1} / ${images.length}` : '';
    }

    function open(list, start = 0, alt = '') {
        list = (list || []).filter(Boolean);
        if (!list.length) return;
        if (!dialog) build();
        images = list;
        img.alt = alt;
        caption.textContent = alt;
        show(start);
        if (!dialog.open) dialog.showModal();
    }

    function close() {
        if (dialog && dialog.open) dialog.close();
    }

    window.Lightbox = { open, close };
})();
