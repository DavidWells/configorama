
function delay(ms) {
  return new Promise((resolve) => {
    console.log('delay', ms)
    setTimeout(() => resolve('async-ts-value'), ms)
  })
}

/**
 * JavaScript async function to fetch secrets from remote store
 * @param {import('../../index').ConfigContext} ctx - The config context
 * @returns {Promise<string>} The secrets
 */
async function fetchSecretsFromRemoteStore(ctx) {
  console.log('JavaScript async function called with:', ctx)
  await delay(200)
  return 'async-js-value'
}

module.exports = fetchSecretsFromRemoteStore