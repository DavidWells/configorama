// Tags Date values as JSON-safe objects and revives them, so resolved config keeps its
// dates across the JSON transport the sync API uses between processes
const { setOwn } = require('../objects')
const DATE_TAG = '__configoramaDate'

/**
 * Replace every Date in a value with { __configoramaDate: isoString }
 * @param {any} value - Any JSON-like value
 * @returns {any} Copy with Dates tagged
 */
function tagDates(value) {
  if (value instanceof Date) return { [DATE_TAG]: value.toISOString() }
  if (Array.isArray(value)) return value.map(tagDates)
  if (value && typeof value === 'object') {
    /** @type {Record<string, any>} */
    const result = {}
    for (const key of Object.keys(value)) setOwn(result, key, tagDates(value[key]))
    return result
  }
  return value
}

/**
 * Turn every { __configoramaDate: isoString } back into a Date
 * @param {any} value - A value produced by tagDates after a JSON round trip
 * @returns {any} Copy with Dates restored
 */
function reviveDates(value) {
  if (Array.isArray(value)) return value.map(reviveDates)
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 1 && keys[0] === DATE_TAG) return new Date(value[DATE_TAG])
    /** @type {Record<string, any>} */
    const result = {}
    for (const key of keys) setOwn(result, key, reviveDates(value[key]))
    return result
  }
  return value
}

module.exports = { tagDates, reviveDates }
