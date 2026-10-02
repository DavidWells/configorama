const { test } = require('uvu')
const assert = require('uvu/assert')
const {
  findOutermostBraces,
  findOutermostBracesDepthFirst,
  findEnclosingVariable,
  findParentVariable,
  isFallbackSlot,
  isWholeFallbackItem,
  findOutermostBraceRanges,
  findOutermostVariables
} = require('./bracketMatcher')

// Tests for findOutermostBraces
test('findOutermostBraces - should find simple braces', () => {
  const result = findOutermostBraces('text {content} more')
  assert.equal(result, ['{content}'])
})

test('findOutermostBraces - should find multiple brace pairs', () => {
  const result = findOutermostBraces('{first} and {second}')
  assert.equal(result, ['{first}', '{second}'])
})

test('findOutermostBraces - should handle nested braces', () => {
  const result = findOutermostBraces('{outer {inner} content}')
  assert.equal(result, ['{outer {inner} content}'])
})

test('findOutermostBraces - should find with prefix', () => {
  const result = findOutermostBraces('text ${variable} more', '{', '}', '$')
  assert.equal(result, ['${variable}'])
})

test('findOutermostBraces - should handle multiple nested levels with prefix', () => {
  const result = findOutermostBraces('${outer ${inner ${deepest}}}', '{', '}', '$')
  assert.equal(result, ['${outer ${inner ${deepest}}}'])
})

test('findOutermostBraces - should return empty array when no matches', () => {
  const result = findOutermostBraces('no braces here')
  assert.equal(result, [])
})

test('findOutermostBraces - should handle custom delimiters', () => {
  const result = findOutermostBraces('text [content] more', '[', ']')
  assert.equal(result, ['[content]'])
})

test('findOutermostBraces - should not match without prefix when prefix is specified', () => {
  const result = findOutermostBraces('{no prefix} ${with prefix}', '{', '}', '$')
  assert.equal(result, ['${with prefix}'])
})

// Tests for findOutermostBracesDepthFirst
test('findOutermostBracesDepthFirst - should find simple braces', () => {
  const result = findOutermostBracesDepthFirst('text {content} more')
  assert.equal(result, ['{content}'])
})

test('findOutermostBracesDepthFirst - should find multiple brace pairs', () => {
  const result = findOutermostBracesDepthFirst('{first} and {second}')
  assert.equal(result, ['{first}', '{second}'])
})

test('findOutermostBracesDepthFirst - should handle nested braces', () => {
  const result = findOutermostBracesDepthFirst('{outer {inner} content}')
  assert.equal(result, ['{outer {inner} content}'])
})

test('findOutermostBracesDepthFirst - should return empty array when no matches', () => {
  const result = findOutermostBracesDepthFirst('no braces here')
  assert.equal(result, [])
})

test('findOutermostBracesDepthFirst - should handle custom delimiters', () => {
  const result = findOutermostBracesDepthFirst('text [content] more', '[', ']')
  assert.equal(result, ['[content]'])
})

test('findOutermostBracesDepthFirst - should handle unmatched braces gracefully', () => {
  const result = findOutermostBracesDepthFirst('{opened but not closed')
  assert.equal(result, [])
})

test('findOutermostBracesDepthFirst - should handle complex nested structures', () => {
  const result = findOutermostBracesDepthFirst('{a {b {c}}} {d {e}}')
  assert.equal(result, ['{a {b {c}}}', '{d {e}}'])
})

// Tests for findOutermostVariables
test('findOutermostVariables - should find simple variable', () => {
  const result = findOutermostVariables('text ${variable} more')
  assert.equal(result, ['${variable}'])
})

test('findOutermostVariables - should find multiple variables', () => {
  const result = findOutermostVariables('${first} and ${second}')
  assert.equal(result, ['${first}', '${second}'])
})

test('findOutermostVariables - should handle nested variables', () => {
  const result = findOutermostVariables('${outer ${inner}}')
  assert.equal(result, ['${outer ${inner}}'])
})

test('findOutermostVariables - should return empty array when no variables', () => {
  const result = findOutermostVariables('no variables here')
  assert.equal(result, [])
})

