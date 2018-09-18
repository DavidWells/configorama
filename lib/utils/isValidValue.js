const _ = require('lodash')

module.exports = function isValidValue(val) {
  return val !== null && typeof val !== 'undefined' && !(typeof val === 'object' && _.isEmpty(val))
}
