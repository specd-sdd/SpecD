import { parse } from '@ast-grep/napi'
import { type SgNode } from '@ast-grep/napi'
import {
  type LanguageAdapter,
  type AdapterAnalyzeContext,
  type AdapterDeclarationPolicy,
  type ImportResolutionContext,
  type ResolvedImports,
  type RelationBuildContext,
} from '../../domain/value-objects/language-adapter.js'
import {
  type SymbolNode,
  type SourceRange,
  createSymbolNode,
} from '../../domain/value-objects/symbol-node.js'
import { type Relation, createRelation } from '../../domain/value-objects/relation.js'
import { SymbolKind } from '../../domain/value-objects/symbol-kind.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
import {
  type ImportDiagnostic,
  type PackageResolutionFacet,
  type ReExportLinkContext,
  type ReExportLinkingFacet,
  type ReExportLinkResult,
  type RelativeImportResolutionFacet,
  type SymbolReferenceSyntaxFacet,
} from '../../domain/value-objects/language-adapter-facets.js'
import { findPackageManifest } from './find-manifest-field.js'
import {
  splitWorkspaceIdentity,
  toPortableGraphPath,
} from '../../domain/services/split-workspace-identity.js'
import {
  parseDottedMemberReference,
  renderDottedMemberReference,
} from '../../domain/services/parse-member-reference.js'
import { type ImportDeclaration } from '../../domain/value-objects/import-declaration.js'
import { ImportDeclarationKind } from '../../domain/value-objects/import-declaration-kind.js'
import { BindingSourceKind, type BindingFact } from '../../domain/value-objects/binding-fact.js'
import { CallForm, type CallFact } from '../../domain/value-objects/call-fact.js'
import { type SourceLocation } from '../../domain/value-objects/source-location.js'
import { ensureLanguagesRegistered } from './register-languages.js'
import {
  type FileAnalysisDraft,
  type FileAnalysis,
} from '../../domain/value-objects/file-analysis.js'
import { type IndexSession } from '../../domain/value-objects/index-session.js'
import {
  MemberAccessor,
  MemberDispatch,
  MemberKind,
  type MemberSemantics,
  SymbolSpace,
  type PublicBinding,
  type ResolutionStep,
  createLocalBinding,
  createPublicBinding,
  type AdapterCapabilities,
  type ReferenceFacts,
} from '../../domain/value-objects/symbol-reference.js'
import {
  buildHierarchyReferenceFacts,
  buildLogicalDeclarationFacts,
  containsSymbolRange,
  createAdapterDeclarationDescriptor,
  createCallableContainmentIndex,
  createDeclarationSymbolIndex,
  createImportedHierarchyMetadata,
  createPhysicalOnlyDeclarationDescriptor,
  type AdapterHierarchyDescriptor,
  type CallableContainmentIndex,
  type DeclarationSymbolIndex,
  getStructuralWorkObserver,
  type StructuralWorkObserver,
  withEnclosingTypeParents,
  WHOLE_FILE_START,
} from './reference-fact-helpers.js'
import {
  type LogicalSymbol,
  type ParsedSymbolReference,
} from '../../domain/value-objects/symbol-reference.js'

/**
 * Determines whether an import declaration is file-only/side-effect only.
 * @param declaration - The import declaration to test.
 * @returns True if the import is file-only.
 */
function isFileOnlyImport(declaration: ImportDeclaration): boolean {
  return (
    declaration.kind === ImportDeclarationKind.SideEffect ||
    declaration.kind === ImportDeclarationKind.Dynamic ||
    declaration.kind === ImportDeclarationKind.Require ||
    declaration.kind === ImportDeclarationKind.Blank
  )
}

/**
 * Reports whether a definition header contains parser error recovery.
 * @param node - `function_definition` or `class_definition` node.
 * @returns True when the header or parameters hold an `ERROR` node.
 */
function headerHasParseError(node: SgNode): boolean {
  const containsError = (candidate: SgNode | null): boolean => {
    if (candidate === null) return false
    if (nodeKind(candidate) === 'ERROR') return true
    return candidate.children().some((child) => containsError(child))
  }
  return (
    node.children().some((child) => nodeKind(child) === 'ERROR') ||
    containsError(node.field('parameters'))
  )
}

const PY_FUNCTION_SCOPE_KINDS = new Set(['function_definition', 'lambda'])

/**
 * Collects names bound by a Python parameter list or assignment target.
 * Default values and annotations are not binding positions.
 * @param node - Parameters or target subtree.
 * @param names - Accumulator of bound names.
 */
function collectPythonBoundNames(node: SgNode, names: Set<string>): void {
  const kind = nodeKind(node)
  if (kind === 'identifier') {
    names.add(node.text().trim())
    return
  }
  if (kind === 'default_parameter' || kind === 'typed_default_parameter') {
    const name = node.field('name')
    if (name !== null) collectPythonBoundNames(name, names)
    return
  }
  if (kind === 'typed_parameter') {
    for (const child of node.children()) {
      if (nodeKind(child) === 'identifier') names.add(child.text().trim())
      else if (
        nodeKind(child) === 'list_splat_pattern' ||
        nodeKind(child) === 'dictionary_splat_pattern'
      ) {
        collectPythonBoundNames(child, names)
      }
    }
    return
  }
  if (kind === 'attribute' || kind === 'subscript' || kind === 'type') return
  for (const child of node.children()) collectPythonBoundNames(child, names)
}

/**
 * Reusable lexical binding lookup for Python functions and lambdas.
 */
export interface PythonLexicalBindingIndex {
  isBound(node: SgNode, name: string): boolean
}

/**
 * Creates one lazy lexical binding index caching bound names per function or lambda scope.
 * @param observer - Optional observer recording structural work.
 * @returns Lexical binding index.
 */
export function createPythonLexicalBindingIndex(
  observer?: StructuralWorkObserver,
): PythonLexicalBindingIndex {
  const scopeCache = new Map<string, ReadonlySet<string>>()

  const getScopeBoundNames = (scopeNode: SgNode): ReadonlySet<string> => {
    const range = scopeNode.range()
    const key = `${nodeKind(scopeNode)}:${range.start.line}:${range.start.column}:${range.end.line}:${range.end.column}`
    const cached = scopeCache.get(key)
    if (cached !== undefined) return cached

    observer?.record('lexical-scope-node-visited')
    const names = new Set<string>()

    const parameters = scopeNode.field('parameters')
    if (parameters !== null) collectPythonBoundNames(parameters, names)

    const body = scopeNode.field('body')
    if (body !== null) {
      const stack: SgNode[] = [body]
      while (stack.length > 0) {
        const candidate = stack.pop()!
        const kind = nodeKind(candidate)
        if (PY_FUNCTION_SCOPE_KINDS.has(kind) || kind === 'class_definition') continue

        if (kind === 'assignment' || kind === 'augmented_assignment') {
          const left = candidate.field('left')
          if (left !== null) collectPythonBoundNames(left, names)
        } else if (kind === 'for_statement' || kind === 'for_in_clause') {
          const left = candidate.field('left')
          if (left !== null) collectPythonBoundNames(left, names)
        } else if (kind === 'as_pattern') {
          const alias = candidate.field('alias')
          if (alias !== null) collectPythonBoundNames(alias, names)
        } else if (kind === 'named_expression') {
          const target = candidate.field('name')
          if (target !== null) collectPythonBoundNames(target, names)
        }

        for (const child of candidate.children()) {
          stack.push(child)
        }
      }
    }

    scopeCache.set(key, names)
    return names
  }

  return {
    isBound(node: SgNode, name: string): boolean {
      let current = node.parent()
      while (current !== null) {
        if (PY_FUNCTION_SCOPE_KINDS.has(nodeKind(current))) {
          const bound = getScopeBoundNames(current)
          if (bound.has(name)) return true
        }
        current = current.parent()
      }
      return false
    },
  }
}

/**
 * Returns whether a bare call target is rebound inside the enclosing function by a parameter,
 * assignment, loop variable or `as` binding, so it cannot reach an imported or module callable.
 * @param node - Call node.
 * @param name - Callee identifier.
 * @param bindings - Reusable lexical binding index for enclosing scopes.
 * @returns True when an enclosing function scope binds the name locally.
 */
function isPythonShadowedByEnclosingScope(
  node: SgNode,
  name: string,
  bindings: PythonLexicalBindingIndex,
): boolean {
  return bindings.isBound(node, name)
}

/**
 * Returns the string kind of an AST node.
 * @param node - The AST node.
 * @returns The node kind string.
 */
function nodeKind(node: SgNode): string {
  return String(node.kind())
}

/**
 * Extracts the preceding comment text for a node, if any.
 * @param node - The AST node.
 * @returns The comment text, or undefined.
 */
function extractComment(node: SgNode): string | undefined {
  const prev = node.prev()
  if (prev && nodeKind(prev) === 'comment') {
    return prev.text()
  }
  return undefined
}

/**
 * Checks whether a function_definition node is a method (nested inside a class body).
 * @param node - The function_definition AST node.
 * @returns True if the function is inside a class definition.
 */
function isMethod(node: SgNode): boolean {
  // Hierarchy: class_definition > block > function_definition
  const parent = node.parent()
  const block = parent && nodeKind(parent) === 'decorated_definition' ? parent.parent() : parent
  if (!block || nodeKind(block) !== 'block') return false
  const classDef = block.parent()
  return classDef !== null && nodeKind(classDef) === 'class_definition'
}

/**
 * Normalizes a Python base-class reference to its terminal name.
 * @param reference - Raw base-class expression.
 * @returns The normalized local/import name.
 */
function normalizePythonTypeName(reference: string): string {
  return reference.trim().split('.').at(-1) ?? reference.trim()
}

/**
 * Direct member evidence for a class in Python.
 */
export interface PythonDirectMemberEvidence {
  readonly ownerSymbolId: string
  readonly symbol: SymbolNode
  readonly definitionNode: SgNode
  readonly decorators: readonly string[]
}

/**
 * Classifies a Python method from its name and precomputed direct-member evidence.
 * @param symbol - Extracted method declaration symbol.
 * @param member - Direct member evidence containing decorator tokens.
 * @returns Proven shared member form.
 */
