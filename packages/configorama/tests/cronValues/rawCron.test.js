/* eslint-disable no-template-curly-in-string */
// A raw cron expression passed to ${cron(...)} should pass through unchanged (already valid cron), including
// AWS/Quartz forms that use `?` for an unspecified day field and `L`/`W`/`#` specials. Human-readable
// phrases still convert; a genuinely invalid pattern still errors.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

async function cron(expr) {
  const out = await configorama({ r: `\${cron(${expr})}` }, { options: {} })
  return out.r
}

test('standard 5-field cron passes through', async () => {
  assert.is(await cron('*/5 * * * *'), '*/5 * * * *')
})

test('AWS 6-field cron with ? passes through', async () => {
  assert.is(await cron('0 12 * * ? *'), '0 12 * * ? *')
})

test('quartz cron with L (last) and ? passes through, case preserved', async () => {
  assert.is(await cron('0 0 L * ?'), '0 0 L * ?')
})

test('a quoted raw cron passes through', async () => {
  assert.is(await cron('"0 0 * * *"'), '0 0 * * *')
})

test('a cron with day-name field passes through', async () => {
  assert.is(await cron('0 9 * * MON-FRI'), '0 9 * * MON-FRI')
})

test('human-readable still converts', async () => {
  assert.is(await cron('"every minute"'), '* * * * *')
})

test('a genuinely invalid pattern still errors', async () => {
  try {
    await cron('not a cron at all')
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /cron/i)
  }
})

test('a cron with an invalid field is rejected (validation)', async () => {
  try {
    await cron('0 12 xyz * ? *')
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /cron/i)
  }
})

test('a Quartz 15W (nearest weekday) field passes through', async () => {
  assert.is(await cron('0 0 15W * ?'), '0 0 15W * ?')
})

test.run()
