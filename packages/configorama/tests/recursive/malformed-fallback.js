const path = require('path')
const fs = require('fs')
const YAML = require('../../src/parsers/yaml')

// Read and parse the YAML file
const configFile = path.join(__dirname, 'recursive-two.yml')
const fileContents = fs.readFileSync(configFile, 'utf-8')
const configObject = YAML.parse(fileContents)

console.log('before preprocess', configObject)

// Now test the actual preprocessing through Configorama
const Configorama = require('../../src/main')

async function test() {
  const instance = new Configorama(configFile, {})
  await instance.init({})
  console.log('after preprocess', instance.config)
}

test()
