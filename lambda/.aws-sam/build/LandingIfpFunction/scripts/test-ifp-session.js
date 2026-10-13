const assert = require('node:assert/strict')

process.env.OPENAI_LAMBDA_URL = 'https://lambda.example/openai/chat'
process.env.SUPABASE_URL = 'https://supabase.example'
process.env.SUPABASE_ANON_KEY = 'anon-key'
process.env.SUPABASE_EMAIL = 'svc@example.com'
process.env.SUPABASE_PASSWORD = 'secret'
process.env.OPENAI_MODEL = 'gpt-5.6-luna'

const calls = []

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload)
    },
  }
}

function responsePayload(text) {
  return {
    output_text: text,
    output: [{ type: 'web_search_call' }, { type: 'message', content: [{ text }] }],
  }
}

function chatPayload(text) {
  return { choices: [{ message: { content: text } }] }
}

global.fetch = async (url, options = {}) => {
  const href = String(url)
  const body = options.body ? JSON.parse(options.body) : null
  calls.push({ href, body, authorization: options.headers?.Authorization || '' })

  if (href === 'https://api.openai.com/v1/responses' || href === 'https://api.openai.com/v1/chat/completions') {
    return jsonResponse(200, responsePayload(JSON.stringify({
      note: '',
      sources: [],
      offerings: [{
        name: 'Direct',
        description: 'Called OpenAI',
        source_url: 'https://acme.com/direct',
        kind: 'software',
        confidence: 'High',
        why: 'direct',
        citations: [],
        proof_points: [],
      }],
    })))
  }

  if (href.includes('/rest/v1/accounts?')) {
    return jsonResponse(200, [{ account_id: 'e68c4248-ee65-48e2-ac20-221aefd5bd1a', company_name: 'Northline' }])
  }
  if (href.includes('/rest/v1/account_sites')) {
    return jsonResponse(200, [{
      site_id: '779ae75c-49d5-4845-b011-6f8f24293d39',
      account_id: 'e68c4248-ee65-48e2-ac20-221aefd5bd1a',
      full_address: '1100 Valley Rd, Oconomowoc, WI 53066',
    }])
  }
  const researchContext = {
    high: {
      sections: [{
        section_id: 'ops',
        section_title: 'Operations',
        items: [{
          id: 'pick',
          title: 'Picking',
          table_type: 'key_value',
          rows: [{
            field: 'method',
            label: 'Method',
            value: 'manual jack',
            description: 'Picks one pallet at a time with a manual jack.',
          }],
        }],
      }],
    },
  }
  if (href.includes('/rest/v1/automatisor_account_research')) {
    return jsonResponse(200, [{
      account_id: 'e68c4248-ee65-48e2-ac20-221aefd5bd1a',
      account_level_context: researchContext,
    }])
  }
  if (href.includes('/rest/v1/automatisor_site_research')) {
    return jsonResponse(200, [{
      site_id: '779ae75c-49d5-4845-b011-6f8f24293d39',
      account_id: 'e68c4248-ee65-48e2-ac20-221aefd5bd1a',
      site_level_context: researchContext,
    }])
  }

  if (href.includes('/auth/v1/token')) {
    return jsonResponse(200, {
      access_token: 'user-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    })
  }

  if (href.endsWith('/openai/responses')) {
    if (body.max_tool_calls === 6) {
      return jsonResponse(200, responsePayload(JSON.stringify({
        note: '',
        name: 'Widget',
        goodFit: [{ line: 'High volume pallet pick', source: 'published', why: 'core', url: 'https://acme.com' }],
        badFit: [{ line: 'Manual only sheds', source: 'derived', why: 'no fit', url: '' }],
        citations: [],
        sources: [],
      })))
    }
    return jsonResponse(200, responsePayload(JSON.stringify({
      note: '',
      sources: ['https://acme.com'],
      offerings: [
        {
          name: 'Widget',
          description: 'Pallet software',
          source_url: 'https://acme.com/widget',
          kind: 'software',
          confidence: 'High',
          why: 'primary',
          citations: ['https://acme.com/widget'],
          proof_points: [{ customer: 'North', result: 'faster picks', url: 'https://acme.com/case' }],
        },
        {
          name: 'Other',
          description: 'Yard tool',
          source_url: 'https://acme.com/other',
          kind: 'product',
          confidence: 'Low',
          why: 'side',
          citations: [],
          proof_points: [],
        },
      ],
    })))
  }

  if (href.endsWith('/openai/chat')) {
    const prompt = body.messages[0].content
    if (prompt.includes('<research_corpus')) {
      assert.match(prompt, /sites="1"/)
      assert.match(prompt, /accounts="1"/)
      assert.match(prompt, /1100 Valley Rd/)
      assert.match(prompt, /manual jack/)
      if (prompt.includes('Single pallet jack')) {
        return jsonResponse(200, chatPayload(JSON.stringify({
          ambiguous: true,
          reading: 'two meanings',
          questions: [{
            id: 'q1',
            question: 'Does single mean one pallet or a manual jack?',
            options: [{ label: 'One pallet at a time' }, { label: 'Manual jack' }],
          }],
        })))
      }
      return jsonResponse(200, chatPayload(JSON.stringify({
        ambiguous: false,
        reading: 'nothing to ask',
        questions: [],
      })))
    }
    if (prompt.includes('clarifying questions')) {
      return jsonResponse(200, chatPayload(JSON.stringify({
        resolved: 'Sites whose pick path is a manual pallet jack, one pallet at a time.',
        assumptions: ['manual means unpowered'],
      })))
    }
    return jsonResponse(200, chatPayload(JSON.stringify({
      note: '',
      name: 'Widget',
      segments: [
        { rank: 1, name: 'Manual jack sites', axis: 'operation', criteria: 'Single pallet jack pick path', why: 'core motion' },
        { rank: 2, name: 'High volume', axis: 'scale', criteria: 'More than 5000 cases a day', why: 'volume' },
      ],
    })))
  }

  if (href.endsWith('/rest/v1/landing_page_ifp') && options.method === 'POST') {
    return jsonResponse(201, {})
  }

  throw new Error(`Unexpected URL ${href}`)
}

const {
  setCompany,
  findOfferings,
  selectOffering,
  buildFit,
  submitAnswers,
  finalizeSegments,
  runIfpStep,
} = require('../server/ifp')

async function main() {
  await assert.rejects(() => runIfpStep('missing', {}), /Unknown IFP step/)

  let session = (await runIfpStep('company', { name: 'Acme', domain: 'https://www.acme.com/about' })).session
  assert.equal(session.stage, 'company')
  assert.equal(session.company.domain, 'acme.com')
  assert.equal(session.company.name, 'Acme')

  session = await findOfferings(session)
  assert.equal(session.stage, 'offerings')
  assert.equal(session.offerings.length, 2)

  session = selectOffering(session, 'Widget')
  assert.equal(session.selectedOffering.name, 'Widget')

  session = await buildFit(session)
  assert.equal(session.stage, 'fit')
  assert.match(session.fit.goodFitText, /High volume pallet pick/)
  assert.match(session.fit.badFitText, /Manual only sheds/)

  const switched = selectOffering(session, 'Other')
  assert.equal(switched.stage, 'offerings')
  assert.equal(switched.fit, null)
  assert.equal(switched.segments.length, 0)
  assert.equal(session.fit.name, 'Widget')

  session = (await runIfpStep('segments', { session })).session
  assert.equal(session.stage, 'questions')
  assert.equal(session.segments.length, 2)
  assert.deepEqual(session.segments.map((row) => row.axis), ['operation', 'scale'])
  assert.equal(session.questions.length, 1)
  assert.equal(session.questions[0].segmentRank, 1)
  assert.equal(session.questions[0].options.at(-1).freeText, true)

  session = submitAnswers(session, [{
    segmentRank: 1,
    id: 'q1',
    answer: 'One pallet at a time',
  }])
  assert.equal(session.answers[0].question, 'Does single mean one pallet or a manual jack?')

  session = await finalizeSegments(session)
  assert.equal(session.stage, 'final')
  assert.equal(session.finalSegments[0].criteria, 'Sites whose pick path is a manual pallet jack, one pallet at a time.')
  assert.deepEqual(session.finalSegments[0].assumptions, ['manual means unpowered'])
  assert.equal(session.finalSegments[1].criteria, 'More than 5000 cases a day')
  assert.deepEqual(session.finalSegments[1].assumptions, [])

  for (const segment of session.finalSegments) {
    assert.equal(segment.account_id, undefined)
    assert.equal(segment.site_id, undefined)
    assert.equal(segment.score, undefined)
    assert.equal(segment.fitment, undefined)
  }

  const reset = setCompany(session, { name: 'Beta', domain: 'beta.com' })
  assert.equal(reset.stage, 'company')
  assert.deepEqual(reset.offerings, [])
  assert.equal(reset.selectedOffering, null)
  assert.equal(reset.fit, null)
  assert.deepEqual(reset.segments, [])
  assert.deepEqual(reset.finalSegments, [])
  assert.equal(session.stage, 'final')

  assert.equal(calls.filter((call) => call.href.includes('/auth/v1/token')).length, 1)
  assert.ok(calls.some((call) => call.href === 'https://lambda.example/openai/responses'))
  assert.ok(calls.some((call) => call.href === 'https://lambda.example/openai/chat'))
  assert.equal(calls.some((call) => call.href.includes('api.openai.com')), false)
  assert.ok(calls.filter((call) => call.href.includes('lambda.example')).every((call) => call.authorization === 'Bearer user-token'))

  const chatPrompts = calls
    .filter((call) => call.href.endsWith('/openai/chat'))
    .map((call) => call.body.messages[0].content)
  assert.equal(chatPrompts.filter((prompt) => prompt.includes('<research_corpus')).length, 2)
  assert.equal(chatPrompts.some((prompt) => /rank each site/i.test(prompt)), false)

  process.env.OPENAI_API_KEY = 'sk-test'
  const before = calls.length
  const directSession = await findOfferings(setCompany(null, { name: 'Acme', domain: 'acme.com' }))
  const directCall = calls.slice(before).find((call) => call.href.startsWith('https://api.openai.com/'))
  assert.equal(directCall.href, 'https://api.openai.com/v1/responses')
  assert.equal(directCall.authorization, 'Bearer sk-test')
  assert.equal(directSession.offerings[0].name, 'Direct')
  delete process.env.OPENAI_API_KEY

  const { handler } = require('../lambda/ifp')
  const denied = await handler({
    requestContext: { http: { method: 'POST' } },
    rawPath: '/nope',
    body: '{}',
  })
  assert.equal(denied.statusCode, 404)
  const preflight = await handler({ requestContext: { http: { method: 'OPTIONS' } }, rawPath: '/company' })
  assert.equal(preflight.statusCode, 204)

  await assert.rejects(() => runIfpStep('lead', { domain: 'acme.com', email: 'ada@gmail.com' }), /work email/)
  const beforeLead = calls.length
  const saved = await runIfpStep('lead', { domain: 'https://www.acme.com/about', email: 'Ada@acme.com' })
  assert.deepEqual(saved, { ok: true })
  const leadCall = calls.slice(beforeLead).find((call) => call.href.endsWith('/rest/v1/landing_page_ifp'))
  assert.equal(leadCall.body.domain, 'acme.com')
  assert.equal(leadCall.body.email, 'ada@acme.com')

  console.log('ifp session ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
