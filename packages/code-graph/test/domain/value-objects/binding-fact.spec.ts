import { describe, expect, it } from 'vitest'
import {
  BindingScopeKind,
  BindingSourceKind,
  type BindingFact,
} from '../../../src/domain/value-objects/binding-fact.js'

describe('BindingFact', () => {
  it('exposes the expected scope and source vocabularies', () => {
    expect(BindingScopeKind.File).toBe('file')
    expect(BindingScopeKind.Class).toBe('class')
    expect(BindingSourceKind.Parameter).toBe('parameter')
    expect(BindingSourceKind.ConstructorCall).toBe('constructor-call')
  })

  it('models immutable deterministic binding inputs', () => {
    const fact: BindingFact = {
      name: 'expander',
      filePath: 'code-graph:src/node-hook-runner.ts',
      scopeId: 'code-graph:src/node-hook-runner.ts',
      sourceKind: BindingSourceKind.Parameter,
      location: {
        filePath: 'code-graph:src/node-hook-runner.ts',
        line: 3,
        column: 15,
        endLine: undefined,
        endColumn: undefined,
      },
      targetName: 'TemplateExpander',
      targetSymbolId: undefined,
      targetFilePath: undefined,
      metadata: undefined,
    }

    expect(fact.targetName).toBe('TemplateExpander')
    expect(fact.location.filePath).toBe('code-graph:src/node-hook-runner.ts')
  })
})
