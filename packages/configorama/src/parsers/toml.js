// @iarna/toml loaded on demand so non-TOML configs skip its require cost

function parse(contents) {
  let object
  try {
    object = require('@iarna/toml').parse(contents)
  } catch (e) {
    throw new Error(e)
  }
  return object
}

function dump(object) {
  let toml
  try {
    toml = require('@iarna/toml').stringify(object)
  } catch (e) {
    throw new Error(e)
  }
  return toml
}

function toYaml(tomlContents) {
  let yml
  try {
    yml = require('./yaml').dump(parse(tomlContents))
  } catch (e) {
    throw new Error(e)
  }
  return yml
}

function toJson(tomlContents) {
  let json
  try {
    json = require('./json5').dump(parse(tomlContents))
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
