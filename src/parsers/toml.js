const TOML = require('@iarna/toml')
const YAML = require('./yaml')
const JSON = require('./json5')

function parse(contents) {
  let object
  try {
    object = TOML.parse(contents)
  } catch (e) {
    throw new Error(e)
  }
  return object
}

function dump(object) {
  let toml
  try {
    toml = TOML.stringify(object)
  } catch (e) {
    throw new Error(e)
  }
  return toml
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

function toJson(tomlContents) {
  let json
  try {
    json = JSON.dump(parse(tomlContents))
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
