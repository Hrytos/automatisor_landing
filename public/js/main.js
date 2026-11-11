document.addEventListener('DOMContentLoaded', () => {
  // Hero carousel: shows one [data-carousel-slide] at a time, driven by the
  // prev/next arrows and dots. Auto-advances every 6s, pausing while the
  // pointer or keyboard focus is inside, and not at all for reduced motion.
  document.querySelectorAll('[data-carousel]').forEach((carousel) => {
    const slides = [...carousel.querySelectorAll('[data-carousel-slide]')];
    const dots = [...carousel.querySelectorAll('[data-carousel-dot]')];
    if (slides.length < 2) return;
    let current = slides.findIndex((s) => s.classList.contains('is-active'));
    if (current < 0) current = 0;

    const show = (index) => {
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        const active = i === current;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
        slide.inert = !active;
      });
      dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === current);
        dot.setAttribute('aria-current', i === current ? 'true' : 'false');
      });
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let timer = null;
    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => {
      if (reduceMotion || timer) return;
      timer = setInterval(() => show(current + 1), 6000);
    };

    carousel.querySelector('[data-carousel-prev]')?.addEventListener('click', () => { show(current - 1); stop(); start(); });
    carousel.querySelector('[data-carousel-next]')?.addEventListener('click', () => { show(current + 1); stop(); start(); });
    dots.forEach((dot, i) => dot.addEventListener('click', () => { show(i); stop(); start(); }));
    carousel.addEventListener('mouseenter', stop);
    carousel.addEventListener('mouseleave', start);
    carousel.addEventListener('focusin', stop);
    carousel.addEventListener('focusout', start);

    show(current);
    start();
  });

  // Expandable table rows (sample-table--expandable): each ".sample-row" is
  // immediately followed by its own ".detail-row" — the pair is duplicated
  // together to add rows, so the detail row is found structurally (next
  // sibling) rather than by a hand-authored id, keeping the pair self-contained.
  // Only one row per table may be expanded at a time — opening one closes
  // whichever else was open.
  document.querySelectorAll('.sample-table--expandable').forEach((table) => {
    const closers = [];

    table.querySelectorAll('.row-expand-btn').forEach((btn, index) => {
      const sampleRow = btn.closest('.sample-row');
      const detailRow = sampleRow && sampleRow.nextElementSibling;
      if (!detailRow || !detailRow.classList.contains('detail-row')) return;

      detailRow.id = detailRow.id || `detail-row-${index}`;
      btn.setAttribute('aria-controls', detailRow.id);

      const close = () => {
        btn.setAttribute('aria-expanded', 'false');
        detailRow.hidden = true;
        sampleRow.classList.remove('is-expanded');
        detailRow.classList.remove('is-expanded');
      };
      const open = () => {
        closers.forEach((otherClose) => { if (otherClose !== close) otherClose(); });
        btn.setAttribute('aria-expanded', 'true');
        detailRow.hidden = false;
        sampleRow.classList.add('is-expanded');
        detailRow.classList.add('is-expanded');
      };
      closers.push(close);

      btn.addEventListener('click', () => {
        const isExpanded = btn.getAttribute('aria-expanded') === 'true';
        isExpanded ? close() : open();
      });
    });
  });

  // Pricing: Monthly / Yearly toggle swaps which .pricing-amount-variant is
  // shown and highlights the matching toggle button. The toggle sits outside
  // the individual pricing cards (one toggle drives every card in the
  // section), so it's scoped to the whole .pricing-section rather than a
  // single .pricing-card. Cards without a toggle-driven price (e.g. "Custom
  // pricing" cards) simply have no [data-pricing-amount] to match.
  document.querySelectorAll('[data-pricing-toggle]').forEach((toggle) => {
    const scope = toggle.closest('.pricing-section') || document;
    const amounts = scope.querySelectorAll('[data-pricing-amount] .pricing-amount-variant');

    toggle.querySelectorAll('.pricing-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const period = btn.dataset.period;

        toggle.querySelectorAll('.pricing-toggle-btn').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
        });
        amounts.forEach((amount) => {
          amount.hidden = amount.dataset.period !== period;
        });
      });
    });
  });

  // Header "Solutions" dropdown: toggles on click, closes on outside click or Escape.
  document.querySelectorAll('.nav-dropdown').forEach((dropdown) => {
    const trigger = dropdown.querySelector('.nav-dropdown-trigger');
    const menu = dropdown.querySelector('.nav-dropdown-menu');
    if (!trigger || !menu) return;

    const close = () => {
      trigger.setAttribute('aria-expanded', 'false');
      menu.hidden = true;
    };
    const open = () => {
      trigger.setAttribute('aria-expanded', 'true');
      menu.hidden = false;
    };

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = trigger.getAttribute('aria-expanded') === 'true';
      isOpen ? close() : open();
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  });

  // Mobile hamburger menu: toggles on click, closes on outside click,
  // Escape, or navigating away via a menu link.
  document.querySelectorAll('.site-header').forEach((header) => {
    const trigger = header.querySelector('.mobile-menu-trigger');
    const menu = header.querySelector('.mobile-nav');
    if (!trigger || !menu) return;

    const close = () => {
      trigger.setAttribute('aria-expanded', 'false');
      menu.hidden = true;
    };
    const open = () => {
      trigger.setAttribute('aria-expanded', 'true');
      menu.hidden = false;
    };

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = trigger.getAttribute('aria-expanded') === 'true';
      isOpen ? close() : open();
    });

    menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));

    document.addEventListener('click', (e) => {
      if (!header.contains(e.target)) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  });

  // Mobile nav accordions (Solutions / Product): each trigger button shows
  // or hides its own sibling panel. Independent of one another — opening
  // one doesn't close the others.
  document.querySelectorAll('.mobile-nav-section-trigger').forEach((btn) => {
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;

    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isOpen));
      panel.hidden = isOpen;
    });
  });

  // FAQ accordions: only one question per list may be open at a time —
  // opening one closes whichever else was open.
  document.querySelectorAll('[data-faq-list]').forEach((list) => {
    const closers = [];

    list.querySelectorAll('.faq-question').forEach((btn) => {
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;

      const close = () => {
        btn.setAttribute('aria-expanded', 'false');
        panel.hidden = true;
      };
      const open = () => {
        closers.forEach((otherClose) => { if (otherClose !== close) otherClose(); });
        btn.setAttribute('aria-expanded', 'true');
        panel.hidden = false;
      };
      closers.push(close);

      btn.addEventListener('click', () => {
        const isOpen = btn.getAttribute('aria-expanded') === 'true';
        isOpen ? close() : open();
      });
    });
  });

  // Hero badge-pill: tapping it opens a small overlay with the two persona
  // cards. The trigger itself is hidden via CSS on every breakpoint now
  // (was mobile-only), so this is effectively dormant — left wired in case
  // the trigger is reinstated later. The overlay is also hidden via CSS
  // above the mobile breakpoint as a second guard.
  const isMobileLayout = () => window.matchMedia('(max-width: 960px)').matches;
  const badgeTrigger = document.getElementById('hero-badge-trigger');
  const overlay = document.getElementById('persona-overlay');

  if (badgeTrigger && overlay) {
    const closeOverlay = () => { overlay.hidden = true; };
    const openOverlay = () => { overlay.hidden = false; };

    badgeTrigger.addEventListener('click', () => {
      if (!isMobileLayout()) return;
      openOverlay();
    });

    overlay.querySelectorAll('[data-persona-overlay-close]').forEach((el) => {
      el.addEventListener('click', closeOverlay);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeOverlay();
    });

    window.addEventListener('resize', () => {
      if (!isMobileLayout()) closeOverlay();
    });
  }
});
