/* Tests for tagging Dates for a JSON round trip and reviving them */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { tagDates, reviveDates } = require('./dates')

test('Dates survive a JSON round trip, nested in objects and arrays', () => {
  const input = { d: new Date('2024-01-15T00:00:00Z'), list: [new Date('2024-02-01T00:00:00Z'), 'x'], n: { s: 'a', num: 1, nil: null } }
  const output = reviveDates(JSON.parse(JSON.stringify(tagDates(input))))
  assert.instance(output.d, Date)
  assert.is(output.d.toISOString(), '2024-01-15T00:00:00.000Z')
  assert.instance(output.list[0], Date)
  assert.equal(output.list[1], 'x')
  assert.equal(output.n, { s: 'a', num: 1, nil: null })
})

test('values without Dates are unchanged', () => {
  const input = { a: 'b', c: [1, 2, { d: true }] }
  assert.equal(reviveDates(tagDates(input)), input)
  assert.is(tagDates('s'), 's')
  assert.is(reviveDates(5), 5)
})

test('an object with other keys next to the tag is not a Date', () => {
  assert.equal(reviveDates({ __configoramaDate: 'x', other: 1 }), { __configoramaDate: 'x', other: 1 })
})

test.run()
