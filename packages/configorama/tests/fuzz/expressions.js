/* A generator of valid configorama expressions as trees, rendered with any whitespace and */
/* quote style. Properties compare renderings of the same tree, or a tree to a wrapped one, */
/* so no expected values are written by hand.                                              */
/* eslint-disable no-template-curly-in-string */
const { fc } = require('./fuzzUtils')

/* Config the expressions read from */
const CONFIG_YAML = `custom:
  s: 'val,ue|x'
  n: 5
  t: true
  list: [a, 'b,c']
  obj: { k: v }
`

const MISSING = ['env:CONFIGORAMA_FUZZ_EXPR_UNSET', 'opt:nope', 'self:custom.missing']
const REFS = ['custom.s', 'custom.n', 'custom.t', 'custom.list', 'custom.obj']

/**
 * @typedef {{ t: 'ref', path: string }
 *   | { t: 'lit', value: string }
 *   | { t: 'num', value: number }
 *   | { t: 'fb', missing: number[], item: Node }
 *   | { t: 'filt', node: Node, filter: string }
 *   | { t: 'merge', a: string, b: string }
 *   | { t: 'length', path: string }
 *   | { t: 'if', path: string, lit: string }
 * } Node
 * @typedef {{ pad: string[], quote: "'" | '"' }} Style
 */

/* Literal text: syntax-heavy but without backslashes or newlines, whose escaping is its own topic */
const literal = fc.array(fc.constantFrom('a', 'Z', '1', ',', '|', ' ', ':', '.', '(', ')', '{', '}', '#', "'", '"', '-'), { maxLength: 8 })
  .map((chars) => chars.join(''))

/** @type {import('fast-check').Arbitrary<Node>} */
const leaf = fc.oneof(
  fc.record({ t: fc.constant('ref'), path: fc.constantFrom(...REFS) }),
  fc.record({ t: fc.constant('lit'), value: literal }),
  fc.record({ t: fc.constant('num'), value: fc.integer({ min: -50, max: 500 }) }),
  fc.record({ t: fc.constant('merge'), a: literal, b: literal }),
  fc.record({ t: fc.constant('length'), path: fc.constantFrom('custom.s', 'custom.list', 'custom.obj') }),
  fc.record({ t: fc.constant('if'), path: fc.constant('custom.s'), lit: fc.constantFrom('val,ue|x', 'other') }),
)

/** @type {import('fast-check').Arbitrary<Node>} */
const node = fc.letrec((tie) => ({
  node: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    { weight: 3, arbitrary: leaf },
    {
      weight: 2,
      arbitrary: fc.record({
        t: fc.constant('fb'),
        missing: fc.array(fc.integer({ min: 0, max: MISSING.length - 1 }), { minLength: 1, maxLength: 2 }),
        item: tie('node'),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        t: fc.constant('filt'),
        node: fc.oneof(
          fc.record({ t: fc.constant('ref'), path: fc.constant('custom.s') }),
          fc.record({ t: fc.constant('lit'), value: literal }),
        ),
        filter: fc.constantFrom('toUpperCase', 'toLowerCase', 'String'),
      }),
    },
  ),
})).node

/** @type {import('fast-check').Arbitrary<Style>} */
const style = fc.record({
  pad: fc.array(fc.constantFrom('', '', ' ', '  ', '\t'), { minLength: 8, maxLength: 8 }),
  quote: fc.constantFrom("'", '"'),
})

/** Plain style: one space after commas, around pipes, single quotes */
const PLAIN = /** @type {Style} */ ({ pad: ['', '', '', ' ', ' ', ' ', '', ''], quote: "'" })

/**
 * Quote a literal in the style's quote char, escaping that char
 * @param {string} value
 * @param {Style} s
 */
function quote(value, s) {
  return s.quote + value.split(s.quote).join(`\\${s.quote}`) + s.quote
}

/**
 * Render a node as a full variable
 * @param {Node} n
 * @param {Style} s
 * @returns {string}
 */
function render(n, s) {
  const [inL, inR, , afterComma, beforePipe, afterPipe] = s.pad
  const wrap = (/** @type {string} */ body) => `\${${inL}${body}${inR}}`
  switch (n.t) {
    case 'ref': return wrap(`self:${n.path}`)
    case 'lit': return wrap(quote(n.value, s))
    case 'num': return wrap(String(n.value))
    case 'merge': return wrap(`merge(${quote(n.a, s)},${afterComma}${quote(n.b, s)})`)
    case 'length': return wrap(`length(\${self:${n.path}})`)
    case 'if': return wrap(`if(\${self:${n.path}} == ${quote(n.lit, s)})`)
    case 'filt': return wrap(`${n.node.t === 'ref' ? `self:${n.node.path}` : quote(/** @type {any} */ (n.node).value, s)}${beforePipe}|${afterPipe}${n.filter}`)
    case 'fb': return wrap([...n.missing.map((i) => MISSING[i]), render(n.item, s)].join(`,${afterComma}`))
  }
  throw new Error('unknown node')
}

module.exports = { CONFIG_YAML, node, style, render, quote, PLAIN, literal, MISSING }
