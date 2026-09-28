/* Every fuzz property: { name, runs, arbitrary, check(case) } where check throws a PropertyFailure */
const PROPERTIES = [
  require('./encoders'),
  require('./slotTransparency'),
  require('./lazyFallback'),
  require('./noCrash'),
]

module.exports = { PROPERTIES }
