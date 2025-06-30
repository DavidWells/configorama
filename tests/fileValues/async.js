module.exports = (config, x, y, z) => {
  console.log('async fn called withconfig', config)
  console.log(`x`, x)
  console.log(`y`, y)
  console.log(`z`, z)
  // simulate remote config fetch
  return fetchSecretsFromRemoteStore(x, y, z)
}

function fetchSecretsFromRemoteStore(x, y, z) {
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
