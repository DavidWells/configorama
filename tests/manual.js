const path = require('path')
const configorama = require('../lib')

const yamlFile = path.join(__dirname, 'manualYaml.yml')

/* async invoke */
;(async () => {
  console.time('asyncPerf')
  const conf = await configorama(yamlFile)
  console.log('Async', conf)
  console.timeEnd('asyncPerf')
})()

/* sync invoke */
console.time('syncPerf')
const confSync = configorama.sync(yamlFile)
console.log('confSync', confSync)
console.timeEnd('syncPerf')
