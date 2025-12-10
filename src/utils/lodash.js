const isArray = require('lodash.isarray')
const isString = require('lodash.isstring')
const isNumber = require('lodash.isnumber')
const isObject = require('lodash.isobject')
const isDate = require('lodash.isdate')
const isRegExp = require('lodash.isregexp')
const isFunction = require('lodash.isfunction')
const isEmpty = require('lodash.isempty')
const camelCase = require('lodash.camelcase')
const kebabCase = require('lodash.kebabcase')
const capitalize = require('lodash.capitalize')
const split = require('lodash.split')
const map = require('lodash.map')
const mapValues = require('lodash.mapvalues')
const assign = require('lodash.assign')
const cloneDeep = require('lodash.clonedeep')

// Custom implementation of lodash.set
function set(object, path, value) {
  if (object === null || typeof object !== 'object') {
    return object;
  }
  
  const keys = Array.isArray(path) ? path : String(path)
    .split('.')
    .map(key => {
      const numKey = Number(key);
      return Number.isInteger(numKey) && numKey >= 0 ? numKey : key;
    });
  
  let current = object;
  const lastIndex = keys.length - 1;
  
  for (let i = 0; i < lastIndex; i++) {
    const key = keys[i]
    
    // Check if value is undefined, null, or not an object (primitives can't have properties)
    if (current[key] == null || typeof current[key] !== 'object') {
      // Create appropriate container based on next key type
      current[key] = Number.isInteger(keys[i + 1]) && keys[i + 1] >= 0 ? [] : {}
    }
    
    current = current[key]
  }
  
  current[keys[lastIndex]] = value;
  return object;
}

// Custom implementation of lodash.trim
function trim(string, chars) {
  if (string === null || string === undefined) {
    return '';
  }
  
  string = String(string);
  
  if (!chars && String.prototype.trim) {
    return string.trim();
  }
  
  if (!chars) {
    // Default characters to trim (whitespace)
    chars = ' \t\n\r\f\v\u00a0\u1680\u2000\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
  }
  
  // Create a regex pattern with the characters to trim
  const pattern = new RegExp(`^[${chars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]+|[${chars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]+$`, 'g');
  
  return string.replace(pattern, '');
}

module.exports = {
  isArray,
  isString,
  isNumber,
  isObject,
  isDate,
  isRegExp,
  isFunction,
  isEmpty,
  trim,
  camelCase,
  kebabCase,
  capitalize,
  split,
  map,
  mapValues,
  assign,
  set,
  cloneDeep,
}