test('findOutermostVariables - should ignore plain braces without dollar sign', () => {
  const result = findOutermostVariables('{not a variable} ${is a variable}')
  assert.equal(result, ['${is a variable}'])
})

test('findOutermostVariables - should handle real-world serverless variables', () => {
  const result = findOutermostVariables('${param:xyz}')
  assert.equal(result, ['${param:xyz}'])
})

test('findOutermostVariables - should handle deeply nested serverless variables', () => {
  const result = findOutermostVariables('${opt:stage, ${env:foo}}')
  assert.equal(result, ['${opt:stage, ${env:foo}}'])
})

test('findOutermostVariables - should find multiple variables in array context', () => {
  const text = "y: !Not [!Equals [!Join ['', ${param:xyz}]]]"
  const result = findOutermostVariables(text)
  assert.equal(result, ['${param:xyz}'])
})

test('findOutermostVariables - should handle variables in YAML object context', () => {
  const text = 'key: { value: ${self:config}, other: ${env:var} }'
  const result = findOutermostVariables(text)
  assert.equal(result, ['${self:config}', '${env:var}'])
})

test('findEnclosingVariable - returns the variable itself when not nested', () => {
  assert.is(findEnclosingVariable('{"${MetricsNs}",Path}', '${MetricsNs}', '${', '}'), '${MetricsNs}')
})

test('findEnclosingVariable - ignores literal text and commas outside any variable', () => {
  assert.is(findEnclosingVariable('{"${Ns}",Path} ${AWS::Region}', '${Ns}', '${', '}'), '${Ns}')
})

test('findEnclosingVariable - returns the outer variable enclosing a nested one', () => {
  const text = "pre ${empty, ${holoDeck}, 'here it is'} post"
  assert.is(findEnclosingVariable(text, '${holoDeck}', '${', '}'), "${empty, ${holoDeck}, 'here it is'}")
})

test('findEnclosingVariable - supports custom single-char-suffix syntax', () => {
  assert.is(findEnclosingVariable('[$[a, $[b]], x]', '$[b]', '$[', ']'), '$[a, $[b]]')
})

test('findEnclosingVariable - returns null when variable is absent', () => {
  assert.is(findEnclosingVariable('no vars here', '${a}', '${', '}'), null)
  assert.is(findEnclosingVariable('{{a}}', '{{b}}', '{{', '}}'), null)
})

test('findEnclosingVariable - multi-char suffix ({{ }}, ${{ }})', () => {
  assert.is(findEnclosingVariable('{{a}}', '{{a}}', '{{', '}}'), '{{a}}')
  assert.is(findEnclosingVariable('x {{env:A, {{b}}}} y', '{{b}}', '{{', '}}', 11), '{{env:A, {{b}}}}')
  assert.is(findEnclosingVariable('${{a, ${{b}}}} ${{b}}', '${{b}}', '${{', '}}', 15), '${{b}}')
})

test('findParentVariable - the variable directly around, for any suffix', () => {
  assert.equal(findParentVariable('${a, ${b, ${c}}}', '${c}', '${', '}', 10), { start: 5, text: '${b, ${c}}' })
  assert.equal(findParentVariable('{{a, {{b, {{c}}}}}}', '{{c}}', '{{', '}}', 10), { start: 5, text: '{{b, {{c}}}}' })
  assert.is(findParentVariable('${c}', '${c}', '${', '}', 0), null)
})

test('findEnclosingVariable - index picks the occurrence: nested copy first', () => {
  const text = "${opt:nope, ${Missing}, 'fb'} and ${Missing}"
  assert.is(findEnclosingVariable(text, '${Missing}', '${', '}', text.indexOf('${Missing}')), "${opt:nope, ${Missing}, 'fb'}")
  assert.is(findEnclosingVariable(text, '${Missing}', '${', '}', text.lastIndexOf('${Missing}')), '${Missing}')
})

test('findEnclosingVariable - index picks the occurrence: standalone copy first', () => {
  const text = "${Missing} and ${opt:nope, ${Missing}, 'fb'}"
  assert.is(findEnclosingVariable(text, '${Missing}', '${', '}', 0), '${Missing}')
  assert.is(findEnclosingVariable(text, '${Missing}', '${', '}', text.lastIndexOf('${Missing}')), "${opt:nope, ${Missing}, 'fb'}")
})

