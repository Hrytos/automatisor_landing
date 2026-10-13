const crypto = require('node:crypto')
const { getSupabaseAccessToken } = require('./openai')
const { hostOf } = require('./util')
const {
  normalizeOfferingKey,
  normalizeQuestionerLogs,
  normalizeFinalSegmentsLogs,
  buildQuestionerRunEntry,
  buildFinalSegmentsRunEntry,
  appendToOfferingLog,
} = require('./masterLogs')

const MASTER_TABLE = 'landing_ifp_master'

function env(name) {
  return String(process.env[name] || '').trim()
}

function supabaseRest() {
  const supabaseUrl = env('SUPABASE_URL').replace(/\/$/, '')
  const anonKey = env('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) return null
  return { supabaseUrl, anonKey }
}

async function readBearerToken() {
  const serviceRole = env('SUPABASE_SERVICE_ROLE_KEY')
  if (serviceRole) return serviceRole
  return getSupabaseAccessToken()
}

async function masterRequest(method, query, body) {
  const config = supabaseRest()
  if (!config) return null
  let token
  try {
    token = await readBearerToken()
  } catch (err) {
    console.warn(`landing_ifp_master ${method} skipped: ${err.message}`)
    return null
  }

  const suffix = query ? `?${query}` : ''
  const url = `${config.supabaseUrl}/rest/v1/${MASTER_TABLE}${suffix}`
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    headers.Prefer = method === 'POST' ? 'return=minimal,resolution=merge-duplicates' : 'return=minimal'
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    console.warn(`landing_ifp_master ${method} failed (${res.status}): ${text.slice(0, 200)}`)
    return null
  }
  if (method === 'GET') return res.json()
  return true
}

function normalizeOfferingName(name) {
  return String(name || '').trim().toLowerCase()
}

function packStoredFit(offeringName, fit) {
  if (!fit || typeof fit !== 'object') return null
  const name = normalizeOfferingName(offeringName || fit.name)
  if (!name) return null
  return { offering_name: name, ...fit }
}

function sessionFitFromStored(stored) {
  if (!stored || typeof stored !== 'object') return null
  const { offering_name: _ignored, ...profile } = stored
  return Object.keys(profile).length ? profile : null
}

async function getMasterRow(domain) {
  const host = hostOf(domain)
  if (!host) return null
  const rows = await masterRequest(
    'GET',
    `domain=eq.${encodeURIComponent(host)}&select=domain,offerings,fits,questioner,final_segments&limit=1`,
  )
  return rows?.[0] || null
}

async function upsertMaster(domain, patch) {
  const host = hostOf(domain)
  if (!host || !patch || !Object.keys(patch).length) return false
  const stamp = { ...patch, updated_at: new Date().toISOString() }
  const existing = await getMasterRow(host)
  if (existing) {
    return masterRequest('PATCH', `domain=eq.${encodeURIComponent(host)}`, stamp)
  }
  return masterRequest('POST', '', {
    domain: host,
    fits: {},
    ...stamp,
  })
}

async function getCachedOfferings(domain) {
  const row = await getMasterRow(domain)
  const list = row?.offerings
  return Array.isArray(list) && list.length ? list : null
}

async function getCachedFit(domain, offeringName) {
  const host = hostOf(domain)
  const key = normalizeOfferingName(offeringName)
  if (!host || !key) return null
  const row = await getMasterRow(host)
  const stored = row?.fits?.[key]
  const fit = sessionFitFromStored(stored)
  if (!fit) return null
  return { fit, selectedOfferingName: offeringName }
}

async function saveOfferings(domain, offerings) {
  if (!Array.isArray(offerings) || !offerings.length) return
  await upsertMaster(domain, { offerings })
}

async function saveFit(domain, offeringName, fit) {
  const host = hostOf(domain)
  const key = normalizeOfferingName(offeringName)
  const packed = packStoredFit(offeringName, fit)
  if (!host || !key || !packed) return
  const row = await getMasterRow(host)
  const fits = { ...(row?.fits && typeof row.fits === 'object' ? row.fits : {}), [key]: packed }
  await upsertMaster(host, { fits })
}

async function appendRunLogs(domain, session) {
  const host = hostOf(domain)
  if (!host) return
  const offeringLabel = offeringNameForFit(session)
  const offeringKey = normalizeOfferingKey(offeringLabel)
  if (!offeringKey) return
  if (!Array.isArray(session?.finalSegments) || !session.finalSegments.length) return

  const runId = crypto.randomUUID()
  const completedAt = new Date().toISOString()
  const questionerEntry = buildQuestionerRunEntry(session, { runId, completedAt, offeringLabel })
  const finalEntry = buildFinalSegmentsRunEntry(session, { runId, completedAt, offeringLabel })

  const row = await getMasterRow(host)
  const questioner = appendToOfferingLog(
    normalizeQuestionerLogs(row?.questioner),
    offeringKey,
    questionerEntry,
  )
  const final_segments = appendToOfferingLog(
    normalizeFinalSegmentsLogs(row?.final_segments),
    offeringKey,
    finalEntry,
  )

  await upsertMaster(host, { questioner, final_segments })
}

async function ensureMasterRow(domain, { required = false } = {}) {
  const host = hostOf(domain)
  if (!host) {
    if (required) throw new Error('Enter a company domain first.')
    return false
  }
  const existing = await getMasterRow(host)
  if (existing) return true
  const created = await masterRequest('POST', '', {
    domain: host,
    fits: {},
    updated_at: new Date().toISOString(),
  })
  if (!created && required) {
    throw new Error(
      'Could not create the vendor profile row. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_EMAIL and SUPABASE_PASSWORD in .env, then restart the server.',
    )
  }
  return Boolean(created || existing)
}

function offeringNameForFit(session) {
  return session?.selectedOffering?.name || session?.fit?.name || ''
}

/** Offerings + fits map — always sync when present (finalize/lead used to skip these). */
async function syncCoreFromSession(session) {
  const domain = session?.company?.domain
  if (!domain) return
  await ensureMasterRow(domain)
  if (Array.isArray(session.offerings) && session.offerings.length) {
    await saveOfferings(domain, session.offerings)
  }
  const fitName = offeringNameForFit(session)
  if (session?.fit && fitName) {
    await saveFit(domain, fitName, session.fit)
  }
}

/** Persist landing_ifp_master after each IFP step (email lead is separate). */
async function persistMasterForStep(step, session) {
  const domain = session?.company?.domain
  if (!domain) return

  if (step !== 'company') {
    await syncCoreFromSession(session)
  }

  switch (step) {
    case 'company':
      await ensureMasterRow(domain)
      break
    case 'offerings':
    case 'select':
    case 'fit':
      break
    case 'segments':
    case 'questions':
    case 'answers':
      break
    case 'finalize':
      await appendRunLogs(domain, session)
      break
    default:
      break
  }
}

module.exports = {
  MASTER_TABLE,
  normalizeOfferingName,
  packStoredFit,
  sessionFitFromStored,
  getCachedOfferings,
  getCachedFit,
  saveOfferings,
  saveFit,
  ensureMasterRow,
  syncCoreFromSession,
  persistMasterForStep,
}
