import { describe, expect, it } from 'vitest'
import {
  buildScopedBindingEnvironment,
  resolveDependencyFacts,
  type SymbolLookup,
} from '../../../src/domain/services/scoped-binding-environment.js'
import {
  BindingScopeKind,
  BindingSourceKind,
  type BindingFact,
  type BindingScope,
} from '../../../src/domain/value-objects/binding-fact.js'
import { CallForm, type CallFact } from '../../../src/domain/value-objects/call-fact.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { createSymbolNode, type SymbolNode } from '../../../src/domain/value-objects/symbol-node.js'

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

describe('scoped binding environment', () => {
  it('uses nearest lexical scope and drops ambiguous equal-confidence bindings', () => {
    const scopes: BindingScope[] = [
      {
        id: filePath,
        kind: BindingScopeKind.File,
        filePath,
        parentId: undefined,
        ownerSymbolId: undefined,
        start: location(1),
        end: undefined,
      },
      {
        id: 'method',
        kind: BindingScopeKind.Method,
        filePath,
        parentId: filePath,
        ownerSymbolId: 'method-id',
        start: location(2),
        end: undefined,
      },
    ]
    const environment = buildScopedBindingEnvironment({
      filePath,
      symbols: [],
      imports: [],
      importMap: new Map(),
      scopes,
      facts: [fact('repo', 'OuterRepo', filePath), fact('repo', 'InnerRepo', 'method')],
      symbolLookup: lookup([]),
    })

    expect(environment.lookup('repo', 'method')[0]?.targetName).toBe('InnerRepo')

    const ambiguous = buildScopedBindingEnvironment({
      filePath,
      symbols: [],
      imports: [],
      importMap: new Map(),
      scopes,
      facts: [fact('service', 'A', 'method'), fact('service', 'B', 'method')],
      symbolLookup: lookup([]),
    })
    expect(ambiguous.lookup('service', 'method')).toHaveLength(0)
  })

  it('resolves constructor and type facts into distinct dependency relations', () => {
    const source = createSymbolNode({
      name: 'create',
      kind: SymbolKind.Function,
      filePath,
      line: 1,
      column: 0,
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
    const environment = buildScopedBindingEnvironment({
      filePath,
      symbols,
      imports: [],
      importMap: new Map(),
      scopes: [],
      facts: [typeFact],
      symbolLookup,
    })

    const resolved = resolveDependencyFacts({
      environment,
      bindingFacts: [typeFact],
      callFacts: [callFact],
      symbols,
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
    const environment = buildScopedBindingEnvironment({
      filePath,
      symbols,
      imports: [],
      importMap: new Map(),
      scopes: [],
      facts: [typeFact],
      symbolLookup,
    })

    const resolved = resolveDependencyFacts({
      environment,
      bindingFacts: [typeFact],
      callFacts: [callFact],
      symbols,
      symbolLookup,
    })

    expect(resolved).toHaveLength(0)
  })
})
