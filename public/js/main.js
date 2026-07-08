document.addEventListener('DOMContentLoaded', () => {
  // Expandable table rows (sample-table--expandable): each ".sample-row" is
  // immediately followed by its own ".detail-row" — the pair is duplicated
  // together to add rows, so the detail row is found structurally (next
  // sibling) rather than by a hand-authored id, keeping the pair self-contained.
  document.querySelectorAll('.row-expand-btn').forEach((btn, index) => {
    const sampleRow = btn.closest('.sample-row');
    const detailRow = sampleRow && sampleRow.nextElementSibling;
    if (!detailRow || !detailRow.classList.contains('detail-row')) return;

    detailRow.id = detailRow.id || `detail-row-${index}`;
    btn.setAttribute('aria-controls', detailRow.id);

    btn.addEventListener('click', () => {
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isExpanded));
      detailRow.hidden = isExpanded;
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
});
