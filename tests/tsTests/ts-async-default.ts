interface ConfigObject {
  asyncValue: string;
  timestamp: number;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function fetchAsyncConfig(args: any): Promise<ConfigObject> {
  console.log('TS args', args)
  await delay(10)
  return {
    asyncValue: 'async-typescript-value',
    timestamp: Date.now()
  }
}