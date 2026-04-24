import { describe, expect, it } from 'vitest'
import { CallForm, type CallFact } from '../../../src/domain/value-objects/call-fact.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'

describe('CallFact', () => {
  it('exposes normalized call forms', () => {
    expect(CallForm.Free).toBe('free')
    expect(CallForm.Member).toBe('member')
    expect(CallForm.Static).toBe('static')
    expect(CallForm.Constructor).toBe('constructor')
  })

  it('models constructor calls before relation resolution', () => {
    const fact: CallFact = {
      filePath: 'code-graph:src/composition.ts',
      scopeId: 'code-graph:src/composition.ts',
      callerSymbolId: 'code-graph:src/composition.ts:function:create:1:0',
      form: CallForm.Constructor,
      name: 'TemplateExpander',
      receiverName: undefined,
      targetName: 'TemplateExpander',
      arity: 1,
      location: {
        filePath: 'code-graph:src/composition.ts',
        line: 2,
        column: 10,
        endLine: undefined,
        endColumn: undefined,
      },
      metadata: undefined,
    }

    expect(fact.form).toBe(CallForm.Constructor)
    expect(RelationType.Constructs).toBe('CONSTRUCTS')
  })
})
