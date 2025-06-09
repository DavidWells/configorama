const INI = require('ini')
const YAML = require('./yaml')
const JSON = require('./json5')

function parse(contents) {
  let object
  try {
    object = INI.parse(contents)
  } catch (e) {
    throw new Error(e)
  }
  return object
}

function dump(object) {
  let ini
  try {
    ini = INI.stringify(object)
  } catch (e) {
    throw new Error(e)
  }
  return ini
}

function toYaml(iniContents) {
  let yml
  try {
    yml = YAML.dump(parse(iniContents))
  } catch (e) {
    throw new Error(e)
  }
  return yml
}

function toJson(iniContents) {
  let json
  try {
    json = JSON.stringify(parse(iniContents))
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