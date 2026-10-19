import { describe, expect, it } from 'vitest'
import {
  buildScopedBindingEnvironment,
  resolveDependencyFacts,
  type SymbolLookup,
} from '../../../src/domain/services/scoped-binding-environment.js'
import {
  BindingSourceKind,
  type BindingFact,
} from '../../../src/domain/value-objects/binding-fact.js'
import { CallForm, type CallFact } from '../../../src/domain/value-objects/call-fact.js'
import { ImportDeclarationKind } from '../../../src/domain/value-objects/import-declaration-kind.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { createSymbolNode, type SymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { type FileAnalysis } from '../../../src/domain/value-objects/file-analysis.js'

const filePath = 'code-graph:src/service.ts'

function location(line: number): BindingFact['location'] {
  return { filePath, line, column: 0, endLine: undefined, endColumn: undefined }
}

function fact(name: string, targetName: string, scopeId: string): BindingFact {
  return {
    name,
    filePath,
    scopeId,
    sourceKind: BindingSourceKind.Parameter,
    location: location(3),
    targetName,
    targetSymbolId: undefined,
    targetFilePath: undefined,
    metadata: undefined,
  }
}

function lookup(symbols: readonly SymbolNode[]): SymbolLookup {
  return {
    findByName: (name, filePrefix) =>
      symbols.filter(
        (symbol) =>
          symbol.name === name &&
          (filePrefix === undefined || symbol.filePath.startsWith(filePrefix)),
      ),
    findByFile: (targetFilePath) => symbols.filter((symbol) => symbol.filePath === targetFilePath),
  }
}

function mockAnalysis(params: {
  symbols?: readonly SymbolNode[]
  facts?: readonly BindingFact[]
  callFacts?: readonly CallFact[]
  imports?: FileAnalysis['imports']
}): FileAnalysis {
  return {
    language: 'ts',
    fileId: 1,
    filePath,
    contentHash: 'hash',
    workspace: 'default',
    projectRelativePath: 'service.ts',
    symbols: params.symbols ?? [],
    imports: params.imports ?? [],
    bindingFacts: params.facts ?? [],
    callFacts: params.callFacts ?? [],
  }
}

