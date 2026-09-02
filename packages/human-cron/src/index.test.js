const { test } = require('uvu')
const assert = require('uvu/assert')
const { parseCron, isValidCron, CRON_PATTERNS } = require('./index')

test('parseCron: basic patterns', () => {
  assert.equal(parseCron('every minute'), '* * * * *')
  assert.equal(parseCron('every hour'), '0 * * * *')
  assert.equal(parseCron('every day'), '0 0 * * *')
  assert.equal(parseCron('daily'), '0 0 * * *')
  assert.equal(parseCron('hourly'), '0 * * * *')
  assert.equal(parseCron('yearly'), '0 0 1 1 *')
})

test('parseCron: business patterns', () => {
  assert.equal(parseCron('weekdays'), '0 0 * * 1-5')
  assert.equal(parseCron('weekends'), '0 0 * * 0,6')
  assert.equal(parseCron('business hours'), '0 9-17 * * 1-5')
})

test('parseCron: interval patterns', () => {
  assert.equal(parseCron('every 5 minutes'), '*/5 * * * *')
  assert.equal(parseCron('every 15 minutes'), '*/15 * * * *')
  assert.equal(parseCron('every 2 hours'), '0 */2 * * *')
  assert.equal(parseCron('every 3 days'), '0 0 */3 * *')
  assert.equal(parseCron('every 2 weeks'), '0 0 * * 0/2')
  assert.equal(parseCron('every 6 months'), '0 0 1 */6 *')
  assert.equal(parseCron('every 1 minute'), '*/1 * * * *')
  assert.equal(parseCron('every 1 hour'), '0 */1 * * *')
})

test('parseCron: simple interval patterns', () => {
  assert.equal(parseCron('1 minute'), '*/1 * * * *')
  assert.equal(parseCron('1 hour'), '0 */1 * * *')
  assert.equal(parseCron('5 minutes'), '*/5 * * * *')
  assert.equal(parseCron('2 hours'), '0 */2 * * *')
  assert.equal(parseCron('6 months'), '0 0 1 */6 *')
})

test('parseCron: specific times', () => {
  assert.equal(parseCron('at 9:30'), '30 9 * * *')
  assert.equal(parseCron('at 14:15'), '15 14 * * *')
  assert.equal(parseCron('at 9:30 am'), '30 9 * * *')
  assert.equal(parseCron('at 9:30 pm'), '30 21 * * *')
  assert.equal(parseCron('at 12:30 am'), '30 0 * * *')
  assert.equal(parseCron('at 12:30 pm'), '30 12 * * *')
})

test('parseCron: weekday + time patterns', () => {
  assert.equal(parseCron('on monday at 9:00'), '0 9 * * 1')
  assert.equal(parseCron('on friday at 17:30'), '30 17 * * 5')
  assert.equal(parseCron('on sunday at 12:00'), '0 12 * * 0')
  assert.equal(parseCron('on wednesday at 9:30 pm'), '30 21 * * 3')
  assert.equal(parseCron('on monday,wednesday,friday at 9:00'), '0 9 * * 1,3,5')
  assert.equal(parseCron('on tuesday,thursday at 2:30 pm'), '30 14 * * 2,4')
  assert.equal(parseCron('on saturday,sunday at 12:00'), '0 12 * * 6,0')
})

test('parseCron: ordinal dates of month', () => {
  assert.equal(parseCron('on 1st of month at 00:00'), '0 0 1 * *')
  assert.equal(parseCron('on 15th of month at 9:30 am'), '30 9 15 * *')
  assert.equal(parseCron('on 31st of month at 2:00 pm'), '0 14 31 * *')
  assert.equal(parseCron('on 2nd of month at 12:00'), '0 12 2 * *')
})

test('parseCron: case insensitive', () => {
  assert.equal(parseCron('EVERY MINUTE'), '* * * * *')
  assert.equal(parseCron('Weekdays'), '0 0 * * 1-5')
  assert.equal(parseCron('At 9:30 PM'), '30 21 * * *')
  assert.equal(parseCron('ON MONDAY AT 9:00'), '0 9 * * 1')
})

test('parseCron: days of week', () => {
  assert.equal(parseCron('monday'), '0 0 * * 1')
  assert.equal(parseCron('sunday'), '0 0 * * 0')
})

