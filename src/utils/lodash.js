// Native replacements for lodash utilities used across the codebase
const isArray = Array.isArray
const isString = (val) => typeof val === 'string'
const isNumber = (val) => typeof val === 'number' && !isNaN(val)
const isObject = (val) => val != null && typeof val === 'object'
const isDate = (val) => val instanceof Date
const isRegExp = (val) => val instanceof RegExp
const isFunction = (val) => typeof val === 'function'

/**
 * @param {*} val
 * @returns {boolean}
 */
function isEmpty(val) {
  if (val == null) return true
  if (isArray(val) || isString(val)) return val.length === 0
  if (val instanceof Map || val instanceof Set) return val.size === 0
  if (isObject(val)) return Object.keys(val).length === 0
  return false
}

// Non-trivial utilities kept as dependencies
const camelCase = require('lodash.camelcase')
const kebabCase = require('lodash.kebabcase')
const cloneDeep = require('lodash.clonedeep')

/**
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
  if (!str) return ''
  const s = String(str)
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/**
 * @param {*[]} arr
 * @param {Function} fn
 * @returns {*[]}
 */
function map(arr, fn) {
  if (arr == null) return []
  return Array.prototype.map.call(arr, fn)
}

/**
 * @param {Object} obj
 * @param {Function} fn
 * @returns {Object}
 */
function mapValues(obj, fn) {
  if (obj == null) return {}
  const result = {}
  const keys = Object.keys(obj)
  for (let i = 0; i < keys.length; i++) {
    result[keys[i]] = fn(obj[keys[i]], keys[i], obj)
  }
  return result
}

/**
 * @param {Object} object - Target object
 * @param {string|string[]} path - Dot-delimited path or array of keys
 * @param {*} value - Value to set
 * @returns {Object} The mutated object
 */
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

// Cache for trim regex patterns (perf: avoid recompilation)
const trimRegexCache = new Map()

/**
 * @param {string} string - String to trim
 * @param {string} [chars] - Characters to trim (defaults to whitespace)
 * @returns {string}
 */
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

  // Check cache first
  let pattern = trimRegexCache.get(chars)
  if (!pattern) {
    // Create and cache regex pattern with the characters to trim
    const escaped = chars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
    pattern = new RegExp(`^[${escaped}]+|[${escaped}]+$`, 'g')
    trimRegexCache.set(chars, pattern)
  }

  // Reset lastIndex for global regex reuse
  pattern.lastIndex = 0
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
  split: (str, sep) => String(str).split(sep),
  map,
  mapValues,
  assign: Object.assign,
  set,
  cloneDeep,
}