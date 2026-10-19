import path from 'node:path'
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
  type SourceRange,
  type SymbolNode,
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
import { type ImportDeclaration } from '../../domain/value-objects/import-declaration.js'
import { ImportDeclarationKind } from '../../domain/value-objects/import-declaration-kind.js'
import { BindingSourceKind, type BindingFact } from '../../domain/value-objects/binding-fact.js'
import { CallForm, type CallFact } from '../../domain/value-objects/call-fact.js'
import { ensureLanguagesRegistered } from './register-languages.js'
import {
  type FileAnalysisDraft,
  type FileAnalysis,
} from '../../domain/value-objects/file-analysis.js'
import { type IndexSession } from '../../domain/value-objects/index-session.js'
import {
  MemberDispatch,
  MemberKind,
  type MemberSemantics,
  SymbolSpace,
  createLocalBinding,
  type AdapterCapabilities,
  type LogicalSymbol,
  type ParsedSymbolReference,
  type ReferenceFacts,
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

const PHP_CALLABLE_KINDS = new Set<SymbolKind>([SymbolKind.Function, SymbolKind.Method])

/**
 * Represents a dynamic loader fact extracted from a PHP file.
 */
export interface DynamicLoaderFact {
  readonly via: string
  readonly value: string
  readonly candidates: readonly string[]
  readonly aliasNames: readonly string[]
  readonly scope: 'file' | 'class' | 'method'
}

/**
 * Internal PHP scope representation.
 */
interface PhpScopeInfo {
  readonly name: string
  readonly line: number
  readonly text: string
}

/**
 * Serialized PHP type representation for the parser state.
 */
interface SerializedPhpTypeInfo {
  readonly name: string
  readonly symbolId: string
  readonly kind: 'class' | 'interface' | 'type' | 'enum'
  readonly extendsNames: readonly string[]
  readonly implementsNames: readonly string[]
  readonly traitNames: readonly string[]
  /** Parser range of each written name, aligned with `extendsNames`. */
  readonly extendsRanges: readonly SourceRange[]
  /** Parser range of each written name, aligned with `implementsNames`. */
  readonly implementsRanges: readonly SourceRange[]
  /** Parser range of each written name, aligned with `traitNames`. */
  readonly traitRanges: readonly SourceRange[]
  readonly methodsByName: Record<string, string>
  readonly memberSymbolIds: readonly string[]
  readonly memberFormsById: Readonly<Record<string, MemberSemantics>>
}

/**
 * Parser state representation for PHP.
 */
interface PhpParserState {
  readonly kind: 'php'
  readonly typeInfos: readonly SerializedPhpTypeInfo[]
  readonly requireRelations: readonly Relation[]
  readonly dynamicLoaders: readonly DynamicLoaderFact[]
  readonly scopes: readonly PhpScopeInfo[]
}

/** Immutable Composer metadata prepared once per workspace in an indexing session. */
interface PhpResolutionSessionState {
  readonly kind: 'php-resolution-metadata'
  readonly psr4ByCodeRoot: ReadonlyMap<string, readonly (readonly [string, string])[]>
}

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
 * Converts an AST node range into a 1-based-line source range.
 * @param node - AST node to locate.
 * @returns Source range of the node.
 */
function phpNodeRange(node: SgNode): SourceRange {
  const range = node.range()
  return {
    startLine: range.start.line + 1,
    startColumn: range.start.column,
    endLine: range.end.line + 1,
    endColumn: range.end.column,
  }
}

/**
 * Returns candidate paths for a CakePHP model, controller, or component.
 * @param filePath - The path of the PHP file.
 * @param value - The logical name of the entity.
 * @param kind - The kind of CakePHP target.
 * @returns Array of candidate path strings.
 */
function getCakeTargetCandidates(
  filePath: string,
  value: string,
  kind: 'model' | 'controller' | 'component',
): string[] {
  const { prefix, path: rawPath } = splitWorkspacePath(filePath)
  const isAppStyle = rawPath.startsWith('app/')
  const stem = toPhpFileStem(value)

  const relCandidates =
    kind === 'model'
      ? isAppStyle
        ? [`app/models/${stem}.php`, `app/models/default/${stem}.php`]
        : [`models/${stem}.php`, `src/Models/${value.replaceAll('\\', '/')}.php`]
      : kind === 'controller'
        ? isAppStyle
          ? [`app/controllers/${stem}_controller.php`, `app/controllers/${stem}.php`]
          : [
              `controllers/${stem}_controller.php`,
              `src/Controllers/${value.replaceAll('\\', '/')}.php`,
            ]
        : isAppStyle
          ? [
              `app/controllers/components/${stem}.php`,
              `app/controllers/components/${stem}_component.php`,
            ]
          : [
              `controllers/components/${stem}.php`,
              `controllers/components/${stem}_component.php`,
              `src/Controller/Component/${value.replaceAll('\\', '/')}.php`,
            ]

  return relCandidates.map((candidate) =>
    prefix
      ? `${prefix}${candidate}`
      : path.isAbsolute(rawPath)
        ? path.resolve(path.dirname(rawPath), '..', candidate)
        : candidate,
  )
}

/**
 * Returns candidate paths for a CodeIgniter model, library, or helper.
 * @param filePath - The path of the PHP file.
 * @param value - The logical name of the entity.
 * @param kind - The kind of CodeIgniter target.
 * @returns Array of candidate path strings.
 */
function getCodeIgniterTargetCandidates(
  filePath: string,
  value: string,
  kind: 'model' | 'library' | 'helper',
): string[] {
  const { prefix, path: rawPath } = splitWorkspacePath(filePath)
  const root = rawPath.startsWith('application/') ? 'application' : 'app'
  const stem = toPhpFileStem(value)
  const relCandidates =
    kind === 'model'
      ? [`${root}/models/${stem}.php`]
      : kind === 'library'
        ? [`${root}/libraries/${stem}.php`]
        : [`${root}/helpers/${stem}_helper.php`, `${root}/helpers/${stem}.php`]

  return relCandidates.map((candidate) =>
    prefix
      ? `${prefix}${candidate}`
      : path.isAbsolute(rawPath)
        ? path.resolve(path.dirname(rawPath), '..', candidate)
        : candidate,
  )
}

/**
 * Returns candidate paths for a Yii import.
 * @param filePath - The path of the PHP file.
 * @param value - The Yii import path.
 * @returns Array of candidate path strings.
 */
function getYiiImportTargetCandidates(filePath: string, value: string): string[] {
  const { prefix } = splitWorkspacePath(filePath)
  const rel = value.startsWith('application.')
    ? `protected/${value.slice('application.'.length).replaceAll('.', '/')}.php`
    : value.replaceAll('.', '/') + '.php'
  return prefix ? [`${prefix}${rel}`] : [rel]
}

/**
 * Returns candidate paths for a generic PHP class/type namespace.
 * @param filePath - The path of the PHP file.
 * @param value - The namespaced class/type name.
 * @returns Array of candidate path strings.
 */
function getGenericPhpTargetCandidates(filePath: string, value: string): string[] {
  const { prefix } = splitWorkspacePath(filePath)
  const namespaced = value.replaceAll('\\', '/')
  const relCandidates = [`src/${namespaced}.php`, `app/${namespaced}.php`, `lib/${namespaced}.php`]
  return relCandidates.map((candidate) => (prefix ? `${prefix}${candidate}` : candidate))
}

/**
 * Returns candidate paths for a class literal reference.
 * @param filePath - The path of the PHP file.
 * @param value - The class literal string.
 * @returns Array of candidate path strings.
 */
function getFrameworkClassLiteralTargetCandidates(filePath: string, value: string): string[] {
  const normalized = value
    .replace(/^\\+/, '')
    .replace(/::class$/, '')
    .trim()
  if (!normalized || !/[A-Z_\\]/.test(normalized)) return []
  return getGenericPhpTargetCandidates(filePath, normalized)
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
 * Splits a workspace-prefixed file path into prefix and relative/absolute path.
 * @param filePath - The file path to split.
 * @returns Prefix and normalized path portion.
 */
function splitWorkspacePath(filePath: string): { prefix: string; path: string } {
  if (filePath.startsWith('/')) return { prefix: '', path: filePath }
  const identity = splitWorkspaceIdentity(filePath)
  if (identity === null) return { prefix: '', path: filePath }
  return { prefix: `${identity.workspace}:`, path: identity.relativePath }
}

/**
 * Resolves a path relative to a source file while preserving workspace prefixes.
 * @param fromFile - The source file path.
 * @param target - The relative or absolute target path.
 * @returns The resolved path.
 */
function resolveFromFilePath(fromFile: string, target: string): string {
  if (target.startsWith('/')) return target

  const { prefix, path: rawPath } = splitWorkspacePath(fromFile)
  if (path.isAbsolute(rawPath)) {
    return path.resolve(path.dirname(rawPath), target)
  }

  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rawPath), target))
  return `${prefix}${resolved}`
}

/**
 * Converts a PHP/Cake-style class or component name to snake_case file stem.
 * @param value - The logical class/component name.
 * @returns The normalized file stem.
 */
function toPhpFileStem(value: string): string {
  const tail =
    value.replaceAll('\\', '/').replaceAll('.', '/').split('/').filter(Boolean).at(-1) ?? value

  return tail
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replaceAll('-', '_')
    .toLowerCase()
}

/**
 * Returns the canonical class-like tail for a PHP dependency reference.
 * @param value - Raw loader or class-literal value.
 * @returns The normalized class tail.
 */
