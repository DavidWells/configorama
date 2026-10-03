const {scan,references,parentReference}=require('../expressions/scan')
const {classify}=require('../expressions/ownership')
const {extractVariableWrapper}=require('./variableUtils')
const {getVariableType}=require('./getVariableType')
const {trimSurroundingQuotes:trimQuotes}=require('../strings/quoteUtils')
/** Shared syntax occurrence projection. Discovery never invokes source or filter callbacks. */
function findNestedVariables(input,regex,variablesKnownTypes,location,variableTypes=[],debug=false) {
  if(typeof input!=='string'||!input)return []
  const wrapper=regex?extractVariableWrapper(regex.source):{prefix:'${',suffix:'}'}
  const syntax=scan(input,wrapper)
  const known=new Set(variableTypes.flatMap(source=>(source.prefixes||[source.prefix||source.type]).map(prefix=>prefix+':')))
  const refs=references(syntax).filter(node=>node.complete).sort((a,b)=>a.end-b.end||b.start-a.start)
  const matches=refs.map((node,index)=>{
    const body=input.slice(node.contentStart,node.contentEnd).trim()
    const parent=parentReference(syntax,node)
    const fallbackNodes=syntax.nodes.filter(n=>n.parentId===node.id&&n.kind==='Fallback')
    const source=fallbackNodes.length?fallbackNodes[0].raw.trim():body
    const ownership=classify(source,{...wrapper,knownPrefixes:known})
    // Custom matcher functions are runtime behavior; static classification uses declared prefixes.
    const declarativeTypes=variableTypes.filter(type=>type.match instanceof RegExp)
    const declared=variableTypes.find(type=>(type.prefixes||[type.prefix||type.type]).includes(ownership.type))
    const variableType=declared?declared.type:getVariableType(source,declarativeTypes.length?declarativeTypes:undefined)
    const filters=syntax.nodes.filter(n=>n.parentId===node.id&&n.kind==='Filter').map(n=>n.raw.trim())
    const firstPipe=(node.pipes||[])[0]
    const variableWithoutFilters=firstPipe===undefined?node.raw:input.slice(node.start,firstPipe).trimEnd()+wrapper.suffix
    let ancestor=node.parentId;let role='value'
    while(ancestor!==null){const owner=syntax.nodes[ancestor];if(owner.kind==='Call'&&owner.name==='help'){role='annotation';break}ancestor=owner.parentId}
    const branches=(fallbackNodes.length ? fallbackNodes : [node]).map((item,itemIndex)=>{
      const text=item===node?body:item.raw.trim()
      const inner=refs.find(child=>child.raw===text&&child.start>=item.start&&child.end<=item.end)
      const clean=inner?input.slice(inner.contentStart,inner.contentEnd).trim():text
      const branchOwner=classify(clean,{...wrapper,knownPrefixes:known})
      const quoted=/^(["'])([\s\S]*)\1$/.test(text)
      const literal=!text.includes(wrapper.prefix)&&(quoted||branchOwner.kind==='literal')
      return {itemIndex,source:clean,ownership:branchOwner.kind,variableType:literal?'literal':getVariableType(clean,declarativeTypes.length?declarativeTypes:undefined),discovery:'static-possible',availability:literal?'guaranteed':'conditional',start:item.start,end:item.end}
    })
    const hasGuaranteedFallback=branches.slice(1).some(branch=>branch.availability==='guaranteed')
    const defaultAvailability=filters.length?'conditional':hasGuaranteedFallback?'guaranteed':branches.length>1?'conditional':'none'
    const match={branches,defaultAvailability,filters,variableWithoutFilters,role,variableType,location,originalStringValue:input,varMatch:node.raw,variable:body,varString:body,resolveOrder:index+1,start:node.start,end:node.end,nodeId:node.id,parentNodeId:parent?parent.id:null,occurrenceId:JSON.stringify([location||null,node.start,node.end]),syntaxKind:'reference',ownership:ownership.kind,discovery:'static-possible'}
    if(fallbackNodes.length>1) {
      Object.assign(match,{hasFallback:true,valueBeforeFallback:source,fallbackValues:fallbackNodes.slice(1).map(item=>{
        const text=item.raw.trim();const inner=refs.find(child=>child.start>=item.start&&child.end<=item.end&&child.raw===text)
        const clean=inner?input.slice(inner.contentStart,inner.contentEnd).trim():text
        const owner=classify(clean,{...wrapper,knownPrefixes:known})
        const isVariable=!!inner||owner.kind==='recognized'||owner.kind==='foreign'||owner.kind==='call'
        const value={isVariable,varMatch:text,variable:text}
        if(isVariable)Object.assign(value,{variableType:getVariableType(clean,declarativeTypes.length?declarativeTypes:undefined)})
        else Object.assign(value,{stringValue:trimQuotes(text),isResolvedFallback:true})
        return value
      })})
    }
    return match
  })
  // Carry nested fallback detail by exact span identity, without textual placeholder substitution.
  for(const match of matches)if(match.hasFallback)for(const item of match.fallbackValues){const child=matches.find(m=>m.parentNodeId===match.nodeId&&m.varMatch===item.varMatch);if(child&&child.hasFallback)Object.assign(item,{valueBeforeFallback:child.valueBeforeFallback,fallbackValues:child.fallbackValues})}
  if(debug)console.error(`Discovered ${matches.length} syntax occurrences`)
  return matches
}
module.exports={findNestedVariables}
