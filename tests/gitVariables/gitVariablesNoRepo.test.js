/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const configorama = require('../../src')

// Build a temp directory outside the configorama git repo so that
// `findProjectRoot` will not walk up into it.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-no-git-'))
const configFile = path.join(tmpRoot, 'config.yml')

test.before(() => {
  fs.writeFileSync(configFile, [
    "# Fallback when not in a git repo",
    "branch: ${git:branch, 'main'}",
    "url: ${git:url, 'https://example.com/fallback'}",
    "dir: ${git:dir, 'no-git-dir'}",
    "sha: ${git:sha1, 'no-sha'}",
    "tag: ${git:tag, 'no-tag'}",
    "msg: ${git:message, 'no-msg'}",
    "emptyFallback: ${git:branch, ''}",
    ""
  ].join('\n'))
})

test.after(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch (e) { /* ignore */ }
})

test('git fallbacks resolve when not in a git repo', async () => {
  const config = await configorama(configFile)
  assert.is(config.branch, 'main')
  assert.is(config.url, 'https://example.com/fallback')
  assert.is(config.dir, 'no-git-dir')
  assert.is(config.sha, 'no-sha')
  assert.is(config.tag, 'no-tag')
  assert.is(config.msg, 'no-msg')
})

test('git fallback to empty string works in non-git dir', async () => {
  const config = await configorama(configFile)
  assert.is(config.emptyFallback, '')
})

test('git:dir with empty string fallback in inline string does not crash', async () => {
  const inlineFile = path.join(tmpRoot, 'inline-empty.yml')
  fs.writeFileSync(inlineFile, 'key: here ${git:dir, ""}\n')

  const config = await configorama(inlineFile)
  assert.is(config.key, 'here ')
})

test('git:dir empty fallback with param array refs does not crash on originalSource', async () => {
  // When a param resolves to an array, originalSource becomes that array.
  // populateVariable must guard .match() against non-string originalSource.
  // The bug only triggers with enough config nodes to push resolution into
  // extra passes where array-valued originalSource reaches .match().
  const paramFile = path.join(tmpRoot, 'param-array.yml')
  fs.writeFileSync(paramFile, [
    'service: github-oidc',
    "frameworkVersion: '^3.19.0'",
    'custom:',
    "  stage: ${opt:stage, 'prod'}",
    "  region: ${opt:region, 'us-east-1'}",
    '  githubOrgName: DavidWells',
    "  githubRepoName: ${opt:repoName, '*'}",
    'params:',
    '  staging:',
    "    subjectClaim: 'repo:${self:custom.githubOrgName}/${self:custom.githubRepoName}'",
    '  prod:',
    "    subjectClaim: 'repo:${self:custom.githubOrgName}/${self:custom.githubRepoName}'",
    '  default:',
    "    subjectClaim: 'repo:${self:custom.githubOrgName}/${self:custom.githubRepoName}'",
    '    thumbprints: [ abc123, def456 ]',
    '    audienceList: [ sts.amazonaws.com ]',
    '    managedPolicyArns: []',
    '    allowedActions:',
    "      - 'acm:*'",
    "      - 'apigateway:*'",
    "      - 'cloudformation:*'",
    "      - 's3:*'",
    "      - 'lambda:*'",
    "      - 'logs:*'",
    "      - 'iam:*'",
    "      - 'dynamodb:*'",
    "      - 'sns:*'",
    "      - 'sqs:*'",
    "      - 'ssm:*'",
    "      - 'kms:*'",
    'provider:',
    '  name: aws',
    '  stage: ${self:custom.stage}',
    '  region: ${self:custom.region}',
    'resources:',
    '  Description: Operational Stack ${git:dir, ""}',
    '  Parameters:',
    '    GitHubRestriction:',
    "      Description: 'GitHub restrictions.'",
    '      Type: String',
    '      Default: ${param:subjectClaim}',
    '    RoleName:',
    "      Description: 'Role name.'",
    '      Type: String',
    "      Default: 'github-oidc-role'",
    '    MaxSession:',
    "      Description: 'Max session.'",
    '      Type: Number',
    '      Default: 3600',
    '    PolicyArns:',
    "      Description: 'ARNs.'",
    '      Type: String',
    "      Default: 'arn:aws:iam::aws:policy/AdministratorAccess'",
    '    Boundary:',
    "      Description: 'Boundary.'",
    '      Type: String',
    "      Default: ''",
    '  Resources:',
    '    GitHubIdentityProvider:',
    '      Type: AWS::IAM::OIDCProvider',
    '      Properties:',
    '        Url: https://token.actions.githubusercontent.com',
    '        ThumbprintList: ${param:thumbprints}',
    '        ClientIdList: ${param:audienceList}',
    '    GitHubActionsPermissions:',
    '      Type: AWS::IAM::Policy',
    '      Properties:',
    '        PolicyName: GitHubActionsPermissions',
    '        PolicyDocument:',
    "          Version: '2012-10-17'",
    '          Statement:',
    '            - Sid: OidcSafeties',
    '              Effect: Deny',
    '              Action:',
    '                - sts:AssumeRole',
    '              Resource: "*"',
    '            - Effect: Allow',
    '              Action: ${param:allowedActions}',
    "              Resource: '*'",
    '    GitHubActionsServiceRole:',
    '      Type: AWS::IAM::Role',
    '      Properties:',
    "        RoleName: 'github-oidc-role'",
    "        Path: '/delegated-admin/developer/'",
    '        ManagedPolicyArns: ${param:managedPolicyArns}',
    '        AssumeRolePolicyDocument:',
    "          Version: '2012-10-17'",
    '          Statement:',
    '            - Sid: RoleForGitHubOIDC',
    '              Effect: Allow',
    '              Action:',
    "                - 'sts:AssumeRoleWithWebIdentity'",
    '              Condition:',
    '                StringEquals:',
    "                  'token.actions.githubusercontent.com:aud': ${param:audienceList}",
    '  Outputs:',
    '    StackName:',
    "      Description: 'Stack name.'",
    "      Value: 'mystack'",
    '    RoleArn:',
    "      Description: 'Role ARN.'",
    "      Value: 'some-arn'",
    ''
  ].join('\n'))

  const config = await configorama(paramFile)
  assert.is(config.resources.Description, 'Operational Stack ')
  assert.equal(config.resources.Resources.GitHubActionsPermissions.Properties.PolicyDocument.Statement[1].Action, [
    'acm:*', 'apigateway:*', 'cloudformation:*', 's3:*', 'lambda:*', 'logs:*',
    'iam:*', 'dynamodb:*', 'sns:*', 'sqs:*', 'ssm:*', 'kms:*'
  ])
})

test('git ref without fallback in non-git dir throws clear error pointing at config path', async () => {
  const noFallbackFile = path.join(tmpRoot, 'no-fallback.yml')
  fs.writeFileSync(noFallbackFile, "description: located in ${git:dir}\n")

  let err
  try {
    await configorama(noFallbackFile)
  } catch (e) {
    err = e
  }

  assert.ok(err, 'expected an error to be thrown')
  // The error must point to the config location and suggest a fallback,
  // not surface "fatal: not a git repository".
  assert.match(err.message, /Unable to resolve config variable/)
  assert.match(err.message, /description/)
  assert.match(err.message, /fallback/i)
  assert.not.match(err.message, /fatal: not a git repository/)
})

test.run()
