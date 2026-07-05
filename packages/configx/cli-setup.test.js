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

test('setup -- <command> runs the child with answered values', () => {
  const r = runConfigx([
    'setup', setupBasic, '--config', answersConfig, '--',
    'node', '-e', 'process.stdout.write([process.env.API_KEY, process.env.SETUP_TEST_REGION, process.env.STAGE].join("|"))',
  ])
  assert.is(r.status, 0, `stderr: ${r.stderr}`)
  assert.is(r.stdout, 'sk-test-secret-value|us-west-2|dev')
})

test('setup -- <command> propagates the child exit status', () => {
  const r = runConfigx(['setup', setupBasic, '--config', answersConfig, '--', 'node', '-e', 'process.exit(3)'])
  assert.is(r.status, 3)
})

test('setup -- <command> cancellation never spawns the child', () => {
  const sentinel = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'configx-setup-')), 'ran.txt')
  const r = runConfigx([
    'setup', setupBasic, '--config', path.join(fixtures, 'setup-cancel.config.js'), '--',
    'node', '-e', `require("fs").writeFileSync(${JSON.stringify(sentinel)}, "ran")`,
  ])
  assert.is.not(r.status, 0)
  assert.not.ok(fs.existsSync(sentinel), 'child never ran')
  assert.match(r.stderr, /cancelled/i)
})

/**
 * Run configx with piped stdin (for confirmation prompts).
 * @param {string[]} args - CLI arguments
 * @param {string} input - stdin content
 * @returns {{status: number, stdout: string, stderr: string}} Result
 */
function runConfigxWithInput(args, input) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    input,
    env: { ...process.env },
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function writeTarget(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'configx-write-')), name)
}

test('setup --write persists env answers with 0600 and prints key names only', () => {
  const target = writeTarget('.env.local')
  const r = runConfigx(['setup', setupBasic, '--config', answersConfig, '--write', target, '--yes'])
  assert.is(r.status, 0, `stderr: ${r.stderr}`)

  const content = fs.readFileSync(target, 'utf8')
  assert.ok(content.includes('SETUP_TEST_API_KEY=sk-test-secret-value'), 'answered env written')
  assert.ok(content.includes('SETUP_TEST_REGION=us-west-2'))
  assert.is(fs.statSync(target).mode & 0o777, 0o600, 'restrictive permissions')

  assert.ok(r.stdout.includes('SETUP_TEST_API_KEY'), 'key names printed')
  assert.not.ok(r.stdout.includes('sk-test-secret-value'), 'values never printed')
  assert.not.ok(r.stderr.includes('sk-test-secret-value'), 'values never on stderr')
})

test('setup --write requires confirmation for sensitive values', () => {
  const target = writeTarget('.env.local')
  const r = runConfigxWithInput(['setup', setupBasic, '--config', answersConfig, '--write', target], 'n\n')
  assert.is.not(r.status, 0)
  assert.match(r.stderr, /sensitive/)
  assert.not.ok(fs.existsSync(target), 'declined confirmation writes nothing')
})

test('setup --write proceeds when confirmation is accepted', () => {
  const target = writeTarget('.env.local')
  const r = runConfigxWithInput(['setup', setupBasic, '--config', answersConfig, '--write', target], 'y\n')
  assert.is(r.status, 0, `stderr: ${r.stderr}`)
  assert.ok(fs.existsSync(target))
})

test('setup --write --dry-run shows keys and path but writes nothing', () => {
  const target = writeTarget('.env.local')
  const r = runConfigx(['setup', setupBasic, '--config', answersConfig, '--write', target, '--dry-run'])
  assert.is(r.status, 0, `stderr: ${r.stderr}`)
  assert.not.ok(fs.existsSync(target), 'dry run writes nothing')
  assert.ok(r.stdout.includes(target), 'target path shown')
  assert.ok(r.stdout.includes('SETUP_TEST_API_KEY'), 'key names shown')
  assert.not.ok(r.stdout.includes('sk-test-secret-value'), 'values redacted')
})

test('setup --write refuses an existing file without --merge or --force', () => {
  const target = writeTarget('.env.local')
  fs.writeFileSync(target, 'EXISTING=1\n')
  const r = runConfigx(['setup', setupBasic, '--config', answersConfig, '--write', target, '--yes'])
  assert.is.not(r.status, 0)
  assert.match(r.stderr, /already exists/)
  assert.is(fs.readFileSync(target, 'utf8'), 'EXISTING=1\n', 'file untouched')
})

test('setup --write cancellation leaves no file behind', () => {
  const target = writeTarget('.env.local')
  const r = runConfigx(['setup', setupBasic, '--config', path.join(fixtures, 'setup-cancel.config.js'), '--write', target, '--yes'])
  assert.is.not(r.status, 0)
  assert.not.ok(fs.existsSync(target))
})

test('setup --write-answers persists versioned JSON answers', () => {
  const target = writeTarget('answers.json')
  const r = runConfigx(['setup', setupBasic, '--config', answersConfig, '--write-answers', target, '--yes'])
  assert.is(r.status, 0, `stderr: ${r.stderr}`)

  const parsed = JSON.parse(fs.readFileSync(target, 'utf8'))
  assert.is(parsed.schemaVersion, 1)
  assert.is(parsed.answers.env.SETUP_TEST_API_KEY, 'sk-test-secret-value')
  assert.is(fs.statSync(target).mode & 0o777, 0o600)
  assert.not.ok(r.stdout.includes('sk-test-secret-value'), 'values never printed')
})

test('setup --write-answers refuses overwrite without --force', () => {
  const target = writeTarget('answers.json')
  fs.writeFileSync(target, '{"mine":true}')
  const r = runConfigx(['setup', setupBasic, '--config', answersConfig, '--write-answers', target, '--yes'])
  assert.is.not(r.status, 0)
  assert.match(r.stderr, /already exists/)
  assert.is(fs.readFileSync(target, 'utf8'), '{"mine":true}')
})

test('setup --write-answers --dry-run shows groups and keys, writes nothing', () => {
  const target = writeTarget('answers.json')
  const r = runConfigx(['setup', setupBasic, '--config', answersConfig, '--write-answers', target, '--dry-run'])
  assert.is(r.status, 0, `stderr: ${r.stderr}`)
  assert.not.ok(fs.existsSync(target))
  assert.ok(r.stdout.includes('SETUP_TEST_REGION'), 'key names shown')
  assert.not.ok(r.stdout.includes('sk-test-secret-value'), 'values redacted')
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
