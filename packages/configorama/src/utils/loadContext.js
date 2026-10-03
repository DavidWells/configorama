const path = require('node:path')
const cloneDeep = require('./lodash').cloneDeep
/** @param {string|Object} input @param {Object} settings */
module.exports = function loadContext(input, settings) {
  const cwd = process.cwd()
  const configRoot = path.resolve(cwd, settings.configDir || (typeof input === 'string' ? path.dirname(path.resolve(cwd, input)) : cwd))
  return {
    cwd, configRoot, env: Object.freeze({ ...process.env }), options: cloneDeep(settings.options || {}),
    origins: new Map(), modules: new Map(), budget: null,
  }
}
