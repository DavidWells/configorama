const YAML = require('js-yaml')
const TOML = require('./toml')
const JSON = require('./json5')

function parse(ymlContents) {
  // Get document, or throw exception on error
  let ymlObject = {}
  try {
    ymlObject = YAML.safeLoad(ymlContents)
  } catch (e) {
    throw new Error(e)
  }
  return ymlObject
}

function dump(object) {
  let yml
  try {
    yml = YAML.safeDump(object, {
      noRefs: true
    })
  } catch (e) {
    throw new Error(e)
  }
  return yml
}

function toToml(ymlContents) {
  let toml
  try {
    toml = TOML.dump(parse(ymlContents))
  } catch (e) {
    throw new Error(e)
  }
  return toml
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
  toToml: toToml,
  toJson: toJson
}
