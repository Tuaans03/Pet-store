class PawKindStore {
  constructor(root) {
    this.root = root;
    this.bindVideos();
    this.bindStickyCta();
  }

  bindVideos() {
    const videos = [...this.root.querySelectorAll('[data-pk-autoplay]')];
    if (!videos.length) return;

    videos.forEach((video) => {
      video.muted = true;
      video.defaultMuted = true;
    });

    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.38 && !document.hidden) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    }, { threshold: [0, 0.38, 0.75] });

    videos.forEach((video) => observer.observe(video));

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) videos.forEach((video) => video.pause());
    });
  }

  bindStickyCta() {
    const sticky = this.root.querySelector('.pk-mobile-cta');
    const shop = this.root.querySelector('.pk-shop');
    if (!sticky || !shop || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      sticky.classList.toggle('is-hidden', entry.isIntersecting);
    }, { threshold: 0.12 });
    observer.observe(shop);
  }
}

document.querySelectorAll('[data-pk-store]').forEach((root) => new PawKindStore(root));

document.addEventListener('shopify:section:load', (event) => {
  event.target.querySelectorAll('[data-pk-store]').forEach((root) => new PawKindStore(root));
});