function pythonMemberSemantics(
  symbol: SymbolNode,
  member: PythonDirectMemberEvidence,
): MemberSemantics {
  if (symbol.name === '__init__' || symbol.name === '__new__') {
    return { kind: MemberKind.Constructor }
  }
  const decorators = member.decorators
  const dispatch = decorators.some((text) => text === 'staticmethod' || text === 'classmethod')
    ? MemberDispatch.Static
    : MemberDispatch.Instance
  if (decorators.some((text) => text.endsWith('.setter'))) {
    return { kind: MemberKind.Property, dispatch, accessor: MemberAccessor.Set }
  }
  if (decorators.some((text) => text === 'property')) {
    return { kind: MemberKind.Property, dispatch, accessor: MemberAccessor.Get }
  }
  return { kind: MemberKind.Method, dispatch }
}

/**
 * Collects direct member evidence from a Python class block without descending into nested bodies.
 * @param classNode - Class definition AST node.
 * @param ownerSymbol - Symbol corresponding to the class.
 * @param symbols - Declaration symbol index for exact symbol lookup.
 * @param observer - Optional observer recording structural work.
 * @returns Array of direct member evidence in source order.
 */
export function collectPythonDirectMemberEvidence(
  classNode: SgNode,
  ownerSymbol: SymbolNode,
  symbols: DeclarationSymbolIndex,
  observer?: StructuralWorkObserver,
): readonly PythonDirectMemberEvidence[] {
  const block = classNode.field('body') ?? classNode.children().find((c) => nodeKind(c) === 'block')
  if (!block) return []

  const results: PythonDirectMemberEvidence[] = []

  for (const child of block.children()) {
    observer?.record('owner-member-node-visited')
    const k = nodeKind(child)

    if (k === 'function_definition' || k === 'async_function_definition') {
      const name = child.field('name')?.text().trim()
      if (!name) continue
      const line = child.range().start.line + 1
      const col = child.range().start.column
      const symbol = symbols.find(SymbolKind.Method, name, line, col)
      if (!symbol) continue
      results.push({
        ownerSymbolId: ownerSymbol.id,
        symbol,
        definitionNode: child,
        decorators: [],
      })
    } else if (k === 'decorated_definition') {
      const decorators: string[] = []
      let defNode: SgNode | undefined

      for (const grandChild of child.children()) {
        const gk = nodeKind(grandChild)
        if (gk === 'decorator') {
          decorators.push(grandChild.text().replace(/^@\s*/, '').trim())
        } else if (gk === 'function_definition' || gk === 'async_function_definition') {
          defNode = grandChild
        }
      }

      if (defNode) {
        const name = defNode.field('name')?.text().trim()
        if (!name) continue
        const line = defNode.range().start.line + 1
        const col = defNode.range().start.column
        const symbol = symbols.find(SymbolKind.Method, name, line, col)
        if (!symbol) continue
        results.push({
          ownerSymbolId: ownerSymbol.id,
          symbol,
          definitionNode: defNode,
          decorators,
        })
      }
    } else if (k === 'expression_statement') {
      const firstChild = child.child(0)
      if (firstChild && nodeKind(firstChild) === 'assignment') {
        const left = firstChild.field('left')
        if (left && nodeKind(left) === 'identifier') {
          const name = left.text()
          const line = child.range().start.line + 1
          const col = child.range().start.column
          const symbol = symbols.find(SymbolKind.Property, name, line, col)
          if (!symbol) continue
          results.push({
            ownerSymbolId: ownerSymbol.id,
            symbol,
            definitionNode: child,
            decorators: [],
          })
        }
      }
    }
  }

  return results
}

/**
 * Recursively collects all descendant nodes whose kind is in the given set.
 * @param node - The root node to traverse.
 * @param kinds - Set of node kind strings to collect.
 * @param results - Accumulator array that matching nodes are pushed into.
 */
function collectByKind(node: SgNode, kinds: Set<string>, results: SgNode[]): void {
  if (kinds.has(nodeKind(node))) {
    results.push(node)
  }
  for (const child of node.children()) {
    collectByKind(child, kinds, results)
  }
}

/**
 * Candidate files for one Python module path under a package root.
 * @param root - Workspace-prefixed directory of the top-level package.
 * @param modulePath - Module path under that root, using `/`, or empty for the package itself.
 * @returns Candidate file paths, most specific file forms first.
 */
function pythonModuleCandidates(root: string, modulePath: string): string[] {
  if (modulePath === '') {
    return [`${root}/__init__.py`, `${root}/__init__.pyi`]
  }
  return [
    `${root}/${modulePath}.py`,
    `${root}/${modulePath}.pyi`,
    `${root}/${modulePath}/__init__.py`,
    `${root}/${modulePath}/__init__.pyi`,
  ]
}

/**
 * Top-level package directory that contains an entry file.
 * @param entryPath - Workspace-prefixed package entry.
 * @param firstSegment - First dotted segment of an absolute import.
 * @returns `<workspace>:src/<segment>` or `<workspace>:<segment>`, or undefined when the entry is outside that package.
 */
function pythonTopLevelPackageDir(entryPath: string, firstSegment: string): string | undefined {
  const identity = splitWorkspaceIdentity(entryPath)
  if (identity === null || firstSegment.length === 0) return undefined
  for (const root of [`src/${firstSegment}`, firstSegment]) {
    if (identity.relativePath === root || identity.relativePath.startsWith(`${root}/`)) {
      return `${identity.workspace}:${root}`
    }
  }
  return undefined
}

/**
 * Converts an AST node range into a source location.
 * @param node - AST node to locate.
 * @param filePath - Workspace-prefixed source path.
 * @returns Source location for the node.
 */
function locationOf(node: SgNode, filePath: string): SourceLocation {
  const r = node.range()
  return {
    filePath,
    line: r.start.line + 1,
    column: r.start.column,
    endLine: r.end.line + 1,
    endColumn: r.end.column,
  }
}

/**
 * Converts an AST node range into a source range.
 * @param node - AST node to locate.
 * @returns Source range for the node.
 */
function rangeOf(node: SgNode): SourceRange {
  const r = node.range()
  return {
    startLine: r.start.line + 1,
    startColumn: r.start.column,
    endLine: r.end.line + 1,
    endColumn: r.end.column,
  }
}

const PY_CALLABLE_KINDS = new Set<SymbolKind>([SymbolKind.Function, SymbolKind.Method])

/**
 * Represents a Python class declaration and the methods defined within it.
 */
interface PythonClassInfo {
  readonly name: string
  readonly symbolId: string
  readonly kind: 'class' | 'interface'
  readonly baseNames: readonly string[]
  /** Parser range of each written base expression, aligned with `baseNames`. */
  readonly baseRanges: readonly SourceRange[]
  readonly ownerSymbolId?: string
  readonly indent: number
  readonly endLine: number
  readonly methodsByName: ReadonlyMap<string, string>
  readonly memberSymbolIds: readonly string[]
  readonly memberFormsById: ReadonlyMap<string, MemberSemantics>
}

/**
 * Serialized Python class info for parser state.
 */
interface SerializedPythonClassInfo {
  readonly name: string
  readonly symbolId: string
  readonly kind: 'class' | 'interface'
  readonly baseNames: readonly string[]
  /** Parser range of each written base expression, aligned with `baseNames`. */
  readonly baseRanges: readonly SourceRange[]
  readonly ownerSymbolId?: string
  readonly indent: number
  readonly endLine: number
  readonly methodsByName: Record<string, string>
  readonly memberSymbolIds: readonly string[]
  readonly memberFormsById: Readonly<Record<string, MemberSemantics>>
}

/**
 * Stored field type fact for RelationType.UsesType generation.
 */
interface PythonFieldTypeFact {
  readonly fieldSymbolId: string
  readonly typeName: string
}

/** One `from` import at module level of a package entry that can publish a name. */
interface PythonReExportInfo {
  /** Number of leading dots; 0 for an absolute import. */
  readonly level: number
  /** Dotted module text after the dots; empty for `from . import x`. */
  readonly module: string
  /** Name imported from the module. */
  readonly importedName: string
  /** Name bound in the entry file (alias when present, otherwise importedName). */
  readonly boundName: string
}

/** Classification of `__all__` in one Python module. */
interface PythonAllInfo {
  /**
   * `absent`: no `__all__`.
   * `static`: module-level list, parenthesized tuple, or unparenthesized tuple of plain strings.
   * `dynamic`: anything else, including bytes literals.
   */
  readonly kind: 'absent' | 'static' | 'dynamic'
  /** Listed names when kind is `static`; empty otherwise. */
  readonly names: readonly string[]
}

/**
 * Parser state representation for Python.
 */
interface PythonParserState {
  readonly kind: 'python'
  readonly classes: readonly SerializedPythonClassInfo[]
  readonly fieldTypes?: readonly PythonFieldTypeFact[]
  /** Direct module-level `from` imports. Present only for package entry files. */
  readonly reExports?: readonly PythonReExportInfo[]
  /** `__all__` classification. Present only for package entry files. */
  readonly allExport?: PythonAllInfo
}

/**
 * Language adapter for Python files using tree-sitter via ast-grep.
 * Extracts functions, classes, methods, and module-level assignments.
 */
export class PythonLanguageAdapter implements LanguageAdapter {
  private readonly packageResolutionFacet: PackageResolutionFacet = {
    identity: (codeRoot, repoRoot, report) => this.getPackageIdentity(codeRoot, repoRoot, report),
    // Python package facts come from the package map and the indexed file set, so there is
    // nothing to read per workspace.
    prepare: () => undefined,
    matchSpecifier: (specifier, knownPackages) =>
      this.resolvePackageFromSpecifier(specifier, [...knownPackages]),
    entrySurface: (request) => {
      const [topLevel, ...rest] = request.specifier.split('.')
      if (topLevel === undefined || topLevel === '') return []
      const modulePath = rest.join('/')
      const candidates: string[] = []
      // The package directory sits at the code root or under `src/`.
      for (const root of [
        `${request.workspace}:src/${topLevel}`,
        `${request.workspace}:${topLevel}`,
      ]) {
        candidates.push(...pythonModuleCandidates(root, modulePath))
      }
      const indexed = candidates.filter(
        (candidate) => request.session.getFileId(candidate) !== undefined,
      )
      return (
        indexed
          // A stub next to its source describes the same module; the source is the entry.
          .filter(
            (candidate) => !candidate.endsWith('.pyi') || !indexed.includes(candidate.slice(0, -1)),
          )
          // The public surface of a module is its path without extension or `__init__`.
          .map((filePath) => ({
            filePath,
            surface: filePath.replace(/(?:\/__init__)?\.pyi?$/, ''),
          }))
      )
    },
  }

  /**
   * Package identity, specifier matching, and the package entry surface.
   * @returns The facet this adapter provides.
   */
  get packageResolution(): PackageResolutionFacet {
    return this.packageResolutionFacet
  }

