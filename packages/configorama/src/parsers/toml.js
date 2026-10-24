// @iarna/toml loaded on demand so non-TOML configs skip its require cost

function parse(contents) {
  try {
    return require('@iarna/toml').parse(contents)
  } catch (e) {
    throw new Error(e)
  }
}

function dump(object) {
  try {
    return require('@iarna/toml').stringify(object)
  } catch (e) {
    throw new Error(e)
  }
}

function toYaml(tomlContents) {
  try {
    return require('./yaml').dump(parse(tomlContents))
  } catch (e) {
    throw new Error(e)
  }
}

function toJson(tomlContents) {
  try {
    return require('./json5').dump(parse(tomlContents))
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
