/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import Variables from '../../lib'

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

  const vars = new Variables(object, {
    configDir: dirname
  })

  const config = await vars.init(args)
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

  const vars = new Variables(object, {
    syntax: '\\${{([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)}}',
    configDir: dirname
  })

  const config = await vars.init(args)
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

  const vars = new Variables(object, {
    syntax: '\\#{([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)}',
    configDir: dirname
  })

  const config = await vars.init(args)
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

  const vars = new Variables(object, {
    syntax: '\\<([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)>',
    configDir: dirname
  })

  const config = await vars.init(args)
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

  const vars = new Variables(object, {
    syntax: '\\[([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)]',
    configDir: dirname
  })

  const config = await vars.init(args)
  t.deepEqual(config, resolvedObject)
})

test('[[ ]] syntax', async (t) => {
  const object = {
    foo: 'bar',
    key: '[[opt:stage]]',
    value: '[[opt:stage]]-[[foo]]'
  }

  const vars = new Variables(object, {
    syntax: '\\[\\[([ ~:a-zA-Z0-9._\\\'",\\-\\/\\(\\)]+?)]]',
    configDir: dirname
  })

  const config = await vars.init(args)
  t.is(config.key, 'dev')
  t.is(config.value, 'dev-bar')
})
