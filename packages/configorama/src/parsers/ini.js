const INI = require('ini')

function parse(contents) {
  try {
    return JSON.parse(JSON.stringify(INI.parse(contents)))
  } catch (e) {
    throw new Error(e)
  }
}

function dump(object) {
  try {
    return INI.stringify(object)
  } catch (e) {
    throw new Error(e)
  }
}

function toYaml(iniContents) {
  try {
    return require('./yaml').dump(parse(iniContents))
  } catch (e) {
    throw new Error(e)
  }
}

function toJson(iniContents) {
  try {
    return JSON.stringify(parse(iniContents))
  } catch (e) {
    throw new Error(e)
  }
}

module.exports = {
  parse: parse,
  dump: dump,
  toYaml: toYaml,
  toYml: toYaml,
  toJson: toJson
}