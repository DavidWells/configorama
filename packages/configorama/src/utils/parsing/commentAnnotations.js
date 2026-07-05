const KNOWN_TAGS = new Set([
  'description',
  'from',
  'example',
  'default',
  'sensitive',
  'group',
  'deprecated',
])

function toLines(input) {
  if (Array.isArray(input)) return input
  if (input === undefined || input === null) return []
  return String(input).split(/\r?\n/)
}

function firstNonEmpty(values) {
  return (values || []).find(value => value !== undefined && value !== null && String(value).trim() !== '')
}

function uniqueNonEmpty(values) {
  const seen = new Set()
  const result = []
  for (const value of values || []) {
    if (value === undefined || value === null) continue
    const normalized = String(value).trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function parseSensitive(value) {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return undefined
}

function normalizeAnnotations(tags, plainText) {
  const descriptionFromTag = uniqueNonEmpty(tags.description).join(' ')
  const obtainHint = firstNonEmpty(tags.from)
  const examples = uniqueNonEmpty(tags.example)
  const defaultHint = firstNonEmpty(tags.default)
  const sensitive = parseSensitive(firstNonEmpty(tags.sensitive))
  const group = firstNonEmpty(tags.group)
  const deprecationMessage = firstNonEmpty(tags.deprecated)

  const annotations = {}
  if (descriptionFromTag) annotations.description = descriptionFromTag
  if (obtainHint) annotations.obtainHint = String(obtainHint).trim()
  if (examples.length) annotations.examples = examples
  if (defaultHint) annotations.defaultHint = String(defaultHint).trim()
  if (sensitive !== undefined) annotations.sensitive = sensitive
  if (group) annotations.group = String(group).trim()
  if (deprecationMessage) annotations.deprecationMessage = String(deprecationMessage).trim()

  return {
    annotations,
    description: annotations.description || plainText || null,
    descriptionSource: annotations.description ? 'commentTag' : null,
  }
}

function parseCommentAnnotations(input) {
  const tags = {}
  const plainLines = []

  for (const line of toLines(input)) {
    const text = String(line || '').trim()
    if (!text) continue

    const match = text.match(/^@([a-z][a-z0-9_-]*)\b([\s\S]*)$/)
    if (!match) {
      plainLines.push(text)
      continue
    }

    const tagName = match[1]
    if (!KNOWN_TAGS.has(tagName)) {
      plainLines.push(text)
      continue
    }

    if (!tags[tagName]) tags[tagName] = []
    tags[tagName].push(match[2].replace(/^\s/, ''))
  }

  const plainText = plainLines.join(' ').trim() || null
  const normalized = normalizeAnnotations(tags, plainText)

  return {
    plainText,
    tags,
    annotations: normalized.annotations,
    description: normalized.description,
    descriptionSource: normalized.descriptionSource,
  }
}

module.exports = {
  KNOWN_TAGS,
  parseCommentAnnotations,
  parseSensitive,
}
