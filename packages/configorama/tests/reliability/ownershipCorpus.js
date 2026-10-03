/* Desired ownership contracts shared by grammar, resolver and static discovery tests. */
const wrappers=[['${','}'],['#{','}'],['$[',']'],['{{','}}']]
const ownershipCases=[]
for(const [prefix,suffix] of wrappers) {
  const ref=body=>prefix+body+suffix
  for(const mode of ['strict','allow-all','allow-foreign']) for(const position of ['whole','quoted','composed','fallback','ignored']) {
    const foreign=ref('vendor:Thing');const live=ref('opt:live')
    const source={whole:foreign,quoted:ref(`"${foreign}"`),composed:`pre-${foreign}-${live}`,fallback:ref(`opt:missing, ${foreign}`),ignored:foreign}[position]
    ownershipCases.push(Object.freeze({name:`${prefix}/${mode}/${position}`,prefix,suffix,mode,position,source,foreign,live,expected:position==='ignored'||mode!=='strict'?'preserve':'error'}))
  }
}
const grammarControls=Object.freeze([
  '${env:X}', '${env:X, "sl-${sls:stage}"}', '${merge("foo()", "x")}',
  '#set($m = {"x": 1})', '${opt:x, ${self:obj}}', '${env:${opt:key}, "fallback"}',
  '${merge({"a":{"b":[1,2]}}, {"c":3}) | toJson}', '${x | help("use ${env:X}")}',
])
module.exports={wrappers,ownershipCases:Object.freeze(ownershipCases),grammarControls}
