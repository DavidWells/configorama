/* Unquoted variable in a flow collection yields a clear, actionable error */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

test('unquoted embedded var in flow collection -> clear error', async () => {
  process.env.POOL = 'us-east-1_zMCQjZIHO'
  let msg = ''
  try {
    await configorama(path.join(__dirname, 'flowUnquotedError.yml'), { configDir: __dirname })
    assert.unreachable('should have thrown')
  } catch (e) {
    msg = e.message
  }
  console.log('ERROR MESSAGE:\n' + msg)
  assert.ok(/unquoted flow collection/i.test(msg), 'names the cause')
  assert.ok(msg.includes('flowUnquotedError.yml'), 'includes file path')
  assert.ok(msg.includes('${env:POOL}'), 'shows the offending line')
  delete process.env.POOL
})

test.run()
