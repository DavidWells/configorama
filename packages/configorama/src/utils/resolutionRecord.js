// Only records created by the resolver carry runtime identity. User property names
// have no meaning here, and the private brand never appears in config or JSON.
const records = new WeakSet()
/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function resolutionRecord(value) {
  if (!value || typeof value !== 'object') throw new TypeError('Resolution record must be an object')
  records.add(value)
  return value
}
/** @param {*} value @returns {boolean} */
function isResolutionRecord(value) {
  return !!value && typeof value === 'object' && records.has(value)
}
module.exports = { resolutionRecord, isResolutionRecord }
