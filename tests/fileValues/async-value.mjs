// ESM async value for file reference testing
function delay(t, v) {
  return new Promise((resolve) => setTimeout(resolve.bind(null, v), t))
}

async function fetchSecretsFromRemoteStore(config, x, y, z) {
  await delay(10)
  return 'esmAsyncVal'
}

export default fetchSecretsFromRemoteStore