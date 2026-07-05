import type { ConfigContext } from '../../index'

function delay(ms: number): Promise<string> {
  return new Promise((resolve) => {
    console.log('delay', ms)
    setTimeout(() => resolve('async-ts-value'), ms)
  })
}

async function fetchSecretsFromRemoteStore(ctx: ConfigContext): Promise<string> {
  console.log('TypeScript async function called with:', ctx)
  await delay(200)
  return 'async-ts-value'
}

export default fetchSecretsFromRemoteStore