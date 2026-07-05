#!/usr/bin/env node
/* confx: resolve a configorama config and exec a command with it as environment
   confx <file> [configorama options] -- <command and args...> */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const minimist = require('minimist')
const { resolveEnv, ConfxError } = require('./src/resolveEnv')

/**
 * Load configorama from the installed dependency, falling back to the
 * in-repo source when running inside the configorama monorepo.
 * @returns {Function} configorama async API
 */
function loadConfigorama() {
  try {
    return require('configorama')
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return require('../../src')
    throw err
  }
}

/**
 * @param {string} message - Error text
 * @param {number} [code] - Exit code
 */
function fail(message, code = 1) {
  process.stderr.write(`confx: ${message}\n`)
  process.exit(code)
}

/**
 * Load an optional confx settings file exporting configorama settings
 * (variableSources, filters, functions, safeMode, ...). This file is
 * executed — confx is an execution tool and treats it as trusted.
 * @param {string|undefined} explicitPath - Path from --config
 * @param {string} cwd - Working directory to discover confx.config.js
 * @returns {object} Settings object (empty when no file found)
 */
function loadSettingsFile(explicitPath, cwd) {
  const target = explicitPath
    ? path.resolve(cwd, explicitPath)
    : path.join(cwd, 'confx.config.js')

  if (!fs.existsSync(target)) {
    if (explicitPath) fail(`config file not found: ${target}`)
    return {}
  }

  let loaded
  try {
    loaded = require(target)
  } catch (err) {
    fail(`failed to load config file ${target}: ${err.message}`)
  }
  if (loaded && typeof loaded === 'object') return loaded
  fail(`config file ${target} must export a settings object`)
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    '--': true,
    string: ['config', 'stage', 'param'],
  })

  const file = argv._[0]
  const command = argv['--'] || []

  // Validate invocation BEFORE resolving: resolution can trigger secret
  // prompts (e.g. the 1Password resolver), so never prompt for a run that
  // was going to fail on a missing file or command anyway.
  if (!file) fail('missing config file. Usage: confx <file> [options] -- <command>', 2)
  if (!fs.existsSync(file)) fail(`config file not found: ${file}`, 2)
  if (command.length === 0) {
    throw new ConfxError('missing_exec_command', 'no command given. Usage: confx <file> [options] -- <command>')
  }

  const cwd = process.cwd()
  const settingsFile = loadSettingsFile(argv.config, cwd)

  // configorama options for ${opt:...} come from the CLI flags (minus
  // positionals, the -- command, and confx's own --config).
  const { _, config: _configFlag, ...opts } = argv
  delete opts['--']

  const configorama = loadConfigorama()
  let resolved
  try {
    resolved = await configorama(file, {
      ...settingsFile,
      options: { ...(settingsFile.options || {}), ...opts },
    })
  } catch (err) {
    fail(err.message)
  }

  let childEnv
  try {
    childEnv = resolveEnv(resolved, process.env)
  } catch (err) {
    // ConfxError messages are secret-free by construction
    fail(err.message)
  }

  runChild(command[0], command.slice(1), childEnv)
}

/**
 * Spawn the child, inherit stdio, forward signals, and propagate status.
 * @param {string} program - Command
 * @param {string[]} args - Command arguments
 * @param {object} env - Child environment
 */
function runChild(program, args, env) {
  const child = spawn(program, args, { stdio: 'inherit', env, shell: false })

  const forwarded = ['SIGINT', 'SIGTERM', 'SIGHUP']
  for (const signal of forwarded) {
    process.on(signal, () => child.kill(signal))
  }

  child.on('error', (err) => {
    const message = err.code === 'ENOENT' ? `command not found: ${program}` : `failed to spawn ${program}: ${err.message}`
    process.stderr.write(`confx: ${message}\n`)
    process.exit(127)
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      const num = os.constants.signals[signal] || 0
      process.exit(128 + num)
    }
    process.exit(code == null ? 0 : code)
  })
}

main().catch((err) => {
  if (err instanceof ConfxError) fail(err.message, 2)
  fail(err && err.message ? err.message : String(err))
})
