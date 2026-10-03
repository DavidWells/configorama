const { AsyncLocalStorage } = require('node:async_hooks')
const { randomBytes } = require('node:crypto')
const contexts = new AsyncLocalStorage()
function createContext() { return { id: randomBytes(16).toString('hex'), values: new Map(), strings: new Map(), syntaxCache: new Map(), next: 0 } }
// Standalone encoder helpers can be composed outside a config load too.
const standalone = createContext()
function currentContext() { return contexts.getStore() }
function runInContext(context, fn) { return contexts.run(context, fn) }
function withContext(fn) { return runInContext(createContext(), fn) }
function context() { return currentContext() || standalone }
/** @param {string} kind @param {*} value @returns {string} */
function encode(kind, value) {
  const store = context()
  const key = typeof value === 'string' ? `${kind}:${value}` : undefined
  if (key !== undefined && store.strings.has(key)) return store.strings.get(key)
  const token = `__CFG_${kind}_${store.id}_${store.next++}__`
  store.values.set(token, { kind, value })
  if (key !== undefined) store.strings.set(key, token)
  return token
}
/** @param {*} value @param {string} kind */
function find(value, kind) {
  if (typeof value !== 'string') return []
  const store = context()
  const matches = []
  const pattern = /__CFG_([A-Z])_([a-f0-9]{32})_(\d+)__/g
  let match
  while ((match = pattern.exec(value))) {
    const record = store.values.get(match[0])
    if (record && record.kind === kind) matches.push({ match: match[0], value: record.value, index: match.index })
  }
  return matches
}
function has(value, kind) { return find(value, kind).length > 0 }
function decode(value, kind) {
  if (typeof value !== 'string') return value
  // One pass: replacement text is data, never another token to decode recursively.
  return value.replace(/__CFG_([A-Z])_([a-f0-9]{32})_(\d+)__/g, token => {
    const record = context().values.get(token)
    return record && record.kind === kind ? String(record.value) : token
  })
}
function decodeAll(value) {
  if (typeof value !== 'string') return value
  return value.replace(/__CFG_([A-Z])_([a-f0-9]{32})_(\d+)__/g, token => {
    const record = context().values.get(token)
    return record ? String(record.value) : token
  })
}
module.exports = { encode, find, has, decode, decodeAll, currentContext, runInContext, withContext }
