import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse, Lang } from '@ast-grep/napi'
import { type SgNode } from '@ast-grep/napi'
import {
  type LanguageAdapter,
  type AdapterAnalyzeContext,
  type ImportResolutionContext,
  type ResolvedImports,
  type RelationBuildContext,
} from '../../domain/value-objects/language-adapter.js'
import { type ImportDeclaration } from '../../domain/value-objects/import-declaration.js'
import { ImportDeclarationKind } from '../../domain/value-objects/import-declaration-kind.js'
import { BindingSourceKind, type BindingFact } from '../../domain/value-objects/binding-fact.js'
import { CallForm, type CallFact } from '../../domain/value-objects/call-fact.js'
import { type SourceLocation } from '../../domain/value-objects/source-location.js'
import { type SymbolNode, createSymbolNode } from '../../domain/value-objects/symbol-node.js'
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
  type AdapterHierarchyDescriptor,
  withEnclosingTypeParents,
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

/**
 * Removes generic arguments and namespace qualifiers from a type reference.
 * @param reference - Raw type reference text.
 * @returns The normalized type name.
 */
function normalizeTypeReference(reference: string): string {
  const withoutGenerics = reference.replace(/<[^>]+>/g, '').trim()
  const tail = withoutGenerics.split('.').at(-1) ?? withoutGenerics
  return tail.replace(/\[\]$/g, '').trim()
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
 * Computes a source location from a string offset.
 * @param filePath - Workspace-prefixed file path.
 * @param content - Source content.
 * @param index - Zero-based string offset.
 * @returns Source location for the offset.
 */
function locationFromIndex(filePath: string, content: string, index: number): SourceLocation {
  const prefix = content.slice(0, Math.max(index, 0))
  const lines = prefix.split('\n')
  return {
    filePath,
    line: lines.length,
    column: lines.at(-1)?.length ?? 0,
    endLine: undefined,
    endColumn: undefined,
  }
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

/**
 * Finds the innermost symbol starting before a source line.
 * @param symbols - Symbols extracted from the current file.
 * @param line - One-based source line.
 * @returns Matching symbol id, or undefined.
 */
function findEnclosingSymbolIdByLine(
  symbols: readonly SymbolNode[],
  line: number,
): string | undefined {
  return [...symbols]
    .filter((symbol) => symbol.line <= line)
    .sort((left, right) => {
      if (left.line !== right.line) return right.line - left.line
      return right.column - left.column
    })[0]?.id
}

/**
 * Represents a local class or interface declaration and the methods it owns.
 */
interface TsTypeDeclarationInfo {
  readonly name: string
  readonly symbolId: string
  readonly methodsByName: Record<string, string>
  readonly memberSymbolIds: readonly string[]
  readonly memberSemanticsById: Readonly<Record<string, MemberSemantics>>
  readonly extendsNames: readonly string[]
  readonly implementsNames: readonly string[]
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
  const source = node.text().trimStart()
  const isStatic =
    /^(?:(?:public|protected|private|readonly|declare|abstract|override)\s+)*static\b/.test(source)
  const dispatch = isStatic ? MemberDispatch.Static : MemberDispatch.Instance
  if (
    /\bget\b/.test(source) &&
    /^(?:(?:public|protected|private|static|readonly|declare|abstract|override)\s+)*get\b/.test(
      source,
    )
  ) {
    return { kind: MemberKind.Property, dispatch, accessor: MemberAccessor.Get }
  }
  if (
    /^(?:(?:public|protected|private|static|readonly|declare|abstract|override)\s+)*set\b/.test(
      source,
    )
  ) {
    return { kind: MemberKind.Property, dispatch, accessor: MemberAccessor.Set }
  }
  return { kind: MemberKind.Method, dispatch }
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
  private readonly workspaceCodeRoots = new Map<string, string>()

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
      this.workspaceCodeRoots.set(context.workspaceName, context.codeRoot)
    }
    const root = sgRoot.root()
    const symbols: SymbolNode[] = []
    const seenSymbol = new Set<string>()
    const exportedNames = new Set<string>()
    const reExports: TsReExportInfo[] = []

    const addSymbol = (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      selectionNode: SgNode | null | undefined,
      comment: string | undefined,
    ): void => {
      if (!selectionNode) return
      const line = node.range().start.line + 1
      const col = node.range().start.column
      const key = `${kind}:${name}:${line}:${col}`
      if (seenSymbol.has(key)) return
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
      } catch (error) {
        if (!(error instanceof RangeError)) throw error
      }
    }

    const allNodes: SgNode[] = []
    const targetKinds = new Set([
      'function_declaration',
      'class_declaration',
      'abstract_class_declaration',
      'method_definition',
      'method_signature',
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
    ])
    collectByKind(root, targetKinds, allNodes)

    for (const node of allNodes) {
      switch (nodeKind(node)) {
        case 'function_declaration': {
          const name = getName(node)
          if (name)
            addSymbol(name, SymbolKind.Function, node, node.field('name'), extractComment(node))
          break
        }
        case 'class_declaration':
        case 'abstract_class_declaration': {
          const name = getName(node)
          if (name)
            addSymbol(name, SymbolKind.Class, node, node.field('name'), extractComment(node))
          break
        }
        case 'method_definition':
        case 'method_signature': {
          const name = getName(node)
          if (name)
            addSymbol(name, SymbolKind.Method, node, node.field('name'), extractComment(node))
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
      }
    }

    const imports = this.extractImportedNamesFromData(content, root)
    const bindingFacts = this.extractBindingFactsFromData(filePath, content, symbols, imports)
    const callFacts = this.extractCallFactsFromData(filePath, content, symbols)

    const declarations = this.collectTypeDeclarations(root, symbols)

    for (const child of root.children()) {
      if (nodeKind(child) !== 'export_statement') continue

      const decl = child.field('declaration')
      if (decl) {
        const name = getName(decl)
        if (name) exportedNames.add(name)

        if (nodeKind(decl) === 'lexical_declaration' || nodeKind(decl) === 'variable_declaration') {
          for (const declarator of decl.children()) {
            if (nodeKind(declarator) === 'variable_declarator') {
              const varName = declarator.field('name')?.text()
              if (varName) exportedNames.add(varName)
            }
          }
        }
      }

      for (const specChild of child.children()) {
        if (nodeKind(specChild) === 'export_clause') {
          for (const specifier of specChild.children()) {
            if (nodeKind(specifier) === 'export_specifier') {
              const nameNode = specifier.field('name')
              const aliasNode = specifier.field('alias')
              const exportedName = aliasNode?.text() ?? nameNode?.text()
              if (exportedName) exportedNames.add(exportedName)
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
      reExports,
      declarations,
    )

    return {
      language:
        lang === Lang.TypeScript
          ? 'typescript'
          : lang === Lang.Tsx
            ? 'tsx'
            : lang === Lang.JavaScript
              ? 'javascript'
              : 'jsx',
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
   * @param _reExports - Re-exports are linked later from parser state, not stored unresolved.
   * @param typeDeclarations - Syntax-proven local type owners and base clauses.
   * @returns Additive reference facts.
   */
  private buildReferenceFacts(
    workspace: string,
    filePath: string,
    symbols: readonly SymbolNode[],
    imports: readonly ImportDeclaration[],
    exportedNames: ReadonlySet<string>,
    _reExports: readonly TsReExportInfo[],
    typeDeclarations: readonly TsTypeDeclarationInfo[],
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
    const logicalFacts = buildLogicalDeclarationFacts({
      workspace,
      declarations: symbols.map((symbol) =>
        createAdapterDeclarationDescriptor({
          symbol,
          surface: filePath,
          space: this.symbolSpace(symbol.kind),
          ownerSymbolId: ownerByMemberId.get(symbol.id),
          requiresOwner: symbol.kind === SymbolKind.Method,
          memberSemantics: semanticsByMemberId.get(symbol.id) ?? this.memberSemantics(symbol),
        }),
      ),
    })
    const localTypeByName = new Map(typeDeclarations.map((item) => [item.name, item]))
    const hierarchyDescriptors: AdapterHierarchyDescriptor[] = []
    for (const child of typeDeclarations) {
      child.extendsNames.forEach((name, precedence) => {
        const parent = localTypeByName.get(name)
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
        const parent = localTypeByName.get(name)
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
    const publicBindings = symbols
      .filter((symbol) => !ownerByMemberId.has(symbol.id) && exportedNames.has(symbol.name))
      .map((symbol) =>
        createPublicBinding({
          surface: filePath,
          exportedName: symbol.name,
          space: this.symbolSpace(symbol.kind),
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
          // ImportDeclarationKind intentionally preserves syntax form, not TS's
          // separate type/value namespace. Unresolved imports therefore stay in
          // the value space until a later, proven binding fact selects otherwise.
          space: SymbolSpace.Value,
          targetId: undefined,
        }),
      )
    return {
      declarations: logicalFacts.declarations,
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
        for (const candidatePath of candidates) {
          const target =
            session.findSymbolsByFile(candidatePath).find((s) => s.name === imp.originalName) ??
            this.resolveReExportedSymbol(session, candidatePath, imp.originalName, new Set())
          if (target) {
            importMap.set(imp.localName, target.id)
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
            if (candidates.length > 0) {
              importMap.set(imp.localName, candidates[0]!.id)
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

    return { importMap, fileImports }
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

    for (const imp of analysis.imports) {
      if (imp.isRelative) {
        const resolved = this.resolveRelativeImportPath(analysis.filePath, imp.specifier)
        const target = Array.isArray(resolved) ? resolved[0]! : resolved
        relations.push(
          createRelation({
            source: analysis.filePath,
            target,
            type: RelationType.Imports,
            metadata: { specifier: imp.specifier },
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
        const targetId =
          context.resolvedImports.importMap.get(parentName) ??
          declarationsByName.get(parentName)?.symbolId
        if (!targetId) continue

        const key = `${declaration.symbolId}:${RelationType.Extends}:${targetId}`
        if (!seen.has(key)) {
          seen.add(key)
          relations.push(
            createRelation({
              source: declaration.symbolId,
              target: targetId,
              type: RelationType.Extends,
              metadata: { precedence },
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
        const targetId =
          context.resolvedImports.importMap.get(contractName) ??
          declarationsByName.get(contractName)?.symbolId
        if (!targetId) continue

        const key = `${declaration.symbolId}:${RelationType.Implements}:${targetId}`
        if (!seen.has(key)) {
          seen.add(key)
          relations.push(
            createRelation({
              source: declaration.symbolId,
              target: targetId,
              type: RelationType.Implements,
              metadata: { precedence },
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

    const localSymbolsByName = new Map<string, string>()
    for (const s of analysis.symbols) {
      localSymbolsByName.set(s.name, s.id)
    }

    for (const call of analysis.callFacts) {
      if (call.form === CallForm.Free && call.callerSymbolId) {
        const calleeId =
          context.resolvedImports.importMap.get(call.name) ?? localSymbolsByName.get(call.name)
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

    return relations
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
          valKind === 'generator_function'
        ) {
          addSymbol(name, SymbolKind.Function, child, nameNode, extractComment(child))
        } else if (valKind === 'call_expression') {
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
    } else if (
      valKind === 'object' ||
      valKind === 'string' ||
      valKind === 'number' ||
      valKind === 'boolean_literal'
    ) {
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
      addSymbol(fieldName, SymbolKind.Variable, node, nameNode, extractComment(node))
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

    const dynamicImportPattern = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g
    for (const match of content.matchAll(dynamicImportPattern)) {
      const specifier = match[2]
      if (specifier === undefined) continue
      addImport({
        originalName: '',
        localName: '',
        specifier,
        isRelative: specifier.startsWith('.'),
        kind: ImportDeclarationKind.Dynamic,
      })
    }

    const requirePattern = /(?<!\.)\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g
    for (const match of content.matchAll(requirePattern)) {
      const specifier = match[2]
      if (specifier === undefined) continue
      addImport({
        originalName: '',
        localName: '',
        specifier,
        isRelative: specifier.startsWith('.'),
        kind: ImportDeclarationKind.Require,
      })
    }

    return results
  }

  /**
   * Extracts binding facts from TS content.
   * @param filePath - Path of the file.
   * @param content - TS content.
   * @param symbols - SymbolNode array.
   * @param imports - ImportDeclaration array.
   * @returns Array of binding facts.
   */
  private extractBindingFactsFromData(
    filePath: string,
    content: string,
    symbols: SymbolNode[],
    imports: ImportDeclaration[],
  ): BindingFact[] {
    const facts: BindingFact[] = []
    const seen = new Set<string>()

    const addFact = (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      index: number,
      metadata?: Readonly<Record<string, unknown>>,
    ): void => {
      if (targetName !== undefined && BUILTIN_TYPE_NAMES.has(targetName)) return
      const location = locationFromIndex(filePath, content, index)
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
      addFact(declaration.localName, BindingSourceKind.ImportedType, targetName, 0, {
        specifier: declaration.specifier,
        kind: declaration.kind ?? ImportDeclarationKind.Named,
      })
    }

    this.extractClassReceiverFacts(filePath, content, addFact)
    this.extractTypedParameterFacts(content, addFact)
    this.extractReturnTypeFacts(content, addFact)
    this.extractPropertyTypeFacts(content, addFact)
    this.extractConstructionAliasFacts(content, addFact)
    this.extractTypeAliasRhsFacts(content, addFact)

    return facts
  }

  /**
   * Extracts call facts from TS content.
   * @param filePath - Path of the file.
   * @param content - TS content.
   * @param symbols - SymbolNode array.
   * @returns Array of call facts.
   */
  private extractCallFactsFromData(
    filePath: string,
    content: string,
    symbols: SymbolNode[],
  ): CallFact[] {
    const facts: CallFact[] = []
    const seen = new Set<string>()

    const addFact = (
      form: CallForm,
      name: string,
      receiverName: string | undefined,
      index: number,
    ): void => {
      const location = locationFromIndex(filePath, content, index)
      const key = `${form}:${receiverName ?? ''}:${name}:${location.line}:${location.column}`
      if (seen.has(key)) return
      seen.add(key)
      facts.push({
        filePath,
        scopeId: filePath,
        callerSymbolId: findEnclosingSymbolIdByLine(symbols, location.line),
        form,
        name,
        receiverName,
        targetName: name,
        arity: undefined,
        location,
        metadata: undefined,
      })
    }

    const constructorPattern =
      /\bnew\s+(?:(?<receiver>[A-Za-z_$][\w$]*)\.)?(?<name>[A-Za-z_$][\w$]*)\s*\(/g
    for (const match of content.matchAll(constructorPattern)) {
      const name = match.groups?.name
      if (name === undefined) continue
      addFact(CallForm.Constructor, name, match.groups?.receiver, match.index ?? 0)
    }

    const memberPattern = /\b(?<receiver>[A-Za-z_$][\w$]*)\??\.\s*(?<name>[A-Za-z_$][\w$]*)\s*\(/g
    for (const match of content.matchAll(memberPattern)) {
      const receiver = match.groups?.receiver
      const name = match.groups?.name
      if (receiver === undefined || name === undefined) continue
      const form = /^[A-Z]/.test(receiver) ? CallForm.Static : CallForm.Member
      addFact(form, name, receiver, match.index ?? 0)
    }

    const freePattern = /(?<![.\w$])(?<name>[A-Za-z_$][\w$]*)\s*\(/g
    for (const match of content.matchAll(freePattern)) {
      const name = match.groups?.name
      if (name === undefined || this.isExcludedFreeCall(content, match.index ?? 0, name)) continue
      addFact(CallForm.Free, name, undefined, match.index ?? 0)
    }

    return facts
  }

  /**
   * Extracts class receiver facts.
   * @param filePath - Path of the file.
   * @param content - TS content.
   * @param addFact - Callback to add fact.
   */
  private extractClassReceiverFacts(
    filePath: string,
    content: string,
    addFact: (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      index: number,
      metadata?: Readonly<Record<string, unknown>>,
    ) => void,
  ): void {
    const classPattern = /\bclass\s+([A-Za-z_$][\w$]*)/g
    for (const match of content.matchAll(classPattern)) {
      const className = match[1]
      if (className === undefined) continue
      addFact('this', BindingSourceKind.Receiver, className, match.index ?? 0, {
        filePath,
      })
    }
  }

  /**
   * Extracts typed parameter facts.
   * @param content - TS content.
   * @param addFact - Callback to add fact.
   */
  private extractTypedParameterFacts(
    content: string,
    addFact: (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      index: number,
      metadata?: Readonly<Record<string, unknown>>,
    ) => void,
  ): void {
    const parameterPattern =
      /(?:^|[,(]\s*)(?:public|private|protected|readonly|static|\s)*([A-Za-z_$][\w$]*)\??\s*:\s*([^,)=;{}]+)/gm
    for (const match of content.matchAll(parameterPattern)) {
      const name = match[1]
      const typeText = match[2]
      if (name === undefined || typeText === undefined) continue
      for (const targetName of extractTypeReferenceNames(typeText)) {
        addFact(name, BindingSourceKind.Parameter, targetName, match.index ?? 0)
      }
    }
  }

  /**
   * Extracts return type facts.
   * @param content - TS content.
   * @param addFact - Callback to add fact.
   */
  private extractReturnTypeFacts(
    content: string,
    addFact: (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      index: number,
      metadata?: Readonly<Record<string, unknown>>,
    ) => void,
  ): void {
    const returnPattern = /\)\s*:\s*([^={;]+)\s*(?:=>|\{)/g
    for (const match of content.matchAll(returnPattern)) {
      const typeText = match[1]
      if (typeText === undefined) continue
      for (const targetName of extractTypeReferenceNames(typeText)) {
        addFact(targetName, BindingSourceKind.ReturnType, targetName, match.index ?? 0)
      }
    }
  }

  /**
   * Extracts property type facts.
   * @param content - TS content.
   * @param addFact - Callback to add fact.
   */
  private extractPropertyTypeFacts(
    content: string,
    addFact: (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      index: number,
      metadata?: Readonly<Record<string, unknown>>,
    ) => void,
  ): void {
    const propertyPattern =
      /(?:^|\n)\s*(?:public|private|protected|readonly|static|\s)*([A-Za-z_$][\w$]*)\??\s*:\s*([^=;,\n]+)/g
    for (const match of content.matchAll(propertyPattern)) {
      const name = match[1]
      const typeText = match[2]
      if (name === undefined || typeText === undefined) continue
      for (const targetName of extractTypeReferenceNames(typeText)) {
        addFact(name, BindingSourceKind.Property, targetName, match.index ?? 0)
      }
    }
  }

  /**
   * Extracts construction alias facts.
   * @param content - TS content.
   * @param addFact - Callback to add fact.
   */
  private extractConstructionAliasFacts(
    content: string,
    addFact: (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      index: number,
      metadata?: Readonly<Record<string, unknown>>,
    ) => void,
  ): void {
    const aliasPattern =
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+(?:(?:[A-Za-z_$][\w$]*)\.)?([A-Za-z_$][\w$]*)\s*\(/g
    for (const match of content.matchAll(aliasPattern)) {
      const name = match[1]
      const targetName = match[2]
      if (name === undefined || targetName === undefined) continue
      addFact(name, BindingSourceKind.ConstructorCall, targetName, match.index ?? 0)
    }
  }

  /**
   * Extracts type alias RHS facts.
   * @param content - TS content.
   * @param addFact - Callback to add fact.
   */
  private extractTypeAliasRhsFacts(
    content: string,
    addFact: (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      index: number,
      metadata?: Readonly<Record<string, unknown>>,
    ) => void,
  ): void {
    const typeAliasPattern = /\btype\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g
    for (const match of content.matchAll(typeAliasPattern)) {
      const aliasName = match[1]
      const rhsText = match[2]
      if (aliasName === undefined || rhsText === undefined) continue
      for (const targetName of extractTypeReferenceNames(rhsText)) {
        if (targetName === aliasName) continue
        addFact(aliasName, BindingSourceKind.ImportedType, targetName, match.index ?? 0)
      }
    }
  }

  /**
   * Checks if call is excluded.
   * @param content - TS content.
   * @param index - Index.
   * @param name - Name.
   * @returns True if excluded.
   */
  private isExcludedFreeCall(content: string, index: number, name: string): boolean {
    const before = content.slice(Math.max(index - 16, 0), index)
    return (
      [
        'if',
        'for',
        'while',
        'switch',
        'catch',
        'function',
        'constructor',
        'import',
        'require',
      ].includes(name) ||
      /\b(function|class|new)\s+$/.test(before) ||
      /\brequire\.resolve\s*$/.test(before)
    )
  }

  /**
   * Collects type declarations.
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

      const header = node.text().split('{')[0] ?? node.text()
      const extendsMatch = header.match(/\bextends\s+([^{]+?)(?:\bimplements\b|$)/)
      const implementsMatch = header.match(/\bimplements\s+([^{]+)$/)
      const methodsByName: Record<string, string> = {}
      const memberSymbolIds: string[] = []
      const memberSemanticsById: Record<string, MemberSemantics> = {}

      for (const symbol of symbols) {
        if (symbol.kind !== SymbolKind.Method) continue
        if (!containsSymbolRange(ownerSymbol, symbol)) continue
        const memberNode = memberNodes.find(
          (candidate) =>
            candidate.range().start.line + 1 === symbol.line && getName(candidate) === symbol.name,
        )
        if (!memberNode) continue
        memberSymbolIds.push(symbol.id)
        methodsByName[symbol.name] = symbol.id
        memberSemanticsById[symbol.id] = typeScriptMemberSemantics(memberNode, symbol.name)
      }

      declarations.push({
        name,
        symbolId,
        methodsByName,
        memberSymbolIds,
        memberSemanticsById,
        extendsNames:
          nodeKind(node) === 'interface_declaration'
            ? parseTypeNames(extendsMatch?.[1])
            : parseTypeNames(extendsMatch?.[1]).slice(0, 1),
        implementsNames:
          nodeKind(node) === 'interface_declaration' ? [] : parseTypeNames(implementsMatch?.[1]),
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
    for (const [methodName, methodId] of Object.entries(source.methodsByName)) {
      const targetMethodId = target.methodsByName[methodName]
      if (!targetMethodId) continue
      const key = `${methodId}:${relationType}:${targetMethodId}`
      if (seen.has(key)) continue
      seen.add(key)
      relations.push(
        createRelation({
          source: methodId,
          target: targetMethodId,
          type: relationType,
        }),
      )
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
      : this.packageEntryCandidates(specifier, packageToWorkspace)
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
   * @returns Source file ids to test against the session. Empty when the package is unknown.
   */
  private packageEntryCandidates(
    specifier: string,
    packageToWorkspace: ReadonlyMap<string, string>,
  ): readonly string[] {
    const packageName = this.resolvePackageFromSpecifier(specifier, [...packageToWorkspace.keys()])
    if (packageName === undefined) return []
    const workspace = packageToWorkspace.get(packageName)
    const codeRoot = workspace === undefined ? undefined : this.workspaceCodeRoots.get(workspace)
    if (workspace === undefined || codeRoot === undefined) return []
    let manifest: { exports?: unknown; main?: string }
    try {
      manifest = JSON.parse(readFileSync(join(codeRoot, 'package.json'), 'utf8')) as {
        exports?: unknown
        main?: string
      }
    } catch {
      return []
    }
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
 * @param raw - String target or conditional exports object.
 * @returns The published relative path, or undefined when the target is not a string path.
 */
function publishedTarget(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw
  if (raw === null || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  if (
    typeof record['.'] === 'string' ||
    (record['.'] !== null && typeof record['.'] === 'object')
  ) {
    return publishedTarget(record['.'])
  }
  for (const key of ['import', 'default', 'require']) {
    if (typeof record[key] === 'string') return record[key]
  }
  return undefined
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
