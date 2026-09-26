const { test } = require('uvu')
const assert = require('uvu/assert')
const { preProcess } = require('./yaml')

test('preProcess - should wrap variables in quotes inside array brackets', () => {
  const input = `

x: !Not [!Equals [!Join ['', "\${param:githubActionsAllowedAwsActions}"]]]

y: !Not [!Equals [!Join ['', \${param:xyz}]]]

# empty: "\${file(./config.json):na, ''}"

TestThree:
  foo: 
    - ['a', 'b', 'c']
    - ['d', 'e', \${ opt:otherFlag }, \${ opt:chillFlag }]
    - ['d', 'e', "\${opt:otherFlag}", "\${opt:chillFlag}"]
    - ['d', 'e', "\${opt:otherFlag}", "\${opt:chillFlag}"]


key: ['string1', 'string2', 'string3', 
  'string4', \${opt:otherFlag}, 
  'string6'
]

keyTwo: ['string1', 'long
  string', 'string3', 'string4', 'string5', 'string6']

myarray: [
  String1, String2, String3,
  String4, String5, String5, String7
]

xx: {
  cool: \${self:empty, 'no value here'}
}

myarrayTwo: [
  String1, \${self:empty, 'no value here'}, String3,
  String4, String5, String5, String7
]

normalObject: 
  cool: \${self:empty, 'no value here'}

# shorthand variable declaration
domainNameTwo: my-site-two.com
stage: dev
domainsTwo:
  prod:    api.\${domainNameTwo}
  staging: api-staging.\${domainNameTwo}
  dev:     api-dev.\${domainNameTwo}
resolvedDomainNameTwo: \${domainsTwo.\${opt:stage, "prod"}}

`
  const expected = `

x: !Not [!Equals [!Join ['', "\${param:githubActionsAllowedAwsActions}"]]]

y: !Not [!Equals [!Join ['', "\${param:xyz}"]]]

# empty: "\${file(./config.json):na, ''}"

TestThree:
  foo: 
    - ['a', 'b', 'c']
    - ['d', 'e', "\${ opt:otherFlag }", "\${ opt:chillFlag }"]
    - ['d', 'e', "\${opt:otherFlag}", "\${opt:chillFlag}"]
    - ['d', 'e', "\${opt:otherFlag}", "\${opt:chillFlag}"]


key: ['string1', 'string2', 'string3', 
  'string4', "\${opt:otherFlag}", 
  'string6'
]

keyTwo: ['string1', 'long
  string', 'string3', 'string4', 'string5', 'string6']

myarray: [
  String1, String2, String3,
  String4, String5, String5, String7
]

xx: {
  cool: "\${self:empty, 'no value here'}"
}

myarrayTwo: [
  String1, "\${self:empty, 'no value here'}", String3,
  String4, String5, String5, String7
]

normalObject: 
  cool: \${self:empty, 'no value here'}

# shorthand variable declaration
domainNameTwo: my-site-two.com
stage: dev
domainsTwo:
  prod:    api.\${domainNameTwo}
  staging: api-staging.\${domainNameTwo}
  dev:     api-dev.\${domainNameTwo}
resolvedDomainNameTwo: \${domainsTwo.\${opt:stage, "prod"}}

`
  const result = preProcess(input)
  console.log('result', result)
  assert.equal(result, expected)
})

test('preProcess - should wrap variables in quotes inside array brackets two', () => {
  const input = `
service: my-service
custom:
  myValue: !Not [!Equals [!Join ['', \${param:xyz}]]]
`
  const expected = `
service: my-service
custom:
  myValue: !Not [!Equals [!Join ['', "\${param:xyz}"]]]
`
  const result = preProcess(input)
  assert.equal(result, expected)
})

test('preProcess - should wrap variables in quotes inside objects', () => {
  const input = `
resources:
  MyResource:
    Type: AWS::Lambda::Function
    Properties: {
      FunctionName: \${env:FUNC_NAME},
      Handler: index.handler
    }
`
  const expected = `
resources:
  MyResource:
    Type: AWS::Lambda::Function
    Properties: {
      FunctionName: "\${env:FUNC_NAME}",
      Handler: index.handler
    }
`
  const result = preProcess(input)
  assert.equal(result, expected)
})

