const JSON5 = require('json5')
const TOML = require('./toml')
const YAML = require('./yaml')
const { createSafeWrapper, createFormatConverter } = require('../utils/safeParser')

const parse = createSafeWrapper(JSON5.parse.bind(JSON5))
const dump = createSafeWrapper(JSON5.stringify.bind(JSON5))
const toYaml = createFormatConverter(parse, YAML.dump)
const toToml = createFormatConverter(parse, TOML.dump)

module.exports = {
  parse: parse,
  dump: dump,
  stringify: JSON.stringify,
  toYaml: toYaml,
  toYml: toYaml,
  toToml: toToml
}
