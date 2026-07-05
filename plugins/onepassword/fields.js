/* Selects a field from op item get JSON, explicitly or by inference
   Ambiguity is always an error - never silently prefers one secret field over another */

const SECRET_LABELS = new Set(['password', 'token', 'api_key', 'api key', 'secret', 'credential', 'private key'])
const IGNORED_PURPOSES = new Set(['USERNAME'])
const IGNORED_TYPES = new Set(['URL'])
const IGNORED_LABELS = new Set(['username', 'email', 'url', 'website', 'created', 'updated', 'title'])

/**
 * @param {object} item - Parsed op item get JSON
 * @returns {string} Display name for error messages
 */
function itemName(item) {
  return item.title || item.id || 'unknown'
}

/**
 * @param {string|undefined} value - Field attribute
 * @param {string} wanted - Configured name
 * @returns {boolean} Case-insensitive equality
 */
function matches(value, wanted) {
  return typeof value === 'string' && value.toLowerCase() === wanted.toLowerCase()
}

/**
 * Select a field from an item.
 * With options.field: explicit matching on id/label/purpose (+ section).
 * Without: inference over secret-content candidates; ambiguity throws.
 * @param {object} item - Parsed op item get JSON
 * @param {object} [options] - { field, section }
 * @returns {object} The selected field object
 */
function selectField(item, options = {}) {
  const fields = item.fields || []
  if (options.field) {
    return selectExplicit(item, fields, options.field, options.section)
  }
  return inferField(item, fields)
}

/**
 * @param {object} item - Item for error messages
 * @param {object[]} fields - item.fields
 * @param {string} wanted - Configured field name
 * @param {string} [section] - Configured section name
 * @returns {object} Matched field
 */
function selectExplicit(item, fields, wanted, section) {
  let candidates = fields.filter((field) => {
    return matches(field.id, wanted) || matches(field.label, wanted) || matches(field.purpose, wanted)
  })

  if (section) {
    candidates = candidates.filter((field) => {
      const fieldSection = field.section || {}
      return matches(fieldSection.id, section) || matches(fieldSection.label, section)
    })
  }

  if (candidates.length === 0) {
    throw new Error(`Field "${wanted}" was not found in 1Password item "${itemName(item)}".`)
  }
  if (candidates.length > 1) {
    throw new Error(`1Password item "${itemName(item)}" has multiple fields labeled "${wanted}". Set section explicitly.`)
  }
  return candidates[0]
}

/**
 * @param {object} field - Item field
 * @returns {boolean} True when the field likely holds secret content
 */
function isSecretCandidate(field) {
  if (field.value === undefined || field.value === '') return false
  const label = (field.label || '').toLowerCase()
  const purpose = (field.purpose || '').toUpperCase()
  const type = (field.type || '').toUpperCase()

  if (IGNORED_PURPOSES.has(purpose) || IGNORED_TYPES.has(type) || IGNORED_LABELS.has(label)) {
    return false
  }
  if (matches(field.id, 'notesPlain') || matches(field.label, 'notesPlain') || purpose === 'NOTES') return true
  if (purpose === 'PASSWORD') return true
  if (type === 'CONCEALED') return true
  if (SECRET_LABELS.has(label)) return true
  return false
}

/**
 * Infer the single secret-content field or throw.
 * Never prefers notesPlain over password (or vice versa) - two candidates is an error.
 * @param {object} item - Item for error messages
 * @param {object[]} fields - item.fields
 * @returns {object} Inferred field
 */
function inferField(item, fields) {
  const candidates = fields.filter(isSecretCandidate)
  if (candidates.length === 1) {
    return candidates[0]
  }
  if (candidates.length > 1) {
    const labels = candidates.map((field) => field.label || field.id).join(', ')
    throw new Error(`1Password item "${itemName(item)}" has multiple candidate secret fields: ${labels}. Set field explicitly.`)
  }
  throw new Error(`1Password item "${itemName(item)}" has no obvious secret field. Set field explicitly.`)
}

module.exports = { selectField }