test('preProcess - should not wrap already quoted variables', () => {
  const input = `
custom:
  alreadyQuoted: !Not [!Equals [!Join ['', "\${param:xyz}"]]]
  objectQuoted:
    Properties: {
      Name: "\${env:NAME}"
    }
`
  const result = preProcess(input)
  assert.equal(result, input)
})

test('preProcess - should handle empty input', () => {
  const result = preProcess()
  assert.equal(result, '')
})

// ==========================================
// Duplicate variable tests - Bug: String.replace() only replaces first occurrence
// ==========================================

test('preProcess - should wrap ALL duplicate variables in quotes within same array', () => {
  const input = `
items: [\${var:foo}, \${var:foo}, \${var:foo}]
`
  const result = preProcess(input)

  // All three occurrences should be wrapped
  const wrappedCount = (result.match(/"\$\{var:foo\}"/g) || []).length

  assert.is(wrappedCount, 3, `Expected 3 wrapped occurrences, got ${wrappedCount}. Output: ${result}`)
})

test('preProcess - should wrap ALL duplicate variables in quotes within same object', () => {
  const input = `
config: {stage: \${env:STAGE}, region: \${env:STAGE}}
`
  const result = preProcess(input)

  // Both occurrences should be wrapped
  const wrappedCount = (result.match(/"\$\{env:STAGE\}"/g) || []).length

  assert.is(wrappedCount, 2, `Expected 2 wrapped occurrences, got ${wrappedCount}. Output: ${result}`)
})

test('preProcess - should wrap duplicate variables mixed with unique variables in array', () => {
  const input = `
mixed: [\${env:FOO}, \${env:BAR}, \${env:FOO}]
`
  const result = preProcess(input)

  const fooCount = (result.match(/"\$\{env:FOO\}"/g) || []).length
  const barCount = (result.match(/"\$\{env:BAR\}"/g) || []).length

  assert.is(fooCount, 2, `Expected 2 wrapped FOO occurrences, got ${fooCount}. Output: ${result}`)
  assert.is(barCount, 1, `Expected 1 wrapped BAR occurrence, got ${barCount}. Output: ${result}`)
})

test('preProcess - should wrap duplicate variables in nested array structure', () => {
  const input = `
nested: [[\${opt:stage}, \${opt:stage}], [\${opt:stage}]]
`
  const result = preProcess(input)

  const wrappedCount = (result.match(/"\$\{opt:stage\}"/g) || []).length

  assert.is(wrappedCount, 3, `Expected 3 wrapped occurrences, got ${wrappedCount}. Output: ${result}`)
})

// ==========================================
// Block scalars (| > and variants) hold literal text: preProcess must not edit it
// ==========================================

const blockIndicators = ['|', '|-', '|+', '>', '>-', '|2', '>+2']
blockIndicators.forEach((indicator) => {
  test(`preProcess - leaves "${indicator}" block scalar content untouched`, () => {
    const input = `stage: dev
v: ${indicator}
  [ "\\"A/\${self:stage}\\"" ]
  [ \\\${self:stage} ]
  [ \${self:stage} ]
  x: { a: \${self:stage} }
after: 1
`
    assert.is(preProcess(input), input)
  })
})

test('preProcess - leaves tagged (!Sub |) block scalar content untouched', () => {
  const input = `Resources:
  Dashboard:
    Properties:
      DashboardBody: !Sub |
        {
          "widgets": [ { "properties": {
            "metrics": [ [ { "expression": "SEARCH('{\\"SaaSLayer/RBAC/\${self:provider.stackName}\\",Path} M=\\"x\\"', 'Sum', 60)" } ] ],
            "region": "\${AWS::Region}",
            "periods": [ \${Period} ]
          } } ]
        }
      Other: 1
`
  assert.is(preProcess(input), input)
})

test('preProcess - leaves "- |" sequence item block content untouched', () => {
  const input = `items:
  - |
    [ \${self:stage} ]
  - key: |
      [ \${self:stage} ]
    sibling: [ \${self:stage} ]
`
  const expected = `items:
  - |
    [ \${self:stage} ]
  - key: |
      [ \${self:stage} ]
    sibling: [ "\${self:stage}" ]
`
  assert.is(preProcess(input), expected)
})