  private readonly relativeImportResolutionFacet: RelativeImportResolutionFacet = {
    resolve: (fromFile, specifier) => this.resolveRelativeImportPath(fromFile, specifier),
  }

  /**
   * Relative module specifier to candidate files.
   * @returns The facet this adapter provides.
   */
  get relativeImportResolution(): RelativeImportResolutionFacet {
    return this.relativeImportResolutionFacet
  }

  private readonly symbolReferenceSyntaxFacet: SymbolReferenceSyntaxFacet = {
    parse: (text) => this.parseSymbolReference(text),
    render: (symbol, ownerPath) => this.renderSymbolReference(symbol, ownerPath),
  }

  /**
   * Member reference syntax.
   * @returns The facet this adapter provides.
   */
  get symbolReferenceSyntax(): SymbolReferenceSyntaxFacet {
    return this.symbolReferenceSyntaxFacet
  }

  /**
   * Named re-export routes through package entry files.
   * @returns The facet this adapter provides.
   */
  get reExportLinking(): ReExportLinkingFacet {
    return { link: (context) => this.linkReExports(context) }
  }

  /**
   * Declares deterministic Python reference semantics.
   * @returns Supported reference capabilities.
   */
  capabilities(): AdapterCapabilities {
    return {
      declarations: true,
      members: true,
      publicBindings: true,
      localBindings: true,
      hierarchy: true,
      buildContext: false,
    }
  }

  /**
   * Declares parser authority and callable container policy for Python.
   * @returns Python declaration policy.
   */
  declarationPolicy(): AdapterDeclarationPolicy {
    return {
      languageIds: this.languages(),
      callableContainerKinds: PY_CALLABLE_KINDS,
      supportsLogicalDeclarationGroups: false,
      supportsPhysicalOnlyDeclarations: true,
      structuralFactsAreParserAuthoritative: true,
    }
  }
  /**
   * Returns the language identifiers this adapter handles.
   * @returns An array containing 'python'.
   */
  languages(): string[] {
    return ['python']
  }

  /**
   * Parses one Python dotted member spelling.
   * @param text - Human reference text.
   * @returns One owner-then-member candidate, or none.
   */
  private parseSymbolReference(text: string): ParsedSymbolReference {
    return parseDottedMemberReference(text)
  }

  /**
   * Renders a Python member with the generic dotted spelling.
   * @param symbol - Logical symbol.
   * @param ownerPath - Owner simple names.
   * @returns Generic dotted spelling.
   */
  private renderSymbolReference(
    symbol: LogicalSymbol,
    ownerPath: readonly string[],
  ): { readonly generic: string } {
    return renderDottedMemberReference(symbol, ownerPath)
  }

  /**
   * Returns the file extension to language ID mapping for Python.
   * @returns Extension-to-language map.
   */
  extensions(): Record<string, string> {
    return { '.py': 'python', '.pyi': 'python' }
  }

