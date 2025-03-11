module.exports = (config) => {
  // simulate remote config fetch
  return fetchSecretsFromRemoteStore()
}

function fetchSecretsFromRemoteStore(x, y, z) {
  console.log(x, y, z)
  return delay(0).then(() => {
    console.log('delay 10')
    return Promise.resolve('asyncval')
  })
}

function delay(t, v) {
  return new Promise((resolve) => {
    setTimeout(resolve.bind(null, v), t)
  })
}
