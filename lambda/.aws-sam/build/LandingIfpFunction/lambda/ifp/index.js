/**
 * Public IFP function for the static landing site.
 * It runs only the IFP steps. It calls OpenAI with OPENAI_API_KEY.
 * It does not call the product proxy and it does not check a Supabase user.
 */

const { runIfpStep } = require('../../server/ifp')

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

function readBody(event) {
  const raw = event?.body || '{}'
  const text = event?.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw
  if (!text) return {}
  return JSON.parse(text)
}

exports.handler = async (event) => {
  const method = event?.requestContext?.http?.method || event?.httpMethod || 'POST'
  if (method === 'OPTIONS') return { statusCode: 204, headers: {}, body: '' }
  if (method !== 'POST') return json(405, { error: 'Use POST.' })

  const path = event?.rawPath || event?.path || ''
  const fromPath = path.split('/').filter(Boolean).pop() || ''

  let body
  try {
    body = readBody(event)
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }

  const step = fromPath && fromPath !== 'ifp' ? fromPath : body.step
  try {
    const result = await runIfpStep(step, body)
    return json(200, result)
  } catch (err) {
    const status = err.status || 400
    return json(status, { error: err.message || 'IFP step failed' })
  }
}
