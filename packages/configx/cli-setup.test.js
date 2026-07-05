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

const setupBasic = path.join(fixtures, 'setup-basic.yml')
const answersConfig = path.join(fixtures, 'setup-answers.config.js')
const EXPORT_LINE = /^export [A-Za-z_][A-Za-z0-9_]*='(?:[^'\\]|'\\'')*'$/

test('setup --export prints only export lines to stdout', () => {
  const r = runConfigx(['setup', setupBasic, '--config', answersConfig, '--export'])
  assert.is(r.status, 0, `stderr: ${r.stderr}`)

  const lines = r.stdout.split('\n').filter(Boolean)
  assert.ok(lines.length >= 4, 'exports resolved keys and answered env')
  for (const line of lines) {
    assert.match(line, EXPORT_LINE, `valid export grammar: ${line}`)
  }

  assert.ok(r.stdout.includes(`export API_KEY='sk-test-secret-value'`), 'resolved key exported')
  assert.ok(r.stdout.includes(`export SETUP_TEST_API_KEY='sk-test-secret-value'`), 'answered env var exported')
  assert.ok(r.stdout.includes(`export STAGE='dev'`), 'option fallback resolves')
  assert.not.ok(r.stderr.includes('sk-test-secret-value'), 'no secret values on stderr')
})

test('setup --export does not export option answers directly', () => {
  const r = runConfigx(['setup', setupBasic, '--config', path.join(fixtures, 'setup-options.config.js'), '--export'])
  assert.is(r.status, 0, `stderr: ${r.stderr}`)
  assert.ok(r.stdout.includes(`export STAGE='qa'`), 'option answer affects resolution')
  assert.not.ok(r.stdout.includes('export stage='), 'raw option answer never exported')
})

test('setup --export cancellation exits non-zero with empty stdout', () => {
  const r = runConfigx(['setup', setupBasic, '--config', path.join(fixtures, 'setup-cancel.config.js'), '--export'])
  assert.is.not(r.status, 0)
  assert.is(r.stdout, '', 'no partial exports for eval to apply')
  assert.match(r.stderr, /cancelled/i)
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
