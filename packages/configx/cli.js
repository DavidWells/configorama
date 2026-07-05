#!/usr/bin/env node
/* configx: resolve a configorama config and exec a command with it as environment
   configx <file> [configorama options] -- <command and args...> */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const minimist = require('minimist')
const dotenv = require('dotenv')
const { resolveEnv, configEntries, shellExport, exportSummary, ConfigxError } = require('./src/resolveEnv')

/**
 * Detect a dotenv file by name (.env, .env.local, deploy.env, ...).
 * These are parsed as dotenv rather than left to configorama's format
 * detection, which reads a single KEY=VALUE line as a scalar string.
 * @param {string} file - Config file path
 * @returns {boolean} True when the file is a dotenv file
 */
function isEnvFile(file) {
  const base = path.basename(file)
  return base === '.env' || base.startsWith('.env.') || base.endsWith('.env')
}

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
  process.stderr.write(`configx: ${message}\n`)
  process.exit(code)
}

/**
 * Load an optional configx settings file exporting configorama settings
 * (variableSources, filters, functions, safeMode, ...). This file is
 * executed — configx is an execution tool and treats it as trusted.
 * @param {string|undefined} explicitPath - Path from --config
 * @param {string} cwd - Working directory to discover configx.config.js
 * @returns {object} Settings object (empty when no file found)
 */
function loadSettingsFile(explicitPath, cwd) {
  const target = explicitPath
    ? path.resolve(cwd, explicitPath)
    : path.join(cwd, 'configx.config.js')

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
    boolean: ['export'],
    string: ['config', 'stage', 'param'],
  })

  const file = argv._[0]
  const command = argv['--'] || []
  // Print `export KEY=...` to stdout instead of running a command, so the
  // caller can load values into the current shell: eval "$(configx .env --export)"
  const exportMode = argv.export === true

  // Validate invocation BEFORE resolving: resolution can trigger secret
  // prompts (e.g. the 1Password resolver), so never prompt for a run that
  // was going to fail on a missing file or command anyway.
  if (!file) fail('missing config file. Usage: configx <file> [options] -- <command>', 2)
  if (!fs.existsSync(file)) fail(`config file not found: ${file}`, 2)
  if (!exportMode && command.length === 0) {
    throw new ConfigxError('missing_exec_command', 'no command given. Usage: configx <file> [options] -- <command> (or --export)')
  }

  const cwd = process.cwd()
  const settingsFile = loadSettingsFile(argv.config, cwd)

  // configorama options for ${opt:...} come from the CLI flags (minus
  // positionals, the -- command, and configx's own --config/--export).
  const { _, config: _configFlag, export: _exportFlag, ...opts } = argv
  delete opts['--']

  // dotenv files are parsed here into a { KEY: rawValue } object so
  // configorama resolves ${...} refs in the values; other formats are
  // handed to configorama by path for its own parsing.
  let input = file
  let configDir = settingsFile.configDir
  if (isEnvFile(file)) {
    input = dotenv.parse(fs.readFileSync(file))
    configDir = configDir || path.dirname(path.resolve(file))
  }

  const configorama = loadConfigorama()
  let resolved
  try {
    resolved = await configorama(input, {
      ...settingsFile,
      configDir,
      options: { ...(settingsFile.options || {}), ...opts },
    })
  } catch (err) {
    fail(err.message)
  }

  // ConfigxError messages are secret-free by construction.
  if (exportMode) {
    let entries
    try {
      entries = configEntries(resolved)
    } catch (err) {
      fail(err.message)
    }
    const lines = shellExport(entries)
    if (lines) process.stdout.write(lines + '\n')
    // Confirmation goes to stderr (stdout is consumed by eval) and names only
    // the keys, never the values. TTY-only so scripts/pipes stay quiet.
    const summary = exportSummary(entries)
    if (summary && process.stderr.isTTY) {
      process.stderr.write(`configx: ${summary}\n`)
    }
    process.exit(0)
  }

  let childEnv
  try {
    childEnv = resolveEnv(resolved, process.env)
  } catch (err) {
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
    process.stderr.write(`configx: ${message}\n`)
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
  if (err instanceof ConfigxError) fail(err.message, 2)
  fail(err && err.message ? err.message : String(err))
})
