const { OFFERINGS_SCHEMA, FIT_SCHEMA } = require('./schemas')
const { responses, chatJson } = require('./openai')
const { getDefaultCorpus } = require('./corpus')
const {
  createIfpSession,
  cloneSession,
  clearFromOfferings,
  clearFromFit,
  clearFromSegments,
} = require('./session')
const {
  hostOf,
  fillPrompt,
  cleanOfferingText,
  cleanLine,
  asText,
  citationLines,
  proofLines,
  siblingLines,
  loadPrompt,
} = require('./util')

const findOfferingsPrompt = loadPrompt('find-offerings.md')
const fitProfilePrompt = loadPrompt('fit-profile.md')
const icpPrompt = loadPrompt('icp-recommendations.md')
const ambiguityPrompt = loadPrompt('ambiguity.md')
const synthesizePrompt = loadPrompt('synthesize.md')

const LINE_SOURCE = new Set(['published', 'derived'])
const AXES = new Set(['operation', 'scale', 'trigger', 'vertical', 'workflow'])
const MAX_ICP_SEGMENTS = 3
const MAX_FIT_LINES = 5
const FREE_TEXT_OPTION = { label: 'Something else — type your own answer', freeText: true }

function normalizeOffering(offering) {
  return {
    name: cleanOfferingText(offering.name),
    description: cleanOfferingText(offering.description),
    source_url: String(offering.source_url || '').trim(),
    kind: offering.kind,
    confidence: offering.confidence,
    why: cleanOfferingText(offering.why),
    citations: (offering.citations || []).map((url) => String(url || '').trim()).filter(Boolean),
    proof_points: (offering.proof_points || []).map((point) => ({
      customer: cleanOfferingText(point.customer),
      result: cleanOfferingText(point.result),
      url: String(point.url || '').trim(),
    })),
  }
}

function normalizeCriteria(rows) {
  return (rows || [])
    .map((row) => ({
      line: cleanLine(row.line),
      source: LINE_SOURCE.has(row.source) ? row.source : 'derived',
      why: cleanOfferingText(row.why),
      url: String(row.url || '').trim(),
    }))
    .filter((row) => row.line)
}

function normalizeSegments(rows) {
  const normalized = (rows || [])
    .map((row, index) => ({
      rank: Number.isInteger(row.rank) && row.rank > 0 ? row.rank : index + 1,
      name: cleanOfferingText(row.name),
      axis: AXES.has(row.axis) ? row.axis : 'operation',
      criteria: cleanOfferingText(row.criteria),
      why: cleanOfferingText(row.why),
    }))
    .filter((row) => row.name && row.criteria)
    .sort((a, b) => a.rank - b.rank)

  return normalized.slice(0, MAX_ICP_SEGMENTS).map((row, index) => ({ ...row, rank: index + 1 }))
}

function normalizeQuestions(raw, segmentRank) {
  return (Array.isArray(raw?.questions) ? raw.questions : [])
    .slice(0, 4)
    .map((question, index) => ({
      segmentRank,
      id: question.id || `q${index + 1}`,
      question: String(question.question || '').trim(),
      options: [
        ...(question.options || [])
          .slice(0, 4)
          .filter((option) => option?.label)
          .map((option) => ({ label: String(option.label).trim() })),
        { ...FREE_TEXT_OPTION },
      ],
    }))
    .filter((question) => question.question && question.options.length > 1)
}

function setCompany(session, { name, domain } = {}) {
  const next = cloneSession(session || createIfpSession())
  const host = hostOf(domain)
  if (!host) throw new Error('Enter a company domain first.')
  const companyName = String(name || '').trim()
  const changed = next.company.domain !== host || next.company.name !== companyName
  if (changed) clearFromOfferings(next)
  next.company = { name: companyName, domain: host }
  next.stage = 'company'
  return next
}

async function findOfferings(session) {
  const next = cloneSession(session)
  const host = hostOf(next.company?.domain)
  if (!host) throw new Error('Enter a company domain first.')

  const prompt = fillPrompt(findOfferingsPrompt, {
    VENDOR_NAME: next.company.name || host,
    VENDOR_DOMAIN: host,
  })
  const { data } = await responses(prompt, { schema: OFFERINGS_SCHEMA, maxSearches: 8, retries: 1 })
  const offerings = (data?.offerings || []).map(normalizeOffering).filter((row) => row.name)
  if (!offerings.length) {
    throw new Error(cleanOfferingText(data?.note) || 'No offerings found')
  }

  clearFromFit(next)
  next.offerings = offerings
  next.selectedOffering = null
  next.stage = 'offerings'
  return next
}

function selectOffering(session, name) {
  const next = cloneSession(session)
  if (!next.offerings?.length) throw new Error('Find offerings before selecting one.')
  const wanted = String(name || '').trim().toLowerCase()
  const offering = next.offerings.find((row) => row.name.toLowerCase() === wanted)
  if (!offering) throw new Error('That offering is not in the solution list.')

  const changed = next.selectedOffering?.name !== offering.name
  if (changed) clearFromFit(next)
  next.selectedOffering = offering
  next.stage = 'offerings'
  return next
}

