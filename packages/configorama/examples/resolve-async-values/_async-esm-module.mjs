
function delay(ms) {
  return new Promise((resolve) => {
    console.log('delay', ms)
    setTimeout(() => resolve('async-ts-value'), ms)
  })
}

/**
 * ESM async function to fetch secrets from remote store
 * @param {import('../../index').ConfigContext} ctx - The config context
 * @returns {Promise<string>} The secrets
 */
export default async function fetchSecretsFromRemoteStore(ctx) {
  console.log('ESM async function called with:', ctx)
  await delay(200)
  return 'async-esm-value'
}