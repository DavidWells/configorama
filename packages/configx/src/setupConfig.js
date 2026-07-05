/* configx setup: prompt for missing config values, then apply them to exactly
   one explicit target (child command, --export, --write, --write-answers, menu) */
const fs = require('fs')
const path = require('path')
const minimist = require('minimist')
const { resolveEnv, configEntries, shellExport, exportSummary, ConfigxError } = require('./resolveEnv')
const { loadConfigorama, loadConfigParser, loadSettingsFile } = require('./loaders')
const { runChild } = require('./runChild')

// Flags owned by the setup command; never forwarded into configorama options
const SETUP_ONLY_FLAGS = [
  'export', 'write', 'write-resolved', 'write-answers', 'answers',
  'dry-run', 'yes', 'merge', 'force', 'preflight',
]

/**
 * @typedef {Object} SetupInvocation
 * @property {string|undefined} file - config file positional
 * @property {string[]} command - child command after --
 * @property {string} target - one of: command, export, write, write-resolved, write-answers, menu
 * @property {Object} argv - full minimist argv (setup flags live here)
 * @property {Object} opts - configorama options with setup-only flags stripped
 */

/**
 * Parse setup args and enforce the one-target rule.
 * Conflicts throw BEFORE any prompting so user answers are never wasted.
 * @param {string[]} rawArgs - argv after the `setup` positional
 * @returns {SetupInvocation} parsed invocation
 */
function parseSetupArgs(rawArgs) {
  const argv = minimist(rawArgs, {
    '--': true,
    boolean: ['export', 'dry-run', 'yes', 'merge', 'force', 'preflight'],
    string: ['config', 'stage', 'param', 'write', 'write-resolved', 'write-answers', 'answers'],
    default: { preflight: true },
  })

  const file = argv._[0]
  const command = argv['--'] || []

  const targets = []
  if (argv.export === true) targets.push({ name: 'export', label: '--export' })
  if (argv.write !== undefined) targets.push({ name: 'write', label: '--write' })
  if (argv['write-resolved'] !== undefined) targets.push({ name: 'write-resolved', label: '--write-resolved' })
  if (argv['write-answers'] !== undefined) targets.push({ name: 'write-answers', label: '--write-answers' })
  if (command.length > 0) targets.push({ name: 'command', label: 'the -- command target' })

  if (targets.length > 1) {
    throw new ConfigxError(
      'setup_target_conflict',
      `setup target conflict: ${targets[0].label} cannot be combined with ${targets[1].label}`
    )
  }

  const target = targets.length === 1 ? targets[0].name : 'menu'

  // configorama options for ${opt:...}: drop positionals, the -- command,
  // the shared --config flag, and every setup-only flag.
  const { _, config: _configFlag, ...rest } = argv
  delete rest['--']
  const opts = {}
  for (const [key, value] of Object.entries(rest)) {
    if (SETUP_ONLY_FLAGS.includes(key)) continue
    opts[key] = value
  }

  return { file, command, target, argv, opts }
}

/**
 * Set a dot-separated path on an object (answers.dotProp entries)
 * @param {Object} target - object to mutate
 * @param {string} dotPath - e.g. "nested.key"
 * @param {*} value - value to set
 */
function setByPath(target, dotPath, value) {
  const parts = dotPath.split('.')
  let node = target
  for (const part of parts.slice(0, -1)) {
    if (node[part] === null || typeof node[part] !== 'object') node[part] = {}
    node = node[part]
  }
  node[parts[parts.length - 1]] = value
}

/**
 * Prompt for missing values via the setup engine, then resolve the config
 * with the answers applied. Prompt UI renders on stderr so stdout stays
 * machine-clean for --export.
 * @param {SetupInvocation} parsed - parsed invocation
 * @param {Object} settingsFile - configx settings file contents
 * @param {Function} configorama - configorama async API
 * @returns {Promise<{ answers: Object, resolved: Object }>} answers and resolved config
 */
