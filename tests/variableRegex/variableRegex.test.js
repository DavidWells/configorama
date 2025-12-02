/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const dirname = path.dirname(__dirname)

process.env.envReference = 'env var'

const args = {
  stage: 'dev',
}

const resolvedObject = {
  foo: 'bar',
  key: 'dev',
  value: 'dev-bar',
  env: 'env var',
  domainName: 'my-site.com',
  domains: {
    prod: 'api.my-site.com',
    staging: 'api-staging.my-site.com',
    dev: 'api-dev.my-site.com'
  },
  resolvedDomainName: 'api-dev.my-site.com'
}

test('${ } syntax', async () => {
  const object = {
    foo: 'bar',
    key: '${opt:stage}',
    value: '${opt:stage}-${foo}',
    env: '${env:envReference}',
    domainName: 'my-site.com',
    domains: {
      prod: 'api.${domainName}',
      staging: 'api-staging.${domainName}',
      dev: 'api-dev.${domainName}'
    },
    resolvedDomainName: '${domains.${opt:stage}}'
    // tester: '${ssm:/path/to/service/myParam}'
  }

  const config = await configorama(object, {
    configDir: dirname,
    options: args
  })

  assert.equal(config, resolvedObject)
})

test('${{ }} syntax', async () => {
  const object = {
    foo: 'bar',
    key: '${{opt:stage}}',
    value: '${{opt:stage}}-${{foo}}',
    env: '${{env:envReference}}',
    domainName: 'my-site.com',
    domains: {
      prod: 'api.${{domainName}}',
      staging: 'api-staging.${{domainName}}',
      dev: 'api-dev.${{domainName}}'
    },
    resolvedDomainName: '${{domains.${{opt:stage}}}}'
  }

  const config = await configorama(object, {
    syntax: '\\${{([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)}}',
    configDir: dirname,
    options: args
  })

  assert.equal(config, resolvedObject)
})

test('#{ } syntax', async () => {
  const object = {
    foo: 'bar',
    key: '#{opt:stage}',
    value: '#{opt:stage}-#{foo}',
    env: '#{env:envReference}',
    domainName: 'my-site.com',
    domains: {
      prod: 'api.#{domainName}',
      staging: 'api-staging.#{domainName}',
      dev: 'api-dev.#{domainName}'
    },
    resolvedDomainName: '#{domains.#{opt:stage}}'
  }

  const config = await configorama(object, {
    syntax: '\\#{([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)}',
    configDir: dirname,
    options: args
  })

  assert.equal(config, resolvedObject)
})

test('< > syntax', async () => {
  const object = {
    foo: 'bar',
    key: '<opt:stage>',
    value: '<opt:stage>-<foo>',
    env: '<env:envReference>',
    domainName: 'my-site.com',
    domains: {
      prod: 'api.<domainName>',
      staging: 'api-staging.<domainName>',
      dev: 'api-dev.<domainName>'
    },
    resolvedDomainName: '<domains.<opt:stage>>'
  }

  const config = await configorama(object, {
    syntax: '\\<([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)>',
    configDir: dirname,
    options: args
  })

  assert.equal(config, resolvedObject)
})

test('[ ] syntax', async () => {
  const object = {
    foo: 'bar',
    key: '[opt:stage]',
    value: '[opt:stage]-[foo]',
    env: '[env:envReference]',
    domainName: 'my-site.com',
    domains: {
      prod: 'api.[domainName]',
      staging: 'api-staging.[domainName]',
      dev: 'api-dev.[domainName]'
    },
    resolvedDomainName: '[domains.[opt:stage]]'
  }

  const config = await configorama(object, {
    syntax: '\\[([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)]',
    configDir: dirname,
    options: args
  })

  assert.equal(config, resolvedObject)
})

test('[[ ]] syntax', async () => {
  const object = {
    foo: 'bar',
    key: '[[opt:stage]]',
    value: '[[opt:stage]]-[[foo]]'
  }

  const config = await configorama(object, {
    syntax: '\\[\\[([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)]]',
    configDir: dirname,
    options: args
  })
  assert.is(config.key, 'dev')
  assert.is(config.value, 'dev-bar')
})