function getPhpClassTail(value: string): string {
  return (
    value
      .replace(/^\\+/, '')
      .replace(/::class$/, '')
      .replaceAll('/', '\\')
      .split('\\')
      .filter(Boolean)
      .at(-1) ?? value
  )
}

/**
 * Classifies a PHP method from its declaration name and the modifier nodes of its definition.
 * Modifiers are read from the parser node of the method itself, never from the text of its line,
 * so neighbouring declarations on the same or previous line cannot change the form.
 * @param symbol - Extracted method declaration.
 * @param ownerNode - Class-like declaration node that contains the method.
 * @returns Proven shared member form.
 */
function phpMemberSemantics(symbol: SymbolNode, ownerNode: SgNode): MemberSemantics {
  if (symbol.name.toLowerCase() === '__construct') return { kind: MemberKind.Constructor }
  const methods: SgNode[] = []
  const collect = (node: SgNode): void => {
    if (nodeKind(node) === 'method_declaration') methods.push(node)
    for (const child of node.children()) collect(child)
  }
  collect(ownerNode)
  const method = methods.find(
    (candidate) =>
      candidate.field('name')?.text() === symbol.name &&
      candidate.range().start.line + 1 === symbol.line,
  )
  const isStatic =
    method?.children().some((child) => nodeKind(child) === 'static_modifier') === true
  return {
    kind: MemberKind.Method,
    dispatch: isStatic ? MemberDispatch.Static : MemberDispatch.Instance,
  }
}

/**
 * Builds the unique alias names associated with a PHP dependency reference.
 * @param value - Raw loader or class-literal value.
 * @returns Unique alias names.
 */
function buildAliasNames(value: string): string[] {
  const base = getPhpClassTail(value)
  return Array.from(new Set([`$this->${base}`, `$${base}`]))
}

/**
 * Resolved dynamic-loader binding found in a PHP file.
 */
interface LoaderBinding {
  readonly via: string
  readonly value: string
  readonly targetPath: string | undefined
  readonly aliasNames: readonly string[]
  readonly scope: 'file' | 'class' | 'method'
}

/**
 * Represents a local PHP class-like declaration and the methods it owns.
 */
interface PhpTypeInfo {
  readonly name: string
  readonly symbolId: string
  readonly kind: 'class' | 'interface' | 'type' | 'enum'
  readonly extendsNames: readonly string[]
  readonly implementsNames: readonly string[]
  readonly traitNames: readonly string[]
  /** Parser range of each written name, aligned with `extendsNames`. */
  readonly extendsRanges: readonly SourceRange[]
  /** Parser range of each written name, aligned with `implementsNames`. */
  readonly implementsRanges: readonly SourceRange[]
  /** Parser range of each written name, aligned with `traitNames`. */
  readonly traitRanges: readonly SourceRange[]
  readonly methodsByName: ReadonlyMap<string, string>
  readonly memberSymbolIds: readonly string[]
  readonly memberFormsById: ReadonlyMap<string, MemberSemantics>
}

/**
 * Maps CakePHP loader package names to a concrete target kind when possible.
 * @param packageName - The package or directory argument passed to the loader.
 * @returns The inferred Cake target kind, or undefined when unsupported.
 */
function getCakePackageKind(packageName: string): 'model' | 'controller' | 'component' | undefined {
  const normalized = packageName.trim().toLowerCase()
  if (normalized === 'model' || normalized === 'models') return 'model'
  if (normalized === 'controller' || normalized === 'controllers') return 'controller'
  if (normalized === 'component' || normalized === 'components') return 'component'
  return undefined
}

/**
 * Language adapter for PHP files using tree-sitter via ast-grep.
 * Extracts functions, classes, methods, interfaces, enums, traits, and constants.
 */
export class PhpLanguageAdapter implements LanguageAdapter {
  /**
   * Declares deterministic PHP reference semantics.
   * @returns Supported reference capabilities.
   */
  capabilities(): AdapterCapabilities {
    return {
      declarations: true,
      members: true,
      publicBindings: false,
      localBindings: true,
      hierarchy: true,
      buildContext: false,
    }
  }

  /**
   * Declares deterministic PHP declaration and containment semantics.
   * @returns Declaration classification and parser-authoritative policy.
   */
  declarationPolicy(): AdapterDeclarationPolicy {
    return {
      languageIds: ['php'],
      supportsLogicalDeclarationGroups: false,
      supportsPhysicalOnlyDeclarations: true,
      callableContainerKinds: PHP_CALLABLE_KINDS,
      structuralFactsAreParserAuthoritative: true,
    }
  }
  /**
   * Resolves a package from specifier.
   * @param specifier - The package specifier.
   * @param knownPackages - Known package names.
   * @returns Package identity, or undefined.
   */
  resolvePackageFromSpecifier(specifier: string, knownPackages: string[]): string | undefined {
    // PHP resolves imports using fully qualified class names (FQN) rather than package-specifiers.
    // Therefore, package-specifier resolution is not used and always returns undefined.
    if (!specifier || knownPackages.length === 0) {
      return undefined
    }
    return undefined
  }

  /**
   * Returns the language identifiers handled by this adapter.
   * @returns Supported language ids.
   */
  languages(): string[] {
    return ['php']
  }

  /**
   * Parses PHP `::` and the generic dotted spelling into the same segments.
   * @param text - Human reference text.
   * @returns One owner-then-member candidate, or none.
   */
  parseSymbolReference(text: string): ParsedSymbolReference {
    return parseDottedMemberReference(text)
  }

  /**
   * Renders a PHP member with a native `::` spelling.
   * @param symbol - Logical symbol.
   * @param ownerPath - Owner simple names.
   * @returns Generic dotted spelling and native `::` spelling.
   */
  renderSymbolReference(
    symbol: LogicalSymbol,
    ownerPath: readonly string[],
  ): { readonly generic: string; readonly native: string } {
    const generic = renderDottedMemberReference(symbol, ownerPath).generic
    return { generic, native: [...ownerPath, symbol.name].join('::') }
  }

  /**
   * Returns the extension-to-language mapping for PHP files.
   * @returns The extension map for this adapter.
   */
  extensions(): Record<string, string> {
    return { '.php': 'php' }
  }

