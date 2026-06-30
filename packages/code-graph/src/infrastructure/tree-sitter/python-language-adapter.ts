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
  const block = node.parent()
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
 * Represents a Python class declaration and the methods defined within it.
 */
interface PythonClassInfo {
  readonly name: string
  readonly symbolId: string
  readonly kind: 'class' | 'interface'
  readonly baseNames: readonly string[]
  readonly methodsByName: ReadonlyMap<string, string>
}

/**
 * Serialized Python class info for parser state.
 */
interface SerializedPythonClassInfo {
  readonly name: string
  readonly symbolId: string
  readonly kind: 'class' | 'interface'
  readonly baseNames: readonly string[]
  readonly methodsByName: Record<string, string>
}

/**
 * Parser state representation for Python.
 */
interface PythonParserState {
  readonly kind: 'python'
  readonly classes: readonly SerializedPythonClassInfo[]
}

/**
 * Language adapter for Python files using tree-sitter via ast-grep.
 * Extracts functions, classes, methods, and module-level assignments.
 */
export class PythonLanguageAdapter implements LanguageAdapter {
  /**
   * Resolves a qualified name to a file path.
   * @param _qualifiedName - Qualified name.
   * @param _codeRoot - Code root.
   * @param _repoRoot - Repo root.
   * @returns The resolved file path, or undefined.
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
   * @returns An array containing 'python'.
   */
  languages(): string[] {
    return ['python']
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

    this.walk(root, addSymbol)

    // Extract imports
    const imports: ImportDeclaration[] = []
    const seenImport = new Set<string>()
    const addImport = (declaration: ImportDeclaration): void => {
      const key = `${declaration.kind ?? ImportDeclarationKind.Named}:${declaration.localName}:${declaration.originalName}:${declaration.specifier}`
      if (seenImport.has(key)) return
      seenImport.add(key)
      imports.push(declaration)
    }

    for (const child of root.children()) {
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

    const literalDynamicImportPattern =
      /\b(?:importlib\.import_module|__import__)\s*\(\s*(['"])([^'"]+)\1/g
    for (const match of content.matchAll(literalDynamicImportPattern)) {
      const specifier = match[2]
      if (specifier !== undefined) {
        addImport({
          originalName: '',
          localName: '',
          specifier,
          isRelative: specifier.startsWith('.'),
          kind: ImportDeclarationKind.Dynamic,
        })
      }
    }

    const bindingFacts = this.extractBindingFactsFromData(filePath, content, symbols, imports)
    const callFacts = this.extractCallFactsFromData(filePath, content, symbols)

    const classes = this.collectClassInfo(content, filePath, symbols)
    const serializedClasses = classes.map((cls) => {
      const methodsByName: Record<string, string> = {}
      for (const [mName, mId] of cls.methodsByName.entries()) {
        methodsByName[mName] = mId
      }
      return {
        ...cls,
        methodsByName,
      }
    })

    return {
      language: 'python',
      symbols,
      imports,
      bindingFacts,
      callFacts,
      parserState: {
        kind: 'python',
        classes: serializedClasses,
      },
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

    for (const imp of analysis.imports) {
      if (imp.isRelative && imp.specifier.startsWith('.')) {
        const resolved = this.resolveRelativeImportPath(analysis.filePath, imp.specifier)
        const target = Array.isArray(resolved) ? resolved[0]! : resolved
        if (target) {
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
    }

    const pythonState = analysis.parserState as PythonParserState | undefined
    const classes = pythonState?.classes ?? []
    const classesByName = new Map<string, SerializedPythonClassInfo>(
      classes.map((entry) => [entry.name, entry]),
    )
    const seen = new Set<string>()

    for (const cls of classes) {
      for (const baseName of cls.baseNames) {
        const importedId = context.resolvedImports.importMap.get(baseName)
        const localBase = classesByName.get(baseName)
        const targetId = importedId ?? localBase?.symbolId
        if (!targetId) continue

        const isInterfaceTarget =
          localBase?.kind === SymbolKind.Interface || importedId?.includes(':interface:')
        const relationType = isInterfaceTarget ? RelationType.Implements : RelationType.Extends
        const hierarchyKey = `${cls.symbolId}:${relationType}:${targetId}`
        if (!seen.has(hierarchyKey)) {
          seen.add(hierarchyKey)
          relations.push(
            createRelation({
              source: cls.symbolId,
              target: targetId,
              type: relationType,
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
        const isAttributeCall = call.form === CallForm.Member
        const calleeId =
          importedId ??
          this.resolveLocalCallee(
            call.location.line,
            calleeName,
            localSymbolsByName,
            isAttributeCall,
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

    return relations
  }

  /**
   * Resolves local callee symbol ID.
   * @param callLine - Line of the call.
   * @param name - Name of the symbol.
   * @param candidates - Map of candidates.
   * @param isAttributeCall - True if it's an attribute call.
   * @returns Callee ID, or undefined.
   */
  private resolveLocalCallee(
    callLine: number,
    name: string,
    candidates: Map<string, SymbolNode[]>,
    isAttributeCall: boolean,
  ): string | undefined {
    const allSyms = candidates.get(name)
    if (!allSyms || allSyms.length === 0) return undefined

    const syms = isAttributeCall ? allSyms : allSyms.filter((s) => s.kind !== 'method')
    if (syms.length === 0) return undefined
    if (syms.length === 1) return syms[0]!.id

    let best: SymbolNode | undefined
    for (const s of syms) {
      if (s.line <= callLine) {
        if (!best || s.line > best.line) {
          best = s
        }
      }
    }
    return best?.id ?? syms[0]!.id
  }

  /**
   * Collects class info from Python content.
   * @param content - Python source content.
   * @param filePath - Path of the file.
   * @param symbols - Extracted symbols array.
   * @returns Array of class info.
   */
  private collectClassInfo(
    content: string,
    filePath: string,
    symbols: SymbolNode[],
  ): PythonClassInfo[] {
    const infos: PythonClassInfo[] = []
    const classRegex = /^class\s+([A-Za-z_][A-Za-z0-9_]*)(?:\(([^)]*)\))?:/gm
    const symbolMap = new Map(
      symbols
        .filter((symbol) => symbol.filePath === filePath)
        .map((symbol) => [`${symbol.kind}:${symbol.name}:${symbol.line}`, symbol.id]),
    )
    const lines = content.split('\n')

    for (const match of content.matchAll(classRegex)) {
      const name = match[1]
      if (!name) continue
      const line = content.slice(0, match.index ?? 0).split('\n').length
      const symbolId = symbolMap.get(`${SymbolKind.Class}:${name}:${line}`)
      if (!symbolId) continue

      const headerLine = lines[line - 1] ?? ''
      const indent = headerLine.match(/^\s*/)?.[0].length ?? 0
      let endLine = lines.length
      for (let idx = line; idx < lines.length; idx++) {
        const current = lines[idx] ?? ''
        if (current.trim().length === 0) continue
        const currentIndent = current.match(/^\s*/)?.[0].length ?? 0
        if (currentIndent <= indent) {
          endLine = idx
          break
        }
      }

      const methodsByName = new Map<string, string>()
      for (const symbol of symbols) {
        if (symbol.filePath !== filePath || symbol.kind !== SymbolKind.Method) continue
        if (symbol.line <= line || symbol.line > endLine) continue
        methodsByName.set(symbol.name, symbol.id)
      }

      const baseNames = (match[2] ?? '')
        .split(',')
        .map((entry) => normalizePythonTypeName(entry))
        .filter((entry) => entry.length > 0)

      infos.push({
        name,
        symbolId,
        kind: baseNames.includes('Protocol') ? SymbolKind.Interface : SymbolKind.Class,
        baseNames,
        methodsByName,
      })
    }

    return infos
  }

  /**
   * Extracts binding facts from Python content.
   * @param filePath - Path of the file.
   * @param content - Python source content.
   * @param symbols - Extracted symbols array.
   * @param imports - Extracted imports array.
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
      addFact(
        declaration.localName,
        BindingSourceKind.ImportedType,
        normalizePythonTypeName(declaration.originalName),
        0,
      )
    }

    for (const symbol of symbols) {
      if (symbol.kind === SymbolKind.Method) {
        const receiverName = symbol.name === '__new__' ? 'cls' : 'self'
        addFact(receiverName, BindingSourceKind.Receiver, undefined, 0)
      }
    }

    const annotationPattern = /\b([A-Za-z_]\w*)\s*:\s*([A-Za-z_][\w.]*)/g
    for (const match of content.matchAll(annotationPattern)) {
      const name = match[1]
      const targetName = match[2]
      if (name === undefined || targetName === undefined) continue
      addFact(
        name,
        BindingSourceKind.Parameter,
        normalizePythonTypeName(targetName),
        match.index ?? 0,
      )
    }

    const returnPattern = /->\s*([A-Za-z_][\w.]*)/g
    for (const match of content.matchAll(returnPattern)) {
      const targetName = match[1]
      if (targetName === undefined) continue
      addFact(
        normalizePythonTypeName(targetName),
        BindingSourceKind.ReturnType,
        normalizePythonTypeName(targetName),
        match.index ?? 0,
      )
    }

    const aliasPattern = /\b([A-Za-z_]\w*)\s*=\s*([A-Z][A-Za-z_]\w*)\s*\(/g
    for (const match of content.matchAll(aliasPattern)) {
      const name = match[1]
      const targetName = match[2]
      if (name === undefined || targetName === undefined) continue
      addFact(name, BindingSourceKind.ConstructorCall, targetName, match.index ?? 0)
    }

    const typeAliasPattern =
      /\b([A-Za-z_]\w*)\s*(?::\s*TypeAlias\s*)?=\s*(?:typing\.)?(?:Dict|List|Tuple|Set|FrozenSet|Sequence|Mapping|MutableMapping|Optional|Union|Callable|Final|Literal|Type)\b\[([^\]]+)\]/g
    for (const match of content.matchAll(typeAliasPattern)) {
      const aliasName = match[1]
      const rhsText = match[2]
      if (aliasName === undefined || rhsText === undefined) continue
      if (aliasName.length > 0 && aliasName[0] === aliasName[0]!.toUpperCase()) {
        const identPattern = /[A-Z][A-Za-z_]\w*/g
        for (const refMatch of rhsText.matchAll(identPattern)) {
          const targetName = refMatch[0]
          if (targetName === undefined || targetName === aliasName) continue
          addFact(
            aliasName,
            BindingSourceKind.ImportedType,
            normalizePythonTypeName(targetName),
            match.index ?? 0,
          )
        }
      }
    }

    const simpleTypeAliasPattern =
      /\b([A-Z][A-Za-z_]\w*)\s*(?::\s*TypeAlias\s*)?=\s*([A-Z][A-Za-z_]\w*)\s*$/gm
    for (const match of content.matchAll(simpleTypeAliasPattern)) {
      const aliasName = match[1]
      const targetName = match[2]
      if (aliasName === undefined || targetName === undefined) continue
      if (aliasName === targetName) continue
      addFact(
        aliasName,
        BindingSourceKind.ImportedType,
        normalizePythonTypeName(targetName),
        match.index ?? 0,
      )
    }

    return facts
  }

  /**
   * Extracts call facts from Python content.
   * @param filePath - Path of the file.
   * @param content - Python source content.
   * @param symbols - Extracted symbols array.
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

    const memberPattern = /\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(/g
    for (const match of content.matchAll(memberPattern)) {
      const receiver = match[1]
      const name = match[2]
      if (receiver === undefined || name === undefined || receiver === 'importlib') continue
      addFact(CallForm.Member, name, receiver, match.index ?? 0)
    }

    const freePattern = /(?<![.\w])([A-Za-z_]\w*)\s*\(/g
    for (const match of content.matchAll(freePattern)) {
      const name = match[1]
      if (
        name === undefined ||
        ['def', 'class', 'if', 'for', 'while', 'return', 'getattr', '__import__'].includes(name)
      ) {
        continue
      }
      addFact(
        /^[A-Z]/.test(name) ? CallForm.Constructor : CallForm.Free,
        name,
        undefined,
        match.index ?? 0,
      )
    }

    return facts
  }

  /**
   * Recursively walks the AST to extract symbols.
   * @param node - The current AST node.
   * @param addSymbol - Callback to register a discovered symbol.
   */
  private walk(
    node: SgNode,
    addSymbol: (name: string, kind: SymbolKind, node: SgNode, comment: string | undefined) => void,
  ): void {
    for (const child of node.children()) {
      const kind = nodeKind(child)

      switch (kind) {
        case 'function_definition': {
          const name = child.field('name')?.text()
          if (name) {
            const symKind = isMethod(child) ? SymbolKind.Method : SymbolKind.Function
            addSymbol(name, symKind, child, extractComment(child))
          }
          break
        }
        case 'class_definition': {
          const name = child.field('name')?.text()
          if (name) {
            addSymbol(name, SymbolKind.Class, child, extractComment(child))
          }
          // Walk into class body (block) for methods
          this.walk(child, addSymbol)
          break
        }
        case 'block': {
          // Recurse into block to find methods inside class bodies
          this.walk(child, addSymbol)
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
                addSymbol(left.text(), SymbolKind.Variable, child, extractComment(child))
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
  resolveRelativeImportPath(fromFile: string, specifier: string): string | string[] {
    // Separate workspace prefix (e.g. "core:src/models/user.py" → "core:", "src/models/user.py")
    const colonIdx = fromFile.indexOf(':')
    const wsPrefix = colonIdx === -1 ? '' : fromFile.substring(0, colonIdx + 1)
    const relFile = colonIdx === -1 ? fromFile : fromFile.substring(colonIdx + 1)

    const relDir = relFile.substring(0, relFile.lastIndexOf('/'))
    const segments = relDir ? relDir.split('/') : []

    // Count leading dots: first dot = current dir, each extra dot = go up
    let dots = 0
    while (dots < specifier.length && specifier[dots] === '.') dots++

    // Go up (dots - 1) levels: first dot is the relative marker (current dir)
    for (let i = 1; i < dots; i++) {
      if (segments.length > 0) segments.pop()
    }

    // Remaining part after the dots is the module path
    const modulePart = specifier.substring(dots)
    if (modulePart) {
      for (const part of modulePart.split('.')) {
        segments.push(part)
      }
    }

    // If there's no module part after dots, this is a package-level import (e.g. `from . import X`)
    // which refers to the __init__.py in the resolved directory
    if (!modulePart) {
      return wsPrefix + segments.join('/') + '/__init__.py'
    }
    const base = wsPrefix + segments.join('/')
    return [base + '.py', base + '/__init__.py']
  }

  /**
   * Resolves a Python import specifier to a known package.
   * Normalizes hyphens and underscores for matching.
   * @param specifier - The import specifier (e.g. `acme_auth.models`).
   * @param knownPackages - Known package names from `pyproject.toml`.
   * @returns The matching package name, or undefined.
   */
  resolvePackageFromSpecifier(specifier: string, knownPackages: string[]): string | undefined {
    if (!specifier) return undefined
    const topLevel = specifier.split('.')[0]
    if (!topLevel) return undefined
    const normalized = topLevel.replaceAll('_', '-')
    return knownPackages.find((pkg) => pkg.replaceAll('_', '-') === normalized)
  }

  /**
   * Reads the package identity by searching for `pyproject.toml` at or above
   * the given directory, bounded by the repository root.
   * @param codeRoot - Absolute path to the workspace's code root.
   * @param repoRoot - Optional repository root to bound the search.
   * @returns The project name from the nearest `pyproject.toml`, or undefined.
   */
  getPackageIdentity(codeRoot: string, repoRoot?: string): string | undefined {
    return findManifestField(
      codeRoot,
      'pyproject.toml',
      (content) => {
        const match = content.match(/^\s*name\s*=\s*"([^"]+)"/m)
        return match?.[1]
      },
      repoRoot,
    )
  }
}
