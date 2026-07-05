/**
 * Tests for CloudFormation YAML schema intrinsic functions
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const YAML = require('js-yaml')
const cloudFormationSchema = require('./cloudformationSchema')

// Helper to parse YAML with CloudFormation schema
function parseCfYaml(yamlString) {
  return YAML.load(yamlString, { schema: cloudFormationSchema.schema })
}

// ==========================================
// !GetAtt - Simple attributes (single dot)
// ==========================================

test('!GetAtt - simple attribute (dot syntax)', () => {
  const yaml = `Value: !GetAtt MyDBInstance.DBInstanceArn`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::GetAtt'], ['MyDBInstance', 'DBInstanceArn'])
})

test('!GetAtt - simple attribute (array syntax)', () => {
  const yaml = `Value: !GetAtt [MyDBInstance, DBInstanceArn]`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::GetAtt'], ['MyDBInstance', 'DBInstanceArn'])
})

// ==========================================
// !GetAtt - Nested attributes (bug fix)
// AWS resources have attributes like Endpoint.Address that contain dots
// ==========================================

test('!GetAtt - nested attribute Endpoint.Address (dot syntax)', () => {
  const yaml = `Value: !GetAtt MyDBInstance.Endpoint.Address`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::GetAtt'], ['MyDBInstance', 'Endpoint.Address'])
})

test('!GetAtt - nested attribute Endpoint.Port (dot syntax)', () => {
  const yaml = `Value: !GetAtt MyDBInstance.Endpoint.Port`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::GetAtt'], ['MyDBInstance', 'Endpoint.Port'])
})

test('!GetAtt - nested attribute CertificateDetails.CAIdentifier (dot syntax)', () => {
  const yaml = `Value: !GetAtt MyDBInstance.CertificateDetails.CAIdentifier`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::GetAtt'], ['MyDBInstance', 'CertificateDetails.CAIdentifier'])
})

test('!GetAtt - nested attribute ReadEndpoint.Address (dot syntax)', () => {
  const yaml = `Value: !GetAtt MyDBCluster.ReadEndpoint.Address`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::GetAtt'], ['MyDBCluster', 'ReadEndpoint.Address'])
})

test('!GetAtt - nested attribute MasterUserSecret.SecretArn (dot syntax)', () => {
  const yaml = `Value: !GetAtt MyDBCluster.MasterUserSecret.SecretArn`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::GetAtt'], ['MyDBCluster', 'MasterUserSecret.SecretArn'])
})

test('!GetAtt - nested attribute (array syntax - should still work)', () => {
  const yaml = `Value: !GetAtt [MyDBInstance, Endpoint.Address]`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::GetAtt'], ['MyDBInstance', 'Endpoint.Address'])
})

// ==========================================
// !GetAtt - Edge cases
// ==========================================

test('!GetAtt - resource name only (no attribute)', () => {
  const yaml = `Value: !GetAtt MyResource`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::GetAtt'], ['MyResource'])
})

test('!GetAtt - three-level nested attribute', () => {
  const yaml = `Value: !GetAtt MyResource.Level1.Level2.Level3`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::GetAtt'], ['MyResource', 'Level1.Level2.Level3'])
})

// ==========================================
// !Ref - Basic reference
// ==========================================

test('!Ref - basic reference', () => {
  const yaml = `Value: !Ref MyResource`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Ref'], 'MyResource')
})

// ==========================================
// !Sub - String substitution
// ==========================================

test('!Sub - simple substitution', () => {
  const yaml = `Value: !Sub 'Hello \${Name}'`
  const parsed = parseCfYaml(yaml)
  assert.is(parsed.Value['Fn::Sub'], 'Hello ${Name}')
})

test('!Sub - with array form', () => {
  const yaml = `Value: !Sub ['Hello \${Name}', {Name: World}]`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::Sub'], ['Hello ${Name}', { Name: 'World' }])
})

// ==========================================
// !Join - Join values
// ==========================================

test('!Join - basic join', () => {
  const yaml = `Value: !Join [',', [a, b, c]]`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::Join'], [',', ['a', 'b', 'c']])
})

// ==========================================
// !If - Conditional
// ==========================================

test('!If - basic conditional', () => {
  const yaml = `Value: !If [IsProduction, prod-value, dev-value]`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::If'], ['IsProduction', 'prod-value', 'dev-value'])
})

// ==========================================
// !FindInMap - Map lookup
// ==========================================

test('!FindInMap - basic lookup', () => {
  const yaml = `Value: !FindInMap [MapName, TopKey, SecondKey]`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::FindInMap'], ['MapName', 'TopKey', 'SecondKey'])
})

// ==========================================
// !Select - Select from list
// ==========================================

test('!Select - basic select', () => {
  const yaml = `Value: !Select [0, [a, b, c]]`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::Select'], [0, ['a', 'b', 'c']])
})

// ==========================================
// !Base64 - Base64 encoding
// ==========================================

test('!Base64 - basic encoding', () => {
  const yaml = `Value: !Base64 'Hello World'`
  const parsed = parseCfYaml(yaml)
  assert.is(parsed.Value['Fn::Base64'], 'Hello World')
})

// ==========================================
// !Condition - Condition reference
// ==========================================

test('!Condition - basic condition', () => {
  const yaml = `Value: !Condition IsProduction`
  const parsed = parseCfYaml(yaml)
  assert.is(parsed.Value['Condition'], 'IsProduction')
})

// ==========================================
// !Transform - Macro processing
// ==========================================

test('!Transform - basic transform', () => {
  const yaml = `Value: !Transform { Name: 'AWS::Include', Parameters: { Location: 's3://bucket/file.yaml' } }`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::Transform'], {
    Name: 'AWS::Include',
    Parameters: { Location: 's3://bucket/file.yaml' }
  })
})

// ==========================================
// AWS::LanguageExtensions functions
// ==========================================

test('!Length - array length', () => {
  const yaml = `Value: !Length [a, b, c]`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::Length'], ['a', 'b', 'c'])
})

test('!ToJsonString - convert to JSON', () => {
  const yaml = `Value: !ToJsonString { key: value }`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::ToJsonString'], { key: 'value' })
})

test('!ForEach - iteration', () => {
  const yaml = `Value: !ForEach [Identifier, [a, b, c], Content]`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::ForEach'], ['Identifier', ['a', 'b', 'c'], 'Content'])
})

// ==========================================
// Rule-specific functions
// ==========================================

test('!ValueOf - rule value lookup', () => {
  const yaml = `Value: !ValueOf [ParameterLogicalId, AttributeKey]`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::ValueOf'], ['ParameterLogicalId', 'AttributeKey'])
})

test('!ValueOfAll - all values lookup', () => {
  const yaml = `Value: !ValueOfAll ['AWS::EC2::VPC::Id', Tags.Name]`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::ValueOfAll'], ['AWS::EC2::VPC::Id', 'Tags.Name'])
})

test('!EachMemberEquals - member equality check', () => {
  const yaml = `Value: !EachMemberEquals [[a, b], value]`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::EachMemberEquals'], [['a', 'b'], 'value'])
})

test('!EachMemberIn - member inclusion check', () => {
  const yaml = `Value: !EachMemberIn [[a, b], [a, b, c]]`
  const parsed = parseCfYaml(yaml)
  assert.equal(parsed.Value['Fn::EachMemberIn'], [['a', 'b'], ['a', 'b', 'c']])
})

// ==========================================
// Security - Unsafe YAML tags should be blocked
// ==========================================

test('security - !!js/function should be rejected', () => {
  const maliciousYaml = `Handler: !!js/function 'function() { return "pwned"; }'`
  assert.throws(() => parseCfYaml(maliciousYaml), /unknown tag/)
})

test('security - !!js/regexp should be rejected', () => {
  const maliciousYaml = `Pattern: !!js/regexp /test/`
  assert.throws(() => parseCfYaml(maliciousYaml), /unknown tag/)
})

test.run()
