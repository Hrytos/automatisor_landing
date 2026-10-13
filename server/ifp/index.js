const sessionMod = require('./session')
const steps = require('./run')
const { saveLead } = require('./leads')
const { getDemoSites } = require('./corpus')
const {
  getCachedOfferings,
  getCachedFit,
  persistMasterForStep,
  syncCoreFromSession,
} = require('./landingDb')
const { hostOf } = require('./util')

const { cloneSession, clearFromFit, clearFromSegments } = sessionMod

async function findOfferingsWithCache(body) {
  if (!body.refreshOfferings) {
    const host = hostOf(body.session?.company?.domain)
    const cached = host ? await getCachedOfferings(host) : null
    if (cached?.length) {
      const next = cloneSession(body.session)
      clearFromFit(next)
      next.offerings = cached
      next.selectedOffering = null
      next.stage = 'offerings'
      return { session: next, fromCache: { offerings: true } }
    }
  }
  const session = await steps.findOfferings(body.session)
  return { session }
}

async function buildFitWithCache(body) {
  if (!body.refreshFit) {
    const host = hostOf(body.session?.company?.domain)
    const name = body.session?.selectedOffering?.name
    if (host && name) {
      const cached = await getCachedFit(host, name)
      if (cached?.fit) {
        const next = cloneSession(body.session)
        const wanted = String(cached.selectedOfferingName || name).trim().toLowerCase()
        const offering = next.offerings?.find((row) => row.name.toLowerCase() === wanted)
        if (offering) next.selectedOffering = offering
        else if (next.selectedOffering?.name) { /* keep select step choice */ }
        next.fit = cached.fit
        clearFromSegments(next)
        next.stage = 'fit'
        return { session: next, fromCache: { fit: true } }
      }
    }
  }
  const session = await steps.buildFit(body.session)
  return { session }
}

const STEP_HANDLERS = {
  company: (body) => steps.setCompany(body.session, { name: body.name, domain: body.domain }),
  offerings: (body) => findOfferingsWithCache(body),
  select: (body) => steps.selectOffering(body.session, body.name),
  fit: (body) => buildFitWithCache(body),
  // Recommend profiles, then question every one of them. Callers do not
  // pick a subset, and there is no pause on the segments stage.
  segments: async (body) => {
    const recommended = await steps.recommendSegments(body.session)
    return steps.buildQuestions(recommended)
  },
  questions: (body) => steps.buildQuestions(body.session),
  answers: (body) => steps.submitAnswers(body.session, body.answers),
  finalize: (body) => steps.finalizeSegments(body.session),
}

async function runIfpStep(step, body = {}) {
  if (step === 'lead') {
    if (body.session) await syncCoreFromSession(body.session)
    await saveLead(body)
    return { ok: true }
  }
  if (step === 'demo-sites') {
    return { sites: await getDemoSites() }
  }

  const handler = STEP_HANDLERS[step]
  if (!handler) {
    const err = new Error(`Unknown IFP step "${step}".`)
    err.status = 404
    throw err
  }
  const result = await handler(body)
  const session = result?.session ?? result
  await persistMasterForStep(step, session)
  if (result?.session) return result
  return { session: result }
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
  ...sessionMod,
  ...steps,
  runIfpStep,
  ifpRouter,
}
