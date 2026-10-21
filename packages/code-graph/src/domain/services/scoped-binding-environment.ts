import {
  type BindingFact,
  type BindingScope,
  BindingScopeKind,
  BindingSourceKind,
} from '../value-objects/binding-fact.js'
import { CallForm, type CallFact, type ResolvedDependency } from '../value-objects/call-fact.js'
import { RelationType } from '../value-objects/relation-type.js'
import { SymbolKind } from '../value-objects/symbol-kind.js'
import { type SymbolNode } from '../value-objects/symbol-node.js'
import { type SourceLocation } from '../value-objects/source-location.js'
import { type FileAnalysis } from '../value-objects/file-analysis.js'
import { splitWorkspaceIdentity } from './split-workspace-identity.js'

/**
 * Read-only symbol lookup backed by the indexer's in-memory symbol index.
 */
export interface SymbolLookup {
  /**
   * Finds symbols by exact name, optionally constrained to a file path prefix.
   * @param name - Symbol name to find.
   * @param filePrefix - Optional workspace or file path prefix.
   * @returns Matching symbols in deterministic order.
   */
  findByName(name: string, filePrefix?: string): readonly SymbolNode[]

  /**
   * Finds one symbol by its exact id, in any workspace.
   *
   * Needed to resolve a name that an import binds to a declaration in another workspace.
   * @param symbolId - Symbol id to find.
   * @returns The symbol, or undefined when it is not indexed.
   */
  findById?(symbolId: string): SymbolNode | undefined

  /**
   * Finds all symbols declared in one workspace-prefixed file.
   * @param filePath - File path to inspect.
   * @returns Symbols declared in the file.
   */
  findByFile(filePath: string): readonly SymbolNode[]
}

/**
 * Input for building a per-file scoped binding environment.
 */
export interface BuildScopedBindingEnvironmentInput {
  readonly analysis: FileAnalysis
  readonly importMap: ReadonlyMap<string, string>
  readonly symbolLookup: SymbolLookup
}

/**
 * Pure scoped binding lookup environment for one indexed source file.
 */
export interface ScopedBindingEnvironment {
  /**
   * Looks up visible binding facts by name from a lexical scope.
   * @param name - Visible binding name to resolve.
   * @param scopeId - Starting scope id, or undefined for file/global lookup.
   * @returns Deterministic visible facts, or an empty array.
   */
  lookup(name: string, scopeId: string | undefined): readonly BindingFact[]

  /**
   * Resolves a binding fact to a deterministic target symbol.
   * @param fact - Binding fact to resolve.
   * @returns Resolved target symbol, or undefined when unresolved or ambiguous.
   */
  resolveTargetSymbol(fact: BindingFact): SymbolNode | undefined

  /**
   * Resolves a member/static call receiver to deterministic binding facts.
   * @param call - Call fact containing the receiver name.
   * @returns Visible receiver binding facts, or an empty array.
   */
  resolveReceiver(call: CallFact): readonly BindingFact[]
}

/**
 * Input for resolving binding and call facts into persisted dependency edges.
 */
export interface ResolveDependencyFactsInput {
  readonly environment: ScopedBindingEnvironment
  readonly analysis: FileAnalysis
  readonly symbolLookup: SymbolLookup
}

/**
 * Builds a scoped binding environment from adapter facts and in-memory symbols.
 * @param input - Per-file binding environment inputs.
 * @returns A pure lookup environment for the file.
 */
