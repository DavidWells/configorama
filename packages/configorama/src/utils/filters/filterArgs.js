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

// One encoded marker: `<MARKER>:<base64url>~`. base64url is [A-Za-z0-9-_], so the class and the `~`
// terminator can't be confused for payload. Global so a single arg holding several markers (a compose
// used as one arg, e.g. `${b}-${d}`) is fully decoded.
const MARKER_PATTERN = new RegExp(`${MARKER}:([A-Za-z0-9\\-_]*)${TERMINATOR}`, 'g')

function decodePayload(payload) {
  const raw = decodeBase64Url(payload)
  try {
    return JSON.parse(raw)
  } catch (err) {
    // Corrupted/legacy payload — fall back to the decoded string rather than throwing a raw JSON error.
    return raw
  }
}

function decodeFilterArg(value) {
  if (!isEncodedFilterArg(value)) return value
  let lastIndex = 0
  let markerCount = 0
  let literalSeen = false
  let single
  let out = ''
  let match
  MARKER_PATTERN.lastIndex = 0
  while ((match = MARKER_PATTERN.exec(value)) !== null) {
    if (match.index > lastIndex) literalSeen = true // literal text before this marker
    out += value.slice(lastIndex, match.index)
    single = decodePayload(match[1])
    out += String(single)
    markerCount += 1
    lastIndex = MARKER_PATTERN.lastIndex
  }
  if (lastIndex < value.length) {
    literalSeen = true
    out += value.slice(lastIndex)
  }
  // Exactly one marker and no surrounding literal: preserve the decoded value's type (number, etc.).
  if (markerCount === 1 && !literalSeen) return new ResolvedFilterArg(single)
  return new ResolvedFilterArg(out)
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
