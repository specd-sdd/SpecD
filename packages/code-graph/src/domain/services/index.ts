export { getUpstream } from './get-upstream.js'
export { getDownstream } from './get-downstream.js'
export { analyzeImpact } from './analyze-impact.js'
export { analyzeFileImpact } from './analyze-file-impact.js'
export { analyzeFilesImpact } from './analyze-files-impact.js'
export { isGraphStale } from './is-graph-stale.js'
export { detectChanges } from './detect-changes.js'
export {
  buildScopedBindingEnvironment,
  resolveDependencyFacts,
  type BuildScopedBindingEnvironmentInput,
  type ResolveDependencyFactsInput,
  type ScopedBindingEnvironment,
  type SymbolLookup,
} from './scoped-binding-environment.js'
