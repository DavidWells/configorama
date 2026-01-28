/**
 * @typedef {Object} ParserFunction
 * @property {Function} parse - Parse string content into object
 * @property {Function} stringify - Convert object to string format
 */

const json = require('./json5')
const toml = require('./toml')
const yaml = require('./yaml')
const ini = require('./ini')
const hcl = require('./hcl')
const markdown = require('./markdown')

/**
 * Collection of format parsers for different config file types
 * @type {Object.<string, ParserFunction>}
 */
module.exports = {
  json: json,
  toml: toml,
  yaml: yaml,
  ini: ini,
  hcl: hcl,
  markdown: markdown
}