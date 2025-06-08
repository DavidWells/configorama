const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

test('cron: basic patterns', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)
  
  // Test basic patterns
  assert.equal(config.everyMinute, '* * * * *')
  assert.equal(config.everyHour, '0 * * * *')
  assert.equal(config.everyDay, '0 0 * * *')
  assert.equal(config.weekdays, '0 0 * * 1-5')
  assert.equal(config.midnight, '0 0 * * *')
  assert.equal(config.noon, '0 12 * * *')
})

test('cron: interval patterns', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)
  
  assert.equal(config.every5Minutes, '*/5 * * * *')
  assert.equal(config.every15Minutes, '*/15 * * * *')
  assert.equal(config.every2Hours, '0 */2 * * *')
  assert.equal(config.every3Days, '0 0 */3 * *')
})

test('cron: specific times', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)
  
  assert.equal(config.at930, '30 9 * * *')
  assert.equal(config.at930pm, '30 21 * * *')
  assert.equal(config.at1200, '0 12 * * *')
  assert.equal(config.at1230am, '30 0 * * *')
})

test('cron: weekday patterns', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)
  
  assert.equal(config.mondayMorning, '0 9 * * 1')
  assert.equal(config.fridayEvening, '0 17 * * 5')
  assert.equal(config.sundayNoon, '0 12 * * 0')
})

test('cron: pre-existing cron expressions pass through', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)
  
  assert.equal(config.customCron, '15 2 * * *')
  assert.equal(config.atReboot, '@reboot')
})

test('cron: error handling', async () => {
  const configFilePath = path.join(__dirname, 'cronValueError.yml')
  
  try {
    await configorama(configFilePath)
    assert.unreachable('Should have thrown an error')
  } catch (error) {
    assert.ok(error.message.includes('Unrecognized cron pattern'))
  }
})

test('cron: empty value error', async () => {
  const configFilePath = path.join(__dirname, 'cronValueEmpty.yml')
  
  try {
    await configorama(configFilePath)
    assert.unreachable('Should have thrown an error')
  } catch (error) {
    assert.ok(error.message.includes('must have a pattern'))
  }
})

test.run()