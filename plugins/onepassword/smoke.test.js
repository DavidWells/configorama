/* Optional real-CLI smoke test for the 1Password plugin
   Runs only with CONFIGORAMA_OP_E2E=1 and CONFIGORAMA_OP_TEST_REF set */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { readSecretRef } = require('./op-cli')

const enabled = process.env.CONFIGORAMA_OP_E2E === '1' && process.env.CONFIGORAMA_OP_TEST_REF

if (!enabled) {
  test('1Password smoke test skipped (set CONFIGORAMA_OP_E2E=1 and CONFIGORAMA_OP_TEST_REF=op://... to enable)', () => {
    assert.ok(true)
  })
} else {
  test('op read resolves a non-empty value through the real CLI', async () => {
    const value = await readSecretRef(process.env.CONFIGORAMA_OP_TEST_REF)
    // Never print the value - assert on shape only
    assert.type(value, 'string')
    assert.ok(value.length > 0, 'resolved value should be non-empty')
  })
}

test.run()
