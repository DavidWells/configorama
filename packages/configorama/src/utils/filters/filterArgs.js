const opaque = require('../encoders/opaque')
const resolvedArgs = new WeakSet()
class ResolvedFilterArg {
  constructor(value) { this.value = value; resolvedArgs.add(this) }
  toString() { return String(this.value) }
  valueOf() { return this.value }
}
function encodeFilterArg(value) { return opaque.encode('F', typeof value === 'string' ? opaque.decodeAll(value) : value) }
function isEncodedFilterArg(value) { return opaque.has(value, 'F') }
function decodeFilterArg(value) {
  const records = opaque.find(value, 'F')
  if (!records.length) return value
  if (records.length === 1 && records[0].match === value) return new ResolvedFilterArg(records[0].value)
  return new ResolvedFilterArg(opaque.decode(value, 'F'))
}
function isResolvedFilterArg(value) { return !!(value && typeof value === 'object' && resolvedArgs.has(value)) }
function unwrapFilterArg(value) { return isResolvedFilterArg(value) ? value.value : value }
module.exports = { ResolvedFilterArg, decodeFilterArg, encodeFilterArg, isEncodedFilterArg, isResolvedFilterArg, unwrapFilterArg }
