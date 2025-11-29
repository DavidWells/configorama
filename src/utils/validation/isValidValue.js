const isEmpty = require('lodash.isempty')

module.exports = function isValidValue(val) {
  if (typeof val === 'object' && (val.hasOwnProperty('__internal_only_flag') || val.hasOwnProperty('__internal_metadata'))) {
    return false
  }
  return val !== null && typeof val !== 'undefined' && !(typeof val === 'object' && isEmpty(val))
}
