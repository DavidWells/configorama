#!/usr/bin/env node

const fs = require('fs')
const minimist = require('minimist')
const Configorama = require('./src/main')
const deepLog = require('./src/utils/deep-log')
const { logHeader } = require('./src/utils/logs')
const configorama = require('./src')

// Parse command line arguments
const argv = minimist(process.argv.slice(2), {
  string: ['output', 'o', 'format', 'f'],
  boolean: ['help', 'h', 'version', 'v', 'debug', 'allow-unknown', 'allow-undefined', 'list', 'info', 'verify'],
  alias: {
    h: 'help',
    v: 'verify',
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
  configorama [options] <file>

Options:
  -h, --help                Show this help message
  -v, --version             Show version number
  -o, --output <file>       Write output to file instead of stdout
  -f, --format <format>     Output format: json, yaml, or js (default: json)
  -d, --debug               Enable debug mode
  -i, --info                Show info about the config
  -v, --verify              Verify the config
  --allow-unknown           Allow unknown variables to pass through
  --allow-undefined         Allow undefined values in the final output

Examples:
  configorama config.yml
  configorama --info config.yml
  configorama --format yaml config.json
  configorama --output resolved.json config.yml
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

// Check for input file
const inputFile = argv._[0]
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

// Process the configuration
configorama(inputFile, options)
  .then((config) => {
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
  .catch((error) => {
    console.error(`Error processing configuration: ${inputFile}`)
    console.error(error.message)
    if (argv.debug) {
      console.error(error.stack)
    }
    process.exit(1)
  })