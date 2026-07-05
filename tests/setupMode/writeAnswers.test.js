// Answers writer - versioned JSON persistence of setup answers for automation
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { writeAnswers } = require('../../src/utils/setup/writeAnswers')

let counter = 0
function tmpTarget() {
  counter += 1
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'write-answers-')), `answers-${counter}.json`)
}

test('writes schemaVersion 1 with all four answer groups', () => {
  const target = tmpTarget()
  const result = writeAnswers(target, {
    options: { stage: 'dev' },
    env: { API_KEY: 'secret' },
  })

  const parsed = JSON.parse(fs.readFileSync(target, 'utf8'))
  assert.is(parsed.schemaVersion, 1)
  assert.equal(parsed.answers.options, { stage: 'dev' })
  assert.equal(parsed.answers.env, { API_KEY: 'secret' })
  assert.equal(parsed.answers.self, {})
  assert.equal(parsed.answers.dotProp, {})

  assert.equal(result.groups, { options: ['stage'], env: ['API_KEY'], self: [], dotProp: [] })
  assert.is(result.path, target)
})

test('creates files with 0600 permissions', () => {
  const target = tmpTarget()
  writeAnswers(target, { env: { KEY: 'v' } })
  const mode = fs.statSync(target).mode & 0o777
  assert.is(mode, 0o600)
})

test('refuses existing file without force', () => {
  const target = tmpTarget()
  fs.writeFileSync(target, '{"mine": true}')
  assert.throws(() => writeAnswers(target, { env: { KEY: 'v' } }), /exists/)
  assert.is(fs.readFileSync(target, 'utf8'), '{"mine": true}', 'file untouched')
})

test('force overwrites an existing file', () => {
  const target = tmpTarget()
  fs.writeFileSync(target, '{"mine": true}')
  writeAnswers(target, { env: { KEY: 'v' } }, { force: true })
  const parsed = JSON.parse(fs.readFileSync(target, 'utf8'))
  assert.is(parsed.answers.env.KEY, 'v')
})

test.run()
