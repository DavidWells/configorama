const MARKER = '__CONFIGORAMA_FILTER_ARG__'

class ResolvedFilterArg {
  constructor(value) {
    this.value = value
    this.__resolvedFilterArg = true
  }

  toString() {
    return String(this.value)
  }

  valueOf() {
    return this.value
  }
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeBase64Url(value) {
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  return Buffer.from(base64, 'base64').toString('utf8')
}

function encodeFilterArg(value) {
  return `${MARKER}:${encodeBase64Url(JSON.stringify(value))}`
}

function isEncodedFilterArg(value) {
  return typeof value === 'string' && value.startsWith(`${MARKER}:`)
}

function decodeFilterArg(value) {
  if (!isEncodedFilterArg(value)) return value
  const encoded = value.slice(MARKER.length + 1)
  return new ResolvedFilterArg(JSON.parse(decodeBase64Url(encoded)))
}

function isResolvedFilterArg(value) {
  return Boolean(value && value.__resolvedFilterArg)
}

function unwrapFilterArg(value) {
  return isResolvedFilterArg(value) ? value.value : value
}

module.exports = {
  ResolvedFilterArg,
  decodeFilterArg,
  encodeFilterArg,
  isEncodedFilterArg,
  isResolvedFilterArg,
  unwrapFilterArg,
}
