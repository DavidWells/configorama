module.exports = (config) => {
  // simulate remote config fetch
  return fetchSecretsFromRemoteStore()
}

function fetchSecretsFromRemoteStore() {
  return delay(300).then(() => {
    console.log('fetchSecretsFromRemoteStore delay 300')
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
