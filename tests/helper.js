const fs = require('fs')
const path = require('path')
const YAML = require('../lib/parsers/yaml')
const Variables = require('../lib')

function getConfigObject(filePath) {
  const ymlContents = fs.readFileSync(filePath, 'utf-8')
  const dirname = path.dirname(filePath)
  const ymlObject = YAML.parse(ymlContents)
  const vars = new Variables(ymlObject, dirname)
  return {
    ymlObject: ymlObject,
    ymlContents: ymlContents,
    vars: vars,
  }
}

module.exports = getConfigObject
