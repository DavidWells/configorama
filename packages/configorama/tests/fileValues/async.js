module.exports = (config, x, y, z) => {
  if (process.env.TEST_VERBOSE) console.log('async fn called withconfig', config)
  if (process.env.TEST_VERBOSE) console.log(`x`, x)
  if (process.env.TEST_VERBOSE) console.log(`y`, y)
  if (process.env.TEST_VERBOSE) console.log(`z`, z)
  // simulate remote config fetch
  return fetchSecretsFromRemoteStore(x, y, z)
}

function fetchSecretsFromRemoteStore(x, y, z) {
  return delay(0).then(() => {
    if (process.env.TEST_VERBOSE) console.log('delay 10')
    return Promise.resolve('asyncval')
  })
}

function delay(t, v) {
  return new Promise((resolve) => {
    setTimeout(resolve.bind(null, v), t)
  })
}
