const { test } = require('uvu');
const assert = require('uvu/assert');
const { findNestedVariables } = require('./find-nested-variables');
const deepLog = require('./deep-log')

// Define the regex pattern as used in the main function
const regex = /\${((?!AWS|stageVariables)[ ~:a-zA-Z0-9=+!@#%*<>?._'",|\-\/\(\)\\]+?)}/g;
const variablesKnownTypes = /(^env:|^opt:|^self:|^file\((~?[\{\}\:\$a-zA-Z0-9._\-\/,'" ]+?)\)|^git:|(\${)?deep:\d+(\.[^}]+)*()}?)/

test('findNestedVariables - simple variables', () => {
  const input = '${simple}';
  const result = findNestedVariables(input, regex, variablesKnownTypes, 'key');
  deepLog('result', result)
  
  assert.equal(result.length, 1);
  assert.equal(result[0].fullMatch, '${simple}');
  assert.equal(result[0].variable, 'simple');
  assert.equal(result[0].resolveOrder, 1, 'order should be 1'); 
});

test('findNestedVariables - complex variable with colon syntax', () => {
  const input = '${opt:stage, dev}';
  const result = findNestedVariables(input, regex, variablesKnownTypes);
  
  assert.equal(result.length, 1);
  assert.equal(result[0].fullMatch, '${opt:stage, dev}');
  assert.equal(result[0].variable, 'opt:stage, dev');
});

test('findNestedVariables - one level nesting', () => {
  const input = '${file(./config.${stage}.json)}';
  const result = findNestedVariables(input, regex, variablesKnownTypes);
  
  assert.equal(result.length, 2);
  // The innermost variable should be found first
  assert.equal(result[0].fullMatch, '${stage}');
  assert.equal(result[0].variable, 'stage');
  // Then the outer variable
  assert.equal(result[1].fullMatch, '${file(./config.${stage}.json)}');
  assert.equal(result[1].variable, 'file(./config.${stage}.json)');
});   

test('findNestedVariables - two levels of nesting', () => {
  const input = '${file(./config.${opt:stage, ${defaultStage}}.json):CREDS}';
  const result = findNestedVariables(input, regex, variablesKnownTypes);
  
  assert.equal(result.length, 3);
  // Innermost first
  assert.equal(result[0].fullMatch, '${defaultStage}');
  assert.equal(result[0].variable, 'defaultStage');
  // Middle next
  assert.equal(result[1].fullMatch, '${opt:stage, ${defaultStage}}');
  assert.equal(result[1].variable, 'opt:stage, ${defaultStage}');
  // Outermost last
  assert.equal(result[2].fullMatch, '${file(./config.${opt:stage, ${defaultStage}}.json):CREDS}');
  assert.equal(result[2].variable, 'file(./config.${opt:stage, ${defaultStage}}.json):CREDS');
});

test('findNestedVariables - multiple separate variables', () => {
  const input = 'Hello ${name}, welcome to ${service}!';
  const result = findNestedVariables(input, regex, variablesKnownTypes);
  
  assert.equal(result.length, 2);
  assert.equal(result[0].fullMatch, '${name}');
  assert.equal(result[1].fullMatch, '${service}');
});

test('findNestedVariables - complex mixed case', () => {
  const input = '${db.${envOne}.host}:${db.${envTwo}.port} using ${credentials.${user.role}}';
  const result = findNestedVariables(input, regex, variablesKnownTypes);
  console.log('result', result)
  assert.equal(result.length, 6);
  // Check the correct nesting order
  assert.equal(result[0].fullMatch, '${envOne}');
  assert.equal(result[1].fullMatch, '${db.${envOne}.host}');
  assert.equal(result[2].fullMatch, '${envTwo}');
  assert.equal(result[3].fullMatch, '${db.${envTwo}.port}');
  assert.equal(result[4].fullMatch, '${user.role}');
});

test('findNestedVariables - empty string', () => {
  const input = '';
  const result = findNestedVariables(input, regex, variablesKnownTypes);
  assert.equal(result.length, 0);
});

test('findNestedVariables - string with no variables', () => {
  const input = 'This is a string with no variables';
  const result = findNestedVariables(input, regex, variablesKnownTypes);
  assert.equal(result.length, 0);
});

test('findNestedVariables - varString property for nested variables', () => {
  const input = '${file(./config.${opt:stage, ${defaultStage}}.json)}';
  const result = findNestedVariables(input, regex, variablesKnownTypes);
  deepLog('result', result)
  // Check varString property for the outermost variable
  assert.equal(result[2].variable, 'file(./config.${opt:stage, ${defaultStage}}.json)');
});

test('findNestedVariables - mutliple fallback items', () => {
  const input = '${file(./config.${opt:stage, ${opt:stageOne}, ${opt:stageTwo}, "three"}.json)}';
  const result = findNestedVariables(input, regex, variablesKnownTypes);
  deepLog('result', result)
  // Check varString property for the outermost variable
  assert.equal(result[result.length - 1].variable, 'file(./config.${opt:stage, ${opt:stageOne}, ${opt:stageTwo}, "three"}.json)');
});

test('findNestedVariables - deep', () => {
  const input =
  '${file(./config.${opt:stage, ${opt:stageOne, ${env:foo}}, ${opt:stageTwo}, "three" }.json)}';
  const result = findNestedVariables(input, regex, variablesKnownTypes, 'xyz');
  deepLog('result', result)

  // Should have 5 variables total
  assert.equal(result.length, 5);

  // Check the innermost variable
  assert.equal(result[0].fullMatch, '${env:foo}');
  assert.equal(result[0].variable, 'env:foo');
  assert.equal(result[0].varType, 'env:');

  // Check opt:stageOne with env:foo fallback
  assert.equal(result[1].fullMatch, '${opt:stageOne, ${env:foo}}');
  assert.equal(result[1].variable, 'opt:stageOne, ${env:foo}');
  assert.equal(result[1].varType, 'opt:');
  assert.equal(result[1].hasFallback, true);
  assert.equal(result[1].valueBeforeFallback, 'opt:stageOne');
  assert.equal(result[1].fallbackValues.length, 1);
  assert.equal(result[1].fallbackValues[0].isVariable, true);
  assert.equal(result[1].fallbackValues[0].fullMatch, '${env:foo}');
  assert.equal(result[1].fallbackValues[0].varType, 'env:');

  // Check opt:stageTwo
  assert.equal(result[2].fullMatch, '${opt:stageTwo}');
  assert.equal(result[2].variable, 'opt:stageTwo');

  // Check opt:stage with multiple fallbacks
  assert.equal(result[3].fullMatch, '${opt:stage, ${opt:stageOne, ${env:foo}}, ${opt:stageTwo}, "three" }');
  assert.equal(result[3].variable, 'opt:stage, ${opt:stageOne, ${env:foo}}, ${opt:stageTwo}, "three"');
  assert.equal(result[3].hasFallback, true);
  assert.equal(result[3].valueBeforeFallback, 'opt:stage');
  assert.equal(result[3].fallbackValues.length, 3);
  assert.equal(result[3].fallbackValues[0].fullMatch, '${opt:stageOne, ${env:foo}}');
  assert.equal(result[3].fallbackValues[0].isVariable, true);
  assert.equal(result[3].fallbackValues[1].fullMatch, '${opt:stageTwo}');
  assert.equal(result[3].fallbackValues[1].isVariable, true);
  assert.equal(result[3].fallbackValues[2].fullMatch, '"three"');
  assert.equal(result[3].fallbackValues[2].isVariable, false);
  assert.equal(result[3].fallbackValues[2].stringValue, 'three');

  // Check outermost file variable
  assert.equal(result[4].variable, 'file(./config.${opt:stage, ${opt:stageOne, ${env:foo}}, ${opt:stageTwo}, "three" }.json)');
});


// Run all tests
test.run(); 