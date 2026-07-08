#!/usr/bin/env node
/* CLI for @davidwells/op-stash.
   Dispatches cache reads, lifecycle diagnostics, and daemon mode. */
const fs = require('fs')
const { read, status, stats, clear, stop, start } = require('./api')
const { resolveConfig, configPath } = require('./config')
const { readOp } = require('./op')
const pkg = require('../package.json')

/**
 * @param {string[]} argv - Arguments
 * @returns {object}
 */
function parse(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      out._.push(arg)
      continue
    }
    const key = arg.slice(2)
    if (['json', 'help', 'version'].includes(key)) out[key] = true
    else out[key] = argv[++i]
  }
  return out
}

function usage() {
  return `op-stash ${pkg.version}

Usage:
  op-stash read <op://ref> [--account <account>] [--ttl <duration>] [--scope <scope>]
  op-stash status [--json]
  op-stash stats [--scope <scope>] [--json]
  op-stash clear [--scope <scope>]
  op-stash stop
  op-stash doctor [--json]
  op-stash config-path
`
}

async function main(argv = process.argv.slice(2), io = process) {
  const args = parse(argv)
  const cmd = args._[0]
  const platform = io.platform || process.platform
  if (args.help || !cmd) return writeOut(io, usage())
  if (args.version) return writeOut(io, `${pkg.version}\n`)
  const opts = {
    account: args.account,
    ttlSeconds: args.ttl,
    scope: args.scope,
    socketPath: args.socket,
    opPath: args['op-path'],
    opTimeoutSeconds: args['op-timeout'],
    stderr: io.stderr,
    platform,
    fallbackToOp: true,
  }

  if (cmd === 'daemon' || cmd === 'daemon-foreground') {
    try {
      await start({ foreground: cmd === 'daemon-foreground' })
    } catch (err) {
      // Losing a spawn race is a success: some daemon is serving the socket
      if (/already running/.test(err.message)) return
      throw err
    }
    return new Promise(() => {})
  }
  if (platform === 'win32' && cmd !== 'read') {
    const unavailable = { running: false, available: false, platform: 'win32' }
    if (args.json) writeOut(io, `${JSON.stringify(unavailable)}\n`)
    else writeOut(io, 'op-stash: caching unavailable on win32\n')
    return
  }
  if (cmd === 'read') {
    const ref = args._[1]
    if (!ref) return fail(io, 'missing op:// reference', 2)
    const value = platform === 'win32'
      ? await readOp(ref, resolveConfig({}, {}).config, { account: args.account })
      : await read(ref, opts)
    writeOut(io, `${value}\n`)
    return
  }
  if (cmd === 'status') {
    const result = await status(opts)
    if (args.json) writeOut(io, `${JSON.stringify(result)}\n`)
    else writeOut(io, result.running ? `daemon running (${result.daemon.version})\n` : 'daemon not running\n')
    return
  }
  if (cmd === 'stats') {
    try {
      const result = await stats(opts)
      if (args.json) writeOut(io, `${JSON.stringify(result)}\n`)
      else writeOut(io, `entries: ${result.entries}\nhits: ${result.hits || 0}\nmisses: ${result.misses || 0}\n`)
    } catch (err) {
      if (args.json) writeOut(io, `${JSON.stringify({ running: false, entries: 0, hits: 0, misses: 0 })}\n`)
      else writeOut(io, 'daemon not running\n')
    }
    return
  }
  if (cmd === 'clear') {
    try {
      const result = await clear(opts)
      writeOut(io, `removed: ${result.removed}\n`)
    } catch (err) {
      writeOut(io, 'daemon not running\n')
    }
    return
  }
  if (cmd === 'stop') {
    try {
      await stop(opts)
      writeOut(io, 'daemon stopped\n')
    } catch (err) {
      writeOut(io, 'daemon not running\n')
    }
    return
  }
  if (cmd === 'config-path') {
    const p = configPath(process.env)
    writeOut(io, `${p}\n`)
    if (!fs.existsSync(p)) io.stderr.write('op-stash: config file does not exist\n')
    return
  }
  if (cmd === 'doctor') {
    const result = await doctor(opts)
    if (args.json) writeOut(io, `${JSON.stringify(result)}\n`)
    else writeOut(io, formatDoctor(result))
    return
  }
  return fail(io, `unknown command: ${cmd}\n${usage()}`, 2)
}

async function doctor(opts) {
  const resolved = resolveConfig({}, {})
  const st = await status(opts)
  return {
    node: process.version,
    packageVersion: pkg.version,
    opPath: resolved.config.op_path,
    socketPath: resolved.config.socket_path,
    configPath: resolved.path,
    configExists: resolved.exists,
    daemon: st,
    serviceAccountTokenSet: Boolean(process.env.OP_SERVICE_ACCOUNT_TOKEN),
    platform: opts.platform || process.platform,
    cacheAvailable: (opts.platform || process.platform) !== 'win32',
  }
}

function formatDoctor(result) {
  return [
    `node: ${result.node}`,
    `op-stash: ${result.packageVersion}`,
    `op: ${result.opPath}`,
    `socket: ${result.socketPath}`,
    `config: ${result.configPath} (${result.configExists ? 'exists' : 'missing'})`,
    `daemon: ${result.daemon.running ? 'running' : 'not running'}`,
    `service account token: ${result.serviceAccountTokenSet ? 'set' : 'unset'}`,
    `platform: ${result.platform}`,
    '',
  ].join('\n')
}

function writeOut(io, text) {
  io.stdout.write(text)
}

function fail(io, message, code) {
  io.stderr.write(`op-stash: ${message}\n`)
  process.exitCode = code
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`op-stash: ${err.message}\n`)
    process.exit(1)
  })
}

module.exports = { main, parse, usage, doctor }
