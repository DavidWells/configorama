const PAREN_OPEN_PLACEHOLDER = '__PH_PAREN_OPEN__'
const OPEN_PAREN_PLACEHOLDER_PATTERN = /__PH_PAREN_OPEN__/g

const JSON_ENCODED_PREFIX = '__JSON_B64__'
const JSON_ENCODED_PATTERN = /__JSON_B64__([A-Za-z0-9+/=]+)__/g

function encodeJsSyntax(value = '') {
  return value.replace(/\(/g, PAREN_OPEN_PLACEHOLDER)
}

function decodeJsSyntax(value) {
  if (!value) return value
  return value.replace(OPEN_PAREN_PLACEHOLDER_PATTERN, '(')
}

function hasParenthesesPlaceholder(value = '') {
  return OPEN_PAREN_PLACEHOLDER_PATTERN.test(value)
}

/**
 * Encode a JSON object to base64 for safe embedding in variable strings
 * @param {object} obj - Object to encode
 * @returns {string} Encoded string like __JSON_B64__eyJmb28iOiJiYXIifQ==__
 */
function encodeJsonForVariable(obj) {
  const jsonStr = JSON.stringify(obj)
  const b64 = Buffer.from(jsonStr).toString('base64')
  return `${JSON_ENCODED_PREFIX}${b64}__`
}

/**
 * Decode base64-encoded JSON from variable strings
 * @param {string} value - String potentially containing encoded JSON
 * @returns {string} String with encoded JSON decoded back to JSON strings
 */
function decodeJsonInVariable(value) {
  if (!value || typeof value !== 'string') return value
  return value.replace(JSON_ENCODED_PATTERN, (match, b64) => {
    try {
      const jsonStr = Buffer.from(b64, 'base64').toString('utf8')
      return jsonStr
    } catch (e) {
      return match
    }
  })
}

/**
 * Check if string contains encoded JSON
 * @param {string} value - String to check
 * @returns {boolean}
 */
function hasEncodedJson(value) {
  if (!value || typeof value !== 'string') return false
  return value.includes(JSON_ENCODED_PREFIX)
}

module.exports = {
  OPEN_PAREN_PLACEHOLDER_PATTERN,
  hasParenthesesPlaceholder,
  encodeJsSyntax,
  decodeJsSyntax,
  encodeJsonForVariable,
  decodeJsonInVariable,
  hasEncodedJson,
}