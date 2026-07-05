/* End-to-end tests for config-env setup through a real shell.
   Sources the actual setup-shell function block and runs it in bash and zsh -
   real processes, real eval, no mocks. */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const cli = path.join(__dirname, 'cli.js')
const fixtures = path.join(__dirname, 'test')
const setupBasic = path.join(fixtures, 'setup-basic.yml')
const answersConfig = path.join(fixtures, 'setup-answers.config.js')

// PATH shim so the shell function's bare `configx` resolves to this checkout
const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'configx-bin-'))
const shim = path.join(binDir, 'configx')
fs.writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${cli}" "$@"\n`, { mode: 0o755 })

const shellBlock = spawnSync(process.execPath, [cli, 'setup-shell', '--shell', 'bash', '--print'], {
  encoding: 'utf8',
}).stdout

/**
 * Run a script in a real shell with the config-env function sourced.
 * @param {string} shell - shell binary (bash, zsh)
 * @param {string} script - script body to run after sourcing the block
 * @returns {{status: number, stdout: string, stderr: string}} Result
 */
function runInShell(shell, script) {
  const result = spawnSync(shell, ['-c', `${shellBlock}\n${script}`], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

const shells = ['bash']
if (spawnSync('zsh', ['-c', 'true']).status === 0) shells.push('zsh')

for (const shell of shells) {
  test(`[${shell}] config-env setup sets answered values in the current shell`, () => {
    const r = runInShell(shell, [
      `config-env setup ${setupBasic} --config ${answersConfig}`,
      'printf "%s|%s|%s" "$API_KEY" "$SETUP_TEST_REGION" "$STAGE"',
    ].join('\n'))

    assert.is(r.status, 0, `stderr: ${r.stderr}`)
    assert.is(r.stdout, 'sk-test-secret-value|us-west-2|dev', 'values set in the calling shell')
  })

  test(`[${shell}] config-env setup --write conflict fails with non-zero status`, () => {
    const r = runInShell(shell, [
      `config-env setup ${setupBasic} --config ${answersConfig} --write .env.local`,
      'rc=$?',
      'printf "STATUS=%s|API=%s" "$rc" "$API_KEY"',
    ].join('\n'))

    assert.match(r.stdout, /STATUS=2/, 'configx exit status propagates through the shell function')
    assert.match(r.stdout, /API=$/, 'no values applied')
    assert.match(r.stderr, /--export cannot be combined with --write/)
    assert.not.ok(fs.existsSync(path.join(process.cwd(), '.env.local')), 'no file written')
  })

  test(`[${shell}] config-env setup cancellation applies nothing and fails`, () => {
    const r = runInShell(shell, [
      `config-env setup ${setupBasic} --config ${path.join(fixtures, 'setup-cancel.config.js')}`,
      'rc=$?',
      'printf "STATUS=%s|API=%s" "$rc" "$API_KEY"',
    ].join('\n'))

    assert.match(r.stdout, /STATUS=[1-9]/, 'cancellation propagates non-zero')
    assert.match(r.stdout, /API=$/, 'no values applied')
  })
}

test.run()
