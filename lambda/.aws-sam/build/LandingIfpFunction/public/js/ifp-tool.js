// "Build your Ideal Facility Profile" tool — views/ideal-facility-profile.ejs.
//
// The markup and steps stay as designed. Data comes from /api/ifp (or
// window.IFP_API_BASE). Choosing Ideal Facility Profiles is not a screen:
// POST /segments recommends them and runs the questioner on all of them,
// while the existing transition stays up. The next visible step is questions.

document.addEventListener('DOMContentLoaded', () => {
  const tool = document.querySelector('[data-ifp-tool]');
  if (!tool) return;

  let session = null;
  let offerings = [];
  let questions = [];

  function apiBase() {
    const configured = String(window.IFP_API_BASE || '').trim().replace(/\/$/, '');
    const host = window.location.hostname;
    if (!configured || host === 'localhost' || host === '127.0.0.1') return '/api/ifp';
    return configured;
  }

  async function post(step, extra) {
    const res = await fetch(`${apiBase()}/${step}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    session = data.session;
    return session;
  }

  function fail(err) {
    window.alert(err.message || 'Something went wrong. Try again.');
  }

  // ---- Step navigation ----------------------------------------------------
  const steps = tool.querySelectorAll('[data-ifp-step]');
  const stepDots = tool.querySelectorAll('[data-step-dot]');

  const loading = tool.querySelector('[data-ifp-loading]');
  const loadingText = tool.querySelector('[data-ifp-loading-text]');

  function showLoading(message) {
    steps.forEach((step) => { step.hidden = true; step.classList.remove('is-active'); });
    loadingText.textContent = message;
    loading.hidden = false;
  }

  function hideLoading() {
    loading.hidden = true;
  }

  function goToStep(n) {
    hideLoading();
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
  const websiteButton = websiteForm.querySelector('button[type="submit"]');

  websiteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const domain = websiteInput.value.trim();
    if (!domain) return;
    if (domainLabel) domainLabel.textContent = domain;
    websiteButton.disabled = true;
    const label = domain.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    showLoading(`Finding solutions on ${label}…`);
    try {
      await post('company', { name: '', domain });
      await post('offerings', {});
      offerings = session.offerings || [];
      renderSolutions();
      hideLoading();
      goToStep(2);
    } catch (err) {
      hideLoading();
      goToStep(1);
      fail(err);
    } finally {
      websiteButton.disabled = false;
    }
  });

  function renderSolutions() {
    solutionList.innerHTML = '';
    offerings.forEach((solution) => {
      const card = document.createElement('div');
      card.className = 'ifp-solution-card';
      card.innerHTML = `
        <div class="ifp-solution-head">
          <label class="ifp-solution-select">
            <input type="radio" name="ifp-solution" value="">
            <span class="ifp-solution-name"></span>
          </label>
          <button type="button" class="ifp-solution-expand" aria-expanded="false">
            <svg class="chevron" width="12" height="7" viewBox="0 0 12 7" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1l5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="ifp-solution-desc" hidden>
          <textarea rows="1"></textarea>
        </div>
      `;
      card.querySelector('input').value = solution.name;
      card.querySelector('.ifp-solution-name').textContent = solution.name;
      const description = card.querySelector('textarea');
      description.value = solution.description || '';
      description.addEventListener('input', () => fitTextarea(description));
      solutionList.appendChild(card);
    });
    nextFrom2.disabled = true;
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
      if (!desc.hidden) fitTextarea(desc.querySelector('textarea'));
    }
  });

  solutionList.addEventListener('change', (e) => {
    if (e.target.name !== 'ifp-solution') return;
    tool.querySelectorAll('.ifp-solution-card').forEach((card) => card.classList.remove('is-selected'));
    const card = e.target.closest('.ifp-solution-card');
    card.classList.add('is-selected');
    selectedSolutionName = e.target.value;
    nextFrom2.disabled = false;
  });

  nextFrom2.addEventListener('click', async () => {
    const solutionLabel = tool.querySelector('[data-ifp-solution-label]');
    if (solutionLabel) solutionLabel.textContent = selectedSolutionName || 'your solution';

    const card = tool.querySelector('.ifp-solution-card.is-selected');
    const edited = card?.querySelector('textarea')?.value.trim() || '';
    const offering = (session.offerings || []).find((row) => row.name === selectedSolutionName);
    if (offering && edited) offering.description = edited;

    nextFrom2.disabled = true;
    showLoading('Building good-fit and bad-fit examples…');
    try {
      await post('select', { name: selectedSolutionName });
      await post('fit', {});
      const fit = session.fit || {};
      renderFitExamples(
        tool.querySelector('[data-ifp-good-fit-list]'),
        (fit.goodFit || []).map((row) => row.line),
      );
      renderFitExamples(
        tool.querySelector('[data-ifp-bad-fit-list]'),
        (fit.badFit || []).map((row) => row.line),
      );
      goToStep(3);
      tool.querySelectorAll('[data-ifp-good-fit-list] textarea, [data-ifp-bad-fit-list] textarea')
        .forEach(fitTextarea);
    } catch (err) {
      hideLoading();
      goToStep(2);
      fail(err);
    } finally {
      nextFrom2.disabled = false;
    }
  });

  function renderList(listEl, items) {
    listEl.innerHTML = items.map((text) => `<li><span class="check">&check;</span></li>`).join('');
    listEl.querySelectorAll('li').forEach((li, index) => {
      li.append(document.createTextNode(items[index]));
    });
  }

  function renderFitExamples(listEl, items) {
    listEl.innerHTML = '';
    items.forEach((text) => appendFitExample(listEl, text, false));
  }

  function appendFitExample(listEl, text, editing) {
    const row = document.createElement('div');
    row.className = 'ifp-fit-example';
    row.innerHTML = `
      <span class="ifp-fit-example-marker"></span>
      <textarea rows="1"></textarea>
      <button type="button" class="ifp-fit-edit" aria-label="Edit example">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M8.2 2.3l3.5 3.5M1.8 12.2l.7-2.8 7.2-7.2a1.2 1.2 0 0 1 1.7 0l.6.6a1.2 1.2 0 0 1 0 1.7l-7.2 7.2-2.8.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
        </svg>
      </button>
    `;
    const field = row.querySelector('textarea');
    field.value = text || '';
    field.readOnly = !editing;
    field.addEventListener('input', () => fitTextarea(field));
    field.addEventListener('blur', () => finishFitEdit(row));
    row.querySelector('.ifp-fit-edit').addEventListener('click', () => startFitEdit(row));
    listEl.appendChild(row);
    if (editing) startFitEdit(row);
    else fitTextarea(field);
    return row;
  }

  function startFitEdit(row) {
    const field = row.querySelector('textarea');
    row.classList.add('is-editing');
    field.readOnly = false;
    field.focus();
    fitTextarea(field);
  }

  function finishFitEdit(row) {
    const field = row.querySelector('textarea');
    if (!field.value.trim()) {
      row.remove();
      return;
    }
    row.classList.remove('is-editing');
    field.readOnly = true;
  }

  tool.querySelectorAll('[data-ifp-add-fit]').forEach((button) => {
    button.addEventListener('click', () => {
      const list = button.dataset.ifpAddFit === 'good'
        ? tool.querySelector('[data-ifp-good-fit-list]')
        : tool.querySelector('[data-ifp-bad-fit-list]');
      appendFitExample(list, '', true);
    });
  });

  function fitTextarea(field) {
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }

  function applyFitEdits() {
    if (!session?.fit) return;
    const read = (selector) => [...tool.querySelectorAll(`${selector} textarea`)]
      .map((field) => field.value.trim())
      .filter(Boolean);
    const good = read('[data-ifp-good-fit-list]');
    const bad = read('[data-ifp-bad-fit-list]');
    const asRows = (lines) => lines.map((line) => ({ line, source: 'derived', why: '', url: '' }));
    session.fit.goodFit = asRows(good);
    session.fit.badFit = asRows(bad);
    session.fit.goodFitText = good.join('\n');
    session.fit.badFitText = bad.join('\n');
  }

  // ---- Step 3 → transition → questions ------------------------------------
  // The transition is the existing wait state. Profile choice happens in
  // POST /segments and is not rendered.
  const transition = tool.querySelector('[data-ifp-transition]');
  const transitionDomain = tool.querySelector('[data-ifp-transition-domain]');
  const nextFrom3 = tool.querySelector('[data-ifp-next-from-3]');

  nextFrom3.addEventListener('click', async () => {
    if (transitionDomain) transitionDomain.textContent = websiteInput.value.trim() || 'your website';
    applyFitEdits();

    steps.forEach((step) => { step.hidden = true; step.classList.remove('is-active'); });
    transition.hidden = false;
    nextFrom3.disabled = true;
    try {
      await post('segments', {});
      questions = session.questions || [];
      transition.hidden = true;
      renderQuestions();
      goToStep(4);
    } catch (err) {
      transition.hidden = true;
      fail(err);
      goToStep(3);
    } finally {
      nextFrom3.disabled = false;
    }
  });

  // ---- Step 4: clarifying questions ---------------------------------------
  function renderQuestions() {
    const qList = tool.querySelector('[data-ifp-q-list]');
    qList.innerHTML = questions.map((q, qIndex) => `
      <div class="ifp-q-item" data-ifp-q-item>
        <button type="button" class="ifp-q-question" aria-expanded="false" aria-controls="ifp-q-answer-${qIndex}">
          <span class="ifp-q-text"></span>
          <svg class="chevron" width="12" height="7" viewBox="0 0 12 7" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1l5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="ifp-q-options" id="ifp-q-answer-${qIndex}" hidden></div>
      </div>
    `).join('');

    qList.querySelectorAll('.ifp-q-item').forEach((item, qIndex) => {
      const question = questions[qIndex];
      item.querySelector('.ifp-q-text').textContent = question.question;
      const optionsEl = item.querySelector('.ifp-q-options');
      (question.options || []).forEach((option) => {
        const label = document.createElement('label');
        label.className = 'ifp-q-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `ifp-q-${qIndex}`;
        input.value = option.label;
        input.dataset.segmentRank = String(question.segmentRank);
        input.dataset.questionId = question.id;
        input.dataset.freeText = option.freeText ? 'true' : 'false';
        const span = document.createElement('span');
        span.textContent = option.label;
        label.append(input, span);
        optionsEl.append(label);
        if (option.freeText) {
          const typed = document.createElement('input');
          typed.type = 'text';
          typed.className = 'ifp-input ifp-q-free';
          typed.placeholder = 'Type your answer';
          typed.hidden = true;
          typed.addEventListener('keydown', (event) => event.stopPropagation());
          optionsEl.append(typed);
        }
      });
    });

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

    qList.querySelectorAll('.ifp-q-options').forEach((optionsEl) => {
      optionsEl.addEventListener('change', () => {
        const picked = optionsEl.querySelector('input[type="radio"]:checked');
        const typed = optionsEl.querySelector('.ifp-q-free');
        const isFree = picked?.dataset.freeText === 'true';
        if (typed) {
          typed.hidden = !isFree;
          if (isFree) typed.focus();
        }
        optionsEl.closest('.ifp-q-item').classList.toggle('is-answered', Boolean(picked) && !isFree);
      });
      const typed = optionsEl.querySelector('.ifp-q-free');
      if (typed) {
        typed.addEventListener('input', () => {
          optionsEl.closest('.ifp-q-item').classList.toggle('is-answered', typed.value.trim().length > 0);
        });
      }
    });
  }

  const nextFrom4 = tool.querySelector('[data-ifp-next-from-4]');

  nextFrom4.addEventListener('click', async () => {
    const answers = [];
    for (let index = 0; index < questions.length; index += 1) {
      const picked = tool.querySelector(`input[name="ifp-q-${index}"]:checked`);
      if (!picked) {
        window.alert('Answer every question before continuing.');
        return;
      }
      let answer = picked.value;
      if (picked.dataset.freeText === 'true') {
        const typed = picked.closest('.ifp-q-options').querySelector('.ifp-q-free');
        answer = typed?.value.trim() || '';
        if (!answer) {
          window.alert('Type your own answer before continuing.');
          typed?.focus();
          return;
        }
      }
      answers.push({
        segmentRank: Number(picked.dataset.segmentRank),
        id: picked.dataset.questionId,
        answer,
      });
    }

    nextFrom4.disabled = true;
    try {
      if (answers.length) await post('answers', { answers });
      await post('finalize', {});
      const lines = (session.finalSegments || []).map((segment) => segment.criteria || segment.name);
      renderList(tool.querySelector('[data-ifp-final-list]'), lines);
      goToStep(5);
    } catch (err) {
      fail(err);
    } finally {
      nextFrom4.disabled = false;
    }
  });

  // ---- Step 5: blurred reveal behind a work-email gate --------------------
  const PERSONAL_EMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.ca', 'yahoo.com.au', 'ymail.com', 'rocketmail.com',
    'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'outlook.co.uk', 'live.com', 'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'aim.com',
    'proton.me', 'protonmail.com', 'pm.me',
    'gmx.com', 'gmx.net', 'gmx.de',
    'mail.com', 'email.com', 'inbox.com',
    'zoho.com', 'yandex.com', 'yandex.ru',
    'qq.com', '163.com', '126.com', 'rediffmail.com',
    'fastmail.com', 'hey.com', 'tutanota.com', 'tuta.com',
  ]);

  function isWorkEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    const domain = email.split('@')[1] || '';
    if (!domain || domain.includes(' ') || !domain.includes('.')) return false;
    return ![...PERSONAL_EMAIL_DOMAINS].some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
  }

  const emailForm = tool.querySelector('[data-ifp-email-form]');
  const emailInput = emailForm.querySelector('input[type="email"]');
  const revealWrap = tool.querySelector('[data-ifp-reveal-wrap]');
  const finalList = tool.querySelector('[data-ifp-final-list]');

  emailInput.addEventListener('input', () => emailInput.setCustomValidity(''));

  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isWorkEmail(emailInput.value)) {
      emailInput.setCustomValidity('Use your work email. Personal addresses such as Gmail, Yahoo, and Outlook are not accepted.');
      emailInput.reportValidity();
      return;
    }
    emailInput.setCustomValidity('');
    const domain = session?.company?.domain || websiteInput.value.trim();
    const submitButton = emailForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const res = await fetch(`${apiBase()}/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, email: emailInput.value.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save your email. Try again.');
      finalList.classList.remove('ifp-list-blurred');
      revealWrap.classList.add('is-revealed');
    } catch (err) {
      fail(err);
    } finally {
      submitButton.disabled = false;
    }
  });
});
