const MARKER = '__CONFIGORAMA_FILTER_ARG__'
// Terminator after the base64url payload. base64url uses [A-Za-z0-9-_], so `~` never appears inside the
// payload — it cleanly separates the encoded value from any literal text glued after it in an argument
// (e.g. `${b}--` encodes to `<marker>~--`, so the `--` stays a literal suffix instead of corrupting the payload).
const TERMINATOR = '~'

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
  return `${MARKER}:${encodeBase64Url(JSON.stringify(value))}${TERMINATOR}`
}

function isEncodedFilterArg(value) {
  return typeof value === 'string' && value.startsWith(`${MARKER}:`)
}

function decodeFilterArg(value) {
  if (!isEncodedFilterArg(value)) return value
  const rest = value.slice(MARKER.length + 1)
  // Separate the base64url payload from any literal text glued after the terminator (`${b}--` -> value + "--").
  const termIdx = rest.indexOf(TERMINATOR)
  const payload = termIdx === -1 ? rest : rest.slice(0, termIdx)
  const suffix = termIdx === -1 ? '' : rest.slice(termIdx + 1)
  let decoded
  try {
    decoded = JSON.parse(decodeBase64Url(payload))
  } catch (err) {
    // Corrupted/legacy payload — fall back to the decoded string rather than throwing a raw JSON error.
    decoded = decodeBase64Url(payload)
  }
  // A glued literal suffix forces a string result (the value is being concatenated with text anyway).
  if (suffix) return new ResolvedFilterArg(String(decoded) + suffix)
  return new ResolvedFilterArg(decoded)
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
