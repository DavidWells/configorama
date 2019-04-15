const JSON5 = require('json5')
const TOML = require('./toml')
const YAML = require('./yaml')

function parse(jsonContents) {
  return JSON5.parse(jsonContents)
}

function dump(object) {
  return JSON5.stringify(object)
}

function toYaml(ymlContents) {
  let yml
  try {
    yml = YAML.dump(parse(ymlContents))
  } catch (e) {
    throw new Error(e)
  }
  return yml
}

function toToml(json) {
  let toml
  try {
    toml = TOML.dump(parse(json))
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
