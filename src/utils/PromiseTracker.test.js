/* Tests that resolution progress output goes to stderr, not stdout */
const { test } = require('uvu')
const assert = require('uvu/assert')
const PromiseTracker = require('./PromiseTracker')

test('report() writes progress to stderr, not stdout', () => {
  const tracker = new PromiseTracker()
  const pending = Promise.resolve()
  tracker.add('${op(a?x=1&y=2)}', pending, '${op(a?x=1&y=2)}')
  // add() attaches a .then that flips state to resolved on next tick; force pending
  tracker.promiseList[0].state = 'pending'

  const outLines = []
  const errLines = []
  const origLog = console.log
  const origErr = console.error
  console.log = (...args) => outLines.push(args.join(' '))
  console.error = (...args) => errLines.push(args.join(' '))
  try {
    tracker.report()
  } finally {
    console.log = origLog
    console.error = origErr
  }

  assert.is(outLines.length, 0, 'nothing on stdout')
  assert.ok(errLines.some((line) => line.includes('Fetching Async values')), 'progress on stderr')
  // the pending variable (with & in it) must not leak to stdout
  assert.ok(outLines.every((line) => !line.includes('&')))
})

test.run()
