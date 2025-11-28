const TOML = require('@iarna/toml')
const YAML = require('./yaml')
const JSON = require('./json5')
const { createSafeWrapper, createFormatConverter } = require('../utils/safeParser')

const parse = createSafeWrapper(TOML.parse.bind(TOML))
const dump = createSafeWrapper(TOML.stringify.bind(TOML))
const toYaml = createFormatConverter(parse, YAML.dump)
const toJson = createFormatConverter(parse, JSON.dump)

module.exports = {
  parse: parse,
  dump: dump,
  toYaml: toYaml,
  toYml: toYaml,
  toJson: toJson
}
