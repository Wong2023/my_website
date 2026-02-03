      // Certificate Image Modal/Lightbox
        const modal = document.getElementById('certificateModal');
        const modalImg = document.getElementById('modalImage');
        const modalCaption = document.getElementById('modalCaption');
        const closeBtn = document.querySelector('.modal-close');
        let hoverTimeout;

        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        document.querySelectorAll('.certificate-image img').forEach(img => {
            img.style.cursor = 'pointer';
            
            if (!isTouchDevice) {
                img.addEventListener('mouseenter', function() {
                    hoverTimeout = setTimeout(() => {
                        modal.style.display = 'flex';
                        modalImg.src = this.src;
                        modalCaption.textContent = this.alt;
                        document.body.style.overflow = 'hidden';
                    }, 300);
                });

                img.addEventListener('mouseleave', function() {
                    clearTimeout(hoverTimeout);
                });
            } else {
                img.addEventListener('click', function() {
                    modal.style.display = 'flex';
                    modalImg.src = this.src;
                    modalCaption.textContent = this.alt;
                    document.body.style.overflow = 'hidden';
                });
            }
        });

        closeBtn.addEventListener('click', function() {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        });

        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });

        if (!isTouchDevice) {
            modal.addEventListener('mouseleave', function() {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            });
        }
    