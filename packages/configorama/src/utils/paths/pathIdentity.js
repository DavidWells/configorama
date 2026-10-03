const { bracketsToDots } = require('./bracketsToDots')
/** @param {(string|number)[]} segments */
function normalizePath(segments) {
  if (!Array.isArray(segments) || segments.some(s => typeof s !== 'string' && (typeof s !== 'number' || !Number.isSafeInteger(s)))) throw new TypeError('Path identity requires string segments or integer indexes')
  return segments.map(String)
}
/** @param {(string|number)[]} segments */
function encodePathIdentity(segments) { return JSON.stringify(normalizePath(segments)) }
/** @param {string} identity */
function decodePathIdentity(identity) {
  const segments = JSON.parse(identity)
  if (!Array.isArray(segments) || segments.some(s => typeof s !== 'string')) throw new TypeError('Invalid path identity')
  return segments
}
/** Display only: ordinary dotted labels stay compatible; unusual keys are quoted. */
function displayPath(segments) {
  return normalizePath(segments).map((s, i) => /^[\w$:-]+$/u.test(s) ? `${i ? '.' : ''}${s}` : `[${JSON.stringify(s)}]`).join('')
}
/** Project the existing public lookup grammar; never use this for identity. */
function lookupPathSegments(expression) { return bracketsToDots(expression).split('.') }
module.exports = { normalizePath, encodePathIdentity, decodePathIdentity, displayPath, lookupPathSegments }