test('preProcess - flow array and object right after a block scalar still get bare vars wrapped', () => {
  const input = `v: |
  [ \${self:stage} ]
  { a: \${self:stage} }

arr: [ \${self:stage}, b ]
obj: { a: \${self:stage} }
`
  const expected = `v: |
  [ \${self:stage} ]
  { a: \${self:stage} }

arr: [ "\${self:stage}", b ]
obj: { a: "\${self:stage}" }
`
  assert.is(preProcess(input), expected)
})

test('preProcess - identical flow array inside and after a block: only the one outside is wrapped', () => {
  const input = `v: >-
  obj: { a: \${self:stage} }
obj: { a: \${self:stage} }
`
  const expected = `v: >-
  obj: { a: \${self:stage} }
obj: { a: "\${self:stage}" }
`
  assert.is(preProcess(input), expected)
})

test('preProcess - CloudFormation dynamic reference inside a block scalar is not quoted', () => {
  const input = `cfg: { a: 1 }
script: !Sub |
  echo {{resolve:ssm:/my/param}} done
`
  assert.is(preProcess(input), input)
})

// ==========================================
// Brackets/braces that are literal text (inside a quoted or plain scalar) are not
// flow collections: preProcess must not wrap vars inside them
// ==========================================

test('preProcess - braces inside a double-quoted scalar are left alone', () => {
  const input = `obj: { a: 1 }
v: "{\${self:stage}}"
`
  assert.is(preProcess(input), input)
})

test('preProcess - braces inside a single-quoted scalar are left alone', () => {
  const input = `obj: { a: 1 }
v: 'x {\${self:stage}} y'
`
  assert.is(preProcess(input), input)
})

test('preProcess - braces and brackets mid plain scalar are left alone', () => {
  const input = `obj: { a: 1 }
braces: pre {\${self:stage}} post
brackets: pre [\${self:stage}] post
attached: echo a[\${self:stage}]
url: http://x[\${self:stage}]
dashed: pre-[\${self:stage}]
`
  assert.is(preProcess(input), input)
})

test('preProcess - CloudFormation dynamic reference mid plain scalar is not quoted', () => {
  const input = `obj: { a: 1 }
v: pre {{resolve:ssm:/my/param}} post
`
  assert.is(preProcess(input), input)
})

test('preProcess - flow collections in value positions still get bare vars wrapped', () => {
  const input = `obj: {a: \${self:stage}}
tagged: !Join [ '', [ \${self:stage} ] ]
seq:
  - {a: \${self:stage}}
  - [\${self:stage}]
inArr: [ {a: \${self:stage}}, [\${self:stage}] ]
multi: [
  \${self:stage},
  {a: \${self:stage}}
]
anchored: &x [\${self:stage}]
json: {"a":[\${self:stage}]}
`
  const expected = `obj: {a: "\${self:stage}"}
tagged: !Join [ '', [ "\${self:stage}" ] ]
seq:
  - {a: "\${self:stage}"}
  - ["\${self:stage}"]
inArr: [ {a: "\${self:stage}"}, ["\${self:stage}"] ]
multi: [
  "\${self:stage}",
  {a: "\${self:stage}"}
]
anchored: &x ["\${self:stage}"]
json: {"a":["\${self:stage}"]}
`
  assert.is(preProcess(input), expected)
})

test('preProcess - CRLF line endings: block scalar content untouched', () => {
  const input = 'v: |\r\n  [ ${self:stage} ]\r\n  x: { a: ${self:stage} }\r\nafter: 1\r\n'
  assert.is(preProcess(input), input)
})

test('preProcess - var after a tag inside a flow collection is wrapped', () => {
  assert.is(preProcess('a: [ !Ref \${x}, !Sub \${y} ]\n'), 'a: [ !Ref "\${x}", !Sub "\${y}" ]\n')
})

test('preProcess - var mid-entry or with its own double quotes is not wrapped', () => {
  const input = 'a: [ x-\${y}, \${opt:z, "d"} ]\n'
  assert.is(preProcess(input), input)
})

test('preProcess - quoted scalars with escapes inside flow collections', () => {
  assert.is(
    preProcess(`a: [ "q\\"]", 'it''s ]', \${x} ]\n`),
    `a: [ "q\\"]", 'it''s ]', "\${x}" ]\n`
  )
})

test.run()
