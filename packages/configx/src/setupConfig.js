/* configx setup: prompt for missing config values, then apply them to exactly
   one explicit target (child command, --export, --write, --write-answers, menu) */
const fs = require('fs')
const path = require('path')
const readline = require('readline')
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

  return { file, command, target, argv, opts, rawArgs }
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
 * Prompt for missing values via the setup engine.
 * Prompt UI renders on stderr so stdout stays machine-clean for --export.
 * @param {SetupInvocation} parsed - parsed invocation
 * @param {Object} settingsFile - configx settings file contents
 * @param {Function} configorama - configorama async API
 * @returns {Promise<Object>} setup engine result (answers, requirements, ...)
 */
async function promptForAnswers(parsed, settingsFile, configorama) {
  const baseOptions = { ...(settingsFile.options || {}), ...parsed.opts }
  return configorama.setup(parsed.file, {
    ...settingsFile,
    options: baseOptions,
    streams: { output: process.stderr },
  })
}

/**
 * Resolve the config with wizard answers applied to the resolution context.
 * @param {SetupInvocation} parsed - parsed invocation
 * @param {Object} settingsFile - configx settings file contents
 * @param {Function} configorama - configorama async API
 * @param {Object} answers - answer groups from the setup engine
 * @returns {Promise<Object>} resolved config
 */
async function resolveWithAnswers(parsed, settingsFile, configorama, answers) {
  const baseOptions = { ...(settingsFile.options || {}), ...parsed.opts }

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

  return resolved
}

/**
 * Prompt for missing values, then resolve the config with answers applied.
 * @param {SetupInvocation} parsed - parsed invocation
 * @param {Object} settingsFile - configx settings file contents
 * @param {Function} configorama - configorama async API
 * @returns {Promise<{ answers: Object, resolved: Object }>} answers and resolved config
 */
async function promptAndResolve(parsed, settingsFile, configorama) {
  const setupResult = await promptForAnswers(parsed, settingsFile, configorama)
  const resolved = await resolveWithAnswers(parsed, settingsFile, configorama, setupResult.answers)
  return { answers: setupResult.answers, resolved }
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

// One readline interface for the whole setup session, with a line queue:
// piped stdin can deliver several answers in one chunk, and lines emitted
// between questions would otherwise be dropped.
let promptState = null

function getPromptState() {
  if (!promptState) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
    const state = { rl, queue: [], pending: null, closed: false }
    rl.on('line', (line) => {
      if (state.pending) {
        const resolvePending = state.pending
        state.pending = null
        resolvePending(line)
      } else {
        state.queue.push(line)
      }
    })
    rl.on('close', () => {
      state.closed = true
      if (state.pending) {
        const resolvePending = state.pending
        state.pending = null
        resolvePending('')
      }
    })
    promptState = state
  }
  return promptState
}

function closePromptInterface() {
  if (promptState && !promptState.closed) promptState.rl.close()
  promptState = null
}

/**
 * Ask a question on stderr, reading the answer from stdin.
 * EOF or a missing answer resolves to '' (callers fail closed).
 * @param {string} promptText - question to render
 * @returns {Promise<string>} the raw answer line
 */
function askLine(promptText) {
  const state = getPromptState()
  process.stderr.write(promptText)
  if (state.queue.length > 0) return Promise.resolve(state.queue.shift())
  if (state.closed) return Promise.resolve('')
  return new Promise((resolve) => {
    state.pending = resolve
  })
}

/**
 * Warn and confirm before persisting sensitive values to disk.
 * @param {string[]} sensitiveKeys - answered keys classified sensitive
 * @param {string} targetPath - file about to be written
 * @param {Object} argv - setup argv (checks --yes)
 * @returns {Promise<void>} resolves when confirmed; throws when declined
 */
async function confirmSensitiveWrite(sensitiveKeys, targetPath, argv) {
  if (sensitiveKeys.length === 0 || argv.yes === true) return
  for (const key of sensitiveKeys) {
    process.stderr.write(`configx: ${key} looks sensitive and will be written to ${targetPath}.\n`)
  }
  process.stderr.write('configx: prefer a 1Password reference when possible.\n')
  const answer = await askLine('Continue? [y/N] ')
  if (!/^y(es)?$/i.test(answer.trim())) {
    throw new ConfigxError('sensitive_write_declined', 'aborted: sensitive values were not written')
  }
}

/**
 * Keys classified sensitive by the setup requirements
 * @param {Array<Object>} requirements - setup engine requirements
 * @param {string[]} keys - candidate key names
 * @returns {string[]} sensitive key names
 */
function sensitiveKeysIn(requirements, keys) {
  return keys.filter((key) =>
    (requirements || []).some((req) => req && req.name === key && req.sensitive === true)
  )
}

/**
 * Write env answers (or resolved values for --write-resolved) to a dotenv file.
 * @param {SetupInvocation} parsed - parsed invocation
 * @param {Object} settingsFile - configx settings file contents
 * @param {Function} configorama - configorama async API
 * @returns {Promise<number>} exit code
 */
async function runWriteTarget(parsed, settingsFile, configorama) {
  const targetPath = parsed.target === 'write-resolved' ? parsed.argv['write-resolved'] : parsed.argv.write
  if (!targetPath) {
    throw new ConfigxError('missing_write_target', `missing file path for --${parsed.target}`)
  }

  const setupResult = await promptForAnswers(parsed, settingsFile, configorama)

  let values
  if (parsed.target === 'write-resolved') {
    const resolved = await resolveWithAnswers(parsed, settingsFile, configorama, setupResult.answers)
    values = Object.fromEntries(mergeAnsweredEnv(configEntries(resolved), setupResult.answers.env))
  } else {
    values = setupResult.answers.env
  }

  const keys = Object.keys(values)
  if (keys.length === 0) {
    process.stderr.write(`configx: no env values to write to ${targetPath}\n`)
    return 0
  }

  if (parsed.argv['dry-run'] === true) {
    process.stdout.write(`configx: would write ${keys.length} value(s) to ${targetPath}: ${keys.join(', ')}\n`)
    return 0
  }

  return confirmAndWriteDotenv(setupResult, values, targetPath, parsed.argv, configorama)
}

