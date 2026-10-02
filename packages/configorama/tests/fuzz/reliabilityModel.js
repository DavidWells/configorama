/* Test-only expressions are rendered from data, without using production scanners. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { fc } = require('./fuzzUtils')
const { temporary } = require('../reliability/cases')
const configorama = require('../../src')
const AXES = {
  syntax: ['dollar', 'hash', 'bracket'], source: ['opt', 'self', 'file'],
  slot: [0, 1, 2], placement: ['top', 'nested', 'array', 'constructor', '__proto__', 'a.b'],
  composition: ['whole', 'text'], filter: ['none', 'uppercase'], mode: ['plain', 'metadata'],
}
const wrappers = { dollar: ['${', '}'], hash: ['#{', '}'], bracket: ['$[', ']'] }
function render(node, wrapper) {
  if (node.kind === 'ref') return `${wrapper[0]}${node.source}:${node.key}${wrapper[1]}`
  if (node.kind === 'fallback' && node.items.length === 1 && node.items[0].kind !== 'ref') {
    const inner = render(node.items[0], wrapper)
    return node.filter ? inner.slice(0, -wrapper[1].length) + ' | toUpperCase' + wrapper[1] : inner
  }
  if (node.kind === 'fallback') return `${wrapper[0]}${node.items.map(item => item.kind === 'ref' ? `${item.source}:${item.key}` : render(item, wrapper)).join(', ')}${node.filter ? ' | toUpperCase' : ''}${wrapper[1]}`
  return node.parts.map(part => typeof part === 'string' ? part : render(part, wrapper)).join('')
}
function descriptor(values) {
  return { ...values, id: Object.keys(AXES).map(key => `${key}=${values[key]}`).join(';') }
}
/* Greedy deterministic covering array: every pair of axis values must occur. */
function pairwise() {
  const keys = Object.keys(AXES); const cases = []; const covered = new Set()
  function pairs(values) { return keys.flatMap((a, i) => keys.slice(i + 1).map(b => `${a}:${values[a]}|${b}:${values[b]}`)) }
  const candidates = []
  function expand(index, values) { if (index === keys.length) { candidates.push(descriptor(values)); return } const key = keys[index]; for (const value of AXES[key]) expand(index + 1, { ...values, [key]: value }) }
  expand(0, {})
  while (true) {
    let best; let score = 0
    for (const candidate of candidates) { const n = pairs(candidate).filter(p => !covered.has(p)).length; if (n > score) { best = candidate; score = n } }
    if (!best) break
    cases.push(best); pairs(best).forEach(p => covered.add(p))
  }
  return cases
}
function coverage(cases) {
  const missing = []; const keys = Object.keys(AXES)
  for (let i = 0; i < keys.length; i++) for (const b of keys.slice(i + 1)) for (const av of AXES[keys[i]]) for (const bv of AXES[b]) {
    if (!cases.some(c => c[keys[i]] === av && c[b] === bv)) missing.push(`${keys[i]}=${av};${b}=${bv}`)
  }
  return missing
}
const arbitrary = fc.record(Object.fromEntries(Object.entries(AXES).map(([key, values]) => [key, fc.constantFrom(...values)])))
  .chain(values => fc.record({ values: fc.constant(values), depth: fc.integer({ min: 0, max: 3 }), value: fc.oneof(fc.constant('hi}__CFG_C123__\uE001'), fc.boolean(), fc.integer({ min: -5, max: 5 }), fc.constant({ constructor: 'data', __internal_only_flag: true }), fc.constant(['x', 0])) }))
  .map(({ values, depth, value }) => ({ ...descriptor(values), depth, value }))
async function check(d) {
  await temporary(async dir => {
    const wrapper = wrappers[d.syntax]
    const rawValue = d.value === undefined ? 'hello' : d.value
    const value = (d.filter === 'uppercase' || d.composition === 'text') && typeof rawValue !== 'string' ? 'hello' : rawValue
    const file = path.join(dir, 'fixture.json'); fs.writeFileSync(file, JSON.stringify({ value }))
    let ref = { kind: 'ref', source: d.source, key: d.source === 'file' ? '' : 'fixture' }
    // file references have call syntax, unlike key references.
    if (d.source === 'file') ref = { kind: 'ref', source: `file(${file})`, key: 'value' }
    let node = ref
    for (let level = 0; level < (d.depth || 0); level++) node = { kind: 'fallback', items: [{ kind: 'ref', source: 'opt', key: `absent${level}` }, node] }
    const items = Array.from({ length: d.slot }, (_, i) => ({ kind: 'ref', source: 'opt', key: `absent${i}` })); items.push(node)
    node = { kind: 'fallback', items, filter: d.filter === 'uppercase' }
    if (d.composition === 'text') node = { kind: 'compose', parts: ['pre-', node, '-post'] }
    const expression = render(node, wrapper)
    const input = { fixture: value }
    let location
    if (d.placement === 'nested') { input.container = { result: expression }; location = c => c.container.result }
    else if (d.placement === 'array') { input.container = [expression]; location = c => c.container[0] }
    else { Object.defineProperty(input, d.placement === 'top' ? 'result' : d.placement, { value: expression, enumerable: true }); const key = d.placement === 'top' ? 'result' : d.placement; location = c => c[key] }
    let expected = d.filter === 'uppercase' ? String(value).toUpperCase() : value
    if (d.composition === 'text') expected = `pre-${expected}-post`
    const settings = { syntax: configorama.buildVariableSyntax(...wrapper), options: { fixture: value }, returnMetadata: d.mode === 'metadata' }
    for (const resolve of [configorama, configorama.sync]) {
      const output = await resolve(input, settings)
      assert.deepEqual(location(settings.returnMetadata ? output.config : output), expected, d.id)
    }
  })
}
module.exports = { AXES, arbitrary, pairwise, coverage, descriptor, render, check }
