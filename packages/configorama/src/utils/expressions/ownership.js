/* Ownership depends on this expression's source slot, never on a surrounding source. */
const { splitTopLevel } = require('./scan')
function classify(source, options = {}) {
  const body=String(source).trim();const slot=splitTopLevel(splitTopLevel(body,'|',options)[0],',',options)[0].trim()
  if(/^['"]/.test(slot))return {kind:'literal',type:null}
  const type=/^([\w.-]+):/.exec(slot)
  if(type)return {kind:options.knownPrefixes&&options.knownPrefixes.has(type[1]+':')?'recognized':'foreign',type:type[1]}
  const call=/^([\w$]+)\s*\(/.exec(slot)
  if(call)return {kind:'call',type:call[1]}
  return {kind:'bare',type:null}
}
function allowedForeign(ownership, setting) {return (ownership.kind==='foreign'&&(setting===true||(Array.isArray(setting)&&setting.includes(ownership.type))))||(ownership.kind==='bare'&&setting===true)}
module.exports={classify,allowedForeign}
