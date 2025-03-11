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

test('preProcess - should wrap variables in quotes inside array brackets', () => {
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

test.run() 