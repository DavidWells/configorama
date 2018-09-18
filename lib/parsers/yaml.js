const TOML = require('./toml')
const YAML = require('js-yaml')

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
  const object = parse(ymlContents)
  let toml
  try {
    toml = TOML.dump(object)
  } catch (e) {
    throw new Error(e)
  }
  return toml
}

module.exports = {
  parse: parse,
  dump: dump,
  toToml: toToml
}
