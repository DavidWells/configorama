const fs = require('fs')
const path = require('path')
const minimist = require('minimist')

const TOML = require('../lib/parsers/toml')
const YAML = require('../lib/parsers/yaml')
const Variables = require('../lib')
const args = minimist(process.argv.slice(2))

const outputDirectory = path.join(__dirname, 'output')

const filename = path.join(__dirname, '_netlify.yml')
const ymlContents = fs.readFileSync(filename, 'utf-8')

const dir = path.join(__dirname)

const obj = YAML.parse(ymlContents)

const vars = new Variables(obj, dir)

function variables(options) {
  vars.init(options).then((populatedConfig) => {
    console.log('data', populatedConfig)
    const newTomlContents = TOML.dump(populatedConfig)
    const newYmlContents = YAML.dump(populatedConfig)
    const newTomlFile = path.join(outputDirectory, 'yml-netlify.toml')
    const newYmlFile = path.join(outputDirectory, 'yaml.yml')
    fs.writeFileSync(newTomlFile, newTomlContents)
    console.log('OUTPUT', newTomlFile)
    fs.writeFileSync(newYmlFile, newYmlContents)
  })
}

function logit(options) {
  vars.init(options).then((populatedConfig) => {
    console.log('data', populatedConfig)
  })
}

function doIt(options) {
  return vars.init(options)
}

// logit(args)

module.exports = doIt