export function buildScopedBindingEnvironment(
  input: BuildScopedBindingEnvironmentInput,
): ScopedBindingEnvironment {
  const filePath = input.analysis.filePath
  const rootScopeId = filePath

  const defaultFileScope: BindingScope = {
    id: filePath,
    kind: BindingScopeKind.File,
    filePath,
    parentId: undefined,
    ownerSymbolId: undefined,
    start: {
      filePath,
      line: 1,
      column: 0,
      endLine: undefined,
      endColumn: undefined,
    },
    end: undefined,
  }

  const scopesById = new Map<string, BindingScope>([[defaultFileScope.id, defaultFileScope]])
  for (const symbol of input.analysis.symbols) {
    if (!scopesById.has(symbol.id)) {
      scopesById.set(symbol.id, {
        id: symbol.id,
        kind:
          symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Interface
            ? BindingScopeKind.Class
            : symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Function
              ? BindingScopeKind.Function
              : BindingScopeKind.Block,
        filePath,
        parentId:
          symbol.parentId ?? (symbol.id === defaultFileScope.id ? undefined : defaultFileScope.id),
        ownerSymbolId: symbol.id,
        start: {
          filePath,
          line: symbol.line,
          column: symbol.column,
          endLine: symbol.endLine,
          endColumn: symbol.endColumn,
        },
        end: undefined,
      })
    }
  }
  const importFacts = buildImportBindingFacts(input.analysis, input.importMap, rootScopeId)
  const resolvedImportKeys = new Set(importFacts.map((fact) => `${fact.scopeId}\0${fact.name}`))
  const factsByScopeAndName = groupFactsByScopeAndName([
    // A resolved import binding supersedes the adapter's unresolved declaration of the same name.
    ...input.analysis.bindingFacts.filter(
      (fact) =>
        fact.sourceKind !== BindingSourceKind.ImportedType ||
        fact.targetSymbolId !== undefined ||
        !resolvedImportKeys.has(`${fact.scopeId}\0${fact.name}`),
    ),
    ...importFacts,
  ])
  const symbolsById = new Map(input.analysis.symbols.map((symbol) => [symbol.id, symbol]))
  // A name that an import binds to a resolved declaration means that declaration, wherever it
  // lives; it must not be replaced by a same-name symbol of the importing workspace.
  const importedTargetsByScope = new Map(
    importFacts.flatMap((fact) =>
      fact.targetSymbolId === undefined
        ? []
        : [[`${fact.scopeId}\0${fact.name}`, fact.targetSymbolId] as const],
    ),
  )
  // The import visible to a fact is the nearest one up the scope chain, unless a nearer scope
  // declares the same name itself.
  const importedTargets: ImportedTargets = (name, scopeId) => {
    let current = scopesById.get(scopeId)
    while (current !== undefined) {
      const found = importedTargetsByScope.get(`${current.id}\0${name}`)
      if (found !== undefined) return found
      // A non-import binding of the same name in a nearer scope shadows the import.
      if (factsByScopeAndName.get(current.id)?.has(name) === true) return undefined
      current = current.parentId === undefined ? undefined : scopesById.get(current.parentId)
    }
    return undefined
  }

  return {
    lookup: (name, scopeId) =>
      lookupBindingFacts(name, scopeId ?? rootScopeId, scopesById, factsByScopeAndName),
    resolveTargetSymbol: (fact) =>
      resolveBindingTarget(fact, input.symbolLookup, symbolsById, importedTargets),
    resolveReceiver: (call) =>
      resolveReceiverFacts(
        call,
        scopeIdOrRoot(call.scopeId, rootScopeId),
        scopesById,
        factsByScopeAndName,
        input.symbolLookup,
        symbolsById,
        importedTargets,
      ),
  }
}

/**
 * Resolves deterministic binding and call facts into dependency relations.
 * @param input - Facts and lookup dependencies needed for resolution.
 * @returns Resolved dependency edges in deterministic order.
 */