  /**
   * Analyzes a single file and extracts its symbols, imports, binding/call facts,
   * namespace, and any optional parser-specific state.
   * @param filePath - The path of the file to analyze.
   * @param content - The content of the file.
   * @param context - The analyzer context.
   * @returns The extracted file analysis draft.
   */
  analyzeFile(
    filePath: string,
    content: string,
    context: AdapterAnalyzeContext,
  ): FileAnalysisDraft {
    this.prepareResolutionMetadata(context)
    ensureLanguagesRegistered()
    const sgRoot = parse('php', content)
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
    const root = sgRoot.root()
    const symbols: SymbolNode[] = []
    const seenSymbol = new Set<string>()

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

    this.extractSymbolsFromNode(root, filePath, addSymbol)
    const namespace = this.findNamespace(root)

    const imports: ImportDeclaration[] = []
    this.extractNamespaceUse(root, imports)
    const walkRequires = (node: SgNode): void => {
      const k = nodeKind(node)
      if (
        k === 'require_expression' ||
        k === 'require_once_expression' ||
        k === 'include_expression' ||
        k === 'include_once_expression'
      ) {
        for (const child of node.children()) {
          const ck = nodeKind(child)
          if (ck === 'encapsed_string' || ck === 'string') {
            const specifier = child.text().replace(/^['"]|['"]$/g, '')
            if (specifier && !specifier.includes('$')) {
              imports.push({
                originalName: '',
                localName: '',
                specifier,
                isRelative: specifier.startsWith('.'),
                kind: ImportDeclarationKind.Require,
              })
            }
          }
        }
      }
      for (const child of node.children()) {
        walkRequires(child)
      }
    }
    walkRequires(root)

    const bindingFacts = this.extractBindingFactsFromData(root, filePath, content, symbols, imports)
    const callFacts = this.extractCallFactsFromData(root, filePath, content, symbols)

    const typeInfos = this.collectPhpTypeInfo(root, filePath, symbols)
    const serializedInfos = typeInfos.map((info) => {
      const methodsByName: Record<string, string> = {}
      const memberFormsById: Record<string, MemberSemantics> = {}
      for (const [mName, mId] of info.methodsByName.entries()) {
        methodsByName[mName] = mId
      }
      for (const [memberId, form] of info.memberFormsById) memberFormsById[memberId] = form
      return {
        ...info,
        methodsByName,
        memberFormsById,
      }
    })

    const requireRelations = this.extractRequireRelations(root, filePath)
    const rawDynamicLoaders = this.collectRawDynamicLoaders(root, filePath)

    const scopes: Array<{ name: string; line: number; text: string }> = []
    const walkScopes = (node: SgNode): void => {
      const kind = nodeKind(node)
      if (kind === 'function_definition' || kind === 'method_declaration') {
        const name = node.field('name')?.text()
        if (name) {
          scopes.push({
            name,
            line: node.range().start.line + 1,
            text: node.text(),
          })
        }
        return
      }
      for (const child of node.children()) {
        walkScopes(child)
      }
    }
    walkScopes(root)

    const referenceFacts = this.buildReferenceFacts(
      context.workspaceName,
      filePath,
      namespace,
      symbols,
      imports,
      typeInfos,
    )
    return {
      language: 'php',
      ...(namespace ? { namespace, namespaceSeparator: '\\' } : {}),
      symbols: withEnclosingTypeParents(symbols),
      imports,
      bindingFacts,
      callFacts,
      referenceFacts,
      parserState: {
        kind: 'php',
        typeInfos: serializedInfos,
        requireRelations,
        dynamicLoaders: rawDynamicLoaders,
        scopes,
      },
    }
  }

  /**
   * Builds conservative PHP namespace declarations and use-alias bindings.
   * @param workspace - Owning workspace.
   * @param filePath - Analyzed source path.
   * @param namespace - Declared PHP namespace, when present.
   * @param symbols - Extracted declarations.
   * @param imports - Extracted static use imports.
   * @param typeInfos - Syntax-proven class-like owners and hierarchy clauses.
   * @returns Additive reference facts.
   */
  private buildReferenceFacts(
    workspace: string,
    filePath: string,
    namespace: string | undefined,
    symbols: readonly SymbolNode[],
    imports: readonly ImportDeclaration[],
    typeInfos: readonly PhpTypeInfo[],
  ): ReferenceFacts {
    const surface = namespace ?? filePath
    const ownerByMemberSymbolId = new Map<string, string>()
    const formByMemberSymbolId = new Map<string, MemberSemantics>()
    const typeSymbolIdByName = new Map<string, string>()
    for (const info of typeInfos) {
      typeSymbolIdByName.set(info.name, info.symbolId)
      for (const methodId of info.memberSymbolIds) {
        ownerByMemberSymbolId.set(methodId, info.symbolId)
      }
      for (const [methodId, form] of info.memberFormsById) {
        formByMemberSymbolId.set(methodId, form)
      }
    }

    const symbolCountByKey = new Map<string, number>()
    for (const symbol of symbols) {
      const ownerId = ownerByMemberSymbolId.get(symbol.id)
      const space =
        symbol.kind === SymbolKind.Class ||
        symbol.kind === SymbolKind.Interface ||
        symbol.kind === SymbolKind.Enum ||
        symbol.kind === SymbolKind.Type
          ? SymbolSpace.Type
          : SymbolSpace.Value
      const key = `${surface}:${ownerId ?? ''}:${space}:${symbol.name}`
      symbolCountByKey.set(key, (symbolCountByKey.get(key) ?? 0) + 1)
    }

    const declarationDescriptors = symbols.map((symbol) => {
      const ownerId = ownerByMemberSymbolId.get(symbol.id)
      const space =
        symbol.kind === SymbolKind.Class ||
        symbol.kind === SymbolKind.Interface ||
        symbol.kind === SymbolKind.Enum ||
        symbol.kind === SymbolKind.Type
          ? SymbolSpace.Type
          : SymbolSpace.Value
      const key = `${surface}:${ownerId ?? ''}:${space}:${symbol.name}`
      if ((symbolCountByKey.get(key) ?? 0) > 1) {
        return createPhysicalOnlyDeclarationDescriptor({
          symbol,
          reason: 'conflicting-declaration',
        })
      }
      return createAdapterDeclarationDescriptor({
        symbol,
        surface,
        space,
        ownerSymbolId: ownerId,
        requiresOwner: symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Property,
        groupKey: symbol.id,
        memberSemantics:
          symbol.kind === SymbolKind.Method || symbol.kind === SymbolKind.Property
            ? (formByMemberSymbolId.get(symbol.id) ?? {
                kind: symbol.kind === SymbolKind.Property ? MemberKind.Property : MemberKind.Method,
                dispatch: MemberDispatch.Instance,
              })
            : undefined,
      })
    })
    const logicalFacts = buildLogicalDeclarationFacts({
      workspace,
      declarations: declarationDescriptors,
    })
    const hierarchyDescriptors: AdapterHierarchyDescriptor[] = []
    for (const info of typeInfos) {
      info.extendsNames.forEach((parentName, precedence) => {
        const parentSymbolId = parentName.includes('\\')
          ? undefined
          : typeSymbolIdByName.get(parentName)
        if (parentSymbolId) {
          hierarchyDescriptors.push({
            childSymbolId: info.symbolId,
            parentSymbolId,
            kind: 'extends',
            precedence,
          })
        }
      })
      info.implementsNames.forEach((parentName, precedence) => {
        const parentSymbolId = parentName.includes('\\')
          ? undefined
          : typeSymbolIdByName.get(parentName)
        if (parentSymbolId) {
          hierarchyDescriptors.push({
            childSymbolId: info.symbolId,
            parentSymbolId,
            kind: 'implements',
            precedence,
          })
        }
      })
      info.traitNames.forEach((parentName, precedence) => {
        const parentSymbolId = parentName.includes('\\')
          ? undefined
          : typeSymbolIdByName.get(parentName)
        if (parentSymbolId) {
          hierarchyDescriptors.push({
            childSymbolId: info.symbolId,
            parentSymbolId,
            kind: 'trait',
            precedence,
          })
        }
      })
    }
    const hierarchyFacts = buildHierarchyReferenceFacts({
      hierarchy: hierarchyDescriptors,
      logicalBySymbolId: logicalFacts.logicalBySymbolId,
    })
    const localBindings = imports
      .filter((item) => item.localName.length > 0)
      .map((item) =>
        createLocalBinding({
          filePath,
          scopeId: 'namespace',
          localName: item.localName,
          space: SymbolSpace.Type,
          targetId: undefined,
          range: item.range ?? WHOLE_FILE_START,
        }),
      )
    return {
      declarations: logicalFacts.declarations,
      logicalSymbols: logicalFacts.retainedLogicalSymbols,
      diagnostics: logicalFacts.diagnostics,
      publicBindings: [],
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
   * Resolves raw imports extracted in Pass 1 into symbol mappings and file dependencies.
   * @param analysis - The file analysis.
   * @param context - The import resolution context.
   * @returns The resolved imports.
   */
  resolveImports(analysis: FileAnalysis, context: ImportResolutionContext): ResolvedImports {
    const importMap = new Map<string, string>()
    const fileImports: string[] = []
    const { session, qualifiedNames, codeRoot } = context

    for (const imp of analysis.imports) {
      if (isFileOnlyImport(imp)) {
        const resolved = this.resolveFileImport(imp, analysis.filePath, session, codeRoot)
        if (resolved !== undefined) {
          fileImports.push(resolved)
        }
        continue
      }

      if (imp.isRelative) {
        const resolved = this.resolveRelativeImportPath
          ? this.resolveRelativeImportPath(analysis.filePath, imp.specifier)
          : undefined
        if (resolved) {
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
        }
      } else {
        const qualifiedId = qualifiedNames.get(imp.specifier)
        if (qualifiedId) {
          importMap.set(imp.localName, qualifiedId)
          continue
        }

        if (codeRoot) {
          const resolvedPath = this.resolveQualifiedNameFromSession(
            imp.specifier,
            codeRoot,
            session,
          )
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
   * Resolves a file import path.
   * @param imp - Import declaration.
   * @param filePath - Importing file path.
   * @param session - Index session.
   * @param codeRoot - Workspace code root.
   * @returns Resolved file path, or undefined.
   */
  private resolveFileImport(
    imp: ImportDeclaration,
    filePath: string,
    session: IndexSession,
    codeRoot?: string,
  ): string | undefined {
    if (imp.isRelative && this.resolveRelativeImportPath) {
      const resolved = this.resolveRelativeImportPath(filePath, imp.specifier)
      const candidates = Array.isArray(resolved) ? resolved : [resolved]
      return candidates.find((candidatePath) => session.findSymbolsByFile(candidatePath).length > 0)
    }

    if (!imp.isRelative && codeRoot) {
      return this.resolveQualifiedNameFromSession(imp.specifier, codeRoot, session)
    }

    return undefined
  }

  /**
   * Builds relations between symbols or files from the analyzed facts and resolved imports.
   * @param analysis - The file analysis.
   * @param context - The relation build context.
   * @returns An array of built relations.
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

    for (const symbolId of context.resolvedImports.importMap.values()) {
      const marker = symbolId.match(/:(?:class|function|method|variable|type|interface|enum):/)
      if (!marker || marker.index === undefined) continue
      relations.push(
        createRelation({
          source: analysis.filePath,
          target: symbolId.slice(0, marker.index),
          type: RelationType.Imports,
        }),
      )
    }

    const phpState = analysis.parserState as PhpParserState | undefined
    if (!phpState) return relations

    const requireRelations = phpState.requireRelations ?? []
    const dynamicLoaders = phpState.dynamicLoaders ?? []

    relations.push(
      ...requireRelations.filter(
        (relation) => context.session.getFileId(relation.target) !== undefined,
      ),
    )

    const dynamicBindings: LoaderBinding[] = []
    for (const loader of dynamicLoaders) {
      const targetPath = loader.candidates.find(
        (candidate: string) => context.session.getFileId(candidate) !== undefined,
      )
      dynamicBindings.push({
        via: loader.via,
        value: loader.value,
        targetPath,
        aliasNames: loader.aliasNames,
        scope: loader.scope,
      })
    }

    relations.push(...this.extractDynamicLoaderRelations(analysis.filePath, dynamicBindings))
    relations.push(...this.extractHierarchyRelationsFromState(analysis, context))

    context.session.addRelations(
      relations.filter(
        (relation) =>
          relation.type === RelationType.Extends ||
          relation.type === RelationType.Implements ||
          (relation.type === RelationType.UsesType &&
            relation.metadata?.['hierarchyKind'] === 'trait'),
      ),
    )
    return relations
  }

  /**
   * Extracts hierarchy relations from state.
   * @param analysis - File analysis.
   * @param context - Relation build context.
   * @returns Array of hierarchy relations.
   */
  private extractHierarchyRelationsFromState(
    analysis: FileAnalysis,
    context: RelationBuildContext,
  ): Relation[] {
    const phpState = analysis.parserState as PhpParserState | undefined
    const infos = phpState?.typeInfos ?? []
    const infoByName = new Map<string, SerializedPhpTypeInfo>(
      infos.map((info) => [info.name, info]),
    )
    const relations: Relation[] = []
    const seen = new Set<string>()

    for (const info of infos) {
      for (const [precedence, parentName] of info.extendsNames.entries()) {
        const { importedId, localTarget } = this.resolveWrittenType(
          parentName,
          analysis,
          context,
          infos,
          infoByName,
        )
        const targetId = importedId ?? localTarget?.symbolId
        if (!targetId) continue

        const key = `${info.symbolId}:${RelationType.Extends}:${targetId}`
        if (!seen.has(key)) {
          seen.add(key)
          relations.push(
            createRelation({
              source: info.symbolId,
              target: targetId,
              type: RelationType.Extends,
              metadata:
                importedId === targetId && info.extendsRanges[precedence] !== undefined
                  ? createImportedHierarchyMetadata({
                      clauseRange: info.extendsRanges[precedence],
                      precedence,
                      requestedName: parentName,
                      resolvedTargetSymbolId: targetId,
                    })
                  : { precedence },
            }),
          )
        }

        if (localTarget) {
          this.addPhpOverrideRelationsFromState(info, localTarget, relations, seen)
        }
      }

      for (const [precedence, contractName] of info.implementsNames.entries()) {
        const { importedId, localTarget } = this.resolveWrittenType(
          contractName,
          analysis,
          context,
          infos,
          infoByName,
        )
        const targetId = importedId ?? localTarget?.symbolId
        if (!targetId) continue

        const key = `${info.symbolId}:${RelationType.Implements}:${targetId}`
        if (!seen.has(key)) {
          seen.add(key)
          relations.push(
            createRelation({
              source: info.symbolId,
              target: targetId,
              type: RelationType.Implements,
              metadata:
                importedId === targetId && info.implementsRanges[precedence] !== undefined
                  ? createImportedHierarchyMetadata({
                      clauseRange: info.implementsRanges[precedence],
                      precedence,
                      requestedName: contractName,
                      resolvedTargetSymbolId: targetId,
                    })
                  : { precedence },
            }),
          )
        }

        if (localTarget) {
          this.addPhpOverrideRelationsFromState(info, localTarget, relations, seen)
        }
      }

      for (const [precedence, traitName] of info.traitNames.entries()) {
        const { importedId, localTarget } = this.resolveWrittenType(
          traitName,
          analysis,
          context,
          infos,
          infoByName,
        )
        const targetId = importedId ?? localTarget?.symbolId
        if (!targetId) continue
        const key = `${info.symbolId}:${RelationType.UsesType}:${targetId}:trait`
        if (seen.has(key)) continue
        seen.add(key)
        relations.push(
          createRelation({
            source: info.symbolId,
            target: targetId,
            type: RelationType.UsesType,
            metadata:
              importedId === targetId && info.traitRanges[precedence] !== undefined
                ? {
                    ...createImportedHierarchyMetadata({
                      clauseRange: info.traitRanges[precedence],
                      precedence,
                      requestedName: traitName,
                      resolvedTargetSymbolId: targetId,
                    }),
                    hierarchyKind: 'trait',
                  }
                : { precedence, hierarchyKind: 'trait' },
          }),
        )
      }
    }

    return relations
  }

  /**
   * Resolves a hierarchy name exactly as written in the source.
   * Unqualified names use imports and same-file types. Qualified names resolve through the
   * namespace-qualified symbol map only, so `Other\\Base` never matches an unrelated `Base`.
   * @param written - Type name spelling from the extends/implements/use clause.
   * @param analysis - Analyzed file carrying its namespace and `use` imports.
   * @param context - Relation build context holding resolved imports and the session.
   * @param infos - Same-file type declarations.
   * @param infoByName - Same-file type declarations keyed by simple name.
   * @returns The imported target id and same-file target, when proven.
   */
  private resolveWrittenType(
    written: string,
    analysis: FileAnalysis,
    context: RelationBuildContext,
    infos: readonly SerializedPhpTypeInfo[],
    infoByName: ReadonlyMap<string, SerializedPhpTypeInfo>,
  ): { importedId: string | undefined; localTarget: SerializedPhpTypeInfo | undefined } {
    if (!written.includes('\\')) {
      return {
        importedId: context.resolvedImports.importMap.get(written),
        localTarget: infoByName.get(written),
      }
    }
    let qualified: string
    if (written.startsWith('\\')) {
      qualified = written.slice(1)
    } else {
      const [first = '', ...rest] = written.split('\\')
      const alias = analysis.imports.find((declaration) => declaration.localName === first)
      qualified =
        alias !== undefined
          ? [alias.specifier, ...rest].join('\\')
          : analysis.namespace !== undefined && analysis.namespace.length > 0
            ? `${analysis.namespace}\\${written}`
            : written
    }
    const importedId = context.session.findSymbolByQualifiedName(qualified)
    return {
      importedId,
      localTarget:
        importedId === undefined ? undefined : infos.find((info) => info.symbolId === importedId),
    }
  }

  /**
   * Adds PHP override relations from parser state.
   * @param source - Source type info.
   * @param target - Target type info.
   * @param relations - Relations array to accumulate.
   * @param seen - Seen relations set.
   */
  private addPhpOverrideRelationsFromState(
    source: SerializedPhpTypeInfo,
    target: SerializedPhpTypeInfo,
    relations: Relation[],
    seen: Set<string>,
  ): void {
    for (const [methodName, methodId] of Object.entries(source.methodsByName)) {
      const targetMethodId = target.methodsByName[methodName]
      if (!targetMethodId) continue
      const key = `${methodId}:${RelationType.Overrides}:${targetMethodId}`
      if (seen.has(key)) continue
      seen.add(key)
      relations.push(
        createRelation({
          source: methodId,
          target: targetMethodId,
          type: RelationType.Overrides,
        }),
      )
    }
  }

  /**
   * Finds the namespace declared in the given AST node.
   * @param node - The AST node to search.
   * @returns The namespace string if found, otherwise undefined.
   */
  private findNamespace(node: SgNode): string | undefined {
    for (const child of node.children()) {
      const kind = nodeKind(child)
      if (kind === 'namespace_definition') {
        for (const part of child.children()) {
          if (nodeKind(part) === 'namespace_name') {
            return part.text()
          }
        }
      } else if (kind === 'program') {
        const result = this.findNamespace(child)
        if (result) return result
      }
    }
    return undefined
  }

  /**
   * Collects PHP type information including class, interface, and trait structures via AST traversal.
   * @param root - The root AST node.
   * @param filePath - The path of the file being analyzed.
   * @param symbols - Existing symbol nodes to reference.
   * @returns An array of PHP type information structures.
   */
  private collectPhpTypeInfo(root: SgNode, filePath: string, symbols: SymbolNode[]): PhpTypeInfo[] {
    const infos: PhpTypeInfo[] = []

    const walk = (node: SgNode): void => {
      const k = nodeKind(node)
      if (
        k === 'class_declaration' ||
        k === 'interface_declaration' ||
        k === 'enum_declaration' ||
        k === 'trait_declaration'
      ) {
        const nameNode = node.field('name')
        const name = nameNode?.text()
        if (name) {
          const kind =
            k === 'class_declaration'
              ? SymbolKind.Class
              : k === 'interface_declaration'
                ? SymbolKind.Interface
                : k === 'enum_declaration'
                  ? SymbolKind.Enum
                  : SymbolKind.Type
          const line = node.range().start.line + 1
          const ownerSymbol = symbols.find(
            (symbol) =>
              symbol.filePath === filePath &&
              symbol.kind === kind &&
              symbol.name === name &&
              symbol.line === line,
          )

          if (ownerSymbol) {
            const extendsNames: string[] = []
            const implementsNames: string[] = []
            const traitNames: string[] = []
            const extendsRanges: SourceRange[] = []
            const implementsRanges: SourceRange[] = []
            const traitRanges: SourceRange[] = []

            for (const child of node.children()) {
              const ck = nodeKind(child)
              if (ck === 'base_clause') {
                const walkBase = (bn: SgNode): void => {
                  const bk = nodeKind(bn)
                  if (bk === 'name' || bk === 'qualified_name') {
                    const written = bn.text().trim()
                    if (written.length > 0) {
                      extendsNames.push(written)
                      extendsRanges.push(phpNodeRange(bn))
                    }
                    return
                  }
                  for (const bc of bn.children()) walkBase(bc)
                }
                walkBase(child)
              } else if (ck === 'class_interface_clause') {
                const walkInterface = (inNode: SgNode): void => {
                  const ik = nodeKind(inNode)
                  if (ik === 'name' || ik === 'qualified_name') {
                    const written = inNode.text().trim()
                    if (written.length > 0) {
                      implementsNames.push(written)
                      implementsRanges.push(phpNodeRange(inNode))
                    }
                    return
                  }
                  for (const ic of inNode.children()) walkInterface(ic)
                }
                walkInterface(child)
              } else if (ck === 'declaration_list') {
                for (const member of child.children()) {
                  if (nodeKind(member) === 'use_declaration') {
                    if (member.text().includes('{')) continue

                    for (const useChild of member.children()) {
                      const uk = nodeKind(useChild)
                      if (uk === 'name' || uk === 'qualified_name') {
                        const written = useChild.text().trim()
                        if (written.length > 0) {
                          traitNames.push(written)
                          traitRanges.push(phpNodeRange(useChild))
                        }
                      } else if (uk === 'use_list' || uk === 'use_clause') {
                        const walkUse = (un: SgNode): void => {
                          const ukind = nodeKind(un)
                          if (ukind === 'name' || ukind === 'qualified_name') {
                            const written = un.text().trim()
                            if (written.length > 0) {
                              traitNames.push(written)
                              traitRanges.push(phpNodeRange(un))
                            }
                            return
                          }
                          for (const uc of un.children()) walkUse(uc)
                        }
                        walkUse(useChild)
                      }
                    }
                  }
                }
              }
            }

            const methodsByName = new Map<string, string>()
            const memberSymbolIds: string[] = []
            const memberFormsById = new Map<string, MemberSemantics>()
            for (const symbol of symbols) {
              if (
                symbol.filePath !== filePath ||
                (symbol.kind !== SymbolKind.Method &&
                  symbol.kind !== SymbolKind.Variable &&
                  symbol.kind !== SymbolKind.Property)
              ) {
                continue
              }
              if (!containsSymbolRange(ownerSymbol, symbol)) continue
              memberSymbolIds.push(symbol.id)
              if (symbol.kind === SymbolKind.Method) {
                methodsByName.set(symbol.name, symbol.id)
                memberFormsById.set(symbol.id, phpMemberSemantics(symbol, node))
              } else if (symbol.kind === SymbolKind.Property) {
                memberFormsById.set(symbol.id, {
                  kind: MemberKind.Property,
                  dispatch: MemberDispatch.Instance,
                })
              }
            }

            infos.push({
              name,
              symbolId: ownerSymbol.id,
              kind,
              extendsNames,
              implementsNames,
              traitNames,
              extendsRanges,
              implementsRanges,
              traitRanges,
              methodsByName,
              memberSymbolIds,
              memberFormsById,
            })
          }
        }
      }

      for (const child of node.children()) {
        walk(child)
      }
    }

    walk(root)
    return infos
  }

  /**
   * Extracts binding facts from source code content and imports via AST traversal.
   * @param root - The root AST node.
   * @param filePath - The file path.
   * @param _content - The file content.
   * @param symbols - The extracted symbols.
   * @param imports - The resolved imports.
   * @returns An array of extracted binding facts.
   */
  private extractBindingFactsFromData(
    root: SgNode,
    filePath: string,
    _content: string,
    symbols: SymbolNode[],
    imports: ImportDeclaration[],
  ): BindingFact[] {
    const facts: BindingFact[] = []
    const seen = new Set<string>()

    const addFact = (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      line: number,
      column: number,
      endLine = line,
      endColumn = column,
      scopeId?: string,
      targetSymbolId?: string,
    ): void => {
      const location = { filePath, line, column, endLine, endColumn }
      const key = `${name}:${sourceKind}:${targetName ?? ''}:${scopeId ?? ''}:${location.line}:${location.column}`
      if (seen.has(key)) return
      seen.add(key)
      facts.push({
        name,
        filePath,
        scopeId:
          scopeId ??
          findContainingCallableSymbol(
            symbols,
            { line, column },
            {
              callableKinds: PHP_CALLABLE_KINDS,
            },
          )?.id ??
          filePath,
        sourceKind,
        location,
        targetName,
        targetSymbolId,
        targetFilePath: undefined,
        metadata: undefined,
      })
    }

    for (const declaration of imports) {
      if (!declaration.localName || declaration.localName.length === 0) continue
      addFact(declaration.localName, BindingSourceKind.ImportedType, declaration.originalName, 1, 0)
    }

    const walk = (node: SgNode): void => {
      const k = nodeKind(node)
      if (
        k === 'class_declaration' ||
        k === 'trait_declaration' ||
        k === 'interface_declaration' ||
        k === 'enum_declaration'
      ) {
        const typeName = node.field('name')?.text()
        const line = node.range().start.line + 1
        const typeSymbol = symbols.find(
          (symbol) =>
            symbol.filePath === filePath && symbol.name === typeName && symbol.line === line,
        )
        if (typeName !== undefined && typeSymbol !== undefined) {
          // The class name is visible file-wide; `self`/`static` name the class inside its body.
          addFact(
            typeName,
            BindingSourceKind.FileGlobal,
            typeName,
            line,
            node.range().start.column,
            line,
            node.range().start.column,
            filePath,
            typeSymbol.id,
          )
          for (const receiver of ['self', 'static']) {
            addFact(
              receiver,
              BindingSourceKind.Receiver,
              typeName,
              line,
              node.range().start.column,
              line,
              node.range().start.column,
              typeSymbol.id,
              typeSymbol.id,
            )
          }
          const baseClause = node.children().find((child) => nodeKind(child) === 'base_clause')
          const baseName = baseClause
            ?.children()
            .find((child) => ['name', 'qualified_name'].includes(nodeKind(child)))
            ?.text()
            .trim()
          if (baseName !== undefined && baseName.length > 0) {
            addFact(
              'parent',
              BindingSourceKind.Receiver,
              getPhpClassTail(baseName),
              line,
              node.range().start.column,
              line,
              node.range().start.column,
              typeSymbol.id,
            )
          }
        }
      } else if (k === 'simple_parameter') {
        const varNode =
          node.field('name') ?? node.children().find((c) => nodeKind(c) === 'variable_name')
        const typeNode =
          node.field('type') ??
          node.children().find((c) => {
            const ck = nodeKind(c)
            return (
              ck === 'named_type' ||
              ck === 'name' ||
              ck === 'qualified_name' ||
              ck === 'primitive_type'
            )
          })
        if (varNode && typeNode) {
          const varName = varNode.text().replace(/^\$/, '')
          const targetName = getPhpClassTail(typeNode.text().trim())
          if (varName && targetName && /^[A-Z]/.test(targetName)) {
            addFact(
              varName,
              BindingSourceKind.Parameter,
              targetName,
              node.range().start.line + 1,
              node.range().start.column,
            )
          }
        }
      } else if (k === 'function_definition' || k === 'method_declaration') {
        const retTypeNode =
          node.field('return_type') ?? node.children().find((c) => nodeKind(c) === 'return_type')
        if (retTypeNode) {
          const targetName = getPhpClassTail(retTypeNode.text().replace(/^:\s*/, '').trim())
          if (targetName && /^[A-Z]/.test(targetName)) {
            addFact(
              targetName,
              BindingSourceKind.ReturnType,
              targetName,
              retTypeNode.range().start.line + 1,
              retTypeNode.range().start.column,
            )
          }
        }
      } else if (k === 'property_declaration') {
        for (const child of node.children()) {
          if (nodeKind(child) !== 'property_element') continue
          const varName = child.field('name')?.text()
          if (varName === '$uses') {
            for (const peChild of child.children()) {
              if (nodeKind(peChild) === 'array_creation_expression') {
                const walkArray = (an: SgNode): void => {
                  const ak = nodeKind(an)
                  if (ak === 'string' || ak === 'encapsed_string') {
                    const targetName = an.text().replace(/^['"]|['"]$/g, '')
                    if (targetName) {
                      addFact(
                        targetName,
                        BindingSourceKind.FrameworkManaged,
                        targetName,
                        an.range().start.line + 1,
                        an.range().start.column,
                      )
                    }
                  }
                  for (const ac of an.children()) walkArray(ac)
                }
                walkArray(peChild)
              }
            }
          }
        }
      } else if (k === 'assignment_expression') {
        const left = node.field('left') ?? node.children()[0]
        const right = node.field('right') ?? node.children().at(-1)
        const localName = left?.text().replace(/^\$/, '')
        if (localName && right) {
          const findTargetName = (candidate: SgNode): string | undefined => {
            const candidateKind = nodeKind(candidate)
            if (candidateKind === 'object_creation_expression') {
              const classNode =
                candidate.field('class') ??
                candidate.children().find((child) => {
                  const childKind = nodeKind(child)
                  return childKind === 'name' || childKind === 'qualified_name'
                })
              return classNode ? getPhpClassTail(classNode.text().trim()) : undefined
            }
            if (candidateKind === 'member_access_expression') {
              const objectText = candidate.field('object')?.text()
              const memberName = candidate.field('name')?.text()
              if (objectText === '$this' && memberName) return memberName
            }
            if (candidateKind === 'class_constant_access_expression') {
              const text = candidate.text().trim()
              if (text.endsWith('::class')) return getPhpClassTail(text.slice(0, -7).trim())
            }
            for (const child of candidate.children()) {
              const targetName = findTargetName(child)
              if (targetName) return targetName
            }
            return undefined
          }
          const targetName = findTargetName(right)
          if (targetName) {
            addFact(
              localName,
              BindingSourceKind.ConstructorCall,
              targetName,
              node.range().start.line + 1,
              node.range().start.column,
            )
          }
        }
      } else if (k === 'member_call_expression') {
        const objectText = node.field('object')?.text()
        const methodName = node.field('name')?.text()
        const frameworkMethod =
          objectText === '$this' &&
          (methodName === 'loadModel' ||
            methodName === 'loadController' ||
            methodName === 'loadComponent')
        if (frameworkMethod) {
          const args = node.children().find((child) => nodeKind(child) === 'arguments')
          const firstArg = args?.children().find((child) => nodeKind(child) === 'argument')
          const literal = firstArg
            ?.children()
            .find((child) => nodeKind(child) === 'string' || nodeKind(child) === 'encapsed_string')
          const targetName = literal?.text().replace(/^['"]|['"]$/g, '')
          if (targetName) {
            addFact(
              getPhpClassTail(targetName),
              BindingSourceKind.FrameworkManaged,
              getPhpClassTail(targetName),
              node.range().start.line + 1,
              node.range().start.column,
            )
          }
        }
      }

      for (const child of node.children()) {
        walk(child)
      }
    }

    walk(root)
    return facts
  }

  /**
   * Extracts call facts from AST nodes using symbols for caller containment.
   * @param root - The root AST node.
   * @param filePath - The file path.
   * @param _content - The file content.
   * @param symbols - Existing symbol nodes to map callers.
   * @returns An array of extracted call facts.
   */
  private extractCallFactsFromData(
    root: SgNode,
    filePath: string,
    _content: string,
    symbols: SymbolNode[],
  ): CallFact[] {
    const facts: CallFact[] = []
    const seen = new Set<string>()

    const addFact = (
      form: CallForm,
      name: string,
      receiverName: string | undefined,
      line: number,
      column: number,
      endLine = line,
      endColumn = column,
    ): void => {
      const location = { filePath, line, column, endLine, endColumn }
      const key = `${form}:${receiverName ?? ''}:${name}:${location.line}:${location.column}`
      if (seen.has(key)) return
      const callerSymbol = findContainingCallableSymbol(
        symbols,
        { line: location.line, column: location.column },
        { callableKinds: PHP_CALLABLE_KINDS },
      )
      facts.push({
        filePath,
        scopeId: callerSymbol?.id ?? filePath,
        callerSymbolId: callerSymbol?.id,
        form,
        name,
        receiverName,
        targetName: name,
        arity: undefined,
        location,
        metadata: undefined,
      })
    }

    const walk = (node: SgNode): void => {
      const k = nodeKind(node)
      if (k === 'object_creation_expression') {
        const classChild =
          node.field('class') ??
          node.children().find((c) => {
            const ck = nodeKind(c)
            return ck === 'name' || ck === 'qualified_name'
          })
        const className = classChild ? getPhpClassTail(classChild.text().trim()) : undefined
        if (className) {
          addFact(
            CallForm.Constructor,
            className,
            undefined,
            node.range().start.line + 1,
            node.range().start.column,
          )
        }
      } else if (k === 'function_call_expression') {
        const callee = node.field('function')
        if (callee && ['name', 'qualified_name'].includes(nodeKind(callee))) {
          addFact(
            CallForm.Free,
            getPhpClassTail(callee.text().trim()),
            undefined,
            node.range().start.line + 1,
            node.range().start.column,
            node.range().end.line + 1,
            node.range().end.column,
          )
        }
      } else if (k === 'scoped_call_expression') {
        const scope = node.field('scope')
        const nameNode = node.field('name')
        if (scope && nameNode && nodeKind(nameNode) === 'name') {
          const scopeKind = nodeKind(scope)
          const receiverName =
            scopeKind === 'relative_scope'
              ? scope.text().trim()
              : scopeKind === 'name' || scopeKind === 'qualified_name'
                ? getPhpClassTail(scope.text().trim())
                : undefined
          if (receiverName) {
            addFact(
              CallForm.Static,
              nameNode.text(),
              receiverName,
              node.range().start.line + 1,
              node.range().start.column,
              node.range().end.line + 1,
              node.range().end.column,
            )
          }
        }
      } else if (k === 'member_call_expression') {
        const objNode = node.field('object')
        const nameNode = node.field('name')
        if (objNode && nameNode) {
          const methodName = nameNode.text()
          let receiverName: string | undefined
          if (nodeKind(objNode) === 'member_access_expression') {
            const innerObj = objNode.field('object')?.text()
            const innerProp = objNode.field('name')?.text()
            if (innerObj === '$this' && innerProp) {
              receiverName = innerProp
            }
          } else if (nodeKind(objNode) === 'variable_name') {
            receiverName = objNode.text().replace(/^\$/, '')
          }
          if (receiverName) {
            addFact(
              CallForm.Member,
              methodName,
              receiverName,
              node.range().start.line + 1,
              node.range().start.column,
              node.range().end.line + 1,
              node.range().end.column,
            )
          }
        }
      }

      for (const child of node.children()) {
        walk(child)
      }
    }

    walk(root)
    return facts
  }

  /**
   * Extracts namespace use clause.
   * @param node - AST node.
   * @param imports - Imports array.
   */
  private extractNamespaceUse(node: SgNode, imports: ImportDeclaration[]): void {
    for (const child of node.children()) {
      const kind = nodeKind(child)
      if (kind === 'namespace_use_declaration') {
        for (const clauseChild of child.children()) {
          if (nodeKind(clauseChild) !== 'namespace_use_clause') continue

          let qualifiedName: string | undefined
          let alias: string | undefined
          let seenAs = false
          for (const part of clauseChild.children()) {
            const partKind = nodeKind(part)
            if (partKind === 'qualified_name') {
              qualifiedName = part.text()
            } else if (!part.isNamed() && part.text() === 'as') {
              seenAs = true
            } else if (seenAs && partKind === 'name') {
              alias = part.text()
            } else if (partKind === 'namespace_aliasing_clause') {
              for (const aliasChild of part.children()) {
                if (nodeKind(aliasChild) === 'name') alias = aliasChild.text()
              }
            }
          }

          if (!qualifiedName) continue
          const segments = qualifiedName.split('\\')
          const originalName = segments[segments.length - 1] ?? qualifiedName
          imports.push({
            originalName,
            localName: alias ?? originalName,
            specifier: qualifiedName,
            isRelative: false,
            kind: ImportDeclarationKind.Named,
          })
        }
      } else if (kind === 'program') {
        this.extractNamespaceUse(child, imports)
      } else if (kind === 'namespace_definition') {
        for (const nsChild of child.children()) {
          if (nodeKind(nsChild) === 'compound_statement') {
            this.extractNamespaceUse(nsChild, imports)
          }
        }
      }
    }
  }

  /**
   * Extracts symbols from PHP AST node.
   * @param node - AST node.
   * @param filePath - File path.
   * @param addSymbol - Callback to register a symbol.
   */
  private extractSymbolsFromNode(
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
    const commentFor = (target: SgNode): string | undefined => extractComment(target)

    for (const child of node.children()) {
      switch (nodeKind(child)) {
        case 'function_definition': {
          const nameNode = child.field('name')
          const name = nameNode?.text()
          if (name) addSymbol(name, SymbolKind.Function, child, nameNode, commentFor(child))
          break
        }
        case 'class_declaration': {
          const nameNode = child.field('name')
          const name = nameNode?.text()
          if (name) addSymbol(name, SymbolKind.Class, child, nameNode, commentFor(child))
          this.walkClassBody(child, addSymbol)
          break
        }
        case 'interface_declaration': {
          const nameNode = child.field('name')
          const name = nameNode?.text()
          if (name) addSymbol(name, SymbolKind.Interface, child, nameNode, commentFor(child))
          this.walkClassBody(child, addSymbol)
          break
        }
        case 'enum_declaration': {
          const nameNode = child.field('name')
          const name = nameNode?.text()
          if (name) addSymbol(name, SymbolKind.Enum, child, nameNode, commentFor(child))
          this.walkClassBody(child, addSymbol)
          break
        }
        case 'trait_declaration': {
          const nameNode = child.field('name')
          const name = nameNode?.text()
          if (name) addSymbol(name, SymbolKind.Type, child, nameNode, commentFor(child))
          this.walkClassBody(child, addSymbol)
          break
        }
        case 'const_declaration': {
          for (const constChild of child.children()) {
            if (nodeKind(constChild) !== 'const_element') continue
            const nameNode = constChild.child(0)
            if (nameNode && nodeKind(nameNode) === 'name') {
              addSymbol(
                nameNode.text(),
                SymbolKind.Variable,
                constChild,
                nameNode,
                commentFor(child),
              )
            }
          }
          break
        }
        case 'namespace_definition': {
          for (const nsChild of child.children()) {
            if (nodeKind(nsChild) === 'compound_statement')
              this.extractSymbolsFromNode(nsChild, filePath, addSymbol)
          }
          break
        }
        default:
          break
      }
    }
  }

  /**
   * Walks the body of a class declaration node to extract its members.
   * @param classNode - The class declaration AST node.
   * @param addSymbol - Callback to register extracted symbols.
   */
  private walkClassBody(
    classNode: SgNode,
    addSymbol: (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      selectionNode: SgNode | null | undefined,
      comment: string | undefined,
    ) => void,
  ): void {
    const commentFor = (target: SgNode): string | undefined => extractComment(target)

    for (const child of classNode.children()) {
      if (nodeKind(child) !== 'declaration_list' && nodeKind(child) !== 'enum_declaration_list')
        continue
      for (const member of child.children()) {
        const memberKind = nodeKind(member)
        if (memberKind === 'method_declaration') {
          const nameNode = member.field('name')
          const name = nameNode?.text()
          if (name) addSymbol(name, SymbolKind.Method, member, nameNode, commentFor(member))
        } else if (memberKind === 'property_declaration') {
          for (const propChild of member.children()) {
            if (nodeKind(propChild) !== 'property_element') continue
            const varName = propChild.field('name')
            if (!varName) continue
            const name = varName.text().replace(/^\$/, '')
            if (name) addSymbol(name, SymbolKind.Property, member, varName, commentFor(member))
          }
        } else if (memberKind === 'const_declaration') {
          for (const constChild of member.children()) {
            if (nodeKind(constChild) !== 'const_element') continue
            const nameNode = constChild.child(0)
            if (nameNode && nodeKind(nameNode) === 'name') {
              addSymbol(
                nameNode.text(),
                SymbolKind.Property,
                constChild,
                nameNode,
                commentFor(member),
              )
            }
          }
        } else if (memberKind === 'enum_case') {
          const nameNode =
            member.field('name') ?? member.children().find((c) => nodeKind(c) === 'name')
          const name = nameNode?.text()
          if (name) {
            addSymbol(name, SymbolKind.Property, member, nameNode, commentFor(member))
          }
        }
      }
    }
  }

  /**
   * Builds qualified name.
   * @param namespace - Namespace string.
   * @param symbolName - Symbol name string.
   * @returns Qualified name.
   */
  buildQualifiedName(namespace: string, symbolName: string): string {
    return `${namespace}\\${symbolName}`
  }

  /**
   * Declares the resolution manifests this adapter reads.
   * @returns Exact basenames used for package identity and PSR-4 resolution.
   */
  resolutionManifests(): readonly string[] {
    return ['composer.json']
  }

  /**
   * Retrieves the package identity from composer.json.
   * @param codeRoot - Workspace root path.
   * @param repoRoot - Repo root path.
   * @returns Package name, or undefined.
   */
  getPackageIdentity(codeRoot: string, repoRoot?: string): string | undefined {
    return findManifestField(
      codeRoot,
      'composer.json',
      (content) => {
        const pkg = JSON.parse(content) as { name?: string }
        return pkg.name
      },
      repoRoot,
    )
  }

  /**
   * Prepares immutable Composer resolution metadata before Pass 2 begins.
   * @param context - Adapter analysis context owning the run-scoped session.
   */
  private prepareResolutionMetadata(context: AdapterAnalyzeContext): void {
    const codeRoot = context.codeRoot
    if (codeRoot === undefined) return
    const key = 'php-resolution-metadata'
    const existing = context.session.getAdapterState<PhpResolutionSessionState>(key)
    if (existing?.psr4ByCodeRoot.has(codeRoot)) return
    const psr4ByCodeRoot = new Map(existing?.psr4ByCodeRoot ?? [])
    psr4ByCodeRoot.set(codeRoot, this.buildPsr4Map(codeRoot, context.repoRoot))
    context.session.setAdapterState<PhpResolutionSessionState>(key, {
      kind: 'php-resolution-metadata',
      psr4ByCodeRoot,
    })
  }

  /**
   * Builds PSR-4 namespace mapping from composer.json if present.
   * @param codeRoot - Workspace root path.
   * @param repoRoot - Repo root path.
   * @returns PSR-4 mapping entries.
   */
  private buildPsr4Map(codeRoot: string, repoRoot?: string): Array<[string, string]> {
    const serialized = findManifestField(
      codeRoot,
      'composer.json',
      (content) => {
        const pkg = JSON.parse(content) as {
          autoload?: { 'psr-4'?: Record<string, string | string[]> }
          'autoload-dev'?: { 'psr-4'?: Record<string, string | string[]> }
        }
        // A prefix may map to one directory or to an array of directories.
        const merged = { ...pkg.autoload?.['psr-4'], ...pkg['autoload-dev']?.['psr-4'] }
        return Object.keys(merged).length > 0 ? JSON.stringify(merged) : undefined
      },
      repoRoot,
    )
    if (!serialized) {
      return []
    }
    const entries = JSON.parse(serialized) as Record<string, string | string[]>
    const map: Array<[string, string]> = Object.entries(entries).flatMap(([prefix, relDirs]) =>
      (Array.isArray(relDirs) ? relDirs : [relDirs])
        .filter((relDir): relDir is string => typeof relDir === 'string')
        .map((relDir): [string, string] => [prefix, path.resolve(codeRoot, relDir)]),
    )
    map.sort((a, b) => b[0].length - a[0].length)
    return map
  }

  /**
   * Resolves one qualified name only from session-prepared PSR-4 entries.
   * @param qualifiedName - PHP qualified name.
   * @param codeRoot - Workspace root whose metadata was prepared.
   * @param session - Current indexing session.
   * @returns Resolved target path, or undefined.
   */
  private resolveQualifiedNameFromSession(
    qualifiedName: string,
    codeRoot: string,
    session: IndexSession,
  ): string | undefined {
    const metadata = session.getAdapterState<PhpResolutionSessionState>('php-resolution-metadata')
    const map = metadata?.psr4ByCodeRoot.get(codeRoot)
    if (map === undefined) return undefined
    const candidates = this.resolveQualifiedNameCandidates(qualifiedName, map)
    // With several directories for one prefix, only an indexed file proves the target.
    return candidates.length <= 1
      ? candidates[0]
      : candidates.find((candidate) => session.getFileId(candidate) !== undefined)
  }

  /**
   * Resolves one qualified name from already-normalized PSR-4 entries.
   * @param qualifiedName - PHP qualified name.
   * @param map - Normalized prefix-to-directory entries.
   * @returns Resolved target path, or undefined.
   */
  private resolveQualifiedNameWithMap(
    qualifiedName: string,
    map: readonly (readonly [string, string])[],
  ): string | undefined {
    return this.resolveQualifiedNameCandidates(qualifiedName, map)[0]
  }

  /**
   * Lists every PSR-4 file candidate for a qualified name, longest prefix first.
   * @param qualifiedName - PHP qualified name.
   * @param map - Normalized prefix-to-directory entries.
   * @returns Candidate target paths in deterministic order.
   */
  private resolveQualifiedNameCandidates(
    qualifiedName: string,
    map: readonly (readonly [string, string])[],
  ): string[] {
    const candidates: string[] = []
    for (const [prefix, dir] of map) {
      if (qualifiedName.startsWith(prefix)) {
        const relative = qualifiedName.slice(prefix.length).replace(/\\/g, path.sep)
        candidates.push(path.join(dir, relative + '.php'))
      }
    }
    return candidates
  }

  /**
   * Resolves a qualified name to a file path.
   * @param qualifiedName - PHP qualified name.
   * @param codeRoot - Workspace root path.
   * @param repoRoot - Repo root path.
   * @returns Resolved file path, or undefined.
   */
  resolveQualifiedNameToPath(
    qualifiedName: string,
    codeRoot: string,
    repoRoot?: string,
  ): string | undefined {
    return this.resolveQualifiedNameWithMap(qualifiedName, this.buildPsr4Map(codeRoot, repoRoot))
  }

  /**
   * Extracts require relations from content.
   * @param filePath - File path.
   * @param content - PHP content.
   * @returns Array of relations.
   */
  /**
   * Extracts require relations from AST nodes.
   * @param root - The root AST node.
   * @param filePath - File path.
   * @returns Array of relations.
   */
  private extractRequireRelations(root: SgNode, filePath: string): Relation[] {
    const relations: Relation[] = []
    const seen = new Set<string>()

    const walk = (node: SgNode): void => {
      const k = nodeKind(node)
      if (
        k === 'require_expression' ||
        k === 'require_once_expression' ||
        k === 'include_expression' ||
        k === 'include_once_expression'
      ) {
        for (const child of node.children()) {
          const ck = nodeKind(child)
          if (ck === 'string' || ck === 'encapsed_string') {
            const value = child.text().replace(/^['"]|['"]$/g, '')
            if (value && !value.includes('$') && !value.includes("' .") && !value.includes('" .')) {
              const target = resolveFromFilePath(filePath, value)
              const key = `${filePath}->${target}`
              if (!seen.has(key)) {
                seen.add(key)
                relations.push(
                  createRelation({
                    source: filePath,
                    target,
                    type: RelationType.Imports,
                  }),
                )
              }
            }
          }
        }
      }

      for (const child of node.children()) {
        walk(child)
      }
    }

    walk(root)
    return relations
  }

  /**
   * Collects raw dynamic loader facts from AST nodes.
   * @param root - The root AST node.
   * @param filePath - File path.
   * @returns Array of dynamic loader facts.
   */
  private collectRawDynamicLoaders(root: SgNode, filePath: string): DynamicLoaderFact[] {
    const facts: DynamicLoaderFact[] = []
    const seen = new Set<string>()

    const addFact = (
      via: string,
      value: string,
      candidates: string[],
      aliasNames: string[],
      scope: 'file' | 'class' | 'method',
    ): void => {
      const key = `${via}:${scope}:${value}:${candidates.join(',')}`
      if (seen.has(key)) return
      seen.add(key)
      facts.push({ via, value, candidates, aliasNames, scope })
    }

    const getArgNode = (callNode: SgNode, index: number): SgNode | undefined => {
      const argsNode = callNode.children().find((c) => nodeKind(c) === 'arguments')
      if (!argsNode) return undefined
      const args = argsNode.children().filter((c) => nodeKind(c) === 'argument')
      return args[index]
    }

    const extractStringLiteral = (argNode: SgNode | undefined): string | undefined => {
      if (!argNode) return undefined
      for (const child of argNode.children()) {
        const k = nodeKind(child)
        if (k === 'string' || k === 'encapsed_string') {
          return child.text().replace(/^['"]|['"]$/g, '')
        }
      }
      const text = argNode.text().trim()
      if (
        (text.startsWith("'") && text.endsWith("'")) ||
        (text.startsWith('"') && text.endsWith('"'))
      ) {
        return text.slice(1, -1)
      }
      return undefined
    }

    const extractClassLiteral = (argNode: SgNode | undefined): string | undefined => {
      if (!argNode) return undefined
      for (const child of argNode.children()) {
        const k = nodeKind(child)
        if (k === 'class_constant_access_expression') {
          const text = child.text().trim()
          if (text.endsWith('::class')) {
            return text.slice(0, -7).trim()
          }
        }
      }
      const text = argNode.text().trim()
      if (text.endsWith('::class')) {
        return text.slice(0, -7).trim()
      }
      return undefined
    }

    const extractStringOrClassLiteral = (argNode: SgNode | undefined): string | undefined => {
      return extractStringLiteral(argNode) ?? extractClassLiteral(argNode)
    }

    const walk = (node: SgNode): void => {
      const k = nodeKind(node)
      if (k === 'property_declaration') {
        for (const child of node.children()) {
          if (nodeKind(child) !== 'property_element') continue
          const varName = child.field('name')?.text()
          if (varName === '$uses') {
            for (const peChild of child.children()) {
              if (nodeKind(peChild) === 'array_creation_expression') {
                const walkArray = (an: SgNode): void => {
                  const ak = nodeKind(an)
                  if (ak === 'string' || ak === 'encapsed_string') {
                    const value = an.text().replace(/^['"]|['"]$/g, '')
                    if (value) {
                      addFact(
                        'usesProperty',
                        value,
                        getCakeTargetCandidates(filePath, value, 'model'),
                        buildAliasNames(value),
                        'class',
                      )
                    }
                  }
                  for (const ac of an.children()) walkArray(ac)
                }
                walkArray(peChild)
              }
            }
          }
        }
      } else if (k === 'member_call_expression') {
        const objNode = node.field('object')
        const nameNode = node.field('name')
        const methodName = nameNode?.text()
        const objText = objNode?.text()

        if (objText === '$this') {
          if (methodName === 'loadModel') {
            const val = extractStringLiteral(getArgNode(node, 0))
            if (val) {
              addFact(
                'loadModel',
                val,
                getCakeTargetCandidates(filePath, val, 'model'),
                buildAliasNames(val),
                'method',
              )
            }
          } else if (methodName === 'loadController') {
            const val = extractStringLiteral(getArgNode(node, 0))
            if (val) {
              addFact(
                'loadController',
                val,
                getCakeTargetCandidates(filePath, val, 'controller'),
                buildAliasNames(val),
                'method',
              )
            }
          } else if (methodName === 'loadComponent') {
            const val = extractStringLiteral(getArgNode(node, 0))
            if (val) {
              addFact(
                'loadComponent',
                val,
                getCakeTargetCandidates(filePath, val, 'component'),
                buildAliasNames(val),
                'method',
              )
            }
          } else if (methodName === 'get') {
            const val = extractClassLiteral(getArgNode(node, 0))
            if (val) {
              addFact(
                '$this->get',
                val,
                getFrameworkClassLiteralTargetCandidates(filePath, val),
                buildAliasNames(val),
                'method',
              )
            }
          }
        } else if (objText === '$this->load') {
          if (methodName === 'model') {
            const val = extractStringLiteral(getArgNode(node, 0))
            if (val) {
              addFact(
                'load.model',
                val,
                getCodeIgniterTargetCandidates(filePath, val, 'model'),
                buildAliasNames(val),
                'method',
              )
            }
          } else if (methodName === 'library') {
            const val = extractStringLiteral(getArgNode(node, 0))
            if (val) {
              addFact(
                'load.library',
                val,
                getCodeIgniterTargetCandidates(filePath, val, 'library'),
                buildAliasNames(val),
                'method',
              )
            }
          } else if (methodName === 'helper') {
            const val = extractStringLiteral(getArgNode(node, 0))
            if (val) {
              addFact(
                'load.helper',
                val,
                getCodeIgniterTargetCandidates(filePath, val, 'helper'),
                [],
                'method',
              )
            }
          }
        }
      } else if (k === 'scoped_call_expression') {
        const scopeNode = node.field('scope')
        const nameNode = node.field('name')
        const scope = scopeNode?.text()?.replace(/^\\/, '')
        const name = nameNode?.text()

        if (scope === 'App') {
          if (name === 'uses') {
            const value = extractStringLiteral(getArgNode(node, 0))
            const packageName = extractStringLiteral(getArgNode(node, 1))
            const kind = value && packageName ? getCakePackageKind(packageName) : undefined
            if (value && kind) {
              addFact(
                'App::uses',
                value,
                getCakeTargetCandidates(filePath, value, kind),
                buildAliasNames(value),
                'file',
              )
            } else if (value) {
              addFact('App::uses', value, [], buildAliasNames(value), 'file')
            }
          } else if (name === 'import') {
            const typeName = extractStringLiteral(getArgNode(node, 0))
            const value = extractStringLiteral(getArgNode(node, 1))
            if (typeName && value) {
              const normalized = typeName.toLowerCase()
              const candidates =
                normalized === 'model'
                  ? getCakeTargetCandidates(filePath, value, 'model')
                  : normalized === 'controller'
                    ? getCakeTargetCandidates(filePath, value, 'controller')
                    : normalized === 'component'
                      ? getCakeTargetCandidates(filePath, value, 'component')
                      : []
              addFact('App::import', value, candidates, buildAliasNames(value), 'file')
            }
          }
        } else if (scope === 'ClassRegistry') {
          if (name === 'init') {
            const value = extractStringLiteral(getArgNode(node, 0))
            if (value) {
              addFact(
                'ClassRegistry::init',
                value,
                getCakeTargetCandidates(filePath, value, 'model'),
                buildAliasNames(value),
                'method',
              )
            }
          }
        } else if (scope === 'Yii') {
          if (name === 'import') {
            const value = extractStringLiteral(getArgNode(node, 0))
            if (value) {
              addFact(
                'Yii::import',
                value,
                getYiiImportTargetCandidates(filePath, value),
                buildAliasNames(value),
                'method',
              )
            }
          } else if (name === 'createObject') {
            const value = extractStringOrClassLiteral(getArgNode(node, 0))
            if (value) {
              addFact(
                'Yii::createObject',
                value,
                getFrameworkClassLiteralTargetCandidates(filePath, value),
                buildAliasNames(value),
                'method',
              )
            }
          }
        } else if (scope === 'Zend_Loader') {
          if (name === 'loadClass') {
            const value = extractStringLiteral(getArgNode(node, 0))
            if (value) {
              addFact(
                'Zend_Loader::loadClass',
                value,
                getFrameworkClassLiteralTargetCandidates(filePath, value),
                buildAliasNames(value),
                'method',
              )
            }
          }
        } else if (scope === 'Drupal') {
          if (name === 'service') {
            const value = extractStringLiteral(getArgNode(node, 0))
            if (value) {
              addFact('Drupal::service', value, [], [], 'method')
            }
          }
        }
      } else if (k === 'function_call_expression') {
        const funcNode = node.field('function')
        const funcName = funcNode?.text()

        if (funcName === 'app') {
          const value = extractClassLiteral(getArgNode(node, 0))
          if (value) {
            addFact(
              'app',
              value,
              getFrameworkClassLiteralTargetCandidates(filePath, value),
              buildAliasNames(value),
              'method',
            )
          }
        } else if (funcName === 'resolve') {
          const value = extractClassLiteral(getArgNode(node, 0))
          if (value) {
            addFact(
              'resolve',
              value,
              getFrameworkClassLiteralTargetCandidates(filePath, value),
              buildAliasNames(value),
              'method',
            )
          }
        } else if (funcName === 'uses') {
          const value = extractStringLiteral(getArgNode(node, 0))
          if (value) {
            addFact(
              'uses',
              value,
              getCakeTargetCandidates(filePath, value, 'model'),
              buildAliasNames(value),
              'file',
            )
          }
        } else if (funcName === 'loadModel') {
          const value = extractStringLiteral(getArgNode(node, 0))
          if (value) {
            addFact(
              'loadModel',
              value,
              getCakeTargetCandidates(filePath, value, 'model'),
              buildAliasNames(value),
              'method',
            )
          }
        } else if (funcName === 'loadController') {
          const value = extractStringLiteral(getArgNode(node, 0))
          if (value) {
            addFact(
              'loadController',
              value,
              getCakeTargetCandidates(filePath, value, 'controller'),
              buildAliasNames(value),
              'method',
            )
          }
        } else if (funcName === 'loadComponent') {
          const value = extractStringLiteral(getArgNode(node, 0))
          if (value) {
            addFact(
              'loadComponent',
              value,
              getCakeTargetCandidates(filePath, value, 'component'),
              buildAliasNames(value),
              'method',
            )
          }
        }
      }

      for (const child of node.children()) {
        walk(child)
      }
    }

    walk(root)
    return facts
  }

  /**
   * Extracts dynamic loader relations.
   * @param filePath - File path.
   * @param bindings - Dynamic loader bindings.
   * @returns Array of relations.
   */
  private extractDynamicLoaderRelations(filePath: string, bindings: LoaderBinding[]): Relation[] {
    const relations: Relation[] = []
    const seen = new Set<string>()
    for (const binding of bindings) {
      if (!binding.targetPath) continue
      const key = `${filePath}->${binding.targetPath}`
      if (seen.has(key)) continue
      seen.add(key)
      relations.push(
        createRelation({
          source: filePath,
          target: binding.targetPath,
          type: RelationType.Imports,
        }),
      )
    }
    return relations
  }

  /**
   * Resolves relative import path.
   * @param fromFile - Importing file path.
   * @param specifier - Relative specifier.
   * @returns Candidates array or string path.
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

    return wsPrefix + segments.join('/')
  }
}
