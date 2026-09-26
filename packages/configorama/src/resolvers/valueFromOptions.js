// Resolves values from CLI option flags
// Matches ${opt:FLAG_NAME} and ${option:FLAG_NAME} syntax with optional fallback values
const dotProp = require('dot-prop')
const { bracketsToDots } = require('../utils/paths/bracketsToDots')

const optRefSyntax = RegExp(/^(?:opt|option):/g)

/**
 * Value of a CLI option. A flat key ('aws.region') wins; otherwise a dotted or bracketed
 * path reads nested options, as --aws.region=x parses to { aws: { region: 'x' } }
 * @param {string} variableString - e.g. opt:stage or opt:aws.region
 * @param {Record<string, any>} options - Parsed CLI options
 * @returns {Promise<any>} The option value, or undefined
 */
function getValueFromOptions(variableString, options) {
  const requestedOption = variableString.split(':')[1]
  if (!options || requestedOption === undefined) return Promise.resolve(undefined)
  if (Object.prototype.hasOwnProperty.call(options, requestedOption)) {
    return Promise.resolve(options[requestedOption])
  }
  const optionPath = bracketsToDots(requestedOption)
  const valueToPopulate = /[.]/.test(optionPath) ? dotProp.get(options, optionPath) : options[optionPath]
  return Promise.resolve(valueToPopulate)
}

module.exports = {
  type: 'options',
  source: 'user',
  prefix: 'opt',
  prefixes: ['opt', 'option'],
  syntax: '${option:flagName}',
  description: 'Resolves CLI option flags. Examples: ${option:stage}, ${opt:stage}, ${option:other, "fallbackValue"}',
  match: optRefSyntax,
  resolver: getValueFromOptions
}
