const fs = require('fs')
const os = require('os')
const path = require('path')
const childProcess = require('child_process')

function tempDir(prefix = 'op-cache-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function fakeOp(dir, options = {}) {
  const bin = path.join(dir, 'fake-op.js')
  const count = path.join(dir, 'count.txt')
  const valueFile = path.join(dir, 'value.txt')
  fs.writeFileSync(valueFile, options.value === undefined ? 'secret-value' : options.value)
  fs.writeFileSync(count, '0')
  fs.writeFileSync(bin, `#!/usr/bin/env node
const fs = require('fs')
const count = ${JSON.stringify(count)}
const valueFile = ${JSON.stringify(valueFile)}
const n = Number(fs.readFileSync(count, 'utf8') || '0') + 1
fs.writeFileSync(count, String(n))
if (process.env.FAKE_OP_FAIL) {
  process.stderr.write(process.env.FAKE_OP_FAIL)
  process.exit(1)
}
if (process.env.FAKE_OP_SLEEP) {
  setTimeout(() => process.stdout.write(fs.readFileSync(valueFile, 'utf8')), Number(process.env.FAKE_OP_SLEEP))
} else {
  process.stdout.write(fs.readFileSync(valueFile, 'utf8'))
}
`)
  fs.chmodSync(bin, 0o755)
  return { bin, count, valueFile, calls: () => Number(fs.readFileSync(count, 'utf8') || '0') }
}

function cliEnv(dir, fake) {
  return {
    ...process.env,
    OP_CACHE_SOCKET_PATH: path.join(dir, 'cache.sock'),
    OP_CACHE_OP_PATH: fake.bin,
    OP_CACHE_TTL_SECONDS: '2',
    OP_CACHE_MAX_TTL_SECONDS: '2',
    OP_CACHE_IDLE_EXIT_SECONDS: '1',
    XDG_CONFIG_HOME: path.join(dir, 'xdg'),
  }
}

function runCli(args, env, options = {}) {
  return childProcess.spawnSync(process.execPath, [require.resolve('../src/cli'), ...args], {
    env,
    encoding: 'utf8',
    timeout: options.timeout || 10000,
  })
}

function stopDaemon(env) {
  runCli(['stop'], env)
}

module.exports = { tempDir, fakeOp, cliEnv, runCli, stopDaemon }