  /**
   * Analyzes a Python file.
   * @param filePath - Path of the file.
   * @param content - File content.
   * @param context - The adapter analyze context.
   * @returns Extracted file analysis draft.
   */
  analyzeFile(
    filePath: string,
    content: string,
    context: AdapterAnalyzeContext,
  ): FileAnalysisDraft {
    ensureLanguagesRegistered()
    const sgRoot = parse('python', content)
    // Register the parsed root in the session's parser resource scope for epoch lifecycle management.
    context.session.parserResources.register(sgRoot)
    const root = sgRoot.root()
    const symbols: SymbolNode[] = []
    const seenSymbol = new Set<string>()

    const fieldTypes: PythonFieldTypeFact[] = []

    const addSymbol = (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      selectionNode: SgNode | null | undefined,
      comment: string | undefined,
    ): SymbolNode | undefined => {
      if (!selectionNode) return undefined
      const line = node.range().start.line + 1
      const col = node.range().start.column
      const key = `${kind}:${name}:${line}:${col}`
      if (seenSymbol.has(key)) return undefined
      try {
        const symbol = createSymbolNode({
          name,
          kind,
          filePath,
          line,
          column: node.range().start.column,
          endLine: node.range().end.line + 1,
          endColumn: node.range().end.column,
          selectionRange: {
            startLine: selectionNode.range().start.line + 1,
            startColumn: selectionNode.range().start.column,
            endLine: selectionNode.range().end.line + 1,
            endColumn: selectionNode.range().end.column,
          },
          comment,
        })
        seenSymbol.add(key)
        symbols.push(symbol)
        return symbol
      } catch (error) {
        if (!(error instanceof RangeError)) throw error
        return undefined
      }
    }

    this.walk(root, addSymbol, (fieldSymbolId, typeName) => {
      fieldTypes.push({ fieldSymbolId, typeName })
    })

    // Extract imports
    const imports: ImportDeclaration[] = []
    const seenImport = new Set<string>()
    const addImport = (declaration: ImportDeclaration): void => {
      const key = `${declaration.kind ?? ImportDeclarationKind.Named}:${declaration.localName}:${declaration.originalName}:${declaration.specifier}`
      if (seenImport.has(key)) return
      seenImport.add(key)
      imports.push(declaration)
    }

    // Imports inside functions, classes and conditional blocks bind names too.
    const importNodes: SgNode[] = []
    collectByKind(root, new Set(['import_statement', 'import_from_statement']), importNodes)
    for (const child of importNodes) {
      const kind = nodeKind(child)

      if (kind === 'import_statement') {
        for (const nameChild of child.children()) {
          if (nodeKind(nameChild) === 'dotted_name') {
            const name = nameChild.text()
            addImport({
              originalName: name,
              localName: name.split('.')[0] ?? name,
              specifier: name,
              isRelative: false,
              kind: ImportDeclarationKind.Namespace,
            })
          } else if (nodeKind(nameChild) === 'aliased_import') {
            const dottedName = nameChild.child(0)
            const alias = nameChild.field('alias')
            if (dottedName) {
              const name = dottedName.text()
              addImport({
                originalName: name,
                localName: alias ? alias.text() : name,
                specifier: name,
                isRelative: false,
                kind: ImportDeclarationKind.Namespace,
              })
            }
          }
        }
      } else if (kind === 'import_from_statement') {
        const moduleNode = child.field('module_name')
        const specifier = moduleNode ? moduleNode.text() : ''
        const isRelative = specifier.startsWith('.')
        const moduleNodeId = moduleNode?.id()

        let seenImportKeyword = false
        for (const nameChild of child.children()) {
          if (!nameChild.isNamed() && nameChild.text() === 'import') {
            seenImportKeyword = true
            continue
          }
          if (nodeKind(nameChild) === 'dotted_name') {
            if (!seenImportKeyword || nameChild.id() === moduleNodeId) continue
            const name = nameChild.text()
            addImport({
              originalName: name,
              localName: name,
              specifier,
              isRelative,
              kind: ImportDeclarationKind.Named,
            })
          } else if (nodeKind(nameChild) === 'aliased_import') {
            const dottedName = nameChild.child(0)
            const alias = nameChild.field('alias')
            if (dottedName) {
              const name = dottedName.text()
              addImport({
                originalName: name,
                localName: alias ? alias.text() : name,
                specifier,
                isRelative,
                kind: ImportDeclarationKind.Named,
              })
            }
          }
        }
      }
    }

    const callNodes: SgNode[] = []
    collectByKind(root, new Set(['call']), callNodes)
    for (const callNode of callNodes) {
      const fn = callNode.field('function') ?? callNode.child(0)
      if (!fn) continue
      const fnKind = nodeKind(fn)
      let isDynamic = false
      if (fnKind === 'identifier' && fn.text().trim() === '__import__') {
        isDynamic = true
      } else if (fnKind === 'attribute') {
        const obj = fn.field('object')
        const attr = fn.field('attribute')
        if (obj?.text().trim() === 'importlib' && attr?.text().trim() === 'import_module') {
          isDynamic = true
        }
      }
      if (!isDynamic) continue

      const argsNode =
        callNode.field('arguments') ??
        callNode.children().find((c) => nodeKind(c) === 'argument_list')
      if (!argsNode) continue
      for (const arg of argsNode.children()) {
        const ak = nodeKind(arg)
        if (ak === 'string') {
          const specifier = arg
            .text()
            .replace(/^['"]|['"]$/g, '')
            .trim()
          if (specifier) {
            addImport({
              originalName: '',
              localName: '',
              specifier,
              isRelative: specifier.startsWith('.'),
              kind: ImportDeclarationKind.Dynamic,
            })
          }
          break
        }
        if (ak !== '(' && ak !== ')' && ak !== ',' && ak !== 'comment') {
          break
        }
      }
    }

    const observer = getStructuralWorkObserver(this)
    const declarationIndex = createDeclarationSymbolIndex(symbols, observer)
    const callableIndex = createCallableContainmentIndex(
      symbols,
      { callableKinds: PY_CALLABLE_KINDS },
      observer,
    )
    const lexicalIndex = createPythonLexicalBindingIndex(observer)

    const bindingFacts = this.extractBindingFactsFromData(filePath, symbols, imports, root)
    const callFacts = [
      ...this.extractCallFactsFromData(filePath, symbols, root, callableIndex, lexicalIndex),
      ...this.extractDecoratorCallFacts(root, filePath, symbols, declarationIndex),
    ]

    const classes = this.collectClassInfo(root, filePath, symbols, declarationIndex, observer)
    const serializedClasses = classes.map((cls) => {
      const methodsByName: Record<string, string> = {}
      const memberFormsById: Record<string, MemberSemantics> = {}
      for (const [mName, mId] of cls.methodsByName.entries()) {
        methodsByName[mName] = mId
      }
      for (const [memberId, form] of cls.memberFormsById) memberFormsById[memberId] = form
      return {
        ...cls,
        methodsByName,
        memberFormsById,
      }
    })

    const referenceFacts = this.buildReferenceFacts(
      context.workspaceName,
      filePath,
      symbols,
      imports,
      classes,
    )
    const entryFacts = /(^|\/)__init__\.pyi?$/.test(filePath)
      ? this.extractReExports(root)
      : undefined
    return {
      language: 'python',
      symbols: withEnclosingTypeParents(symbols),
      imports,
      bindingFacts,
      callFacts,
      referenceFacts,
      parserState: {
        kind: 'python',
        classes: serializedClasses,
        fieldTypes,
        ...(entryFacts !== undefined
          ? { reExports: entryFacts.reExports, allExport: entryFacts.allExport }
          : {}),
      },
    }
  }

  /**
   * Collects module-level re-export routes and classifies `__all__`.
   * Only direct children of the module are routes. `from . import name` is recorded
   * with an empty module and is not a source route. Nested and conditional imports are ignored.
   * @param root - Parsed module root.
   * @returns Routes and the `__all__` classification.
   */
  private extractReExports(root: SgNode): {
    readonly reExports: PythonReExportInfo[]
    readonly allExport: PythonAllInfo
  } {
    const reExports: PythonReExportInfo[] = []
    for (const child of root.children()) {
      if (nodeKind(child) !== 'import_from_statement') continue
      if (child.children().some((item) => nodeKind(item) === 'wildcard_import')) continue
      const moduleNode = child.field('module_name')
      const moduleText = moduleNode?.text() ?? ''
      const dots = /^\.*/.exec(moduleText)?.[0].length ?? 0
      const module = moduleText.slice(dots)
      const moduleId = moduleNode?.id()
      let seenImportKeyword = false
      for (const nameChild of child.children()) {
        if (!nameChild.isNamed() && nameChild.text() === 'import') {
          seenImportKeyword = true
          continue
        }
        if (!seenImportKeyword) continue
        if (nodeKind(nameChild) === 'dotted_name') {
          if (nameChild.id() === moduleId) continue
          const importedName = nameChild.text()
          if (importedName.length === 0) continue
          reExports.push({ level: dots, module, importedName, boundName: importedName })
        } else if (nodeKind(nameChild) === 'aliased_import') {
          const imported = nameChild.field('name') ?? nameChild.child(0)
          const alias = nameChild.field('alias')
          const importedName = imported?.text() ?? ''
          if (importedName.length === 0) continue
          reExports.push({
            level: dots,
            module,
            importedName,
            boundName: alias?.text() || importedName,
          })
        }
      }
    }
    return { reExports, allExport: this.classifyPythonAll(root) }
  }

  /**
   * Classifies every `__all__` reference in a module.
   * A read such as `"X" in __all__` is dynamic: the public list cannot be proven.
   * Annotated assignments stay static because they are still `assignment` nodes.
   * An unparenthesized tuple (`__all__ = "A", "B"`) is an `expression_list` and stays static.
   * A bytes literal is not a plain string, so it makes the list dynamic.
   * @param root - Parsed module root.
   * @returns Absent, static, or dynamic.
   */
  private classifyPythonAll(root: SgNode): PythonAllInfo {
    const names: string[] = []
    let seen = false
    let dynamic = false
    const visit = (node: SgNode): void => {
      if (nodeKind(node) === 'identifier' && node.text() === '__all__') {
        seen = true
        const parent = node.parent()
        const collected = parent ? this.staticAllNames(parent) : undefined
        if (collected === undefined) dynamic = true
        else names.push(...collected)
      }
      for (const child of node.children()) visit(child)
    }
    visit(root)
    if (!seen) return { kind: 'absent', names: [] }
    if (dynamic) return { kind: 'dynamic', names: [] }
    const unique: string[] = []
    const used = new Set<string>()
    for (const name of names) {
      if (used.has(name)) continue
      used.add(name)
      unique.push(name)
    }
    return { kind: 'static', names: unique }
  }

  /**
   * Reads literal names from a module-level `__all__` assignment.
   * @param assignment - Parent of an `__all__` identifier.
   * @returns Listed names, or undefined when the assignment is not a static module-level update.
   */
  private staticAllNames(assignment: SgNode): readonly string[] | undefined {
    const kind = nodeKind(assignment)
    if (kind !== 'assignment' && kind !== 'augmented_assignment') return undefined
    const statement = assignment.parent()
    const moduleNode =
      statement && nodeKind(statement) === 'expression_statement' ? statement.parent() : statement
    if (!moduleNode || nodeKind(moduleNode) !== 'module') return undefined
    if (kind === 'augmented_assignment') {
      const operator = assignment
        .children()
        .find((child) => !child.isNamed())
        ?.text()
      if (operator !== '+=') return undefined
    }
    const right = assignment.field('right')
    if (!right) return undefined
    return this.staticStringCollection(right)
  }

  /**
   * Reads a list, parenthesized tuple, unparenthesized tuple, or `+` concatenation of plain string literals.
   * @param node - Right-hand side.
   * @returns String values, or undefined when any element is not a plain literal.
   */
  private staticStringCollection(node: SgNode): readonly string[] | undefined {
    const kind = nodeKind(node)
    if (kind === 'list' || kind === 'tuple' || kind === 'expression_list') {
      const names: string[] = []
      for (const child of node.children()) {
        if (!child.isNamed()) continue
        const value = this.plainPythonString(child)
        if (value === undefined) return undefined
        names.push(value)
      }
      return names
    }
    if (kind === 'binary_operator') {
      const operator = node
        .children()
        .find((child) => !child.isNamed())
        ?.text()
      if (operator !== '+') return undefined
      const left = node.field('left')
      const right = node.field('right')
      if (!left || !right) return undefined
      const leftNames = this.staticStringCollection(left)
      const rightNames = this.staticStringCollection(right)
      if (!leftNames || !rightNames) return undefined
      return [...leftNames, ...rightNames]
    }
    return undefined
  }

  /**
   * Returns the text of a non-interpolated string literal.
   * Bytes literals (`b"..."`, `br"..."`) are rejected so `__all__` stays dynamic.
   * @param node - Candidate string node.
   * @returns The literal contents, or undefined.
   */
  private plainPythonString(node: SgNode): string | undefined {
    if (nodeKind(node) !== 'string') return undefined
    const start = node.children().find((child) => nodeKind(child) === 'string_start')
    if (start !== undefined && /b/i.test(start.text())) return undefined
    if (node.children().some((child) => nodeKind(child) === 'interpolation')) return undefined
    const contents = node.children().filter((child) => nodeKind(child) === 'string_content')
    if (contents.length !== 1) return undefined
    return contents[0]?.text()
  }

  /**
   * Publishes names that package entry files re-export through static imports.
   * An `__init__.pyi` whose `__init__.py` sibling is indexed is not an entry.
   * @param context - Session and package map used to resolve absolute routes.
   * @returns Bindings and steps that did not already exist.
   */
  private linkReExports(context: ReExportLinkContext): ReExportLinkResult {
    const session = context.session
    const files = [...session.getAllFilePaths()]
      .sort()
      .map((filePath) => {
        if (
          filePath.endsWith('__init__.pyi') &&
          session.getFileId(filePath.slice(0, -1)) !== undefined
        ) {
          return undefined
        }
        const state = session.getAnalysis(filePath)?.parserState
        if (state?.kind !== 'python') return undefined
        const python = state as unknown as PythonParserState
        if (python.reExports === undefined || python.reExports.length === 0) return undefined
        if (python.allExport?.kind === 'dynamic') return undefined
        return { filePath, reExports: python.reExports, allExport: python.allExport }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)

    const created = new Map<string, PublicBinding>()
    const emitted: PublicBinding[] = []
    const steps: ResolutionStep[] = []
    const lookup = (
      surface: string,
      name: string,
      space: SymbolSpace,
    ): readonly PublicBinding[] => {
      const local = created.get(`${surface}\u0000${name}\u0000${space}`)
      const stored = session.findPublicBindings(surface, name, space)
      return local === undefined ? stored : [...stored, local]
    }

    let guard = files.length + 1
    let added = true
    while (added && guard > 0) {
      added = false
      guard -= 1
      for (const file of files) {
        const allowed =
          file.allExport?.kind === 'static' ? new Set(file.allExport.names) : undefined
        const surfaceF = file.filePath.replace(/(?:\/__init__)?\.pyi?$/, '')
        for (const route of file.reExports) {
          if (allowed !== undefined && !allowed.has(route.boundName)) continue
          const source = this.resolvePythonRoute(
            session,
            file.filePath,
            route,
            context.packageToWorkspace,
          )
          if (source === undefined) continue
          const surfaceS = source.replace(/(?:\/__init__)?\.pyi?$/, '')
          for (const space of [SymbolSpace.Value, SymbolSpace.Type]) {
            const matches = lookup(surfaceS, route.importedName, space).filter(
              (binding) => binding.targetId !== undefined,
            )
            const targets = new Set(matches.map((binding) => binding.targetId))
            if (targets.size !== 1) continue
            const targetId = [...targets][0]
            if (targetId === undefined) continue
            const already = session
              .findPublicBindings(surfaceF, route.boundName, space)
              .some((binding) => binding.targetId === targetId)
            const key = `${surfaceF}\u0000${route.boundName}\u0000${space}`
            if (already || created.has(key)) continue
            const binding = createPublicBinding({
              surface: surfaceF,
              exportedName: route.boundName,
              space,
              targetId,
            })
            created.set(key, binding)
            emitted.push(binding)
            steps.push({ fromId: binding.id, toId: targetId, kind: 're-export:named' })
            added = true
          }
        }
      }
    }

    return {
      publicBindings: [...emitted].sort((left, right) => left.id.localeCompare(right.id)),
      steps,
    }
  }

  /**
   * Resolves one re-export route to exactly one indexed source file.
   * Relative routes use `relativeImportResolution`. Absolute routes use `packageResolution.entrySurface`
   * and stay inside the top-level package directory that contains the entry.
   * `from . import name` has an empty module and is not a route.
   * @param session - Session used to keep indexed candidates.
   * @param entryPath - Package entry that wrote the route.
   * @param route - Route to resolve.
   * @param packageToWorkspace - Package identity to owning workspace.
   * @returns The source file, or undefined when the route is not a unique in-package file.
   */
  private resolvePythonRoute(
    session: IndexSession,
    entryPath: string,
    route: PythonReExportInfo,
    packageToWorkspace: ReadonlyMap<string, string>,
  ): string | undefined {
    let candidates: string[]
    if (route.level > 0) {
      if (route.module.length === 0) return undefined
      const resolved = this.relativeImportResolution.resolve(
        entryPath,
        '.'.repeat(route.level) + route.module,
      )
      candidates = typeof resolved === 'string' ? [resolved] : [...resolved]
    } else {
      const first = route.module.split('.')[0]
      if (first === undefined || first.length === 0) return undefined
      const packageName = this.packageResolution.matchSpecifier(
        route.module,
        [...packageToWorkspace.keys()],
        session,
      )
      if (packageName === undefined) return undefined
      const workspace = packageToWorkspace.get(packageName)
      const packageDir = pythonTopLevelPackageDir(entryPath, first)
      if (workspace === undefined || packageDir === undefined) return undefined
      const prefix = `${packageDir}/`
      candidates = this.packageResolution
        .entrySurface({
          specifier: route.module,
          packageName,
          workspace,
          session,
        })
        .map((entry) => entry.filePath)
        .filter((filePath) => filePath === packageDir || filePath.startsWith(prefix))
    }
    const indexed = candidates.filter((candidate) => session.getFileId(candidate) !== undefined)
    const kept = indexed.filter(
      (candidate) => !candidate.endsWith('.pyi') || !indexed.includes(candidate.slice(0, -1)),
    )
    return kept.length === 1 ? kept[0] : undefined
  }

  /**
   * Builds conservative Python declaration and binding facts.
   * @param workspace - Owning workspace.
   * @param filePath - Analyzed source path.
   * @param symbols - Extracted declarations.
   * @param imports - Extracted static imports.
   * @param classes - Syntax-proven class owners and declared bases.
   * @returns Additive reference facts.
   */
  private buildReferenceFacts(
    workspace: string,
    filePath: string,
    symbols: readonly SymbolNode[],
    imports: readonly ImportDeclaration[],
    classes: readonly PythonClassInfo[],
  ): ReferenceFacts {
    const surface = filePath.replace(/(?:\/__init__)?\.pyi?$/, '')
    const ownerByMemberId = new Map<string, string>()
    const formByMemberId = new Map<string, MemberSemantics>()
    for (const cls of classes) {
      if (cls.ownerSymbolId !== undefined) ownerByMemberId.set(cls.symbolId, cls.ownerSymbolId)
      for (const methodId of cls.memberSymbolIds) {
        ownerByMemberId.set(methodId, cls.symbolId)
      }
      for (const [methodId, form] of cls.memberFormsById) formByMemberId.set(methodId, form)
    }

    const isNestedFunction = (symbol: SymbolNode): boolean => {
      if (symbol.kind !== SymbolKind.Function) return false
      return symbols.some(
        (other) =>
          other.id !== symbol.id &&
          (other.kind === SymbolKind.Function || other.kind === SymbolKind.Method) &&
          containsSymbolRange(other, symbol),
      )
    }

    const logicalFacts = buildLogicalDeclarationFacts({
      workspace,
      declarations: symbols.map((symbol) => {
        if (isNestedFunction(symbol)) {
          return createPhysicalOnlyDeclarationDescriptor({
            symbol,
            reason: 'nested-function',
          })
        }
        if (
          symbol.kind === SymbolKind.Variable &&
          !ownerByMemberId.has(symbol.id) &&
          symbol.name.startsWith('_')
        ) {
          // Underscore-prefixed module state is private by convention.
          return createPhysicalOnlyDeclarationDescriptor({ symbol, reason: 'module-state' })
        }
        return createAdapterDeclarationDescriptor({
          symbol,
          surface,
          space:
            symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Type
              ? SymbolSpace.Type
              : SymbolSpace.Value,
          ownerSymbolId: ownerByMemberId.get(symbol.id),
          requiresOwner: symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Property,
          memberSemantics:
            symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Property
              ? (formByMemberId.get(symbol.id) ?? {
                  kind:
                    symbol.kind === SymbolKind.Property ? MemberKind.Property : MemberKind.Method,
                  dispatch: MemberDispatch.Instance,
                })
              : undefined,
        })
      }),
    })
    const localClassByName = new Map(classes.map((item) => [item.name, item]))
    const hierarchyDescriptors: AdapterHierarchyDescriptor[] = []
    for (const child of classes) {
      child.baseNames.forEach((name, precedence) => {
        const parent = localClassByName.get(name)
        if (!parent) return
        hierarchyDescriptors.push({
          childSymbolId: child.symbolId,
          parentSymbolId: parent.symbolId,
          kind: parent.kind === SymbolKind.Interface ? 'implements' : 'extends',
          precedence,
        })
      })
    }
    const hierarchyFacts = buildHierarchyReferenceFacts({
      hierarchy: hierarchyDescriptors,
      logicalBySymbolId: logicalFacts.logicalBySymbolId,
    })
    // Python's public surface is every module-level name without a leading underscore.
    const publicBindings: ReferenceFacts['publicBindings'] = symbols
      .filter(
        (symbol) =>
          !ownerByMemberId.has(symbol.id) &&
          !isNestedFunction(symbol) &&
          !symbol.name.startsWith('_') &&
          logicalFacts.logicalBySymbolId.has(symbol.id),
      )
      .map((symbol) =>
        createPublicBinding({
          surface,
          exportedName: symbol.name,
          space:
            symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Type
              ? SymbolSpace.Type
              : SymbolSpace.Value,
          targetId: logicalFacts.logicalBySymbolId.get(symbol.id)?.id,
        }),
      )
    const localBindings = imports
      .filter((item) => item.localName.length > 0)
      .map((item) =>
        createLocalBinding({
          filePath,
          scopeId: 'module',
          localName: item.localName,
          space: SymbolSpace.Value,
          targetId: undefined,
          range: item.range ?? WHOLE_FILE_START,
        }),
      )
    return {
      declarations: logicalFacts.declarations,
      logicalSymbols: logicalFacts.retainedLogicalSymbols,
      diagnostics: logicalFacts.diagnostics,
      publicBindings,
      localBindings,
      hierarchy: hierarchyFacts.hierarchy,
      steps: hierarchyFacts.steps,
      capabilities: this.capabilities(),
    }
  }

  /**
   * Resolves raw imports extracted in Pass 1 into symbol mappings and file dependencies.
   */
  /**
   * Resolves Python imports.
   * @param analysis - File analysis.
   * @param context - Import resolution context.
   * @returns Resolved imports.
   */
  resolveImports(analysis: FileAnalysis, context: ImportResolutionContext): ResolvedImports {
    const importMap = new Map<string, string>()
    const fileImports: string[] = []
    const steps: ResolutionStep[] = []
    const diagnostics: ImportDiagnostic[] = []
    const { session, qualifiedNames } = context

    for (const imp of analysis.imports) {
      if (isFileOnlyImport(imp)) {
        if (imp.isRelative) {
          const resolved = this.resolveFileImport(imp, analysis.filePath, session)
          if (resolved !== undefined) fileImports.push(resolved)
        } else {
          const entries = context.packageEntryFiles(imp.specifier)
          if (entries.status === 'resolved') {
            for (const entry of entries.entries) fileImports.push(entry.filePath)
          } else {
            diagnostics.push({
              filePath: analysis.filePath,
              specifier: imp.specifier,
              reason: entries.reason,
            })
          }
        }
        continue
      }

      if (imp.isRelative) {
        const resolved = this.resolveRelativeImportPath(analysis.filePath, imp.specifier)
        const candidates = Array.isArray(resolved) ? resolved : [resolved]
        for (const candidatePath of candidates) {
          const target = session
            .findSymbolsByFile(candidatePath)
            .find((s) => s.name === imp.originalName)
          if (target) {
            importMap.set(imp.localName, target.id)
            fileImports.push(target.filePath)
            break
          }
        }
        if (!importMap.has(imp.localName) && imp.kind === ImportDeclarationKind.Named) {
          // `from . import module` names a submodule, which is a dependency on its file.
          const submodule = this.resolveRelativeImportPath(
            analysis.filePath,
            `${imp.specifier}${imp.specifier.endsWith('.') ? '' : '.'}${imp.originalName}`,
          )
          const indexed = (Array.isArray(submodule) ? submodule : [submodule]).find(
            (candidate) => session.getFileId(candidate) !== undefined,
          )
          if (indexed !== undefined) fileImports.push(indexed)
        }
      } else {
        const qualifiedId = qualifiedNames.get(imp.specifier)
        if (qualifiedId) {
          importMap.set(imp.localName, qualifiedId)
          continue
        }

        if (imp.kind === ImportDeclarationKind.Namespace) {
          // `import pkg.module` depends on the module file; it binds the module, not a symbol.
          const entries = context.packageEntryFiles(imp.specifier)
          if (entries.status === 'resolved') {
            for (const entry of entries.entries) fileImports.push(entry.filePath)
          } else {
            diagnostics.push({
              filePath: analysis.filePath,
              specifier: imp.specifier,
              reason: entries.reason,
            })
          }
          continue
        }
        // `from pkg.module import name` resolves only to a name the module publishes.
        const localBinding = analysis.referenceFacts?.localBindings.find(
          (binding) => binding.scopeId === 'module' && binding.localName === imp.localName,
        )
        const result = context.resolvePackageExport({
          specifier: imp.specifier,
          exportedName: imp.originalName,
          spaces: [SymbolSpace.Value, SymbolSpace.Type],
          fromFile: analysis.filePath,
          localBindingId: localBinding?.id ?? '',
        })
        if (result.status === 'resolved') {
          importMap.set(imp.localName, result.targetSymbolId)
          fileImports.push(result.entryFile)
          if (localBinding !== undefined) steps.push(result.step)
          continue
        }
        // `from pkg import module` names a submodule, which is a dependency on its file.
        const submodule =
          result.reason === 'not-exported' || result.reason === 'no-entry-surface'
            ? context.packageEntryFiles(`${imp.specifier}.${imp.originalName}`)
            : undefined
        if (submodule?.status === 'resolved') {
          if (submodule.entries.length === 1) {
            fileImports.push(submodule.entries[0]!.filePath)
            continue
          }
          if (submodule.entries.length > 1) {
            diagnostics.push({
              filePath: analysis.filePath,
              specifier: imp.specifier,
              exportedName: imp.originalName,
              reason: 'ambiguous',
            })
            continue
          }
        }
        diagnostics.push({
          filePath: analysis.filePath,
          specifier: imp.specifier,
          exportedName: imp.originalName,
          reason: result.reason,
        })
      }
    }

    return { importMap, fileImports: [...new Set(fileImports)], steps, diagnostics }
  }

  /**
   * Resolves a file import.
   * @param imp - Import declaration.
   * @param filePath - Path of the file.
   * @param session - Index session.
   * @returns Resolved path, or undefined.
   */
  private resolveFileImport(
    imp: ImportDeclaration,
    filePath: string,
    session: IndexSession,
  ): string | undefined {
    if (imp.isRelative) {
      const resolved = this.resolveRelativeImportPath(filePath, imp.specifier)
      const candidates = Array.isArray(resolved) ? resolved : [resolved]
      return candidates.find((candidatePath) => session.findSymbolsByFile(candidatePath).length > 0)
    }

    return undefined
  }

  /**
   * Builds Python relations.
   * @param analysis - File analysis.
   * @param context - Relation build context.
   * @returns Array of relations.
   */
  buildRelations(analysis: FileAnalysis, context: RelationBuildContext): Relation[] {
    const relations: Relation[] = []

    for (const symbol of analysis.symbols) {
      relations.push(
        createRelation({
          source: analysis.filePath,
          target: symbol.id,
          type: RelationType.Defines,
        }),
      )
    }

    const pythonState = analysis.parserState as PythonParserState | undefined
    const classes = pythonState?.classes ?? []
    const classesByName = new Map<string, SerializedPythonClassInfo>(
      classes.map((entry) => [entry.name, entry]),
    )
    const seen = new Set<string>()

    for (const cls of classes) {
      for (const [precedence, baseName] of cls.baseNames.entries()) {
        const importedId = context.resolvedImports.importMap.get(baseName)
        const localBase = classesByName.get(baseName)
        const targetId = importedId ?? localBase?.symbolId
        if (!targetId) continue

        const isInterfaceTarget =
          localBase?.kind === SymbolKind.Interface ||
          (importedId !== undefined &&
            context.session
              .findSymbolsByName(baseName)
              .some((symbol) => symbol.id === importedId && symbol.kind === SymbolKind.Interface))
        const relationType = isInterfaceTarget ? RelationType.Implements : RelationType.Extends
        const hierarchyKey = `${cls.symbolId}:${relationType}:${targetId}`
        if (!seen.has(hierarchyKey)) {
          seen.add(hierarchyKey)
          relations.push(
            createRelation({
              source: cls.symbolId,
              target: targetId,
              type: relationType,
              metadata:
                importedId === targetId && cls.baseRanges[precedence] !== undefined
                  ? createImportedHierarchyMetadata({
                      clauseRange: cls.baseRanges[precedence],
                      precedence,
                      requestedName: baseName,
                      resolvedTargetSymbolId: targetId,
                    })
                  : { precedence },
            }),
          )
        }

        if (localBase) {
          for (const [methodName, methodId] of Object.entries(cls.methodsByName)) {
            const targetMethodId = localBase.methodsByName[methodName]
            if (!targetMethodId) continue
            const overrideKey = `${methodId}:${RelationType.Overrides}:${targetMethodId}`
            if (seen.has(overrideKey)) continue
            seen.add(overrideKey)
            relations.push(
              createRelation({
                source: methodId,
                target: targetMethodId,
                type: RelationType.Overrides,
              }),
            )
          }
        }
      }
    }

    const localSymbolsByName = new Map<string, SymbolNode[]>()
    for (const s of analysis.symbols) {
      const existing = localSymbolsByName.get(s.name)
      if (existing) {
        existing.push(s)
      } else {
        localSymbolsByName.set(s.name, [s])
      }
    }

    for (const call of analysis.callFacts) {
      if (call.callerSymbolId) {
        const calleeName = call.name
        const importedId = context.resolvedImports.importMap.get(calleeName)
        const calleeId =
          importedId ??
          this.resolveProvenLocalCallee(
            analysis.symbols,
            call.callerSymbolId,
            calleeName,
            call.form,
            call.receiverName,
          )

        if (calleeId) {
          const key = `${call.callerSymbolId}->${calleeId}`
          if (!seen.has(key)) {
            seen.add(key)
            relations.push(
              createRelation({
                source: call.callerSymbolId,
                target: calleeId,
                type: RelationType.Calls,
              }),
            )
          }
        }
      }
    }

    const fieldTypes = pythonState?.fieldTypes ?? []
    for (const { fieldSymbolId, typeName } of fieldTypes) {
      const importedId = context.resolvedImports.importMap.get(typeName)
      const localCandidates = localSymbolsByName.get(typeName)
      const localType = localCandidates?.find(
        (s) =>
          s.kind === SymbolKind.Class ||
          s.kind === SymbolKind.Interface ||
          s.kind === SymbolKind.Type,
      )
      const targetId = importedId ?? localType?.id
      if (targetId) {
        const key = `${fieldSymbolId}:${RelationType.UsesType}:${targetId}`
        if (!seen.has(key)) {
          seen.add(key)
          relations.push(
            createRelation({
              source: fieldSymbolId,
              target: targetId,
              type: RelationType.UsesType,
            }),
          )
        }
      }
    }

    context.session.addRelations(
      relations.filter(
        (relation) =>
          relation.type === RelationType.Extends || relation.type === RelationType.Implements,
      ),
    )
    return relations
  }

  /**
   * Resolves a call to a local declaration only when the syntax proves the target.
   *
   * A bare call may reach a module-level callable or one declared inside the caller or an
   * enclosing routine. A `self.name()` or `cls.name()` call reaches a method of the class that
   * encloses the caller. `Class.name()` reaches a method of that module-level class. Every other
   * attribute call has an unknown receiver and yields no relation: method names are never
   * matched by textual proximity or by name alone.
   * @param symbols - Symbols declared in the file.
   * @param callerSymbolId - Routine that contains the call.
   * @param name - Called name.
   * @param form - Normalized call form.
   * @param receiverName - Receiver text for attribute calls.
   * @returns The proven callee symbol ID, or undefined.
   */
  private resolveProvenLocalCallee(
    symbols: readonly SymbolNode[],
    callerSymbolId: string,
    name: string,
    form: CallForm,
    receiverName: string | undefined,
  ): string | undefined {
    const byId = new Map(symbols.map((symbol) => [symbol.id, symbol]))
    const ancestors: SymbolNode[] = []
    for (
      let current = byId.get(callerSymbolId);
      current !== undefined;
      current = current.parentId === undefined ? undefined : byId.get(current.parentId)
    ) {
      ancestors.push(current)
    }

    if (form === CallForm.Member) {
      if (receiverName === undefined) return undefined
      let ownerClass: SymbolNode | undefined
      if (receiverName === 'self' || receiverName === 'cls') {
        ownerClass = ancestors.find((symbol) => symbol.kind === SymbolKind.Class)
      } else {
        const named = symbols.filter(
          (symbol) =>
            symbol.name === receiverName &&
            symbol.kind === SymbolKind.Class &&
            symbol.parentId === undefined,
        )
        ownerClass = named.length === 1 ? named[0] : undefined
      }
      if (ownerClass === undefined) return undefined
      const members = symbols.filter(
        (symbol) =>
          symbol.name === name &&
          symbol.kind === SymbolKind.Method &&
          symbol.parentId === ownerClass.id,
      )
      return members.at(-1)?.id
    }

    const enclosingRoutines = new Set<string | undefined>([undefined])
    for (const ancestor of ancestors) {
      if (ancestor.kind === SymbolKind.Function || ancestor.kind === SymbolKind.Method) {
        enclosingRoutines.add(ancestor.id)
      }
    }
    const visible = symbols.filter(
      (symbol) =>
        symbol.name === name &&
        (symbol.kind === SymbolKind.Function ||
          symbol.kind === SymbolKind.Class ||
          symbol.kind === SymbolKind.Variable) &&
        enclosingRoutines.has(symbol.parentId),
    )
    return visible.at(-1)?.id
  }

  /**
   * Collects class info from Python AST.
   * @param root - SgNode AST root.
   * @param filePath - Path of the file.
   * @param symbols - Extracted symbols array.
   * @param declarationIndex - Optional declaration symbol index.
   * @param observer - Optional observer recording structural work.
   * @returns Array of class info.
   */
  private collectClassInfo(
    root: SgNode,
    filePath: string,
    symbols: SymbolNode[],
    declarationIndex?: DeclarationSymbolIndex,
    observer?: StructuralWorkObserver,
  ): PythonClassInfo[] {
    const declIndex = declarationIndex ?? createDeclarationSymbolIndex(symbols, observer)
    const infos: PythonClassInfo[] = []
    const classNodes: SgNode[] = []
    collectByKind(root, new Set(['class_definition']), classNodes)

    for (const classNode of classNodes) {
      const name = classNode.field('name')?.text().trim()
      if (!name) continue
      const line = classNode.range().start.line + 1
      const column = classNode.range().start.column
      const ownerSymbol = declIndex.find(SymbolKind.Class, name, line, column)
      if (!ownerSymbol) continue

      const argsNode =
        classNode.field('superclasses') ??
        classNode.children().find((c) => nodeKind(c) === 'argument_list')
      const baseNames: string[] = []
      const baseRanges: SourceRange[] = []
      if (argsNode) {
        for (const child of argsNode.children()) {
          const k = nodeKind(child)
          if (k !== '(' && k !== ')' && k !== ',' && k !== 'comment') {
            const rawText = child.text().trim()
            if (rawText) {
              // Keep the written spelling: `other.Foo` names a member of another module and
              // must not be mistaken for a local `Foo`.
              baseNames.push(rawText)
              baseRanges.push(rangeOf(child))
            }
          }
        }
      }

      let ownerSymbolId: string | undefined
      let current = classNode.parent()
      while (current) {
        if (nodeKind(current) === 'class_definition') {
          const parentName = current.field('name')?.text().trim()
          const parentLine = current.range().start.line + 1
          const parentCol = current.range().start.column
          const parentSym = declIndex.find(
            SymbolKind.Class,
            parentName ?? '',
            parentLine,
            parentCol,
          )
          if (parentSym) {
            ownerSymbolId = parentSym.id
            break
          }
        }
        current = current.parent()
      }

      const methodsByName = new Map<string, string>()
      const memberSymbolIds: string[] = []
      const memberFormsById = new Map<string, MemberSemantics>()

      const directMembers = collectPythonDirectMemberEvidence(
        classNode,
        ownerSymbol,
        declIndex,
        observer,
      )

      for (const member of directMembers) {
        memberSymbolIds.push(member.symbol.id)
        if (member.symbol.kind === SymbolKind.Method) {
          methodsByName.set(member.symbol.name, member.symbol.id)
          memberFormsById.set(member.symbol.id, pythonMemberSemantics(member.symbol, member))
        } else if (member.symbol.kind === SymbolKind.Property) {
          memberFormsById.set(member.symbol.id, {
            kind: MemberKind.Property,
            dispatch: MemberDispatch.Instance,
          })
        }
      }

      infos.push({
        name,
        symbolId: ownerSymbol.id,
        kind: baseNames.some((base) => normalizePythonTypeName(base) === 'Protocol')
          ? SymbolKind.Interface
          : SymbolKind.Class,
        baseNames,
        baseRanges,
        ...(ownerSymbolId !== undefined ? { ownerSymbolId } : {}),
        indent: column,
        endLine: classNode.range().end.line + 1,
        methodsByName,
        memberSymbolIds,
        memberFormsById,
      })
    }

    return infos
  }

  /**
   * Extracts binding facts from Python AST.
   * @param filePath - Path of the file.
   * @param symbols - Extracted symbols array.
   * @param imports - Extracted imports array.
   * @param root - SgNode root.
   * @returns Array of binding facts.
   */
  private extractBindingFactsFromData(
    filePath: string,
    symbols: SymbolNode[],
    imports: ImportDeclaration[],
    root: SgNode,
  ): BindingFact[] {
    const facts: BindingFact[] = []
    const seen = new Set<string>()

    const addFact = (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      location: SourceLocation,
    ): void => {
      const key = `${name}:${sourceKind}:${targetName ?? ''}:${location.line}:${location.column}`
      if (seen.has(key)) return
      seen.add(key)
      facts.push({
        name,
        filePath,
        scopeId: filePath,
        sourceKind,
        location,
        targetName,
        targetSymbolId: undefined,
        targetFilePath: undefined,
        metadata: undefined,
      })
    }

    for (const declaration of imports) {
      if (declaration.localName.length === 0) continue
      addFact(
        declaration.localName,
        BindingSourceKind.ImportedType,
        normalizePythonTypeName(declaration.originalName),
        { filePath, line: 1, column: 0, endLine: undefined, endColumn: undefined },
      )
    }

    for (const symbol of symbols) {
      if (symbol.kind === SymbolKind.Method) {
        const receiverName = symbol.name === '__new__' ? 'cls' : 'self'
        addFact(receiverName, BindingSourceKind.Receiver, undefined, {
          filePath,
          line: symbol.line,
          column: symbol.column,
          endLine: undefined,
          endColumn: undefined,
        })
      }
    }

    const paramNodes: SgNode[] = []
    collectByKind(root, new Set(['typed_parameter', 'typed_default_parameter']), paramNodes)
    for (const pNode of paramNodes) {
      const nameNode = pNode.field('name') ?? pNode.child(0)
      const typeNode = pNode.field('type')
      if (!nameNode || !typeNode) continue
      const name = nameNode.text().trim()
      const targetName = normalizePythonTypeName(typeNode.text().trim())
      if (name && targetName) {
        addFact(name, BindingSourceKind.Parameter, targetName, locationOf(pNode, filePath))
      }
    }

    const assignNodes: SgNode[] = []
    collectByKind(root, new Set(['assignment']), assignNodes)
    for (const aNode of assignNodes) {
      const typeNode = aNode.field('type')
      const leftNode = aNode.field('left')
      if (typeNode && leftNode) {
        const rawLeft = leftNode.text().trim()
        const name = leftNode.field('attribute')?.text().trim() ?? rawLeft
        const targetName = normalizePythonTypeName(typeNode.text().trim())
        if (name && targetName) {
          addFact(name, BindingSourceKind.Parameter, targetName, locationOf(aNode, filePath))
        }
      }
    }

    const typeNodes: SgNode[] = []
    collectByKind(root, new Set(['type']), typeNodes)
    for (const tNode of typeNodes) {
      const parent = tNode.parent()
      if (parent && nodeKind(parent) === 'expression_statement') {
        const nameChild = tNode.child(0)
        const typeChild = tNode.children().at(-1)
        if (nameChild && typeChild && nameChild.id() !== typeChild.id()) {
          const name = nameChild.text().trim()
          const targetName = normalizePythonTypeName(typeChild.text().trim())
          if (name && targetName) {
            addFact(name, BindingSourceKind.Parameter, targetName, locationOf(tNode, filePath))
          }
        }
      }
    }

    const fnNodes: SgNode[] = []
    collectByKind(root, new Set(['function_definition']), fnNodes)
    for (const fnNode of fnNodes) {
      const returnTypeNode = fnNode.field('return_type')
      if (returnTypeNode) {
        const targetName = normalizePythonTypeName(returnTypeNode.text().trim())
        if (targetName) {
          addFact(
            targetName,
            BindingSourceKind.ReturnType,
            targetName,
            locationOf(returnTypeNode, filePath),
          )
        }
      }
    }

    for (const aNode of assignNodes) {
      const left = aNode.field('left')
      const right = aNode.field('right')
      if (!left || !right) continue
      const aliasName = left.field('name')?.text().trim() ?? left.text().trim()
      if (!aliasName || !/^[A-Z]/.test(aliasName)) continue

      const rhsText = right.text().trim()
      const identPattern = /[A-Z][A-Za-z_]\w*/g
      for (const match of rhsText.matchAll(identPattern)) {
        const targetName = match[0]
        if (
          targetName &&
          targetName !== aliasName &&
          ![
            'Dict',
            'List',
            'Tuple',
            'Set',
            'FrozenSet',
            'Sequence',
            'Mapping',
            'MutableMapping',
            'Optional',
            'Union',
            'Callable',
            'Final',
            'Literal',
            'Type',
            'TypeAlias',
          ].includes(targetName)
        ) {
          addFact(
            aliasName,
            BindingSourceKind.ImportedType,
            normalizePythonTypeName(targetName),
            locationOf(aNode, filePath),
          )
        }
      }
    }

    const typeAliasNodes: SgNode[] = []
    collectByKind(root, new Set(['type_alias_statement']), typeAliasNodes)
    for (const tNode of typeAliasNodes) {
      const nameNode = tNode.field('name')
      const valueNode = tNode.field('value') ?? tNode.field('type')
      if (nameNode && valueNode) {
        const aliasName = nameNode.text().trim()
        const rhsText = valueNode.text().trim()
        const identPattern = /[A-Z][A-Za-z_]\w*/g
        for (const match of rhsText.matchAll(identPattern)) {
          const targetName = match[0]
          if (targetName && targetName !== aliasName) {
            addFact(
              aliasName,
              BindingSourceKind.ImportedType,
              normalizePythonTypeName(targetName),
              locationOf(tNode, filePath),
            )
          }
        }
      }
    }

    return facts
  }

  /**
   * Extracts call facts from Python AST.
   * @param filePath - Path of the file.
   * @param symbols - Extracted symbols array.
   * @param root - SgNode root.
   * @param callableIndex - Optional callable containment index.
   * @param lexicalIndex - Optional lexical binding index.
   * @returns Array of call facts.
   */
  private extractCallFactsFromData(
    filePath: string,
    symbols: SymbolNode[],
    root: SgNode,
    callableIndex?: CallableContainmentIndex,
    lexicalIndex?: PythonLexicalBindingIndex,
  ): CallFact[] {
    const facts: CallFact[] = []
    const seen = new Set<string>()

    const callables =
      callableIndex ?? createCallableContainmentIndex(symbols, { callableKinds: PY_CALLABLE_KINDS })
    const lexicals = lexicalIndex ?? createPythonLexicalBindingIndex()

    const callNodes: SgNode[] = []
    collectByKind(root, new Set(['call']), callNodes)

    for (const node of callNodes) {
      let parent = node.parent()
      let inDecorator = false
      while (parent) {
        if (nodeKind(parent) === 'decorator') {
          inDecorator = true
          break
        }
        if (nodeKind(parent) === 'function_definition' || nodeKind(parent) === 'class_definition') {
          break
        }
        parent = parent.parent()
      }
      if (inDecorator) continue

      const fnNode = node.field('function') ?? node.child(0)
      if (!fnNode) continue

      const fnKind = nodeKind(fnNode)
      let name: string | undefined
      let receiverName: string | undefined
      let form: CallForm = CallForm.Free

      if (fnKind === 'identifier') {
        name = fnNode.text().trim()
        if (
          ['def', 'class', 'if', 'for', 'while', 'return', 'getattr', '__import__'].includes(name)
        ) {
          continue
        }
        if (isPythonShadowedByEnclosingScope(node, name, lexicals)) continue
        // Python call syntax does not distinguish class construction from a normal
        // callable invocation. Resolution may prove a class target later.
        form = CallForm.Free
      } else if (fnKind === 'attribute') {
        const obj = fnNode.field('object')
        const attr = fnNode.field('attribute')
        receiverName = obj?.text().trim()
        name = attr?.text().trim()
        if (receiverName === 'importlib') continue
        form = CallForm.Member
      } else {
        name = fnNode.text().trim()
        form = CallForm.Free
      }

      if (!name) continue

      const range = rangeOf(node)
      const location: SourceLocation = {
        filePath,
        line: range.startLine,
        column: range.startColumn,
        endLine: range.endLine,
        endColumn: range.endColumn,
      }

      const caller = callables.find({ line: range.startLine, column: range.startColumn })
      const callerSymbolId = caller?.id

      let arity: number | undefined
      const argsNode =
        node.field('arguments') ?? node.children().find((c) => nodeKind(c) === 'argument_list')
      if (argsNode) {
        let count = 0
        for (const arg of argsNode.children()) {
          const k = nodeKind(arg)
          if (k !== '(' && k !== ')' && k !== ',' && k !== 'comment') {
            count++
          }
        }
        arity = count
      }

      const key = `${form}:${receiverName ?? ''}:${name}:${location.line}:${location.column}`
      if (seen.has(key)) continue
      seen.add(key)
      facts.push({
        filePath,
        scopeId: filePath,
        callerSymbolId,
        form,
        name,
        receiverName,
        targetName: name,
        arity,
        location,
        metadata: undefined,
      })
    }

    return facts
  }

  /**
   * Extracts decorator invocations as call facts from AST.
   * @param root - AST root node.
   * @param filePath - File path being analyzed.
   * @param symbols - Emitted symbol nodes.
   * @param declarationIndex - Optional declaration symbol index.
   * @returns Extracted call facts for decorators.
   */
  private extractDecoratorCallFacts(
    root: SgNode,
    filePath: string,
    symbols: readonly SymbolNode[],
    declarationIndex?: DeclarationSymbolIndex,
  ): CallFact[] {
    const facts: CallFact[] = []
    const seen = new Set<string>()

    const visit = (node: SgNode): void => {
      if (nodeKind(node) === 'decorated_definition') {
        const decorators: SgNode[] = []
        let defNode: SgNode | undefined
        for (const child of node.children()) {
          const k = nodeKind(child)
          if (k === 'decorator') {
            decorators.push(child)
          } else if (k === 'function_definition' || k === 'class_definition') {
            defNode = child
          }
        }

        if (defNode && decorators.length > 0) {
          const defName = defNode.field('name')?.text()
          const defLine = defNode.range().start.line + 1
          const defCol = defNode.range().start.column
          const defKind =
            nodeKind(defNode) === 'class_definition' ? SymbolKind.Class : SymbolKind.Function
          const caller = declarationIndex
            ? (declarationIndex.find(defKind, defName ?? '', defLine, defCol) ??
              declarationIndex.find(SymbolKind.Method, defName ?? '', defLine, defCol))
            : symbols.find(
                (s) => s.filePath === filePath && s.line === defLine && s.name === defName,
              )

          if (caller) {
            for (const deco of decorators) {
              for (const expr of deco.children()) {
                if (expr.text() === '@') continue
                const exprKind = nodeKind(expr)
                let name: string | undefined
                let receiverName: string | undefined
                let form: CallForm = CallForm.Free

                if (exprKind === 'call') {
                  const fnNode = expr.field('function') ?? expr.child(0)
                  if (fnNode) {
                    const fnKind = nodeKind(fnNode)
                    if (fnKind === 'identifier') {
                      name = fnNode.text()
                      form = CallForm.Free
                    } else if (fnKind === 'attribute') {
                      receiverName = fnNode.field('object')?.text()
                      name = fnNode.field('attribute')?.text()
                      form = CallForm.Member
                    }
                  }
                } else if (exprKind === 'attribute') {
                  receiverName = expr.field('object')?.text()
                  name = expr.field('attribute')?.text()
                  form = CallForm.Member
                } else if (exprKind === 'identifier') {
                  name = expr.text()
                  form = CallForm.Free
                }

                if (name && !['staticmethod', 'classmethod', 'property', 'setter'].includes(name)) {
                  const loc = deco.range().start
                  const location: SourceLocation = {
                    filePath,
                    line: loc.line + 1,
                    column: loc.column,
                    endLine: undefined,
                    endColumn: undefined,
                  }
                  const key = `${caller.id}:${name}:${location.line}:${location.column}`
                  if (!seen.has(key)) {
                    seen.add(key)
                    facts.push({
                      filePath,
                      scopeId: filePath,
                      callerSymbolId: caller.id,
                      form,
                      name,
                      receiverName,
                      targetName: name,
                      arity: undefined,
                      location,
                      metadata: undefined,
                    })
                  }
                }
              }
            }
          }
        }
      }

      for (const child of node.children()) {
        visit(child)
      }
    }

    visit(root)
    return facts
  }

  /**
   * Recursively walks the AST to extract symbols.
   * @param node - The current AST node.
   * @param addSymbol - Callback to register a discovered symbol.
   * @param addFieldType - Optional callback to register field type annotation facts.
   */
  private walk(
    node: SgNode,
    addSymbol: (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      selectionNode: SgNode | null | undefined,
      comment: string | undefined,
    ) => SymbolNode | undefined,
    addFieldType?: (fieldSymbolId: string, typeName: string) => void,
  ): void {
    for (const child of node.children()) {
      const kind = nodeKind(child)

      switch (kind) {
        case 'function_definition': {
          const name = child.field('name')?.text()
          // A definition whose header the parser could not prove is not a declaration.
          if (name && !headerHasParseError(child)) {
            const symKind = isMethod(child) ? SymbolKind.Method : SymbolKind.Function
            addSymbol(name, symKind, child, child.field('name'), extractComment(child))
          }
          this.walk(child, addSymbol, addFieldType)
          break
        }
        case 'class_definition': {
          const name = child.field('name')?.text()
          if (name) {
            addSymbol(name, SymbolKind.Class, child, child.field('name'), extractComment(child))
          }
          // Walk into class body (block) for methods and fields
          this.walk(child, addSymbol, addFieldType)
          break
        }
        case 'block': {
          // Recurse into block to find methods and fields inside class bodies
          this.walk(child, addSymbol, addFieldType)
          break
        }
        case 'decorated_definition': {
          this.walk(child, addSymbol, addFieldType)
          break
        }
        case 'expression_statement': {
          // Module-level assignment: NAME = value
          const parent = child.parent()
          if (parent && nodeKind(parent) === 'module') {
            const firstChild = child.child(0)
            if (firstChild && nodeKind(firstChild) === 'assignment') {
              const left = firstChild.field('left')
              if (left && nodeKind(left) === 'identifier') {
                addSymbol(left.text(), SymbolKind.Variable, child, left, extractComment(child))
              }
            }
          } else if (parent && nodeKind(parent) === 'block') {
            const grandParent = parent.parent()
            if (grandParent && nodeKind(grandParent) === 'class_definition') {
              const firstChild = child.child(0)
              if (firstChild && nodeKind(firstChild) === 'assignment') {
                const left = firstChild.field('left')
                if (left && nodeKind(left) === 'identifier') {
                  const sym = addSymbol(
                    left.text(),
                    SymbolKind.Property,
                    child,
                    left,
                    extractComment(child),
                  )
                  if (sym && addFieldType) {
                    const typeNode = firstChild.field('type')
                    if (typeNode) {
                      const rawType = typeNode.text()
                      const matches = rawType.match(/[A-Za-z_]\w*/g)
                      if (matches) {
                        for (const m of matches) {
                          if (
                            ![
                              'int',
                              'str',
                              'float',
                              'bool',
                              'bytes',
                              'None',
                              'list',
                              'dict',
                              'set',
                              'tuple',
                              'Any',
                              'Optional',
                              'Union',
                              'List',
                              'Dict',
                              'Set',
                              'Tuple',
                              'Callable',
                              'Sequence',
                              'Iterable',
                              'Mapping',
                              'TypeVar',
                              'Generic',
                              'Final',
                              'ClassVar',
                            ].includes(m)
                          ) {
                            addFieldType(sym.id, m)
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          break
        }
        default:
          break
      }
    }
  }

  /**
   * Resolves a relative Python import to a file path.
   * @param fromFile - The importing file path.
   * @param specifier - The dot-prefixed module name.
   * @returns The resolved file path.
   */
  private resolveRelativeImportPath(fromFile: string, specifier: string): string | string[] {
    // Separate workspace prefix (e.g. "core:src/models/user.py" → "core:", "src/models/user.py")
    const identity = splitWorkspaceIdentity(fromFile)
    const wsPrefix = identity === null ? '' : `${identity.workspace}:`
    const relFile = toPortableGraphPath(identity === null ? fromFile : identity.relativePath)
    const portableSpecifier = toPortableGraphPath(specifier)

    const relDir = relFile.substring(0, relFile.lastIndexOf('/'))
    const segments = relDir ? relDir.split('/') : []

    // Count leading dots: first dot = current dir, each extra dot = go up
    let dots = 0
    while (dots < portableSpecifier.length && portableSpecifier[dots] === '.') dots++

    // Go up (dots - 1) levels: first dot is the relative marker (current dir)
    for (let i = 1; i < dots; i++) {
      if (segments.length > 0) segments.pop()
    }

    // Remaining part after the dots is the module path
    const modulePart = portableSpecifier.substring(dots)
    if (modulePart) {
      for (const part of modulePart.split('.')) {
        segments.push(part)
      }
    }

    // If there's no module part after dots, this is a package-level import (e.g. `from . import X`)
    // which refers to the __init__.py in the resolved directory
    // Source files are preferred over stubs; a `.pyi` is considered only when no source matches.
    if (!modulePart) {
      const packageDir = wsPrefix + segments.join('/')
      return [packageDir + '/__init__.py', packageDir + '/__init__.pyi']
    }
    const base = wsPrefix + segments.join('/')
    return [base + '.py', base + '/__init__.py', base + '.pyi', base + '/__init__.pyi']
  }

  /**
   * Resolves a Python import specifier to a known package.
   * Normalizes per PEP 503 and returns the package only when exactly one matches.
   * @param specifier - The import specifier (e.g. `acme_auth.models`).
   * @param knownPackages - Known package names from `pyproject.toml`.
   * @returns The matching package name, or undefined.
   */
  private resolvePackageFromSpecifier(
    specifier: string,
    knownPackages: string[],
  ): string | undefined {
    if (!specifier) return undefined
    const topLevel = specifier.split('.')[0]
    if (!topLevel) return undefined
    const normalized = normalizePythonDistName(topLevel)
    const matches = [
      ...new Set(knownPackages.filter((pkg) => normalizePythonDistName(pkg) === normalized)),
    ]
    return matches.length === 1 ? matches[0] : undefined
  }

  /**
   * Declares the resolution manifests this adapter reads.
   * @returns Exact basenames used for package identity.
   */
  resolutionManifests(): readonly string[] {
    return ['pyproject.toml']
  }

  /**
   * Reads the package identity by searching for `pyproject.toml` at or above
   * the given directory, bounded by the repository root.
   * @param codeRoot - Absolute path to the workspace's code root.
   * @param repoRoot - Optional repository root to bound the search.
   * @param report - Optional callback to report skipped manifests.
   * @returns The project name from the nearest `pyproject.toml`, or undefined.
   */
  private getPackageIdentity(
    codeRoot: string,
    repoRoot?: string,
    report?: (message: string) => void,
  ): string | undefined {
    const result = findPackageManifest<string>(
      codeRoot,
      'pyproject.toml',
      (c) => {
        const name = readPythonProjectName(c)
        return name !== undefined ? { kind: 'match', value: name } : { kind: 'skip' }
      },
      repoRoot,
    )
    for (const skipped of result.skipped) {
      report?.(`Package manifest skipped (no identity): ${skipped}`)
    }
    return result.match?.value
  }
}

/**
 * Normalizes a Python distribution name per PEP 503:
 * Letters are lowercased and every run of `-`, `_`, or `.` becomes a single `-`.
 * @param value - Distribution name.
 * @returns Normalized distribution name.
 */
export function normalizePythonDistName(value: string): string {
  return value.toLowerCase().replace(/[-_.]+/g, '-')
}

/**
 * Reads `[project].name` from a pyproject.toml document.
 * @param content - UTF-8 manifest text.
 * @returns The project name, or undefined when `[project].name` is absent.
 */
export function readPythonProjectName(content: string): string | undefined {
  let inProject = false
  for (const line of content.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/.exec(line)
    if (header?.[1] !== undefined) {
      inProject = header[1] === 'project'
      continue
    }
    if (!inProject) continue
    const match = /^\s*name\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(line)
    const name = match?.[1] ?? match?.[2]
    if (name !== undefined && name !== '') return name
  }
  return undefined
}
