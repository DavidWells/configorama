/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const configorama = require('../../src')

// Build a temp directory outside the configorama git repo so that
// `findProjectRoot` will not walk up into it.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-no-git-'))
const configFile = path.join(tmpRoot, 'config.yml')

test.before(() => {
  fs.writeFileSync(configFile, [
    "# Fallback when not in a git repo",
    "branch: ${git:branch, 'main'}",
    "url: ${git:url, 'https://example.com/fallback'}",
    "dir: ${git:dir, 'no-git-dir'}",
    "sha: ${git:sha1, 'no-sha'}",
    "tag: ${git:tag, 'no-tag'}",
    "msg: ${git:message, 'no-msg'}",
    "emptyFallback: ${git:branch, ''}",
    ""
  ].join('\n'))
})

test.after(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch (e) { /* ignore */ }
})

test('git fallbacks resolve when not in a git repo', async () => {
  const config = await configorama(configFile)
  assert.is(config.branch, 'main')
  assert.is(config.url, 'https://example.com/fallback')
  assert.is(config.dir, 'no-git-dir')
  assert.is(config.sha, 'no-sha')
  assert.is(config.tag, 'no-tag')
  assert.is(config.msg, 'no-msg')
})

test('git fallback to empty string works in non-git dir', async () => {
  const config = await configorama(configFile)
  assert.is(config.emptyFallback, '')
})

test('git ref without fallback in non-git dir throws clear error pointing at config path', async () => {
  const noFallbackFile = path.join(tmpRoot, 'no-fallback.yml')
  fs.writeFileSync(noFallbackFile, "description: located in ${git:dir}\n")

  let err
  try {
    await configorama(noFallbackFile)
  } catch (e) {
    err = e
  }

  assert.ok(err, 'expected an error to be thrown')
  // The error must point to the config location and suggest a fallback,
  // not surface "fatal: not a git repository".
  assert.match(err.message, /Unable to resolve config variable/)
  assert.match(err.message, /description/)
  assert.match(err.message, /fallback/i)
  assert.not.match(err.message, /fatal: not a git repository/)
})

test.run()
