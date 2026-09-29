// Marks an unknown variable kept as text. It starts with a private-use char (U+E000) so no
// config value can look like it
const PASSTHROUGH_PREFIX = '\uE000passthrough'
const PASSTHROUGH_PATTERN = new RegExp(PASSTHROUGH_PREFIX, 'g')

/**
 * Encode unknown variable for passthrough
 */
function encodeUnknown(v) {
  return `${PASSTHROUGH_PREFIX}[_[${Buffer.from(v).toString('base64')}]_]`
}

function hasEncodedUnknown(value) {
  return PASSTHROUGH_PATTERN.test(value)
}

/**
 * Decode unknown variable from passthrough
 */
function decodeUnknown(rawValue) {
  const x = findUnknownValues(rawValue)
  let val = rawValue.replace(PASSTHROUGH_PATTERN, '')
  if (x.length) {
    x.forEach(({ match, value }) => {
      const decodedValue = Buffer.from(value, 'base64').toString('utf8')
      val = val.replace(match, decodedValue)
    })
  }
  return val
}

/**
 * Find base64 encoded unknown values in text
 */
function findUnknownValues(text) {
  const base64WrapperRegex = /\[_\[([A-Za-z0-9+/=\s]*)\]_\]/g
  let matches
  const links = []
  while ((matches = base64WrapperRegex.exec(text)) !== null) {
    if (matches.index === base64WrapperRegex.lastIndex) {
      base64WrapperRegex.lastIndex++
    }
    links.push({
      match: matches[0],
      value: matches[1],
    })
  }
  return links
}

module.exports = {
  PASSTHROUGH_PREFIX,
  PASSTHROUGH_PATTERN,
  hasEncodedUnknown,
  encodeUnknown,
  decodeUnknown,
  findUnknownValues
} 