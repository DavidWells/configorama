const { test } = require('uvu')
const assert = require('uvu/assert')
const { mergeByKeys } = require('./mergeByKeys')

// ==========================================
// Basic functionality tests
// ==========================================

test('mergeByKeys - should merge objects with matching keys', () => {
  const data = {
    items: [
      { Resources: { A: { type: 'a' } } },
      { Resources: { B: { type: 'b' } } }
    ]
  }
  const result = mergeByKeys(data, 'items', ['Resources'])
  assert.equal(result, {
    Resources: { A: { type: 'a' }, B: { type: 'b' } }
  })
})

test('mergeByKeys - should pass through non-matching keys unchanged', () => {
  const data = {
    items: [
      { Resources: { A: { type: 'a' } } },
      { Outputs: { Out1: { value: 'v1' } } }
    ]
  }
  const result = mergeByKeys(data, 'items', ['Resources'])
  assert.equal(result, {
    Resources: { A: { type: 'a' } },
    Outputs: { Out1: { value: 'v1' } }
  })
})

test('mergeByKeys - should return empty object for null/undefined data', () => {
  assert.equal(mergeByKeys(null, 'items', ['Resources']), {})
  assert.equal(mergeByKeys(undefined, 'items', ['Resources']), {})
})

test('mergeByKeys - should return data unchanged if path is not an array', () => {
  const data = { items: 'not an array' }
  assert.equal(mergeByKeys(data, 'items', ['Resources']), data)
})

// ==========================================
// Bug fix tests: Multiple keys per item
// ==========================================

test('mergeByKeys - should process ALL keys in each item, not just the first', () => {
  // Simulating a CloudFormation/Serverless pattern where a config file
  // might define both Resources and Outputs in the same section
  const data = {
    cloudformation: [
      {
        Resources: {
          MyAPI: { Type: 'AWS::ApiGateway::RestApi' }
        },
        Outputs: {
          ApiEndpoint: { Value: 'https://api.example.com' }
        }
      },
      {
        Resources: {
          MyBucket: { Type: 'AWS::S3::Bucket' }
        }
      }
    ]
  }

  const result = mergeByKeys(data, 'cloudformation', ['Resources'])

  // Expected behavior:
  // - Resources should be merged (both MyAPI and MyBucket)
  // - Outputs should be preserved (not merged, just passed through)
  const expected = {
    Resources: {
      MyAPI: { Type: 'AWS::ApiGateway::RestApi' },
      MyBucket: { Type: 'AWS::S3::Bucket' }
    },
    Outputs: {
      ApiEndpoint: { Value: 'https://api.example.com' }
    }
  }

  assert.equal(result, expected)
})

test('mergeByKeys - should handle items with multiple keys when none match mergeKeys', () => {
  const data = {
    items: [
      {
        Foo: { a: 1 },
        Bar: { b: 2 }
      },
      {
        Baz: { c: 3 }
      }
    ]
  }

  // We want to merge 'Baz' only, so Foo and Bar should pass through unchanged
  const result = mergeByKeys(data, 'items', ['Baz'])

  const expected = {
    Foo: { a: 1 },
    Bar: { b: 2 },
    Baz: { c: 3 }
  }

  assert.equal(result, expected)
})

test('mergeByKeys - should preserve all keys when mergeAll is true (empty array)', () => {
  const data = {
    items: [
      {
        Resources: { API: { Type: 'API' } },
        Outputs: { Out1: { Value: 'v1' } }
      },
      {
        Resources: { S3: { Type: 'S3' } }
      }
    ]
  }

  // Empty array means merge all keys
  const result = mergeByKeys(data, 'items', [])

  const expected = {
    Resources: {
      API: { Type: 'API' },
      S3: { Type: 'S3' }
    },
    Outputs: {
      Out1: { Value: 'v1' }
    }
  }

  assert.equal(result, expected)
})

test('mergeByKeys - should merge multiple keys from same item when both are in mergeKeys', () => {
  const data = {
    items: [
      {
        Resources: { A: { type: 'a' } },
        Outputs: { O1: { value: 'v1' } }
      },
      {
        Resources: { B: { type: 'b' } },
        Outputs: { O2: { value: 'v2' } }
      }
    ]
  }

  const result = mergeByKeys(data, 'items', ['Resources', 'Outputs'])

  const expected = {
    Resources: { A: { type: 'a' }, B: { type: 'b' } },
    Outputs: { O1: { value: 'v1' }, O2: { value: 'v2' } }
  }

  assert.equal(result, expected)
})

test('mergeByKeys - should handle three keys in same item', () => {
  const data = {
    items: [
      {
        Resources: { R1: {} },
        Outputs: { O1: {} },
        Parameters: { P1: {} }
      }
    ]
  }

  const result = mergeByKeys(data, 'items', ['Resources'])

  const expected = {
    Resources: { R1: {} },
    Outputs: { O1: {} },
    Parameters: { P1: {} }
  }

  assert.equal(result, expected)
})

test.run()
