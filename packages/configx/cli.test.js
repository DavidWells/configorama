/* End-to-end tests for the configx CLI
   Spawns the real CLI against real configorama resolution; no mocks */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
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

function tempPath(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'configx-test-')), name)
}

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

test('configx sets CONFIGORAMA_PROGRAM_NAME during resolution but not in the child', () => {
  const r = runConfigx([
    path.join(fixtures, 'host.yml'),
    '--config', path.join(fixtures, 'host.config.js'),
    '--', 'node', '-e', 'process.stdout.write(process.env.HOST_SEEN + "|" + (process.env.CONFIGORAMA_PROGRAM_NAME || "unset"))',
  ])
  assert.is(r.status, 0)
  // resolver saw 'configx'; the child does not inherit the marker
  assert.is(r.stdout, 'configx|unset')
})

test('--export keeps stdout to export lines only (confirmation not on stdout)', () => {
  const r = runConfigx([path.join(fixtures, 'exec.yml'), '--export'])
  assert.is(r.status, 0)
  // every non-empty stdout line is an export statement — nothing else leaks
  const lines = r.stdout.split('\n').filter(Boolean)
  assert.ok(lines.length > 0)
  assert.ok(lines.every((line) => line.startsWith('export ')))
})

test('--export does not require a command', () => {
  const r = runConfigx([path.join(fixtures, 'exec.yml'), '--export'])
  assert.is(r.status, 0)
  assert.match(r.stdout, /export APP_NAME='configx-test'/)
})

test('pre-flight fails on a cheap-variable error without invoking custom resolvers', () => {
  const fs = require('fs')
  const sentinel = path.join(require('os').tmpdir(), `configx-sentinel-${process.pid}-a`)
  if (fs.existsSync(sentinel)) fs.unlinkSync(sentinel)

  const r = runConfigx(
    [path.join(fixtures, 'preflight-bad.yml'), '--config', path.join(fixtures, 'preflight.config.js'), '--', 'true'],
    { CONFIGX_SENTINEL: sentinel }
  )
  assert.is.not(r.status, 0)
  assert.match(r.stderr, /Unable to resolve|definitely_missing/)
  // the side-effecting resolver (stand-in for the 1Password prompt) never ran
  assert.is(fs.existsSync(sentinel), false)
})

test('pre-flight passes and the real resolver runs when all cheap vars resolve', () => {
  const fs = require('fs')
  const sentinel = path.join(require('os').tmpdir(), `configx-sentinel-${process.pid}-b`)
  if (fs.existsSync(sentinel)) fs.unlinkSync(sentinel)

  const r = runConfigx(
    [path.join(fixtures, 'preflight-ok.yml'), '--config', path.join(fixtures, 'preflight.config.js'), '--',
      'node', '-e', 'process.stdout.write(process.env.GOOD + "|" + process.env.STAGE)'],
    { CONFIGX_SENTINEL: sentinel }
  )
  assert.is(r.status, 0)
  assert.is(r.stdout, 'secret-value|dev')
  // the real resolver ran exactly once (in the real pass, not the stubbed pre-flight)
  assert.is(fs.existsSync(sentinel), true)
  assert.is(fs.readFileSync(sentinel, 'utf8'), 'resolver-ran')
  fs.unlinkSync(sentinel)
})

test('--no-preflight skips the pre-flight pass', () => {
  const fs = require('fs')
  const sentinel = path.join(require('os').tmpdir(), `configx-sentinel-${process.pid}-c`)
  if (fs.existsSync(sentinel)) fs.unlinkSync(sentinel)

  // with the bad var, --no-preflight lets the real pass run (and invoke the resolver) before failing
  const r = runConfigx(
    [path.join(fixtures, 'preflight-bad.yml'), '--config', path.join(fixtures, 'preflight.config.js'), '--no-preflight', '--', 'true'],
    { CONFIGX_SENTINEL: sentinel }
  )
  assert.is.not(r.status, 0)
  // without pre-flight, the side-effecting resolver DID run (this is what pre-flight prevents)
  assert.is(fs.existsSync(sentinel), true)
  fs.unlinkSync(sentinel)
})

