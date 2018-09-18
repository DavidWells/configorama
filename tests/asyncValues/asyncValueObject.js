module.exports.func = (config) => {
  // simulate remote config fetch
  return fetchSecretsFromRemoteStore()
}

function fetchSecretsFromRemoteStore() {
  return delay(3000).then(() => {
    return Promise.resolve({
      key: 'asyncValueFromObject',
      keyTwo: 'asyncValueFromObjectTwo',
      keyThree: '${self:selfVar}',
      number: 5
    })
  })
}

function delay(t, v) {
  return new Promise((resolve) => {
    setTimeout(resolve.bind(null, v), t)
  })
}
