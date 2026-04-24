import path from 'node:path'
import { parse } from '@ast-grep/napi'
import { type SgNode } from '@ast-grep/napi'
import {
  type LanguageAdapter,
  type ExtractedSymbolsWithNamespace,
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
  readonly aliasNames: string[]
  readonly scope: 'file' | 'class' | 'method'
}

/**
 * Resolver that detects framework-specific dynamic loader patterns.
 */
interface LoaderResolver {
  readonly id: string
  scan(filePath: string, content: string, symbols: SymbolNode[]): LoaderBinding[]
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
 * @returns Selected target path, or undefined when no candidates exist.
 */
function selectCandidatePath(candidates: string[], symbols: SymbolNode[]): string | undefined {
  if (candidates.length === 0) return undefined
  const indexedFiles = new Set(symbols.map((symbol) => symbol.filePath))
  return candidates.find((candidate) => indexedFiles.has(candidate)) ?? candidates[0]
}

/**
 * Resolves CakePHP model/controller/component paths from a source file.
 * @param filePath - The importing file path.
 * @param value - The logical dependency name.
 * @param kind - The Cake target kind.
 * @param symbols - Indexed symbol pool.
 * @returns The resolved target path, or undefined.
 */
function resolveCakeTarget(
  filePath: string,
  value: string,
  kind: 'model' | 'controller' | 'component',
  symbols: SymbolNode[],
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
  return selectCandidatePath(candidates, symbols)
}

/**
 * Resolves CodeIgniter-style target files.
 * @param filePath - The importing file path.
 * @param value - The logical dependency name.
 * @param kind - CodeIgniter target kind.
 * @param symbols - Indexed symbol pool.
 * @returns The resolved target path, or undefined.
 */
function resolveCodeIgniterTarget(
  filePath: string,
  value: string,
  kind: 'model' | 'library' | 'helper',
  symbols: SymbolNode[],
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
  return selectCandidatePath(candidates, symbols)
}

/**
 * Resolves dotted Yii import paths.
 * @param filePath - The importing file path.
 * @param value - The dotted Yii alias.
 * @param symbols - Indexed symbol pool.
 * @returns The resolved target path, or undefined.
 */
function resolveYiiImportTarget(
  filePath: string,
  value: string,
  symbols: SymbolNode[],
): string | undefined {
  const { prefix } = splitWorkspacePath(filePath)
  const rel = value.startsWith('application.')
    ? `protected/${value.slice('application.'.length).replaceAll('.', '/')}.php`
    : value.replaceAll('.', '/') + '.php'
  const candidates = prefix ? [`${prefix}${rel}`] : [rel]
  return selectCandidatePath(candidates, symbols)
}

/**
 * Resolves generic namespace/path-based loader values against common PHP locations.
 * @param filePath - The importing file path.
 * @param value - Loader value.
 * @param symbols - Indexed symbol pool.
 * @returns The resolved target path, or undefined.
 */
function resolveGenericPhpTarget(
  filePath: string,
  value: string,
  symbols: SymbolNode[],
): string | undefined {
  const { prefix } = splitWorkspacePath(filePath)
  const namespaced = value.replaceAll('\\', '/')
  const relCandidates = [`src/${namespaced}.php`, `app/${namespaced}.php`, `lib/${namespaced}.php`]
  const candidates = relCandidates.map((candidate) =>
    prefix ? `${prefix}${candidate}` : candidate,
  )
  return selectCandidatePath(candidates, symbols)
}

/**
 * Resolves an explicit class literal or qualified class reference to a PHP file.
 * @param filePath - Source file path.
 * @param value - Explicit class reference or qualified class name.
 * @param symbols - Indexed symbol pool.
 * @returns The resolved target path, or undefined.
 */
function resolveFrameworkClassLiteralTarget(
  filePath: string,
  value: string,
  symbols: SymbolNode[],
): string | undefined {
  const normalized = value
    .replace(/^\\+/, '')
    .replace(/::class$/, '')
    .trim()
  if (!normalized || !/[A-Z_\\]/.test(normalized)) return undefined
  return resolveGenericPhpTarget(filePath, normalized, symbols)
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
 * Extracts CakePHP class-property `uses` declarations as loader bindings.
 * @param filePath - Source file path.
 * @param content - PHP source text.
 * @param symbols - Symbol pool used for target resolution.
 * @returns Class-scoped loader bindings.
 */
function extractCakeUsesPropertyBindings(
  filePath: string,
  content: string,
  symbols: SymbolNode[],
): LoaderBinding[] {
  const bindings: LoaderBinding[] = []
  const regex =
    /\b(?:var|public|protected)\s+\$uses\s*=\s*(?:array\(([\s\S]*?)\)|\[([\s\S]*?)\])\s*;/g
  for (const match of content.matchAll(regex)) {
    const entries = parseLiteralPhpArrayEntries(match[1] ?? match[2] ?? '')
    for (const value of entries) {
      bindings.push({
        via: 'usesProperty',
        value,
        targetPath: resolveCakeTarget(filePath, value, 'model', symbols),
        aliasNames: buildAliasNames(value),
        scope: 'class',
      })
    }
  }
  return bindings
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
  resolveTarget: (filePath: string, value: string, symbols: SymbolNode[]) => string | undefined
  aliases?: (value: string) => string[]
  valueIndex?: number
  scope?: 'file' | 'class' | 'method'
}): LoaderResolver {
  const valueIndex = params.valueIndex ?? 2
  return {
    id: params.id,
    scan(filePath: string, content: string, symbols: SymbolNode[]): LoaderBinding[] {
      const bindings: LoaderBinding[] = []
      for (const match of content.matchAll(params.regex)) {
        const value = match[valueIndex]
        if (!value) continue
        bindings.push({
          via: params.via,
          value,
          targetPath: params.resolveTarget(filePath, value, symbols),
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
const LOADER_RESOLVERS: ReadonlyArray<LoaderResolver> = [
  {
    id: 'cake-load-model',
    scan(filePath: string, content: string, symbols: SymbolNode[]): LoaderBinding[] {
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
          targetPath: resolveCakeTarget(filePath, value, 'model', symbols),
          aliasNames: buildAliasNames(value),
          scope: 'method',
        })
      }
      return bindings
    },
  },
  {
    id: 'cake-load-controller',
    scan(filePath: string, content: string, symbols: SymbolNode[]): LoaderBinding[] {
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
          targetPath: resolveCakeTarget(filePath, value, 'controller', symbols),
          aliasNames: buildAliasNames(value),
          scope: 'method',
        })
      }
      return bindings
    },
  },
  {
    id: 'cake-load-component',
    scan(filePath: string, content: string, symbols: SymbolNode[]): LoaderBinding[] {
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
          targetPath: resolveCakeTarget(filePath, value, 'component', symbols),
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
    scan(filePath: string, content: string, symbols: SymbolNode[]): LoaderBinding[] {
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
          targetPath: resolveCakeTarget(filePath, value, 'model', symbols),
          aliasNames: buildAliasNames(value),
          scope: 'file',
        })
      }
      return bindings
    },
  },
  {
    id: 'cake-app-import',
    scan(filePath: string, content: string, symbols: SymbolNode[]): LoaderBinding[] {
      const bindings: LoaderBinding[] = []
      const regex = /\bApp::import\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/g
      for (const match of content.matchAll(regex)) {
        const typeName = match[2]
        const value = match[4]
        if (!typeName || !value) continue
        const normalized = typeName.toLowerCase()
        const targetPath =
          normalized === 'model'
            ? resolveCakeTarget(filePath, value, 'model', symbols)
            : normalized === 'controller'
              ? resolveCakeTarget(filePath, value, 'controller', symbols)
              : normalized === 'component'
                ? resolveCakeTarget(filePath, value, 'component', symbols)
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
    scan(filePath: string, content: string, symbols: SymbolNode[]): LoaderBinding[] {
      const bindings: LoaderBinding[] = []
      const regex =
        /\bYii::createObject\(\s*(?:(['"])([^'"]+)\1|(\\?[A-Za-z_][A-Za-z0-9_\\]*)::class)\s*\)/g
      for (const match of content.matchAll(regex)) {
        const value = match[2] ?? match[3]
        if (!value) continue
        bindings.push({
          via: 'Yii::createObject',
          value,
          targetPath: resolveFrameworkClassLiteralTarget(filePath, value, symbols),
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
   * Extracts the declared namespace from PHP source code.
   * @param content - PHP source text.
   * @returns The declared namespace, or undefined.
   */
  extractNamespace(content: string): string | undefined {
    ensureLanguagesRegistered()
    const root = parse('php', content).root()
    return this.findNamespace(root)
  }

  /**
   * Extracts PHP symbols and namespace from a single parse tree.
   * @param filePath - Workspace-prefixed file path.
   * @param content - PHP source text.
   * @returns Symbols plus the declared namespace when present.
   */
  extractSymbolsWithNamespace(filePath: string, content: string): ExtractedSymbolsWithNamespace {
    ensureLanguagesRegistered()
    const root = parse('php', content).root()
    return this.extractSymbolsAndNamespaceFromRoot(filePath, root)
  }

  /**
   * Finds the first namespace definition in a parsed PHP tree.
   * @param node - AST node to inspect.
   * @returns The namespace string, or undefined.
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
   * Extracts symbols defined in a PHP file.
   * @param filePath - Workspace-prefixed file path.
   * @param content - PHP source text.
   * @returns Extracted symbols.
   */
  extractSymbols(filePath: string, content: string): SymbolNode[] {
    ensureLanguagesRegistered()
    const root = parse('php', content).root()
    return this.extractSymbolsAndNamespaceFromRoot(filePath, root).symbols
  }

  /**
   * Extracts PHP symbols and namespace from an already parsed root node.
   * @param filePath - Workspace-prefixed file path.
   * @param root - Parsed PHP root node.
   * @returns Symbols plus the declared namespace when present.
   */
  private extractSymbolsAndNamespaceFromRoot(
    filePath: string,
    root: SgNode,
  ): ExtractedSymbolsWithNamespace {
    const symbols: SymbolNode[] = []
    const seen = new Set<string>()

    const addSymbol = (
      name: string,
      kind: SymbolKind,
      node: SgNode,
      comment: string | undefined,
    ): void => {
      const line = node.range().start.line + 1
      const col = node.range().start.column
      const key = `${kind}:${name}:${line}:${col}`
      if (seen.has(key)) return
      seen.add(key)
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

    this.walk(root, addSymbol)
    return { symbols, namespace: this.findNamespace(root) }
  }

  /**
   * Extracts file-level and symbol-level relations from a PHP file.
   * @param filePath - Workspace-prefixed file path.
   * @param content - PHP source text.
   * @param symbols - Symbol pool available for resolution.
   * @param importMap - Locally imported names mapped to symbol ids.
   * @returns Extracted relations.
   */
  extractRelations(
    filePath: string,
    content: string,
    symbols: SymbolNode[],
    importMap: Map<string, string>,
  ): Relation[] {
    ensureLanguagesRegistered()

    const relations: Relation[] = []
    const currentFileSymbols = symbols.filter((symbol) => symbol.filePath === filePath)

    for (const symbol of currentFileSymbols) {
      relations.push(
        createRelation({ source: filePath, target: symbol.id, type: RelationType.Defines }),
      )
    }

    for (const symbolId of importMap.values()) {
      const marker = symbolId.match(/:(?:class|function|method|variable|type|interface|enum):/)
      if (!marker || marker.index === undefined) continue
      relations.push(
        createRelation({
          source: filePath,
          target: symbolId.slice(0, marker.index),
          type: RelationType.Imports,
        }),
      )
    }

    relations.push(...this.extractRequireRelations(filePath, content))
    const dynamicBindings = this.collectDynamicLoaderBindings(filePath, content, symbols)
    relations.push(...this.extractDynamicLoaderRelations(filePath, dynamicBindings))
    relations.push(
      ...this.extractHierarchyRelations(filePath, content, currentFileSymbols, importMap),
    )
    relations.push(
      ...this.extractLoadedInstanceCalls(
        filePath,
        content,
        currentFileSymbols,
        symbols,
        dynamicBindings,
      ),
    )

    return relations
  }

  /**
   * Extracts deterministic PHP hierarchy relations from class and interface declarations.
   * @param filePath - Source file path.
   * @param content - PHP source text.
   * @param symbols - Symbols declared in the current file.
   * @param importMap - Resolved imported type names.
   * @returns Hierarchy relations.
   */
  private extractHierarchyRelations(
    filePath: string,
    content: string,
    symbols: SymbolNode[],
    importMap: Map<string, string>,
  ): Relation[] {
    const infos = this.collectPhpTypeInfo(filePath, content, symbols)
    const infoByName = new Map(infos.map((info) => [info.name, info]))
    const relations: Relation[] = []
    const seen = new Set<string>()

    for (const info of infos) {
      for (const parentName of info.extendsNames) {
        const importedId = importMap.get(parentName)
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
          this.addPhpOverrideRelations(info, localTarget, relations, seen)
        }
      }

      for (const contractName of info.implementsNames) {
        const importedId = importMap.get(contractName)
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
          this.addPhpOverrideRelations(info, localTarget, relations, seen)
        }
      }
    }

    return relations
  }

  /**
   * Collects local PHP class, interface, and trait declarations for hierarchy extraction.
   * @param filePath - Source file path.
   * @param content - PHP source text.
   * @param symbols - Symbols declared in the current file.
   * @returns Local class-like declarations.
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
   * Emits PHP method-level `OVERRIDES` relations for matching local declarations.
   * @param source - Child declaration info.
   * @param target - Base or contract declaration info.
   * @param relations - Accumulator array for discovered relations.
   * @param seen - Deduplication set.
   */
  private addPhpOverrideRelations(
    source: PhpTypeInfo,
    target: PhpTypeInfo,
    relations: Relation[],
    seen: Set<string>,
  ): void {
    for (const [methodName, methodId] of source.methodsByName.entries()) {
      const targetMethodId = target.methodsByName.get(methodName)
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
   * Extracts `use` declarations from a PHP file.
   * @param filePath - Source file path.
   * @param content - PHP source text.
   * @returns Parsed import declarations.
   */
  extractImportedNames(filePath: string, content: string): ImportDeclaration[] {
    void filePath
    ensureLanguagesRegistered()
    const root = parse('php', content).root()
    const results: ImportDeclaration[] = []
    this.walkForUseDeclarations(root, results)
    const requirePattern =
      /\b(?:require|require_once|include|include_once)\s*(?:\(?\s*)['"]([^'"]+)['"]/g
    for (const match of content.matchAll(requirePattern)) {
      const specifier = match[1]
      if (specifier === undefined) continue
      results.push({
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
   * Extracts deterministic PHP binding facts for shared scoped resolution.
   * @param filePath - Path to the source file.
   * @param content - Source file content.
   * @param _symbols - Symbols extracted from the file.
   * @param imports - Import declarations extracted from the file.
   * @returns Binding facts for imports, typed signatures, and framework-managed aliases.
   */
  extractBindingFacts(
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
   * Extracts normalized PHP call facts for shared scoped resolution.
   * @param filePath - Path to the source file.
   * @param content - Source file content.
   * @param symbols - Symbols extracted from the file.
   * @returns Call facts for deterministic constructions and framework/member calls.
   */
  extractCallFacts(filePath: string, content: string, symbols: SymbolNode[]): CallFact[] {
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
   * Walks the tree to collect namespace `use` declarations.
   * @param node - AST node to inspect.
   * @param results - Mutable result array.
   * @returns Nothing.
   */
  private walkForUseDeclarations(node: SgNode, results: ImportDeclaration[]): void {
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
          results.push({
            originalName,
            localName: alias ?? originalName,
            specifier: qualifiedName,
            isRelative: false,
            kind: ImportDeclarationKind.Named,
          })
        }
      } else if (kind === 'program') {
        this.walkForUseDeclarations(child, results)
      } else if (kind === 'namespace_definition') {
        for (const nsChild of child.children()) {
          if (nodeKind(nsChild) === 'compound_statement') {
            this.walkForUseDeclarations(nsChild, results)
          }
        }
      }
    }
  }

  /**
   * Walks the AST and records top-level PHP symbols.
   * @param node - AST node to inspect.
   * @param addSymbol - Callback used to register extracted symbols.
   * @returns Nothing.
   */
  private walk(
    node: SgNode,
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
            if (nodeKind(nsChild) === 'compound_statement') this.walk(nsChild, addSymbol)
          }
          break
        }
        default:
          break
      }
    }
  }

  /**
   * Walks a class-like declaration body and records methods and properties.
   * @param classNode - Class, trait, or interface node.
   * @param addSymbol - Callback used to register extracted symbols.
   * @returns Nothing.
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
   * Builds a fully qualified PHP symbol name.
   * @param namespace - Namespace prefix.
   * @param symbolName - Unqualified symbol name.
   * @returns Fully qualified name.
   */
  buildQualifiedName(namespace: string, symbolName: string): string {
    return `${namespace}\\${symbolName}`
  }

  /**
   * Reads the Composer package identity for a workspace.
   * @param codeRoot - Absolute workspace root.
   * @param repoRoot - Optional repository root boundary.
   * @returns Composer package name, or undefined.
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
   * Builds and caches the PSR-4 prefix map for a workspace.
   * @param codeRoot - Absolute workspace root.
   * @param repoRoot - Optional repository root boundary.
   * @returns Sorted PSR-4 prefix entries.
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
   * Resolves a qualified PHP class name to a file path using PSR-4 rules.
   * @param qualifiedName - Fully qualified class name.
   * @param codeRoot - Absolute workspace root.
   * @param repoRoot - Optional repository root boundary.
   * @returns Absolute file path, or undefined.
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
   * Extracts literal `require` and `include` relations from PHP code.
   * @param filePath - Source file path.
   * @param content - PHP source text.
   * @returns File import relations.
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
   * Collects framework loader bindings from PHP source code.
   * @param filePath - Source file path.
   * @param content - PHP source text.
   * @param symbols - Symbol pool used for target resolution.
   * @returns Resolved loader bindings.
   */
  private collectDynamicLoaderBindings(
    filePath: string,
    content: string,
    symbols: SymbolNode[],
  ): LoaderBinding[] {
    const seen = new Set<string>()
    const bindings: LoaderBinding[] = []
    for (const resolver of LOADER_RESOLVERS) {
      for (const binding of resolver.scan(filePath, content, symbols)) {
        const key = `${binding.via}:${binding.scope}:${binding.value}:${binding.targetPath ?? 'unresolved'}`
        if (seen.has(key)) continue
        seen.add(key)
        bindings.push(binding)
      }
    }
    for (const binding of extractCakeUsesPropertyBindings(filePath, content, symbols)) {
      const key = `${binding.via}:${binding.scope}:${binding.value}:${binding.targetPath ?? 'unresolved'}`
      if (seen.has(key)) continue
      seen.add(key)
      bindings.push(binding)
    }
    const appUsesRegex = /\bApp::uses\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/g
    for (const match of content.matchAll(appUsesRegex)) {
      const value = match[2]
      const packageName = match[4]
      const kind = value && packageName ? getCakePackageKind(packageName) : undefined
      if (!value || !kind) continue
      const targetPath = resolveCakeTarget(filePath, value, kind, symbols)
      const key = `App::uses:${value}:${targetPath ?? 'unresolved'}`
      if (seen.has(key)) continue
      seen.add(key)
      bindings.push({
        via: 'App::uses',
        value,
        targetPath,
        aliasNames: buildAliasNames(value),
        scope: 'file',
      })
    }
    return bindings
  }

  /**
   * Converts resolved loader bindings into file-level import relations.
   * @param filePath - Source file path.
   * @param bindings - Loader bindings found in the file.
   * @returns File import relations.
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
   * Extracts method calls performed through dynamically loaded instances.
   * @param filePath - Source file path.
   * @param content - PHP source text.
   * @param currentFileSymbols - Symbols declared in the current file.
   * @param allSymbols - Symbol pool available for callee resolution.
   * @param bindings - Loader bindings found in the file.
   * @returns Symbol-level call relations.
   */
  private extractLoadedInstanceCalls(
    filePath: string,
    content: string,
    currentFileSymbols: SymbolNode[],
    allSymbols: SymbolNode[],
    bindings: LoaderBinding[],
  ): Relation[] {
    ensureLanguagesRegistered()
    const root = parse('php', content).root()
    const relations: Relation[] = []
    const seen = new Set<string>()

    const walk = (node: SgNode): void => {
      const kind = nodeKind(node)
      if (kind === 'function_definition' || kind === 'method_declaration') {
        const callerId = this.findEnclosingSymbolId(node, currentFileSymbols)
        if (!callerId) return

        const scopeText = node.text()
        const aliases = new Map<string, string>()
        const bindingsByValue = new Map<string, string>()
        for (const binding of bindings) {
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

        if (orderedAliases.length === 0) return

        const callRegex = new RegExp(`(${orderedAliases})->([A-Za-z_][A-Za-z0-9_]*)\\s*\\(`, 'g')
        for (const match of scopeText.matchAll(callRegex)) {
          const alias = match[1]
          const methodName = match[2]
          if (!alias || !methodName) continue
          const targetPath = aliases.get(alias)
          if (!targetPath) continue
          const callee = allSymbols.find(
            (symbol) =>
              symbol.filePath === targetPath &&
              symbol.kind === SymbolKind.Method &&
              symbol.name === methodName,
          )
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
        return
      }

      for (const child of node.children()) {
        walk(child)
      }
    }

    walk(root)
    return relations
  }

  /**
   * Resolves the symbol id for a function or method AST node.
   * @param node - Function or method AST node.
   * @param symbols - Symbols declared in the current file.
   * @returns Matching symbol id, or undefined.
   */
  private findEnclosingSymbolId(node: SgNode, symbols: SymbolNode[]): string | undefined {
    const name = node.field('name')?.text()
    if (!name) return undefined
    const line = node.range().start.line + 1
    return symbols.find((symbol) => symbol.name === name && symbol.line === line)?.id
  }
}
