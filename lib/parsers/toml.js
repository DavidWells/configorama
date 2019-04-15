const TOML = require('@iarna/toml')
const YAML = require('./yaml')
const JSON = require('./json5')

function parse(tomlContents) {
  return TOML.parse(tomlContents)
}

function dump(object) {
  return TOML.stringify(object)
}

function toYaml(tomlContents) {
  let yml
  try {
    yml = YAML.dump(parse(tomlContents))
  } catch (e) {
    throw new Error(e)
  }
  return yml
}

function toJson(ymlContents) {
  let json
  try {
    json = JSON.dump(parse(ymlContents))
  } catch (e) {
    throw new Error(e)
  }
  return json
}

module.exports = {
  parse: parse,
  dump: dump,
  toYaml: toYaml,
  toYml: toYaml,
  toJson: toJson
}