async function buildFit(session) {
  const next = cloneSession(session)
  const host = hostOf(next.company?.domain)
  const offering = next.selectedOffering
  if (!host) throw new Error('Enter a company domain first.')
  if (!offering?.name) throw new Error('Pick an offering first.')

  const siblings = (next.offerings || []).map((row) => row.name)
  const prompt = fillPrompt(fitProfilePrompt, {
    VENDOR_NAME: next.company.name || host,
    VENDOR_DOMAIN: host,
    OFFERING_NAME: offering.name,
    SOURCE_URL: offering.source_url || '',
    OFFERING_DESCRIPTION: offering.description || '(none)',
    EXISTING_CITATIONS: citationLines(offering.citations),
    EXISTING_PROOF_POINTS: proofLines(offering.proof_points),
    SIBLING_OFFERINGS: siblingLines(siblings, offering.name),
  })

  const { data } = await responses(prompt, { schema: FIT_SCHEMA, maxSearches: 6, retries: 1 })
  const goodFit = normalizeCriteria(data?.goodFit).slice(0, MAX_FIT_LINES)
  const badFit = normalizeCriteria(data?.badFit).slice(0, MAX_FIT_LINES)
  if (!goodFit.length && !badFit.length) {
    throw new Error(cleanOfferingText(data?.note) || 'No fit lines returned')
  }

  clearFromSegments(next)
  next.fit = {
    name: cleanOfferingText(data?.name) || offering.name,
    description: offering.description || '',
    goodFit,
    badFit,
    goodFitText: asText(goodFit),
    badFitText: asText(badFit),
  }
  next.stage = 'fit'
  return next
}

function proofBlock(offering) {
  return proofLines(offering?.proof_points)
}

async function recommendSegments(session) {
  const next = cloneSession(session)
  const fit = next.fit
  if (!fit?.goodFitText && !fit?.badFitText) throw new Error('Build a fit profile first.')

  const prompt = fillPrompt(icpPrompt, {
    VENDOR_NAME: next.company.name || next.company.domain || '',
    VENDOR_DOMAIN: next.company.domain || '',
    OFFERING_NAME: fit.name || next.selectedOffering?.name || '',
    OFFERING_DESCRIPTION: fit.description || '(none)',
    GOOD_FIT: fit.goodFitText || '(none)',
    BAD_FIT: fit.badFitText || '(none)',
    PROOF_POINTS: proofBlock(next.selectedOffering),
  })

  const data = await chatJson(prompt)
  const segments = normalizeSegments(data?.segments)
  if (!segments.length) {
    throw new Error(cleanOfferingText(data?.note) || 'No ideal facility profiles returned')
  }

  next.segments = segments
  next.questions = []
  next.answers = []
  next.finalSegments = []
  next.stage = 'segments'
  return next
}

async function buildQuestions(session) {
  const next = cloneSession(session)
  if (!next.segments?.length) throw new Error('Recommend ideal facility profiles first.')

  const corpus = await getDefaultCorpus()
  const checks = await Promise.all(next.segments.map(async (segment) => {
    const prompt = fillPrompt(ambiguityPrompt, {
      CRITERIA: segment.criteria,
      CORPUS: corpus.text,
      SITE_COUNT: String(corpus.siteCount),
      ACCOUNT_COUNT: String(corpus.accountCount),
    })
    const raw = await chatJson(prompt)
    const rows = normalizeQuestions(raw, segment.rank)
    return raw?.ambiguous === true ? rows : []
  }))
  const questions = checks.flat()

  next.questions = questions
  next.answers = []
  next.finalSegments = []
  next.stage = 'questions'
  return next
}

function submitAnswers(session, answers) {
  const next = cloneSession(session)
  if (next.stage !== 'questions' && next.stage !== 'final') {
    throw new Error('Ask the clarifying questions before submitting answers.')
  }

  const byKey = new Map(
    (next.questions || []).map((question) => [`${question.segmentRank}:${question.id}`, question]),
  )
  const normalized = []
  const seen = new Set()

  for (const row of answers || []) {
    const key = `${row.segmentRank}:${row.id}`
    const question = byKey.get(key)
    if (!question) throw new Error(`Unknown question ${key}.`)
    const answer = String(row.answer || '').trim()
    if (!answer) throw new Error(`Question ${key} needs an answer.`)
    seen.add(key)
    normalized.push({
      segmentRank: question.segmentRank,
      id: question.id,
      question: question.question,
      answer,
    })
  }

  for (const question of next.questions || []) {
    const key = `${question.segmentRank}:${question.id}`
    if (!seen.has(key)) throw new Error(`Question ${key} needs an answer.`)
  }

  next.answers = normalized
  next.finalSegments = []
  if (next.stage === 'final') next.stage = 'questions'
  return next
}

async function finalizeSegments(session) {
  const next = cloneSession(session)
  if (!next.segments?.length) throw new Error('Recommend ideal facility profiles first.')
  if (next.stage !== 'questions' && next.stage !== 'final') {
    throw new Error('Ask the clarifying questions before finalizing.')
  }
  if ((next.questions || []).length && !(next.answers || []).length) {
    throw new Error('Submit answers before finalizing.')
  }

  const finalSegments = []
  for (const segment of next.segments) {
    const answers = (next.answers || []).filter((row) => row.segmentRank === segment.rank)
    if (!answers.length) {
      finalSegments.push({ ...segment, assumptions: [] })
      continue
    }

    const qa = answers.map((row) => `Q: ${row.question}\nA: ${row.answer}`).join('\n\n')
    const raw = await chatJson(fillPrompt(synthesizePrompt, {
      CRITERIA: segment.criteria,
      QA: qa,
    }))
    finalSegments.push({
      ...segment,
      criteria: String(raw?.resolved || '').trim() || segment.criteria,
      assumptions: (Array.isArray(raw?.assumptions) ? raw.assumptions : [])
        .map((item) => String(item).trim())
        .filter(Boolean),
    })
  }

  next.finalSegments = finalSegments
  next.stage = 'final'
  return next
}

module.exports = {
  setCompany,
  findOfferings,
  selectOffering,
  buildFit,
  recommendSegments,
  buildQuestions,
  submitAnswers,
  finalizeSegments,
}
