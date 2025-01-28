const YAML = require('js-yaml');
const includes = require('lodash.includes');
const isString = require('lodash.isstring');
const split = require('lodash.split');
const flatten = require('lodash.flatten');
const map = require('lodash.map');

const functionNames = [
  'And',
  'Base64',
  'Cidr',
  'Condition',
  'Equals',
  'FindInMap',
  'GetAtt',
  'GetAZs',
  'If',
  'ImportValue',
  'Join',
  'Not',
  'Or',
  'Ref',
  'Select',
  'Split',
  'Sub',
];

const yamlType = (name, kind) => {
  const functionName = includes(['Ref', 'Condition'], name) ? name : `Fn::${name}`;
  return new YAML.Type(`!${name}`, {
    kind,
    construct: data => {
      if (name === 'GetAtt') {
        // special GetAtt dot syntax
        return { [functionName]: isString(data) ? split(data, '.', 2) : data };
      }
      return { [functionName]: data };
    },
  });
};

const createSchema = () => {
  const types = flatten(
    map(functionNames, functionName =>
      map(['mapping', 'scalar', 'sequence'], kind => yamlType(functionName, kind))
    )
  );
  return YAML.Schema.create(types);
};

module.exports = {
  schema: createSchema(),
};
