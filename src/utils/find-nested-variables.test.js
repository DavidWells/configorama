const { test } = require('uvu');
const assert = require('uvu/assert');
const { findNestedVariables } = require('./find-nested-variables');
const deepLog = require('./deep-log')

// Import resolvers to build variableTypes array
const getValueFromEnv = require('../resolvers/valueFromEnv')
const getValueFromOptions = require('../resolvers/valueFromOptions')
const getValueFromGit = require('../resolvers/valueFromGit')

// Define the regex pattern as used in the main function
const regex = /\${((?!AWS|stageVariables)[ ~:a-zA-Z0-9=+!@#%*<>?._'",|\-\/\(\)\\]+?)}/g;
const variablesKnownTypes = /(^env:|^opt:|^self:|^file\((~?[\{\}\:\$a-zA-Z0-9._\-\/,'" ]+?)\)|^git:|(\${)?deep:\d+(\.[^}]+)*()}?)/

const fileRefSyntax = RegExp(/^file\((~?[@\{\}\:\$a-zA-Z0-9._\-\/,'" ]+?)\)/g)
const textRefSyntax = RegExp(/^text\((~?[@\{\}\:\$a-zA-Z0-9._\-\/,'" ]+?)\)/g)
const selfRefSyntax = RegExp(/^self:/g)
const deepRefSyntax = RegExp(/(\${)?deep:\d+(\.[^}]+)*()}?/)

// Build variableTypes array similar to main.js
const variableTypes = [
  getValueFromEnv,
  getValueFromOptions,
  getValueFromGit,
  {
    type: 'self',
    prefix: 'self',
    match: selfRefSyntax,
  },
  {
    type: 'file',
    prefix: 'file',
    match: fileRefSyntax,
  },
  {
    type: 'text',
    prefix: 'text',
    match: textRefSyntax,
  },
  {
    type: 'deep',
    prefix: 'deep',
    match: deepRefSyntax,
  },
]

test('findNestedVariables - simple variables', () => {
  const input = '${simple}';
  const result = findNestedVariables(input, regex, variablesKnownTypes, 'key', variableTypes);
  deepLog('result', result)
  
  assert.equal(result.length, 1);
  assert.equal(result[0].varMatch, '${simple}');
  assert.equal(result[0].variable, 'simple');
  assert.equal(result[0].resolveOrder, 1, 'order should be 1'); 
});

test('findNestedVariables - complex variable with colon syntax', () => {
  const input = '${opt:stage, dev}';
  const result = findNestedVariables(input, regex, variablesKnownTypes, undefined, variableTypes);
  
  assert.equal(result.length, 1);
  assert.equal(result[0].varMatch, '${opt:stage, dev}');
  assert.equal(result[0].variable, 'opt:stage, dev');
});

test('findNestedVariables - one level nesting', () => {
  const input = '${file(./config.${stage}.json)}';
  const result = findNestedVariables(input, regex, variablesKnownTypes, undefined, variableTypes);
  
  assert.equal(result.length, 2);
  // The innermost variable should be found first
  assert.equal(result[0].varMatch, '${stage}');
  assert.equal(result[0].variable, 'stage');
  // Then the outer variable
  assert.equal(result[1].varMatch, '${file(./config.${stage}.json)}');
  assert.equal(result[1].variable, 'file(./config.${stage}.json)');
});   

test('findNestedVariables - two levels of nesting', () => {
  const input = '${file(./config.${opt:stage, ${defaultStage}}.json):CREDS}';
  const result = findNestedVariables(input, regex, variablesKnownTypes, undefined, variableTypes);
  
  assert.equal(result.length, 3);
  // Innermost first
  assert.equal(result[0].varMatch, '${defaultStage}');
  assert.equal(result[0].variable, 'defaultStage');
  // Middle next
  assert.equal(result[1].varMatch, '${opt:stage, ${defaultStage}}');
  assert.equal(result[1].variable, 'opt:stage, ${defaultStage}');
  // Outermost last
  assert.equal(result[2].varMatch, '${file(./config.${opt:stage, ${defaultStage}}.json):CREDS}');
  assert.equal(result[2].variable, 'file(./config.${opt:stage, ${defaultStage}}.json):CREDS');
});

test('findNestedVariables - multiple separate variables', () => {
  const input = 'Hello ${name}, welcome to ${service}!';
  const result = findNestedVariables(input, regex, variablesKnownTypes, undefined, variableTypes);
  
  assert.equal(result.length, 2);
  assert.equal(result[0].varMatch, '${name}');
  assert.equal(result[1].varMatch, '${service}');
});

test('findNestedVariables - complex mixed case', () => {
  const input = '${db.${envOne}.host}:${db.${envTwo}.port} using ${credentials.${user.role}}';
  const result = findNestedVariables(input, regex, variablesKnownTypes, undefined, variableTypes);
  console.log('result', result)
  assert.equal(result.length, 6);
  // Check the correct nesting order
  assert.equal(result[0].varMatch, '${envOne}');
  assert.equal(result[1].varMatch, '${db.${envOne}.host}');
  assert.equal(result[2].varMatch, '${envTwo}');
  assert.equal(result[3].varMatch, '${db.${envTwo}.port}');
  assert.equal(result[4].varMatch, '${user.role}');
});

test('findNestedVariables - empty string', () => {
  const input = '';
  const result = findNestedVariables(input, regex, variablesKnownTypes, undefined, variableTypes);
  assert.equal(result.length, 0);
});

test('findNestedVariables - string with no variables', () => {
  const input = 'This is a string with no variables';
  const result = findNestedVariables(input, regex, variablesKnownTypes, undefined, variableTypes);
  assert.equal(result.length, 0);
});

test('findNestedVariables - varString property for nested variables', () => {
  const input = '${file(./config.${opt:stage, ${defaultStage}}.json)}';
  const result = findNestedVariables(input, regex, variablesKnownTypes, undefined, variableTypes);
  deepLog('result', result)
  // Check varString property for the outermost variable
  assert.equal(result[2].variable, 'file(./config.${opt:stage, ${defaultStage}}.json)');
});

test('findNestedVariables - mutliple fallback items', () => {
  const input = '${file(./config.${opt:stage, ${opt:stageOne}, ${opt:stageTwo}, "three"}.json)}';
  const result = findNestedVariables(input, regex, variablesKnownTypes, undefined, variableTypes);
  deepLog('result', result)
  // Check varString property for the outermost variable
  assert.equal(result[result.length - 1].variable, 'file(./config.${opt:stage, ${opt:stageOne}, ${opt:stageTwo}, "three"}.json)');
});

test('findNestedVariables - deep', () => {
  const input =
  '${file(./config.${opt:stage, ${opt:stageOne, ${env:foo}}, ${opt:stageTwo}, "three" }.json)}';
  const result = findNestedVariables(input, regex, variablesKnownTypes, 'xyz', variableTypes);
  deepLog('result', result)

  // Should have 5 variables total
  assert.equal(result.length, 5);

  // Check the innermost variable
  assert.equal(result[0].varMatch, '${env:foo}');
  assert.equal(result[0].variable, 'env:foo');
  assert.equal(result[0].variableType, 'env');

  // Check opt:stageOne with env:foo fallback
  assert.equal(result[1].varMatch, '${opt:stageOne, ${env:foo}}');
  assert.equal(result[1].variable, 'opt:stageOne, ${env:foo}');
  assert.equal(result[1].variableType, 'options');
  assert.equal(result[1].hasFallback, true);
  assert.equal(result[1].valueBeforeFallback, 'opt:stageOne');
  assert.equal(result[1].fallbackValues.length, 1);
  assert.equal(result[1].fallbackValues[0].isVariable, true);
  assert.equal(result[1].fallbackValues[0].varMatch, '${env:foo}');
  assert.equal(result[1].fallbackValues[0].variableType, 'env');

  // Check opt:stageTwo
  assert.equal(result[2].varMatch, '${opt:stageTwo}');
  assert.equal(result[2].variable, 'opt:stageTwo');

  // Check opt:stage with multiple fallbacks
  assert.equal(result[3].varMatch, '${opt:stage, ${opt:stageOne, ${env:foo}}, ${opt:stageTwo}, "three" }');
  assert.equal(result[3].variable, 'opt:stage, ${opt:stageOne, ${env:foo}}, ${opt:stageTwo}, "three"');
  assert.equal(result[3].hasFallback, true);
  assert.equal(result[3].valueBeforeFallback, 'opt:stage');
  assert.equal(result[3].fallbackValues.length, 3);
  assert.equal(result[3].fallbackValues[0].varMatch, '${opt:stageOne, ${env:foo}}');
  assert.equal(result[3].fallbackValues[0].isVariable, true);
  assert.equal(result[3].fallbackValues[1].varMatch, '${opt:stageTwo}');
  assert.equal(result[3].fallbackValues[1].isVariable, true);
  assert.equal(result[3].fallbackValues[2].varMatch, '"three"');
  assert.equal(result[3].fallbackValues[2].isVariable, false);
  assert.equal(result[3].fallbackValues[2].stringValue, 'three');

  // Check outermost file variable
  assert.equal(result[4].variable, 'file(./config.${opt:stage, ${opt:stageOne, ${env:foo}}, ${opt:stageTwo}, "three" }.json)');
});

test('findNestedVariables - deep - no var types passed', () => {
  const input =
  '${file(./config.${opt:stage, ${opt:stageOne, ${env:foo}}, ${opt:stageTwo}, "three" }.json)}';
  const result = findNestedVariables(input, regex, variablesKnownTypes, 'xyz');
  deepLog('result', result)

  // Should have 5 variables total
  assert.equal(result.length, 5);

  // Check the innermost variable
  assert.equal(result[0].varMatch, '${env:foo}');
  assert.equal(result[0].variable, 'env:foo');
  assert.equal(result[0].variableType, 'env');

  // Check opt:stageOne with env:foo fallback
  assert.equal(result[1].varMatch, '${opt:stageOne, ${env:foo}}');
  assert.equal(result[1].variable, 'opt:stageOne, ${env:foo}');
  assert.equal(result[1].variableType, 'options');
  assert.equal(result[1].hasFallback, true);
  assert.equal(result[1].valueBeforeFallback, 'opt:stageOne');
  assert.equal(result[1].fallbackValues.length, 1);
  assert.equal(result[1].fallbackValues[0].isVariable, true);
  assert.equal(result[1].fallbackValues[0].varMatch, '${env:foo}');
  assert.equal(result[1].fallbackValues[0].variableType, 'env');

  // Check opt:stageTwo
  assert.equal(result[2].varMatch, '${opt:stageTwo}');
  assert.equal(result[2].variable, 'opt:stageTwo');

  // Check opt:stage with multiple fallbacks
  assert.equal(result[3].varMatch, '${opt:stage, ${opt:stageOne, ${env:foo}}, ${opt:stageTwo}, "three" }');
  assert.equal(result[3].variable, 'opt:stage, ${opt:stageOne, ${env:foo}}, ${opt:stageTwo}, "three"');
  assert.equal(result[3].hasFallback, true);
  assert.equal(result[3].valueBeforeFallback, 'opt:stage');
  assert.equal(result[3].fallbackValues.length, 3);
  assert.equal(result[3].fallbackValues[0].varMatch, '${opt:stageOne, ${env:foo}}');
  assert.equal(result[3].fallbackValues[0].isVariable, true);
  assert.equal(result[3].fallbackValues[1].varMatch, '${opt:stageTwo}');
  assert.equal(result[3].fallbackValues[1].isVariable, true);
  assert.equal(result[3].fallbackValues[2].varMatch, '"three"');
  assert.equal(result[3].fallbackValues[2].isVariable, false);
  assert.equal(result[3].fallbackValues[2].stringValue, 'three');

  // Check outermost file variable
  assert.equal(result[4].variable, 'file(./config.${opt:stage, ${opt:stageOne, ${env:foo}}, ${opt:stageTwo}, "three" }.json)');
});


// Run all tests
test.run(); 