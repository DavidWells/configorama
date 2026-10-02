const { test } = require('uvu')
const assert = require('node:assert/strict')
const { resolutionRecord, isResolutionRecord } = require('./resolutionRecord')
test('runtime identity cannot be forged with user keys or copied', () => {
  const fake = { __internal_only_flag: true, __internal_metadata: true, value: 'literal' }
  assert.equal(isResolutionRecord(fake), false)
  const record = resolutionRecord({ value: 'internal', __internal_only_flag: true })
  assert.equal(isResolutionRecord(record), true)
  assert.equal(isResolutionRecord({ ...record }), false)
  assert.equal(isResolutionRecord(JSON.parse(JSON.stringify(record))), false)
  for (const value of [undefined, null, 1, 'text']) assert.equal(isResolutionRecord(value), false)
  assert.deepEqual(Object.keys(record), ['value', '__internal_only_flag'])
})
test.run()
