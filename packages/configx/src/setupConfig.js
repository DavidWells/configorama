/* configx setup: prompt for missing config values, then apply them to exactly
   one explicit target (child command, --export, --write, --write-answers, menu) */
const fs = require('fs')
const minimist = require('minimist')
const { ConfigxError } = require('./resolveEnv')

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

  throw new ConfigxError('setup_target_unimplemented', `setup target "${parsed.target}" is not implemented yet`)
}

module.exports = {
  parseSetupArgs,
  runSetupConfig,
  SETUP_ONLY_FLAGS,
}
