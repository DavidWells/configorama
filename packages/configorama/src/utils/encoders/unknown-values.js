const opaque = require('./opaque')
const PASSTHROUGH_PREFIX = '__CFG_U_'
function encodeUnknown(value) { return opaque.encode('U', value) }
function hasEncodedUnknown(value) { return opaque.has(value, 'U') }
function decodeUnknown(value) { return opaque.decode(value, 'U') }
function findUnknownValues(value) {
  return opaque.find(value, 'U').map(record => ({ match: record.match, value: Buffer.from(record.value).toString('base64') }))
}
module.exports = { PASSTHROUGH_PREFIX, hasEncodedUnknown, encodeUnknown, decodeUnknown, findUnknownValues }
