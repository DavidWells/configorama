const fs=require('node:fs');const path=require('node:path')
const {encodePathIdentity}=require('./pathIdentity');const {resolveAlias}=require('./resolveAlias');const {resolveFilePath}=require('./getFullFilePath')
function originAt(context,segments,authoredFile) {
  const parts=segments||[]
  for(let length=parts.length;length>=0;length--){const found=context.origins.get(encodePathIdentity(parts.slice(0,length)));if(found)return found}
  return {authoredFile,configRoot:context.configRoot,lineage:authoredFile?[JSON.stringify([fs.existsSync(authoredFile)?fs.realpathSync(authoredFile):authoredFile,''])]:[]}
}
function selectFileTarget(requested,root,origin,overrides) {
  const aliased=resolveAlias(requested,root)
  const originCandidate=origin&&origin.authoredFile&&!path.isAbsolute(aliased)?path.resolve(path.dirname(origin.authoredFile),aliased):null
  let lexicalTarget;let selectionReason
  if(path.isAbsolute(aliased)){lexicalTarget=aliased;selectionReason=aliased!==requested?'alias':'absolute'}
  else if(originCandidate&&fs.existsSync(originCandidate)){lexicalTarget=originCandidate;selectionReason='authored-file'}
  else {lexicalTarget=path.resolve(root,aliased);selectionReason='config-root';if(!fs.existsSync(lexicalTarget)){const found=resolveFilePath(aliased,root);if(found!==lexicalTarget){lexicalTarget=found;selectionReason='find-up'}}}
  const originalFilePath=lexicalTarget
  const overrideKey=overrides?Object.keys(overrides).find(key=>key.replace(/^\.\//,'')===requested.replace(/^\.\//,'')):undefined
  if(overrideKey!==undefined){lexicalTarget=resolveFilePath(overrides[overrideKey],root);selectionReason='override'}
  const canonicalTarget=fs.existsSync(lexicalTarget)?fs.realpathSync(lexicalTarget):lexicalTarget
  return {authoredFile:origin&&origin.authoredFile,configRoot:root,requestedPath:requested,lexicalTarget,canonicalTarget,selectionReason,wasOverridden:selectionReason==='override',originalFilePath}
}
module.exports={originAt,selectFileTarget}