test('%{ } syntax (Terraform-like)', async () => {
  const object = {
    foo: 'bar',
    key: '%{opt:stage}',
    value: '%{opt:stage}-%{foo}',
    env: '%{env:envReference}',
    domainName: 'my-site.com',
    domains: {
      prod: 'api.%{domainName}',
      staging: 'api-staging.%{domainName}',
      dev: 'api-dev.%{domainName}'
    },
    resolvedDomainName: '%{domains.%{opt:stage}}'
  }

  const config = await configorama(object, {
    syntax: '\\%\\{([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)}',
    configDir: dirname,
    options: args
  })

  assert.equal(config, resolvedObject)
})

test('{{ }} syntax (Mustache-like)', async () => {
  const object = {
    foo: 'bar',
    key: '{{opt:stage}}',
    value: '{{opt:stage}}-{{foo}}',
    env: '{{env:envReference}}',
    domainName: 'my-site.com',
    domains: {
      prod: 'api.{{domainName}}',
      staging: 'api-staging.{{domainName}}',
      dev: 'api-dev.{{domainName}}'
    },
    resolvedDomainName: '{{domains.{{opt:stage}}}}'
  }

  const config = await configorama(object, {
    syntax: '\\{\\{([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)}}',
    configDir: dirname,
    options: args
  })

  assert.equal(config, resolvedObject)
})

test('(( )) syntax (BOSH-like)', async () => {
  // Note: nested (( )) doesn't work because () are in the regex char class
  const object = {
    foo: 'bar',
    key: '((opt:stage))',
    value: '((opt:stage))-((foo))',
    env: '((env:envReference))',
    domainName: 'my-site.com',
    domains: {
      prod: 'api.((domainName))',
      staging: 'api-staging.((domainName))',
      dev: 'api-dev.((domainName))'
    }
  }

  const config = await configorama(object, {
    syntax: '\\(\\(([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)\\)\\)',
    configDir: dirname,
    options: args
  })

  assert.is(config.foo, 'bar')
  assert.is(config.key, 'dev')
  assert.is(config.value, 'dev-bar')
  assert.is(config.env, 'env var')
  assert.is(config.domains.dev, 'api-dev.my-site.com')
})

test('@{ } syntax (PowerShell-like)', async () => {
  const object = {
    foo: 'bar',
    key: '@{opt:stage}',
    value: '@{opt:stage}-@{foo}',
    env: '@{env:envReference}',
    domainName: 'my-site.com',
    domains: {
      prod: 'api.@{domainName}',
      staging: 'api-staging.@{domainName}',
      dev: 'api-dev.@{domainName}'
    },
    resolvedDomainName: '@{domains.@{opt:stage}}'
  }

  const config = await configorama(object, {
    syntax: '\\@\\{([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)}',
    configDir: dirname,
    options: args
  })

  assert.equal(config, resolvedObject)
})

test('${{ }} syntax with fallbacks', async () => {
  const object = {
    withFallback: '${{opt:missing, "defaultValue"}}',
    nestedFallback: '${{opt:missing, opt:stage}}',
    chainedFallback: '${{opt:missing, opt:alsoMissing, "finalDefault"}}'
  }

  const config = await configorama(object, {
    syntax: '\\${{([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)}}',
    configDir: dirname,
    options: args
  })

  assert.is(config.withFallback, 'defaultValue')
  assert.is(config.nestedFallback, 'dev')
  assert.is(config.chainedFallback, 'finalDefault')
})

test('#{ } syntax with fallbacks', async () => {
  const object = {
    withFallback: '#{opt:missing, "defaultValue"}',
    numericFallback: '#{opt:missing, 42}',
    nestedFallback: '#{opt:missing, opt:stage}'
  }

  const config = await configorama(object, {
    syntax: '\\#{([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)}',
    configDir: dirname,
    options: args
  })

  assert.is(config.withFallback, 'defaultValue')
  assert.is(config.numericFallback, 42)
  assert.is(config.nestedFallback, 'dev')
})

test('<< >> syntax', async () => {
  const object = {
    foo: 'bar',
    key: '<<opt:stage>>',
    value: '<<opt:stage>>-<<foo>>',
    env: '<<env:envReference>>'
  }

  const config = await configorama(object, {
    syntax: '\\<\\<([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)>>',
    configDir: dirname,
    options: args
  })

  assert.is(config.foo, 'bar')
  assert.is(config.key, 'dev')
  assert.is(config.value, 'dev-bar')
  assert.is(config.env, 'env var')
})

test.run()