export function resolveDependencyFacts(
  input: ResolveDependencyFactsInput,
): readonly ResolvedDependency[] {
  const dependencies: ResolvedDependency[] = []
  const seen = new Set<string>()

  for (const fact of input.analysis.bindingFacts) {
    if (!isTypeUseSource(fact.sourceKind)) continue
    const sourceSymbol = findEnclosingSymbol(fact.filePath, fact.location, input.analysis.symbols)
    const targetSymbol = input.environment.resolveTargetSymbol(fact)
    if (sourceSymbol === undefined || targetSymbol === undefined) continue
    addDependency(dependencies, seen, {
      sourceSymbolId: sourceSymbol.id,
      targetSymbolId: targetSymbol.id,
      relationType: RelationType.UsesType,
      reason: `type binding:${fact.sourceKind}`,
      location: fact.location,
    })
  }

  for (const call of input.analysis.callFacts) {
    const sourceSymbol = findSymbolById(call.callerSymbolId, input.analysis.symbols)
    const targetSymbol = resolveCallTarget(call, input.environment, input.symbolLookup)
    if (sourceSymbol === undefined || targetSymbol === undefined) continue
    const relationType =
      call.form === CallForm.Constructor ? RelationType.Constructs : RelationType.Calls
    addDependency(dependencies, seen, {
      sourceSymbolId: sourceSymbol.id,
      targetSymbolId: targetSymbol.id,
      relationType,
      reason: `call:${call.form}`,
      location: call.location,
    })
  }

  return dependencies
}

/**
 * Builds binding facts from resolved imports so shared lookup can see them.
 * @param analysis - File analysis.
 * @param importMap - Import map resolving imported local names to symbol IDs.
 * @param rootScopeId - File root scope id.
 * @returns Import-derived binding facts.
 */
function buildImportBindingFacts(
  analysis: FileAnalysis,
  importMap: ReadonlyMap<string, string>,
  rootScopeId: string,
): BindingFact[] {
  const facts: BindingFact[] = []

  for (const declaration of analysis.imports) {
    if (declaration.localName.length === 0) continue
    const targetSymbolId = importMap.get(declaration.localName)
    if (targetSymbolId === undefined) continue
    facts.push({
      name: declaration.localName,
      filePath: analysis.filePath,
      scopeId: rootScopeId,
      sourceKind: BindingSourceKind.ImportedType,
      location: {
        filePath: analysis.filePath,
        line: 1,
        column: 0,
        endLine: undefined,
        endColumn: undefined,
      },
      targetName: declaration.originalName,
      targetSymbolId,
      targetFilePath: undefined,
      metadata: { specifier: declaration.specifier },
    })
  }

  return facts
}

/**
 * Groups facts by scope and visible name.
 * @param facts - Binding facts to group.
 * @returns Nested lookup map keyed by scope id and binding name.
 */
function groupFactsByScopeAndName(
  facts: readonly BindingFact[],
): ReadonlyMap<string, ReadonlyMap<string, readonly BindingFact[]>> {
  const mutable = new Map<string, Map<string, BindingFact[]>>()

  for (const fact of facts) {
    const byName = mutable.get(fact.scopeId) ?? new Map<string, BindingFact[]>()
    const list = byName.get(fact.name) ?? []
    list.push(fact)
    byName.set(fact.name, list)
    mutable.set(fact.scopeId, byName)
  }

  for (const byName of mutable.values()) {
    for (const [name, factsForName] of byName) {
      byName.set(name, sortFacts(factsForName))
    }
  }

  return mutable
}

/**
 * Sorts binding facts by source location for deterministic output.
 * @param facts - Facts to sort.
 * @returns Sorted facts.
 */
function sortFacts(facts: readonly BindingFact[]): BindingFact[] {
  return [...facts].sort((left, right) => {
    if (left.location.line !== right.location.line) return left.location.line - right.location.line
    if (left.location.column !== right.location.column) {
      return left.location.column - right.location.column
    }
    return left.name.localeCompare(right.name)
  })
}

/**
 * Looks up visible binding facts by walking nearest scope to root scope.
 * @param name - Binding name to resolve.
 * @param scopeId - Starting scope id.
 * @param scopesById - Scope lookup map.
 * @param factsByScopeAndName - Grouped fact lookup map.
 * @returns Deterministic visible facts, or an empty array for ambiguity/unresolved names.
 */
