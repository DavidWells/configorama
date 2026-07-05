interface ConfigArgs {
  secret?: string;
  key?: string;
}

function delayWithValue(ms: number): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => resolve('async-ts-value'), ms)
  })
}

async function fetchSecretsFromRemoteStore(config?: ConfigArgs): Promise<string> {
  console.log('TypeScript async function called with:', config)
  return delayWithValue(100)
}

export default fetchSecretsFromRemoteStore