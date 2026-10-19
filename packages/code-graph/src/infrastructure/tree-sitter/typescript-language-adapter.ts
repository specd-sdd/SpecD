import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse, Lang } from '@ast-grep/napi'
import { type SgNode } from '@ast-grep/napi'
import {
  type LanguageAdapter,
  type AdapterAnalyzeContext,
  type AdapterDeclarationPolicy,
  type ImportResolutionContext,
  type ResolvedImports,
  type RelationBuildContext,
} from '../../domain/value-objects/language-adapter.js'
import { type ImportDeclaration } from '../../domain/value-objects/import-declaration.js'
import { ImportDeclarationKind } from '../../domain/value-objects/import-declaration-kind.js'
import { BindingSourceKind, type BindingFact } from '../../domain/value-objects/binding-fact.js'
import { CallForm, type CallFact } from '../../domain/value-objects/call-fact.js'
import { type SourceLocation } from '../../domain/value-objects/source-location.js'
import {
  type SymbolNode,
  type SourceRange,
  createSymbolNode,
} from '../../domain/value-objects/symbol-node.js'
import { type Relation, createRelation } from '../../domain/value-objects/relation.js'
import { SymbolKind } from '../../domain/value-objects/symbol-kind.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
import { findManifestField } from './find-manifest-field.js'
import { splitWorkspaceIdentity } from '../../domain/services/split-workspace-identity.js'
import {
  parseDottedMemberReference,
  renderDottedMemberReference,
} from '../../domain/services/parse-member-reference.js'
import {
  type FileAnalysisDraft,
  type FileAnalysis,
} from '../../domain/value-objects/file-analysis.js'
import { type IndexSession } from '../../domain/value-objects/index-session.js'
import {
  DeclarationOccurrenceForm,
  MemberAccessor,
  MemberDispatch,
  MemberKind,
  type MemberSemantics,
  SymbolSpace,
  createLocalBinding,
  createPublicBinding,
  type AdapterCapabilities,
  type LogicalSymbol,
  type ParsedSymbolReference,
  type PublicBinding,
  type ReferenceFacts,
  type ResolutionStep,
} from '../../domain/value-objects/symbol-reference.js'
import {
  buildHierarchyReferenceFacts,
  buildLogicalDeclarationFacts,
  containsSymbolRange,
  createAdapterDeclarationDescriptor,
  createImportedHierarchyMetadata,
  createPhysicalOnlyDeclarationDescriptor,
  findContainingCallableSymbol,
  type AdapterHierarchyDescriptor,
  withEnclosingTypeParents,
  WHOLE_FILE_START,
} from './reference-fact-helpers.js'

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
 * Determines the tree-sitter language enum for a given file path based on its extension.
 * @param filePath - Absolute or relative path to the source file.
 * @returns The corresponding tree-sitter {@link Lang} value.
 */
function langForFile(filePath: string): Lang {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
    return Lang.Tsx
  }
  if (filePath.endsWith('.ts')) {
    return Lang.TypeScript
  }
  return Lang.JavaScript
}

/**
 * Extracts the name field text from an AST node.
 * @param node - The AST node to inspect.
 * @returns The name text, or undefined if the node has no name field.
 */
function getName(node: SgNode): string | undefined {
  return node.field('name')?.text()
}

/**
 * Returns the syntactic kind of an AST node as a string.
 * @param node - The AST node to inspect.
 * @returns The node kind string.
 */
function nodeKind(node: SgNode): string {
  return String(node.kind())
}

const CALLABLE_BOUNDARY_KINDS: ReadonlySet<string> = new Set([
  'arrow_function',
  'function',
  'function_expression',
  'generator_function',
  'generator_function_declaration',
  'method_definition',
])

/**
 * Determines whether an object-literal pair is non-callable data below an array boundary.
 * Traversal stops at a named variable declaration or an enclosing callable boundary.
 * @param node - The pair or property-definition node to classify.
 * @returns True when an array ancestor is reached before a preserving boundary.
 */
function isArrayDataRecordProperty(node: SgNode): boolean {
  let current = node.parent()
  while (current) {
    const kind = nodeKind(current)
    if (kind === 'array') return true
    if (kind === 'variable_declarator' || CALLABLE_BOUNDARY_KINDS.has(kind)) return false
    current = current.parent()
  }
  return false
}

/**
 * Extracts the raw comment text immediately preceding a declaration node.
 * Handles export statements and variable declarations by walking up to the
 * appropriate parent before checking the previous sibling.
 * @param node - The AST node representing the declaration.
 * @returns The comment text, or undefined if no comment precedes the node.
 */
