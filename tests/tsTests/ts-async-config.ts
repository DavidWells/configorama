interface ConfigObject {
  asyncValue: string;
  timestamp: number;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function config(args: any): Promise<ConfigObject> {
  console.log('args', args)
  await delay(100)
  return {
    asyncValue: 'async-typescript-value',
    timestamp: Date.now()
  }
}