/**
 * The only state object for the landing IFP flow.
 * Nothing here is an account, a facility, or a saved portfolio row.
 */

const STAGES = ['company', 'offerings', 'fit', 'segments', 'questions', 'final']

function createIfpSession() {
  return {
    stage: 'company',
    company: { name: '', domain: '' },
    offerings: [],
    selectedOffering: null,
    fit: null,
    segments: [],
    questions: [],
    answers: [],
    finalSegments: [],
  }
}

function cloneSession(session) {
  if (!session || typeof session !== 'object') return createIfpSession()
  return structuredClone(session)
}

function clearFromOfferings(session) {
  session.offerings = []
  session.selectedOffering = null
  clearFromFit(session)
}

function clearFromFit(session) {
  session.fit = null
  clearFromSegments(session)
}

function clearFromSegments(session) {
  session.segments = []
  session.questions = []
  session.answers = []
  session.finalSegments = []
}

function assertStageAtLeast(session, stage) {
  if (STAGES.indexOf(session.stage) < STAGES.indexOf(stage)) {
    throw new Error(`IFP session is at "${session.stage}". Complete "${stage}" first.`)
  }
}

module.exports = {
  STAGES,
  createIfpSession,
  cloneSession,
  clearFromOfferings,
  clearFromFit,
  clearFromSegments,
  assertStageAtLeast,
}
