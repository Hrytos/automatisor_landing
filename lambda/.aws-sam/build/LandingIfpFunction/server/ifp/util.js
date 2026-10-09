const fs = require('fs')
const path = require('path')

function hostOf(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  }
}

function fillPrompt(template, values) {
  let out = template
  for (const [key, value] of Object.entries(values)) {
    out = out.replaceAll(`{{${key}}}`, value == null ? '' : String(value))
  }
  return out
}

function cleanOfferingText(value) {
  return String(value || '')
    .replace(/\s*\(\[[^\]]*\]\([^)]*\)(?:,\s*\[[^\]]*\]\([^)]*\))*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function cleanLine(value) {
  return cleanOfferingText(value)
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .replace(/^[-•]\s*/, '')
    .trim()
}

function asText(rows) {
  return (rows || [])
    .map((row) => String(row?.line || row || '').trim())
    .filter(Boolean)
    .join('\n')
}

function citationLines(citations) {
  const rows = Array.isArray(citations) ? citations : []
  if (!rows.length) return '(none)'
  return rows
    .map((row) => {
      if (typeof row === 'string') return `- ${row}`
      return `- ${row?.url || row}`
    })
    .join('\n')
}

function proofLines(points) {
  if (!Array.isArray(points) || !points.length) return '(none)'
  return points
    .map((point) => {
      const customer = String(point.customer || '').trim() || 'Unknown customer'
      const result = String(point.result || '').trim() || 'no result recorded'
      const url = String(point.url || '').trim()
      return `- ${customer}: ${result}${url ? ` (${url})` : ''}`
    })
    .join('\n')
}

function siblingLines(siblings, excludeName) {
  const names = (siblings || [])
    .map((name) => String(name || '').trim())
    .filter((name) => name && name !== excludeName)
  if (!names.length) return '(none)'
  return names.map((name) => `- ${name}`).join('\n')
}

function loadPrompt(name) {
  return fs.readFileSync(path.join(__dirname, 'prompts', name), 'utf8')
}

module.exports = {
  hostOf,
  fillPrompt,
  cleanOfferingText,
  cleanLine,
  asText,
  citationLines,
  proofLines,
  siblingLines,
  loadPrompt,
}
