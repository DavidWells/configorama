
function delay(ms) {
  return new Promise((resolve) => {
    console.log('delay', ms)
    setTimeout(() => resolve('async-ts-value'), ms)
  })
}

/**
 * JavaScript async function to fetch secrets from remote store
 * @param {string} foo - First arg from YAML
 * @param {object} baz - Second arg from YAML
 * @param {import('../../index').ConfigContext} ctx - The config context (always last)
 * @returns {Promise<string>} The secrets
 */
async function fetchSecretsFromRemoteStore(foo, baz, ctx) {
  console.log('foo', foo)
  console.log('baz', baz)
  console.log('options', ctx.options)
  console.log('ctx', ctx)
  await delay(200)
  return 'async-js-value'
}

module.exports = fetchSecretsFromRemoteStore