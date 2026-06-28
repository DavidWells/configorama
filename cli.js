#!/usr/bin/env node

const fs = require('fs')
const minimist = require('minimist')
const { spawnSync } = require('child_process')
const Configorama = require('./src/main')
const deepLog = require('./src/utils/ui/deep-log')
const { logHeader } = require('./src/utils/ui/logs')
const configorama = require('./src')
const { makeBox } = require('@davidwells/box-logger')
const getValueAtPath = require('./src/utils/parsing/getValueAtPath')
const { redactConfigByRequirements } = require('./src/utils/redaction/setupRedaction')
const { normalizeError } = require('./src/errors')
const { didYouMean } = require('./src/utils/strings/didYouMean')
const { buildCapabilities } = require('./src/capabilities')

// Subcommands an agent might type; used for "did you mean" command suggestions.
const KNOWN_COMMANDS = ['inspect', 'requirements', 'audit', 'graph', 'setup', 'capabilities']
const INSPECT_VIEWS = ['requirements', 'audit', 'graph']
// Long flag names recognized by the parser; used for "did you mean" flag suggestions.
// Unknown flags that are NOT near one of these are left alone so arbitrary
// ${opt:...} passthrough flags (e.g. --stage, --domain) keep working.
const KNOWN_FLAGS = [
  'help', 'version', 'output', 'format', 'param', 'error-format', 'safe-root', 'file-root',
  'debug', 'verbose', 'allow-unknown', 'allow-undefined', 'allow-unknown-file-refs',
  'return-metadata', 'list', 'info', 'verify', 'raw', 'copy', 'setup', 'requirements',
  'capabilities', 'view', 'safe', 'unsafe',
]

// Parse command line arguments
const argv = minimist(process.argv.slice(2), {
  string: ['output', 'o', 'format', 'f', 'param', 'error-format', 'safe-root', 'file-root', 'view'],
  boolean: ['help', 'h', 'version', 'v', 'V', 'debug', 'allow-unknown', 'allow-undefined', 'list', 'info', 'verify', 'raw', 'r', 'copy', 'c', 'setup', 'requirements', 'capabilities', 'safe', 'unsafe'],
  alias: {
    h: 'help',
    v: 'version',
    V: 'verify',
    o: 'output',
    f: 'format',
    r: 'raw',
    c: 'copy',
    l: 'list',
    i: 'info',
  },
  default: {
    format: 'json'
  }
})


// Show help
if (argv.help) {
  console.log(`
Configorama - Variable resolution for configuration files

Usage:
  configorama [options] <file> [path]
  configorama <command> <file> [options]

Commands:
  (default)                 Resolve <file> and print the result
  inspect <file>            Introspect a config without resolving it (full model)
                              --view requirements|audit|graph for a single slice
  requirements <file>       Inputs a config needs   (alias: inspect --view requirements)
  audit <file>              Risky references         (alias: inspect --view audit)
  graph <file>              Variable/file dep graph  (alias: inspect --view graph)
  setup <file>              Run the interactive config wizard (experimental)
  capabilities              Print the machine-readable CLI contract (JSON)

Options:
  -h, --help                Show this help message
  -v, --version             Show version number
  -o, --output <file>       Write output to file instead of stdout
  -f, --format <format>     Output format: json, yaml, js (resolve); json, mermaid, dot (graph)
      --view <view>         inspect view: requirements, audit, or graph
  -r, --raw                 Print extracted scalar values without JSON quoting
  -c, --copy                Copy the formatted output to the clipboard
  -d, --debug               Enable debug mode
  -i, --info                Show info about the config
  -V, --verify              Verify the config
  --safe                    Block executable/config-mutating surfaces during resolution
  --unsafe                  Disable inspect/audit/graph default safe inspection
  --safe-root <dir>         Restrict file/text references to an allowed root
  --error-format <fmt>      Error format on stderr: json or human. json is the
                              default for inspect/requirements/audit/graph/capabilities
  --param <key=value>       Pass parameter values (can be used multiple times)
  --allow-unknown           Allow unknown variables to pass through
  --allow-undefined         Allow undefined values in the final output

  Aliases: the \`requirements\` and \`setup\` commands are also available as the
  \`--requirements\` and \`--setup\` flags. \`capabilities\` is also \`--capabilities\`.

Path Extraction:
  Use jq-style paths to extract specific values from the resolved config.
  Paths can appear before or after options.

  Supported syntax:
    .foo              Object key access
    .foo.bar          Nested key access
    .[0]              Array index (0-based)
    .[-1]             Negative index (from end)
    .foo[0].bar       Mixed access
    .["key-name"]     Bracket notation for special keys

Examples:
  configorama config.yml
  configorama config.yml .database.host
  configorama -r config.yml .database.host
  configorama -r --copy config.yml .database.host
  configorama '.servers[0].port' config.yml
  configorama --info config.yml
  configorama --setup config.yml
  configorama setup config.yml
  configorama inspect config.yml
  configorama inspect config.yml --view requirements
  configorama inspect config.yml --view graph --format mermaid
  configorama requirements config.yml
  configorama audit config.yml
  configorama graph config.yml --format mermaid
  configorama capabilities
  configorama config.yml --requirements
  configorama --format yaml config.json
  configorama --output resolved.json config.yml
  configorama --param="domain=myapp.com" --param="key=value" config.yml
  configorama --allow-unknown config.toml
  `)
  process.exit(0)
}

