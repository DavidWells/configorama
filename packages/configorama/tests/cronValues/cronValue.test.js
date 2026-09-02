const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

test('cron() basic patterns', async () => {
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

test('cron() interval patterns', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)
  
  assert.equal(config.every5Minutes, '*/5 * * * *')
  assert.equal(config.every15Minutes, '*/15 * * * *')
  assert.equal(config.every2Hours, '0 */2 * * *')
  assert.equal(config.every3Days, '0 0 */3 * *')
})

test('cron() specific times', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)
  
  assert.equal(config.at930, '30 9 * * *')
  assert.equal(config.at930pm, '30 21 * * *')
  assert.equal(config.at1200, '0 12 * * *')
  assert.equal(config.at1230am, '30 0 * * *')
})

test('cron() weekday patterns', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)
  
  assert.equal(config.mondayMorning, '0 9 * * 1')
  assert.equal(config.fridayEvening, '0 17 * * 5')
  assert.equal(config.sundayNoon, '0 12 * * 0')
})

test('cron() bare times without "at"', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)

  assert.equal(config.at9am, '0 9 * * *')
  assert.equal(config.at3pm, '0 15 * * *')
  assert.equal(config.at930colon, '30 9 * * *')
})

test('cron() day + time without "on"', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)

  assert.equal(config.mondayAt9, '0 9 * * 1')
  assert.equal(config.fridaysAt5pm, '0 17 * * 5')
  assert.equal(config.weekendPair, '0 8 * * 6,0')
})

test('cron() named times in compound schedules', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)

  assert.equal(config.everyDayAtNoon, '0 12 * * *')
  assert.equal(config.dailyAtMidnight, '0 0 * * *')
  assert.equal(config.weekendsAtNoon, '0 12 * * 0,6')
})

test('cron() day plurals with on/each and ranges', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)

  assert.equal(config.onSundays, '0 0 * * 0')
  assert.equal(config.eachMonday, '0 0 * * 1')
  assert.equal(config.monToFri, '0 0 * * 1-5')
})

test('cron() abbreviated units', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)

  assert.equal(config.every15m, '*/15 * * * *')
  assert.equal(config.every2h, '0 */2 * * *')
  assert.equal(config.every30min, '*/30 * * * *')
})

test('cron() "every other X" means every 2', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)

  assert.equal(config.everyOtherDay, '0 0 */2 * *')
  assert.equal(config.everyOtherHour, '0 */2 * * *')
})

test('cron() month/date phrases default to midnight', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)

  assert.equal(config.onThe1st, '0 0 1 * *')
  assert.equal(config.fifteenthOfMonth, '0 0 15 * *')
  assert.equal(config.endOfMonth, '0 0 L * *')
})

test('cron() frequency words', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)

  assert.equal(config.onceADay, '0 0 * * *')
  assert.equal(config.twiceADay, '0 0,12 * * *')
  assert.equal(config.everyHalfHour, '*/30 * * * *')
  assert.equal(config.everyQuarterHour, '*/15 * * * *')
})

test('cron() pre-existing cron expressions pass through', async () => {
  const configFilePath = path.join(__dirname, 'cronValue.yml')
  const config = await configorama(configFilePath)
  
  assert.equal(config.customCron, '15 2 * * *')
})

test('cron() error handling', async () => {
  const configFilePath = path.join(__dirname, 'cronValueError.yml')
  
  try {
    await configorama(configFilePath)
    assert.unreachable('Should have thrown an error')
  } catch (error) {
    assert.ok(error.message.includes('Unrecognized cron pattern'))
  }
})

test('cron() empty value error', async () => {
  const configFilePath = path.join(__dirname, 'cronValueEmpty.yml')
  
  try {
    const res = await configorama(configFilePath)
    // console.log('res', res)
    assert.unreachable('Should have thrown an error')
  } catch (error) {
    // console.log('error', error)
    assert.ok(error.message.includes('Invalid variable syntax for cron reference'), 'error msg')
  }
})

test.run()