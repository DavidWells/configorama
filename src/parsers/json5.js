const JSON5 = require('json5')
const TOML = require('./toml')
const YAML = require('./yaml')

function parse(contents) {
  let jsonObject
  try {
    jsonObject = JSON5.parse(contents)
  } catch (e) {
    throw new Error(e)
  }
  return jsonObject
}

function dump(object) {
  let json
  try {
    json = JSON5.stringify(object)
  } catch (e) {
    throw new Error(e)
  }
  return json
}

function toYaml(jsonContents) {
  let yml
  try {
    yml = YAML.dump(parse(jsonContents))
  } catch (e) {
    throw new Error(e)
  }
  return yml
}

function toToml(jsonContents) {
  let toml
  try {
    toml = TOML.dump(parse(jsonContents))
  } catch (e) {
    throw new Error(e)
  }
  return toml
}

module.exports = {
  parse: parse,
  dump: dump,
  toYaml: toYaml,
  toYml: toYaml,
  toToml: toToml
}
