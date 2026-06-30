import path from 'node:path'
import { parse } from '@ast-grep/napi'
import { type SgNode } from '@ast-grep/napi'
import {
  type LanguageAdapter,
  type AdapterAnalyzeContext,
  type ImportResolutionContext,
  type ResolvedImports,
  type RelationBuildContext,
} from '../../domain/value-objects/language-adapter.js'
import { type SymbolNode, createSymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type Relation, createRelation } from '../../domain/value-objects/relation.js'
import { SymbolKind } from '../../domain/value-objects/symbol-kind.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
import { findManifestField } from './find-manifest-field.js'
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
  readonly kind: 'class' | 'interface' | 'type'
  readonly extendsNames: readonly string[]
  readonly implementsNames: readonly string[]
  readonly methodsByName: Record<string, string>
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
 * Finds the innermost PHP symbol starting before a source line.
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
 * Splits a workspace-prefixed file path into prefix and relative/absolute path.
 * @param filePath - The file path to split.
 * @returns Prefix and normalized path portion.
 */
function splitWorkspacePath(filePath: string): { prefix: string; path: string } {
  const colonIdx = filePath.indexOf(':')
  if (colonIdx > 0 && !filePath.startsWith('/')) {
    return { prefix: filePath.slice(0, colonIdx + 1), path: filePath.slice(colonIdx + 1) }
  }
  return { prefix: '', path: filePath }
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
 * Resolver that detects framework-specific dynamic loader patterns.
 */
interface LoaderResolver {
  readonly id: string
  scan(
    filePath: string,
    content: string,
    symbols: SymbolNode[],
    filePaths?: Set<string>,
  ): LoaderBinding[]
}

/**
 * Represents a local PHP class-like declaration and the methods it owns.
 */
interface PhpTypeInfo {
  readonly name: string
  readonly symbolId: string
  readonly kind: 'class' | 'interface' | 'type'
  readonly extendsNames: readonly string[]
  readonly implementsNames: readonly string[]
  readonly methodsByName: ReadonlyMap<string, string>
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
 * Escapes a string so it can be embedded safely inside a RegExp source.
 * @param value - Raw string value.
 * @returns The escaped string.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Returns whether a loader binding is declared within a given lexical scope.
 * @param scopeText - The function or method body text.
 * @param binding - Loader binding candidate.
 * @returns True when the scope contains the binding declaration.
 */
function bindingAppearsInScope(scopeText: string, binding: LoaderBinding): boolean {
  if (binding.scope !== 'method') return true
  const quotedValue = `['"]${escapeRegExp(binding.value)}['"]`
  switch (binding.via) {
    case 'loadModel':
      return new RegExp(`(?:\\$this->)?loadModel\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    case 'loadController':
      return new RegExp(`(?:\\$this->)?loadController\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    case 'loadComponent':
      return new RegExp(`(?:\\$this->)?loadComponent\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    case 'App::import':
      return new RegExp(`App::import\\([^\\n]*${quotedValue}`).test(scopeText)
    case 'ClassRegistry::init':
      return new RegExp(`ClassRegistry::init\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    case 'load.model':
      return new RegExp(`\\$this->load->model\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    case 'load.library':
      return new RegExp(`\\$this->load->library\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    case 'Yii::createObject':
      return new RegExp(
        `Yii::createObject\\(\\s*(?:${quotedValue}|${escapeRegExp(binding.value)}::class)\\s*\\)`,
      ).test(scopeText)
    case 'Zend_Loader::loadClass':
      return new RegExp(`Zend_Loader::loadClass\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    case 'app':
      return new RegExp(
        `\\bapp\\(\\s*(?:${quotedValue}|${escapeRegExp(binding.value)}::class)\\s*\\)`,
      ).test(scopeText)
    case 'resolve':
      return new RegExp(
        `\\bresolve\\(\\s*(?:${quotedValue}|${escapeRegExp(binding.value)}::class)\\s*\\)`,
      ).test(scopeText)
    case '$this->get':
      return new RegExp(
        `\\$this->get\\(\\s*(?:${quotedValue}|${escapeRegExp(binding.value)}::class)\\s*\\)`,
      ).test(scopeText)
    case 'uses':
      return new RegExp(`\\buses\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    default:
      return false
  }
}

/**
 * Picks the first candidate path that already appears in the indexed symbol pool.
 * Falls back to the first candidate when no match is found.
 * @param candidates - Candidate file paths.
 * @param symbols - Symbol pool available during extraction.
 * @param filePaths - Set of available file paths.
 * @returns Selected target path, or undefined when no candidates exist.
 */
function selectCandidatePath(
  candidates: string[],
  symbols: SymbolNode[],
  filePaths?: Set<string>,
): string | undefined {
  if (candidates.length === 0) return undefined
  if (filePaths) {
    return candidates.find((candidate) => filePaths.has(candidate)) ?? candidates[0]
  }
  const indexedFiles = new Set(symbols.map((symbol) => symbol.filePath))
  return candidates.find((candidate) => indexedFiles.has(candidate)) ?? candidates[0]
}

/**
 * Resolves CakePHP model/controller/component paths from a source file.
 * @param filePath - The importing file path.
 * @param value - The logical dependency name.
 * @param kind - The Cake target kind.
 * @param symbols - Indexed symbol pool.
 * @param filePaths - Set of available file paths.
 * @returns The resolved target path, or undefined.
 */
function resolveCakeTarget(
  filePath: string,
  value: string,
  kind: 'model' | 'controller' | 'component',
  symbols: SymbolNode[],
  filePaths?: Set<string>,
): string | undefined {
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

  const candidates = relCandidates.map((candidate) =>
    prefix
      ? `${prefix}${candidate}`
      : path.isAbsolute(rawPath)
        ? path.resolve(path.dirname(rawPath), '..', candidate)
        : candidate,
  )
  return selectCandidatePath(candidates, symbols, filePaths)
}

/**
 * Resolves CodeIgniter-style target files.
 * @param filePath - The importing file path.
 * @param value - The logical dependency name.
 * @param kind - CodeIgniter target kind.
 * @param symbols - Indexed symbol pool.
 * @param filePaths - Set of available file paths.
 * @returns The resolved target path, or undefined.
 */
function resolveCodeIgniterTarget(
  filePath: string,
  value: string,
  kind: 'model' | 'library' | 'helper',
  symbols: SymbolNode[],
  filePaths?: Set<string>,
): string | undefined {
  const { prefix, path: rawPath } = splitWorkspacePath(filePath)
  const root = rawPath.startsWith('application/') ? 'application' : 'app'
  const stem = toPhpFileStem(value)
  const relCandidates =
    kind === 'model'
      ? [`${root}/models/${stem}.php`]
      : kind === 'library'
        ? [`${root}/libraries/${stem}.php`]
        : [`${root}/helpers/${stem}_helper.php`, `${root}/helpers/${stem}.php`]

  const candidates = relCandidates.map((candidate) =>
    prefix
      ? `${prefix}${candidate}`
      : path.isAbsolute(rawPath)
        ? path.resolve(path.dirname(rawPath), '..', candidate)
        : candidate,
  )
  return selectCandidatePath(candidates, symbols, filePaths)
}

/**
 * Resolves dotted Yii import paths.
 * @param filePath - The importing file path.
 * @param value - The dotted Yii alias.
 * @param symbols - Indexed symbol pool.
 * @param filePaths - Set of available file paths.
 * @returns The resolved target path, or undefined.
 */
function resolveYiiImportTarget(
  filePath: string,
  value: string,
  symbols: SymbolNode[],
  filePaths?: Set<string>,
): string | undefined {
  const { prefix } = splitWorkspacePath(filePath)
  const rel = value.startsWith('application.')
    ? `protected/${value.slice('application.'.length).replaceAll('.', '/')}.php`
    : value.replaceAll('.', '/') + '.php'
  const candidates = prefix ? [`${prefix}${rel}`] : [rel]
  return selectCandidatePath(candidates, symbols, filePaths)
}

/**
 * Resolves generic namespace/path-based loader values against common PHP locations.
 * @param filePath - The importing file path.
 * @param value - Loader value.
 * @param symbols - Indexed symbol pool.
 * @param filePaths - Set of available file paths.
 * @returns The resolved target path, or undefined.
 */
function resolveGenericPhpTarget(
  filePath: string,
  value: string,
  symbols: SymbolNode[],
  filePaths?: Set<string>,
): string | undefined {
  const { prefix } = splitWorkspacePath(filePath)
  const namespaced = value.replaceAll('\\', '/')
  const relCandidates = [`src/${namespaced}.php`, `app/${namespaced}.php`, `lib/${namespaced}.php`]
  const candidates = relCandidates.map((candidate) =>
    prefix ? `${prefix}${candidate}` : candidate,
  )
  return selectCandidatePath(candidates, symbols, filePaths)
}

/**
 * Resolves an explicit class literal or qualified class reference to a PHP file.
 * @param filePath - Source file path.
 * @param value - Explicit class reference or qualified class name.
 * @param symbols - Indexed symbol pool.
 * @param filePaths - Set of available file paths.
 * @returns The resolved target path, or undefined.
 */
function resolveFrameworkClassLiteralTarget(
  filePath: string,
  value: string,
  symbols: SymbolNode[],
  filePaths?: Set<string>,
): string | undefined {
  const normalized = value
    .replace(/^\\+/, '')
    .replace(/::class$/, '')
    .trim()
  if (!normalized || !/[A-Z_\\]/.test(normalized)) return undefined
  return resolveGenericPhpTarget(filePath, normalized, symbols, filePaths)
}

/**
 * Parses a literal PHP array body into string entries.
 * @param body - Array body text from `array(...)` or `[...]`.
 * @returns Literal string entries.
 */
function parseLiteralPhpArrayEntries(body: string): string[] {
  const entries: string[] = []
  const regex = /['"]([^'"]+)['"]/g
  for (const match of body.matchAll(regex)) {
    const value = match[1]?.trim()
    if (value) entries.push(value)
  }
  return entries
}

/**
 * Derives local aliases assigned from already-known aliases within the same scope.
 * @param scopeText - Method or function body text.
 * @param aliases - Mutable alias map.
 * @returns Nothing.
 */
function seedAssignedAliases(scopeText: string, aliases: Map<string, string>): void {
  for (const [alias, targetPath] of Array.from(aliases.entries())) {
    const escapedAlias = escapeRegExp(alias)
    const assignmentRegex = new RegExp(
      `(\\$[A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*${escapedAlias}\\b`,
      'g',
    )
    for (const match of scopeText.matchAll(assignmentRegex)) {
      if (match[1]) aliases.set(match[1], targetPath)
    }
  }
}

/**
 * Derives method-local aliases created from deterministic construction or acquisition flows.
 * @param scopeText - Method or function body text.
 * @param bindingsByValue - Map of normalized binding values to target paths.
 * @returns Newly discovered local aliases.
 */
function extractExplicitConstructedInstanceAliases(
  scopeText: string,
  bindingsByValue: ReadonlyMap<string, string>,
): Map<string, string> {
  const aliases = new Map<string, string>()
  const patterns = [
    /(\$[A-Za-z_][A-Za-z0-9_]*)\s*=\s*new\s+\\?([A-Za-z_][A-Za-z0-9_\\]*)\s*\(/g,
    /(\$[A-Za-z_][A-Za-z0-9_]*)\s*=\s*Yii::createObject\(\s*\\?([A-Za-z_][A-Za-z0-9_\\]*)::class\s*\)/g,
    /(\$[A-Za-z_][A-Za-z0-9_]*)\s*=\s*app\(\s*\\?([A-Za-z_][A-Za-z0-9_\\]*)::class\s*\)/g,
    /(\$[A-Za-z_][A-Za-z0-9_]*)\s*=\s*resolve\(\s*\\?([A-Za-z_][A-Za-z0-9_\\]*)::class\s*\)/g,
    /(\$[A-Za-z_][A-Za-z0-9_]*)\s*=\s*\$this->get\(\s*\\?([A-Za-z_][A-Za-z0-9_\\]*)::class\s*\)/g,
  ] as const

  for (const pattern of patterns) {
    for (const match of scopeText.matchAll(pattern)) {
      const alias = match[1]
      const value = match[2]
      if (!alias || !value) continue
      const normalized = getPhpClassTail(value)
      const targetPath = bindingsByValue.get(value) ?? bindingsByValue.get(normalized)
      if (targetPath) aliases.set(alias, targetPath)
    }
  }

  return aliases
}

/**
 * Creates a regex-driven loader resolver.
 * @param params - Resolver configuration.
 * @param params.id - Stable resolver id.
 * @param params.regex - Pattern that captures the interesting literal argument.
 * @param params.via - Metadata identifier for the matched loader.
 * @param params.resolveTarget - Target resolution function.
 * @param params.aliases - Alias derivation function.
 * @param params.valueIndex - Match group index for the captured value.
 * @param params.scope - Lexical scope where the binding applies.
 * @returns A loader resolver.
 */
function createRegexResolver(params: {
  id: string
  regex: RegExp
  via: string
  resolveTarget: (
    filePath: string,
    value: string,
    symbols: SymbolNode[],
    filePaths?: Set<string>,
  ) => string | undefined
  aliases?: (value: string) => string[]
  valueIndex?: number
  scope?: 'file' | 'class' | 'method'
}): LoaderResolver {
  const valueIndex = params.valueIndex ?? 2
  return {
    id: params.id,
    scan(
      filePath: string,
      content: string,
      symbols: SymbolNode[],
      filePaths?: Set<string>,
    ): LoaderBinding[] {
      const bindings: LoaderBinding[] = []
      for (const match of content.matchAll(params.regex)) {
        const value = match[valueIndex]
        if (!value) continue
        bindings.push({
          via: params.via,
          value,
          targetPath: params.resolveTarget(filePath, value, symbols, filePaths),
          aliasNames: (params.aliases ?? buildAliasNames)(value),
          scope: params.scope ?? 'method',
        })
      }
      return bindings
    },
  }
}

/**
 * Resolver registry for framework-specific dynamic loaders.
 */
export const LOADER_RESOLVERS: ReadonlyArray<LoaderResolver> = [
  {
    id: 'cake-load-model',
    scan(
      filePath: string,
      content: string,
      symbols: SymbolNode[],
      filePaths?: Set<string>,
    ): LoaderBinding[] {
      const bindings: LoaderBinding[] = []
      const regex =
        /\$this->loadModel\(\s*(['"])([^'"]+)\1\s*\)|\bloadModel\(\s*(['"])([^'"]+)\3\s*\)/g
      for (const match of content.matchAll(regex)) {
        const matchText = match[0] ?? ''
        const matchIndex = match.index ?? 0
        const prefix = content.slice(Math.max(0, matchIndex - 2), matchIndex)
        if (!matchText.startsWith('$this->') && (prefix === '->' || prefix === '::')) continue
        const value = match[2] ?? match[4]
        if (!value) continue
        bindings.push({
          via: 'loadModel',
          value,
          targetPath: resolveCakeTarget(filePath, value, 'model', symbols, filePaths),
          aliasNames: buildAliasNames(value),
          scope: 'method',
        })
      }
      return bindings
    },
  },
  {
    id: 'cake-load-controller',
    scan(
      filePath: string,
      content: string,
      symbols: SymbolNode[],
      filePaths?: Set<string>,
    ): LoaderBinding[] {
      const bindings: LoaderBinding[] = []
      const regex =
        /\$this->loadController\(\s*(['"])([^'"]+)\1\s*\)|\bloadController\(\s*(['"])([^'"]+)\3\s*\)/g
      for (const match of content.matchAll(regex)) {
        const matchText = match[0] ?? ''
        const matchIndex = match.index ?? 0
        const prefix = content.slice(Math.max(0, matchIndex - 2), matchIndex)
        if (!matchText.startsWith('$this->') && (prefix === '->' || prefix === '::')) continue
        const value = match[2] ?? match[4]
        if (!value) continue
        bindings.push({
          via: 'loadController',
          value,
          targetPath: resolveCakeTarget(filePath, value, 'controller', symbols, filePaths),
          aliasNames: buildAliasNames(value),
          scope: 'method',
        })
      }
      return bindings
    },
  },
  {
    id: 'cake-load-component',
    scan(
      filePath: string,
      content: string,
      symbols: SymbolNode[],
      filePaths?: Set<string>,
    ): LoaderBinding[] {
      const bindings: LoaderBinding[] = []
      const regex =
        /\$this->loadComponent\(\s*(['"])([^'"]+)\1\s*\)|\bloadComponent\(\s*(['"])([^'"]+)\3\s*\)/g
      for (const match of content.matchAll(regex)) {
        const matchText = match[0] ?? ''
        const matchIndex = match.index ?? 0
        const prefix = content.slice(Math.max(0, matchIndex - 2), matchIndex)
        if (!matchText.startsWith('$this->') && (prefix === '->' || prefix === '::')) continue
        const value = match[2] ?? match[4]
        if (!value) continue
        bindings.push({
          via: 'loadComponent',
          value,
          targetPath: resolveCakeTarget(filePath, value, 'component', symbols, filePaths),
          aliasNames: buildAliasNames(value),
          scope: 'method',
        })
      }
      return bindings
    },
  },
  createRegexResolver({
    id: 'cake-app-uses',
    regex: /\bApp::uses\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/g,
    via: 'App::uses',
    valueIndex: 2,
    resolveTarget: () => undefined,
    scope: 'file',
  }),
  {
    id: 'cake-global-uses',
    scan(
      filePath: string,
      content: string,
      symbols: SymbolNode[],
      filePaths?: Set<string>,
    ): LoaderBinding[] {
      const bindings: LoaderBinding[] = []
      const regex = /\buses\(\s*(['"])([^'"]+)\1\s*\)/g
      for (const match of content.matchAll(regex)) {
        const matchIndex = match.index ?? 0
        const prefix = content.slice(Math.max(0, matchIndex - 2), matchIndex)
        if (prefix === '->' || prefix === '::') continue
        const value = match[2]
        if (!value) continue
        bindings.push({
          via: 'uses',
          value,
          targetPath: resolveCakeTarget(filePath, value, 'model', symbols, filePaths),
          aliasNames: buildAliasNames(value),
          scope: 'file',
        })
      }
      return bindings
    },
  },
  {
    id: 'cake-app-import',
    scan(
      filePath: string,
      content: string,
      symbols: SymbolNode[],
      filePaths?: Set<string>,
    ): LoaderBinding[] {
      const bindings: LoaderBinding[] = []
      const regex = /\bApp::import\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/g
      for (const match of content.matchAll(regex)) {
        const typeName = match[2]
        const value = match[4]
        if (!typeName || !value) continue
        const normalized = typeName.toLowerCase()
        const targetPath =
          normalized === 'model'
            ? resolveCakeTarget(filePath, value, 'model', symbols, filePaths)
            : normalized === 'controller'
              ? resolveCakeTarget(filePath, value, 'controller', symbols, filePaths)
              : normalized === 'component'
                ? resolveCakeTarget(filePath, value, 'component', symbols, filePaths)
                : undefined
        bindings.push({
          via: 'App::import',
          value,
          targetPath,
          aliasNames: buildAliasNames(value),
          scope: 'file',
        })
      }
      return bindings
    },
  },
  createRegexResolver({
    id: 'cake-class-registry',
    regex: /\bClassRegistry::init\(\s*(['"])([^'"]+)\1\s*\)/g,
    via: 'ClassRegistry::init',
    resolveTarget: (filePath, value, symbols) =>
      resolveCakeTarget(filePath, value, 'model', symbols),
  }),
  createRegexResolver({
    id: 'ci-model',
    regex: /\$this->load->model\(\s*(['"])([^'"]+)\1\s*\)/g,
    via: 'load.model',
    resolveTarget: (filePath, value, symbols) =>
      resolveCodeIgniterTarget(filePath, value, 'model', symbols),
  }),
  createRegexResolver({
    id: 'ci-library',
    regex: /\$this->load->library\(\s*(['"])([^'"]+)\1\s*\)/g,
    via: 'load.library',
    resolveTarget: (filePath, value, symbols) =>
      resolveCodeIgniterTarget(filePath, value, 'library', symbols),
  }),
  createRegexResolver({
    id: 'ci-helper',
    regex: /\$this->load->helper\(\s*(['"])([^'"]+)\1\s*\)/g,
    via: 'load.helper',
    resolveTarget: (filePath, value, symbols) =>
      resolveCodeIgniterTarget(filePath, value, 'helper', symbols),
    aliases: () => [],
  }),
  createRegexResolver({
    id: 'yii-import',
    regex: /\bYii::import\(\s*(['"])([^'"]+)\1\s*\)/g,
    via: 'Yii::import',
    resolveTarget: resolveYiiImportTarget,
  }),
  {
    id: 'yii-create-object',
    scan(
      filePath: string,
      content: string,
      symbols: SymbolNode[],
      filePaths?: Set<string>,
    ): LoaderBinding[] {
      const bindings: LoaderBinding[] = []
      const regex =
        /\bYii::createObject\(\s*(?:(['"])([^'"]+)\1|(\\?[A-Za-z_][A-Za-z0-9_\\]*)::class)\s*\)/g
      for (const match of content.matchAll(regex)) {
        const value = match[2] ?? match[3]
        if (!value) continue
        bindings.push({
          via: 'Yii::createObject',
          value,
          targetPath: resolveFrameworkClassLiteralTarget(filePath, value, symbols, filePaths),
          aliasNames: buildAliasNames(value),
          scope: 'method',
        })
      }
      return bindings
    },
  },
  createRegexResolver({
    id: 'laravel-app-class',
    regex: /\bapp\(\s*(\\?[A-Za-z_][A-Za-z0-9_\\]*)::class\s*\)/g,
    via: 'app',
    valueIndex: 1,
    resolveTarget: resolveFrameworkClassLiteralTarget,
  }),
  createRegexResolver({
    id: 'laravel-resolve-class',
    regex: /\bresolve\(\s*(\\?[A-Za-z_][A-Za-z0-9_\\]*)::class\s*\)/g,
    via: 'resolve',
    valueIndex: 1,
    resolveTarget: resolveFrameworkClassLiteralTarget,
  }),
  createRegexResolver({
    id: 'symfony-get-class',
    regex: /\$this->get\(\s*(\\?[A-Za-z_][A-Za-z0-9_\\]*)::class\s*\)/g,
    via: '$this->get',
    valueIndex: 1,
    resolveTarget: resolveFrameworkClassLiteralTarget,
  }),
  createRegexResolver({
    id: 'zend-loader',
    regex: /\bZend_Loader::loadClass\(\s*(['"])([^'"]+)\1\s*\)/g,
    via: 'Zend_Loader::loadClass',
    resolveTarget: resolveFrameworkClassLiteralTarget,
  }),
  createRegexResolver({
    id: 'drupal-service',
    regex: /\\Drupal::service\(\s*(['"])([^'"]+)\1\s*\)/g,
    via: 'Drupal::service',
    resolveTarget: () => undefined,
    aliases: () => [],
  }),
]

/**
 * Language adapter for PHP files using tree-sitter via ast-grep.
 * Extracts functions, classes, methods, interfaces, enums, traits, and constants.
 */
export class PhpLanguageAdapter implements LanguageAdapter {
  private readonly psr4Cache = new Map<string, Array<[string, string]>>()

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
      comment: string | undefined,
    ): void => {
      const line = node.range().start.line + 1
      const col = node.range().start.column
      const key = `${kind}:${name}:${line}:${col}`
      if (seenSymbol.has(key)) return
      seenSymbol.add(key)
      symbols.push(
        createSymbolNode({
          name,
          kind,
          filePath,
          line,
          column: node.range().start.column,
          comment,
        }),
      )
    }

    this.extractSymbolsFromNode(root, filePath, addSymbol)
    const namespace = this.findNamespace(root)

    const imports: ImportDeclaration[] = []
    this.extractNamespaceUse(root, imports)
    const requirePattern =
      /\b(?:require|require_once|include|include_once)\s*(?:\(?\s*)['"]([^'"]+)['"]/g
    for (const match of content.matchAll(requirePattern)) {
      const specifier = match[1]
      if (specifier !== undefined) {
        imports.push({
          originalName: '',
          localName: '',
          specifier,
          isRelative: specifier.startsWith('.'),
          kind: ImportDeclarationKind.Require,
        })
      }
    }

    const bindingFacts = this.extractBindingFactsFromData(filePath, content, symbols, imports)
    const callFacts = this.extractCallFactsFromData(filePath, content, symbols)

    const typeInfos = this.collectPhpTypeInfo(filePath, content, symbols)
    const serializedInfos = typeInfos.map((info) => {
      const methodsByName: Record<string, string> = {}
      for (const [mName, mId] of info.methodsByName.entries()) {
        methodsByName[mName] = mId
      }
      return {
        ...info,
        methodsByName,
      }
    })

    const requireRelations = this.extractRequireRelations(filePath, content)
    const rawDynamicLoaders = this.collectRawDynamicLoaders(filePath, content)

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

    return {
      language: 'php',
      ...(namespace ? { namespace } : {}),
      symbols,
      imports,
      bindingFacts,
      callFacts,
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
    const { session, qualifiedNames, codeRoot, repoRoot } = context

    for (const imp of analysis.imports) {
      if (isFileOnlyImport(imp)) {
        const resolved = this.resolveFileImport(imp, analysis.filePath, session, codeRoot, repoRoot)
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
   * Resolves a file import path.
   * @param imp - Import declaration.
   * @param filePath - Importing file path.
   * @param session - Index session.
   * @param codeRoot - Workspace code root.
   * @param repoRoot - Repository root.
   * @returns Resolved file path, or undefined.
   */
  private resolveFileImport(
    imp: ImportDeclaration,
    filePath: string,
    session: IndexSession,
    codeRoot?: string,
    repoRoot?: string,
  ): string | undefined {
    if (imp.isRelative && this.resolveRelativeImportPath) {
      const resolved = this.resolveRelativeImportPath(filePath, imp.specifier)
      const candidates = Array.isArray(resolved) ? resolved : [resolved]
      return candidates.find((candidatePath) => session.findSymbolsByFile(candidatePath).length > 0)
    }

    if (!imp.isRelative && this.resolveQualifiedNameToPath && codeRoot) {
      return this.resolveQualifiedNameToPath(imp.specifier, codeRoot, repoRoot)
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
    const seen = new Set<string>()

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

    const scopes = phpState.scopes ?? []
    const requireRelations = phpState.requireRelations ?? []
    const dynamicLoaders = phpState.dynamicLoaders ?? []

    relations.push(...requireRelations)

    const dynamicBindings: LoaderBinding[] = []
    for (const loader of dynamicLoaders) {
      const targetPath =
        loader.candidates.find(
          (candidate: string) => context.session.getFileId(candidate) !== undefined,
        ) ?? loader.candidates[0]
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

    const currentFileSymbols = analysis.symbols
    for (const scope of scopes) {
      const callerId = currentFileSymbols.find(
        (s) => s.name === scope.name && s.line === scope.line,
      )?.id
      if (!callerId) continue

      const scopeText = scope.text
      const aliases = new Map<string, string>()
      const bindingsByValue = new Map<string, string>()
      for (const binding of dynamicBindings) {
        if (!binding.targetPath) continue
        bindingsByValue.set(binding.value, binding.targetPath)
        bindingsByValue.set(getPhpClassTail(binding.value), binding.targetPath)
        if (!bindingAppearsInScope(scopeText, binding)) continue
        for (const alias of binding.aliasNames) {
          aliases.set(alias, binding.targetPath)
        }
      }

      seedAssignedAliases(scopeText, aliases)

      for (const [alias, targetPath] of extractExplicitConstructedInstanceAliases(
        scopeText,
        bindingsByValue,
      )) {
        aliases.set(alias, targetPath)
      }

      seedAssignedAliases(scopeText, aliases)

      const orderedAliases = Array.from(aliases.keys())
        .sort((a, b) => b.length - a.length)
        .map((alias) => escapeRegExp(alias))
        .join('|')

      if (orderedAliases.length === 0) continue

      const callRegex = new RegExp(`(${orderedAliases})->([A-Za-z_][A-Za-z0-9_]*)\\s*\\(`, 'g')
      for (const match of scopeText.matchAll(callRegex)) {
        const alias = match[1]
        const methodName = match[2]
        if (!alias || !methodName) continue
        const targetPath = aliases.get(alias)
        if (!targetPath) continue
        const callee = context.session
          .findSymbolsByFile(targetPath)
          .find((symbol) => symbol.kind === SymbolKind.Method && symbol.name === methodName)
        if (!callee) continue
        const key = `${callerId}->${callee.id}`
        if (seen.has(key)) continue
        seen.add(key)
        relations.push(
          createRelation({
            source: callerId,
            target: callee.id,
            type: RelationType.Calls,
          }),
        )
      }
    }

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
      for (const parentName of info.extendsNames) {
        const importedId = context.resolvedImports.importMap.get(parentName)
        const localTarget = infoByName.get(parentName)
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
            }),
          )
        }

        if (localTarget) {
          this.addPhpOverrideRelationsFromState(info, localTarget, relations, seen)
        }
      }

      for (const contractName of info.implementsNames) {
        const importedId = context.resolvedImports.importMap.get(contractName)
        const localTarget = infoByName.get(contractName)
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
            }),
          )
        }

        if (localTarget) {
          this.addPhpOverrideRelationsFromState(info, localTarget, relations, seen)
        }
      }
    }

    return relations
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
   * Collects PHP type information including class, interface, and trait structures.
   * @param filePath - The path of the file being analyzed.
   * @param content - The content of the file.
   * @param symbols - Existing symbol nodes to reference.
   * @returns An array of PHP type information structures.
   */
  private collectPhpTypeInfo(
    filePath: string,
    content: string,
    symbols: SymbolNode[],
  ): PhpTypeInfo[] {
    const infos: PhpTypeInfo[] = []
    const lines = content.split('\n')
    const typeRegex =
      /\b(class|interface|trait)\s+([A-Za-z_][A-Za-z0-9_]*)\b(?:\s+extends\s+([A-Za-z0-9_\\,\s]+?))?(?:\s+implements\s+([A-Za-z0-9_\\,\s]+?))?\s*\{/g

    for (const match of content.matchAll(typeRegex)) {
      const rawKind = match[1]
      const name = match[2]
      if (!rawKind || !name) continue
      const line = content.slice(0, match.index ?? 0).split('\n').length
      const kind =
        rawKind === 'class'
          ? SymbolKind.Class
          : rawKind === 'interface'
            ? SymbolKind.Interface
            : SymbolKind.Type
      const symbolId = symbols.find(
        (symbol) =>
          symbol.filePath === filePath &&
          symbol.kind === kind &&
          symbol.name === name &&
          symbol.line === line,
      )?.id
      if (!symbolId) continue

      let endLine = lines.length
      let braceDepth = 0
      for (let idx = line - 1; idx < lines.length; idx++) {
        const current = lines[idx] ?? ''
        braceDepth += (current.match(/\{/g) ?? []).length
        braceDepth -= (current.match(/\}/g) ?? []).length
        if (idx >= line && braceDepth === 0) {
          endLine = idx + 1
          break
        }
      }

      const methodsByName = new Map<string, string>()
      for (const symbol of symbols) {
        if (symbol.filePath !== filePath || symbol.kind !== SymbolKind.Method) continue
        if (symbol.line <= line || symbol.line > endLine) continue
        methodsByName.set(symbol.name, symbol.id)
      }

      infos.push({
        name,
        symbolId,
        kind,
        extendsNames: (match[3] ?? '')
          .split(',')
          .map((entry) => getPhpClassTail(entry.trim()))
          .filter((entry) => entry.length > 0),
        implementsNames: (match[4] ?? '')
          .split(',')
          .map((entry) => getPhpClassTail(entry.trim()))
          .filter((entry) => entry.length > 0),
        methodsByName,
      })
    }

    return infos
  }

  /**
   * Extracts binding facts from source code content and imports.
   * @param filePath - The file path.
   * @param content - The file content.
   * @param _symbols - The extracted symbols.
   * @param imports - The resolved imports.
   * @returns An array of extracted binding facts.
   */
  private extractBindingFactsFromData(
    filePath: string,
    content: string,
    _symbols: SymbolNode[],
    imports: ImportDeclaration[],
  ): BindingFact[] {
    const facts: BindingFact[] = []
    const seen = new Set<string>()

    const addFact = (
      name: string,
      sourceKind: BindingSourceKind,
      targetName: string | undefined,
      index: number,
    ): void => {
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
        metadata: undefined,
      })
    }

    for (const declaration of imports) {
      if (declaration.localName.length === 0) continue
      addFact(declaration.localName, BindingSourceKind.ImportedType, declaration.originalName, 0)
    }

    const typedParameterPattern = /\b([A-Z][A-Za-z0-9_\\]*)\s+\$([A-Za-z_][A-Za-z0-9_]*)/g
    for (const match of content.matchAll(typedParameterPattern)) {
      const targetName = match[1]?.split('\\').at(-1)
      const name = match[2]
      if (name === undefined || targetName === undefined) continue
      addFact(name, BindingSourceKind.Parameter, targetName, match.index ?? 0)
    }

    const returnPattern = /:\s*([A-Z][A-Za-z0-9_\\]*)/g
    for (const match of content.matchAll(returnPattern)) {
      const targetName = match[1]?.split('\\').at(-1)
      if (targetName === undefined) continue
      addFact(targetName, BindingSourceKind.ReturnType, targetName, match.index ?? 0)
    }

    const usesPattern = /\$uses\s*=\s*(?:array\s*\(([^)]*)\)|\[([^\]]*)\])/g
    for (const match of content.matchAll(usesPattern)) {
      const list = match[1] ?? match[2] ?? ''
      for (const item of list.matchAll(/['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g)) {
        const targetName = item[1]
        if (targetName === undefined) continue
        addFact(targetName, BindingSourceKind.FrameworkManaged, targetName, match.index ?? 0)
      }
    }

    return facts
  }

  /**
   * Extracts call facts from file content using symbols.
   * @param filePath - The file path.
   * @param content - The file content.
   * @param symbols - Existing symbol nodes to map callers.
   * @returns An array of extracted call facts.
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

    const newPattern = /\bnew\s+([A-Za-z_\\][A-Za-z0-9_\\]*)\s*\(/g
    for (const match of content.matchAll(newPattern)) {
      const targetName = match[1]?.split('\\').at(-1)
      if (targetName === undefined) continue
      addFact(CallForm.Constructor, targetName, undefined, match.index ?? 0)
    }

    const frameworkCallPattern = /\$this->([A-Za-z_][A-Za-z0-9_]*)->([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    for (const match of content.matchAll(frameworkCallPattern)) {
      const receiverName = match[1]
      const name = match[2]
      if (receiverName === undefined || name === undefined) continue
      addFact(CallForm.Member, name, receiverName, match.index ?? 0)
    }

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
    addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
  ): void {
    const commentFor = (target: SgNode): string | undefined => extractComment(target)

    for (const child of node.children()) {
      switch (nodeKind(child)) {
        case 'function_definition': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Function, child, commentFor(child))
          break
        }
        case 'class_declaration': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Class, child, commentFor(child))
          this.walkClassBody(child, addSymbol)
          break
        }
        case 'interface_declaration': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Interface, child, commentFor(child))
          this.walkClassBody(child, addSymbol)
          break
        }
        case 'enum_declaration': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Enum, child, commentFor(child))
          break
        }
        case 'trait_declaration': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Type, child, commentFor(child))
          this.walkClassBody(child, addSymbol)
          break
        }
        case 'const_declaration': {
          for (const constChild of child.children()) {
            if (nodeKind(constChild) !== 'const_element') continue
            const nameNode = constChild.child(0)
            if (nameNode && nodeKind(nameNode) === 'name') {
              addSymbol(nameNode.text(), SymbolKind.Variable, constChild, commentFor(child))
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
    addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
  ): void {
    const commentFor = (target: SgNode): string | undefined => extractComment(target)

    for (const child of classNode.children()) {
      if (nodeKind(child) !== 'declaration_list') continue
      for (const member of child.children()) {
        if (nodeKind(member) === 'method_declaration') {
          const name = member.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Method, member, commentFor(member))
        } else if (nodeKind(member) === 'property_declaration') {
          for (const propChild of member.children()) {
            if (nodeKind(propChild) !== 'property_element') continue
            const varName = propChild.field('name')
            if (!varName) continue
            const name = varName.text().replace(/^\$/, '')
            if (name) addSymbol(name, SymbolKind.Variable, member, commentFor(member))
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
          autoload?: { 'psr-4'?: Record<string, string> }
          'autoload-dev'?: { 'psr-4'?: Record<string, string> }
        }
        const merged = { ...pkg.autoload?.['psr-4'], ...pkg['autoload-dev']?.['psr-4'] }
        return Object.keys(merged).length > 0 ? JSON.stringify(merged) : undefined
      },
      repoRoot,
    )
    if (!serialized) {
      this.psr4Cache.set(codeRoot, [])
      return []
    }
    const entries = JSON.parse(serialized) as Record<string, string>
    const map: Array<[string, string]> = Object.entries(entries).map(([prefix, relDir]) => [
      prefix,
      path.resolve(codeRoot, relDir),
    ])
    map.sort((a, b) => b[0].length - a[0].length)
    this.psr4Cache.set(codeRoot, map)
    return map
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
    const map = this.psr4Cache.get(codeRoot) ?? this.buildPsr4Map(codeRoot, repoRoot)
    for (const [prefix, dir] of map) {
      if (qualifiedName.startsWith(prefix)) {
        const relative = qualifiedName.slice(prefix.length).replace(/\\/g, path.sep)
        return path.join(dir, relative + '.php')
      }
    }
    return undefined
  }

  /**
   * Extracts require relations from content.
   * @param filePath - File path.
   * @param content - PHP content.
   * @returns Array of relations.
   */
  private extractRequireRelations(filePath: string, content: string): Relation[] {
    const relations: Relation[] = []
    const requireRegex =
      /\b(?:require|require_once|include|include_once)\s*\(?\s*(['"])([^'"$][^'"]*)\1\s*\)?/g
    for (const match of content.matchAll(requireRegex)) {
      const value = match[2]
      if (!value || value.includes("' .") || value.includes('" .')) continue
      relations.push(
        createRelation({
          source: filePath,
          target: resolveFromFilePath(filePath, value),
          type: RelationType.Imports,
        }),
      )
    }
    return relations
  }

  /**
   * Collects raw dynamic loader facts from file content.
   * @param filePath - File path.
   * @param content - PHP content.
   * @returns Array of dynamic loader facts.
   */
  private collectRawDynamicLoaders(filePath: string, content: string): DynamicLoaderFact[] {
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

    for (const match of content.matchAll(
      /\$this->loadModel\(\s*(['"])([^'"]+)\1\s*\)|\bloadModel\(\s*(['"])([^'"]+)\3\s*\)/g,
    )) {
      const matchText = match[0] ?? ''
      const matchIndex = match.index ?? 0
      const prefix = content.slice(Math.max(0, matchIndex - 2), matchIndex)
      if (!matchText.startsWith('$this->') && (prefix === '->' || prefix === '::')) continue
      const value = match[2] ?? match[4]
      if (value) {
        addFact(
          'loadModel',
          value,
          getCakeTargetCandidates(filePath, value, 'model'),
          buildAliasNames(value),
          'method',
        )
      }
    }

    for (const match of content.matchAll(
      /\$this->loadController\(\s*(['"])([^'"]+)\1\s*\)|\bloadController\(\s*(['"])([^'"]+)\3\s*\)/g,
    )) {
      const matchText = match[0] ?? ''
      const matchIndex = match.index ?? 0
      const prefix = content.slice(Math.max(0, matchIndex - 2), matchIndex)
      if (!matchText.startsWith('$this->') && (prefix === '->' || prefix === '::')) continue
      const value = match[2] ?? match[4]
      if (value) {
        addFact(
          'loadController',
          value,
          getCakeTargetCandidates(filePath, value, 'controller'),
          buildAliasNames(value),
          'method',
        )
      }
    }

    for (const match of content.matchAll(
      /\$this->loadComponent\(\s*(['"])([^'"]+)\1\s*\)|\bloadComponent\(\s*(['"])([^'"]+)\3\s*\)/g,
    )) {
      const matchText = match[0] ?? ''
      const matchIndex = match.index ?? 0
      const prefix = content.slice(Math.max(0, matchIndex - 2), matchIndex)
      if (!matchText.startsWith('$this->') && (prefix === '->' || prefix === '::')) continue
      const value = match[2] ?? match[4]
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

    for (const match of content.matchAll(
      /\bApp::uses\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/g,
    )) {
      const value = match[2]
      const packageName = match[4]
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
    }

    for (const match of content.matchAll(/\buses\(\s*(['"])([^'"]+)\1\s*\)/g)) {
      const matchIndex = match.index ?? 0
      const prefix = content.slice(Math.max(0, matchIndex - 2), matchIndex)
      if (prefix === '->' || prefix === '::') continue
      const value = match[2]
      if (value) {
        addFact(
          'uses',
          value,
          getCakeTargetCandidates(filePath, value, 'model'),
          buildAliasNames(value),
          'file',
        )
      }
    }

    for (const match of content.matchAll(
      /\bApp::import\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/g,
    )) {
      const typeName = match[2]
      const value = match[4]
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

    for (const match of content.matchAll(/\bClassRegistry::init\(\s*(['"])([^'"]+)\1\s*\)/g)) {
      const value = match[2]
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

    for (const match of content.matchAll(/\$this->load->model\(\s*(['"])([^'"]+)\1\s*\)/g)) {
      const value = match[2]
      if (value) {
        addFact(
          'load.model',
          value,
          getCodeIgniterTargetCandidates(filePath, value, 'model'),
          buildAliasNames(value),
          'method',
        )
      }
    }

    for (const match of content.matchAll(/\$this->load->library\(\s*(['"])([^'"]+)\1\s*\)/g)) {
      const value = match[2]
      if (value) {
        addFact(
          'load.library',
          value,
          getCodeIgniterTargetCandidates(filePath, value, 'library'),
          buildAliasNames(value),
          'method',
        )
      }
    }

    for (const match of content.matchAll(/\$this->load->helper\(\s*(['"])([^'"]+)\1\s*\)/g)) {
      const value = match[2]
      if (value) {
        addFact(
          'load.helper',
          value,
          getCodeIgniterTargetCandidates(filePath, value, 'helper'),
          [],
          'method',
        )
      }
    }

    for (const match of content.matchAll(/\bYii::import\(\s*(['"])([^'"]+)\1\s*\)/g)) {
      const value = match[2]
      if (value) {
        addFact(
          'Yii::import',
          value,
          getYiiImportTargetCandidates(filePath, value),
          buildAliasNames(value),
          'method',
        )
      }
    }

    for (const match of content.matchAll(
      /\bYii::createObject\(\s*(?:(['"])([^'"]+)\1|(\\?[A-Za-z_][A-Za-z0-9_\\]*)::class)\s*\)/g,
    )) {
      const value = match[2] ?? match[3]
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

    for (const match of content.matchAll(/\bapp\(\s*(\\?[A-Za-z_][A-Za-z0-9_\\]*)::class\s*\)/g)) {
      const value = match[1]
      if (value) {
        addFact(
          'app',
          value,
          getFrameworkClassLiteralTargetCandidates(filePath, value),
          buildAliasNames(value),
          'method',
        )
      }
    }

    for (const match of content.matchAll(
      /\bresolve\(\s*(\\?[A-Za-z_][A-Za-z0-9_\\]*)::class\s*\)/g,
    )) {
      const value = match[1]
      if (value) {
        addFact(
          'resolve',
          value,
          getFrameworkClassLiteralTargetCandidates(filePath, value),
          buildAliasNames(value),
          'method',
        )
      }
    }

    for (const match of content.matchAll(
      /\$this->get\(\s*(\\?[A-Za-z_][A-Za-z0-9_\\]*)::class\s*\)/g,
    )) {
      const value = match[1]
      if (value) {
        addFact(
          '$this->get',
          value,
          getFrameworkClassLiteralTargetCandidates(filePath, value),
          buildAliasNames(value),
          'method',
        )
      }
    }

    for (const match of content.matchAll(/\bZend_Loader::loadClass\(\s*(['"])([^'"]+)\1\s*\)/g)) {
      const value = match[2]
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

    for (const match of content.matchAll(/\\Drupal::service\(\s*(['"])([^'"]+)\1\s*\)/g)) {
      const value = match[2]
      if (value) {
        addFact('Drupal::service', value, [], [], 'method')
      }
    }

    const usesPropRegex =
      /\b(?:var|public|protected)\s+\$uses\s*=\s*(?:array\(([\s\S]*?)\)|\[([\s\S]*?)\])\s*;/g
    for (const match of content.matchAll(usesPropRegex)) {
      const entries = parseLiteralPhpArrayEntries(match[1] ?? match[2] ?? '')
      for (const value of entries) {
        addFact(
          'usesProperty',
          value,
          getCakeTargetCandidates(filePath, value, 'model'),
          buildAliasNames(value),
          'class',
        )
      }
    }

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
    const colonIdx = fromFile.indexOf(':')
    const wsPrefix = colonIdx === -1 ? '' : fromFile.substring(0, colonIdx + 1)
    const relFile = colonIdx === -1 ? fromFile : fromFile.substring(colonIdx + 1)

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
