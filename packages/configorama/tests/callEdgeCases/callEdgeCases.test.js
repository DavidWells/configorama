/* eval/if strings with braces stay text, and a function call nested as another call's */
/* argument passes its result like a config value does.                                */
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { resolveYamlText } = require('../utils')

test('eval strings containing braces are text, not JSON objects', async () => {
  const config = await resolveYamlText(`a: \${eval("{" + "}")}
b: \${eval("{a}" + "-x")}
c: \${eval("{" === "{")}
d: \${eval("a{b")}
`)
  assert.is(config.a, '{}')
  assert.is(config.b, '{a}-x')
  assert.is(config.c, true)
  assert.is(config.d, 'a{b')
})

test('a function call nested as another function argument', async () => {
  const config = await resolveYamlText(`arr: [a, b]
fromConfig: \${join(\${arr}, '+')}
nested: \${join(\${split('a-b','-')}, '+')}
nestedInText: "x-\${join(\${split('a-b','-')}, '+')}-y"
count: \${length(\${split('a-b-c','-')})}
`)
  assert.is(config.fromConfig, 'a+b')
  assert.is(config.nested, 'a+b')
  assert.is(config.nestedInText, 'x-a+b-y')
  assert.is(config.count, 3)
})

test.run()
