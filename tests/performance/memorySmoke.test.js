const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

test('repeated metadata resolution has bounded heap growth smoke signal', async () => {
  const fixture = path.join(__dirname, '../metadata/test-config.yml')
  const before = process.memoryUsage().heapUsed

  for (let i = 0; i < 30; i++) {
    await configorama(fixture, {
      returnMetadata: true,
      options: { stage: 'prod' }
    })
  }

  const after = process.memoryUsage().heapUsed
  const deltaMb = (after - before) / 1024 / 1024
  assert.ok(deltaMb < 128, `heap grew by ${deltaMb.toFixed(2)}MB`)
})

test.run()
