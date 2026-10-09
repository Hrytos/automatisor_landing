// "Build your Ideal Facility Profile" tool — views/ideal-facility-profile.ejs.
//
// This is UI only. Every decision point marked "API DECISION" below is where
// a real backend call belongs in production — which solutions a domain maps
// to, which good-fit/bad-fit examples and final Ideal Facility Profiles to
// generate, and whether a clarifying question is needed (and what it should
// ask). All of that is mocked here with static data so the front end can be
// built and reviewed independently of that service.

document.addEventListener('DOMContentLoaded', () => {
  const tool = document.querySelector('[data-ifp-tool]');
  if (!tool) return;

  // ---- Mock data (stands in for the backend's responses) ----------------
  const SOLUTIONS = [
    {
      name: 'Automated Storage & Retrieval (AS/RS)',
      description: 'High-density robotic storage and retrieval systems for pallet and case-level inventory.',
    },
    {
      name: 'Conveyor & Sortation Systems',
      description: 'Automated material flow and parcel/case sortation across receiving, picking and shipping.',
    },
    {
      name: 'Robotic Piece Picking',
      description: 'Vision-guided robotic arms for SKU-level picking in fulfillment operations.',
    },
    {
      name: 'Warehouse Execution Software',
      description: 'Orchestration layer that coordinates automation, labor and inventory in real time.',
    },
  ];

  const PROFILES = [
    'Multi-shift fulfillment centers (200k+ sq ft) with picking throughput above 1,000 units/hour',
    'Cross-dock distribution centers running 2+ shifts with dedicated returns processing',
    '3PL-operated facilities with multi-tenant WMS integration and client-facing portals',
    'Facilities with active job postings for automation technicians or robotics operators',
    'Sites reporting labor strain signals — high overtime, elevated turnover, or chronic understaffing',
  ];

  const GOOD_FIT_EXAMPLES = [
    'Multi-shift fulfillment center (200k+ sq ft) with picking throughput above 1,000 units/hour',
    'Cross-dock distribution center running 2+ shifts with a dedicated returns processing bay',
    '3PL-operated facility with multi-tenant WMS integration and client-facing portals',
  ];

  const BAD_FIT_EXAMPLES = [
    'Single-shift facility under 50k sq.ft with no automation signals',
    'Last-mile delivery hub with no case-level picking operations',
    'Facility with no active job postings or recent hiring signals, indicating stagnant operations',
  ];

  // API DECISION: which questions (if any — up to 5) are worth asking, and
  // what their options should be, is decided by the backend per-session.
  // Fixed here so the accordion UI can be built independently of that.
  const CLARIFY_QUESTIONS = [
    { text: 'Does your solution require dock-high loading doors?', options: ['Yes', 'No', 'Not sure'] },
    { text: "What's the minimum facility size your solution needs?", options: ['Under 50k sq ft', '50k–150k sq ft', '150k–300k sq ft', '300k+ sq ft'] },
    { text: 'Does your solution require multi-shift operations?', options: ['Yes, 2+ shifts', 'Single shift is fine', 'Not sure'] },
    { text: 'Is dedicated client/customer signage on-site a signal you care about?', options: ['Yes', 'No', 'Not sure'] },
    { text: 'Should we prioritize facilities with recent automation-related job postings?', options: ['Yes, strongly', 'Somewhat', 'No preference'] },
  ];

  // ---- Step navigation ----------------------------------------------------
  const steps = tool.querySelectorAll('[data-ifp-step]');
  const stepDots = tool.querySelectorAll('[data-step-dot]');

  function goToStep(n) {
    steps.forEach((step) => {
      const isTarget = step.dataset.ifpStep === String(n);
      step.hidden = !isTarget;
      step.classList.toggle('is-active', isTarget);
    });
    stepDots.forEach((dot) => {
      const dotStep = Number(dot.dataset.stepDot);
      dot.classList.toggle('is-active', dotStep === n);
      dot.classList.toggle('is-done', dotStep < n);
    });
  }

  tool.querySelectorAll('[data-ifp-back]').forEach((btn) => {
    btn.addEventListener('click', () => goToStep(Number(btn.dataset.ifpBack)));
  });

  // ---- Step 1: company website --------------------------------------------
  const websiteForm = tool.querySelector('[data-ifp-website-form]');
  const websiteInput = tool.querySelector('[data-ifp-website-input]');
  const domainLabel = tool.querySelector('[data-ifp-domain-label]');
  const solutionList = tool.querySelector('[data-ifp-solution-list]');

  websiteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const domain = websiteInput.value.trim() || 'your website';
    if (domainLabel) domainLabel.textContent = domain;

    // API DECISION: which solutions does this domain actually offer? Mocked
    // with a fixed list (max 4) here — swap renderSolutions() to use the
    // backend's response once it exists.
    renderSolutions();
    goToStep(2);
  });

  function renderSolutions() {
    solutionList.innerHTML = '';
    SOLUTIONS.forEach((solution, index) => {
      const card = document.createElement('div');
      card.className = 'ifp-solution-card';
      card.innerHTML = `
        <div class="ifp-solution-head">
          <label class="ifp-solution-select">
            <input type="radio" name="ifp-solution" value="${index}">
            <span class="ifp-solution-name">${solution.name}</span>
          </label>
          <button type="button" class="ifp-solution-expand" aria-expanded="false">
            <svg class="chevron" width="12" height="7" viewBox="0 0 12 7" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1l5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="ifp-solution-desc" hidden>
          <textarea rows="2">${solution.description}</textarea>
        </div>
      `;
      solutionList.appendChild(card);
    });
  }

  const nextFrom2 = tool.querySelector('[data-ifp-next-from-2]');
  let selectedSolutionName = '';

  solutionList.addEventListener('click', (e) => {
    const expandBtn = e.target.closest('.ifp-solution-expand');
    if (expandBtn) {
      const card = expandBtn.closest('.ifp-solution-card');
      const desc = card.querySelector('.ifp-solution-desc');
      const isOpen = expandBtn.getAttribute('aria-expanded') === 'true';
      expandBtn.setAttribute('aria-expanded', String(!isOpen));
      desc.hidden = isOpen;
    }
  });

  solutionList.addEventListener('change', (e) => {
    if (e.target.name !== 'ifp-solution') return;
    tool.querySelectorAll('.ifp-solution-card').forEach((card) => card.classList.remove('is-selected'));
    const card = e.target.closest('.ifp-solution-card');
    card.classList.add('is-selected');
    selectedSolutionName = SOLUTIONS[Number(e.target.value)].name;
    nextFrom2.disabled = false;
  });

  nextFrom2.addEventListener('click', () => {
    const solutionLabel = tool.querySelector('[data-ifp-solution-label]');
    if (solutionLabel) solutionLabel.textContent = selectedSolutionName || 'your solution';

    // API DECISION: the good-fit/bad-fit example facilities for the selected
    // solution. Mocked with fixed lists here — "Continue" on this step is
    // what used to be a separate "run against sample facilities" action, so
    // this is where that call would actually fire in production.
    renderFitExamples(tool.querySelector('[data-ifp-good-fit-list]'), GOOD_FIT_EXAMPLES);
    renderFitExamples(tool.querySelector('[data-ifp-bad-fit-list]'), BAD_FIT_EXAMPLES);
    goToStep(3);
  });

  function renderList(listEl, items) {
    listEl.innerHTML = items.map((text) => `<li><span class="check">&check;</span>${text}</li>`).join('');
  }

  function renderFitExamples(listEl, items) {
    listEl.innerHTML = items.map((text) => `
      <div class="ifp-fit-example">
        <span class="ifp-fit-example-marker"></span>
        <textarea rows="2">${text}</textarea>
      </div>
    `).join('');
  }

  // ---- Step 3: good-fit / bad-fit examples ---------------------------------
  const transition = tool.querySelector('[data-ifp-transition]');
  const transitionDomain = tool.querySelector('[data-ifp-transition-domain]');

  tool.querySelector('[data-ifp-next-from-3]').addEventListener('click', () => {
    if (transitionDomain) transitionDomain.textContent = websiteInput.value.trim() || 'your website';

    // Show the transition screen in place of the numbered steps (it isn't
    // one itself, so the step dots are left as-is rather than calling
    // goToStep). API DECISION: real duration, plus which facilities to test
    // against, come from the backend — fixed at 5s with 3 placeholders here.
    steps.forEach((step) => { step.hidden = true; step.classList.remove('is-active'); });
    transition.hidden = false;
    setTimeout(() => {
      transition.hidden = true;
      renderQuestions();
      goToStep(4);
    }, 5000);
  });

  // ---- Step 4: up to 5 clarifying questions, accordion (one open at a time) ----
  function renderQuestions() {
    const qList = tool.querySelector('[data-ifp-q-list]');
    qList.innerHTML = CLARIFY_QUESTIONS.map((q, qIndex) => `
      <div class="ifp-q-item" data-ifp-q-item>
        <button type="button" class="ifp-q-question" aria-expanded="false" aria-controls="ifp-q-answer-${qIndex}">
          <span class="ifp-q-text">${q.text}</span>
          <svg class="chevron" width="12" height="7" viewBox="0 0 12 7" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1l5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="ifp-q-options" id="ifp-q-answer-${qIndex}" hidden>
          ${q.options.map((opt, optIndex) => `
            <label class="ifp-q-option">
              <input type="radio" name="ifp-q-${qIndex}" value="${optIndex}">
              <span>${opt}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');

    // Only one question's options may be expanded at a time.
    const closers = [];
    qList.querySelectorAll('.ifp-q-question').forEach((btn) => {
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      const close = () => { btn.setAttribute('aria-expanded', 'false'); panel.hidden = true; };
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

    // Mark a question answered (shown via CSS on the collapsed header) once
    // one of its options is picked — each question is single-select.
    qList.querySelectorAll('.ifp-q-options').forEach((optionsEl) => {
      optionsEl.addEventListener('change', () => {
        optionsEl.closest('.ifp-q-item').classList.add('is-answered');
      });
    });
  }

  tool.querySelector('[data-ifp-next-from-4]').addEventListener('click', () => {
    // API DECISION: the answers would normally be sent back to refine the
    // profiles. Here we just move on to the (same, mocked) final list.
    renderList(tool.querySelector('[data-ifp-final-list]'), PROFILES);
    goToStep(5);
  });

  // ---- Step 5: blurred reveal behind an email gate -------------------------
  const emailForm = tool.querySelector('[data-ifp-email-form]');
  const revealWrap = tool.querySelector('[data-ifp-reveal-wrap]');
  const finalList = tool.querySelector('[data-ifp-final-list]');

  emailForm.addEventListener('submit', (e) => {
    e.preventDefault();
    // API DECISION: capturing the email is where a real backend call goes —
    // e.g. storing the lead and unlocking the account. Just reveals the
    // (already-rendered) list client-side here.
    finalList.classList.remove('ifp-list-blurred');
    revealWrap.classList.add('is-revealed');
  });
});
