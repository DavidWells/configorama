const Configorama = require('../lib')
const path = require('path')

const yamlFile = path.join(__dirname, 'manualYaml.yml')
const configorama = new Configorama(yamlFile)

console.time('perf')
configorama.init({}).then((result) => {
  console.log(result)
  console.timeEnd('perf')
})