test('setup-shell --shell zsh --print prints shell functions to stdout', () => {
  const r = runConfigx(['setup-shell', '--shell', 'zsh', '--print'])
  assert.is(r.status, 0)
  assert.match(r.stdout, /# >>> configx shell integration >>>/)
  assert.match(r.stdout, /configx-env\(\) \{/)
  assert.match(r.stdout, /config-env\(\) \{/)
  assert.match(r.stdout, /# <<< configx shell integration <<</)
  assert.is(r.stderr, '')
})

test('setup-shell --shell bash --print prints shell functions to stdout', () => {
  const r = runConfigx(['setup-shell', '--shell', 'bash', '--print'])
  assert.is(r.status, 0)
  assert.match(r.stdout, /configx-env\(\) \{/)
  assert.match(r.stdout, /config-env\(\) \{/)
})

test('setup-shell print mode does not write rc files', () => {
  const rcFile = tempPath('zshrc')
  const r = runConfigx(['setup-shell', '--shell', 'zsh', '--print', '--rc-file', rcFile])
  assert.is(r.status, 0)
  assert.is(fs.existsSync(rcFile), false)
})

test('setup-shell installs a managed block into an empty rc file', () => {
  const rcFile = tempPath('zshrc')
  fs.writeFileSync(rcFile, '')
  const r = runConfigx(['setup-shell', '--shell', 'zsh', '--install', '--rc-file', rcFile])
  assert.is(r.status, 0)
  const content = fs.readFileSync(rcFile, 'utf8')
  assert.match(content, /# >>> configx shell integration >>>/)
  assert.match(content, /config-env\(\) \{/)
  assert.match(content, /configx-env\(\) \{/)
})

test('setup-shell replaces an existing managed block instead of duplicating it', () => {
  const rcFile = tempPath('zshrc')
  fs.writeFileSync(rcFile, [
    'before',
    '# >>> configx shell integration >>>',
    'old-configx-env() { :; }',
    '# <<< configx shell integration <<<',
    'after',
    '',
  ].join('\n'))
  const r = runConfigx(['setup-shell', '--shell', 'zsh', '--install', '--rc-file', rcFile])
  assert.is(r.status, 0)
  const content = fs.readFileSync(rcFile, 'utf8')
  assert.is((content.match(/# >>> configx shell integration >>>/g) || []).length, 1)
  assert.match(content, /^before\n/)
  assert.match(content, /\nafter\n$/)
  assert.not.match(content, /old-configx-env/)
})

test('setup-shell uninstall removes a managed block', () => {
  const rcFile = tempPath('zshrc')
  const install = runConfigx(['setup-shell', '--shell', 'zsh', '--install', '--rc-file', rcFile])
  assert.is(install.status, 0)
  const uninstall = runConfigx(['setup-shell', '--shell', 'zsh', '--uninstall', '--rc-file', rcFile])
  assert.is(uninstall.status, 0)
  assert.not.match(fs.readFileSync(rcFile, 'utf8'), /configx shell integration/)
})

test('setup-shell uninstall exits 0 when no managed block exists', () => {
  const rcFile = tempPath('zshrc')
  fs.writeFileSync(rcFile, 'export KEEP_ME=1\n')
  const r = runConfigx(['setup-shell', '--shell', 'zsh', '--uninstall', '--rc-file', rcFile])
  assert.is(r.status, 0)
  assert.is(fs.readFileSync(rcFile, 'utf8'), 'export KEEP_ME=1\n')
})

test('setup-shell fails on multiple managed blocks without editing', () => {
  const rcFile = tempPath('zshrc')
  const block = [
    '# >>> configx shell integration >>>',
    'config-env() { :; }',
    '# <<< configx shell integration <<<',
  ].join('\n')
  const original = `${block}\nkeep=1\n${block}\n`
  fs.writeFileSync(rcFile, original)
  const r = runConfigx(['setup-shell', '--shell', 'zsh', '--install', '--rc-file', rcFile])
  assert.is(r.status, 1)
  assert.match(r.stderr, /multiple or incomplete/)
  assert.is(fs.readFileSync(rcFile, 'utf8'), original)
})

test('setup-shell unsupported shell fails clearly', () => {
  const r = runConfigx(['setup-shell', '--shell', 'tcsh', '--print'])
  assert.is(r.status, 2)
  assert.match(r.stderr, /supported shell/)
})

test('setup-shell defaults to print mode when not attached to a TTY', () => {
  const r = runConfigx(['setup-shell'], { SHELL: '/bin/zsh' })
  assert.is(r.status, 0)
  assert.match(r.stdout, /config-env\(\) \{/)
})

test('setup-shell rejects unsafe custom function names', () => {
  const r = runConfigx(['setup-shell', '--shell', 'zsh', '--print', '--function-name', 'bad;name'])
  assert.is(r.status, 2)
  assert.match(r.stderr, /invalid shell function name/)
})

test('generated config-env and configx-env functions load values in bash', () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'configx-bin-'))
  const shim = path.join(binDir, 'configx')
  fs.writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${cli}" "$@"\n`)
  fs.chmodSync(shim, 0o755)

  const script = [
    `eval "$("${process.execPath}" "${cli}" setup-shell --shell bash --print)"`,
    `config-env "${path.join(fixtures, 'sample.env')}" --name Dave >/dev/null`,
    'test "$GREETING" = "Dave"',
    `configx-env "${path.join(fixtures, 'sample.env')}" --name Ada >/dev/null`,
    'test "$GREETING" = "Ada"',
  ].join('; ')
  const r = spawnSync('bash', ['-lc', script], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}`, CONFX_TEST_SRC: 'shellval' },
  })
  assert.is(r.status, 0)
})

test.run()
