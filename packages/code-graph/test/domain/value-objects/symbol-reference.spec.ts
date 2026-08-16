import { describe, expect, it } from 'vitest'
import {
  MemberForm,
  SymbolSpace,
  createLogicalSymbol,
  createPublicBinding,
  parseLogicalSymbol,
} from '../../../src/domain/value-objects/symbol-reference.js'
import { type FileAnalysisDraft } from '../../../src/domain/value-objects/file-analysis.js'

describe('LogicalSymbol', () => {
  it('round-trips delimiter-containing structured fields without syntax splitting', () => {
    const symbol = createLogicalSymbol({
      workspace: 'sdk:host',
      surface: 'src/a|b.ts',
      name: 'Member#name::value',
      space: SymbolSpace.Value,
      ownerId: 'logical|owner',
      memberForm: MemberForm.Instance,
    })

    expect(parseLogicalSymbol(symbol.id)).toEqual(symbol)
  })

  it('preserves case and ignores declaration source ranges', () => {
    const first = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'src/model.ts',
      name: 'PublicAPI',
      space: SymbolSpace.Type,
      ownerId: undefined,
      memberForm: undefined,
    })
    const second = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'src/model.ts',
      name: 'PublicAPI',
      space: SymbolSpace.Type,
      ownerId: undefined,
      memberForm: undefined,
    })

    expect(second.id).toBe(first.id)
    expect(parseLogicalSymbol(first.id)?.name).toBe('PublicAPI')
  })

  it('rejects malformed canonical references', () => {
    expect(parseLogicalSymbol('logical|3:bad')).toBeUndefined()
    expect(parseLogicalSymbol('logical|1:x|1:y|1:z|4:nope|0:|0:')).toBeUndefined()
  })

  it('keeps competing targets in one public export slot independently addressable', () => {
    const first = createPublicBinding({
      surface: 'code-graph:src/index.ts',
      exportedName: 'Shared',
      space: SymbolSpace.Value,
      targetId: 'logical:first',
    })
    const second = createPublicBinding({
      surface: first.surface,
      exportedName: first.exportedName,
      space: first.space,
      targetId: 'logical:second',
    })

    expect(first.id).not.toBe(second.id)
    expect(first).toMatchObject({
      surface: second.surface,
      exportedName: second.exportedName,
      space: second.space,
    })
  })

  it('carries explicit adapter capability evidence with reference facts', () => {
    const analysis = {
      language: 'typescript',
      symbols: [],
      imports: [],
      bindingFacts: [],
      callFacts: [],
      referenceFacts: {
        declarations: [],
        publicBindings: [],
        localBindings: [],
        hierarchy: [],
        steps: [],
        capabilities: {
          declarations: true,
          members: true,
          publicBindings: true,
          localBindings: true,
          hierarchy: false,
          buildContext: false,
        },
      },
    } satisfies FileAnalysisDraft

    expect(analysis.referenceFacts.capabilities.hierarchy).toBe(false)
  })
})
