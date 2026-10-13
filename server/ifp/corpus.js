/**
 * Research text for the default accounts in defaultApprovalPortfolio.json.
 * Used only as the ambiguity.md corpus. Nothing here is ranked or saved.
 */

const portfolio = require('./defaultApprovalPortfolio.json')
const { flattenContextColumn } = require('./flatten')

let cached = null

function env(name) {
  return String(process.env[name] || '').trim()
}

function factsFrom(column) {
  const out = []
  for (const fact of flattenContextColumn(column)) {
    const text = String(fact.description || '').trim()
    if (!text) continue
    out.push({ section: fact.section, label: fact.label, text })
  }
  return out
}

function renderBlock(unit, header, tag) {
  const lines = [header]
  for (const fact of unit.facts) lines.push(`  ${tag} | ${fact.section} | ${fact.label}: ${fact.text}`)
  return lines.join('\n')
}

function addressOf(site) {
  if (!site) return ''
  return site.full_address || [site.street, site.city, site.state, site.zip].filter(Boolean).join(', ')
}

function idsIn(values) {
  return `(${values.map((id) => encodeURIComponent(id)).join(',')})`
}

async function restGet(path) {
  const supabaseUrl = env('SUPABASE_URL').replace(/\/$/, '')
  const anonKey = env('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY for the default account context.')
  }
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
    },
  })
  const text = await res.text()
  let payload = []
  try {
    payload = text ? JSON.parse(text) : []
  } catch {
    payload = { message: text.slice(0, 200) }
  }
  if (!res.ok) {
    const message = payload?.message || payload?.error || `Could not read default account context (${res.status})`
    throw new Error(message)
  }
  return payload
}

async function loadDefaultCorpus() {
  const entries = Array.isArray(portfolio.accounts) ? portfolio.accounts : []
  const accountIds = entries.map((entry) => String(entry.accountId || '').trim()).filter(Boolean)
  const siteIds = entries.flatMap((entry) => (entry.siteIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  if (!accountIds.length || !siteIds.length) {
    throw new Error('Default account config has no accounts.')
  }

  const [accountRows, siteRows, accountResearch, siteResearch] = await Promise.all([
    restGet(`accounts?account_id=in.${idsIn(accountIds)}&select=account_id,company_name`),
    restGet(`account_sites?site_id=in.${idsIn(siteIds)}&select=site_id,account_id,full_address,street,city,state,zip`),
    restGet(`automatisor_account_research?account_id=in.${idsIn(accountIds)}&select=account_id,account_level_context`),
    restGet(`automatisor_site_research?site_id=in.${idsIn(siteIds)}&select=site_id,account_id,site_level_context`),
  ])

  const nameByAccount = new Map((accountRows || []).map((row) => [row.account_id, row.company_name || row.account_id]))
  const addressBySite = new Map((siteRows || []).map((row) => [row.site_id, addressOf(row)]))
  const accountFactsById = new Map(
    (accountResearch || []).map((row) => [row.account_id, factsFrom(row.account_level_context)]),
  )
  const siteFactsById = new Map(
    (siteResearch || []).map((row) => [row.site_id, factsFrom(row.site_level_context)]),
  )

  const accounts = []
  let siteCount = 0
  for (const entry of entries) {
    const sites = []
    for (const siteId of entry.siteIds || []) {
      const facts = siteFactsById.get(siteId) || []
      if (!facts.length) continue
      sites.push({
        address: addressBySite.get(siteId) || siteId,
        facts,
      })
    }
    if (!sites.length) continue
    const name = nameByAccount.get(entry.accountId) || entry.accountId
    accounts.push({
      name,
      facts: accountFactsById.get(entry.accountId) || [],
      sites,
    })
    siteCount += sites.length
  }

  if (!accounts.length) {
    throw new Error('Default accounts have no research context to clarify against.')
  }

  const text = accounts
    .map((account) => {
      const blocks = [renderBlock(account, `ACCOUNT-LEVEL RESEARCH: ${account.name}`, `[ACCOUNT ${account.name}]`)]
      for (const site of account.sites) {
        blocks.push(renderBlock(site, `SITE-LEVEL RESEARCH: ${site.address}`, `[SITE ${site.address}]`))
      }
      return blocks.join('\n\n')
    })
    .join('\n\n')

  const demoSites = []
  for (const entry of entries) {
    const accountName = nameByAccount.get(entry.accountId) || entry.accountId
    for (const siteId of entry.siteIds || []) {
      const address = addressBySite.get(siteId)
      if (!address) continue
      demoSites.push({ accountName, address })
    }
  }

  return { text, accountCount: accounts.length, siteCount, demoSites }
}

async function getDemoSites() {
  const { demoSites } = await getDefaultCorpus()
  return demoSites
}

async function getDefaultCorpus() {
  if (!cached) cached = await loadDefaultCorpus()
  return cached
}

function resetDefaultCorpus() {
  cached = null
}

module.exports = { getDefaultCorpus, getDemoSites, resetDefaultCorpus }
