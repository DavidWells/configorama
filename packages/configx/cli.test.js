/* End-to-end tests for the configx CLI
   Spawns the real CLI against real configorama resolution; no mocks */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const { spawnSync } = require('child_process')

const cli = path.join(__dirname, 'cli.js')
const fixtures = path.join(__dirname, 'test')

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

const printEnv = (name) => ['node', '-e', `process.stdout.write(String(process.env.${name}))`]

test('resolves scalars, opt, and env into the child environment', () => {
  const r = runConfigx(
    [path.join(fixtures, 'basic.yml'), '--stage', 'prod', '--', ...printEnv('STAGE')],
    { CONFX_TEST_SRC: 'from-shell' }
  )
  assert.is(r.status, 0)
  assert.is(r.stdout, 'prod')
})

test('env-sourced and scalar values reach the child', () => {
  const r = runConfigx(
    [path.join(fixtures, 'basic.yml'), '--', 'node', '-e', 'process.stdout.write([process.env.API_URL, process.env.FROM_ENV, process.env.FEATURE, process.env.TIMEOUT_MS].join("|"))'],
    { CONFX_TEST_SRC: 'from-shell' }
  )
  assert.is(r.status, 0)
  assert.is(r.stdout, 'https://api.example.com|from-shell|true|5000')
})

test('parent environment wins over resolved config', () => {
  const r = runConfigx(
    [path.join(fixtures, 'parentwins.yml'), '--', ...printEnv('STAGE')],
    { STAGE: 'staging' }
  )
  assert.is(r.status, 0)
  assert.is(r.stdout, 'staging')
})

test('missing command exits 2 before resolving', () => {
  const r = runConfigx([path.join(fixtures, 'basic.yml')])
  assert.is(r.status, 2)
  assert.match(r.stderr, /no command given/)
})

test('missing file exits 2', () => {
  const r = runConfigx([path.join(fixtures, 'does-not-exist.yml'), '--', 'true'])
  assert.is(r.status, 2)
  assert.match(r.stderr, /not found/)
})

test('non-scalar top-level value errors and does not run the child', () => {
  const r = runConfigx([path.join(fixtures, 'nonscalar.yml'), '--', ...printEnv('database')])
  assert.is.not(r.status, 0)
  assert.match(r.stderr, /non-scalar/)
  assert.is(r.stdout, '')
})

test('child exit code is propagated', () => {
  const r = runConfigx([path.join(fixtures, 'exec.yml'), '--', 'node', '-e', 'process.exit(3)'])
  assert.is(r.status, 3)
})

test('command not found exits 127', () => {
  const r = runConfigx([path.join(fixtures, 'exec.yml'), '--', 'definitely-not-a-real-binary-xyz'])
  assert.is(r.status, 127)
  assert.match(r.stderr, /command not found/)
})

test('a .env file is parsed as dotenv and its values are resolved', () => {
  const r = runConfigx(
    [path.join(fixtures, 'sample.env'), '--name', 'Dave', '--', 'node', '-e', 'process.stdout.write([process.env.GREETING, process.env.STATIC, process.env.FROM_SHELL, process.env.EXPORTED].join("|"))'],
    { CONFX_TEST_SRC: 'shellval' }
  )
  assert.is(r.status, 0)
  assert.is(r.stdout, 'Dave|hello|shellval|exported-value')
})

test('custom variable source from a config file resolves', () => {
  const r = runConfigx([
    path.join(fixtures, 'mock.yml'),
    '--config', path.join(fixtures, 'mock.config.js'),
    '--', ...printEnv('TOKEN'),
  ])
  assert.is(r.status, 0)
  assert.is(r.stdout, 'resolved-hello')
})

test('flag args after -- go to the child, not configorama', () => {
  const r = runConfigx([
    path.join(fixtures, 'exec.yml'),
    '--', 'node', path.join(fixtures, 'print-args.js'), '--dry-run', '-x',
  ])
  assert.is(r.status, 0)
  assert.is(r.stdout, '--dry-run,-x')
})

test('--export prints shell export lines instead of running a command', () => {
  const r = runConfigx(
    [path.join(fixtures, 'sample.env'), '--name', 'Dave', '--export'],
    { CONFX_TEST_SRC: 'shellval' }
  )
  assert.is(r.status, 0)
  assert.match(r.stdout, /export GREETING='Dave'/)
  assert.match(r.stdout, /export STATIC='hello'/)
  assert.match(r.stdout, /export EXPORTED='exported-value'/)
})

test('--export output is safe to eval (no shell injection)', () => {
  const r = runConfigx([path.join(fixtures, 'inject.yml'), '--export'])
  assert.is(r.status, 0)

  // eval the exports in a real shell, then read the value back
  const evaluated = spawnSync('bash', ['-c', 'eval "$1"; printf "%s" "$DANGER"', '_', r.stdout], { encoding: 'utf8' })
  assert.is(evaluated.status, 0)
  // The value is the literal string, not the result of executing $(...)
  assert.is(evaluated.stdout, "$(touch /tmp/configx-pwned); echo pwned; a'b")
  // Prove the injected command never ran
  assert.is(require('fs').existsSync('/tmp/configx-pwned'), false)
})

test('--export does not require a command', () => {
  const r = runConfigx([path.join(fixtures, 'exec.yml'), '--export'])
  assert.is(r.status, 0)
  assert.match(r.stdout, /export APP_NAME='configx-test'/)
})

test.run()
