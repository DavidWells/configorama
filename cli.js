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

// Parse command line arguments
const argv = minimist(process.argv.slice(2), {
  string: ['output', 'o', 'format', 'f', 'param'],
  boolean: ['help', 'h', 'version', 'v', 'V', 'debug', 'allow-unknown', 'allow-undefined', 'list', 'info', 'verify', 'raw', 'r', 'copy', 'c', 'setup', 'requirements'],
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

Options:
  -h, --help                Show this help message
  -v, --version             Show version number
  -o, --output <file>       Write output to file instead of stdout
  -f, --format <format>     Output format: json, yaml, or js (default: json)
  -r, --raw                 Print extracted scalar values without JSON quoting
  -c, --copy                Copy the formatted output to the clipboard
  -d, --debug               Enable debug mode
  -i, --info                Show info about the config
  -V, --verify              Verify the config
  --setup                   Run the interactive config wizard (experimental)
  --requirements            Print agent requirements JSON without resolving config
  --param <key=value>       Pass parameter values (can be used multiple times)
  --allow-unknown           Allow unknown variables to pass through
  --allow-undefined         Allow undefined values in the final output

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
  configorama requirements config.yml
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

// Parse positional args: find file path and jq-style extraction path
// File is first arg that exists as a file, jq path starts with '.' or '['
let inputFile = null
let extractPath = null
const requirementsSubcommand = argv._[0] === 'requirements'
const requirementsMode = requirementsSubcommand || Boolean(argv.requirements)

function isFileArg(arg) {
  if (fs.existsSync(arg) && fs.statSync(arg).isFile()) return true
  return arg.startsWith('./') || arg.startsWith('../')
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
  console.error('Error: No input file specified')
  console.error('Run with --help for usage information')
  process.exit(1)
}

// Check if file exists
if (!fs.existsSync(inputFile)) {
  console.error(`Error: File not found: ${inputFile}`)
  process.exit(1)
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
  dynamicArgs: argv
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
        console.error(`Error: Path not found: ${extractPath}`)
        process.exit(1)
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
