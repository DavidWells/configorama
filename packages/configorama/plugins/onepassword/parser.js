/* Parses 1Password field text as INI/dotenv for key path reads
   Raw field text is only parsed when a config reference asks for a key path */
const ini = require('ini')

/**
 * Restore ini module coercions so secret values stay strings.
 * The ini parser coerces true/false/null which corrupts literal
 * secret text like FLAG=true.
 * @param {*} value - Parsed ini node
 * @returns {*} Node with primitives restored to strings
 */
function stringifyPrimitives(value) {
  if (value === true) return 'true'
  if (value === false) return 'false'
  if (value === null) return 'null'
  if (typeof value === 'object') {
    const result = {}
    for (const key of Object.keys(value)) {
      result[key] = stringifyPrimitives(value[key])
    }
    return result
  }
  return value
}

/**
 * Parse structured secret text.
 * V1 supports INI/dotenv only. Future format detection order:
 * 1. explicit format option on the ref
 * 2. JSON if the trimmed value starts with { or [
 * 3. YAML only with proof it is not confused with INI
 * 4. INI fallback
 * @param {string} value - Raw field text
 * @param {object} [options] - Reserved for future format selection
 * @returns {object} Parsed key/value structure
 */
function parseStructuredSecret(value, options = {}) {
  let parsed
  try {
    parsed = ini.parse(value)
  } catch (err) {
    throw new Error(`Could not parse 1Password field "${options.fieldName || 'value'}" as INI/dotenv.`)
  }
  return stringifyPrimitives(parsed)
}

/**
 * Read a dot-separated key path from a parsed structure.
 * Error messages never include secret values.
 * @param {object} parsed - Result of parseStructuredSecret
 * @param {string} keyPath - Dot-separated path, e.g. "database.password"
 * @param {string} fieldName - 1Password field name for error messages
 * @returns {string} Selected value
 */
function getKeyPath(parsed, keyPath, fieldName) {
  const segments = keyPath.split('.')
  let current = parsed
  for (const segment of segments) {
    if (current === null || typeof current !== 'object' || !(segment in current)) {
      throw new Error(`Key path "${keyPath}" was not found in 1Password field "${fieldName}".`)
    }
    current = current[segment]
  }
  if (typeof current === 'object') {
    throw new Error(`Key path "${keyPath}" was not found in 1Password field "${fieldName}".`)
  }
  return current
}

module.exports = { parseStructuredSecret, getKeyPath }