function lookupBindingFacts(
  name: string,
  scopeId: string,
  scopesById: ReadonlyMap<string, BindingScope>,
  factsByScopeAndName: ReadonlyMap<string, ReadonlyMap<string, readonly BindingFact[]>>,
): readonly BindingFact[] {
  let currentScopeId: string | undefined = scopeId
  const visited = new Set<string>()

  while (currentScopeId !== undefined) {
    if (visited.has(currentScopeId)) {
      break
    }
    visited.add(currentScopeId)

    const candidates = factsByScopeAndName.get(currentScopeId)?.get(name) ?? []
    const deterministic = selectDeterministicFacts(candidates)
    if (deterministic !== undefined) return deterministic
    currentScopeId = scopesById.get(currentScopeId)?.parentId
  }

  return []
}

/**
 * Selects facts only when same-scope candidates do not contain conflicting targets.
 * @param candidates - Same-scope binding fact candidates.
 * @returns Deterministic facts, undefined when lookup should continue, or empty array when ambiguous.
 */
function selectDeterministicFacts(
  candidates: readonly BindingFact[],
): readonly BindingFact[] | undefined {
  if (candidates.length === 0) return undefined

  const byTarget = new Map<string, BindingFact>()
  for (const candidate of candidates) {
    const key =
      candidate.targetSymbolId ??
      candidate.targetName ??
      candidate.targetFilePath ??
      `${candidate.sourceKind}:${candidate.name}`
    byTarget.set(key, candidate)
  }

  if (byTarget.size > 1) return []
  return [...byTarget.values()]
}

/**
 * Returns a provided scope id or the root scope id.
 * @param scopeId - Optional starting scope id.
 * @param rootScopeId - File root scope id.
 * @returns Effective scope id.
 */
function scopeIdOrRoot(scopeId: string | undefined, rootScopeId: string): string {
  return scopeId ?? rootScopeId
}

/** Finds the declaration id that an import binds a name to, visible from a scope. */
type ImportedTargets = (name: string, scopeId: string) => string | undefined

/**
 * Resolves one binding fact to a deterministic target symbol.
 * @param fact - Binding fact to resolve.
 * @param symbolLookup - In-memory symbol lookup.
 * @param localSymbolsById - Local symbols indexed by id.
 * @param importedTargets - Declaration id that an import-bound name resolves to in a scope.
 * @returns Target symbol, or undefined when unresolved/ambiguous.
 */
function resolveBindingTarget(
  fact: BindingFact,
  symbolLookup: SymbolLookup,
  localSymbolsById: ReadonlyMap<string, SymbolNode>,
  importedTargets: ImportedTargets,
): SymbolNode | undefined {
  if (fact.targetSymbolId !== undefined) {
    const local = localSymbolsById.get(fact.targetSymbolId)
    if (local !== undefined) return local
    // An import fact names its declaration by id; it may live in another workspace.
    const declared = symbolLookup.findById?.(fact.targetSymbolId)
    if (declared !== undefined) return declared
  } else if (fact.targetFilePath === undefined && fact.targetName !== undefined) {
    const importedId = importedTargets(fact.targetName, fact.scopeId)
    if (importedId !== undefined) {
      const imported = localSymbolsById.get(importedId) ?? symbolLookup.findById?.(importedId)
      if (imported !== undefined) return imported
    }
  }

  if (fact.targetName === undefined) return undefined

  const candidates = findTargetCandidates(fact, symbolLookup)
  const matchingId =
    fact.targetSymbolId === undefined
      ? candidates
      : candidates.filter((candidate) => candidate.id === fact.targetSymbolId)
  if (matchingId.length === 1) return matchingId[0]
  return undefined
}

/**
 * Finds target candidates for a binding fact.
 * @param fact - Binding fact to resolve.
 * @param symbolLookup - In-memory symbol lookup.
 * @returns Candidate symbols in deterministic order.
 */
