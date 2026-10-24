const JSON5 = require('json5')

function parse(contents) {
  try {
    return JSON5.parse(contents)
  } catch (e) {
    throw new Error(e)
  }
}

function dump(object) {
  try {
    return JSON5.stringify(object)
  } catch (e) {
    throw new Error(e)
  }
}

function toYaml(jsonContents) {
  try {
    return require('./yaml').dump(parse(jsonContents))
  } catch (e) {
    throw new Error(e)
  }
}

function toToml(jsonContents) {
  try {
    return require('./toml').dump(parse(jsonContents))
  } catch (e) {
    throw new Error(e)
  }
}

module.exports = {
  parse: parse,
  dump: dump,
  stringify: JSON.stringify,
  toYaml: toYaml,
  toYml: toYaml,
  toToml: toToml
}
