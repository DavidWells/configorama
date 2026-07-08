/* NDJSON protocol helpers for daemon/client messages.
   Validates request shape and caps line length before parsing. */
const { ProtocolError } = require('./errors')

const MAX_LINE_BYTES = 1024 * 1024
const REQUEST_TYPES = new Set(['get', 'set', 'ping', 'clear', 'stats', 'shutdown'])

/**
 * @param {object} message - Message object
 * @returns {string}
 */
function encode(message) {
  return `${JSON.stringify(message)}\n`
}

/**
 * @param {string|Buffer} line - NDJSON line
 * @returns {object}
 */
function decode(line) {
  const text = Buffer.isBuffer(line) ? line.toString('utf8') : String(line)
  if (Buffer.byteLength(text) > MAX_LINE_BYTES) throw new ProtocolError('Protocol message too large.')
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new ProtocolError('Malformed JSON protocol message.')
  }
}

/**
 * @param {object} req - Request object
 * @returns {object}
 */
function validateRequest(req) {
  if (!req || typeof req !== 'object' || !REQUEST_TYPES.has(req.type)) {
    throw new ProtocolError('Unknown protocol request type.')
  }
  if ((req.type === 'get' || req.type === 'set') && (!req.key || !req.scope)) {
    throw new ProtocolError(`${req.type} request requires key and scope.`)
  }
  if (req.type === 'set') {
    if (typeof req.value !== 'string') throw new ProtocolError('set request requires string value.')
    if (!Number.isInteger(req.ttlSeconds) || req.ttlSeconds <= 0) throw new ProtocolError('set request requires positive ttlSeconds.')
  }
  return req
}

module.exports = { MAX_LINE_BYTES, encode, decode, validateRequest }
