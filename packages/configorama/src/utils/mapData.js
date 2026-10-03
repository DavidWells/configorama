const { setOwn } = require('./objects')
/** Copy data containers without losing null prototypes, sparse arrays or extra keys.
 * @param {*} value @param {(value: string) => string} transform @param {(key: string) => string} [transformKey]
 * @returns {*}
 */
function mapData(value, transform, transformKey = key => key) {
  const seen = new WeakMap()
  function visit(value) {
    require('./resolutionBudget').visit()
    if (typeof value === 'string') return transform(value)
    if (!value || typeof value !== 'object') return value
    const array = Array.isArray(value); const proto = Object.getPrototypeOf(value)
    const date = value instanceof Date; const regexp = value instanceof RegExp
    if (!array && !date && !regexp && proto !== Object.prototype && proto !== null) return value
    if (seen.has(value)) return seen.get(value)
    const result = array ? new Array(value.length) : date ? new Date(value.getTime()) : regexp ? new RegExp(value.source, value.flags) : Object.create(proto)
    if (regexp) result.lastIndex = value.lastIndex
    seen.set(value, result)
    for (const key of Object.keys(value)) setOwn(result, transformKey(key), visit(value[key]))
    return result
  }
  return visit(value)
}
module.exports = mapData