function findTargetCandidates(
  fact: BindingFact,
  symbolLookup: SymbolLookup,
): readonly SymbolNode[] {
  if (fact.targetFilePath !== undefined) {
    return symbolLookup
      .findByFile(fact.targetFilePath)
      .filter((symbol) => symbol.name === fact.targetName)
  }

  const workspacePrefix = extractWorkspacePrefix(fact.filePath)
  return symbolLookup.findByName(fact.targetName ?? fact.name, workspacePrefix)
}

/**
 * Extracts a workspace prefix suitable for symbol lookup.
 * @param filePath - Workspace-prefixed file path.
 * @returns Prefix including `:`, or undefined when no prefix exists.
 */
function extractWorkspacePrefix(filePath: string): string | undefined {
  const identity = splitWorkspaceIdentity(filePath)
  return identity === null ? undefined : `${identity.workspace}:`
}

/**
 * Finds top-level declarations of one file by name; the only non-import resolution allowed.
 * @param filePath - Workspace-prefixed file path of the reference.
 * @param name - Declaration name.
 * @param symbolLookup - In-memory symbol lookup.
 * @returns Matching same-file top-level symbols.
 */
function findSameFileDeclarations(
  filePath: string,
  name: string,
  symbolLookup: SymbolLookup,
): readonly SymbolNode[] {
  return symbolLookup
    .findByFile(filePath)
    .filter((symbol) => symbol.name === name && symbol.parentId === undefined)
}

/**
 * Resolves receiver binding facts for a member/static call.
 * @param call - Call fact with a receiver name.
 * @param scopeId - Effective starting scope id.
 * @param scopesById - Scope lookup map.
 * @param factsByScopeAndName - Grouped binding facts.
 * @param symbolLookup - In-memory symbol lookup.
 * @param localSymbolsById - Local symbols indexed by id.
 * @param importedTargets - Declaration id that an import-bound name resolves to in a scope.
 * @returns Deterministic receiver facts with resolvable targets.
 */
function resolveReceiverFacts(
  call: CallFact,
  scopeId: string,
  scopesById: ReadonlyMap<string, BindingScope>,
  factsByScopeAndName: ReadonlyMap<string, ReadonlyMap<string, readonly BindingFact[]>>,
  symbolLookup: SymbolLookup,
  localSymbolsById: ReadonlyMap<string, SymbolNode>,
  importedTargets: ImportedTargets,
): readonly BindingFact[] {
  if (call.receiverName === undefined) return []
  const facts = lookupBindingFacts(call.receiverName, scopeId, scopesById, factsByScopeAndName)
  if (facts.length === 0) return []
  return facts.filter((fact) =>
    resolveBindingTarget(fact, symbolLookup, localSymbolsById, importedTargets),
  )
}

/**
 * Returns whether a binding source represents a static type-use dependency.
 * @param sourceKind - Binding source kind to inspect.
 * @returns True when the fact should emit USES_TYPE if resolved.
 */
function isTypeUseSource(sourceKind: BindingSourceKind): boolean {
  return (
    sourceKind === BindingSourceKind.Parameter ||
    sourceKind === BindingSourceKind.ReturnType ||
    sourceKind === BindingSourceKind.Property ||
    sourceKind === BindingSourceKind.ImportedType ||
    sourceKind === BindingSourceKind.ClassManaged ||
    sourceKind === BindingSourceKind.Inherited ||
    sourceKind === BindingSourceKind.FrameworkManaged
  )
}

/**
 * Adds a dependency unless an equivalent source/type/target edge already exists.
 * @param dependencies - Dependency accumulator.
 * @param seen - Deduplication key set.
 * @param dependency - Dependency to add.
 */