// Show version
if (argv.version) {
  const packageJson = require('./package.json')
  console.log(`Configorama v${packageJson.version}`)
  process.exit(0)
}

// Capabilities is an informational command and needs no input file.
if (argv._[0] === 'capabilities' || argv.capabilities) {
  const capsOutput = JSON.stringify(buildCapabilities(), null, 2)
  if (argv.output) {
    fs.writeFileSync(argv.output, capsOutput)
    console.log(`Capabilities written to ${argv.output}`)
  } else {
    console.log(capsOutput)
  }
  process.exit(0)
}

// Warn (don't fail) on a misspelled flag that is one edit from a known flag.
// Genuine ${opt:...} passthrough flags are far from any known flag, so they
// are left untouched and keep working.
function warnUnknownFlags() {
  for (const token of process.argv.slice(2)) {
    if (!token.startsWith('--') || token === '--') continue
    const name = token.slice(2).split('=')[0]
    if (!name || KNOWN_FLAGS.includes(name)) continue
    const suggestion = didYouMean(name, KNOWN_FLAGS)
    if (suggestion) {
      console.error(`Warning: unknown flag "--${name}". Did you mean "--${suggestion}"?`)
    }
  }
}
warnUnknownFlags()

// Parse positional args: find file path and jq-style extraction path
// File is first arg that exists as a file, jq path starts with '.' or '['
let inputFile = null
let extractPath = null
const requirementsSubcommand = argv._[0] === 'requirements'
const auditSubcommand = argv._[0] === 'audit'
const graphSubcommand = argv._[0] === 'graph'
const inspectSubcommand = argv._[0] === 'inspect'
const requirementsMode = requirementsSubcommand || Boolean(argv.requirements)
// Commands that emit JSON to stdout; their errors default to JSON on stderr too.
const structuredCommand = requirementsMode || auditSubcommand || graphSubcommand || inspectSubcommand

function isFileArg(arg) {
  if (fs.existsSync(arg) && fs.statSync(arg).isFile()) return true
  return arg.startsWith('./') || arg.startsWith('../')
}

/**
 * Print a CLI-level error and exit non-zero, honoring --error-format.
 * Structured commands default to JSON; resolve mode defaults to a plain message.
 * @param {string} code - stable error code (see ERROR_CODES)
 * @param {string} message - human-readable message
 * @param {object} [details] - extra machine-readable context
 */
function emitCliError(code, message, details = {}) {
  const wantsJson = argv['error-format'] === 'json' || (structuredCommand && argv['error-format'] !== 'human')
  if (wantsJson) {
    console.error(JSON.stringify({ error: { code, message, details } }, null, 2))
  } else {
    console.error(`Error: ${message}`)
  }
  process.exit(1)
}

// If the first arg looks like a misspelled command (not a file or jq-path),
// suggest the closest command instead of silently treating it as a filename.
const firstArg = argv._[0]
if (
  firstArg &&
  !KNOWN_COMMANDS.includes(firstArg) &&
  !firstArg.startsWith('.') &&
  !firstArg.startsWith('[') &&
  !isFileArg(firstArg) &&
  !fs.existsSync(firstArg)
) {
  const suggestion = didYouMean(firstArg, KNOWN_COMMANDS)
  if (suggestion) {
    emitCliError(
      'unknown_command',
      `Unknown command "${firstArg}". Did you mean "${suggestion}"? Run --help for usage.`,
      { provided: firstArg, suggestion, commands: KNOWN_COMMANDS }
    )
  }
}

function getClipboardCommands() {
  if (process.env.CONFIGORAMA_CLIPBOARD_COMMAND) {
    return [{ command: process.env.CONFIGORAMA_CLIPBOARD_COMMAND, shell: true }]
  }

  if (process.platform === 'darwin') return [{ command: 'pbcopy', args: [] }]
  if (process.platform === 'win32') return [{ command: 'clip', args: [] }]

  return [
    { command: 'wl-copy', args: [] },
    { command: 'xclip', args: ['-selection', 'clipboard'] },
    { command: 'xsel', args: ['--clipboard', '--input'] }
  ]
}

