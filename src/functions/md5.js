const crypto = require('crypto')

/**
 * md5 computes the MD5 hash of a given string and encodes it with hexadecimal digits.
 * @param  {string} string - value to hash via md5
 * @return {string} the MD5 hashed value
 */
module.exports = function md5(string) {
  if (typeof string !== 'string') {
    throw new Error('value must be string for md5 hash')
  }
  return crypto.createHash('md5').update(string).digest('hex')
}