function addDependency(
  dependencies: ResolvedDependency[],
  seen: Set<string>,
  dependency: ResolvedDependency,
): void {
  if (dependency.sourceSymbolId === dependency.targetSymbolId) return
  const key = `${dependency.sourceSymbolId}:${dependency.relationType}:${dependency.targetSymbolId}`
  if (seen.has(key)) return
  seen.add(key)
  dependencies.push(dependency)
}

/**
 * Finds a local symbol by id when the id is known.
 * @param symbolId - Optional symbol id.
 * @param symbols - Local symbols to inspect.
 * @returns Matching symbol, or undefined.
 */
function findSymbolById(
  symbolId: string | undefined,
  symbols: readonly SymbolNode[],
): SymbolNode | undefined {
  if (symbolId === undefined) return undefined
  return symbols.find((symbol) => symbol.id === symbolId)
}

/**
 * Finds the innermost declaration whose source range contains a location.
 *
 * Containment uses the complete construct range with line and column coordinates and a
 * half-open end. A declaration that merely precedes the location is never a candidate, so an
 * unproven source yields no dependency instead of a guessed one.
 * @param filePath - Workspace-prefixed file path.
 * @param location - Location of the binding syntax.
 * @param symbols - Symbols to inspect.
 * @returns The smallest containing symbol, or undefined when none contains the location.
 */
function findEnclosingSymbol(
  filePath: string,
  location: SourceLocation,
  symbols: readonly SymbolNode[],
): SymbolNode | undefined {
  const position = (line: number, column: number): number => line * 1_000_000 + column
  const at = position(location.line, location.column)
  const containing = symbols.filter((symbol) => {
    if (symbol.filePath !== filePath) return false
    const start = position(symbol.line, symbol.column)
    const end = position(symbol.endLine, symbol.endColumn)
    return start <= at && at < end
  })
  return containing.sort(
    (left, right) =>
      position(left.endLine, left.endColumn) -
        position(left.line, left.column) -
        (position(right.endLine, right.endColumn) - position(right.line, right.column)) ||
      right.line - left.line ||
      right.column - left.column,
  )[0]
}

/**
 * Resolves a call fact to a deterministic target symbol.
 * @param call - Call fact to resolve.
 * @param environment - Scoped binding environment.
 * @param symbolLookup - In-memory symbol lookup.
 * @returns Target symbol, or undefined when unresolved/ambiguous.
 */
function resolveCallTarget(
  call: CallFact,
  environment: ScopedBindingEnvironment,
  symbolLookup: SymbolLookup,
): SymbolNode | undefined {
  const targetName = call.targetName ?? call.name

  if (call.form === CallForm.Member || call.form === CallForm.Static) {
    const receiverFacts = environment.resolveReceiver(call)
    const receiverTargets = receiverFacts
      .map((fact) => environment.resolveTargetSymbol(fact))
      .filter((symbol): symbol is SymbolNode => symbol !== undefined)
    const symbols = receiverTargets.flatMap((receiver) =>
      symbolLookup.findByFile(receiver.filePath).filter((symbol) => symbol.name === call.name),
    )
    return selectSingleSymbol(symbols)
  }

  const bindingTargets = environment
    .lookup(targetName, call.scopeId)
    .map((fact) => environment.resolveTargetSymbol(fact))
    .filter((symbol): symbol is SymbolNode => symbol !== undefined)
  const bindingTarget = selectSingleSymbol(bindingTargets)
  if (bindingTarget !== undefined) return bindingTarget

  return selectSingleSymbol(findSameFileDeclarations(call.filePath, targetName, symbolLookup))
}

/**
 * Selects one symbol candidate only when resolution is deterministic.
 * @param symbols - Candidate symbols.
 * @returns Single deterministic symbol, or undefined.
 */
function selectSingleSymbol(symbols: readonly SymbolNode[]): SymbolNode | undefined {
  const byId = new Map(symbols.map((symbol) => [symbol.id, symbol]))
  return byId.size === 1 ? [...byId.values()][0] : undefined
}
