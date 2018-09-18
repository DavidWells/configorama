module.exports = (config) => {
  // simulate remote config fetch
  return fetchSecretsFromRemoteStore()
}

function fetchSecretsFromRemoteStore() {
  return delay(1000).then(() => {
    return Promise.resolve('asyncval')
  })
}

function delay(t, v) {
  return new Promise((resolve) => {
    setTimeout(resolve.bind(null, v), t)
  })
}
