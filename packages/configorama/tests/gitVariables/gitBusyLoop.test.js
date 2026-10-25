// Tests that git: variables resolve while the event loop is busy with other work after git is spawned.
// Rendering a large config keeps the loop busy for seconds on a loaded machine though git itself takes milliseconds.
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const createGitResolver = require('../../src/resolvers/valueFromGit')

/**
 * Blocks the event loop, as synchronous resolution of other variables does
 * @param {number} ms
 */
function busy(ms) {
  const until = Date.now() + ms
  while (Date.now() < until) {}
}

const repoDir = path.join(__dirname, '..', '..')

/**
 * Starts resolving a git: variable, then keeps the loop busy. Runs from the check phase so the timers phase comes
 * next, as it does between resolutions of a large config.
 * @param {string} variable
 * @param {number} ms
 */
function resolveWhileBusy(variable, ms) {
  const { resolver } = createGitResolver(repoDir)
  return new Promise((resolve) => setImmediate(() => {
    const pending = resolver(variable)
    busy(ms)
    resolve(pending)
  }))
}

test('${git:url} resolves when the loop is busy for 1.5 s after git starts', async () => {
  assert.is(await resolveWhileBusy('git:url', 1500), 'https://github.com/DavidWells/configorama')
})

test('${git:commit} resolves when the loop is busy for 1.5 s after git starts', async () => {
  assert.match(await resolveWhileBusy('git:commit', 1500), /^[0-9a-f]{40}$/)
})

test.run()
