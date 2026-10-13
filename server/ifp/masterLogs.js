const crypto = require('node:crypto')

function normalizeOfferingKey(name) {
  return String(name || '').trim().toLowerCase()
}

function isLegacyFlatQuestioner(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return false
  return Array.isArray(stored.segments)
    || Array.isArray(stored.questions)
    || Array.isArray(stored.answers)
}

function normalizeQuestionerLogs(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
  if (isLegacyFlatQuestioner(stored)) return {}
  return stored
}

function normalizeFinalSegmentsLogs(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
  if (Array.isArray(stored)) return {}
  return stored
}

function segmentNameByRank(segments, rank) {
  const row = (segments || []).find((s) => Number(s.rank) === Number(rank))
  return row?.name || ''
}

function buildQuestionerRunEntry(session, { runId, completedAt, offeringLabel }) {
  const segments = session?.segments || []
  const questions = session?.questions || []
  const answers = session?.answers || []
  const ranks = [...new Set(questions.map((q) => q.segmentRank))].sort((a, b) => a - b)

  const grouped = ranks.map((rank) => ({
    rank,
    name: segmentNameByRank(segments, rank),
    questions: questions
      .filter((q) => q.segmentRank === rank)
      .map((q) => {
        const answer = answers.find((a) => a.segmentRank === rank && a.id === q.id)
        return {
          id: q.id,
          question: q.question,
          options: (q.options || []).map((o) => o.label).filter(Boolean),
          selected: answer?.answer || '',
        }
      }),
  }))

  return {
    run_id: runId,
    completed_at: completedAt,
    offering_label: offeringLabel,
    segments: grouped,
  }
}

function buildFinalSegmentsRunEntry(session, { runId, completedAt, offeringLabel }) {
  const profiles = (session?.finalSegments || []).map((row) => ({
    rank: row.rank,
    name: row.name,
    axis: row.axis,
    criteria: row.criteria,
    assumptions: row.assumptions || [],
  }))

  return {
    run_id: runId,
    completed_at: completedAt,
    offering_label: offeringLabel,
    profiles,
  }
}

function appendToOfferingLog(logMap, offeringKey, entry, maxRuns = 50) {
  const next = { ...logMap }
  const list = [...(next[offeringKey] || []), entry]
  next[offeringKey] = list.length > maxRuns ? list.slice(-maxRuns) : list
  return next
}

module.exports = {
  normalizeOfferingKey,
  normalizeQuestionerLogs,
  normalizeFinalSegmentsLogs,
  buildQuestionerRunEntry,
  buildFinalSegmentsRunEntry,
  appendToOfferingLog,
  isLegacyFlatQuestioner,
}
