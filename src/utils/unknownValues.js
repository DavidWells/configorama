/**
 * Encode unknown variable for passthrough
 */
function encodeUnknown(v) {
  return `>passthrough[_[${Buffer.from(v).toString('base64')}]_]`
}

/**
 * Decode unknown variable from passthrough
 */
function decodeUnknown(rawValue) {
  const x = findUnknownValues(rawValue)
  let val = rawValue.replace(/>passthrough/g, '')
  if (x.length) {
    x.forEach(({ match, value }) => {
      const decodedValue = Buffer.from(value, 'base64').toString('ascii')
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
  encodeUnknown,
  decodeUnknown,
  findUnknownValues
} 