// Parses .env file contents into a flat key/value object
// Values keep their raw text so configorama can resolve ${...} references in them
const dotenv = require('dotenv')

/**
 * @param {string} contents - Raw .env file text
 * @returns {Object} Flat map of KEY -> raw string value
 */
function parse(contents) {
  return dotenv.parse(contents)
}

module.exports = { parse }