test('findEnclosingVariable - index picks between two different enclosing vars', () => {
  const text = "${opt:a, ${M}, 'x'} ${opt:b, ${M}, 'y'}"
  assert.is(findEnclosingVariable(text, '${M}', '${', '}', text.lastIndexOf('${M}')), "${opt:b, ${M}, 'y'}")
})

test('findEnclosingVariable - index not at the variable returns null', () => {
  assert.is(findEnclosingVariable('a ${x} b', '${x}', '${', '}', 0), null)
})

test('findOutermostBraceRanges - returns [start, end) of each outermost pair', () => {
  const text = 'a {b {c}} d {e}'
  const ranges = findOutermostBraceRanges(text)
  assert.equal(ranges, [[2, 9], [12, 15]])
  assert.equal(ranges.map(([s, e]) => text.slice(s, e)), findOutermostBracesDepthFirst(text))
})

test('findOutermostBraceRanges - custom chars and unclosed pair', () => {
  assert.equal(findOutermostBraceRanges('[a] [b', '[', ']'), [[0, 3]])
})

// isFallbackSlot: whether a nested variable is an item of the enclosing variable's fallback list
test('isFallbackSlot - bare item after a comma is a slot', () => {
  assert.ok(isFallbackSlot('${env:X, ${sls:stage}}', '${sls:stage}', '${', '}'))
  assert.ok(isFallbackSlot("${env:X, ${env:Y}, 'z'}", '${env:Y}', '${', '}'))
})

test('isFallbackSlot - variable inside a quoted item is not a slot', () => {
  assert.not.ok(isFallbackSlot("${env:X, '${sls:stage}'}", '${sls:stage}', '${', '}'))
  assert.not.ok(isFallbackSlot("${env:X, 'sl-${sls:stage}-manifest'}", '${sls:stage}', '${', '}'))
  assert.not.ok(isFallbackSlot('${env:X, "sl-${sls:stage}"}', '${sls:stage}', '${', '}'))
})

test('isFallbackSlot - variable after other text in an unquoted item is not a slot', () => {
  assert.not.ok(isFallbackSlot('${env:X, sl-${sls:stage}}', '${sls:stage}', '${', '}'))
})

test('isFallbackSlot - first item (source path) is not a slot', () => {
  assert.not.ok(isFallbackSlot('${self:map.${opt:k}}', '${opt:k}', '${', '}'))
})

test('isFallbackSlot - function call arguments are not slots', () => {
  assert.not.ok(isFallbackSlot("${merge('a', ${self:y})}", '${self:y}', '${', '}'))
})

// isWholeFallbackItem: a fallback slot whose item is nothing but the variable
test('isWholeFallbackItem - the variable alone is the item', () => {
  assert.ok(isWholeFallbackItem('${env:X, ${self:a}}', '${self:a}', '${', '}'))
  assert.ok(isWholeFallbackItem("${env:X, ${self:a}, 'z'}", '${self:a}', '${', '}'))
  assert.ok(isWholeFallbackItem('${env:X,${self:a} }', '${self:a}', '${', '}'))
  assert.ok(isWholeFallbackItem('${env:X, ${self:a} | toUpperCase}', '${self:a}', '${', '}'))
})

test('isWholeFallbackItem - text or another variable after it in the item', () => {
  assert.not.ok(isWholeFallbackItem('${env:X, ${self:a}-${self:b}}', '${self:a}', '${', '}'))
  assert.not.ok(isWholeFallbackItem('${env:X, ${self:a}-suffix}', '${self:a}', '${', '}'))
  assert.not.ok(isWholeFallbackItem("${env:X, ${self:a}-suffix, 'z'}", '${self:a}', '${', '}'))
})

test('isWholeFallbackItem - not a fallback slot at all', () => {
  assert.not.ok(isWholeFallbackItem('${env:X, prefix-${self:a}}', '${self:a}', '${', '}'))
  assert.not.ok(isWholeFallbackItem("${env:X, '${self:a}'}", '${self:a}', '${', '}'))
  assert.not.ok(isWholeFallbackItem('${self:map.${opt:k}}', '${opt:k}', '${', '}'))
})

// Run all tests
test.run()
