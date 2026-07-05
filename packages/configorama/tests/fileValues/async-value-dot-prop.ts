interface ConfigArgs {
  secret?: string;
  key?: string;
}

function delayWithValue(ms: number): Promise<{ my: { value: string } }> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({
      my: {
        value: 'async-ts-value-dot-prop'
      }
    }), ms)
  })
}

export default async function variableResolver(config?: ConfigArgs): Promise<{ my: { value: string } }> {
  console.log('TypeScript async function called with:', config)
  return delayWithValue(100)
}