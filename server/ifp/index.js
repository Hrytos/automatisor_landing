const session = require('./session')
const steps = require('./run')

const STEP_HANDLERS = {
  company: (body) => steps.setCompany(body.session, { name: body.name, domain: body.domain }),
  offerings: (body) => steps.findOfferings(body.session),
  select: (body) => steps.selectOffering(body.session, body.name),
  fit: (body) => steps.buildFit(body.session),
  segments: (body) => steps.recommendSegments(body.session),
  questions: (body) => steps.buildQuestions(body.session),
  answers: (body) => steps.submitAnswers(body.session, body.answers),
  finalize: (body) => steps.finalizeSegments(body.session),
}

async function runIfpStep(step, body = {}) {
  const handler = STEP_HANDLERS[step]
  if (!handler) {
    const err = new Error(`Unknown IFP step "${step}".`)
    err.status = 404
    throw err
  }
  const next = await handler(body)
  return { session: next }
}

function ifpRouter() {
  const express = require('express')
  const router = express.Router()

  router.post('/:step', async (req, res) => {
    try {
      const result = await runIfpStep(req.params.step, req.body || {})
      res.json(result)
    } catch (err) {
      const status = err.status || 400
      res.status(status).json({ error: err.message || 'IFP step failed' })
    }
  })

  return router
}

module.exports = {
  ...session,
  ...steps,
  runIfpStep,
  ifpRouter,
}
