const { hostOf } = require('./util')

const TABLE = 'landing_page_ifp'

const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.ca', 'yahoo.com.au', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'outlook.co.uk', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com',
  'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.net', 'gmx.de',
  'mail.com', 'email.com', 'inbox.com',
  'zoho.com', 'yandex.com', 'yandex.ru',
  'qq.com', '163.com', '126.com', 'rediffmail.com',
  'fastmail.com', 'hey.com', 'tutanota.com', 'tuta.com',
]

function env(name) {
  return String(process.env[name] || '').trim()
}

function isWorkEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  const domain = email.split('@')[1] || ''
  if (!email.includes('@') || !domain.includes('.') || domain.includes(' ')) return false
  return !PERSONAL_EMAIL_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))
}

async function saveLead({ domain, email } = {}) {
  const host = hostOf(domain)
  const workEmail = String(email || '').trim().toLowerCase()
  if (!host) throw new Error('Enter a company domain first.')
  if (!isWorkEmail(workEmail)) {
    throw new Error('Use your work email. Personal addresses such as Gmail, Yahoo, and Outlook are not accepted.')
  }

  const supabaseUrl = env('SUPABASE_URL').replace(/\/$/, '')
  const anonKey = env('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY')

  const res = await fetch(`${supabaseUrl}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ domain: host, email: workEmail }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`landing_page_ifp insert failed (${res.status}): ${text.slice(0, 300)}`)
    throw new Error('Could not save your email. Try again.')
  }
}

module.exports = { saveLead, isWorkEmail }
