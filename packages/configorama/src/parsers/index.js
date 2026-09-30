/**
 * @typedef {Object} ParserFunction
 * @property {Function} parse - Parse string content into object
 * @property {Function} stringify - Convert object to string format
 */

/**
 * Collection of format parsers for different config file types. Each parser
 * loads on first access so reading one format never pays for the others.
 * @type {Object.<string, ParserFunction>}
 */
module.exports = {
  get json() { return require('./json5') },
  get toml() { return require('./toml') },
  get yaml() { return require('./yaml') },
  get ini() { return require('./ini') },
  get hcl() { return require('./hcl') },
  get markdown() { return require('./markdown') }
}
