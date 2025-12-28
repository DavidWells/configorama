const YAML = require('js-yaml');
const includes = require('lodash.includes');
const isString = require('lodash.isstring');
const flatten = require('lodash.flatten');
const map = require('lodash.map');

const functionNames = [
  // Standard intrinsic functions
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
  'Transform',
  // AWS::LanguageExtensions functions
  'ForEach',
  'Length',
  'ToJsonString',
  // Rule-specific functions (valid in Rules section)
  'EachMemberEquals',
  'EachMemberIn',
  'ValueOf',
  'ValueOfAll',
];

const yamlType = (name, kind) => {
  const functionName = includes(['Ref', 'Condition'], name) ? name : `Fn::${name}`;
  return new YAML.Type(`!${name}`, {
    kind,
    construct: data => {
      if (name === 'GetAtt') {
        // special GetAtt dot syntax - split only at FIRST dot
        // Attribute names can contain dots (e.g., Endpoint.Address, CertificateDetails.CAIdentifier)
        if (isString(data)) {
          const dotIndex = data.indexOf('.');
          if (dotIndex === -1) {
            return { [functionName]: [data] };
          }
          return { [functionName]: [
            data.substring(0, dotIndex),      // Resource name (before first dot)
            data.substring(dotIndex + 1)      // Attribute name (after first dot, may contain dots)
          ]};
        }
        return { [functionName]: data };
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
  return YAML.Schema.create(YAML.DEFAULT_SAFE_SCHEMA, types);
};

module.exports = {
  schema: createSchema(),
};
