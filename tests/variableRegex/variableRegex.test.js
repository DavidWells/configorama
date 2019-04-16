/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import configorama from '../../lib'

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

test('${ } syntax', async (t) => {
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

  t.deepEqual(config, resolvedObject)
})

test('${{ }} syntax', async (t) => {
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

  t.deepEqual(config, resolvedObject)
})

test('#{ } syntax', async (t) => {
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

  t.deepEqual(config, resolvedObject)
})

test('< > syntax', async (t) => {
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

  t.deepEqual(config, resolvedObject)
})

test('[ ] syntax', async (t) => {
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

  t.deepEqual(config, resolvedObject)
})

test('[[ ]] syntax', async (t) => {
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
  t.is(config.key, 'dev')
  t.is(config.value, 'dev-bar')
})