function extractComment(node: SgNode): string | undefined {
  let target: SgNode = node
  const parentKind = node.parent() ? nodeKind(node.parent()!) : ''

  if (parentKind === 'export_statement') {
    target = node.parent()!
  }

  if (nodeKind(target) === 'variable_declarator' && target.parent()) {
    const grandparent = target.parent()!
    const grandparentKind = nodeKind(grandparent)
    if (grandparentKind === 'lexical_declaration' || grandparentKind === 'variable_declaration') {
      const ggParent = grandparent.parent()
      if (ggParent && nodeKind(ggParent) === 'export_statement') {
        target = ggParent
      } else {
        target = grandparent
      }
    }
  }

  const prev = target.prev()
  if (prev && nodeKind(prev) === 'comment') {
    return prev.text()
  }
  return undefined
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

const FUNCTION_SCOPE_KINDS = new Set([
  'function_declaration',
  'function_expression',
  'function',
  'generator_function',
  'generator_function_declaration',
  'arrow_function',
  'method_definition',
])

/**
 * Collects binding identifiers introduced by a parameter list or declaration pattern.
 * Type annotations and default values are skipped because they do not bind names.
 * @param node - Pattern or parameter subtree.
 * @param names - Accumulator of bound names.
 */
function collectBoundNames(node: SgNode, names: Set<string>): void {
  const kind = nodeKind(node)
  if (kind === 'type_annotation' || kind === 'type_parameters') return
  if (kind === 'identifier' || kind === 'shorthand_property_identifier_pattern') {
    names.add(node.text().trim())
    return
  }
  if (kind === 'required_parameter' || kind === 'optional_parameter') {
    const pattern = node.field('pattern')
    if (pattern !== null) collectBoundNames(pattern, names)
    return
  }
  if (kind === 'assignment_pattern' || kind === 'object_assignment_pattern') {
    const left = node.field('left')
    if (left !== null) collectBoundNames(left, names)
    return
  }
  if (kind === 'pair_pattern') {
    const value = node.field('value')
    if (value !== null) collectBoundNames(value, names)
    return
  }
  for (const child of node.children()) collectBoundNames(child, names)
}

/**
 * Returns whether a call target name is rebound by a parameter or block-local declaration
 * that encloses the call, so the call cannot refer to an imported or outer declaration.
 * Module-level declarations never shadow, they are ordinary same-file targets.
 * @param node - Call or construction node.
 * @param name - Callee identifier.
 * @returns True when an enclosing function parameter or local declaration binds the name.
 */
function isShadowedByEnclosingScope(node: SgNode, name: string): boolean {
  let current = node.parent()
  while (current !== null) {
    const kind = nodeKind(current)
    if (FUNCTION_SCOPE_KINDS.has(kind)) {
      const names = new Set<string>()
      const params = current.field('parameters') ?? current.field('parameter')
      if (params !== null) collectBoundNames(params, names)
      if (names.has(name)) return true
    } else if (kind === 'statement_block') {
      for (const statement of current.children()) {
        const statementKind = nodeKind(statement)
        if (statementKind === 'lexical_declaration' || statementKind === 'variable_declaration') {
          for (const declarator of statement.children()) {
            if (nodeKind(declarator) !== 'variable_declarator') continue
            const names = new Set<string>()
            const target = declarator.field('name')
            if (target !== null) collectBoundNames(target, names)
            if (names.has(name)) return true
          }
        }
      }
    } else if (kind === 'catch_clause') {
      const names = new Set<string>()
      const parameter = current.field('parameter')
      if (parameter !== null) collectBoundNames(parameter, names)
      if (names.has(name)) return true
    }
    current = current.parent()
  }
  return false
}

/**
 * Removes generic arguments and namespace qualifiers from a type reference.
 * @param reference - Raw type reference text.
 * @returns The normalized type name.
 */
function normalizeTypeReference(reference: string): string {
  // The written spelling is kept: `ns.Base` must not collapse into an unrelated `Base`.
  return reference
    .replace(/<[^>]+>/g, '')
    .trim()
    .replace(/\[\]$/g, '')
    .trim()
}

/**
 * Returns the parser range of each written type expression in a heritage clause.
 * Keywords, commas and type arguments are skipped; the ranges follow source order, the
 * same order as the parsed names. A clause whose expressions cannot be told apart yields
 * the whole clause range for every entry.
 * @param clause - `extends_clause`, `extends_type_clause` or `implements_clause` node.
 * @param count - Number of names parsed from the clause.
 * @returns One range per parsed name.
 */
function heritageExpressionRanges(clause: SgNode, count: number): SourceRange[] {
  const toRange = (node: SgNode): SourceRange => ({
    startLine: node.range().start.line + 1,
    startColumn: node.range().start.column,
    endLine: node.range().end.line + 1,
    endColumn: node.range().end.column,
  })
  const expressions = clause
    .children()
    .filter((child) => child.isNamed() && nodeKind(child) !== 'type_arguments')
  if (expressions.length >= count) return expressions.slice(0, count).map(toRange)
  return Array.from({ length: count }, () => toRange(clause))
}

/**
 * Parses a comma-separated list of type references from a heritage clause.
 * @param clauseText - Clause text following `extends` or `implements`.
 * @returns Normalized type names.
 */
function parseTypeNames(clauseText: string | undefined): string[] {
  if (!clauseText) return []
  return clauseText
    .split(',')
    .map((entry) => normalizeTypeReference(entry))
    .filter((entry) => entry.length > 0)
}

const BUILTIN_TYPE_NAMES = new Set([
  'Array',
  'BigInt',
  'Boolean',
  'Date',
  'Error',
  'Map',
  'Number',
  'Object',
  'Promise',
  'Record',
  'Set',
  'String',
  'boolean',
  'number',
  'string',
  'symbol',
  'unknown',
  'void',
])

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

/**
 * Tests whether a subtree contains a call or construction expression.
 * @param node - Subtree root.
 * @returns Whether a call-like expression is present.
 */
function containsCallExpression(node: SgNode): boolean {
  const calls: SgNode[] = []
  collectByKind(node, new Set(['call_expression', 'new_expression']), calls)
  return calls.length > 0
}

/**
 * Extracts project type names from a TypeScript type expression.
 * @param typeText - Raw type expression.
 * @returns Unique non-built-in candidate type names.
 */
function extractTypeReferenceNames(typeText: string): string[] {
  const names = new Set<string>()
  const matches = typeText.matchAll(/[A-Za-z_$][\w$]*/g)
  for (const match of matches) {
    const name = match[0]
    if (!BUILTIN_TYPE_NAMES.has(name)) {
      names.add(name)
    }
  }
  return [...names]
}

const TS_CALLABLE_KINDS = new Set<SymbolKind>([SymbolKind.Function, SymbolKind.Method])

/**
 * Counts arguments in an AST arguments node, excluding punctuation and comments.
 * @param argsNode - Arguments node to inspect.
 * @returns Number of semantic arguments.
 */
function countAstArguments(argsNode: SgNode): number {
  let count = 0
  for (const child of argsNode.children()) {
    const k = nodeKind(child)
    if (k !== '(' && k !== ')' && k !== ',' && k !== 'comment') {
      count++
    }
  }
  return count
}

/**
 * Determines whether a pair/property-definition belongs to a supported named object declaration.
 * A property under an anonymous object used as an expression, return value, or argument is unsupported.
 * @param node - Pair or property-definition node.
 * @returns Whether the property has a supported named object owner.
 */
function isNamedObjectProperty(node: SgNode): boolean {
  let current = node.parent()
  while (current) {
    const kind = nodeKind(current)
    if (
      kind === 'arguments' ||
      kind === 'call_expression' ||
      kind === 'new_expression' ||
      kind === 'return_statement' ||
      kind === 'array' ||
      kind === 'binary_expression' ||
      kind === 'unary_expression' ||
      kind === 'await_expression'
    ) {
      return false
    }
    if (kind === 'variable_declarator') {
      const nameNode = current.field('name')
      return nameNode ? nodeKind(nameNode) === 'identifier' : false
    }
    if (kind === 'export_statement') {
      return true
    }
    current = current.parent()
  }
  return false
}

/**
 * Checks whether an arrow function or function expression is anonymous.
 * @param node - Callable node to inspect.
 * @returns Whether the callable lacks a stable declared owner.
 */
function isAnonymousCallable(node: SgNode): boolean {
  const parent = node.parent()
  if (!parent) return true
  const parentKind = nodeKind(parent)
  if (parentKind === 'variable_declarator') return false
  if (parentKind === 'assignment_expression') return false
  if (parentKind === 'public_field_definition' || parentKind === 'field_definition') return false
  if (parentKind === 'pair') return false
  return true
}

/**
 * Determines whether a call expression is a higher-order function invocation wrapping a function.
 * @param node - Call expression to inspect.
 * @returns Whether an argument contains a callable expression.
 */
function isHofCall(node: SgNode): boolean {
  if (nodeKind(node) !== 'call_expression') return false
  const args = node.field('arguments')
  if (!args) return false
  for (const child of args.children()) {
    const k = nodeKind(child)
    if (
      k === 'function' ||
      k === 'arrow_function' ||
      k === 'function_expression' ||
      k === 'generator_function'
    ) {
      return true
    }
    if (k === 'call_expression' && isHofCall(child)) {
      return true
    }
  }
  return false
}

/**
 * Represents a local class or interface declaration and the methods it owns.
 */
interface TsTypeDeclarationInfo {
  readonly name: string
  readonly symbolId: string
  readonly memberIdsByName: Record<string, string[]>
  readonly memberSymbolIds: readonly string[]
  readonly memberSemanticsById: Readonly<Record<string, MemberSemantics>>
  readonly extendsNames: readonly string[]
  readonly implementsNames: readonly string[]
  /** Parser range of each written `extends` type expression, aligned with `extendsNames`. */
  readonly extendsRanges: readonly SourceRange[]
  /** Parser range of each written `implements` type expression, aligned with `implementsNames`. */
  readonly implementsRanges: readonly SourceRange[]
}

/**
 * Classifies a TypeScript member form from its declaring syntax.
 * @param node - Method definition or interface signature node.
 * @param name - Declared member name.
 * @returns Proven shared member form.
 */
function typeScriptMemberSemantics(node: SgNode, name: string): MemberSemantics {
  if (name === 'constructor') return { kind: MemberKind.Constructor }
  if (nodeKind(node) === 'method_signature') return { kind: MemberKind.Signature }
  // Modifier keywords are parser tokens that precede the member name. A member merely named
  // `get`, `set`, or `static` has the name node first and no such token.
  const nameStart = node.field('name')?.range().start.index ?? Number.POSITIVE_INFINITY
  const leadingTokens = new Set<string>()
  for (const child of node.children()) {
    if (child.range().start.index >= nameStart) break
    leadingTokens.add(nodeKind(child))
  }
  const dispatch = leadingTokens.has('static') ? MemberDispatch.Static : MemberDispatch.Instance
  if (leadingTokens.has('get')) {
    return { kind: MemberKind.Property, dispatch, accessor: MemberAccessor.Get }
  }
  if (leadingTokens.has('set')) {
    return { kind: MemberKind.Property, dispatch, accessor: MemberAccessor.Set }
  }
  return { kind: MemberKind.Method, dispatch }
}

/** Session state key holding workspace code roots for the current indexing run. */
const WORKSPACE_CODE_ROOTS_KEY = 'typescript:workspace-code-roots'

/** Session state key holding package manifests already read in the current indexing run. */
const PACKAGE_MANIFESTS_KEY = 'typescript:package-manifests'

/** Fields of a package manifest that decide its published entry. */
interface PackageEntryManifest {
  readonly exports?: unknown
  readonly main?: string
}

/**
 * Returns run-scoped state kept on the index session rather than on the adapter instance.
 * @param session - Session owned by one indexing run.
 * @param key - State key.
 * @param create - Factory used the first time the key is requested.
 * @returns The session-scoped state value.
 */
function sessionScopedState<T>(session: IndexSession, key: string, create: () => T): T {
  const existing = session.getAdapterState<T>(key)
  if (existing !== undefined) return existing
  const created = create()
  session.setAdapterState(key, created)
  return created
}

/**
 * Reads a workspace package manifest once per run, before pass 2, and stores it on the session.
 * @param session - Session owned by one indexing run.
 * @param codeRoot - Workspace code root that may contain `package.json`.
 */
function prepareWorkspaceManifest(session: IndexSession, codeRoot: string): void {
  const manifests = sessionScopedState(
    session,
    PACKAGE_MANIFESTS_KEY,
    () => new Map<string, PackageEntryManifest | null>(),
  )
  if (manifests.has(codeRoot)) return
  try {
    manifests.set(
      codeRoot,
      JSON.parse(readFileSync(join(codeRoot, 'package.json'), 'utf8')) as PackageEntryManifest,
    )
  } catch {
    manifests.set(codeRoot, null)
  }
}

/** A local declaration published under an exported name (alias, default, or same name). */
interface TsExportBinding {
  readonly exportedName: string
  readonly localName: string
}

/** A statically named or star re-export retained for pass-2 target linking. */
interface TsReExportInfo {
  readonly specifier: string
  readonly importedName: string
  readonly exportedName: string
}

/**
 * Parser state representation for TypeScript.
 */
interface TypeScriptParserState {
  readonly kind: 'typescript'
  readonly exportedNames: readonly string[]
  readonly declarations: readonly TsTypeDeclarationInfo[]
  readonly reExports: readonly TsReExportInfo[]
}

/**
 * Language adapter for TypeScript, TSX, JavaScript, and JSX files.
 * Uses tree-sitter via ast-grep to extract symbols and relations from source code.
 */
export class TypeScriptLanguageAdapter implements LanguageAdapter {
  /**
   * Declares deterministic TypeScript and JavaScript reference semantics.
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
   * Declares parser authority and callable container policy for TypeScript/JavaScript.
   * @returns TypeScript and JavaScript declaration policy.
   */
  declarationPolicy(): AdapterDeclarationPolicy {
    return {
      languageIds: this.languages(),
      callableContainerKinds: TS_CALLABLE_KINDS,
      supportsLogicalDeclarationGroups: true,
      supportsPhysicalOnlyDeclarations: true,
      structuralFactsAreParserAuthoritative: true,
    }
  }
  /**
   * Resolves a qualified name to a path.
   * @param _qualifiedName - Qualified name.
   * @param _codeRoot - Code root.
   * @param _repoRoot - Repo root.
   * @returns Resolved path, or undefined.
   */
  resolveQualifiedNameToPath(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _qualifiedName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _codeRoot: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _repoRoot?: string,
  ): string | undefined {
    return undefined
  }

  /**
   * Returns the language identifiers this adapter handles.
   * @returns An array of supported language strings.
   */
  languages(): string[] {
    return ['typescript', 'tsx', 'javascript', 'jsx']
  }

  /**
   * Parses one TypeScript dotted member spelling.
   * @param text - Human reference text.
   * @returns One owner-then-member candidate, or none for dynamic text and canonical ids.
   */
  parseSymbolReference(text: string): ParsedSymbolReference {
    return parseDottedMemberReference(text)
  }

  /**
   * Renders a TypeScript member with the generic dotted spelling.
   * @param symbol - Logical symbol.
   * @param ownerPath - Owner simple names.
   * @returns Generic and identical native spelling.
   */
  renderSymbolReference(
    symbol: LogicalSymbol,
    ownerPath: readonly string[],
  ): { readonly generic: string; readonly native: string } {
    const generic = renderDottedMemberReference(symbol, ownerPath).generic
    return { generic, native: generic }
  }

  /**
   * Returns the file extension to language ID mapping for TypeScript/JavaScript.
   * @returns Extension-to-language map.
   */
  extensions(): Record<string, string> {
    return { '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx' }
  }

  /**
   * Analyzes a TypeScript file.
   * @param filePath - File path.
   * @param content - File content.
   * @param context - The adapter analyze context.
   * @returns Extracted file analysis draft.
   */
  analyzeFile(
    filePath: string,
    content: string,
    context: AdapterAnalyzeContext,
  ): FileAnalysisDraft {
    const lang = langForFile(filePath)
    const sgRoot = parse(lang, content)
    // Keep the parsed SgRoot instance alive in the session state to prevent
    // V8 garbage collection from running its native Rust finalizer during
    // event loop yields. This avoids a SIGSEGV segmentation fault caused
    // by a native concurrency/double-free bug in @ast-grep/napi.
    let keepAlive = context.session.getAdapterState<unknown[]>('napi-keepalive')
    if (!keepAlive) {
      keepAlive = []
      context.session.setAdapterState('napi-keepalive', keepAlive)
    }
    keepAlive.push(sgRoot)
    if (context.codeRoot !== undefined) {
      sessionScopedState(
        context.session,
        WORKSPACE_CODE_ROOTS_KEY,
        () => new Map<string, string>(),
      ).set(context.workspaceName, context.codeRoot)
      prepareWorkspaceManifest(context.session, context.codeRoot)
    }
    const root = sgRoot.root()
    const symbols: SymbolNode[] = []
    const seenSymbol = new Set<string>()
    const exportedNames = new Set<string>()
    const exportBindings: TsExportBinding[] = []
    const reExports: TsReExportInfo[] = []
    const signatureSymbolIds = new Set<string>()

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

    const allNodes: SgNode[] = []
    const targetKinds = new Set([
      'function_declaration',
      'class_declaration',
      'abstract_class_declaration',
      'method_definition',
      'method_signature',
      'property_signature',
      'type_alias_declaration',
      'interface_declaration',
      'enum_declaration',
      'lexical_declaration',
      'variable_declaration',
      'export_statement',
      'assignment_expression',
      'field_definition',
      'public_field_definition',
      'pair',
      'property_definition',
      'arrow_function',
      'function_expression',
    ])
    collectByKind(root, targetKinds, allNodes)

    for (const node of allNodes) {
      switch (nodeKind(node)) {
        case 'function_declaration': {
          const name = getName(node)
          if (name) {
            const sym = addSymbol(
              name,
              SymbolKind.Function,
              node,
              node.field('name'),
              extractComment(node),
            )
            if (sym && node.field('body') === null) {
              signatureSymbolIds.add(sym.id)
            }
          }
          break
        }
        case 'class_declaration':
        case 'abstract_class_declaration': {
          const name = getName(node)
          if (name)
            addSymbol(name, SymbolKind.Class, node, node.field('name'), extractComment(node))
          break
        }
        case 'method_definition': {
          const name = getName(node)
          if (name) {
            const sym = addSymbol(
              name,
              SymbolKind.Method,
              node,
              node.field('name'),
              extractComment(node),
            )
            if (sym && node.field('body') === null) {
              signatureSymbolIds.add(sym.id)
            }
          }
          break
        }
        case 'method_signature': {
          const name = getName(node)
          if (name) {
            const sym = addSymbol(
              name,
              SymbolKind.Method,
              node,
              node.field('name'),
              extractComment(node),
            )
            if (sym) {
              signatureSymbolIds.add(sym.id)
            }
          }
          break
        }
        case 'property_signature': {
          const nameNode = node.field('name')
          const name = nameNode ? nameNode.text().trim() : getName(node)
          if (name) {
            addSymbol(name, SymbolKind.Property, node, nameNode, extractComment(node))
          }
          break
        }
        case 'type_alias_declaration': {
          const name = getName(node)
          if (name) addSymbol(name, SymbolKind.Type, node, node.field('name'), extractComment(node))
          break
        }
        case 'interface_declaration': {
          const name = getName(node)
          if (name)
            addSymbol(name, SymbolKind.Interface, node, node.field('name'), extractComment(node))
          break
        }
        case 'enum_declaration': {
          const name = getName(node)
          if (name) addSymbol(name, SymbolKind.Enum, node, node.field('name'), extractComment(node))
          const body = node.field('body')
          if (body) {
            for (const member of body.children()) {
              if (nodeKind(member) === 'enum_assignment') {
                const nameNode = member.field('name')
                const memberName = nameNode?.text().trim()
                if (memberName) {
                  addSymbol(
                    memberName,
                    SymbolKind.Property,
                    member,
                    nameNode,
                    extractComment(member),
                  )
                }
              } else if (nodeKind(member) === 'property_identifier') {
                const memberName = member.text().trim()
                if (memberName) {
                  addSymbol(memberName, SymbolKind.Property, member, member, extractComment(member))
                }
              }
            }
          }
          break
        }
        case 'lexical_declaration':
        case 'variable_declaration': {
          this.processVariableDeclaration(node, filePath, addSymbol)
          break
        }
        case 'export_statement': {
          const decl = node.field('declaration')
          if (
            decl &&
            (nodeKind(decl) === 'lexical_declaration' || nodeKind(decl) === 'variable_declaration')
          ) {
            this.processExportedVariableDeclaration(decl, filePath, addSymbol)
          }
          break
        }
        case 'assignment_expression': {
          this.processAssignmentExpression(node, filePath, addSymbol, exportedNames)
          break
        }
        case 'field_definition':
        case 'public_field_definition': {
          this.processFieldDefinition(node, filePath, addSymbol)
          break
        }
        case 'pair':
        case 'property_definition': {
          this.processPairNode(node, filePath, addSymbol)
          break
        }
        case 'arrow_function':
        case 'function_expression': {
          if (isAnonymousCallable(node) && containsCallExpression(node)) {
            addSymbol('<anonymous>', SymbolKind.Function, node, node, extractComment(node))
          }
          break
        }
      }
    }

    const imports = this.extractImportedNamesFromData(content, root)
    const bindingFacts = this.extractBindingFactsFromData(filePath, content, symbols, imports, root)
    const callFacts = this.extractCallFactsFromData(filePath, symbols, root)

    const declarations = this.collectTypeDeclarations(root, symbols)

    for (const child of root.children()) {
      if (nodeKind(child) !== 'export_statement') continue

      const isDefaultExport = child
        .children()
        .some((candidate) => nodeKind(candidate) === 'default')
      const decl = child.field('declaration')
      if (decl) {
        const name = getName(decl)
        if (isDefaultExport) {
          // `export default function foo() {}` publishes `default`, not `foo`.
          if (name) exportBindings.push({ exportedName: 'default', localName: name })
        } else if (name) {
          exportedNames.add(name)
        }

        if (nodeKind(decl) === 'lexical_declaration' || nodeKind(decl) === 'variable_declaration') {
          for (const declarator of decl.children()) {
            if (nodeKind(declarator) === 'variable_declarator') {
              const varName = declarator.field('name')?.text()
              if (varName) exportedNames.add(varName)
            }
          }
        }
      } else if (isDefaultExport) {
        const value = child.field('value')
        if (value !== null && nodeKind(value) === 'identifier') {
          exportBindings.push({ exportedName: 'default', localName: value.text() })
        }
      }

      if (child.field('source') === null) {
        for (const specChild of child.children()) {
          if (nodeKind(specChild) !== 'export_clause') continue
          for (const specifier of specChild.children()) {
            if (nodeKind(specifier) !== 'export_specifier') continue
            const localName = specifier.field('name')?.text()
            const exportedName = specifier.field('alias')?.text() ?? localName
            if (localName !== undefined && exportedName !== undefined) {
              exportBindings.push({ exportedName, localName })
            }
          }
        }
      }

      const sourceNode = child.field('source')
      const source = sourceNode?.text().replace(/^['"]|['"]$/g, '')
      if (source) {
        const exportClause = child
          .children()
          .find((candidate) => nodeKind(candidate) === 'export_clause')
        if (exportClause) {
          for (const specifier of exportClause.children()) {
            if (nodeKind(specifier) !== 'export_specifier') continue
            const importedName = specifier.field('name')?.text()
            const exportedName = specifier.field('alias')?.text() ?? importedName
            if (importedName && exportedName) {
              reExports.push({ specifier: source, importedName, exportedName })
            }
          }
        } else if (child.text().trimStart().startsWith('export *')) {
          reExports.push({ specifier: source, importedName: '*', exportedName: '*' })
        }
      }
    }

    const referenceFacts = this.buildReferenceFacts(
      context.workspaceName,
      filePath,
      symbols,
      imports,
      exportedNames,
      exportBindings,
      reExports,
      declarations,
      signatureSymbolIds,
    )

    return {
      language: filePath.endsWith('.jsx')
        ? 'jsx'
        : lang === Lang.TypeScript
          ? 'typescript'
          : lang === Lang.Tsx
            ? 'tsx'
            : 'javascript',
      symbols: withEnclosingTypeParents(symbols),
      imports,
      bindingFacts,
      callFacts,
      referenceFacts,
      parserState: {
        kind: 'typescript',
        declarations,
        exportedNames: [...exportedNames],
        reExports,
      },
    }
  }

  /**
   * Builds conservative semantic facts from syntax already proven by this adapter.
   * @param workspace - Owning workspace.
   * @param filePath - Analyzed source path.
   * @param symbols - Extracted declarations.
   * @param imports - Extracted static imports.
   * @param exportedNames - Names proven to be exported by this module.
   * @param exportBindings - Local declarations published under an alias or `default`.
   * @param _reExports - Re-exports are linked later from parser state, not stored unresolved.
   * @param typeDeclarations - Syntax-proven local type owners and base clauses.
   * @param signatureSymbolIds - Symbol IDs that represent signatures rather than definitions.
   * @returns Additive reference facts.
   */
  private buildReferenceFacts(
    workspace: string,
    filePath: string,
    symbols: readonly SymbolNode[],
    imports: readonly ImportDeclaration[],
    exportedNames: ReadonlySet<string>,
    exportBindings: readonly TsExportBinding[],
    _reExports: readonly TsReExportInfo[],
    typeDeclarations: readonly TsTypeDeclarationInfo[],
    signatureSymbolIds: ReadonlySet<string> = new Set(),
  ): ReferenceFacts {
    const ownerByMemberId = new Map<string, string>()
    const semanticsByMemberId = new Map<string, MemberSemantics>()
    for (const declaration of typeDeclarations) {
      for (const methodId of declaration.memberSymbolIds) {
        ownerByMemberId.set(methodId, declaration.symbolId)
      }
      for (const [methodId, semantics] of Object.entries(declaration.memberSemanticsById)) {
        semanticsByMemberId.set(methodId, semantics)
      }
    }
    const lexicalParentById = new Map(
      withEnclosingTypeParents(symbols).map((symbol) => [symbol.id, symbol.parentId]),
    )
    const symbolKindById = new Map(symbols.map((symbol) => [symbol.id, symbol.kind]))
    const descriptors = symbols.map((symbol) => {
      if (symbol.name === '<anonymous>') {
        return createPhysicalOnlyDeclarationDescriptor({
          symbol,
          reason: 'anonymous-callable',
        })
      }

      // A callable declared inside another routine is lexically scoped: equal names in sibling
      // routines or blocks are different functions, so no stable logical target exists for them.
      const lexicalParentId = lexicalParentById.get(symbol.id)
      const lexicalParentKind =
        lexicalParentId === undefined ? undefined : symbolKindById.get(lexicalParentId)
      if (
        symbol.kind === SymbolKind.Function &&
        (lexicalParentKind === SymbolKind.Function || lexicalParentKind === SymbolKind.Method)
      ) {
        return createPhysicalOnlyDeclarationDescriptor({
          symbol,
          reason: 'routine-local-callable',
        })
      }

      const isSignature =
        signatureSymbolIds.has(symbol.id) || symbol.comment?.includes('@signature')

      if (symbol.kind === SymbolKind.Method) {
        const ownerId = ownerByMemberId.get(symbol.id)
        let sem = semanticsByMemberId.get(symbol.id) ?? this.memberSemantics(symbol)

        // Check if this owner has an implementation for this method name
        const ownerDecl = typeDeclarations.find((d) => d.symbolId === ownerId)
        const hasImplementation = ownerDecl?.memberSymbolIds.some(
          (id) =>
            ownerDecl.memberIdsByName[symbol.name]?.includes(id) &&
            !signatureSymbolIds.has(id) &&
            semanticsByMemberId.get(id)?.kind === MemberKind.Method,
        )

        // Normalize overload member semantics if there's an implementation in the class
        if (hasImplementation && sem?.kind === MemberKind.Signature) {
          sem = { kind: MemberKind.Method, dispatch: MemberDispatch.Instance }
        }

        const occurrenceForm = isSignature
          ? DeclarationOccurrenceForm.Signature
          : DeclarationOccurrenceForm.Definition
        const groupKey = ownerId ? `method:${ownerId}:${symbol.name}` : undefined

        return createAdapterDeclarationDescriptor({
          symbol,
          surface: filePath,
          space: this.symbolSpace(symbol.kind),
          ownerSymbolId: ownerId,
          requiresOwner: true,
          memberSemantics: sem,
          occurrenceForm,
          ...(groupKey === undefined ? {} : { groupKey }),
        })
      }

      if (symbol.kind === SymbolKind.Function) {
        const occurrenceForm = isSignature
          ? DeclarationOccurrenceForm.Signature
          : DeclarationOccurrenceForm.Definition
        const sameName = symbols.filter(
          (s) =>
            s.kind === SymbolKind.Function && s.name === symbol.name && s.name !== '<anonymous>',
        )
        const groupKey = sameName.length > 1 ? `function:${filePath}:${symbol.name}` : undefined

        return createAdapterDeclarationDescriptor({
          symbol,
          surface: filePath,
          space: this.symbolSpace(symbol.kind),
          ownerSymbolId: undefined,
          requiresOwner: false,
          memberSemantics: undefined,
          occurrenceForm,
          ...(groupKey === undefined ? {} : { groupKey }),
        })
      }

      if (symbol.kind === SymbolKind.Property) {
        // Fields, interface properties, and enum members are identified through their declaring
        // owner, so equal names in different owners never share a logical target.
        return createAdapterDeclarationDescriptor({
          symbol,
          surface: filePath,
          space: this.symbolSpace(symbol.kind),
          ownerSymbolId: ownerByMemberId.get(symbol.id) ?? lexicalParentId,
          requiresOwner: true,
          memberSemantics: semanticsByMemberId.get(symbol.id) ?? {
            kind: MemberKind.Property,
            dispatch: MemberDispatch.Instance,
          },
          occurrenceForm: DeclarationOccurrenceForm.Definition,
        })
      }

      return createAdapterDeclarationDescriptor({
        symbol,
        surface: filePath,
        space: this.symbolSpace(symbol.kind),
        ownerSymbolId: ownerByMemberId.get(symbol.id),
        requiresOwner: false,
        memberSemantics: semanticsByMemberId.get(symbol.id) ?? this.memberSemantics(symbol),
        occurrenceForm: DeclarationOccurrenceForm.Definition,
      })
    })

    const logicalFacts = buildLogicalDeclarationFacts({
      workspace,
      declarations: descriptors,
    })
    const localTypeByName = new Map(typeDeclarations.map((item) => [item.name, item]))
    const hierarchyDescriptors: AdapterHierarchyDescriptor[] = []
    for (const child of typeDeclarations) {
      child.extendsNames.forEach((name, precedence) => {
        const parent = name.includes('.') ? undefined : localTypeByName.get(name)
        if (parent) {
          hierarchyDescriptors.push({
            childSymbolId: child.symbolId,
            parentSymbolId: parent.symbolId,
            kind: 'extends',
            precedence,
          })
        }
      })
      child.implementsNames.forEach((name, precedence) => {
        const parent = name.includes('.') ? undefined : localTypeByName.get(name)
        if (parent) {
          hierarchyDescriptors.push({
            childSymbolId: child.symbolId,
            parentSymbolId: parent.symbolId,
            kind: 'implements',
            precedence,
          })
        }
      })
    }
    const hierarchyFacts = buildHierarchyReferenceFacts({
      hierarchy: hierarchyDescriptors,
      logicalBySymbolId: logicalFacts.logicalBySymbolId,
    })
    const routes: readonly TsExportBinding[] = [
      ...[...exportedNames].map((name) => ({ exportedName: name, localName: name })),
      ...exportBindings,
    ]
    const publicBindings = routes.flatMap((route) =>
      symbols
        .filter((symbol) => !ownerByMemberId.has(symbol.id) && symbol.name === route.localName)
        .map((symbol) =>
          createPublicBinding({
            surface: filePath,
            exportedName: route.exportedName,
            space: this.symbolSpace(symbol.kind),
            targetId: logicalFacts.logicalBySymbolId.get(symbol.id)?.id,
          }),
        ),
    )
    const localBindings = imports
      .filter((item) => item.localName.length > 0)
      .map((item) =>
        createLocalBinding({
          filePath,
          scopeId: 'module',
          localName: item.localName,
          // ImportDeclarationKind intentionally preserves syntax form, not TS's
          // separate type/value namespace. Unresolved imports therefore stay in
          // the value space until a later, proven binding fact selects otherwise.
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
   * Maps a legacy symbol kind to a conservative namespace.
   * @param kind - Legacy symbol kind.
   * @returns Its conservative namespace.
   */
  private symbolSpace(kind: SymbolKind): SymbolSpace {
    if (kind === SymbolKind.Type || kind === SymbolKind.Interface || kind === SymbolKind.Class) {
      return SymbolSpace.Type
    }
    return SymbolSpace.Value
  }

  /**
   * Determines a proven member form from an extracted symbol.
   * @param symbol - Extracted symbol.
   * @returns Proven member form, if any.
   */
  private memberSemantics(symbol: SymbolNode): MemberSemantics | undefined {
    if (symbol.kind === SymbolKind.Method) {
      return { kind: MemberKind.Method, dispatch: MemberDispatch.Instance }
    }
    return undefined
  }

  /**
   * Resolves raw imports extracted in Pass 1 into symbol mappings and file dependencies.
   */
  /**
   * Resolves TypeScript imports.
   * @param analysis - File analysis.
   * @param context - Import resolution context.
   * @returns Resolved imports.
   */
  resolveImports(analysis: FileAnalysis, context: ImportResolutionContext): ResolvedImports {
    const importMap = new Map<string, string>()
    const fileImports: string[] = []
    const knownPackages = [...context.packageToWorkspace.keys()]
    const { session, qualifiedNames, packageToWorkspace, codeRoot, repoRoot } = context

    for (const imp of analysis.imports) {
      if (isFileOnlyImport(imp)) {
        const resolved = this.resolveFileImport(imp, analysis.filePath, session, codeRoot, repoRoot)
        if (resolved !== undefined) {
          fileImports.push(resolved)
        }
        continue
      }

      if (imp.isRelative) {
        const resolved = this.resolveRelativeImportPath(analysis.filePath, imp.specifier)
        const candidates = Array.isArray(resolved) ? resolved : [resolved]
        if (
          imp.kind === ImportDeclarationKind.Namespace ||
          imp.kind === ImportDeclarationKind.Default
        ) {
          const moduleFiles = candidates.filter(
            (candidate) => session.getFileId(candidate) !== undefined,
          )
          if (moduleFiles.length !== 1) continue
          const moduleFile = moduleFiles[0]!
          // A namespace or default import depends on the module itself.
          fileImports.push(moduleFile)
          if (imp.kind === ImportDeclarationKind.Default) {
            const target = this.findDefaultExportDeclaration(session, moduleFile)
            if (target !== undefined) importMap.set(imp.localName, target)
          }
          continue
        }
        for (const candidatePath of candidates) {
          const target =
            session.findSymbolsByFile(candidatePath).find((s) => s.name === imp.originalName) ??
            this.resolveReExportedSymbol(session, candidatePath, imp.originalName, new Set())
          if (target) {
            importMap.set(imp.localName, target.id)
            fileImports.push(target.filePath)
            break
          }
        }
      } else {
        const qualifiedId = qualifiedNames.get(imp.specifier)
        if (qualifiedId) {
          importMap.set(imp.localName, qualifiedId)
          continue
        }

        const pkgName = this.resolvePackageFromSpecifier(imp.specifier, knownPackages)
        if (pkgName) {
          const wsPrefix = packageToWorkspace.get(pkgName)
          if (wsPrefix !== undefined) {
            const candidates = session.findSymbolsByName(imp.originalName, wsPrefix + ':')
            if (candidates.length === 1) {
              importMap.set(imp.localName, candidates[0]!.id)
              fileImports.push(candidates[0]!.filePath)
            }
          }
        }

        if (this.resolveQualifiedNameToPath && codeRoot) {
          const resolvedPath = this.resolveQualifiedNameToPath(imp.specifier, codeRoot, repoRoot)
          if (resolvedPath) {
            fileImports.push(resolvedPath)
            continue
          }
        }
      }
    }

    return { importMap, fileImports: [...new Set(fileImports)] }
  }

  /**
   * Resolves a heritage type name through imports using its written spelling.
   * An unqualified name uses the import map. `ns.Type` resolves only through a namespace
   * import of an indexed relative module, never through an unrelated simple name.
   * @param written - Type name as written in the `extends`/`implements` clause.
   * @param analysis - Analyzed file carrying its import declarations.
   * @param context - Relation build context holding resolved imports and the session.
   * @returns The imported declaration id, or undefined when no import proves it.
   */
  private resolveImportedTypeName(
    written: string,
    analysis: FileAnalysis,
    context: RelationBuildContext,
  ): string | undefined {
    if (!written.includes('.')) return context.resolvedImports.importMap.get(written)
    const [namespaceName, ...rest] = written.split('.')
    if (rest.length !== 1 || namespaceName === undefined) return undefined
    const typeName = rest[0]!
    const namespaceImport = analysis.imports.find(
      (declaration) =>
        declaration.kind === ImportDeclarationKind.Namespace &&
        declaration.localName === namespaceName &&
        declaration.isRelative,
    )
    if (namespaceImport === undefined) return undefined
    const resolved = this.resolveRelativeImportPath(analysis.filePath, namespaceImport.specifier)
    const candidates = (Array.isArray(resolved) ? resolved : [resolved]).filter(
      (candidate) => context.session.getFileId(candidate) !== undefined,
    )
    if (candidates.length !== 1) return undefined
    const file = candidates[0]!
    return (
      context.session.findSymbolsByFile(file).find((symbol) => symbol.name === typeName)?.id ??
      this.resolveReExportedSymbol(context.session, file, typeName, new Set())?.id
    )
  }

  /**
   * Finds the declaration published under `default` by one module.
   * @param session - Index session holding public bindings and declarations.
   * @param moduleFile - Indexed module file id.
   * @returns The default export's declaration id, or undefined for anonymous or absent defaults.
   */
  private findDefaultExportDeclaration(
    session: IndexSession,
    moduleFile: string,
  ): string | undefined {
    const binding = session
      .getPublicBindings()
      .find((item) => item.surface === moduleFile && item.exportedName === 'default')
    if (binding?.targetId === undefined) return undefined
    const fileSymbolIds = new Set(session.findSymbolsByFile(moduleFile).map((symbol) => symbol.id))
    return session
      .getDeclarationsByLogicalId()
      .get(binding.targetId)
      ?.find((declaration) => fileSymbolIds.has(declaration.symbolId))?.symbolId
  }

  /**
   * Follows statically declared TypeScript re-export routes to a source declaration.
   * @param session - Shared indexing session.
   * @param filePath - Public surface being imported.
   * @param exportedName - Name requested from that surface.
   * @param visited - Cycle guard for malformed re-export graphs.
   * @returns Proven source symbol, when one unique route is available.
   */
  private resolveReExportedSymbol(
    session: IndexSession,
    filePath: string,
    exportedName: string,
    visited: Set<string>,
  ): SymbolNode | undefined {
    const visitKey = JSON.stringify([filePath, exportedName])
    if (visited.has(visitKey)) return undefined
    visited.add(visitKey)

    const analysis = session.getAnalysis(filePath)
    const state = analysis?.parserState as TypeScriptParserState | undefined
    if (state?.kind !== 'typescript') return undefined
    const matches = (state.reExports ?? []).filter(
      (route) => route.exportedName === exportedName || route.exportedName === '*',
    )
    const targets: SymbolNode[] = []
    for (const route of matches) {
      const sourceName = route.importedName === '*' ? exportedName : route.importedName
      const resolved = this.resolveRelativeImportPath(filePath, route.specifier)
      const candidates = Array.isArray(resolved) ? resolved : [resolved]
      for (const candidatePath of candidates) {
        const target =
          session.findSymbolsByFile(candidatePath).find((symbol) => symbol.name === sourceName) ??
          this.resolveReExportedSymbol(session, candidatePath, sourceName, visited)
        if (target && !targets.some((candidate) => candidate.id === target.id)) targets.push(target)
      }
    }
    return targets.length === 1 ? targets[0] : undefined
  }

  /**
   * Resolves a file import.
   * @param imp - Import declaration.
   * @param filePath - Path of the file.
   * @param session - Index session.
   * @param codeRoot - Code root.
   * @param repoRoot - Repo root.
   * @returns Resolved path, or undefined.
   */
  private resolveFileImport(
    imp: ImportDeclaration,
    filePath: string,
    session: IndexSession,
    codeRoot?: string,
    repoRoot?: string,
  ): string | undefined {
    if (imp.isRelative) {
      const resolved = this.resolveRelativeImportPath(filePath, imp.specifier)
      const candidates = Array.isArray(resolved) ? resolved : [resolved]
      return candidates.find((candidatePath) => session.findSymbolsByFile(candidatePath).length > 0)
    }

    if (!imp.isRelative && codeRoot) {
      return this.resolveQualifiedNameToPath?.(imp.specifier, codeRoot, repoRoot)
    }

    return undefined
  }

  /**
   * Builds TypeScript relations.
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

    const tsState = analysis.parserState as TypeScriptParserState | undefined
    const exportedNames = new Set(tsState?.exportedNames ?? [])
    for (const symbol of analysis.symbols) {
      if (exportedNames.has(symbol.name)) {
        relations.push(
          createRelation({
            source: analysis.filePath,
            target: symbol.id,
            type: RelationType.Exports,
          }),
        )
      }
    }

    const declarations = tsState?.declarations ?? []
    const declarationsByName = new Map<string, TsTypeDeclarationInfo>(
      declarations.map((declaration) => [declaration.name, declaration]),
    )
    const seen = new Set<string>()

    for (const declaration of declarations) {
      for (const [precedence, parentName] of declaration.extendsNames.entries()) {
        const importedId = this.resolveImportedTypeName(parentName, analysis, context)
        const targetId = importedId ?? declarationsByName.get(parentName)?.symbolId
        if (!targetId) continue

        const key = `${declaration.symbolId}:${RelationType.Extends}:${targetId}`
        if (!seen.has(key)) {
          seen.add(key)
          relations.push(
            createRelation({
              source: declaration.symbolId,
              target: targetId,
              type: RelationType.Extends,
              metadata:
                importedId === targetId && declaration.extendsRanges[precedence] !== undefined
                  ? createImportedHierarchyMetadata({
                      clauseRange: declaration.extendsRanges[precedence],
                      precedence,
                      requestedName: parentName,
                      resolvedTargetSymbolId: targetId,
                    })
                  : { precedence },
            }),
          )
        }

        const localTarget = declarationsByName.get(parentName)
        if (localTarget) {
          this.addOverrideRelations(
            declaration,
            localTarget,
            RelationType.Overrides,
            relations,
            seen,
          )
        }
      }

      for (const [precedence, contractName] of declaration.implementsNames.entries()) {
        const importedId = this.resolveImportedTypeName(contractName, analysis, context)
        const targetId = importedId ?? declarationsByName.get(contractName)?.symbolId
        if (!targetId) continue

        const key = `${declaration.symbolId}:${RelationType.Implements}:${targetId}`
        if (!seen.has(key)) {
          seen.add(key)
          relations.push(
            createRelation({
              source: declaration.symbolId,
              target: targetId,
              type: RelationType.Implements,
              metadata:
                importedId === targetId && declaration.implementsRanges[precedence] !== undefined
                  ? createImportedHierarchyMetadata({
                      clauseRange: declaration.implementsRanges[precedence],
                      precedence,
                      requestedName: contractName,
                      resolvedTargetSymbolId: targetId,
                    })
                  : { precedence },
            }),
          )
        }

        const localTarget = declarationsByName.get(contractName)
        if (localTarget) {
          this.addOverrideRelations(
            declaration,
            localTarget,
            RelationType.Overrides,
            relations,
            seen,
          )
        }
      }
    }

    for (const call of analysis.callFacts) {
      if (call.form === CallForm.Free && call.callerSymbolId) {
        const calleeId =
          context.resolvedImports.importMap.get(call.name) ??
          this.resolveVisibleFreeCallee(analysis.symbols, call.callerSymbolId, call.name)
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

    context.session.addRelations(
      relations.filter(
        (relation) =>
          relation.type === RelationType.Extends || relation.type === RelationType.Implements,
      ),
    )
    return relations
  }

  /**
   * Resolves a bare-name call to a declaration that is lexically visible to its caller.
   *
   * Only a module-level callable, or a callable declared inside the caller or one of its
   * enclosing routines, can be the target of a free call. Members of classes and interfaces
   * are reached through a receiver, never by a bare name, and are never candidates.
   * @param symbols - Symbols declared in the file.
   * @param callerSymbolId - Routine that contains the call.
   * @param name - Called identifier.
   * @returns The visible callee symbol ID, or undefined when none is provable.
   */
  private resolveVisibleFreeCallee(
    symbols: readonly SymbolNode[],
    callerSymbolId: string,
    name: string,
  ): string | undefined {
    const byId = new Map(symbols.map((symbol) => [symbol.id, symbol]))
    const enclosingRoutines = new Set<string | undefined>([undefined])
    for (
      let current = byId.get(callerSymbolId);
      current !== undefined;
      current = current.parentId === undefined ? undefined : byId.get(current.parentId)
    ) {
      if (current.kind === SymbolKind.Function || current.kind === SymbolKind.Method) {
        enclosingRoutines.add(current.id)
      }
    }
    const visible = symbols.filter(
      (symbol) =>
        symbol.name === name &&
        (symbol.kind === SymbolKind.Function ||
          symbol.kind === SymbolKind.Variable ||
          symbol.kind === SymbolKind.Class) &&
        enclosingRoutines.has(symbol.parentId),
    )
    return visible.at(-1)?.id
  }

  /**
   * Processes a variable declaration node to extract function-assigned variables as symbols.
   * @param node - The variable declaration AST node.
   * @param filePath - Path to the source file.
   * @param addSymbol - Callback to register a discovered symbol.
   */
  /**
   * Processes a variable declarator, extracting plain identifiers, destructuring patterns, or HOFs.
   * @param child - The variable declarator AST node.
   * @param filePath - The path to the source file.
   * @param addSymbol - Callback to register a discovered symbol.
   * @param isExported - Whether the parent declaration is exported.
   */
  private processVariableDeclarator(
    child: SgNode,
    filePath: string,
    addSymbol: (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      selectionNode: SgNode | null | undefined,
      comment: string | undefined,
    ) => void,
    isExported: boolean,
  ): void {
    const nameNode = child.field('name')
    if (!nameNode) return
    const kind = nodeKind(nameNode)

    if (kind === 'object_pattern' || kind === 'array_pattern') {
      const collectIdentifiers = (n: SgNode): void => {
        const nKind = nodeKind(n)
        if (
          nKind === 'shorthand_property_identifier_pattern' ||
          nKind === 'shorthand_property_identifier' ||
          nKind === 'identifier'
        ) {
          const idName = n.text().trim()
          if (idName) {
            addSymbol(idName, SymbolKind.Variable, child, n, extractComment(child))
          }
        }
        for (const c of n.children()) {
          collectIdentifiers(c)
        }
      }
      collectIdentifiers(nameNode)
      return
    }

    if (kind === 'identifier') {
      const name = nameNode.text().trim()
      const valueNode = child.field('value')
      if (valueNode) {
        const valKind = nodeKind(valueNode)
        if (
          valKind === 'arrow_function' ||
          valKind === 'function' ||
          valKind === 'function_expression' ||
          valKind === 'generator_function' ||
          (valKind === 'call_expression' && isHofCall(valueNode))
        ) {
          addSymbol(name, SymbolKind.Function, child, nameNode, extractComment(child))
        } else {
          if (isExported) {
            addSymbol(name, SymbolKind.Variable, child, nameNode, extractComment(child))
          }
        }
      } else {
        if (isExported) {
          addSymbol(name, SymbolKind.Variable, child, nameNode, extractComment(child))
        }
      }
    }
  }

  /**
   * Processes a variable declaration to extract function-assigned or plain variables.
   * @param node - The variable declaration AST node.
   * @param filePath - The path to the source file.
   * @param addSymbol - Callback to register a discovered symbol.
   */
  private processVariableDeclaration(
    node: SgNode,
    filePath: string,
    addSymbol: (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      selectionNode: SgNode | null | undefined,
      comment: string | undefined,
    ) => void,
  ): void {
    for (const child of node.children()) {
      if (nodeKind(child) !== 'variable_declarator') continue
      this.processVariableDeclarator(child, filePath, addSymbol, false)
    }
  }

  /**
   * Processes an exported variable declaration to extract function-assigned or plain variables.
   * @param node - The variable declaration AST node.
   * @param filePath - The path to the source file.
   * @param addSymbol - Callback to register a discovered symbol.
   */
  private processExportedVariableDeclaration(
    node: SgNode,
    filePath: string,
    addSymbol: (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      selectionNode: SgNode | null | undefined,
      comment: string | undefined,
    ) => void,
  ): void {
    for (const child of node.children()) {
      if (nodeKind(child) !== 'variable_declarator') continue
      this.processVariableDeclarator(child, filePath, addSymbol, true)
    }
  }

  /**
   * Processes assignment expressions (e.g. member assignments, prototype methods, CommonJS exports).
   * @param node - The assignment expression AST node.
   * @param filePath - The path to the source file.
   * @param addSymbol - Callback to register a discovered symbol.
   * @param exportedNames - Set of exported symbol names for the file.
   */
  private processAssignmentExpression(
    node: SgNode,
    filePath: string,
    addSymbol: (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      selectionNode: SgNode | null | undefined,
      comment: string | undefined,
    ) => void,
    exportedNames: Set<string>,
  ): void {
    const left = node.field('left')
    const right = node.field('right')
    if (!left || !right) return

    const rawLeftText = left.text().trim()
    if (!rawLeftText) return
    const selectionNode = left.field('property') ?? left

    if (
      rawLeftText === 'module.exports' ||
      rawLeftText.startsWith('module.exports.') ||
      rawLeftText.startsWith('exports.')
    ) {
      const parts = rawLeftText.split('.')
      const exportName = parts.pop()!
      if (exportName && exportName !== 'exports' && exportName !== 'module') {
        exportedNames.add(exportName)
        const rightKind = nodeKind(right)
        if (
          rightKind === 'function' ||
          rightKind === 'arrow_function' ||
          rightKind === 'function_expression' ||
          rightKind === 'generator_function'
        ) {
          addSymbol(exportName, SymbolKind.Function, node, selectionNode, extractComment(node))
        } else {
          addSymbol(exportName, SymbolKind.Variable, node, selectionNode, extractComment(node))
        }
      }
      return
    }

    if (nodeKind(left) === 'member_expression') {
      const rightKind = nodeKind(right)
      if (
        rightKind === 'function' ||
        rightKind === 'arrow_function' ||
        rightKind === 'function_expression' ||
        rightKind === 'generator_function'
      ) {
        addSymbol(rawLeftText, SymbolKind.Method, node, selectionNode, extractComment(node))
      } else if (rightKind === 'call_expression' || rightKind === 'object') {
        addSymbol(rawLeftText, SymbolKind.Variable, node, selectionNode, extractComment(node))
      }
    }
  }

  /**
   * Processes key-value pair nodes inside object literals.
   * @param node - The pair or property definition AST node.
   * @param filePath - The path to the source file.
   * @param addSymbol - Callback to register a discovered symbol.
   */
  private processPairNode(
    node: SgNode,
    filePath: string,
    addSymbol: (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      selectionNode: SgNode | null | undefined,
      comment: string | undefined,
    ) => void,
  ): void {
    const keyNode = node.field('key')
    const valueNode = node.field('value')
    if (!keyNode || !valueNode) return

    const keyName = keyNode.text().trim()
    if (!keyName) return

    const valKind = nodeKind(valueNode)
    if (
      valKind === 'function' ||
      valKind === 'arrow_function' ||
      valKind === 'function_expression' ||
      valKind === 'generator_function'
    ) {
      addSymbol(keyName, SymbolKind.Method, node, keyNode, extractComment(node))
      return
    }

    if (
      valKind === 'object' ||
      valKind === 'string' ||
      valKind === 'number' ||
      valKind === 'boolean_literal'
    ) {
      if (isArrayDataRecordProperty(node)) return
      if (!isNamedObjectProperty(node)) return
      addSymbol(keyName, SymbolKind.Variable, node, keyNode, extractComment(node))
    }
  }

  /**
   * Processes class field definitions (e.g. class properties assigned to arrow functions).
   * @param node - The field definition AST node.
   * @param filePath - The path to the source file.
   * @param addSymbol - Callback to register a discovered symbol.
   */
  private processFieldDefinition(
    node: SgNode,
    filePath: string,
    addSymbol: (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      selectionNode: SgNode | null | undefined,
      comment: string | undefined,
    ) => void,
  ): void {
    const nameNode = node.field('name')
    const valueNode = node.field('value')
    if (!nameNode) return

    const fieldName = nameNode.text().trim()
    if (!fieldName) return

    if (
      valueNode &&
      (nodeKind(valueNode) === 'arrow_function' ||
        nodeKind(valueNode) === 'function' ||
        nodeKind(valueNode) === 'function_expression' ||
        nodeKind(valueNode) === 'generator_function')
    ) {
      addSymbol(fieldName, SymbolKind.Method, node, nameNode, extractComment(node))
    } else {
      addSymbol(fieldName, SymbolKind.Property, node, nameNode, extractComment(node))
    }
  }

  /**
   * Extracts imported names from TS AST.
   * @param content - TS content.
   * @param root - SgNode root.
   * @returns Array of import declarations.
   */
  private extractImportedNamesFromData(content: string, root: SgNode): ImportDeclaration[] {
    const results: ImportDeclaration[] = []
    const seen = new Set<string>()

    const addImport = (declaration: ImportDeclaration): void => {
      const key = `${declaration.kind ?? ImportDeclarationKind.Named}:${declaration.localName}:${declaration.originalName}:${declaration.specifier}`
      if (seen.has(key)) return
      seen.add(key)
      results.push(declaration)
    }

    for (const child of root.children()) {
      if (nodeKind(child) !== 'import_statement') continue

      const sourceNode = child.field('source')
      if (!sourceNode) continue
      const specifier = sourceNode.text().replace(/['"]/g, '')
      const isRelative = specifier.startsWith('.')
      let hasClause = false

      for (const importChild of child.children()) {
        if (nodeKind(importChild) === 'import_clause') {
          hasClause = true
          for (const clauseChild of importChild.children()) {
            const clauseKind = nodeKind(clauseChild)
            if (clauseKind === 'named_imports') {
              for (const spec of clauseChild.children()) {
                if (nodeKind(spec) === 'import_specifier') {
                  const nameNode = spec.field('name')
                  const aliasNode = spec.field('alias')
                  if (nameNode) {
                    addImport({
                      originalName: nameNode.text(),
                      localName: aliasNode ? aliasNode.text() : nameNode.text(),
                      specifier,
                      isRelative,
                      kind: ImportDeclarationKind.Named,
                    })
                  }
                }
              }
            } else if (clauseKind === 'identifier') {
              // Default import: import Foo from '...'
              addImport({
                originalName: 'default',
                localName: clauseChild.text(),
                specifier,
                isRelative,
                kind: ImportDeclarationKind.Default,
              })
            } else if (clauseKind === 'namespace_import') {
              // Namespace import: import * as Foo from '...'
              for (const nsChild of clauseChild.children()) {
                if (nodeKind(nsChild) === 'identifier') {
                  addImport({
                    originalName: '*',
                    localName: nsChild.text(),
                    specifier,
                    isRelative,
                    kind: ImportDeclarationKind.Namespace,
                  })
                  break
                }
              }
            }
          }
        }
      }

      if (!hasClause) {
        addImport({
          originalName: '',
          localName: '',
          specifier,
          isRelative,
          kind: ImportDeclarationKind.SideEffect,
        })
      }
    }

    const callNodes: SgNode[] = []
    collectByKind(root, new Set(['call_expression']), callNodes)
    for (const callNode of callNodes) {
      const fn = callNode.field('function')
      if (!fn) continue
      const fnKind = nodeKind(fn)
      const fnText = fn.text().trim()
      const isDynamic = fnKind === 'import' || fnText === 'import'
      const isRequire = fnKind === 'identifier' && fnText === 'require'
      if (!isDynamic && !isRequire) continue

      const args = callNode.field('arguments')
      if (!args) continue
      for (const arg of args.children()) {
        const ak = nodeKind(arg)
        if (ak === 'string' || ak === 'template_string' || ak === 'string_fragment') {
          const specifier = arg
            .text()
            .replace(/^[`'"]|[`'"]$/g, '')
            .trim()
          if (specifier) {
            addImport({
              originalName: '',
              localName: '',
              specifier,
              isRelative: specifier.startsWith('.'),
              kind: isDynamic ? ImportDeclarationKind.Dynamic : ImportDeclarationKind.Require,
            })
          }
          break
        }
      }
    }

    return results
  }

  /**
   * Extracts binding facts from TS AST.
   * @param filePath - Path of the file.
   * @param content - TS content.
   * @param symbols - SymbolNode array.
   * @param imports - ImportDeclaration array.
   * @param root - SgNode root.
   * @returns Array of binding facts.
   */
  private extractBindingFactsFromData(
    filePath: string,
    content: string,
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
      metadata?: Readonly<Record<string, unknown>>,
    ): void => {
      if (targetName !== undefined && BUILTIN_TYPE_NAMES.has(targetName)) return
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
        metadata,
      })
    }

    for (const declaration of imports) {
      if (declaration.localName.length === 0) continue
      const targetName =
        declaration.originalName === '*' || declaration.originalName === 'default'
          ? declaration.localName
          : declaration.originalName
      addFact(
        declaration.localName,
        BindingSourceKind.ImportedType,
        targetName,
        {
          filePath,
          line: 1,
          column: 0,
          endLine: undefined,
          endColumn: undefined,
        },
        {
          specifier: declaration.specifier,
          kind: declaration.kind ?? ImportDeclarationKind.Named,
        },
      )
    }

    this.extractClassReceiverFacts(filePath, root, addFact)
    this.extractTypedParameterFacts(filePath, root, addFact)
    this.extractReturnTypeFacts(filePath, root, addFact)
    this.extractPropertyTypeFacts(filePath, root, addFact)
    this.extractConstructionAliasFacts(filePath, root, addFact)
    this.extractTypeAliasRhsFacts(filePath, root, addFact)

    return facts
  }

  /**
   * Extracts call facts from TS AST.
   * @param filePath - Path of the file.
   * @param symbols - SymbolNode array.
   * @param root - SgNode root.
   * @returns Array of call facts.
   */
  private extractCallFactsFromData(
    filePath: string,
    symbols: SymbolNode[],
    root: SgNode,
  ): CallFact[] {
    const facts: CallFact[] = []
    const seen = new Set<string>()

    const callNodes: SgNode[] = []
    collectByKind(root, new Set(['call_expression', 'new_expression']), callNodes)

    for (const node of callNodes) {
      const k = nodeKind(node)
      const range = rangeOf(node)
      const caller = findContainingCallableSymbol(
        symbols,
        { line: range.startLine, column: range.startColumn },
        { callableKinds: TS_CALLABLE_KINDS },
      )
      const callerSymbolId = caller?.id
      const argsNode = node.field('arguments')
      const arity = argsNode ? countAstArguments(argsNode) : 0
      const location: SourceLocation = {
        filePath,
        line: range.startLine,
        column: range.startColumn,
        endLine: range.endLine,
        endColumn: range.endColumn,
      }

      if (k === 'new_expression') {
        const ctor = node.field('constructor')
        if (!ctor) continue
        let name: string
        let receiverName: string | undefined
        const ctorKind = nodeKind(ctor)
        if (ctorKind === 'identifier') {
          name = ctor.text().trim()
          if (isShadowedByEnclosingScope(node, name)) continue
        } else if (ctorKind === 'member_expression') {
          name = ctor.field('property')?.text().trim() ?? ctor.text().trim()
          const obj = ctor.field('object')
          receiverName = obj?.field('property')?.text().trim() ?? obj?.text().trim()
        } else {
          name = ctor.text().trim()
        }
        if (!name) continue
        const key = `${CallForm.Constructor}:${receiverName ?? ''}:${name}:${location.line}:${location.column}`
        if (seen.has(key)) continue
        seen.add(key)
        facts.push({
          filePath,
          scopeId: filePath,
          callerSymbolId,
          form: CallForm.Constructor,
          name,
          receiverName,
          targetName: name,
          arity,
          location,
          metadata: undefined,
        })
      } else if (k === 'call_expression') {
        const fn = node.field('function')
        if (!fn) continue
        const fnKind = nodeKind(fn)

        // Skip dynamic imports and literal require calls — handled as import declarations
        if (fnKind === 'import' || fn.text().trim() === 'import') continue
        if (fnKind === 'identifier' && fn.text().trim() === 'require') continue

        let name: string | undefined
        let receiverName: string | undefined
        let form: CallForm

        if (fnKind === 'identifier') {
          name = fn.text().trim()
          if (isShadowedByEnclosingScope(node, name)) continue
          form = CallForm.Free
        } else if (fnKind === 'member_expression') {
          const prop = fn.field('property')
          name = prop?.text().trim()
          if (!name) continue
          const obj = fn.field('object')
          if (obj) {
            const objKind = nodeKind(obj)
            if (objKind === 'identifier' || objKind === 'this') {
              receiverName = obj.text().trim()
            } else if (objKind === 'member_expression') {
              receiverName = obj.field('property')?.text().trim() ?? obj.text().trim()
            }
          }
          const isStatic =
            receiverName !== undefined &&
            symbols.some(
              (s) =>
                s.name === receiverName &&
                (s.kind === SymbolKind.Class || s.kind === SymbolKind.Enum),
            )
          form = isStatic ? CallForm.Static : CallForm.Member
        } else if (fnKind === 'super' || fn.text().trim() === 'super') {
          name = 'super'
          form = CallForm.Free
        } else {
          name = fn.field('property')?.text().trim() ?? fn.text().trim()
          form = CallForm.Free
        }

        if (!name) continue
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
    }

    return facts
  }

  /**
   * Extracts class receiver facts using AST traversal.
   * @param filePath - Path of the file.
   * @param root - SgNode root.
   * @param addFact - Callback to add fact.
   */
  private extractClassReceiverFacts(
    filePath: string,
    root: SgNode,
    addFact: (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      location: SourceLocation,
      metadata?: Readonly<Record<string, unknown>>,
    ) => void,
  ): void {
    const classNodes: SgNode[] = []
    collectByKind(root, new Set(['class_declaration', 'abstract_class_declaration']), classNodes)
    for (const node of classNodes) {
      const className = getName(node)
      if (!className) continue
      addFact('this', BindingSourceKind.Receiver, className, locationOf(node, filePath), {
        filePath,
      })
    }
  }

  /**
   * Extracts typed parameter facts using AST traversal.
   * @param filePath - Path of the file.
   * @param root - SgNode root.
   * @param addFact - Callback to add fact.
   */
  private extractTypedParameterFacts(
    filePath: string,
    root: SgNode,
    addFact: (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      location: SourceLocation,
      metadata?: Readonly<Record<string, unknown>>,
    ) => void,
  ): void {
    const paramNodes: SgNode[] = []
    collectByKind(root, new Set(['required_parameter', 'optional_parameter']), paramNodes)
    for (const node of paramNodes) {
      const patternNode = node.field('pattern') ?? node.field('name')
      const name = patternNode?.text().trim()
      const typeNode = node.field('type')
      if (!name || !typeNode) continue
      for (const targetName of extractTypeReferenceNames(typeNode.text())) {
        addFact(name, BindingSourceKind.Parameter, targetName, locationOf(node, filePath))
      }
    }
  }

  /**
   * Extracts return type facts using AST traversal.
   * @param filePath - Path of the file.
   * @param root - SgNode root.
   * @param addFact - Callback to add fact.
   */
  private extractReturnTypeFacts(
    filePath: string,
    root: SgNode,
    addFact: (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      location: SourceLocation,
      metadata?: Readonly<Record<string, unknown>>,
    ) => void,
  ): void {
    const fnNodes: SgNode[] = []
    collectByKind(
      root,
      new Set([
        'function_declaration',
        'method_definition',
        'method_signature',
        'arrow_function',
        'function_expression',
      ]),
      fnNodes,
    )
    for (const node of fnNodes) {
      const returnTypeNode = node.field('return_type')
      if (!returnTypeNode) continue
      for (const targetName of extractTypeReferenceNames(returnTypeNode.text())) {
        addFact(
          targetName,
          BindingSourceKind.ReturnType,
          targetName,
          locationOf(returnTypeNode, filePath),
        )
      }
    }
  }

  /**
   * Extracts property type facts using AST traversal.
   * @param filePath - Path of the file.
   * @param root - SgNode root.
   * @param addFact - Callback to add fact.
   */
  private extractPropertyTypeFacts(
    filePath: string,
    root: SgNode,
    addFact: (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      location: SourceLocation,
      metadata?: Readonly<Record<string, unknown>>,
    ) => void,
  ): void {
    const propNodes: SgNode[] = []
    collectByKind(
      root,
      new Set(['property_signature', 'field_definition', 'public_field_definition']),
      propNodes,
    )
    for (const node of propNodes) {
      const nameNode = node.field('name')
      const typeNode = node.field('type')
      if (!nameNode || !typeNode) continue
      const name = nameNode.text().trim()
      for (const targetName of extractTypeReferenceNames(typeNode.text())) {
        addFact(name, BindingSourceKind.Property, targetName, locationOf(node, filePath))
      }
    }
  }

  /**
   * Extracts construction alias facts using AST traversal.
   * @param filePath - Path of the file.
   * @param root - SgNode root.
   * @param addFact - Callback to add fact.
   */
  private extractConstructionAliasFacts(
    filePath: string,
    root: SgNode,
    addFact: (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      location: SourceLocation,
      metadata?: Readonly<Record<string, unknown>>,
    ) => void,
  ): void {
    const declNodes: SgNode[] = []
    collectByKind(root, new Set(['variable_declarator']), declNodes)
    for (const node of declNodes) {
      const nameNode = node.field('name')
      const valueNode = node.field('value')
      if (!nameNode || !valueNode) continue
      if (nodeKind(nameNode) !== 'identifier' || nodeKind(valueNode) !== 'new_expression') continue
      const ctorNode = valueNode.field('constructor')
      if (!ctorNode) continue
      let targetName: string | undefined
      const ctorKind = nodeKind(ctorNode)
      if (ctorKind === 'identifier') {
        targetName = ctorNode.text().trim()
      } else if (ctorKind === 'member_expression') {
        targetName = ctorNode.field('property')?.text().trim() ?? ctorNode.text().trim()
      } else {
        targetName = ctorNode.text().trim()
      }
      if (!targetName) continue
      addFact(
        nameNode.text().trim(),
        BindingSourceKind.ConstructorCall,
        targetName,
        locationOf(node, filePath),
      )
    }
  }

  /**
   * Extracts type alias RHS facts using AST traversal.
   * @param filePath - Path of the file.
   * @param root - SgNode root.
   * @param addFact - Callback to add fact.
   */
  private extractTypeAliasRhsFacts(
    filePath: string,
    root: SgNode,
    addFact: (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      location: SourceLocation,
      metadata?: Readonly<Record<string, unknown>>,
    ) => void,
  ): void {
    const aliasNodes: SgNode[] = []
    collectByKind(root, new Set(['type_alias_declaration']), aliasNodes)
    for (const node of aliasNodes) {
      const name = getName(node)
      const valueNode = node.field('value')
      if (!name || !valueNode) continue
      for (const targetName of extractTypeReferenceNames(valueNode.text())) {
        if (targetName === name) continue
        addFact(name, BindingSourceKind.ImportedType, targetName, locationOf(node, filePath))
      }
    }
  }

  /**
   * Collects type declarations using AST traversal.
   * @param root - SgNode root.
   * @param symbols - SymbolNode array.
   * @returns Array of type declarations.
   */
  private collectTypeDeclarations(root: SgNode, symbols: SymbolNode[]): TsTypeDeclarationInfo[] {
    const declarations: TsTypeDeclarationInfo[] = []
    const nodes: SgNode[] = []
    collectByKind(
      root,
      new Set(['class_declaration', 'abstract_class_declaration', 'interface_declaration']),
      nodes,
    )
    const memberNodes: SgNode[] = []
    collectByKind(root, new Set(['method_definition', 'method_signature']), memberNodes)

    for (const node of nodes) {
      const name = getName(node)
      if (!name) continue

      const lineStart = node.range().start.line + 1
      const ownerSymbol = symbols.find(
        (symbol) =>
          symbol.name === name &&
          symbol.line === lineStart &&
          symbol.column === node.range().start.column &&
          (symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Interface),
      )
      if (!ownerSymbol) continue
      const symbolId = ownerSymbol.id

      let extendsNames: string[] = []
      let implementsNames: string[] = []
      let extendsRanges: SourceRange[] = []
      let implementsRanges: SourceRange[] = []

      if (nodeKind(node) === 'interface_declaration') {
        const extendsClause = node.children().find((c) => nodeKind(c) === 'extends_type_clause')
        if (extendsClause) {
          extendsNames = parseTypeNames(extendsClause.text().replace(/^extends\s+/, ''))
          extendsRanges = heritageExpressionRanges(extendsClause, extendsNames.length)
        }
      } else {
        const heritage = node.children().find((c) => nodeKind(c) === 'class_heritage')
        if (heritage) {
          const extendsClause = heritage.children().find((c) => nodeKind(c) === 'extends_clause')
          if (extendsClause) {
            extendsNames = parseTypeNames(extendsClause.text().replace(/^extends\s+/, '')).slice(
              0,
              1,
            )
            extendsRanges = heritageExpressionRanges(extendsClause, extendsNames.length)
          }
          const implementsClause = heritage
            .children()
            .find((c) => nodeKind(c) === 'implements_clause')
          if (implementsClause) {
            implementsNames = parseTypeNames(implementsClause.text().replace(/^implements\s+/, ''))
            implementsRanges = heritageExpressionRanges(implementsClause, implementsNames.length)
          }
        }
      }

      const memberIdsByName: Record<string, string[]> = Object.create(null) as Record<
        string,
        string[]
      >
      const memberSymbolIds: string[] = []
      const memberSemanticsById: Record<string, MemberSemantics> = {}

      for (const symbol of symbols) {
        if (symbol.kind !== SymbolKind.Method && symbol.kind !== SymbolKind.Property) continue
        if (!containsSymbolRange(ownerSymbol, symbol)) continue
        const memberNode = memberNodes.find(
          (candidate) =>
            candidate.range().start.line + 1 === symbol.line && getName(candidate) === symbol.name,
        )
        if (!memberNode) continue
        memberSymbolIds.push(symbol.id)
        const existing = memberIdsByName[symbol.name]
        if (Array.isArray(existing)) {
          existing.push(symbol.id)
        } else {
          memberIdsByName[symbol.name] = [symbol.id]
        }
        memberSemanticsById[symbol.id] = typeScriptMemberSemantics(memberNode, symbol.name)
      }

      declarations.push({
        name,
        symbolId,
        memberIdsByName,
        memberSymbolIds,
        memberSemanticsById,
        extendsNames,
        implementsNames,
        extendsRanges,
        implementsRanges,
      })
    }

    return declarations
  }

  /**
   * Adds override relations.
   * @param source - Source type info.
   * @param target - Target type info.
   * @param relationType - Relation type.
   * @param relations - Relations array.
   * @param seen - Seen relations set.
   */
  private addOverrideRelations(
    source: TsTypeDeclarationInfo,
    target: TsTypeDeclarationInfo,
    relationType: RelationType,
    relations: Relation[],
    seen: Set<string>,
  ): void {
    if (!source.memberIdsByName || !target.memberIdsByName) return
    for (const [methodName, sourceMethodIds] of Object.entries(source.memberIdsByName)) {
      if (methodName === 'constructor') continue
      if (!Array.isArray(sourceMethodIds)) continue
      const targetMethodIds = target.memberIdsByName[methodName]
      if (!Array.isArray(targetMethodIds) || targetMethodIds.length === 0) continue
      for (const sourceId of sourceMethodIds) {
        for (const targetId of targetMethodIds) {
          const key = `${sourceId}:${relationType}:${targetId}`
          if (seen.has(key)) continue
          seen.add(key)
          relations.push(
            createRelation({
              source: sourceId,
              target: targetId,
              type: relationType,
            }),
          )
        }
      }
    }
  }

  /**
   * Resolves a relative import specifier to a file path.
   * Maps JS extensions to their TS equivalents (`.js` → `.ts`, `.jsx` → `.tsx`)
   * and appends `.ts` for extensionless specifiers.
   * @param fromFile - The importing file path.
   * @param specifier - The relative import specifier.
   * @returns The resolved file path.
   */
  /**
   * Copies proven public bindings from a relative or package entry file onto re-exporting files.
   * @param session - Session that already holds same-file bindings.
   * @param packageToWorkspace - Package name to workspace name.
   * @returns Bindings and steps added by this linking pass.
   */
  linkReExports(
    session: IndexSession,
    packageToWorkspace: ReadonlyMap<string, string>,
  ): {
    readonly publicBindings: readonly PublicBinding[]
    readonly steps: readonly ResolutionStep[]
  } {
    const logicalById = new Map(session.getLogicalSymbols().map((symbol) => [symbol.id, symbol]))
    const logicalIdByDeclaration = new Map<string, string>()
    for (const [logicalId, declarations] of session.getDeclarationsByLogicalId()) {
      for (const declaration of declarations)
        logicalIdByDeclaration.set(declaration.symbolId, logicalId)
    }
    const bindingsById = new Map(
      session.getPublicBindings().map((binding) => [binding.id, binding]),
    )
    const originalTargets = new Map(
      [...bindingsById].map(([id, binding]) => [id, binding.targetId]),
    )
    const bindingsBySurface = new Map<string, Map<string, PublicBinding>>()
    const bindingsByRoute = new Map<string, Map<string, PublicBinding>>()
    const routeKey = (surface: string, exportedName: string): string =>
      `${surface}\u0000${exportedName}`
    const indexBinding = (binding: PublicBinding): void => {
      bindingsById.set(binding.id, binding)
      const surfaceBindings =
        bindingsBySurface.get(binding.surface) ?? new Map<string, PublicBinding>()
      surfaceBindings.set(binding.id, binding)
      bindingsBySurface.set(binding.surface, surfaceBindings)
      const routeBindings =
        bindingsByRoute.get(routeKey(binding.surface, binding.exportedName)) ??
        new Map<string, PublicBinding>()
      routeBindings.set(binding.id, binding)
      bindingsByRoute.set(routeKey(binding.surface, binding.exportedName), routeBindings)
    }
    for (const binding of bindingsById.values()) indexBinding(binding)
    const steps: ResolutionStep[] = []
    const maxPasses = Math.max(session.getAllFilePaths().size, 1)
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = false
      for (const filePath of session.getAllFilePaths()) {
        const state = session.getAnalysis(filePath)?.parserState as
          | TypeScriptParserState
          | undefined
        if (state?.kind !== 'typescript' || state.reExports.length === 0) continue
        for (const reExport of state.reExports) {
          const sourcePath = this.resolveReExportSource(
            filePath,
            reExport.specifier,
            session,
            packageToWorkspace,
          )
          if (sourcePath === undefined) continue
          const sourceBindings = [...(bindingsBySurface.get(sourcePath)?.values() ?? [])].filter(
            (binding) => binding.targetId !== undefined && logicalById.has(binding.targetId),
          )
          const routes =
            reExport.importedName === '*'
              ? sourceBindings.filter((binding) => binding.exportedName !== 'default')
              : [
                  ...(bindingsByRoute.get(routeKey(sourcePath, reExport.importedName))?.values() ??
                    []),
                ].filter(
                  (binding) => binding.targetId !== undefined && logicalById.has(binding.targetId),
                )
          const emit = (
            exportedName: string,
            space: PublicBinding['space'],
            targetId: string,
            kind: string,
          ): void => {
            const binding = createPublicBinding({
              surface: filePath,
              exportedName,
              space,
              targetId,
            })
            if (bindingsById.get(binding.id)?.targetId !== binding.targetId) changed = true
            indexBinding(binding)
            steps.push({ fromId: binding.id, toId: targetId, kind })
          }
          for (const route of routes) {
            if (route.targetId === undefined) continue
            emit(
              reExport.exportedName === '*' ? route.exportedName : reExport.exportedName,
              route.space,
              route.targetId,
              reExport.importedName === '*' ? 're-export:star' : 're-export:named',
            )
          }
          if (reExport.importedName !== '*' && routes.length === 0) {
            const matches = session
              .findSymbolsByFile(sourcePath)
              .filter((symbol) => symbol.name === reExport.importedName)
            if (matches.length !== 1) continue
            const logicalId = logicalIdByDeclaration.get(matches[0]!.id)
            const logical = logicalId === undefined ? undefined : logicalById.get(logicalId)
            if (logical === undefined) continue
            emit(reExport.exportedName, logical.space, logical.id, 're-export:named')
          }
        }
      }
      if (!changed) break
    }
    return {
      publicBindings: [...bindingsById.values()].filter(
        (binding) => originalTargets.get(binding.id) !== binding.targetId,
      ),
      steps,
    }
  }

  /**
   * Resolves one re-export specifier to exactly one indexed source file.
   * @param fromFile - Re-exporting file id.
   * @param specifier - Module specifier.
   * @param session - Session used to test indexed candidates.
   * @param packageToWorkspace - Package name to workspace name.
   * @returns The single indexed file, or undefined.
   */
  private resolveReExportSource(
    fromFile: string,
    specifier: string,
    session: IndexSession,
    packageToWorkspace: ReadonlyMap<string, string>,
  ): string | undefined {
    const candidates = specifier.startsWith('.')
      ? this.relativeCandidates(fromFile, specifier)
      : this.packageEntryCandidates(specifier, packageToWorkspace, session)
    const indexed = candidates.filter((candidate) => session.getFileId(candidate) !== undefined)
    return indexed.length === 1 ? indexed[0] : undefined
  }

  /**
   * Lists relative import candidates without choosing among them.
   * @param fromFile - Importing file id.
   * @param specifier - Relative specifier.
   * @returns Candidate file ids.
   */
  private relativeCandidates(fromFile: string, specifier: string): readonly string[] {
    const resolved = this.resolveRelativeImportPath(fromFile, specifier)
    return Array.isArray(resolved) ? resolved : [resolved]
  }

  /**
   * Maps a package specifier through `exports` or `main` to source candidates.
   * @param specifier - Non-relative specifier.
   * @param packageToWorkspace - Package name to workspace name.
   * @param session - Session holding the manifests prepared during file analysis.
   * @returns Source file ids to test against the session. Empty when the package is unknown.
   */
  private packageEntryCandidates(
    specifier: string,
    packageToWorkspace: ReadonlyMap<string, string>,
    session: IndexSession,
  ): readonly string[] {
    const packageName = this.resolvePackageFromSpecifier(specifier, [...packageToWorkspace.keys()])
    if (packageName === undefined) return []
    const workspace = packageToWorkspace.get(packageName)
    const codeRoot =
      workspace === undefined
        ? undefined
        : sessionScopedState(
            session,
            WORKSPACE_CODE_ROOTS_KEY,
            () => new Map<string, string>(),
          ).get(workspace)
    if (workspace === undefined || codeRoot === undefined) return []
    // Manifests were prepared during file analysis; this pass performs no filesystem reads.
    const manifest = sessionScopedState(
      session,
      PACKAGE_MANIFESTS_KEY,
      () => new Map<string, PackageEntryManifest | null>(),
    ).get(codeRoot)
    if (manifest === undefined || manifest === null) return []
    const subpath = specifier === packageName ? '.' : `./${specifier.slice(packageName.length + 1)}`
    const published =
      subpath === '.'
        ? (publishedTarget(manifest.exports) ?? manifest.main)
        : publishedTarget(
            manifest.exports !== null && typeof manifest.exports === 'object'
              ? (manifest.exports as Record<string, unknown>)[subpath]
              : undefined,
          )
    if (published === undefined) return []
    return sourceCandidates(workspace, published)
  }

  /**
   * Resolves a relative specifier from a workspace file id.
   * @param fromFile - Importing file id.
   * @param specifier - Relative module specifier.
   * @returns One resolved file id, or several candidates when the extension is absent.
   */
  resolveRelativeImportPath(fromFile: string, specifier: string): string | string[] {
    const identity = splitWorkspaceIdentity(fromFile)
    const wsPrefix = identity === null ? '' : `${identity.workspace}:`
    const relFile = identity === null ? fromFile : identity.relativePath

    const relDir = relFile.substring(0, relFile.lastIndexOf('/'))
    const parts = specifier.split('/')
    const segments = relDir ? relDir.split('/') : []

    for (const part of parts) {
      if (part === '.') continue
      if (part === '..') {
        if (segments.length > 0) segments.pop()
      } else {
        segments.push(part)
      }
    }

    let resolved = wsPrefix + segments.join('/')

    // Map JS extensions to TS equivalents (ESM convention)
    if (resolved.endsWith('.js')) {
      resolved = resolved.slice(0, -3) + '.ts'
    } else if (resolved.endsWith('.jsx')) {
      resolved = resolved.slice(0, -4) + '.tsx'
    } else if (resolved.endsWith('.ts') || resolved.endsWith('.tsx')) {
      // Already a TS extension — keep as-is
    } else if (!resolved.includes('.', resolved.lastIndexOf('/') + 1)) {
      // Extensionless — could be a file or a directory with index.ts
      return [resolved + '.ts', resolved + '/index.ts']
    }

    return resolved
  }

  /**
   * Extracts the package name from a non-relative import specifier.
   * Scoped packages: first two segments (`@scope/name`).
   * Bare packages: first segment.
   * @param specifier - The import specifier.
   * @param knownPackages - Known package identities.
   * @returns The matching package name, or undefined.
   */
  resolvePackageFromSpecifier(specifier: string, knownPackages: string[]): string | undefined {
    const pkgName = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0]!
    return knownPackages.includes(pkgName) ? pkgName : undefined
  }

  /**
   * Declares the resolution manifests this adapter reads.
   * @returns Exact basenames used for package identity.
   */
  resolutionManifests(): readonly string[] {
    return ['package.json']
  }

  /**
   * Reads the package identity by searching for `package.json` at or above
   * the given directory, bounded by the repository root.
   * @param codeRoot - Absolute path to the workspace's code root.
   * @param repoRoot - Optional repository root to bound the search.
   * @returns The `name` field from the nearest `package.json`, or undefined.
   */
  getPackageIdentity(codeRoot: string, repoRoot?: string): string | undefined {
    return findManifestField(
      codeRoot,
      'package.json',
      (content) => {
        const pkg = JSON.parse(content) as { name?: string }
        return pkg.name
      },
      repoRoot,
    )
  }
}

/**
 * Reads the published relative path from an exports target.
 *
 * A plain string path, or a subpath map whose `.` entry is a plain string path, is read.
 * Conditional exports (`import`, `require`, `default`, and other conditions) depend on the
 * consumer's platform and resolution conditions, which this adapter cannot prove, so they
 * remain unsupported and select nothing.
 * @param raw - String target or subpath map.
 * @returns The published relative path, or undefined when the target is not a plain string path.
 */
function publishedTarget(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw
  if (raw === null || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  return typeof record['.'] === 'string' ? record['.'] : undefined
}

/**
 * Maps a published package path onto indexed source file ids.
 * @param workspace - Workspace that owns the package.
 * @param published - Relative path from package exports or main.
 * @returns Candidate source file ids. The caller keeps a candidate only when exactly one is indexed.
 */
function sourceCandidates(workspace: string, published: string): readonly string[] {
  let relative = published.replace(/^\.\//, '')
  relative = relative.replace(/\.(?:js|jsx|mjs|cjs)$/, '')
  if (relative.startsWith('dist/')) relative = `src/${relative.slice('dist/'.length)}`
  relative = relative.replace(/\.(?:ts|tsx)$/, '')
  return [
    `${workspace}:${relative}.ts`,
    `${workspace}:${relative}.tsx`,
    `${workspace}:${relative}/index.ts`,
  ]
}
