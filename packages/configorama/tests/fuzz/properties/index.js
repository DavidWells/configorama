/* Every fuzz property: { name, runs, arbitrary, check(case) } where check throws a PropertyFailure */
const PROPERTIES = [
  require('./crossFeature'),
  require('./encoders'),
  require('./slotTransparency'),
  require('./lazyFallback'),
  require('./noCrash'),
  require('./filterFallback'),
  require('./keyPaths'),
  require('./markers'),
  require('./unknownNames'),
  require('./equivalence'),
  require('./customSyntax'),
  require('./structures'),
]

module.exports = { PROPERTIES }
