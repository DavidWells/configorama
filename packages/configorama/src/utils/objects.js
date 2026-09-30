/**
 * Write an own data property, including the literal key __proto__.
 * Ordinary assignment to that key would invoke Object.prototype's setter.
 * @param {Object} object
 * @param {string|number} key
 * @param {*} value
 */
function setOwn(object, key, value) {
  if (key === '__proto__') {
    Object.defineProperty(object, key, { value, enumerable: true, configurable: true, writable: true })
  } else {
    object[key] = value
  }
}

module.exports = { setOwn }
