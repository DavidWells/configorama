const fs = require('node:fs')
const path = require('node:path')
const dotenv = require('dotenv')
const diagnostics = require('./diagnostics')
/** @param {Object} context @param {Object} settings @param {string} stage */
module.exports = function loadDotenv(context, settings, stage) {
  const mode = settings.dotEnvMode || 'process'
  if (mode !== 'process' && mode !== 'isolated') throw new Error('dotEnvMode must be process or isolated')
  const logger = diagnostics(settings)
  logger.info('Loading dotenv environment files')
  logger.debug('Dotenv diagnostics enabled; variable values are omitted')
  const files = [`.env.${stage}.local`, ...(stage === 'test' ? [] : ['.env.local']), `.env.${stage}`, '.env']
  const env = { ...context.env }
  let found = 0
  for (const name of files) {
    const file = path.join(context.configRoot, name)
    if (!fs.existsSync(file)) continue
    const values = dotenv.parse(fs.readFileSync(file))
    for (const key of Object.keys(values)) if (!Object.prototype.hasOwnProperty.call(env, key)) env[key] = values[key]
    found++
  }
  logger.debug(`Loaded ${found} dotenv files`)
  context.env = Object.freeze(env)
  if (mode === 'process') Object.assign(process.env, env)
  return env
}
