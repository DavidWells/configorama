const { ConfigoramaError } = require('../../errors')
const { setOwn } = require('../objects')
const VERSION = 1
const MAX_DEPTH = 512
/** @param {*} value @returns {{ version: number, root: Array }} */
function encode(value, budget) {
  const seen = new Map(); const active = new Set()
  function fail(path, reason) { throw new ConfigoramaError('unsupported_sync_value', `Unsupported sync value at ${JSON.stringify(path)}: ${reason}`, { path, reason }) }
  function visit(value, path, depth) {
    if (budget) budget.visit(depth)
    if (depth > MAX_DEPTH) fail(path, 'maximum transport depth exceeded')
    if (value === undefined) return ['undefined']
    if (value === null) return ['null']
    if (typeof value === 'boolean' || typeof value === 'string') return [typeof value, value]
    if (typeof value === 'number') return ['number', Number.isNaN(value) ? 'NaN' : value === Infinity ? 'Infinity' : value === -Infinity ? '-Infinity' : Object.is(value, -0) ? '-0' : value]
    if (typeof value === 'bigint') return ['bigint', String(value)]
    if (typeof value !== 'object') fail(path, typeof value)
    if (active.has(value)) fail(path, 'cyclic structure')
    if (seen.has(value)) return ['ref', seen.get(value)]
    const proto = Object.getPrototypeOf(value)
    const array = Array.isArray(value); const date = value instanceof Date; const regexp = value instanceof RegExp
    if ((array && proto !== Array.prototype) || (date && proto !== Date.prototype) || (regexp && proto !== RegExp.prototype) || (!array && !date && !regexp && proto !== Object.prototype && proto !== null)) fail(path, 'unsupported object prototype')
    const id = seen.size; seen.set(value, id); active.add(value)
    const entries = []
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') fail(path, 'symbol key')
      if ((array && key === 'length') || (regexp && key === 'lastIndex')) continue
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!('value' in descriptor)) fail([...path, key], 'accessor property')
      if (!descriptor.enumerable) fail([...path, key], 'nonenumerable property')
      entries.push([key, visit(descriptor.value, [...path, key], depth + 1)])
    }
    active.delete(value)
    if (array) return ['array', id, value.length, entries]
    if (date) return ['date', id, visit(Date.prototype.getTime.call(value), path, depth + 1), entries]
    if (regexp) return ['regexp', id, value.source, value.flags, visit(value.lastIndex, [...path, 'lastIndex'], depth + 1), entries]
    return ['object', id, proto === null, entries]
  }
  return { version: VERSION, root: visit(value, [], 0) }
}
/** @param {*} envelope @returns {*} */
function decode(envelope, budget) {
  function fail(reason) { throw new ConfigoramaError('invalid_sync_transport', `Invalid sync transport: ${reason}`, { reason }) }
  if (!envelope || envelope.version !== VERSION || !Array.isArray(envelope.root)) fail('unsupported envelope version or root')
  const references = new Map(); const active = new Set()
  function entries(value, list, depth) {
    if (!Array.isArray(list)) fail('invalid entries')
    const keys = new Set()
    for (const entry of list) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || keys.has(entry[0])) fail('invalid or duplicate property')
      if (Array.isArray(value) && entry[0] === 'length') fail('array length is intrinsic')
      keys.add(entry[0]); setOwn(value, entry[0], visit(entry[1], depth + 1))
    }
    return value
  }
  function visit(node, depth) {
    if (budget) budget.visit(depth)
    if (depth > MAX_DEPTH || !Array.isArray(node)) fail('invalid node or depth')
    const [tag, data] = node
    switch (tag) {
      case 'undefined': if (node.length !== 1) fail('undefined node'); return undefined
      case 'null': if (node.length !== 1) fail('null node'); return null
      case 'string': case 'boolean': if (node.length !== 2 || typeof data !== tag) fail('primitive node'); return data
      case 'number': {
        if (node.length !== 2) fail('number node')
        if (typeof data === 'number' && Number.isFinite(data)) return data
        switch (data) { case 'NaN': return NaN; case 'Infinity': return Infinity; case '-Infinity': return -Infinity; case '-0': return -0; default: fail('number payload') }
        break
      }
      case 'bigint': if (node.length !== 2 || typeof data !== 'string' || !/^-?\d+$/.test(data)) fail('bigint node'); return BigInt(data)
      case 'ref': if (node.length !== 2 || !references.has(data) || active.has(data)) fail('missing or cyclic reference'); return references.get(data)
      case 'array': case 'object': case 'date': case 'regexp': {
        if (!Number.isSafeInteger(data) || data < 0 || references.has(data)) fail('invalid object identity')
        let value; let list
        if (tag === 'array') {
          if (node.length !== 4 || !Number.isInteger(node[2]) || node[2] < 0 || node[2] > 4294967295) fail('array node')
          value = new Array(node[2]); list = node[3]
        } else if (tag === 'object') {
          if (node.length !== 4 || typeof node[2] !== 'boolean') fail('object node')
          value = Object.create(node[2] ? null : Object.prototype); list = node[3]
        } else if (tag === 'date') {
          if (node.length !== 4) fail('date node')
          const timestamp = visit(node[2], depth + 1); if (typeof timestamp !== 'number') fail('date payload')
          value = new Date(timestamp); list = node[3]
        } else {
          if (node.length !== 6 || typeof node[2] !== 'string' || typeof node[3] !== 'string') fail('regexp node')
          try { value = new RegExp(node[2], node[3]) } catch (_) { fail('regexp payload') }
          value.lastIndex = visit(node[4], depth + 1); list = node[5]
        }
        references.set(data, value); active.add(data)
        entries(value, list, depth); active.delete(data)
        return value
      }
      default: fail('unknown node type')
    }
  }
  return visit(envelope.root, 0)
}
module.exports = { VERSION, encode, decode }
