const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

test('cron() with single quotes', async () => {
  const configFilePath = path.join(__dirname, 'cronValueSingleQuotes.yml')
  const config = await configorama(configFilePath)
  
  // Test basic patterns
  assert.equal(config.everyMinute, '* * * * *')
  assert.equal(config.everyHour, '0 * * * *')
  assert.equal(config.everyDay, '0 0 * * *')
  assert.equal(config.weekdays, '0 0 * * 1-5')
  assert.equal(config.midnight, '0 0 * * *')
  assert.equal(config.noon, '0 12 * * *')
  
  // Test interval patterns
  assert.equal(config.every5Minutes, '*/5 * * * *')
  assert.equal(config.every15Minutes, '*/15 * * * *')
  assert.equal(config.every2Hours, '0 */2 * * *')
  assert.equal(config.every3Days, '0 0 */3 * *')
  
  // Test specific times
  assert.equal(config.at930, '30 9 * * *')
  assert.equal(config.at930pm, '30 21 * * *')
  assert.equal(config.at1200, '0 12 * * *')
  assert.equal(config.at1230am, '30 0 * * *')
  
  // Test weekday patterns
  assert.equal(config.mondayMorning, '0 9 * * 1')
  assert.equal(config.fridayEvening, '0 17 * * 5')
  assert.equal(config.sundayNoon, '0 12 * * 0')
  
  // Test pre-existing cron expressions
  assert.equal(config.customCron, '15 2 * * *')
})

test('cron() with double quotes', async () => {
  const configFilePath = path.join(__dirname, 'cronValueDoubleQuotes.yml')
  const config = await configorama(configFilePath)
  
  // Test basic patterns
  assert.equal(config.everyMinute, '* * * * *')
  assert.equal(config.everyHour, '0 * * * *')
  assert.equal(config.everyDay, '0 0 * * *')
  assert.equal(config.weekdays, '0 0 * * 1-5')
  assert.equal(config.midnight, '0 0 * * *')
  assert.equal(config.noon, '0 12 * * *')
  
  // Test interval patterns
  assert.equal(config.every5Minutes, '*/5 * * * *')
  assert.equal(config.every15Minutes, '*/15 * * * *')
  assert.equal(config.every2Hours, '0 */2 * * *')
  assert.equal(config.every3Days, '0 0 */3 * *')
  
  // Test specific times
  assert.equal(config.at930, '30 9 * * *')
  assert.equal(config.at930pm, '30 21 * * *')
  assert.equal(config.at1200, '0 12 * * *')
  assert.equal(config.at1230am, '30 0 * * *')
  
  // Test weekday patterns
  assert.equal(config.mondayMorning, '0 9 * * 1')
  assert.equal(config.fridayEvening, '0 17 * * 5')
  assert.equal(config.sundayNoon, '0 12 * * 0')
  
  // Test pre-existing cron expressions
  assert.equal(config.customCron, '15 2 * * *')
})

test.skip('cron() with backticks', async () => {
  const configFilePath = path.join(__dirname, 'cronValueBackticks.yml')
  const config = await configorama(configFilePath)
  
  // Test basic patterns
  assert.equal(config.everyMinute, '* * * * *')
  assert.equal(config.everyHour, '0 * * * *')
  assert.equal(config.everyDay, '0 0 * * *')
  assert.equal(config.weekdays, '0 0 * * 1-5')
  assert.equal(config.midnight, '0 0 * * *')
  assert.equal(config.noon, '0 12 * * *')
  
  // Test interval patterns
  assert.equal(config.every5Minutes, '*/5 * * * *')
  assert.equal(config.every15Minutes, '*/15 * * * *')
  assert.equal(config.every2Hours, '0 */2 * * *')
  assert.equal(config.every3Days, '0 0 */3 * *')
  
  // Test specific times
  assert.equal(config.at930, '30 9 * * *')
  assert.equal(config.at930pm, '30 21 * * *')
  assert.equal(config.at1200, '0 12 * * *')
  assert.equal(config.at1230am, '30 0 * * *')
  
  // Test weekday patterns
  assert.equal(config.mondayMorning, '0 9 * * 1')
  assert.equal(config.fridayEvening, '0 17 * * 5')
  assert.equal(config.sundayNoon, '0 12 * * 0')
  
  // Test pre-existing cron expressions
  assert.equal(config.customCron, '15 2 * * *')
})

test.run() 