describe('scoped binding environment', () => {
  it('drops ambiguous equal-confidence bindings', () => {
    const environment = buildScopedBindingEnvironment({
      analysis: mockAnalysis({
        facts: [fact('repo', 'OuterRepo', filePath)],
      }),
      importMap: new Map(),
      symbolLookup: lookup([]),
    })

    expect(environment.lookup('repo', filePath)[0]?.targetName).toBe('OuterRepo')

    const ambiguous = buildScopedBindingEnvironment({
      analysis: mockAnalysis({
        facts: [fact('service', 'A', filePath), fact('service', 'B', filePath)],
      }),
      importMap: new Map(),
      symbolLookup: lookup([]),
    })
    expect(ambiguous.lookup('service', filePath)).toHaveLength(0)
  })

  it('does not treat a drive letter as a workspace prefix', () => {
    const drivePath = 'C:/repo/src/a.ts'
    const target = createSymbolNode({
      name: 'Widget',
      kind: SymbolKind.Function,
      filePath: drivePath,
      line: 1,
      column: 0,
    })
    const prefixes: Array<string | undefined> = []
    const environment = buildScopedBindingEnvironment({
      analysis: mockAnalysis({
        facts: [{ ...fact('widget', 'Widget', filePath), filePath: drivePath }],
      }),
      importMap: new Map(),
      symbolLookup: {
        findByName: (name, filePrefix) => {
          prefixes.push(filePrefix)
          return name === 'Widget' ? [target] : []
        },
        findByFile: () => [],
      },
    })

    const binding = environment.lookup('widget', filePath)[0]
    expect(environment.resolveTargetSymbol(binding!)).toBe(target)
    expect(prefixes).toContain(undefined)
    expect(prefixes).not.toContain('C:')
  })

  describe('call targets resolve only through imports or the same file', () => {
    const caller = createSymbolNode({
      name: 'run',
      kind: SymbolKind.Function,
      filePath,
      line: 1,
      column: 0,
      endLine: 6,
      endColumn: 1,
    })
    const callTo = (name: string, form: CallForm): CallFact => ({
      filePath,
      scopeId: filePath,
      callerSymbolId: caller.id,
      form,
      name,
      receiverName: undefined,
      targetName: name,
      arity: undefined,
      location: location(2),
      metadata: undefined,
    })
    const resolveCall = (
      callFact: CallFact,
      symbols: readonly SymbolNode[],
    ): ReturnType<typeof resolveDependencyFacts> => {
      const symbolLookup = lookup([caller, ...symbols])
      const analysis = mockAnalysis({ symbols: [caller], facts: [], callFacts: [callFact] })
      const environment = buildScopedBindingEnvironment({
        analysis,
        importMap: new Map(),
        symbolLookup,
      })
      return resolveDependencyFacts({ environment, analysis, symbolLookup })
    }
    const otherFileSymbol = (name: string, kind: SymbolKind): SymbolNode =>
      createSymbolNode({
        name,
        kind,
        filePath: 'code-graph:src/other.ts',
        line: 1,
        column: 0,
      })

    it('emits nothing for an unimported save() declared in another file', () => {
      const resolved = resolveCall(callTo('save', CallForm.Free), [
        otherFileSymbol('save', SymbolKind.Function),
      ])
      expect(resolved).toEqual([])
    })

    it('emits nothing for an unimported helper() declared in another file', () => {
      const resolved = resolveCall(callTo('helper', CallForm.Free), [
        otherFileSymbol('helper', SymbolKind.Function),
      ])
      expect(resolved).toEqual([])
    })

    it('emits nothing for new Thing() when Thing is declared in another file', () => {
      const resolved = resolveCall(callTo('Thing', CallForm.Constructor), [
        otherFileSymbol('Thing', SymbolKind.Class),
      ])
      expect(resolved).toEqual([])
    })

    it('resolves a call to an imported name even when the adapter also emitted an unresolved import binding', () => {
      const imported = otherFileSymbol('helper', SymbolKind.Function)
      const unresolvedImport: BindingFact = {
        ...fact('helper', 'helper', filePath),
        sourceKind: BindingSourceKind.ImportedType,
      }
      const symbolLookup = lookup([caller, imported])
      const analysis = mockAnalysis({
        symbols: [caller],
        facts: [unresolvedImport],
        callFacts: [callTo('helper', CallForm.Free)],
        imports: [
          {
            originalName: 'helper',
            localName: 'helper',
            specifier: './other.js',
            isRelative: true,
            kind: ImportDeclarationKind.Named,
          },
        ],
      })
      const environment = buildScopedBindingEnvironment({
        analysis,
        importMap: new Map([['helper', imported.id]]),
        symbolLookup,
      })

      const resolved = resolveDependencyFacts({ environment, analysis, symbolLookup })

      expect(
        resolved.filter((dependency) => dependency.relationType === RelationType.Calls),
      ).toEqual([
        expect.objectContaining({ sourceSymbolId: caller.id, targetSymbolId: imported.id }),
      ])
    })

    it('still resolves a free call to a top-level function of the same file', () => {
      const helper = createSymbolNode({
        name: 'helper',
        kind: SymbolKind.Function,
        filePath,
        line: 8,
        column: 0,
      })
      const resolved = resolveCall(callTo('helper', CallForm.Free), [helper])
      expect(resolved).toHaveLength(1)
      expect(resolved[0]).toMatchObject({
        sourceSymbolId: caller.id,
        targetSymbolId: helper.id,
        relationType: RelationType.Calls,
      })
    })
  })

  it('given a type binding after a declaration has ended, when dependencies resolve, then the preceding declaration is not guessed as its source', () => {
    const earlier = createSymbolNode({
      name: 'earlier',
      kind: SymbolKind.Function,
      filePath,
      line: 1,
      column: 0,
      endLine: 2,
      endColumn: 1,
    })
    const target = createSymbolNode({
      name: 'TemplateExpander',
      kind: SymbolKind.Class,
      filePath,
      line: 9,
      column: 0,
    })
    const symbols = [earlier, target]
    const symbolLookup = lookup(symbols)
    // The fact is located on line 3, outside every declaration's range.
    const analysis = mockAnalysis({
      symbols,
      facts: [fact('expander', 'TemplateExpander', filePath)],
    })
    const environment = buildScopedBindingEnvironment({
      analysis,
      importMap: new Map(),
      symbolLookup,
    })

    const resolved = resolveDependencyFacts({ environment, analysis, symbolLookup })

    expect(resolved).toEqual([])
  })

  it('resolves constructor and type facts into distinct dependency relations', () => {
    const source = createSymbolNode({
      name: 'create',
      kind: SymbolKind.Function,
      filePath,
      line: 1,
      column: 0,
      endLine: 4,
      endColumn: 1,
    })
    const target = createSymbolNode({
      name: 'TemplateExpander',
      kind: SymbolKind.Class,
      filePath,
      line: 5,
      column: 0,
    })
    const typeFact = fact('expander', 'TemplateExpander', filePath)
    const callFact: CallFact = {
      filePath,
      scopeId: filePath,
      callerSymbolId: source.id,
      form: CallForm.Constructor,
      name: 'TemplateExpander',
      receiverName: undefined,
      targetName: 'TemplateExpander',
      arity: undefined,
      location: location(2),
      metadata: undefined,
    }
    const symbols = [source, target]
    const symbolLookup = lookup(symbols)
    const analysis = mockAnalysis({
      symbols,
      facts: [typeFact],
      callFacts: [callFact],
    })
    const environment = buildScopedBindingEnvironment({
      analysis,
      importMap: new Map(),
      symbolLookup,
    })

    const resolved = resolveDependencyFacts({
      environment,
      analysis,
      symbolLookup,
    })

    expect(resolved.map((dependency) => dependency.relationType).sort()).toEqual([
      RelationType.Constructs,
      RelationType.UsesType,
    ])
  })

  it('drops self-relations from resolved dependency facts', () => {
    const selfSymbol = createSymbolNode({
      name: 'TemplateExpander',
      kind: SymbolKind.Class,
      filePath,
      line: 1,
      column: 0,
    })
    const typeFact = fact('self', 'TemplateExpander', filePath)
    const callFact: CallFact = {
      filePath,
      scopeId: filePath,
      callerSymbolId: selfSymbol.id,
      form: CallForm.Constructor,
      name: 'TemplateExpander',
      receiverName: undefined,
      targetName: 'TemplateExpander',
      arity: undefined,
      location: location(2),
      metadata: undefined,
    }
    const symbols = [selfSymbol]
    const symbolLookup = lookup(symbols)
    const analysis = mockAnalysis({
      symbols,
      facts: [typeFact],
      callFacts: [callFact],
    })
    const environment = buildScopedBindingEnvironment({
      analysis,
      importMap: new Map(),
      symbolLookup,
    })

    const resolved = resolveDependencyFacts({
      environment,
      analysis,
      symbolLookup,
    })

    expect(resolved).toHaveLength(0)
  })

  it('detects circular parentId scope references and terminates without crashing', () => {
    const symbolA = createSymbolNode({
      name: 'ScopeA',
      kind: SymbolKind.Class,
      filePath,
      line: 10,
      column: 0,
      endLine: 20,
      endColumn: 1,
      parentId: `${filePath}:class:ScopeB:30:0`,
    })
    const symbolB = createSymbolNode({
      name: 'ScopeB',
      kind: SymbolKind.Class,
      filePath,
      line: 30,
      column: 0,
      endLine: 40,
      endColumn: 1,
      parentId: symbolA.id,
    })

    const symbols = [symbolA, symbolB]
    const symbolLookup = lookup(symbols)
    const analysis = mockAnalysis({ symbols })

    const environment = buildScopedBindingEnvironment({
      analysis,
      importMap: new Map(),
      symbolLookup,
    })

    const facts = environment.lookup('nonExistentBinding', symbolA.id)
    expect(facts).toEqual([])

    const callFact: CallFact = {
      filePath,
      scopeId: symbolA.id,
      callerSymbolId: symbolA.id,
      form: CallForm.Member,
      name: 'method',
      receiverName: 'nonExistentReceiver',
      targetName: 'method',
      arity: undefined,
      location: location(15),
      metadata: undefined,
    }
    const receiverFacts = environment.resolveReceiver(callFact)
    expect(receiverFacts).toEqual([])
  })

  it('does not fall back to nearest preceding symbol when call callerSymbolId is undefined', () => {
    const preceding = createSymbolNode({
      name: 'precedingFn',
      kind: SymbolKind.Function,
      filePath,
      line: 1,
      column: 0,
    })
    const target = createSymbolNode({
      name: 'TargetClass',
      kind: SymbolKind.Class,
      filePath,
      line: 10,
      column: 0,
    })
    const callFact: CallFact = {
      filePath,
      scopeId: filePath,
      callerSymbolId: undefined,
      form: CallForm.Constructor,
      name: 'TargetClass',
      receiverName: undefined,
      targetName: 'TargetClass',
      arity: undefined,
      location: location(5),
      metadata: undefined,
    }
    const symbols = [preceding, target]
    const symbolLookup = lookup(symbols)
    const analysis = mockAnalysis({ symbols, callFacts: [callFact] })
    const environment = buildScopedBindingEnvironment({
      analysis,
      importMap: new Map(),
      symbolLookup,
    })

    const resolved = resolveDependencyFacts({
      environment,
      analysis,
      symbolLookup,
    })

    expect(resolved).toEqual([])
  })

  it('drops top-level initializer calls and multiline calls when caller containment is absent', () => {
    const precedingFunc = createSymbolNode({
      name: 'precedingFunc',
      kind: SymbolKind.Function,
      filePath,
      line: 1,
      column: 0,
      endLine: 4,
      endColumn: 1,
    })
    const adjacentFunc = createSymbolNode({
      name: 'adjacentFunc',
      kind: SymbolKind.Function,
      filePath,
      line: 12,
      column: 0,
      endLine: 16,
      endColumn: 1,
    })
    const targetClass = createSymbolNode({
      name: 'TargetService',
      kind: SymbolKind.Class,
      filePath,
      line: 20,
      column: 0,
    })

    // Top-level variable initializer call at line 6 (between precedingFunc and adjacentFunc)
    const initializerCall: CallFact = {
      filePath,
      scopeId: filePath,
      callerSymbolId: undefined,
      form: CallForm.Constructor,
      name: 'TargetService',
      receiverName: undefined,
      targetName: 'TargetService',
      arity: undefined,
      location: { filePath, line: 6, column: 12 },
      metadata: undefined,
    }

    // Multiline call at lines 8-10 (outside any callable)
    const multilineCall: CallFact = {
      filePath,
      scopeId: filePath,
      callerSymbolId: undefined,
      form: CallForm.Constructor,
      name: 'TargetService',
      receiverName: undefined,
      targetName: 'TargetService',
      arity: undefined,
      location: { filePath, line: 8, column: 0, endLine: 10, endColumn: 2 },
      metadata: undefined,
    }

    const symbols = [precedingFunc, adjacentFunc, targetClass]
    const symbolLookup = lookup(symbols)
    const analysis = mockAnalysis({
      symbols,
      callFacts: [initializerCall, multilineCall],
    })
    const environment = buildScopedBindingEnvironment({
      analysis,
      importMap: new Map(),
      symbolLookup,
    })

    const resolved = resolveDependencyFacts({
      environment,
      analysis,
      symbolLookup,
    })

    // Missing containment must create no guessed relation
    expect(resolved).toEqual([])
  })

  it('ensures local variables never usurp enclosing callable as dependency relation source', () => {
    const enclosingFunc = createSymbolNode({
      name: 'enclosingFunc',
      kind: SymbolKind.Function,
      filePath,
      line: 10,
      column: 0,
      endLine: 25,
      endColumn: 1,
    })
    const localVariable = createSymbolNode({
      name: 'localVar',
      kind: SymbolKind.Variable,
      filePath,
      line: 12,
      column: 4,
      endLine: 12,
      endColumn: 18,
    })
    const targetService = createSymbolNode({
      name: 'TargetService',
      kind: SymbolKind.Class,
      filePath,
      line: 30,
      column: 0,
    })

    // Call inside enclosingFunc right after localVar declaration
    const callFact: CallFact = {
      filePath,
      scopeId: enclosingFunc.id,
      callerSymbolId: enclosingFunc.id,
      form: CallForm.Constructor,
      name: 'TargetService',
      receiverName: undefined,
      targetName: 'TargetService',
      arity: undefined,
      location: { filePath, line: 14, column: 8 },
      metadata: undefined,
    }

    const symbols = [enclosingFunc, localVariable, targetService]
    const symbolLookup = lookup(symbols)
    const analysis = mockAnalysis({
      symbols,
      callFacts: [callFact],
    })
    const environment = buildScopedBindingEnvironment({
      analysis,
      importMap: new Map(),
      symbolLookup,
    })

    const resolved = resolveDependencyFacts({
      environment,
      analysis,
      symbolLookup,
    })

    expect(resolved).toHaveLength(1)
    expect(resolved[0]!.sourceSymbolId).toBe(enclosingFunc.id)
    expect(resolved[0]!.sourceSymbolId).not.toBe(localVariable.id)
    expect(resolved[0]!.targetSymbolId).toBe(targetService.id)
    expect(resolved[0]!.relationType).toBe(RelationType.Constructs)
  })
})