function copyToClipboard(value) {
  let lastError = ''
  for (const candidate of getClipboardCommands()) {
    const result = spawnSync(candidate.command, candidate.args || [], {
      input: String(value),
      encoding: 'utf8',
      shell: !!candidate.shell,
      stdio: ['pipe', 'ignore', 'pipe']
    })

    if (!result.error && result.status === 0) return { ok: true }
    lastError = result.error ? result.error.message : (result.stderr || '').trim()
  }

  return {
    ok: false,
    error: lastError || 'No supported clipboard command found'
  }
}

if (requirementsSubcommand) {
  inputFile = argv._[1] || null
} else if (auditSubcommand || graphSubcommand || inspectSubcommand) {
  inputFile = argv._[1] || null
} else {
  for (const arg of argv._) {
    if (arg === 'setup') continue

    // jq-style paths start with '.' or '['
    if (!inputFile && isFileArg(arg)) {
      inputFile = arg
    } else if (arg.startsWith('.') || arg.startsWith('[')) {
      extractPath = arg
    } else if (!inputFile) {
      inputFile = arg
    }
  }
}

if (!inputFile) {
  emitCliError('no_input_file', 'No input file specified. Run with --help for usage information.', {})
}

// Check if file exists
if (!fs.existsSync(inputFile)) {
  emitCliError('file_not_found', `File not found: ${inputFile}`, { path: inputFile })
}

// Set options for Configorama
const options = {
  allowUnknownVars: argv['allow-unknown'] || false,
  allowUndefinedValues: argv['allow-undefined'] || false,
  allowUnknownFileRefs: argv['allow-unknown-file-refs'] || false,
  returnMetadata: argv['return-metadata'] || false,
  returnPreResolvedVariableDetails: false,
  // Setup wizard via --setup flag or `setup` subcommand
  setup: Boolean(argv.setup) || argv._.includes('setup'),
  safeMode: Boolean(argv.safe) || ((auditSubcommand || graphSubcommand || inspectSubcommand) && !argv.unsafe),
  safeRoots: [],
  dynamicArgs: argv
}

options.safeRoots = []
if (argv['safe-root']) options.safeRoots = options.safeRoots.concat(argv['safe-root'])
if (argv['file-root']) options.safeRoots = options.safeRoots.concat(argv['file-root'])
if (options.safeRoots.length > 0) {
  options.allowedFileRoots = options.safeRoots
  options.restrictFileRoots = true
}

const dynamicArgs = options.dynamicArgs || {}
const { 
  _, 
  verbose, 
  v,
  verify,
  debug, 
  d, 
  help, 
  h, 
  version,
  f,
  format,
  list,
  l,
  info,
  i,
  r,
  raw,
  c,
  copy,
  setup,
  requirements,
  safe,
  unsafe,
  'safe-root': safeRoot,
  'file-root': fileRoot,
  'error-format': errorFormat,
  'allow-unknown': allowUnknown,
  'allow-undefined': allowUndefined,
  'allow-unknown-file-refs': allowUnknownFileRefs,
  'return-metadata': returnMetadata,
  ...rest 
} = dynamicArgs


if (options.dynamicArgs.verbose) {
  logHeader('Config Input Options')

  console.log()
  if (Object.keys(rest).length) {
    deepLog(rest)
  } else {
    console.log('No flag options provided. Set flags like --flag value')
  }
  console.log()
}

// Set -- flags as options
options.options = rest
options.handleSignalEvents = true

function handleCliError(error) {
  const wantsJson = argv['error-format'] === 'json' || (structuredCommand && argv['error-format'] !== 'human')
  if (wantsJson) {
    console.error(JSON.stringify(normalizeError(error).toJSON(), null, 2))
    process.exit(1)
  }

  const errorMsg = makeBox({
    title: `Error Processing Configuration: ${inputFile}`,
    minWidth: '100%',
    content: error.message,
    type: 'error',
  })
  console.error(errorMsg)
  if (argv.debug) {
    console.error('error', error)
  }
  process.exit(1)
}

