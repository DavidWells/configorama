const INI = require('ini')
const YAML = require('./yaml')
const JSON5 = require('./json5')
const { createSafeWrapper, createFormatConverter } = require('../utils/safeParser')

// INI parse needs extra JSON round-trip
function parseIni(contents) {
  return JSON.parse(JSON.stringify(INI.parse(contents)))
}

const parse = createSafeWrapper(parseIni)
const dump = createSafeWrapper(INI.stringify.bind(INI))
const toYaml = createFormatConverter(parse, YAML.dump)
const toJson = createFormatConverter(parse, JSON.stringify)

module.exports = {
  parse: parse,
  dump: dump,
  toYaml: toYaml,
  toYml: toYaml,
  toJson: toJson
}