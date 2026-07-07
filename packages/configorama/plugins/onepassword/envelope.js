/* Encodes cached final values as { value, fieldName } JSON strings.
   Private plugin convention: op-cache stores these as opaque strings. */

/**
 * @param {string} value - Final resolved value
 * @param {string|undefined} fieldName - Discovered field name for audit metadata
 * @returns {string} Envelope JSON string
 */
function encodeEnvelope(value, fieldName) {
  if (typeof value !== 'string') throw new Error('Envelope value must be a string.')
  return JSON.stringify(fieldName === undefined ? { value } : { value, fieldName })
}

/**
 * @param {string} encoded - Envelope JSON string
 * @returns {{value: string, fieldName: string|undefined}}
 */
function decodeEnvelope(encoded) {
  let parsed
  try {
    parsed = JSON.parse(encoded)
  } catch (err) {
    throw new Error('Malformed op-cache envelope: not valid JSON.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.value !== 'string') {
    throw new Error('Malformed op-cache envelope: missing string value.')
  }
  return { value: parsed.value, fieldName: typeof parsed.fieldName === 'string' ? parsed.fieldName : undefined }
}

/**
 * validateCached hook: rejecting here makes getOrSet recompute and overwrite.
 * @param {string} encoded - Cached string
 * @returns {boolean}
 */
function isValidEnvelope(encoded) {
  try {
    decodeEnvelope(encoded)
    return true
  } catch (err) {
    return false
  }
}

module.exports = { encodeEnvelope, decodeEnvelope, isValidEnvelope }
