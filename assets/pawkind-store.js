class DaemyStore {
  constructor(root) {
    this.root = root;
    this.live = root.querySelector('[data-pk-live]');
    this.analyticsEnabled = root.dataset.pkAnalytics !== '0';
    this.bindVideos();
    this.bindVideoToggles();
    this.bindStickyCta();
    this.bindAjaxAdd();
    this.bindFaq();
    this.bindAnalytics();
    this.bindQuiz();
    this.bindVariantSelectors();
  }

  bindVariantSelectors() {
    this.root.querySelectorAll('.pk-card-form').forEach((form) => {
      const select = form.querySelector('[data-pk-variant-select]');
      const idInput = form.querySelector('[data-pk-variant-id]');
      if (!select || !idInput) return;
      select.addEventListener('change', () => {
        idInput.value = select.value;
        const opt = select.selectedOptions[0];
        this.track('variant_change', { variant_id: select.value, label: opt ? opt.textContent.trim().slice(0, 60) : '' });
      });
    });
  }

  track(name, detail = {}) {
    if (!this.analyticsEnabled) return;
    try {
      document.dispatchEvent(new CustomEvent('pk:analytics', { bubbles: true, detail: { name, ...detail } }));
      if (!this.consentAllowsMarketing()) {
        this.queueForConsent({ event: `pawkind_${name}`, ...detail });
        return;
      }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: `pawkind_${name}`, ...detail });
    } catch (_) {}
  }

  consentAllowsMarketing() {
    try {
      if (navigator.doNotTrack === '1') return false;
      const api = window.Shopify && window.Shopify.customerPrivacy;
      if (!api) return true;
      if (typeof api.shouldShowBanner === 'function' && typeof api.getTrackingConsent === 'function') {
        const consent = api.getTrackingConsent();
        const c = consent && typeof consent.then === 'function' ? null : consent;
        if (c != null) {
          if (typeof c === 'object') {
            const marketing = c.marketing ?? c.preferences?.marketing ?? c.purposes?.marketing;
            if (typeof marketing === 'boolean') return marketing;
          }
          if (typeof c === 'boolean') return c;
        }
        if (api.shouldShowBanner()) {
          this.waitForConsentFlush();
          return false;
        }
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  queueForConsent(payload) {
    try {
      window._pkQueue = window._pkQueue || [];
      window._pkQueue.push(payload);
      this.waitForConsentFlush();
    } catch (_) {}
  }

  waitForConsentFlush() {
    if (this._consentListenerAttached) return;
    this._consentListenerAttached = true;
    const flush = () => {
      try {
        const q = window._pkQueue || [];
        window._pkQueue = [];
        if (!q.length) return;
        window.dataLayer = window.dataLayer || [];
        q.forEach((p) => window.dataLayer.push(p));
      } catch (_) {}
    };
    ['trackingConsentChanged', 'visitorConsentCollected', 'shopify:trackingConsentChanged'].forEach((evt) => {
      document.addEventListener(evt, flush, { once: true });
    });
  }

  prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  bindVideos() {
    const videos = [...this.root.querySelectorAll('[data-pk-autoplay]')];
    if (!videos.length) return;

    videos.forEach((video) => {
      video.muted = true;
      video.defaultMuted = true;
      try {
        video.disablePictureInPicture = true;
        video.setAttribute('disableremoteplayback', '');
      } catch (_) {}
      if (this.prefersReducedMotion()) {
        video.autoplay = false;
        video.pause();
      }
    });

    if (this.prefersReducedMotion()) return;

    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.25 && !document.hidden) {
          if (video.paused && !video.dataset.userPaused) video.play().catch(() => {});
        } else if (!video.paused) {
          video.pause();
        }
        this.syncToggle(video);
      });
    }, { threshold: [0, 0.25, 0.6] });

    videos.forEach((video) => {
      observer.observe(video);
      video.addEventListener('play', () => this.syncToggle(video));
      video.addEventListener('pause', () => this.syncToggle(video));
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) videos.forEach((video) => video.pause());
    });
  }

  syncToggle(video) {
    const card = video.closest('.pk-video-card');
    const btn = card ? card.querySelector('[data-pk-video-toggle]') : null;
    if (!btn) return;
    const icon = btn.querySelector('span');
    if (icon) icon.textContent = video.paused ? '▶' : '❚❚';
    btn.setAttribute('aria-label', video.paused ? 'Play demo video' : 'Pause demo video');
    btn.setAttribute('aria-pressed', String(!video.paused));
  }

  bindVideoToggles() {
    this.root.querySelectorAll('[data-pk-video-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.pk-video-card');
        const video = card ? card.querySelector('video') : null;
        if (!video) return;
        if (video.paused) {
          delete video.dataset.userPaused;
          video.play().catch(() => {});
          this.track('video_play', { label: video.getAttribute('aria-label') || 'demo' });
        } else {
          video.dataset.userPaused = '1';
          video.pause();
          this.track('video_pause', { label: video.getAttribute('aria-label') || 'demo' });
        }
        this.syncToggle(video);
      });
    });
  }

  bindFaq() {
    const wrap = this.root.querySelector('[data-pk-faq]');
    if (!wrap) return;
    const items = [...wrap.querySelectorAll('details')];
    items.forEach((d, i) => {
      const summary = d.querySelector('summary');
      if (summary && !summary.hasAttribute('aria-expanded')) {
        summary.setAttribute('aria-expanded', d.open ? 'true' : 'false');
      }
      d.addEventListener('toggle', () => {
        if (summary) summary.setAttribute('aria-expanded', d.open ? 'true' : 'false');
        if (d.open) {
          this.track('faq_open', { index: i, question: summary ? summary.textContent.trim().slice(0, 80) : '' });
          if (wrap.dataset.pkSingle === '1') {
            items.forEach((other) => {
              if (other !== d && other.open) other.open = false;
            });
          }
        }
      });
    });
  }

  bindQuiz() {
    const quiz = this.root.querySelector('[data-pk-quiz]');
    if (!quiz) return;
    const form = quiz.querySelector('[data-pk-quiz-form]');
    const result = quiz.querySelector('[data-pk-quiz-result]');
    const next = quiz.querySelector('[data-pk-quiz-next]');
    const back = quiz.querySelector('[data-pk-quiz-back]');
    const retake = quiz.querySelector('[data-pk-quiz-retake]');
    const steps = [...quiz.querySelectorAll('[data-pk-step]')];
    const section = quiz.closest('.pk-quiz');
    const dots = section ? [...section.querySelectorAll('[data-pk-dot]')] : [];
    let current = 1;

    const show = (n) => {
      current = n;
      steps.forEach((s) => {
        s.hidden = Number(s.dataset.pkStep) !== n;
      });
      if (back) back.hidden = n === 1;
      if (next) next.textContent = n === steps.length ? 'See my match →' : 'Next →';
      dots.forEach((d) => d.classList.toggle('is-active', Number(d.dataset.pkDot) <= n));
    };

    const score = () => {
      const v = (name) => (form.querySelector(`input[name="${name}"]:checked`) || {}).value;
      let home = 0, detail = 0, set = 0;
      const surface = v('surface'), portable = v('portable'), shed = v('shed');
      if (surface === 'sofa') home += 2;
      else if (surface === 'car') { home += 1; set += 1; }
      else if (surface === 'clothes') detail += 2;
      else if (surface === 'everywhere') set += 2;
      if (portable === 'yes') { detail += 2; set += 1; }
      else if (portable === 'sometimes') set += 2;
      else if (portable === 'no') home += 2;
      if (shed === 'heavy') set += 2;
      else home += 1;
      return { home, detail, set };
    };

    const finish = () => {
      const { home, detail, set } = score();
      let key = 'set', title = 'Complete Cleaning Set', desc = 'Home Roller for sofas, rugs and car seats + Detail Brush for clothes and tight corners. Best value — you save vs buying separately.';
      if (set >= 3 && set >= home && set >= detail) {
        key = 'set';
      } else if (detail > home) {
        key = 'detail'; title = 'FurLift Detail Brush'; desc = 'Compact and portable for clothes, bags, travel and quick touchups. Grab it on your way out.';
      } else {
        key = 'home'; title = 'FurLift Home Roller'; desc = 'Wide self-cleaning roller for sofas, rugs, bedding and car seats. Your daily whole-room reset.';
      }
      const url = quiz.dataset[`${key}Url`] || quiz.dataset.shopAnchor || '#pk-shop';
      const titleEl = quiz.querySelector('[data-pk-quiz-title]');
      const descEl = quiz.querySelector('[data-pk-quiz-desc]');
      const cta = quiz.querySelector('[data-pk-quiz-cta]');
      if (titleEl) titleEl.textContent = title;
      if (descEl) descEl.textContent = desc;
      if (cta) {
        cta.href = url;
        cta.dataset.pkMatch = key;
        const label = cta.querySelector('span');
        if (label) label.textContent = url.startsWith('#') ? `Shop ${title}` : `View ${title}`;
      }
      form.hidden = true;
      if (result) {
        result.hidden = false;
        result.focus({ preventScroll: true });
      }
      const nav = quiz.querySelector('.pk-quiz__nav');
      if (nav) nav.hidden = true;
      this.track('quiz_complete', { match: key, home, detail, set });
    };

    let autoTimer = null;
    form.addEventListener('change', (e) => {
      if (!e.target.matches('input[type="radio"]')) return;
      const stepEl = e.target.closest('[data-pk-step]');
      const stepNum = stepEl ? Number(stepEl.dataset.pkStep) : current;
      clearTimeout(autoTimer);
      autoTimer = setTimeout(() => {
        if (stepNum < steps.length) show(stepNum + 1);
        else finish();
      }, 350);
    });

    if (next) next.addEventListener('click', () => {
      if (current < steps.length) show(current + 1);
      else finish();
    });
    if (back) back.addEventListener('click', () => show(Math.max(1, current - 1)));

    const cta = quiz.querySelector('[data-pk-quiz-cta]');
    if (cta) cta.addEventListener('click', (e) => {
      const href = cta.getAttribute('href') || '';
      const match = cta.dataset.pkMatch || 'set';
      if (!href.startsWith('#')) return;
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) target.scrollIntoView({ behavior: this.prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      const card = this.root.querySelector(`[data-pk-shop-key="${match}"]`) || document.querySelector(`[data-pk-shop-key="${match}"]`);
      if (card) {
        card.classList.add('pk-shop-card--highlight');
        card.setAttribute('tabindex', '-1');
        card.focus({ preventScroll: true });
        setTimeout(() => card.classList.remove('pk-shop-card--highlight'), 2600);
      }
      this.track('quiz_cta_click', { match });
    });
    if (retake) retake.addEventListener('click', () => {
      form.hidden = false;
      if (result) result.hidden = true;
      const nav = quiz.querySelector('.pk-quiz__nav');
      if (nav) nav.hidden = false;
      show(1);
    });
    show(1);
  }

  bindAnalytics() {
    this.root.querySelectorAll('[data-pk-cta]').forEach((el) => {
      el.addEventListener('click', () => {
        this.track('cta_click', { cta: el.dataset.pkCta, text: el.textContent.trim().slice(0, 60) });
      });
    });
    if (!('IntersectionObserver' in window)) return;
    const shop = this.root.querySelector('.pk-shop');
    if (shop) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.track('view_shop', {});
            io.disconnect();
          }
        });
      }, { threshold: 0.2 });
      io.observe(shop);
    }
  }

  bindStickyCta() {
    const sticky = this.root.querySelector('.pk-mobile-cta');
    const shop = this.root.querySelector('.pk-shop');
    if (!sticky || !shop || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      sticky.classList.toggle('is-hidden', entry.isIntersecting);
    }, { threshold: 0.1 });
    observer.observe(shop);
  }

  announce(msg) {
    if (this.live) this.live.textContent = msg;
  }

  async updateCartBubble() {
    try {
      const res = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const cart = await res.json();
      const count = cart.item_count || 0;
      document.querySelectorAll('[data-testid="cart-bubble"]').forEach((el) => {
        el.textContent = count > 99 ? '99+' : String(count);
        el.classList.toggle('hidden', count === 0);
      });
      document.querySelectorAll('.cart-bubble').forEach((el) => {
        el.classList.toggle('visually-hidden', count === 0);
      });
      document.querySelectorAll('.header-actions__cart-icon').forEach((el) => {
        el.classList.toggle('header-actions__cart-icon--has-cart', count > 0);
      });
      const live = document.querySelector('[data-testid="cart-count-live-region"]');
      if (live) live.textContent = `Cart: ${count} items`;
    } catch (_) {}
  }

  bindAjaxAdd() {
    this.root.querySelectorAll('.pk-card-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        if (e.submitter && !e.submitter.classList.contains('pk-add')) return;
        e.preventDefault();
        const btn = form.querySelector('.pk-add');
        const label = btn ? btn.querySelector('span') : null;
        const original = label ? label.textContent : '';
        if (btn) {
          btn.classList.add('is-loading');
          btn.disabled = true;
          if (label) label.textContent = 'Adding…';
        }
        try {
          const formData = new FormData(form);
          if (!formData.get('quantity')) formData.append('quantity', '1');
          const addRes = await fetch('/cart/add.js', {
            method: 'POST',
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: formData,
          });
          const data = await addRes.json().catch(() => ({}));
          if (!addRes.ok) throw new Error(data.description || data.message || 'Add failed');

          if (label) label.textContent = 'Added ✓';
          this.announce(`${data.product_title || 'Product'} added to cart.`);
          this.updateCartBubble();
          this.track('add_to_cart', {
            variant_id: String(formData.get('id') || ''),
            product: data.product_title || '',
            price: data.price || 0,
          });

          try {
            const secRes = await fetch(`${window.location.pathname}?sections=cart-drawer-section`, {
              headers: { Accept: 'application/json' },
            });
            if (secRes.ok) {
              const sections = await secRes.json();
              const html = sections['cart-drawer-section'];
              if (html) {
                const tmp = document.createElement('div');
                tmp.innerHTML = html;
                const fresh = tmp.querySelector('#shopify-section-cart-drawer-section');
                const current = document.getElementById('shopify-section-cart-drawer-section');
                if (fresh && current) current.replaceWith(fresh);
              }
            }
          } catch (_) {
            /* drawer refresh is progressive enhancement */
          }

          try {
            document.dispatchEvent(
              new CustomEvent('cart:lines:update', { bubbles: true, detail: { action: 'add' } })
            );
          } catch (_) {}

          const drawer = document.getElementById('cart-drawer');
          if (drawer && typeof drawer.open === 'function') {
            setTimeout(() => drawer.open(), 80);
          } else if (drawer) {
            drawer.setAttribute('open', '');
          }

          setTimeout(() => {
            if (btn) {
              btn.classList.remove('is-loading');
              btn.disabled = false;
              if (label) label.textContent = original;
            }
          }, 1800);
        } catch (err) {
          if (btn) {
            btn.classList.remove('is-loading');
            btn.disabled = false;
            if (label) label.textContent = original;
          }
          this.announce('Could not add to cart. Opening product page instead.');
          form.submit();
        }
      });
    });
  }
}

(function dedupeDaemyCss() {
  const links = [...document.querySelectorAll('link[href*="pawkind-store.css"]')];
  links.slice(1).forEach((l) => l.remove());
})();

document.querySelectorAll('[data-pk-store]').forEach((root) => new DaemyStore(root));

document.addEventListener('shopify:section:load', (event) => {
  event.target.querySelectorAll('[data-pk-store]').forEach((root) => new DaemyStore(root));
});
