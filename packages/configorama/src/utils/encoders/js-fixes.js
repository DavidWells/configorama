const opaque = require('./opaque')
function encodeJsSyntax(value = '') { return value.replace(/\(/g, () => opaque.encode('P', '(')) }
function decodeJsSyntax(value) { return opaque.decode(value, 'P') }
function hasParenthesesPlaceholder(value) { return opaque.has(value, 'P') }
function encodeJsonForVariable(obj) { return opaque.encode('J', JSON.stringify(obj)) }
function encodeJsonText(text) { return opaque.encode('J', text) }
function decodeJsonInVariable(value) { return opaque.decode(value, 'J') }
function isEncodedJson(value) { const records = opaque.find(value, 'J'); return records.length === 1 && records[0].match === value }
function parseEncodedJson(value) {
  if (!isEncodedJson(value)) return value
  try { return JSON.parse(decodeJsonInVariable(value)) } catch (_) { return value }
}
function hasEncodedJson(value) { return opaque.has(value, 'J') }

/** Protect JSON argument spans owned by calls inside expressions, never by surrounding code. */
function encodeJsonArgObjects(str, varPrefix = '${', varSuffix = '}') {
  if(typeof str!=='string'||!str.includes('{')||!varPrefix.endsWith('{'))return str
  const {scan,parentReference}=require('../expressions/scan');const syntax=scan(str,{prefix:varPrefix,suffix:varSuffix})
  const eligible=syntax.nodes.filter(node=>{
    if(node.kind!=='Object'||!node.complete||!parentReference(syntax,node))return false
    let id=node.parentId;let call
    while(id!==null){const p=syntax.nodes[id];if(p.kind==='Call'){call=p;break}id=p.parentId}
    if(!call||call.name==='file'||call.name==='text')return false
    try{JSON.parse(node.raw);return true}catch(_){return false}
  })
  const outer=eligible.filter(node=>!eligible.some(parent=>parent.start<node.start&&parent.end>=node.end)).sort((a,b)=>b.start-a.start)
  let output=str;for(const node of outer)output=output.slice(0,node.start)+encodeJsonText(node.raw)+output.slice(node.end)
  return output
}

module.exports = {
  hasParenthesesPlaceholder,
  encodeJsSyntax,
  decodeJsSyntax,
  encodeJsonForVariable,
  decodeJsonInVariable,
  parseEncodedJson,
  isEncodedJson,
  hasEncodedJson,
  encodeJsonArgObjects,
}
