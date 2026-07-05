module.exports.func = (config) => {
  // simulate remote config fetch
  return fetchSecretsFromRemoteStore()
}

function fetchSecretsFromRemoteStore() {
  // TODO with promise track refactor, the variables get called N number of times
  return delay(0).then(() => {
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
