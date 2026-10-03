const { visit } = require('../resolutionBudget')
/**
 * @typedef {Object} SyntaxNode
 * @property {number} id
 * @property {number|null} parentId
 * @property {string} kind
 * @property {number} start
 * @property {number} end
 * @property {string} raw
 * @property {boolean} complete
 * @property {string} [name]
 * @property {number} [contentStart]
 * @property {number} [contentEnd]
 * @property {number} [itemIndex]
 * @property {number[]} [commas]
 * @property {number[]} [pipes]
 */
/** Pure lexical scan. Nodes never contain runtime values or executable behavior. */
function scan(source, options = {}) {
  visit()
  const context=require('../encoders/opaque').currentContext()
  if(!context)return scanFresh(source,options)
  const key=JSON.stringify([source,options.prefix||'${',options.suffix||'}',options.protectVariables!==false,options.protectBraces!==false])
  if(context.syntaxCache.has(key))return context.syntaxCache.get(key)
  const syntax=scanFresh(source,options)
  context.syntaxCache.set(key,syntax)
  return syntax
}
function scanFresh(source, options = {}) {
  const prefix = options.prefix || '${'; const suffix = options.suffix || '}'
  /** @type {SyntaxNode[]} */ const nodes = []
  /** @type {{node:SyntaxNode,close:string,quote:boolean}[]} */ const stack = []
  const diagnostics = []
  /** @param {string} kind @param {number} start */
  function open(kind, start, close, quote = false, extra = {}) {
    const node = { id:nodes.length, parentId:stack.length ? stack[stack.length-1].node.id : null, kind, start, end:source.length, raw:'', complete:false, ...extra }
    nodes.push(node);stack.push({node,close,quote});return node
  }
  function finish(end) { const entry=stack.pop();entry.node.end=end;entry.node.complete=true }
  function escaped(at) { let count=0;for(let j=at-1;j>=0&&source[j]==='\\';j--)count++;return count%2===1 }
  for(let i=0;i<source.length;i++) {
    visit(stack.length)
    const entry=stack[stack.length-1];const ch=source[i]
    // References remain live inside quoted composition; the reference's own quotes are independent.
    if(options.protectVariables !== false && source.startsWith(prefix,i)) {
      open('Reference',i,suffix,false,{contentStart:i+prefix.length,commas:[],pipes:[]})
      i+=prefix.length-1;continue
    }
    if(entry && entry.quote) {
      if(ch===entry.close && !escaped(i))finish(i+1)
      continue
    }
    if(entry && source.startsWith(entry.close,i)) {
      if(entry.node.kind==='Reference')entry.node.contentEnd=i
      finish(i+entry.close.length);i+=entry.close.length-1;continue
    }
    if((ch==='"'||ch==="'") && !escaped(i)) {
      // Mid-word apostrophes are plain data; quotes open items or arguments.
      if(i===0 || /[\s(,[{:|]/.test(source[i-1]))open('Literal',i,ch,true)
      continue
    }
    if(ch==='(') {
      const before=source.slice(0,i);const name=/([\w$]+)\s*$/.exec(before)
      open(name?'Call':'Group',name?i-name[0].length:i,')',false,{name:name&&name[1],contentStart:i+1,commas:[],pipes:[]});continue
    }
    const inPath=entry&&entry.node.kind==='Call'&&(entry.node.name==='file'||entry.node.name==='text')
    if(!inPath&&(ch==='['||(ch==='{'&&options.protectBraces!==false))) {open(ch==='['?'Array':'Object',i,ch==='['?']':'}');continue}
    if(entry && (ch===',' || (ch==='|'&&source[i-1]!=='|'&&source[i+1]!=='|'))) {
      const list=ch===','?entry.node.commas:entry.node.pipes
      if(list)list.push(i)
    }
  }
  for(const entry of stack)diagnostics.push({code:'unclosed_expression',start:entry.node.start,end:source.length,kind:entry.node.kind})
  const originalNodes=nodes.slice()
  for(const node of originalNodes) {
    node.raw=source.slice(node.start,node.end)
    if(node.kind==='Literal') {
      if(originalNodes.some(n=>n.parentId===node.id&&n.kind==='Reference'))node.kind='Composition'
    }
    if(node.kind!=='Reference'&&node.kind!=='Call')continue
    const contentEnd=node.contentEnd===undefined?(node.complete?node.end-(node.kind==='Reference'?suffix.length:1):node.end):node.contentEnd
    node.contentEnd=contentEnd
    const pipes=node.pipes||[];const bodyEnd=pipes.length?pipes[0]:contentEnd
    const commas=(node.commas||[]).filter(p=>p<bodyEnd)
    const stops=[node.contentStart,...commas.map(p=>p+1),bodyEnd+1]
    for(let j=0;j<stops.length-1;j++) {
      const start=stops[j];const end=stops[j+1]-1
      const nested=originalNodes.some(n=>n.start>=start&&n.end<=end&&n.kind==='Reference')
      const raw=source.slice(start,end);const kind=node.kind==='Call'?'Argument':commas.length?'Fallback':nested?'Composition':'Literal'
      const item={id:nodes.length,parentId:node.id,kind,start,end,raw,complete:node.complete,itemIndex:j}
      nodes.push(item)
      // Direct child syntax belongs to its specific fallback/argument item.
      for(const child of originalNodes)if(child.parentId===node.id&&child.start>=start&&child.end<=end)child.parentId=item.id
    }
    for(let j=0;j<pipes.length;j++) {
      const start=pipes[j]+1;const end=j+1<pipes.length?pipes[j+1]:contentEnd
      const filter={id:nodes.length,parentId:node.id,kind:'Filter',start,end,raw:source.slice(start,end),complete:node.complete,itemIndex:j}
      nodes.push(filter)
      for(const child of originalNodes)if(child.parentId===node.id&&child.start>=start&&child.end<=end)child.parentId=filter.id
    }
  }
  for(const node of nodes) {if(node.commas)Object.freeze(node.commas);if(node.pipes)Object.freeze(node.pipes);Object.freeze(node)}
  return Object.freeze({source,prefix,suffix,nodes:Object.freeze(nodes),diagnostics:Object.freeze(diagnostics.map(d=>Object.freeze(d)))})
}
/** Split using the same lexer, protecting nested syntax and quote ranges. */
function splitTopLevel(source, delimiter, options = {}) {
  if(typeof source!=='string')return [source]
  const syntax=scan(source,options)
  const protectedNodes=syntax.nodes.filter(n=>n.parentId===null)
  const parts=[];let start=0;let at=0
  for(let i=0;i<source.length;i++) {
    while(at<protectedNodes.length&&protectedNodes[at].end<=i)at++
    const node=protectedNodes[at]
    if(node&&node.start<=i&&node.end>i){i=node.end-1;continue}
    if(source.startsWith(delimiter,i)&&!(delimiter==='|'&&options.preserveDoublePipe!==false&&(source[i-1]==='|'||source[i+1]==='|'))) {parts.push(source.slice(start,i));i+=delimiter.length-1;start=i+1}
  }
  parts.push(source.slice(start));return parts
}
function references(syntax) {return syntax.nodes.filter(n=>n.kind==='Reference')}
function enclosingReference(syntax,index,exclusive=false) {
  return references(syntax).filter(n=>n.complete&&n.start<=(exclusive?index-1:index)&&n.end>index).sort((a,b)=>b.start-a.start)[0]
}
function parentReference(syntax,node) {let parent=node.parentId;while(parent!==null){const current=syntax.nodes[parent];if(current.kind==='Reference')return current;parent=current.parentId}return undefined}
module.exports={scan,splitTopLevel,references,enclosingReference,parentReference}
