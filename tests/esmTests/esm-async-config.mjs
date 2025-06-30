// ESM async function export
function delay(t, v) {
  return new Promise((resolve) => setTimeout(resolve.bind(null, v), t))
}

export default async function fetchConfig() {
  await delay(10) // Small delay to simulate async work
  return {
    my: 'async-config',
    number: '${env:envNumber}',
    flag: '${opt:stage}',
    timestamp: Date.now()
  }
}