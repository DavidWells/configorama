const path = require('path')
const Configorama = require('../lib')

const yamlFile = path.join(__dirname, 'manualYaml.yml')

/* async invoke */
;(async () => {
  console.time('asyncPerf')
  const configorama = new Configorama(yamlFile)
  const conf = await configorama.init({})
  console.log('Async', conf)
  console.timeEnd('asyncPerf')
})()

/* sync invoke */
console.time('syncPerf')
const confSync = Configorama.sync(yamlFile)
console.log('confSync', confSync)
console.timeEnd('syncPerf')
