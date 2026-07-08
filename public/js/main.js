document.addEventListener('DOMContentLoaded', () => {
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

  // Hero badge-pill (mobile only): tapping it opens a small overlay with
  // the two persona cards. Inert on desktop — the trigger's click handler
  // no-ops above the mobile breakpoint, and the overlay itself is hidden
  // there via CSS as a second guard.
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

    // Shown by default on first load, mobile only — but just once per
    // session, not on every page (persona links are real navigations, so
    // without this it would reopen every time the visitor picks one).
    const AUTO_SHOWN_KEY = 'automatisor:personaOverlayShown';
    let alreadyAutoShown = true;
    try {
      alreadyAutoShown = sessionStorage.getItem(AUTO_SHOWN_KEY) === '1';
    } catch (e) {
      // Storage inaccessible (e.g. privacy mode) — fall back to not auto-showing.
    }
    if (isMobileLayout() && !alreadyAutoShown) {
      openOverlay();
      try {
        sessionStorage.setItem(AUTO_SHOWN_KEY, '1');
      } catch (e) {
        // Ignore — worst case it shows again on the next page.
      }
    }
  }
});
