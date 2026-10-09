/**
 * Chat demo component — animates a scripted "You" / "Automatisor" exchange
 * inside #chat-thread: user question types out, a thinking state shows,
 * then the response types in. Plays through every exchange once on load,
 * then stops. Each exchange also has a numbered circle (in
 * #chat-demo-numbers) that jumps straight to it on click, interrupting
 * whatever is currently playing.
 *
 * An answer can be a plain string (typed out character by character) or a
 * "rich" answer — { intro, table: { headers, rows }, bullets, outro } —
 * rendered as a lead line, an optional data table and/or bulleted list, and
 * a closing line, with feedback icons below. Intro/outro/bullet text support
 * inline **bold** markdown.
 */
(function () {
  const TYPE_SPEED_MS = 26;
  const THINKING_DURATION_MS = 1400;
  const HOLD_DURATION_MS = 2800;
  const PAUSE_BETWEEN_MS = 900;

  // Incremented every time a conversation (auto or clicked) starts playing.
  // Every async step below checks it against the token it was handed and
  // bails out as soon as it goes stale, so switching mid-animation cleanly
  // abandons whatever was in flight instead of racing with it.
  let playToken = 0;

  const CONVERSATION_SETS = {
    sales: [
      {
        question: 'Is this facility worth pursuing?',
        answer: {
          intro: 'Yes — pursue this site for pick-assist AMRs (sub-100 lb); picking signals, layout, and WMS indicate a clear fit.',
          table: {
            headers: ['Area', 'What we know', 'To confirm', 'Why'],
            rows: [
              ['Picking', 'WMS-driven, high-capacity picking; Metro Supply Chain', 'SKU velocity, average picks/hour', 'Validates AMR pick cycles'],
              ['Warehouse layout', 'Tall racking; palletized storage; 341,250 sqft', 'Aisle width, pick-face heights', 'Physical fit for AMR navigation'],
              ['WMS & systems', 'Synapse 3PL WMS in use', 'API access, real-time tasking support', 'Required for robot orchestration'],
              ['Labor & throughput', '$5,000 sign-on; positive employee reviews; fast dock turns', 'Pick labor headcount, peak staffing gaps', 'Builds labor-reduction ROI case']
            ]
          },
          outro: 'Next: Do turn this into a 5-point call agenda.'
        }
      },
      {
        question: 'How to position my solution to this site?',
        answer: {
          intro: 'The top three site challenges are (1) manual pick/pack bottlenecks in a high-volume WMS environment, (2) long travel distances across a **341,250 sq ft** footprint that lower picker productivity, and (3) uneven automation adoption / systems integration (packing is manual despite a **Synapse 3PL WMS**). Your <100 lb pick-assist AMR directly addresses each.',
          bullets: [
            'Manual pick/pack bottlenecks → Deploy pick-assist AMRs to assist pickers and reduce manual handling. Evidence: report shows active WMS-driven picking but packing is manual. Impact: raises throughput and pick accuracy, lowers fatigue/injury risk and reliance on costly hiring incentives (e.g., **$5,000** sign-on bonus signals labor pressure).',
            'Long travel distances across the large facility → Use AMRs to reduce walking/travel time and bring totes/picking carts to operators. Evidence: **341,250 sq ft** facility with palletized storage and tall racks. Impact: increases picks per hour, reduces overtime, and helps sustain the site\'s fast trailer turnaround (**15–30 minutes**) during peaks.',
            'Uneven automation & integration gaps → Integrate AMRs with the existing **Synapse 3PL WMS** to enable tasking, live location, and workflow orchestration (picking → packing). Evidence: WMS-driven workflows exist but packing lacks automation. Impact: smoother scale during peak volumes, better KPI visibility, and faster onboarding — helps Metro Supply Chain\'s high-capacity workflows scale without large headcount increases.'
          ],
          outro: 'Want a one-page prioritized rollout (zones first) or a short ROI checklist for this site?'
        }
      },
      
    ],
    'customer-success': [
      {
        question: 'Which of my warehouse accounts show expansion signals this quarter?',
        answer: '3 accounts flagged. Top signal: Meridian Fulfillment Co. filed two new dock-door construction permits — expansion likely within 90 days.'
      },
      {
        question: 'Any accounts at risk of churn in the next 60 days?',
        answer: '2 accounts at risk. Crestline Distribution cut headcount 18% and quietly removed your integration from their tech stack page.'
      },
      {
        question: 'Summarize renewal risk across my top 10 accounts.',
        answer: '8 of 10 are healthy. Northgate Logistics and Crestline Distribution show declining engagement — recommend outreach before their renewal date.'
      }
    ]
  };

  const DEFAULT_PERSONA = 'sales';

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isRichAnswer(answer) {
    return typeof answer === 'object' && answer !== null;
  }

  function buildMessage(role) {
    const wrap = document.createElement('div');
    wrap.className = `chat-message chat-message--${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = role === 'user' ? 'Y' : 'A';

    const bubbleWrap = document.createElement('div');
    bubbleWrap.className = 'chat-bubble-wrap';

    const label = document.createElement('span');
    label.className = 'chat-label';
    label.textContent = role === 'user' ? 'You' : 'Automatisor';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    bubbleWrap.append(label, bubble);
    wrap.append(avatar, bubbleWrap);

    return { wrap, bubbleWrap, bubble };
  }

  function typeInto(el, text, token) {
    return new Promise((resolve) => {
      let i = 0;
      el.classList.add('is-typing');
      const timer = setInterval(() => {
        if (token !== playToken) {
          clearInterval(timer);
          resolve();
          return;
        }
        i += 1;
        el.textContent = text.slice(0, i);
        if (i >= text.length) {
          clearInterval(timer);
          el.classList.remove('is-typing');
          resolve();
        }
      }, TYPE_SPEED_MS);
    });
  }

  // Minimal inline-markdown support (**bold**) for rich answers.
  function stripMarkdown(text) {
    return text.replace(/\*\*(.*?)\*\*/g, '$1');
  }

  function renderMarkdown(text) {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  // Types the plain-text version of a markdown string, then swaps in the
  // formatted HTML (with <strong> tags) once typing finishes.
  async function typeIntoRich(el, text, token) {
    await typeInto(el, stripMarkdown(text), token);
    if (token !== playToken) return;
    el.innerHTML = renderMarkdown(text);
  }

  function showThinking(bubble) {
    bubble.innerHTML = '<span class="chat-thinking"><i></i><i></i><i></i></span>Automatisor is thinking…';
  }

  function buildAnswerTable(tableData) {
    const table = document.createElement('table');
    table.className = 'chat-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    tableData.headers.forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    const tbody = document.createElement('tbody');
    tableData.rows.forEach((row) => {
      const tr = document.createElement('tr');
      row.forEach((cell, i) => {
        const td = document.createElement('td');
        td.textContent = cell;
        if (i === 0) {
          td.className = 'chat-table-label';
        } else {
          td.dataset.label = tableData.headers[i];
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    table.append(thead, tbody);
    return table;
  }

  function buildBulletList(bullets) {
    const list = document.createElement('ul');
    list.className = 'chat-bullet-list';
    bullets.forEach((item) => {
      const li = document.createElement('li');
      li.innerHTML = renderMarkdown(item);
      list.appendChild(li);
    });
    return list;
  }

  function buildFeedbackRow() {
    const row = document.createElement('div');
    row.className = 'chat-feedback';
    row.innerHTML = `
      <button type="button" aria-label="Good response">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M7 8l3-6 1 1-.5 5H15a1.5 1.5 0 0 1 1.5 1.8l-1 5A2 2 0 0 1 13.5 17H7V8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M7 8H4v9h3" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" aria-label="Bad response">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M13 12l-3 6-1-1 .5-5H5a1.5 1.5 0 0 1-1.5-1.8l1-5A2 2 0 0 1 6.5 3H13v9z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M13 12h3V3h-3" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" aria-label="More info">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.3"/><path d="M10 9v5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="10" cy="6.5" r="0.9" fill="currentColor"/></svg>
      </button>
    `;
    return row;
  }

  async function revealRichAnswer(thread, bubbleWrap, bubble, answer, token) {
    bubbleWrap.classList.add('chat-bubble-wrap--rich');
    bubble.classList.add('chat-bubble--rich');
    bubble.textContent = '';

    const intro = document.createElement('p');
    intro.className = 'chat-rich-line';
    bubble.appendChild(intro);
    await typeIntoRich(intro, answer.intro, token);
    if (token !== playToken) return;
    thread.scrollTop = thread.scrollHeight;

    if (answer.table) {
      const table = buildAnswerTable(answer.table);
      bubble.appendChild(table);
      thread.scrollTop = thread.scrollHeight;
      await wait(250);
      if (token !== playToken) return;
    }

    if (answer.bullets) {
      const list = buildBulletList(answer.bullets);
      bubble.appendChild(list);
      thread.scrollTop = thread.scrollHeight;
      await wait(250);
      if (token !== playToken) return;
    }

    if (answer.outro) {
      const outro = document.createElement('p');
      outro.className = 'chat-rich-line';
      bubble.appendChild(outro);
      await typeIntoRich(outro, answer.outro, token);
      if (token !== playToken) return;
    }

    bubbleWrap.appendChild(buildFeedbackRow());
    thread.scrollTop = thread.scrollHeight;
  }

  function setActiveNumber(numbersEl, index) {
    if (!numbersEl) return;
    Array.from(numbersEl.children).forEach((btn, i) => {
      btn.classList.toggle('is-active', i === index);
    });
  }

  // Plays one conversation end to end. `token` is the value playToken held
  // when this run was kicked off — every step re-checks it and bails the
  // instant it's stale, so an older run never fights a newer one for the
  // DOM. Returns true if it ran to completion (used by the auto-sequence to
  // decide whether it's still safe to advance to the next conversation).
  async function playConversation(thread, convo, token, numbersEl, index) {
    thread.innerHTML = '';
    setActiveNumber(numbersEl, index);

    // Step 1 — You ask a question
    const user = buildMessage('user');
    thread.appendChild(user.wrap);
    await typeInto(user.bubble, convo.question, token);
    if (token !== playToken) return false;
    thread.scrollTop = thread.scrollHeight;
    await wait(400);
    if (token !== playToken) return false;

    // Step 2 — Automatisor is thinking
    const bot = buildMessage('bot');
    bot.wrap.classList.add('is-thinking');
    thread.appendChild(bot.wrap);
    showThinking(bot.bubble);
    thread.scrollTop = thread.scrollHeight;
    await wait(THINKING_DURATION_MS);
    if (token !== playToken) return false;

    // Step 3 — Automatisor responds
    bot.wrap.classList.remove('is-thinking');
    bot.bubble.textContent = '';

    if (isRichAnswer(convo.answer)) {
      await revealRichAnswer(thread, bot.bubbleWrap, bot.bubble, convo.answer, token);
    } else {
      await typeInto(bot.bubble, convo.answer, token);
      thread.scrollTop = thread.scrollHeight;
    }
    if (token !== playToken) return false;

    // Stays highlighted for as long as this conversation remains on screen —
    // the next playConversation() call (auto-advance or a click) is what
    // switches the highlight, via setActiveNumber() at its start.

    await wait(HOLD_DURATION_MS);
    return token === playToken;
  }

  // Plays every conversation once, in order, then stops (no looping back
  // to the start). Any manual number click bumps playToken, which makes
  // the next iteration's stale check fail and ends this sequence for good.
  async function playSequenceOnce(thread, conversations, numbersEl) {
    for (let i = 0; i < conversations.length; i += 1) {
      const token = ++playToken;
      const completed = await playConversation(thread, conversations[i], token, numbersEl, i);
      if (!completed) return;
      await wait(PAUSE_BETWEEN_MS);
      if (token !== playToken) return;
    }
  }

  function playFromClick(thread, conversations, index, numbersEl) {
    const token = ++playToken;
    playConversation(thread, conversations[index], token, numbersEl, index);
  }

  function buildNumberCircles(numbersEl, thread, conversations) {
    numbersEl.innerHTML = '';
    conversations.forEach((_, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-demo-number';
      btn.textContent = String(i + 1);
      btn.setAttribute('aria-label', `Show conversation ${i + 1}`);
      btn.addEventListener('click', () => playFromClick(thread, conversations, i, numbersEl));
      numbersEl.appendChild(btn);
    });
  }

  function init() {
    const thread = document.getElementById('chat-thread');
    if (!thread) return;
    const persona = thread.dataset.persona || DEFAULT_PERSONA;
    const conversations = CONVERSATION_SETS[persona] || CONVERSATION_SETS[DEFAULT_PERSONA];

    const numbersEl = document.getElementById('chat-demo-numbers');
    if (numbersEl) buildNumberCircles(numbersEl, thread, conversations);

    playSequenceOnce(thread, conversations, numbersEl);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
