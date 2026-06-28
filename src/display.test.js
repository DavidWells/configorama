const { test } = require('uvu')
const assert = require('uvu/assert')
const { displayConfigurableVariables } = require('./display')

function captureStdout(fn) {
  const originalLog = console.log
  const output = []
  console.log = (...args) => output.push(args.join(' '))
  try {
    fn()
  } finally {
    console.log = originalLog
  }
  return output.join('\n')
}

test('displayConfigurableVariables renders annotation metadata and sensitive overrides', () => {
  const output = captureStdout(() => {
    displayConfigurableVariables({
      uniqueVarKeys: [
        'env:CONFIGORAMA_DISPLAY_SECRET',
        'env:CONFIGORAMA_DISPLAY_PUBLIC_KEY',
      ],
      uniqueVariables: {
        'env:CONFIGORAMA_DISPLAY_SECRET': {
          varName: 'env:CONFIGORAMA_DISPLAY_SECRET',
          variableType: 'env',
          variableSourceType: 'user',
          descriptions: ['Stripe live secret key'],
          resolvedValue: 'secret-value',
          occurrences: [
            {
              path: 'secrets.stripeSecret',
              varMatch: '${env:CONFIGORAMA_DISPLAY_SECRET}',
              isRequired: true,
              sensitive: true,
              group: 'Payments',
              obtainHint: 'Stripe dashboard > Developers > API keys',
              examples: ['sk_live_...'],
              defaultHint: 'Set in CI',
              deprecationMessage: 'Use STRIPE_RESTRICTED_KEY instead',
            }
          ],
        },
        'env:CONFIGORAMA_DISPLAY_PUBLIC_KEY': {
          varName: 'env:CONFIGORAMA_DISPLAY_PUBLIC_KEY',
          variableType: 'env',
          variableSourceType: 'user',
          descriptions: ['Public publishable key'],
          resolvedValue: 'public-value',
          occurrences: [
            {
              path: 'secrets.publishableKey',
              varMatch: '${env:CONFIGORAMA_DISPLAY_PUBLIC_KEY}',
              isRequired: true,
              sensitive: false,
            }
          ],
        },
      },
      lines: [],
      fileType: 'yaml',
      configFilePath: '',
    })
  })

  assert.match(output, /Group:/)
  assert.match(output, /Payments/)
  assert.match(output, /From:/)
  assert.match(output, /Stripe dashboard > Developers > API keys/)
  assert.match(output, /Example:/)
  assert.match(output, /sk_live_\.\.\./)
  assert.match(output, /Default hint:/)
  assert.match(output, /Set in CI/)
  assert.match(output, /Deprecated:/)
  assert.match(output, /Use STRIPE_RESTRICTED_KEY instead/)
  assert.match(output, /\*{8}/)
  assert.not.match(output, /secret-value/)
  assert.match(output, /public-value/)
})

test.run()