test('parseCron: special patterns', () => {
  assert.equal(parseCron('first day of month'), '0 0 1 * *')
  assert.equal(parseCron('middle of month'), '0 0 15 * *')
  assert.equal(parseCron('never'), '0 0 30 2 *')
  assert.equal(parseCron('reboot'), '@reboot')
  assert.equal(parseCron('startup'), '@reboot')
})

test('parseCron: raw cron expressions pass through', () => {
  assert.equal(parseCron('0 12 * * *'), '0 12 * * *')
  assert.equal(parseCron('*/5 * * * *'), '*/5 * * * *')
  assert.equal(parseCron('15 2,14 * * *'), '15 2,14 * * *')
  assert.equal(parseCron('0 12 * * ? *'), '0 12 * * ? *') // AWS/Quartz ?
  assert.equal(parseCron('0 0 L * ?'), '0 0 L * ?') // Quartz L, case preserved
  assert.equal(parseCron('0 0 15W * ?'), '0 0 15W * ?') // nearest weekday
  assert.equal(parseCron('0 9 * * MON-FRI'), '0 9 * * MON-FRI') // day names
  assert.equal(parseCron('0 0 12 * * ? 2025'), '0 0 12 * * ? 2025') // 7-field Quartz
})

test('parseCron: bare-hour times (optional minutes / am-pm)', () => {
  assert.equal(parseCron('at 9'), '0 9 * * *')
  assert.equal(parseCron('at 9pm'), '0 21 * * *')
  assert.equal(parseCron('at 9 pm'), '0 21 * * *')
  assert.equal(parseCron('at 9am'), '0 9 * * *')
  assert.equal(parseCron('at 12am'), '0 0 * * *')
  assert.equal(parseCron('at 12pm'), '0 12 * * *')
  assert.equal(parseCron('at nine pm'), '0 21 * * *') // spelled-out + bare hour
  assert.equal(parseCron('at 9:30 pm'), '30 21 * * *') // minutes still work
})

test('parseCron: named times of day with "at"', () => {
  assert.equal(parseCron('at noon'), '0 12 * * *')
  assert.equal(parseCron('at midnight'), '0 0 * * *')
})

test('parseCron: spelled-out numbers', () => {
  assert.equal(parseCron('every five minutes'), '*/5 * * * *')
  assert.equal(parseCron('five minutes'), '*/5 * * * *')
  assert.equal(parseCron('every two hours'), '0 */2 * * *')
  assert.equal(parseCron('every one minute'), '*/1 * * * *')
  assert.equal(parseCron('every fifteen minutes'), '*/15 * * * *')
  assert.equal(parseCron('every thirty minutes'), '*/30 * * * *')
  assert.equal(parseCron('twenty minutes'), '*/20 * * * *')
  assert.equal(parseCron('every twenty five minutes'), '*/25 * * * *')
  assert.equal(parseCron('every twenty-five minutes'), '*/25 * * * *')
  assert.equal(parseCron('three days'), '0 0 */3 * *')
})

test('parseCron: spelled-out numbers are case-insensitive', () => {
  assert.equal(parseCron('Every Five Minutes'), '*/5 * * * *')
})

test('parseCron: error handling', () => {
  assert.throws(() => parseCron(''), /must be a non-empty string/)
  assert.throws(() => parseCron(null), /must be a non-empty string/)
  assert.throws(() => parseCron(123), /must be a non-empty string/)
  assert.throws(() => parseCron('invalid pattern'), /Unrecognized cron pattern/)
  assert.throws(() => parseCron('every xyz'), /Unrecognized cron pattern/)
  assert.throws(() => parseCron('0 12 xyz * ? *'), /Unrecognized cron pattern/) // invalid field
})

test('isValidCron', () => {
  assert.ok(isValidCron('* * * * *'))
  assert.ok(isValidCron('0 12 * * ? *'))
  assert.ok(isValidCron('0 0 L * ?'))
  assert.ok(isValidCron('0 9 * * MON-FRI'))
  assert.ok(isValidCron('@reboot'))
  assert.ok(isValidCron('0 0 12 * * ? 2025'))
  assert.not.ok(isValidCron('0 12 xyz * ? *'))
  assert.not.ok(isValidCron('too few'))
  assert.not.ok(isValidCron('1 2 3 4 5 6 7 8'))
  assert.not.ok(isValidCron(''))
  assert.not.ok(isValidCron(null))
})

test('CRON_PATTERNS is exported', () => {
  assert.equal(CRON_PATTERNS['every minute'], '* * * * *')
  assert.type(CRON_PATTERNS, 'object')
})

test.run()
