import { describe, expect, it } from 'vitest'
import {
  QualifiedReferenceKind,
  type QualifiedReferenceFact,
  qualifiedReferenceKey,
} from '../../../src/domain/value-objects/qualified-reference-fact.js'
import { type FileAnalysisDraft } from '../../../src/domain/value-objects/file-analysis.js'
import { GoLanguageAdapter } from '../../../src/infrastructure/tree-sitter/go-language-adapter.js'
import { InMemoryIndexSession } from '../../../src/application/use-cases/in-memory-index-session.js'

describe('QualifiedReferenceFact', () => {
  const location = {
    filePath: 'ws:main.go',
    line: 4,
    column: 2,
    endLine: 4,
    endColumn: 16,
  }

  function fact(overrides: Partial<QualifiedReferenceFact> = {}): QualifiedReferenceFact {
    return {
      filePath: 'ws:main.go',
      qualifier: 'models',
      name: 'User',
      kind: QualifiedReferenceKind.Type,
      sourceSymbolId: undefined,
      location,
      ...overrides,
    }
  }

  it('given two facts, when their keys are built, then kind and position distinguish them and the key stays stable', () => {
    const typeFact = fact()
    const callFact = fact({
      kind: QualifiedReferenceKind.Call,
      location: { ...location, column: 8 },
    })

    expect(qualifiedReferenceKey(typeFact)).toBe(qualifiedReferenceKey(typeFact))
    expect(qualifiedReferenceKey(typeFact)).not.toBe(qualifiedReferenceKey(callFact))
    expect(qualifiedReferenceKey(typeFact)).toBe(['type', '4:2', 'models.User'].join('\u0000'))
  })

  it('given a registered analysis without the collection, when it is read back, then absence is the same as an empty list', () => {
    const session = new InMemoryIndexSession()
    const filePath = 'ws:main.go'
    const draft: FileAnalysisDraft = {
      language: 'go',
      symbols: [],
      imports: [],
      bindingFacts: [],
      callFacts: [],
    }
    session.registerFile({
      filePath,
      projectRelativePath: 'main.go',
      language: 'go',
      contentHash: 'hash',
      workspace: 'ws',
    })
    session.registerAnalysis({ filePath, analysis: draft })

    expect(session.getAnalysis(filePath)?.qualifiedReferenceFacts ?? []).toEqual([])
  })

  it('given an adapter-produced fact, when it is serialized, then it is plain data', () => {
    const session = new InMemoryIndexSession()
    const draft = new GoLanguageAdapter().analyzeFile(
      'ws:main.go',
      'package main\nimport "example.com/models"\nfunc main() { _ = models.User{} }\n',
      { session, workspaceName: 'ws' },
    )
    const value = draft.qualifiedReferenceFacts?.[0]

    expect(value).toBeDefined()
    expect(JSON.parse(JSON.stringify(value))).toEqual(value)
  })

  it('given a fact, when it is inspected, then it names no target and creates no relation', () => {
    const value = fact()

    expect(value).not.toHaveProperty('target')
    expect(value).not.toHaveProperty('targetSymbolId')
    expect(value).not.toHaveProperty('relation')
    expect(Object.keys(value).sort()).toEqual([
      'filePath',
      'kind',
      'location',
      'name',
      'qualifier',
      'sourceSymbolId',
    ])
  })
})
