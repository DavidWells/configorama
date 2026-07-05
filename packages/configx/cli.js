#!/usr/bin/env node
/* configx: resolve a configorama config and exec a command with it as environment
   configx <file> [configorama options] -- <command and args...> */
const fs = require('fs')
const minimist = require('minimist')
const { resolveEnv, configEntries, shellExport, exportSummary, ConfigxError } = require('./src/resolveEnv')
const { runSetupShell, SetupShellError } = require('./src/setupShell')
const { loadConfigorama, loadSettingsFile } = require('./src/loaders')
const { runChild } = require('./src/runChild')

// Stand-in value returned by stubbed custom resolvers during the pre-flight pass.
const PREFLIGHT_PLACEHOLDER = 'configx-preflight'

/**
 * @param {string} message - Error text
 * @param {number} [code] - Exit code
 */
function fail(message, code = 1) {
  process.stderr.write(`configx: ${message}\n`)
  process.exit(code)
}

async function main() {
  if (process.argv[2] === 'setup-shell') {
    const code = await runSetupShell(process.argv.slice(3))
    process.exit(code)
  }

  if (process.argv[2] === 'setup') {
    const { runSetupConfig } = require('./src/setupConfig')
    const code = await runSetupConfig(process.argv.slice(3))
    process.exit(code)
  }

  const argv = minimist(process.argv.slice(2), {
    '--': true,
    boolean: ['export', 'preflight'],
    string: ['config', 'stage', 'param'],
    default: { preflight: true },
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
  const { _, config: _configFlag, export: _exportFlag, preflight: _preflightFlag, ...opts } = argv
  delete opts['--']

  // configorama parses the config file itself (including .env), so it keeps
  // the file path and reports errors with file + line.
  const input = file
  const configDir = settingsFile.configDir

  const configorama = loadConfigorama()
  const resolveOptions = { ...(settingsFile.options || {}), ...opts }

  // Pre-flight: resolve once with the custom resolvers stubbed out. Built-in
  // resolvers (opt/env/self) run for real and surface missing-value or bad-ref
  // errors, while side-effecting resolvers (e.g. the 1Password prompt) never
  // fire. So a doomed run fails here without ever prompting for a secret. This
  // only catches structural/input failures — a valid ref that fails at fetch
  // time (deleted item, revoked session) still reaches the real pass.
  const sources = settingsFile.variableSources
  if (Array.isArray(sources) && sources.length && argv.preflight !== false) {
    const stubbed = sources.map((src) => ({ ...src, resolver: async () => PREFLIGHT_PLACEHOLDER }))
    try {
      await configorama(input, { ...settingsFile, configDir, variableSources: stubbed, options: resolveOptions })
    } catch (err) {
      fail(err.message)
    }
  }

  let resolved
  // Let resolvers (e.g. the 1Password plugin's auth-prompt hint) attribute the
  // request to configx. Restored afterwards so it never reaches the child env.
  const priorProgramName = process.env.CONFIGORAMA_PROGRAM_NAME
  process.env.CONFIGORAMA_PROGRAM_NAME = 'configx'
  try {
    resolved = await configorama(input, {
      ...settingsFile,
      configDir,
      options: resolveOptions,
    })
  } catch (err) {
    fail(err.message)
  } finally {
    if (priorProgramName === undefined) delete process.env.CONFIGORAMA_PROGRAM_NAME
    else process.env.CONFIGORAMA_PROGRAM_NAME = priorProgramName
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

  process.exit(await runChild(command[0], command.slice(1), childEnv))
}

main().catch((err) => {
  if (err instanceof SetupShellError) fail(err.message, err.exitCode)
  if (err instanceof ConfigxError) fail(err.message, 2)
  fail(err && err.message ? err.message : String(err))
})
