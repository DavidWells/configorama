/* End-to-end tests for the configx setup command
   Spawns the real CLI; prompt answers come from a promptRenderer in a settings file */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const cli = path.join(__dirname, 'cli.js')
const fixtures = path.join(__dirname, 'test')
const basic = path.join(fixtures, 'basic.yml')

/**
 * Run the configx CLI as a child process.
 * @param {string[]} args - CLI arguments
 * @param {object} [env] - Extra env vars for the configx process
 * @returns {{status: number, stdout: string, stderr: string}} Result
 */
function runConfigx(args, env = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

test('setup without a file exits 2 with usage', () => {
  const r = runConfigx(['setup'])
  assert.is(r.status, 2)
  assert.match(r.stderr, /Usage: configx setup/)
  assert.is(r.stdout, '')
})

test('setup with a missing file exits 2', () => {
  const r = runConfigx(['setup', path.join(fixtures, 'does-not-exist.yml'), '--export'])
  assert.is(r.status, 2)
  assert.match(r.stderr, /not found/)
  assert.is(r.stdout, '')
})

test('setup rejects --export combined with --write before prompting', () => {
  const r = runConfigx(['setup', basic, '--export', '--write', '.env.local'])
  assert.is(r.status, 2)
  assert.match(r.stderr, /setup target conflict: --export cannot be combined with --write/)
  assert.is(r.stdout, '', 'stdout stays empty for eval safety')
  assert.not.ok(r.stderr.includes('Configuration Wizard'), 'fails before prompting')
})

test('setup rejects --write combined with a child command', () => {
  const r = runConfigx(['setup', basic, '--write', '.env.local', '--', 'node', '-e', '1'])
  assert.is(r.status, 2)
  assert.match(r.stderr, /setup target conflict/)
  assert.not.ok(r.stderr.includes('Configuration Wizard'), 'fails before prompting')
})

test('setup rejects the config-env --write case (shell fn appends --export)', () => {
  // config-env setup .env --write x expands to: configx setup .env --write x --export
  const r = runConfigx(['setup', basic, '--write', '.env.local', '--export'])
  assert.is(r.status, 2)
  assert.match(r.stderr, /--export cannot be combined with --write/)
  assert.is(r.stdout, '')
})

test('setup rejects --write-answers combined with --export', () => {
  const r = runConfigx(['setup', basic, '--export', '--write-answers', 'answers.json'])
  assert.is(r.status, 2)
  assert.match(r.stderr, /setup target conflict/)
})

test('setup-only flags are stripped from configorama options', () => {
  const { parseSetupArgs } = require('./src/setupConfig')
  const parsed = parseSetupArgs([
    'file.yml', '--stage', 'dev', '--param', 'x=1',
    '--export', '--dry-run', '--yes', '--merge', '--force', '--no-preflight',
  ])

  assert.is(parsed.opts.stage, 'dev')
  assert.is(parsed.opts.param, 'x=1')
  for (const flag of ['export', 'write', 'write-resolved', 'write-answers', 'answers', 'dry-run', 'yes', 'merge', 'force', 'preflight']) {
    assert.not.ok(flag in parsed.opts, `${flag} stripped from opts`)
  }
})

test('parseSetupArgs identifies each target', () => {
  const { parseSetupArgs } = require('./src/setupConfig')

  assert.is(parseSetupArgs(['f.yml', '--export']).target, 'export')
  assert.is(parseSetupArgs(['f.yml', '--write', 'x']).target, 'write')
  assert.is(parseSetupArgs(['f.yml', '--write-resolved', 'x']).target, 'write-resolved')
  assert.is(parseSetupArgs(['f.yml', '--write-answers', 'x']).target, 'write-answers')
  assert.is(parseSetupArgs(['f.yml', '--', 'npm', 'run', 'dev']).target, 'command')
  assert.is(parseSetupArgs(['f.yml']).target, 'menu')
})

test.run()
