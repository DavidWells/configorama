// Bounded Map with FIFO eviction when capacity exceeded
// Drop-in replacement for Map with get/set/has interface

class BoundedMap {
  constructor(maxSize = 100) {
    this._map = new Map()
    this._maxSize = maxSize
  }
  get(key) {
    return this._map.get(key)
  }
  has(key) {
    return this._map.has(key)
  }
  set(key, value) {
    if (this._map.size >= this._maxSize && !this._map.has(key)) {
      const firstKey = this._map.keys().next().value
      this._map.delete(firstKey)
    }
    this._map.set(key, value)
    return this
  }
}

module.exports = BoundedMap
