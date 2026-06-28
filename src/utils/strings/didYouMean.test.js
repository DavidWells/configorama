const { test } = require('uvu')
const assert = require('uvu/assert')
const { editDistance, didYouMean } = require('./didYouMean')

const COMMANDS = ['requirements', 'audit', 'graph', 'inspect', 'setup', 'capabilities']

test('editDistance - identical strings are distance 0', () => {
  assert.is(editDistance('graph', 'graph'), 0)
})

test('editDistance - single edit is distance 1', () => {
  assert.is(editDistance('grph', 'graph'), 1)
  assert.is(editDistance('audi', 'audit'), 1)
})

test('editDistance - adjacent transposition counts as one edit', () => {
  assert.is(editDistance('fromat', 'format'), 1)
  assert.is(editDistance('setpu', 'setup'), 1)
})

test('didYouMean - suggests closest command for a near typo', () => {
  assert.is(didYouMean('inspekt', COMMANDS), 'inspect')
  assert.is(didYouMean('audi', COMMANDS), 'audit')
  assert.is(didYouMean('grph', COMMANDS), 'graph')
  assert.is(didYouMean('capabilites', COMMANDS), 'capabilities')
})

test('didYouMean - returns null when nothing is close enough', () => {
  assert.is(didYouMean('myconfig', COMMANDS), null)
  assert.is(didYouMean('config.yml', COMMANDS), null)
})

test('didYouMean - exact match returns the candidate itself', () => {
  assert.is(didYouMean('audit', COMMANDS), 'audit')
})

test('didYouMean - respects a custom threshold', () => {
  assert.is(didYouMean('frmt', ['format'], { threshold: 2 }), 'format')
  assert.is(didYouMean('frmt', ['format'], { threshold: 1 }), null)
})

test('didYouMean - flag typos resolve, passthrough options do not', () => {
  const FLAGS = ['format', 'view', 'output', 'safe', 'help']
  assert.is(didYouMean('fromat', FLAGS), 'format')
  assert.is(didYouMean('veiw', FLAGS), 'view')
  // common Serverless-style passthrough options must NOT be hijacked
  assert.is(didYouMean('stage', FLAGS), null)
  assert.is(didYouMean('domain', FLAGS), null)
  assert.is(didYouMean('region', FLAGS), null)
})

test.run()
