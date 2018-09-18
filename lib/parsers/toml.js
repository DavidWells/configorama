const TOML = require('@iarna/toml')
const YAML = require('./yaml')

function parse(tomlContents) {
  return TOML.parse(tomlContents)
}

function dump(object) {
  return TOML.stringify(object)
}

function toYaml(tomlContents) {
  const object = parse(tomlContents)
  let yml
  try {
    yml = YAML.dump(object)
  } catch (e) {
    throw new Error(e)
  }
  return yml
}

module.exports = {
  parse: parse,
  dump: dump,
  toYaml: toYaml,
  toYml: toYaml
}
