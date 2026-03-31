import path from 'node:path'
import { parse } from '@ast-grep/napi'
import { type SgNode } from '@ast-grep/napi'
import { type LanguageAdapter } from '../../domain/value-objects/language-adapter.js'
import { type SymbolNode, createSymbolNode } from '../../domain/value-objects/symbol-node.js'
import { type Relation, createRelation } from '../../domain/value-objects/relation.js'
import { SymbolKind } from '../../domain/value-objects/symbol-kind.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
import { findManifestField } from './find-manifest-field.js'
import { type ImportDeclaration } from '../../domain/value-objects/import-declaration.js'
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
 * Returns candidate alias names for a dynamically loaded dependency.
 * @param value - The raw loader argument.
 * @returns Alias strings used by the call extractor.
 */
function defaultAliasNames(value: string): string[] {
  const base =
    value.replaceAll('\\', '/').replaceAll('.', '/').split('/').filter(Boolean).at(-1) ?? value
  return [`$this->${base}`, `$${base}`]
}

/**
 * Resolved dynamic-loader binding found in a PHP file.
 */
interface LoaderBinding {
  readonly via: string
  readonly value: string
  readonly targetPath: string | undefined
  readonly aliasNames: string[]
}

/**
 * Resolver that detects framework-specific dynamic loader patterns.
 */
interface LoaderResolver {
  readonly id: string
  scan(filePath: string, content: string, symbols: SymbolNode[]): LoaderBinding[]
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
  const quotedValue = `['"]${escapeRegExp(binding.value)}['"]`
  switch (binding.via) {
    case 'loadModel':
      return new RegExp(`(?:\\$this->)?loadModel\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    case 'loadController':
      return new RegExp(`\\$this->loadController\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    case 'loadComponent':
      return new RegExp(`\\$this->loadComponent\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    case 'App::import':
      return new RegExp(`App::import\\([^\\n]*${quotedValue}`).test(scopeText)
    case 'ClassRegistry::init':
      return new RegExp(`ClassRegistry::init\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    case 'load.model':
      return new RegExp(`\\$this->load->model\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    case 'load.library':
      return new RegExp(`\\$this->load->library\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    case 'Yii::createObject':
      return new RegExp(`Yii::createObject\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
    case 'Zend_Loader::loadClass':
      return new RegExp(`Zend_Loader::loadClass\\(\\s*${quotedValue}\\s*\\)`).test(scopeText)
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
 * Creates a regex-driven loader resolver.
 * @param params - Resolver configuration.
 * @param params.id - Stable resolver id.
 * @param params.regex - Pattern that captures the interesting literal argument.
 * @param params.via - Metadata identifier for the matched loader.
 * @param params.resolveTarget - Target resolution function.
 * @param params.aliases - Alias derivation function.
 * @param params.valueIndex - Match group index for the captured value.
 * @returns A loader resolver.
 */
function createRegexResolver(params: {
  id: string
  regex: RegExp
  via: string
  resolveTarget: (filePath: string, value: string, symbols: SymbolNode[]) => string | undefined
  aliases?: (value: string) => string[]
  valueIndex?: number
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
          aliasNames: (params.aliases ?? defaultAliasNames)(value),
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
          aliasNames: defaultAliasNames(value),
        })
      }
      return bindings
    },
  },
  createRegexResolver({
    id: 'cake-load-controller',
    regex: /\$this->loadController\(\s*(['"])([^'"]+)\1\s*\)/g,
    via: 'loadController',
    resolveTarget: (filePath, value, symbols) =>
      resolveCakeTarget(filePath, value, 'controller', symbols),
  }),
  createRegexResolver({
    id: 'cake-load-component',
    regex: /\$this->loadComponent\(\s*(['"])([^'"]+)\1\s*\)/g,
    via: 'loadComponent',
    resolveTarget: (filePath, value, symbols) =>
      resolveCakeTarget(filePath, value, 'component', symbols),
  }),
  createRegexResolver({
    id: 'cake-app-uses',
    regex: /\bApp::uses\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/g,
    via: 'App::uses',
    valueIndex: 2,
    resolveTarget: () => undefined,
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
          aliasNames: defaultAliasNames(value),
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
          aliasNames: defaultAliasNames(value),
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
  createRegexResolver({
    id: 'yii-create-object',
    regex: /\bYii::createObject\(\s*(['"])([^'"]+)\1\s*\)/g,
    via: 'Yii::createObject',
    resolveTarget: resolveGenericPhpTarget,
  }),
  createRegexResolver({
    id: 'zend-loader',
    regex: /\bZend_Loader::loadClass\(\s*(['"])([^'"]+)\1\s*\)/g,
    via: 'Zend_Loader::loadClass',
    resolveTarget: resolveGenericPhpTarget,
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
    return symbols
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
    parse('php', content).root()

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
   * Extracts `use` declarations from a PHP file.
   * @param _filePath - Unused source file path.
   * @param content - PHP source text.
   * @returns Parsed import declarations.
   */
  extractImportedNames(_filePath: string, content: string): ImportDeclaration[] {
    ensureLanguagesRegistered()
    const root = parse('php', content).root()
    const results: ImportDeclaration[] = []
    this.walkForUseDeclarations(root, results)
    return results
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
    for (const child of node.children()) {
      switch (nodeKind(child)) {
        case 'function_definition': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Function, child, extractComment(child))
          break
        }
        case 'class_declaration': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Class, child, extractComment(child))
          this.walkClassBody(child, addSymbol)
          break
        }
        case 'interface_declaration': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Interface, child, extractComment(child))
          this.walkClassBody(child, addSymbol)
          break
        }
        case 'enum_declaration': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Enum, child, extractComment(child))
          break
        }
        case 'trait_declaration': {
          const name = child.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Type, child, extractComment(child))
          this.walkClassBody(child, addSymbol)
          break
        }
        case 'const_declaration': {
          for (const constChild of child.children()) {
            if (nodeKind(constChild) !== 'const_element') continue
            const nameNode = constChild.child(0)
            if (nameNode && nodeKind(nameNode) === 'name') {
              addSymbol(nameNode.text(), SymbolKind.Variable, constChild, extractComment(child))
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
    for (const child of classNode.children()) {
      if (nodeKind(child) !== 'declaration_list') continue
      for (const member of child.children()) {
        if (nodeKind(member) === 'method_declaration') {
          const name = member.field('name')?.text()
          if (name) addSymbol(name, SymbolKind.Method, member, extractComment(member))
        } else if (nodeKind(member) === 'property_declaration') {
          for (const propChild of member.children()) {
            if (nodeKind(propChild) !== 'property_element') continue
            const varName = propChild.field('name')
            if (!varName) continue
            const name = varName.text().replace(/^\$/, '')
            if (name) addSymbol(name, SymbolKind.Variable, member, extractComment(member))
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
        const key = `${binding.via}:${binding.value}:${binding.targetPath ?? 'unresolved'}`
        if (seen.has(key)) continue
        seen.add(key)
        bindings.push(binding)
      }
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
        aliasNames: defaultAliasNames(value),
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
        for (const binding of bindings) {
          if (!binding.targetPath) continue
          if (!bindingAppearsInScope(scopeText, binding)) continue
          for (const alias of binding.aliasNames) {
            aliases.set(alias, binding.targetPath)
          }
        }

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