if (requirementsMode) {
  configorama.analyze(inputFile, {
    ...options,
    instructions: true,
  })
    .then((requirementsJson) => {
      const output = JSON.stringify(requirementsJson, null, 2)

      if (argv.copy) {
        const copyResult = copyToClipboard(output)
        if (!copyResult.ok) {
          console.error(`Error: Unable to copy to clipboard: ${copyResult.error}`)
          process.exit(1)
        }
      }

      if (argv.output) {
        fs.writeFileSync(argv.output, output)
        console.log(`Configuration written to ${argv.output}`)
      } else if (!argv.verbose) {
        console.log(output)
      }
    })
    .catch(handleCliError)
} else if (auditSubcommand) {
  configorama.audit(inputFile, options)
    .then((report) => {
      const output = JSON.stringify(report, null, 2)

      if (argv.output) {
        fs.writeFileSync(argv.output, output)
        console.log(`Audit written to ${argv.output}`)
      } else {
        console.log(output)
      }
    })
    .catch(handleCliError)
} else if (graphSubcommand) {
  configorama.graph(inputFile, {
    ...options,
    format: argv.format || 'json',
  })
    .then((graphOutput) => {
      const output = typeof graphOutput === 'string' ? graphOutput : JSON.stringify(graphOutput, null, 2)
      if (argv.output) {
        fs.writeFileSync(argv.output, output)
        console.log(`Graph written to ${argv.output}`)
      } else {
        console.log(output)
      }
    })
    .catch(handleCliError)
} else if (inspectSubcommand) {
  const view = argv.view
  if (view && !INSPECT_VIEWS.includes(view)) {
    const suggestion = didYouMean(String(view), INSPECT_VIEWS)
    emitCliError(
      'invalid_view',
      `Unknown view "${view}".${suggestion ? ` Did you mean "${suggestion}"?` : ''} Valid views: ${INSPECT_VIEWS.join(', ')}.`,
      { provided: view, suggestion: suggestion || null, views: INSPECT_VIEWS }
    )
  }
  configorama.inspect(inputFile, {
    ...options,
    view: view || undefined,
    format: argv.format || 'json',
  })
    .then((result) => {
      const output = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      if (argv.output) {
        fs.writeFileSync(argv.output, output)
        console.log(`Inspection written to ${argv.output}`)
      } else {
        console.log(output)
      }
    })
    .catch(handleCliError)
} else {

// Process the configuration
const shouldRedactSetupStdout = options.setup && !argv.output && !argv.copy
let setupRequirementsForRedaction = []
const configPromise = shouldRedactSetupStdout
  ? (() => {
      const instance = new Configorama(inputFile, options)
      return instance.init(options.options || {}).then((config) => {
        setupRequirementsForRedaction = instance.setupRequirements || []
        return config
      })
    })()
  : configorama(inputFile, options)

configPromise
  .then((config) => {
    let outputConfig = shouldRedactSetupStdout
      ? redactConfigByRequirements(config, setupRequirementsForRedaction)
      : config

    // Apply path extraction if specified
    if (extractPath) {
      outputConfig = getValueAtPath(outputConfig, extractPath)
      if (outputConfig === undefined) {
        emitCliError('path_not_found', `Path not found: ${extractPath}`, { path: extractPath })
      }
    }

    let output

    // Format the output
    if (argv.raw && extractPath && (outputConfig === null || ['string', 'number', 'boolean'].includes(typeof outputConfig))) {
      output = outputConfig === null ? 'null' : String(outputConfig)
    } else switch (argv.format.toLowerCase()) {
      case 'yaml':
      case 'yml':
        const YAML = require('./src/parsers/yaml')
        output = YAML.dump(outputConfig)
        break
      case 'esm':
      case 'mjs':
      case 'module':
        output = `export default ${JSON.stringify(outputConfig, null, 2)}`
        break
      case 'js':
      case 'cjs':
      case 'commonjs':
      case 'javascript':
        output = `module.exports = ${JSON.stringify(outputConfig, null, 2)}`
        break
      case 'json':
      case 'json5':
      default:
        if (returnMetadata) {
          // turn regex into string
          outputConfig.variableSyntax = outputConfig.variableSyntax ? outputConfig.variableSyntax.source : undefined
        }
        output = JSON.stringify(outputConfig, null, 2)
    }

    if (argv.copy) {
      const copyResult = copyToClipboard(output)
      if (!copyResult.ok) {
        console.error(`Error: Unable to copy to clipboard: ${copyResult.error}`)
        process.exit(1)
      }
    }

    // Write to file or stdout
    if (argv.output) {
      fs.writeFileSync(argv.output, output)
      console.log(`Configuration written to ${argv.output}`)
    } else {
      if (!argv.verbose) {
        console.log(output)
      }
      if (argv.format && argv.verbose) {
        console.log('Output Format:', argv.format)
        console.log(output)
      }
    }
  })
  .catch(handleCliError)
}
