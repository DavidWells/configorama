// Resolves ${sls:stage} the way Serverless (osls) does: --stage, else provider.stage, else 'dev'
// Other sls: addresses (instanceId) aren't matched, so they stay unknown types for Serverless to fill in

const slsStageSyntax = RegExp(/^sls:stage$/)

/**
 * Stage Serverless deploys to. A provider.stage that is itself a variable (${opt:stage, 'dev'})
 * is returned as a self reference so it resolves to that variable's value.
 * @param {string} variableString - sls:stage
 * @param {Record<string, any>} options - Parsed CLI options
 * @param {Record<string, any>} config - The config being resolved
 * @returns {Promise<string>}
 */
function getValueFromSls(variableString, options, config) {
  if (options && options.stage !== undefined && options.stage !== null) {
    return Promise.resolve(options.stage)
  }
  const provider = config && config.provider
  if (provider && provider.stage !== undefined && provider.stage !== null) {
    return Promise.resolve('${self:provider.stage}')
  }
  return Promise.resolve('dev')
}

module.exports = {
  type: 'sls',
  source: 'config',
  prefix: 'sls',
  // No prefix registration: sls: addresses other than stage must remain unknown types (passthrough)
  prefixes: [],
  syntax: '${sls:stage}',
  description: 'Resolves the Serverless stage: --stage, else provider.stage, else "dev". Example: ${sls:stage}',
  match: slsStageSyntax,
  resolver: getValueFromSls
}
