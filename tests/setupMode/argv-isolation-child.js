// Child script for argvIsolation.test.js - resolves a config as a library caller.
// Invoked as: node argv-isolation-child.js [--setup] [--opt-in]
const path = require('path')
const configorama = require('../../src')

const configFile = path.join(__dirname, 'no-vars.yml')
const settings = process.argv.includes('--opt-in') ? { setup: true } : {}

configorama(configFile, settings).then((config) => {
  console.log(JSON.stringify(config))
})
