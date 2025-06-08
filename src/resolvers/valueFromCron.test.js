const { test } = require('uvu')
const assert = require('uvu/assert')
const { _parseCronExpression } = require('./valueFromCron')

test('parseCronExpression: basic patterns', () => {
  assert.equal(_parseCronExpression('every minute'), '* * * * *')
  assert.equal(_parseCronExpression('every hour'), '0 * * * *')
  assert.equal(_parseCronExpression('every day'), '0 0 * * *')
  assert.equal(_parseCronExpression('daily'), '0 0 * * *')
  assert.equal(_parseCronExpression('hourly'), '0 * * * *')
  assert.equal(_parseCronExpression('yearly'), '0 0 1 1 *')
})

test('parseCronExpression: business patterns', () => {
  assert.equal(_parseCronExpression('weekdays'), '0 0 * * 1-5')
  assert.equal(_parseCronExpression('weekends'), '0 0 * * 0,6')
  assert.equal(_parseCronExpression('business hours'), '0 9-17 * * 1-5')
})

test('parseCronExpression: interval patterns', () => {
  assert.equal(_parseCronExpression('every 5 minutes'), '*/5 * * * *')
  assert.equal(_parseCronExpression('every 15 minutes'), '*/15 * * * *')
  assert.equal(_parseCronExpression('every 2 hours'), '0 */2 * * *')
  assert.equal(_parseCronExpression('every 3 days'), '0 0 */3 * *')
  assert.equal(_parseCronExpression('every 2 weeks'), '0 0 * * 0/2')
  assert.equal(_parseCronExpression('every 6 months'), '0 0 1 */6 *')
})

test('parseCronExpression: specific times', () => {
  assert.equal(_parseCronExpression('at 9:30'), '30 9 * * *')
  assert.equal(_parseCronExpression('at 14:15'), '15 14 * * *')
  assert.equal(_parseCronExpression('at 9:30 am'), '30 9 * * *')
  assert.equal(_parseCronExpression('at 9:30 pm'), '30 21 * * *')
  assert.equal(_parseCronExpression('at 12:30 am'), '30 0 * * *')
  assert.equal(_parseCronExpression('at 12:30 pm'), '30 12 * * *')
})

test('parseCronExpression: weekday + time patterns', () => {
  assert.equal(_parseCronExpression('on monday at 9:00'), '0 9 * * 1')
  assert.equal(_parseCronExpression('on friday at 17:30'), '30 17 * * 5')
  assert.equal(_parseCronExpression('on sunday at 12:00'), '0 12 * * 0')
  assert.equal(_parseCronExpression('on wednesday at 9:30 pm'), '30 21 * * 3')
})

test('parseCronExpression: case insensitive', () => {
  assert.equal(_parseCronExpression('EVERY MINUTE'), '* * * * *')
  assert.equal(_parseCronExpression('Weekdays'), '0 0 * * 1-5')
  assert.equal(_parseCronExpression('At 9:30 PM'), '30 21 * * *')
  assert.equal(_parseCronExpression('ON MONDAY AT 9:00'), '0 9 * * 1')
})

test('parseCronExpression: existing cron expressions pass through', () => {
  assert.equal(_parseCronExpression('0 12 * * *'), '0 12 * * *')
  assert.equal(_parseCronExpression('*/5 * * * *'), '*/5 * * * *')
  //assert.equal(_parseCronExpression('@reboot'), '@reboot')
  assert.equal(_parseCronExpression('15 2,14 * * *'), '15 2,14 * * *')
})

test('parseCronExpression: days of week', () => {
  assert.equal(_parseCronExpression('monday'), '0 0 * * 1')
  assert.equal(_parseCronExpression('tuesday'), '0 0 * * 2')
  assert.equal(_parseCronExpression('wednesday'), '0 0 * * 3')
  assert.equal(_parseCronExpression('thursday'), '0 0 * * 4')
  assert.equal(_parseCronExpression('friday'), '0 0 * * 5')
  assert.equal(_parseCronExpression('saturday'), '0 0 * * 6')
  assert.equal(_parseCronExpression('sunday'), '0 0 * * 0')
})

test('parseCronExpression: special patterns', () => {
  assert.equal(_parseCronExpression('first day of month'), '0 0 1 * *')
  assert.equal(_parseCronExpression('middle of month'), '0 0 15 * *')
  assert.equal(_parseCronExpression('never'), '0 0 30 2 *')
  assert.equal(_parseCronExpression('reboot'), '@reboot')
  assert.equal(_parseCronExpression('startup'), '@reboot')
})

test('parseCronExpression: error handling', () => {
  assert.throws(() => _parseCronExpression(''), /must be a non-empty string/)
  assert.throws(() => _parseCronExpression(null), /must be a non-empty string/)
  assert.throws(() => _parseCronExpression(123), /must be a non-empty string/)
  assert.throws(() => _parseCronExpression('invalid pattern'), /Unrecognized cron pattern/)
  assert.throws(() => _parseCronExpression('every xyz'), /Unrecognized cron pattern/)
})

test.run()