
function delay(ms) {
  return new Promise((resolve) => {
    console.log('delay', ms)
    setTimeout(() => resolve('async-ts-value'), ms)
  })
}

export default async function fetchSecretsFromRemoteStore(config) {
  console.log('ESM async function called with:', config)
  await delay(200)
  return 'async-esm-value'
}