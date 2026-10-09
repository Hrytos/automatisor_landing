/** JSON schemas for the Responses API calls. Copied from the product onboarding service. */

const OFFERINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['note', 'sources', 'offerings'],
  properties: {
    note: { type: 'string' },
    sources: { type: 'array', items: { type: 'string' } },
    offerings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'source_url', 'kind', 'confidence', 'why', 'citations', 'proof_points'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          source_url: { type: 'string' },
          kind: { type: 'string', enum: ['product', 'software', 'service'] },
          confidence: { type: 'string', enum: ['High', 'Medium', 'Low'] },
          why: { type: 'string' },
          citations: { type: 'array', items: { type: 'string' } },
          proof_points: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['customer', 'result', 'url'],
              properties: {
                customer: { type: 'string' },
                result: { type: 'string' },
                url: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
}

const FIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['note', 'name', 'goodFit', 'badFit', 'citations', 'sources'],
  properties: {
    note: { type: 'string' },
    name: { type: 'string' },
    goodFit: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['line', 'source', 'why', 'url'],
        properties: {
          line: { type: 'string' },
          source: { type: 'string', enum: ['published', 'derived'] },
          why: { type: 'string' },
          url: { type: 'string' },
        },
      },
    },
    badFit: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['line', 'source', 'why', 'url'],
        properties: {
          line: { type: 'string' },
          source: { type: 'string', enum: ['published', 'derived'] },
          why: { type: 'string' },
          url: { type: 'string' },
        },
      },
    },
    citations: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'string' } },
  },
}

module.exports = { OFFERINGS_SCHEMA, FIT_SCHEMA }
