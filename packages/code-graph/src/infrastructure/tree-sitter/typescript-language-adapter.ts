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
import {
  type FileAnalysisDraft,
  type FileAnalysis,
} from '../../domain/value-objects/file-analysis.js'
import { type IndexSession } from '../../domain/value-objects/index-session.js'

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
  readonly extendsNames: readonly string[]
  readonly implementsNames: readonly string[]
}

/**
 * Parser state representation for TypeScript.
 */
interface TypeScriptParserState {
  readonly kind: 'ts'
  readonly exportedNames: readonly string[]
  readonly declarations: readonly TsTypeDeclarationInfo[]
}

/**
 * Language adapter for TypeScript, TSX, JavaScript, and JSX files.
 * Uses tree-sitter via ast-grep to extract symbols and relations from source code.
 */
export class TypeScriptLanguageAdapter implements LanguageAdapter {
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

    const allNodes: SgNode[] = []
    const targetKinds = new Set([
      'function_declaration',
      'class_declaration',
      'abstract_class_declaration',
      'method_definition',
      'type_alias_declaration',
      'interface_declaration',
      'enum_declaration',
      'lexical_declaration',
      'variable_declaration',
      'export_statement',
    ])
    collectByKind(root, targetKinds, allNodes)

    for (const node of allNodes) {
      switch (nodeKind(node)) {
        case 'function_declaration': {
          const name = getName(node)
          if (name) addSymbol(name, SymbolKind.Function, node, extractComment(node))
          break
        }
        case 'class_declaration':
        case 'abstract_class_declaration': {
          const name = getName(node)
          if (name) addSymbol(name, SymbolKind.Class, node, extractComment(node))
          break
        }
        case 'method_definition': {
          const name = getName(node)
          if (name) addSymbol(name, SymbolKind.Method, node, extractComment(node))
          break
        }
        case 'type_alias_declaration': {
          const name = getName(node)
          if (name) addSymbol(name, SymbolKind.Type, node, extractComment(node))
          break
        }
        case 'interface_declaration': {
          const name = getName(node)
          if (name) addSymbol(name, SymbolKind.Interface, node, extractComment(node))
          break
        }
        case 'enum_declaration': {
          const name = getName(node)
          if (name) addSymbol(name, SymbolKind.Enum, node, extractComment(node))
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
      }
    }

    const imports = this.extractImportedNamesFromData(content, root)
    const bindingFacts = this.extractBindingFactsFromData(filePath, content, symbols, imports)
    const callFacts = this.extractCallFactsFromData(filePath, content, symbols)

    const declarations = this.collectTypeDeclarations(root, symbols)
    const exportedNames = new Set<string>()

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
              if (nameNode) exportedNames.add(nameNode.text())
            }
          }
        }
      }
    }

    return {
      language:
        lang === Lang.TypeScript
          ? 'typescript'
          : lang === Lang.Tsx
            ? 'tsx'
            : lang === Lang.JavaScript
              ? 'javascript'
              : 'jsx',
      symbols,
      imports,
      bindingFacts,
      callFacts,
      parserState: {
        kind: 'typescript',
        declarations,
        exportedNames: [...exportedNames],
      },
    }
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
          const target = session
            .findSymbolsByFile(candidatePath)
            .find((s) => s.name === imp.originalName)
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
      for (const parentName of declaration.extendsNames) {
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

      for (const contractName of declaration.implementsNames) {
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
  private processVariableDeclaration(
    node: SgNode,
    filePath: string,
    addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
  ): void {
    for (const child of node.children()) {
      if (nodeKind(child) !== 'variable_declarator') continue
      const nameNode = child.field('name')
      if (!nameNode) continue
      const name = nameNode.text()

      const valueNode = child.field('value')
      if (
        valueNode &&
        (nodeKind(valueNode) === 'arrow_function' || nodeKind(valueNode) === 'function')
      ) {
        addSymbol(name, SymbolKind.Function, child, extractComment(child))
      }
    }
  }

  /**
   * Processes an exported variable declaration, extracting both function-assigned and plain variable symbols.
   * @param node - The variable declaration AST node inside an export statement.
   * @param filePath - Path to the source file.
   * @param addSymbol - Callback to register a discovered symbol.
   */
  private processExportedVariableDeclaration(
    node: SgNode,
    filePath: string,
    addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
  ): void {
    for (const child of node.children()) {
      if (nodeKind(child) !== 'variable_declarator') continue
      const nameNode = child.field('name')
      if (!nameNode) continue
      const name = nameNode.text()

      const valueNode = child.field('value')
      if (
        valueNode &&
        (nodeKind(valueNode) === 'arrow_function' || nodeKind(valueNode) === 'function')
      ) {
        addSymbol(name, SymbolKind.Function, child, extractComment(child))
      } else {
        addSymbol(name, SymbolKind.Variable, child, extractComment(child))
      }
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

    for (const node of nodes) {
      const name = getName(node)
      if (!name) continue

      const lineStart = node.range().start.line + 1
      const lineEnd = node.range().end.line + 1
      const symbolId = symbols.find(
        (symbol) =>
          symbol.name === name &&
          symbol.line === lineStart &&
          (symbol.kind === SymbolKind.Class || symbol.kind === SymbolKind.Interface),
      )?.id
      if (!symbolId) continue

      const header = node.text().split('{')[0] ?? node.text()
      const extendsMatch = header.match(/\bextends\s+([^{]+?)(?:\bimplements\b|$)/)
      const implementsMatch = header.match(/\bimplements\s+([^{]+)$/)
      const methodsByName: Record<string, string> = {}

      for (const symbol of symbols) {
        if (symbol.kind !== SymbolKind.Method) continue
        if (symbol.line <= lineStart || symbol.line > lineEnd) continue
        methodsByName[symbol.name] = symbol.id
      }

      declarations.push({
        name,
        symbolId,
        methodsByName,
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
