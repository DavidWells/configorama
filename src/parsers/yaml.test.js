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

test.run() 