/**
 * Confirm sensitive values, write the dotenv file, and summarize by key name.
 * @param {Object} setupResult - setup engine result (for sensitivity classification)
 * @param {Object.<string, any>} values - env key/value pairs to write
 * @param {string} targetPath - dotenv file to write
 * @param {Object} argv - setup argv (--yes/--merge/--force)
 * @param {Function} configorama - configorama async API
 * @returns {Promise<number>} exit code
 */
async function confirmAndWriteDotenv(setupResult, values, targetPath, argv, configorama) {
  const keys = Object.keys(values)
  await confirmSensitiveWrite(sensitiveKeysIn(setupResult.requirements, keys), targetPath, argv)

  const result = configorama.writeDotenv(targetPath, values, {
    merge: argv.merge === true,
    force: argv.force === true,
  })
  process.stdout.write(`configx: wrote ${result.keys.length} value(s) to ${result.path}: ${result.keys.join(', ')}\n`)
  return 0
}

/**
 * Write all answer groups to a versioned JSON file for automation.
 * @param {SetupInvocation} parsed - parsed invocation
 * @param {Object} settingsFile - configx settings file contents
 * @param {Function} configorama - configorama async API
 * @returns {Promise<number>} exit code
 */
async function runWriteAnswersTarget(parsed, settingsFile, configorama) {
  const targetPath = parsed.argv['write-answers']
  if (!targetPath) {
    throw new ConfigxError('missing_write_target', 'missing file path for --write-answers')
  }

  const setupResult = await promptForAnswers(parsed, settingsFile, configorama)
  const answers = setupResult.answers

  const groupSummary = Object.entries(answers)
    .filter(([, values]) => Object.keys(values).length > 0)
    .map(([group, values]) => `${group}: ${Object.keys(values).join(', ')}`)
    .join('; ')

  if (parsed.argv['dry-run'] === true) {
    process.stdout.write(`configx: would write answers to ${targetPath} (${groupSummary || 'no answers'})\n`)
    return 0
  }

  const allKeys = Object.values(answers).flatMap((values) => Object.keys(values))
  await confirmSensitiveWrite(sensitiveKeysIn(setupResult.requirements, allKeys), targetPath, parsed.argv)

  const result = configorama.writeAnswers(targetPath, answers, { force: parsed.argv.force === true })
  process.stdout.write(`configx: wrote answers to ${result.path} (${groupSummary || 'no answers'})\n`)
  return 0
}

/**
 * Show the apply-target menu after prompting (plain `configx setup <file>`).
 * A normal CLI cannot set its parent shell, so option 1 prints the exact
 * config-env command instead of pretending anything was applied.
 * @param {SetupInvocation} parsed - parsed invocation
 * @param {Object} settingsFile - configx settings file contents
 * @param {Function} configorama - configorama async API
 * @returns {Promise<number>} exit code
 */
async function runMenuTarget(parsed, settingsFile, configorama) {
  const setupResult = await promptForAnswers(parsed, settingsFile, configorama)
  const originalArgs = parsed.rawArgs.join(' ')

  process.stderr.write([
    '',
    'configx: setup complete. Apply the answers:',
    '',
    '  1. Load into current shell (shows the command to run)',
    '  2. Write .env.local',
    '  3. Print export lines',
    '  4. Exit without applying',
    '',
    'To run a single command with these values:',
    `  configx setup ${originalArgs} -- <command>`,
    '',
  ].join('\n'))

  const choice = (await askLine('Choose [1-4] ')).trim()

  if (choice === '1') {
    process.stderr.write([
      '',
      'To set this terminal, run:',
      '',
      `  config-env setup ${originalArgs}`,
      '',
      'If config-env is not available, install the shell integration first:',
      '',
      '  configx setup-shell',
      '',
    ].join('\n'))
    return 0
  }

  if (choice === '2') {
    return confirmAndWriteDotenv(setupResult, setupResult.answers.env, '.env.local', parsed.argv, configorama)
  }

  if (choice === '3') {
    const resolved = await resolveWithAnswers(parsed, settingsFile, configorama, setupResult.answers)
    const entries = mergeAnsweredEnv(configEntries(resolved), setupResult.answers.env)
    const lines = shellExport(entries)
    if (lines) process.stdout.write(lines + '\n')
    return 0
  }

  if (choice === '4') {
    process.stderr.write('configx: nothing applied\n')
    return 0
  }

  throw new ConfigxError('setup_menu_cancelled', 'no target chosen; nothing applied')
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

  try {
    if (parsed.target === 'export') {
      return await runExportTarget(parsed, settingsFile, configorama)
    }
    if (parsed.target === 'command') {
      return await runCommandTarget(parsed, settingsFile, configorama)
    }
    if (parsed.target === 'write' || parsed.target === 'write-resolved') {
      return await runWriteTarget(parsed, settingsFile, configorama)
    }
    if (parsed.target === 'write-answers') {
      return await runWriteAnswersTarget(parsed, settingsFile, configorama)
    }
    return await runMenuTarget(parsed, settingsFile, configorama)
  } finally {
    closePromptInterface()
  }
}

module.exports = {
  parseSetupArgs,
  runSetupConfig,
  SETUP_ONLY_FLAGS,
}
