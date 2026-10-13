const STORAGE_KEY = 'ifp-test-session'

const statusEl = document.getElementById('status')
const errorEl = document.getElementById('error')
const rawEl = document.getElementById('raw')

let session = loadSession()
let busy = false
let answers = {}

document.getElementById('reset').addEventListener('click', () => {
  session = null
  answers = {}
  sessionStorage.removeItem(STORAGE_KEY)
  setError('')
  setStatus('')
  render()
})

function loadSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveSession() {
  if (!session) sessionStorage.removeItem(STORAGE_KEY)
  else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

function setStatus(text) {
  statusEl.hidden = !text
  statusEl.textContent = text
}

function setError(text) {
  errorEl.hidden = !text
  errorEl.textContent = text
}

function el(tag, attrs, children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs || {})) {
    if (key === 'class') node.className = value
    else if (key === 'text') node.textContent = value
    else if (key === 'value' && (tag === 'input' || tag === 'textarea')) node.value = value
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value)
    else if (value != null) node.setAttribute(key, value)
  }
  for (const child of children || []) {
    if (child) node.append(child)
  }
  return node
}

function show(id, node) {
  const section = document.getElementById(id)
  section.hidden = !node
  section.replaceChildren()
  if (node) section.append(node)
}

async function post(step, extra, pendingText) {
  busy = true
  setError('')
  setStatus(pendingText)
  render()
  try {
    const base = String(window.IFP_API_BASE || '/api/ifp').trim().replace(/\/$/, '')
    const res = await fetch(`${base}/${step}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, ...extra }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
    session = data.session
    saveSession()
    setStatus('')
  } catch (err) {
    setStatus('')
    setError(err.message || 'Request failed')
  } finally {
    busy = false
    render()
  }
}

function field(label, id, value, type) {
  return el('div', {}, [
    el('label', { for: id, text: label }),
    el('input', { id, type: type || 'text', value: value || '' }),
  ])
}

function renderCompany() {
  const company = session?.company || {}
  const box = el('div', {}, [
    el('h2', { text: 'Company' }),
    el('div', { class: 'fields' }, [
      field('Company name', 'company-name', company.name),
      field('Domain', 'company-domain', company.domain, 'url'),
    ]),
    el('button', {
      type: 'button',
      text: busy ? 'Working…' : 'Find offerings',
      disabled: busy ? 'true' : null,
      onclick: () => {
        const name = document.getElementById('company-name').value.trim()
        const domain = document.getElementById('company-domain').value.trim()
        if (!domain) {
          setError('Enter a company domain first.')
          return
        }
        runCompany(name, domain)
      },
    }),
  ])
  show('company', box)
}

async function runCompany(name, domain) {
  await post('company', { name, domain }, 'Saving the company…')
  if (!session?.company?.domain || errorEl.textContent) return
  await post('offerings', {}, 'Searching offerings. This can take a minute.')
}

function renderOfferings() {
  const offerings = session?.offerings || []
  if (!offerings.length) {
    show('offerings', null)
    return
  }
  const selected = session.selectedOffering?.name || offerings[0].name
  const box = el('div', {}, [
    el('h2', { text: 'Solution' }),
    ...offerings.map((offering) => el('label', { class: 'offer' }, [
      el('input', {
        type: 'radio',
        name: 'offering',
        value: offering.name,
        checked: offering.name === selected ? 'checked' : null,
      }),
      el('span', {}, [
        el('strong', { text: offering.name }),
        el('p', { text: offering.description || '' }),
      ]),
    ])),
    el('button', {
      type: 'button',
      text: busy ? 'Working…' : 'Build good fit and bad fit',
      disabled: busy ? 'true' : null,
      onclick: () => {
        const picked = document.querySelector('input[name="offering"]:checked')
        if (!picked) {
          setError('Pick an offering first.')
          return
        }
        runFit(picked.value)
      },
    }),
  ])
  show('offerings', box)
}

async function runFit(name) {
  await post('select', { name }, 'Selecting the offering…')
  if (session?.selectedOffering?.name !== name || errorEl.textContent) return
  await post('fit', {}, 'Building the fit profile. This can take a minute.')
}

function renderFit() {
  const fit = session?.fit
  if (!fit) {
    show('fit', null)
    return
  }
  const list = (rows, empty) => {
    const items = (rows || []).map((row) => el('li', { text: row.line }))
    return items.length ? el('ul', {}, items) : el('p', { text: empty })
  }
  show('fit', el('div', {}, [
    el('h2', { text: 'Good fit and bad fit' }),
    el('p', { class: 'meta', text: fit.name || '' }),
    el('div', { class: 'fit-grid' }, [
      el('div', { class: 'fit-col' }, [
        el('h3', { text: 'Good fit' }),
        list(fit.goodFit, 'None returned.'),
      ]),
      el('div', { class: 'fit-col' }, [
        el('h3', { text: 'Bad fit' }),
        list(fit.badFit, 'None returned.'),
      ]),
    ]),
    el('div', { class: 'row' }, [
      el('button', {
        type: 'button',
      text: busy ? 'Working…' : 'Continue to clarifying questions',
      disabled: busy ? 'true' : null,
      onclick: () => post('segments', {}, 'Choosing profiles and checking them for ambiguity…'),
      }),
    ]),
  ]))
}

function renderSegments() {
  // Profiles are chosen on the server and go straight into the questioner.
  // They stay on the session dict; this screen is not shown.
  show('segments', null)
}

function questionKey(question) {
  return `${question.segmentRank}:${question.id}`
}

function renderQuestions() {
  if (!session || !['questions', 'final'].includes(session.stage)) {
    show('questions', null)
    return
  }
  const questions = session.questions || []
  const bySegment = new Map()
  for (const question of questions) {
    if (!bySegment.has(question.segmentRank)) bySegment.set(question.segmentRank, [])
    bySegment.get(question.segmentRank).push(question)
  }

  const blocks = []
  if (!questions.length) {
    blocks.push(el('p', { text: 'No clarifying questions. The recommended criteria can be finalized as written.' }))
  } else {
    for (const [rank, rows] of bySegment) {
      const segment = (session.segments || []).find((item) => item.rank === rank)
      blocks.push(el('div', { class: 'question' }, [
        el('strong', { text: segment ? segment.name : `Profile ${rank}` }),
        ...rows.map((question) => {
          const key = questionKey(question)
          const chosen = answers[key]?.selected || ''
          return el('div', {}, [
            el('p', { text: question.question }),
            el('div', { class: 'options' }, question.options.map((option) => el('label', {}, [
              el('input', {
                type: 'radio',
                name: key,
                value: option.label,
                checked: chosen === option.label ? 'checked' : null,
                onchange: () => {
                  answers[key] = { selected: option.label, freeText: Boolean(option.freeText) }
                  render()
                },
              }),
              el('span', { text: option.label }),
            ]))),
            chosen && answers[key]?.freeText
              ? el('textarea', {
                  rows: '2',
                  placeholder: 'Type the answer',
                  value: answers[key].text || '',
                  oninput: (event) => {
                    answers[key].text = event.target.value
                  },
                })
              : null,
          ])
        }),
      ]))
    }
  }

  blocks.push(el('button', {
    type: 'button',
    text: busy ? 'Working…' : 'Finalize segments',
    disabled: busy ? 'true' : null,
    onclick: finalize,
  }))
  show('questions', el('div', {}, [el('h2', { text: 'Clarifying questions' }), ...blocks]))
}

async function finalize() {
  const questions = session?.questions || []
  const payload = []
  for (const question of questions) {
    const key = questionKey(question)
    const draft = answers[key]
    if (!draft?.selected) {
      setError('Answer every question before finalizing.')
      return
    }
    const answer = draft.freeText ? String(draft.text || '').trim() : draft.selected
    if (!answer) {
      setError('Type an answer for the free-text question.')
      return
    }
    payload.push({ segmentRank: question.segmentRank, id: question.id, answer })
  }
  if (payload.length) {
    await post('answers', { answers: payload }, 'Saving answers…')
    if (errorEl.textContent) return
  }
  await post('finalize', {}, 'Writing the final profiles…')
}

function renderFinal() {
  const rows = session?.finalSegments || []
  if (session?.stage !== 'final' || !rows.length) {
    show('final', null)
    return
  }
  show('final', el('div', {}, [
    el('h2', { text: 'Final ideal facility profiles' }),
    ...rows.map((segment) => el('article', { class: 'segment' }, [
      el('strong', { text: `${segment.rank}. ${segment.name}` }),
      el('div', { class: 'meta', text: segment.axis }),
      el('p', { text: segment.criteria }),
      (segment.assumptions || []).length
        ? el('p', { class: 'meta', text: `Assumptions: ${segment.assumptions.join('; ')}` })
        : null,
    ])),
  ]))
}

function render() {
  renderCompany()
  renderOfferings()
  renderFit()
  renderSegments()
  renderQuestions()
  renderFinal()
  rawEl.textContent = JSON.stringify(session, null, 2)
  for (const button of document.querySelectorAll('button')) {
    if (button.id === 'reset') button.disabled = busy
  }
}

render()
