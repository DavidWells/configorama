#!/usr/bin/env node

const fs = require('fs')
const minimist = require('minimist')
const Configorama = require('./src/main')
const deepLog = require('./src/utils/ui/deep-log')
const { logHeader } = require('./src/utils/ui/logs')
const configorama = require('./src')
const { makeBox } = require('@davidwells/box-logger')
const getValueAtPath = require('./src/utils/parsing/getValueAtPath')

/**
 * Print a formatted processing error and exit
 * @param {Error} error
 * @returns {void}
 */
function handleProcessingError(error) {
  const errorMsg = makeBox({
    title: `Error Processing Configuration: ${inputFile}`,
    minWidth: '100%',
    content: error.message,
    type: 'error',
  })
  console.log(errorMsg)
  if (argv.debug) {
    console.error('error', error)
  }
  process.exit(1)
}

/**
 * Return required env vars that are currently missing
 * @param {Record<string, { variableType?: string, variable?: string, occurrences?: Array<{ isRequired?: boolean }> }>} [uniqueVariables]
 * @returns {string[]}
 */
function getMissingRequiredEnvVars(uniqueVariables = {}) {
  const missingVars = new Set()

  Object.values(uniqueVariables).forEach((varData) => {
    if (!varData || varData.variableType !== 'env') {
      return
    }
    const occurrences = Array.isArray(varData.occurrences) ? varData.occurrences : []
    const isRequired = occurrences.some((occurrence) => occurrence && occurrence.isRequired)
    if (!isRequired) {
      return
    }
    const envName = String(varData.variable || '').replace(/^env:/, '').trim()
    if (envName && process.env[envName] === undefined) {
      missingVars.add(envName)
    }
  })

  return [...missingVars].sort()
}

/**
 * Return file references that do not currently exist
 * @param {{ byConfigPath?: Array<{ exists?: boolean }> }} [fileDependencies]
 * @returns {Array<{ exists?: boolean }>}
 */
function getMissingFileRefs(fileDependencies = {}) {
  const refs = Array.isArray(fileDependencies.byConfigPath) ? fileDependencies.byConfigPath : []
  return refs.filter((ref) => ref && ref.exists === false)
}

/**
 * Print CLI verify summary and return verification status
 * @param {{ summary?: { totalVariables?: number }, fileDependencies?: object, uniqueVariables?: object }} [analysis]
 * @returns {boolean}
 */
function printVerifySummary(analysis = {}) {
  const summary = analysis.summary || {}
  const totalVariables = summary.totalVariables || 0
  const missingFileRefs = getMissingFileRefs(analysis.fileDependencies || {})
  const missingEnvVars = getMissingRequiredEnvVars(analysis.uniqueVariables || {})

  console.log('OK: Config structure is valid')
  console.log(`OK: Found ${totalVariables} variable${totalVariables === 1 ? '' : 's'}`)
  console.log('OK: No circular dependency check failures detected during analysis')

  if (missingFileRefs.length > 0) {
    console.log(`ERROR: Missing file references (${missingFileRefs.length})`)
    missingFileRefs.forEach((ref) => {
      const locationText = ref.location ? ` at ${ref.location}` : ''
      const relativePath = ref.relativePath || ref.filePath || 'unknown path'
      console.log(`  - ${relativePath}${locationText}`)
    })
  } else {
    console.log('OK: All file references exist')
  }

  if (missingEnvVars.length > 0) {
    console.log(`WARN: ${missingEnvVars.length} required environment variable${missingEnvVars.length === 1 ? '' : 's'} not set`)
    missingEnvVars.forEach((name) => {
      console.log(`  - ${name}`)
    })
  } else {
    console.log('OK: All required environment variables are set or have defaults')
  }

  return missingFileRefs.length === 0
}

// Parse command line arguments
const argv = minimist(process.argv.slice(2), {
  string: ['output', 'o', 'format', 'f', 'param'],
  boolean: ['help', 'h', 'version', 'v', 'V', 'debug', 'allow-unknown', 'allow-undefined', 'list', 'info', 'verify'],
  alias: {
    h: 'help',
    v: 'version',
    V: 'verify',
    o: 'output',
    f: 'format',
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
  -d, --debug               Enable debug mode
  -i, --info                Show info about the config
  -V, --verify              Verify the config
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
  configorama '.servers[0].port' config.yml
  configorama --info config.yml
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

for (const arg of argv._) {
  if (arg === 'setup') continue

  // jq-style paths start with '.' or '['
  if (arg.startsWith('.') || arg.startsWith('[')) {
    extractPath = arg
  } else if (!inputFile) {
    inputFile = arg
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

let isSetupMode = false
if (argv._.length) {
  isSetupMode = argv._.includes('setup')
}

// Set -- flags as options
options.options = rest

if (argv.verify) {
  configorama.analyze(inputFile, options)
    .then((analysis) => {
      const verified = printVerifySummary(analysis)
      process.exit(verified ? 0 : 1)
    })
    .catch(handleProcessingError)
  return
}

// Process the configuration
configorama(inputFile, options)
  .then((config) => {
    // Apply path extraction if specified
    if (extractPath) {
      config = getValueAtPath(config, extractPath)
      if (config === undefined) {
        console.error(`Error: Path not found: ${extractPath}`)
        process.exit(1)
      }
    }

    let output

    // Format the output
    switch (argv.format.toLowerCase()) {
      case 'yaml':
      case 'yml':
        const YAML = require('./src/parsers/yaml')
        output = YAML.dump(config)
        break
      case 'esm':
      case 'mjs':
      case 'module':
        output = `export default ${JSON.stringify(config, null, 2)}`
        break
      case 'js':
      case 'cjs':
      case 'commonjs':
      case 'javascript':
        output = `module.exports = ${JSON.stringify(config, null, 2)}`
        break
      case 'json':
      case 'json5':
      default:
        if (returnMetadata) {
          // turn regex into string
          config.variableSyntax = config.variableSyntax ? config.variableSyntax.source : undefined
        }
        output = JSON.stringify(config, null, 2)
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
  .catch(handleProcessingError)