/**
 * Model transport for the IFP steps.
 * OPENAI_API_KEY set: call api.openai.com directly (the landing Lambda).
 * Otherwise: call the product OpenAI Lambda with a Supabase user token (local server).
 */

const RETRYABLE = new Set([429, 500, 502, 503, 504])
const DEFAULT_MODEL = 'gpt-5.6-luna'

let cachedAuth = null

function env(name) {
  return String(process.env[name] || '').trim()
}

function modelName() {
  return env('OPENAI_MODEL') || DEFAULT_MODEL
}

function lambdaBaseUrl() {
  const raw = env('OPENAI_LAMBDA_URL').replace(/\/$/, '')
  if (!raw) return ''
  if (raw.endsWith('/openai/chat')) return raw.slice(0, -'/openai/chat'.length)
  if (raw.endsWith('/openai/responses')) return raw.slice(0, -'/openai/responses'.length)
  return raw
}

function requireLambdaBase() {
  const base = lambdaBaseUrl()
  if (!base) throw new Error('Missing OPENAI_LAMBDA_URL')
  return base
}

function resetAuthCache() {
  cachedAuth = null
}

async function readJson(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: { message: text.slice(0, 200) } }
  }
}

async function requestToken(body) {
  const supabaseUrl = env('SUPABASE_URL').replace(/\/$/, '')
  const anonKey = env('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY')
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=${body.grant_type}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const payload = await readJson(res)
  if (!res.ok || !payload.access_token) {
    const message = payload?.error_description || payload?.msg || payload?.error?.message || payload?.error || 'Supabase sign-in failed'
    throw new Error(typeof message === 'string' ? message : 'Supabase sign-in failed')
  }
  return payload
}

async function accessToken() {
  const now = Date.now()
  if (cachedAuth && cachedAuth.expiresAt - 60_000 > now) return cachedAuth.accessToken

  if (!env('SUPABASE_EMAIL') || !env('SUPABASE_PASSWORD')) {
    throw new Error('Missing SUPABASE_EMAIL or SUPABASE_PASSWORD')
  }

  const payload = cachedAuth?.refreshToken
    ? await requestToken({ grant_type: 'refresh_token', refresh_token: cachedAuth.refreshToken }).catch(() => null)
    : null

  const session = payload?.access_token
    ? payload
    : await requestToken({
        grant_type: 'password',
        email: env('SUPABASE_EMAIL'),
        password: env('SUPABASE_PASSWORD'),
      })

  cachedAuth = {
    accessToken: session.access_token,
    refreshToken: session.refresh_token || cachedAuth?.refreshToken || '',
    expiresAt: now + (Number(session.expires_in) || 3600) * 1000,
  }
  return cachedAuth.accessToken
}

function collectResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text) return payload.output_text
  return (payload?.output || [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content || [])
    .map((part) => part.text || '')
    .join('')
}

function countSearches(payload) {
  return (payload?.output || []).filter((item) => item.type === 'web_search_call').length
}

function useDirect() {
  return Boolean(env('OPENAI_API_KEY'))
}

async function postOpenAi(apiPath, body, { retries = 1 } = {}) {
  const key = env('OPENAI_API_KEY')
  if (!key) throw new Error('Missing OPENAI_API_KEY')
  const url = `https://api.openai.com/v1/${apiPath}`
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const payload = await readJson(res)
    if (res.ok) return payload

    const message = payload?.error?.message || `OpenAI request failed (${res.status})`
    const err = new Error(message)
    err.status = res.status
    lastError = err
    if (!RETRYABLE.has(res.status) || attempt >= retries) throw err
    await new Promise((done) => setTimeout(done, 1500 * 2 ** attempt))
  }

  throw lastError
}

async function postModel(pathName, body, options) {
  if (useDirect()) {
    const apiPath = pathName.endsWith('/responses') ? 'responses' : 'chat/completions'
    return postOpenAi(apiPath, body, options)
  }
  return postLambda(pathName, body, options)
}

async function postLambda(pathName, body, { retries = 1 } = {}) {
  const url = `${requireLambdaBase()}${pathName}`
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const token = await accessToken()
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const payload = await readJson(res)
    if (res.ok) return payload

    const message = payload?.error?.message || `Lambda request failed (${res.status})`
    const err = new Error(message)
    err.status = res.status
    lastError = err

    if (res.status === 401 && attempt < retries) {
      resetAuthCache()
      continue
    }
    if (!RETRYABLE.has(res.status) || attempt >= retries) throw err
    await new Promise((done) => setTimeout(done, 1500 * 2 ** attempt))
  }

  throw lastError
}

async function responses(prompt, { schema, maxSearches = 8, retries = 1 } = {}) {
  const body = {
    model: modelName(),
    input: prompt,
    tools: [{ type: 'web_search' }],
    max_tool_calls: maxSearches,
  }
  if (schema) {
    body.text = { format: { type: 'json_schema', name: 'research', strict: true, schema } }
  }

  const payload = await postModel('/openai/responses', body, { retries })
  const raw = collectResponseText(payload)
  if (!raw) throw new Error('Model returned an empty response')

  let data = raw
  if (schema) {
    try {
      data = JSON.parse(raw)
    } catch {
      throw new Error(`Model returned non-JSON: ${raw.slice(0, 200)}`)
    }
  }

  return { data, searches: countSearches(payload), model: modelName() }
}

async function chatJson(prompt) {
  const payload = await postModel('/openai/chat', {
    model: modelName(),
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  })
  const text = payload?.choices?.[0]?.message?.content
  if (!text) throw new Error('Model returned an empty response')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Model returned non-JSON: ${String(text).slice(0, 200)}`)
  }
}

module.exports = {
  resetAuthCache,
  responses,
  chatJson,
}
