interface ConfigArgs {
  secret?: string;
  key?: string;
}

function delay(ms: number): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => resolve('async-ts-value'), ms)
  })
}

async function fetchSecretsFromRemoteStore(config?: ConfigArgs): Promise<string> {
  console.log('TypeScript async function called with:', config)
  await delay(100)
  return 'async-ts-value'
}

export = fetchSecretsFromRemoteStore