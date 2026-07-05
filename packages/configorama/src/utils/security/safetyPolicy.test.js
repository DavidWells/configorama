const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const {
  checkFileAccess,
  normalizeSafetyPolicy,
} = require('./safetyPolicy')

test('safe mode blocks executable file references', () => {
  const policy = normalizeSafetyPolicy({ safeMode: true }, { configDir: __dirname })

  assert.throws(() => {
    checkFileAccess(path.join(__dirname, 'config.js'), policy, { variableString: 'file(./config.js)' })
  }, /Blocked executable config reference/)
})

test('safe mode allows data file references inside config root', () => {
  const policy = normalizeSafetyPolicy({ safeMode: true }, { configDir: __dirname })
  checkFileAccess(path.join(__dirname, 'fixture.yml'), policy, { variableString: 'file(./fixture.yml)' })
})

test('safe mode blocks traversal outside allowed roots', () => {
  const policy = normalizeSafetyPolicy({ safeMode: true }, { configDir: __dirname })
  assert.throws(() => {
    checkFileAccess(path.resolve(__dirname, '../../../package.json'), policy, { variableString: 'file(../../../package.json)' })
  }, /outside allowed roots/)
})

test.run()
