/** Same fact flattener the product uses before it renders an ambiguity corpus. */

function joinLabel(...parts) {
  return parts.filter(Boolean).join(' › ')
}

function pushFact(out, fact) {
  const value = String(fact.value ?? '').trim()
  if (!value) return
  out.push({
    section: fact.section || '',
    path: fact.path || '',
    label: fact.label || '',
    value,
    description: String(fact.description ?? '').trim(),
  })
}

function flattenItem(out, item, ctx) {
  const label = joinLabel(ctx.label, item.title || item.id)
  const itemId = ctx.itemId || item.id || ''
  const base = { section: label, sectionId: ctx.sectionId, itemId }

  switch (item.table_type) {
    case 'group':
      for (const table of item.tables || []) {
        flattenItem(out, table, { ...ctx, label, itemId })
      }
      break
    case 'operational_snapshot':
      for (const op of item.operations || []) {
        const opLabel = joinLabel(label, op.operation)
        const opKey = String(op.operation || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
        for (const field of op.fields || []) {
          pushFact(out, {
            ...base,
            section: opLabel,
            path: `${ctx.sectionId}.${itemId}.${opKey}.${field.field || ''}`,
            label: field.label || field.field,
            value: field.value,
            description: field.description,
          })
        }
      }
      break
    case 'records': {
      const columns = item.columns || []
      for (const record of item.records || []) {
        const cells = record.cells || {}
        const firstField = columns[0]?.field
        const rowName = firstField && cells[firstField]?.value ? cells[firstField].value : `Row ${record.row ?? ''}`
        const rowLabel = joinLabel(label, String(rowName).slice(0, 80))
        for (const column of columns) {
          const cell = cells[column.field]
          if (!cell) continue
          pushFact(out, {
            ...base,
            section: rowLabel,
            path: `${ctx.sectionId}.${itemId}.${column.field}`,
            label: cell.label || column.label || column.field,
            value: cell.value,
            description: cell.description,
          })
        }
      }
      break
    }
    default:
      for (const row of item.rows || []) {
        pushFact(out, {
          ...base,
          path: `${ctx.sectionId}.${itemId}.${row.field || ''}`,
          label: row.label || row.field,
          value: row.value,
          description: row.description,
        })
      }
      for (const table of item.tables || []) {
        flattenItem(out, table, { ...ctx, label, itemId })
      }
      break
  }
}

function flattenTier(tier) {
  if (!tier || typeof tier !== 'object') return []
  const out = []
  for (const section of tier.sections || []) {
    const sectionId = section.section_id || ''
    const label = section.section_title || sectionId || ''
    for (const item of section.items || []) {
      flattenItem(out, item, { sectionId, label, itemId: item.id })
    }
  }
  return out
}

function flattenContextColumn(raw) {
  const column = raw ?? {}
  const high = flattenTier(column.high ?? column.report_context_high ?? {})
  const all = flattenTier(column.all ?? column.report_context_all ?? {})
  const seen = new Set()
  const out = []
  for (const [tier, facts] of [['high', high], ['all', all]]) {
    for (const fact of facts) {
      const key = `${fact.path}|${fact.value}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ ...fact, tier })
    }
  }
  return out
}

module.exports = { flattenContextColumn }