async function promptAndResolve(parsed, settingsFile, configorama) {
  const baseOptions = { ...(settingsFile.options || {}), ...parsed.opts }

  const setupResult = await configorama.setup(parsed.file, {
    ...settingsFile,
    options: baseOptions,
    streams: { output: process.stderr },
  })
  const answers = setupResult.answers

  // Answered env feeds ${env:} refs during resolution; configx exits after,
  // and the parent shell is never affected by this process-local mutation.
  Object.assign(process.env, answers.env)
  const resolveOptions = { ...baseOptions, ...answers.options }

  // self/dotProp answers patch the parsed config object before resolution
  let input = parsed.file
  let configDir = settingsFile.configDir
  if (Object.keys(answers.self).length > 0 || Object.keys(answers.dotProp).length > 0) {
    const { parseFile } = loadConfigParser()
    const configObject = parseFile(path.resolve(parsed.file))
    Object.assign(configObject, answers.self)
    for (const [key, value] of Object.entries(answers.dotProp)) {
      setByPath(configObject, key, value)
    }
    input = configObject
    configDir = configDir || path.dirname(path.resolve(parsed.file))
  }

  // Let resolvers (e.g. the 1Password plugin's auth-prompt hint) attribute the
  // request to configx. Restored afterwards so it never reaches child targets.
  const priorProgramName = process.env.CONFIGORAMA_PROGRAM_NAME
  process.env.CONFIGORAMA_PROGRAM_NAME = 'configx'
  let resolved
  try {
    resolved = await configorama(input, {
      ...settingsFile,
      configDir,
      options: resolveOptions,
    })
  } finally {
    if (priorProgramName === undefined) delete process.env.CONFIGORAMA_PROGRAM_NAME
    else process.env.CONFIGORAMA_PROGRAM_NAME = priorProgramName
  }

  return { answers, resolved }
}

/**
 * Merge answered env vars into resolved config entries for export.
 * Answered values win on key collisions - they are what the user just typed.
 * @param {Array<[string, string]>} entries - validated resolved config entries
 * @param {Object.<string, any>} answeredEnv - env answers from the wizard
 * @returns {Array<[string, string]>} merged entries
 */
function mergeAnsweredEnv(entries, answeredEnv) {
  const merged = entries.map(([key, value]) => (
    Object.prototype.hasOwnProperty.call(answeredEnv, key)
      ? [key, String(answeredEnv[key])]
      : [key, value]
  ))
  const seen = new Set(entries.map(([key]) => key))
  for (const [key, value] of Object.entries(answeredEnv)) {
    if (!seen.has(key)) merged.push([key, String(value)])
  }
  return merged
}

/**
 * Print export lines for the answered + resolved values.
 * Stdout carries only export lines; summaries go to stderr.
 * @param {SetupInvocation} parsed - parsed invocation
 * @param {Object} settingsFile - configx settings file contents
 * @param {Function} configorama - configorama async API
 * @returns {Promise<number>} exit code
 */
async function runExportTarget(parsed, settingsFile, configorama) {
  const { answers, resolved } = await promptAndResolve(parsed, settingsFile, configorama)
  const entries = mergeAnsweredEnv(configEntries(resolved), answers.env)

  const lines = shellExport(entries)
  if (lines) process.stdout.write(lines + '\n')
  const summary = exportSummary(entries)
  if (summary && process.stderr.isTTY) {
    process.stderr.write(`configx: ${summary}\n`)
  }
  return 0
}

/**
 * Run the child command with answered + resolved values in its environment.
 * Values live only in this process and the child; nothing persists.
 * @param {SetupInvocation} parsed - parsed invocation
 * @param {Object} settingsFile - configx settings file contents
 * @param {Function} configorama - configorama async API
 * @returns {Promise<number>} the child's exit status
 */
async function runCommandTarget(parsed, settingsFile, configorama) {
  const { resolved } = await promptAndResolve(parsed, settingsFile, configorama)
  // promptAndResolve applied answered env to process.env, so answered values
  // reach the child and win over resolved config keys (parent-wins semantics)
  const childEnv = resolveEnv(resolved, process.env)
  return runChild(parsed.command[0], parsed.command.slice(1), childEnv)
}

/**
 * Run the configx setup command.
 * @param {string[]} rawArgs - argv after the `setup` positional
 * @returns {Promise<number>} process exit code
 */
async function runSetupConfig(rawArgs) {
  const parsed = parseSetupArgs(rawArgs)

  if (!parsed.file) {
    throw new ConfigxError(
      'missing_setup_file',
      'missing config file. Usage: configx setup <file> [configorama options] [target]'
    )
  }
  if (!fs.existsSync(parsed.file)) {
    throw new ConfigxError('setup_file_not_found', `config file not found: ${parsed.file}`)
  }

  const settingsFile = loadSettingsFile(parsed.argv.config, process.cwd())
  const configorama = loadConfigorama()

  if (parsed.target === 'export') {
    return runExportTarget(parsed, settingsFile, configorama)
  }
  if (parsed.target === 'command') {
    return runCommandTarget(parsed, settingsFile, configorama)
  }

  throw new ConfigxError('setup_target_unimplemented', `setup target "${parsed.target}" is not implemented yet`)
}

module.exports = {
  parseSetupArgs,
  runSetupConfig,
  SETUP_ONLY_FLAGS,
}
