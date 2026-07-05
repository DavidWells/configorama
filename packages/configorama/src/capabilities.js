// Machine-readable description of the configorama CLI contract for agents.
// Lists commands, views, output formats, error codes, exit codes, and flags so
// an agent can read the contract from the tool instead of guessing or reading docs.

const { ERROR_CODES } = require('./errors')
const pkg = require('../package.json')

const SCHEMA_VERSION = 1

const VIEWS = ['requirements', 'audit', 'graph']

/**
 * Build the capabilities contract object.
 * @returns {object} stable, deterministic description of the CLI surface
 */
function buildCapabilities() {
  return {
    name: 'configorama',
    version: pkg.version,
    schemaVersion: SCHEMA_VERSION,
    commands: [
      { name: 'resolve', usage: 'configorama <file> [path]', summary: 'Resolve a config file and print the result (default command).' },
      { name: 'inspect', usage: 'configorama inspect <file> [--view requirements|audit|graph]', summary: 'Introspect a config without resolving it; returns the full model or one view.' },
      { name: 'setup', usage: 'configorama setup <file>', summary: 'Run the interactive setup wizard (experimental).' },
      { name: 'capabilities', usage: 'configorama capabilities', summary: 'Print this machine-readable contract.' },
    ],
    // Hidden back-compat commands that map to an inspect view. They still run if
    // typed, but inspect is the documented surface.
    aliases: [
      { name: 'requirements', mapsTo: 'inspect --view requirements', summary: 'Inputs a config needs.' },
      { name: 'audit', mapsTo: 'inspect --view audit', summary: 'Risky references.' },
      { name: 'graph', mapsTo: 'inspect --view graph', summary: 'Dependency graph of variables and files.' },
    ],
    views: VIEWS,
    formats: {
      resolve: ['json', 'yaml', 'js', 'esm'],
      graph: ['json', 'mermaid', 'dot'],
    },
    errorCodes: ERROR_CODES,
    exitCodes: [
      { code: 0, meaning: 'Success.' },
      { code: 1, meaning: 'Error. The category is in the JSON `error.code` field (use --error-format json).' },
    ],
    flags: [
      { flag: '--output, -o <file>', summary: 'Write output to a file instead of stdout.' },
      { flag: '--format, -f <format>', summary: 'Output format (see formats).' },
      { flag: '--view <view>', summary: 'inspect view: requirements, audit, or graph.' },
      { flag: '--raw, -r', summary: 'Print extracted scalar values without JSON quoting.' },
      { flag: '--error-format <json|human>', summary: 'Error output format on stderr (json is machine-readable).' },
      { flag: '--param <key=value>', summary: 'Pass parameter values (repeatable).' },
      { flag: '--safe', summary: 'Block executable/config-mutating references during resolution.' },
      { flag: '--safe-root <dir>', summary: 'Restrict file/text references to an allowed root.' },
      { flag: '--allow-unknown', summary: 'Allow unknown variables to pass through.' },
      { flag: '--allow-undefined', summary: 'Allow undefined values in the final output.' },
    ],
  }
}

module.exports = { SCHEMA_VERSION, VIEWS, buildCapabilities }
