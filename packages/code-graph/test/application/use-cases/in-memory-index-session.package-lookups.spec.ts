import { describe, expect, it } from 'vitest'
import { InMemoryIndexSession } from '../../../src/application/use-cases/in-memory-index-session.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import {
  DeclarationOccurrenceForm,
  SymbolSpace,
  createPublicBinding,
  type DeclarationOccurrence,
} from '../../../src/domain/value-objects/symbol-reference.js'

/**
 * Builds a declaration occurrence.
 * @param symbolId - Physical symbol id.
 * @param form - Occurrence form.
 * @returns The occurrence.
 */
function occurrence(symbolId: string, form: DeclarationOccurrenceForm): DeclarationOccurrence {
  return {
    symbolId,
    kind: SymbolKind.Function,
    occurrenceForm: form,
    location: {
      filePath: 'ws:src/a.ts',
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 2,
    },
  } as DeclarationOccurrence
}

describe('InMemoryIndexSession package lookups', () => {
  it('Given bindings added after hydration, when looked up by route, then only matching ones are returned in id order', () => {
    const session = new InMemoryIndexSession()
    const first = createPublicBinding({
      surface: 'ws:src/public.ts',
      exportedName: 'X',
      space: SymbolSpace.Value,
      targetId: 'logical:one',
    })
    const other = createPublicBinding({
      surface: 'ws:src/public.ts',
      exportedName: 'Y',
      space: SymbolSpace.Value,
      targetId: 'logical:two',
    })
    session.addReferenceFacts({ publicBindings: [first, other], steps: [] })

    expect(session.findPublicBindings('ws:src/public.ts', 'X', SymbolSpace.Value)).toEqual([first])
    expect(session.findPublicBindings('ws:src/public.ts', 'X', SymbolSpace.Type)).toEqual([])
    expect(session.findPublicBindings('ws:src/other.ts', 'X', SymbolSpace.Value)).toEqual([])
  })

  it('Given a binding replaced by one with the same id, when looked up, then the new target is returned once', () => {
    const session = new InMemoryIndexSession()
    const original = createPublicBinding({
      surface: 'ws:src/public.ts',
      exportedName: 'X',
      space: SymbolSpace.Value,
      targetId: undefined,
    })
    session.addReferenceFacts({ publicBindings: [original], steps: [] })
    const linked = { ...original, targetId: 'logical:one' }
    session.addReferenceFacts({ publicBindings: [linked], steps: [] })

    expect(session.findPublicBindings('ws:src/public.ts', 'X', SymbolSpace.Value)).toEqual([linked])
  })

  it('Given registered files, when asked for the category, then the recorded one, the default, or undefined', () => {
    const session = new InMemoryIndexSession()
    session.registerFile({
      filePath: 'ws:test/a.spec.ts',
      projectRelativePath: 'test/a.spec.ts',
      language: 'typescript',
      contentHash: 'h',
      workspace: 'ws',
      category: 'test',
    })
    session.registerFile({
      filePath: 'ws:src/a.ts',
      projectRelativePath: 'src/a.ts',
      language: 'typescript',
      contentHash: 'h',
      workspace: 'ws',
    })

    expect(session.getFileCategory('ws:test/a.spec.ts')).toBe('test')
    expect(session.getFileCategory('ws:src/a.ts')).toBe('source')
    expect(session.getFileCategory('ws:src/missing.ts')).toBeUndefined()
  })

  it('Given a hydrated persisted file with a category, when asked, then the category is kept', () => {
    const session = new InMemoryIndexSession()
    session.hydratePersistedFile(
      {
        path: 'ws:test/b.spec.ts',
        projectRelativePath: 'test/b.spec.ts',
        language: 'typescript',
        contentHash: 'h',
        workspace: 'ws',
        category: 'test',
      },
      [],
    )

    expect(session.getFileCategory('ws:test/b.spec.ts')).toBe('test')
  })

  it('Given several occurrences, when the primary declaration is asked, then definitions win and the lowest id is chosen', () => {
    const session = new InMemoryIndexSession()
    session.hydrateReferenceFacts({
      logicalSymbols: [],
      declarations: [
        {
          logicalSymbolId: 'logical:one',
          declaration: occurrence('s-b', DeclarationOccurrenceForm.Definition),
        },
        {
          logicalSymbolId: 'logical:one',
          declaration: occurrence('s-a', DeclarationOccurrenceForm.Signature),
        },
        {
          logicalSymbolId: 'logical:one',
          declaration: occurrence('s-c', DeclarationOccurrenceForm.Definition),
        },
        {
          logicalSymbolId: 'logical:sig',
          declaration: occurrence('s-z', DeclarationOccurrenceForm.Signature),
        },
        {
          logicalSymbolId: 'logical:sig',
          declaration: occurrence('s-y', DeclarationOccurrenceForm.Signature),
        },
      ],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })

    expect(session.getPrimaryDeclarationSymbolId('logical:one')).toBe('s-b')
    expect(session.getPrimaryDeclarationSymbolId('logical:sig')).toBe('s-y')
    expect(session.getPrimaryDeclarationSymbolId('logical:none')).toBeUndefined()
  })
})
