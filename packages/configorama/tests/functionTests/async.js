module.exports = (config) => {
  // simulate remote config fetch
  return fetchSecretsFromRemoteStore()
}

function fetchSecretsFromRemoteStore() {
  return delay(0).then(() => {
    if (process.env.TEST_VERBOSE) console.log('fetchSecretsFromRemoteStore delay 10')
    return Promise.resolve({
      test: true,
      nested: {
        yolo: 'hi'
      }
    })
  })
}

function delay(t, v) {
  return new Promise((resolve) => {
    setTimeout(resolve.bind(null, v), t)
  })
}
