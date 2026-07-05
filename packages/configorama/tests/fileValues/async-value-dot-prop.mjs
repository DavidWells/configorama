// ESM async value with dot property access
function delay(t, v) {
  return new Promise((resolve) => setTimeout(resolve.bind(null, v), t))
}

async function fetchConfig(config, x, y, z) {
  await delay(10)
  return {
    nested: {
      value: 'esmNestedValue'
    },
    another: 'esmAnotherValue'
  }
}

export default fetchConfig