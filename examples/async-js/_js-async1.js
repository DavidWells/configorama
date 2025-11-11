
function delay(ms) {
  return new Promise((resolve) => {
    console.log('delay', ms)
    setTimeout(() => resolve('async-ts-value'), ms)
  })
}

async function fetchSecretsFromRemoteStore(config) {
  console.log('JavaScript async function called with:', config)
  await delay(200)
  return 'async-js-value'
}

module.exports = fetchSecretsFromRemoteStore