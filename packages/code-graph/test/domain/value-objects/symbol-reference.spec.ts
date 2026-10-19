import { describe, expect, it } from 'vitest'
import {
  MemberAccessor,
  MemberDispatch,
  MemberKind,
  SymbolSpace,
  createLocalBinding,
  createLogicalSymbol,
  assignQualifiedNames,
  createPublicBinding,
  deriveQualifiedName,
  DeclarationOccurrenceForm,
  type DeclarationOccurrence,
  type ResolvedSymbolTarget,
  parseLogicalSymbol,
} from '../../../src/domain/value-objects/symbol-reference.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { type FileAnalysisDraft } from '../../../src/domain/value-objects/file-analysis.js'

describe('LogicalSymbol', () => {
  it('round-trips delimiter-containing structured fields without syntax splitting', () => {
    const symbol = createLogicalSymbol({
      workspace: 'sdk:host',
      surface: 'src/a|b.ts',
      name: 'Member#name::value',
      space: SymbolSpace.Value,
      ownerId: 'logical|owner',
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
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
      memberSemantics: undefined,
    })
    const second = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'src/model.ts',
      name: 'PublicAPI',
      space: SymbolSpace.Type,
      ownerId: undefined,
      memberSemantics: undefined,
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

  it('rejects an old six-field logical id', () => {
    expect(parseLogicalSymbol('logical|4:code|7:src/a.ts|4:name|5:value|0:|0:')).toBeUndefined()
  })

  it('round-trips kind, dispatch, accessor, and nativeKind', () => {
    const symbol = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'src/model.ts',
      name: 'value',
      space: SymbolSpace.Value,
      ownerId: 'logical|2|owner',
      memberSemantics: {
        kind: MemberKind.Property,
        dispatch: MemberDispatch.Instance,
        accessor: MemberAccessor.Get,
        nativeKind: 'getter',
      },
    })

    expect(symbol.id.startsWith('logical|2|')).toBe(true)
    expect(parseLogicalSymbol(symbol.id)).toEqual(symbol)
  })

  it('keeps value and type identities distinct', () => {
    const value = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'src/model.ts',
      name: 'Shared',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    const type = createLogicalSymbol({
      ...value,
      space: SymbolSpace.Type,
    })

    expect(value.id).not.toBe(type.id)
  })

  it('distinguishes instance and static getters', () => {
    const base = {
      workspace: 'code-graph',
      surface: 'src/model.ts',
      name: 'value',
      space: SymbolSpace.Property,
      ownerId: 'owner',
    }
    const instance = createLogicalSymbol({
      ...base,
      memberSemantics: {
        kind: MemberKind.Property,
        dispatch: MemberDispatch.Instance,
        accessor: MemberAccessor.Get,
      },
    })
    const staticGetter = createLogicalSymbol({
      ...base,
      memberSemantics: {
        kind: MemberKind.Property,
        dispatch: MemberDispatch.Static,
        accessor: MemberAccessor.Get,
      },
    })

    expect(instance.id).not.toBe(staticGetter.id)
    expect(parseLogicalSymbol(instance.id)?.memberSemantics).toEqual({
      kind: 'property',
      dispatch: 'instance',
      accessor: 'get',
    })
    expect(parseLogicalSymbol(staticGetter.id)?.memberSemantics).toEqual({
      kind: 'property',
      dispatch: 'static',
      accessor: 'get',
    })
  })

  it('stores a constructor without dispatch', () => {
    const symbol = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'src/model.ts',
      name: 'EditChange',
      space: SymbolSpace.Value,
      ownerId: 'owner',
      memberSemantics: { kind: MemberKind.Constructor },
    })

    expect(parseLogicalSymbol(symbol.id)?.memberSemantics).toEqual({ kind: 'constructor' })
    expect(parseLogicalSymbol(symbol.id)?.memberSemantics).not.toHaveProperty('dispatch')
  })

  it('preserves Execute and execute as different identities', () => {
    const lower = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'src/model.ts',
      name: 'execute',
      space: SymbolSpace.Value,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    const upper = createLogicalSymbol({ ...lower, name: 'Execute' })

    expect(lower.id).not.toBe(upper.id)
  })

  it('ignores declaration line when building the id', () => {
    const symbol = createLogicalSymbol({
      workspace: 'code-graph',
      surface: 'src/edit.ts',
      name: 'execute',
      space: SymbolSpace.Value,
      ownerId: 'owner',
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })

    expect(symbol.id).not.toContain(':12:')
    expect(parseLogicalSymbol(symbol.id)?.name).toBe('execute')
  })

  it('rebuilds EditChange.execute from ownerId and stores no package field', () => {
    const owner = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/edit.ts',
      name: 'EditChange',
      space: SymbolSpace.Type,
      ownerId: undefined,
      memberSemantics: undefined,
    })
    const member = createLogicalSymbol({
      workspace: 'core',
      surface: owner.surface,
      name: 'execute',
      space: SymbolSpace.Value,
      ownerId: owner.id,
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })
    const byId = new Map([
      [owner.id, owner],
      [member.id, member],
    ])
    const names: string[] = []
    let current: typeof member | undefined = member
    const seen = new Set<string>()
    while (current !== undefined && !seen.has(current.id)) {
      seen.add(current.id)
      names.unshift(current.name)
      current = current.ownerId === undefined ? undefined : byId.get(current.ownerId)
    }

    expect(deriveQualifiedName(member, byId)).toBe('EditChange.execute')
    expect(names.join('.')).toBe('EditChange.execute')
    expect(member.id).not.toContain('EditChange.execute')
    expect(parseLogicalSymbol(member.id)?.name).toBe('execute')
    const [namedMember] = assignQualifiedNames([owner, member]).filter(
      (item) => item.id === member.id,
    )
    expect(namedMember?.qualifiedName).toBe('EditChange.execute')
    expect(namedMember?.id).toBe(member.id)
    expect(member).not.toHaveProperty('package')
  })
})

describe('Identity layers and occurrence invariants', () => {
  it('owner change creates distinct logical target for same member name', () => {
    const classA = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/models.ts',
      name: 'ClassA',
      space: SymbolSpace.Type,
    })
    const classB = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/models.ts',
      name: 'ClassB',
      space: SymbolSpace.Type,
    })

    const memberA = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/models.ts',
      name: 'save',
      space: SymbolSpace.Value,
      ownerId: classA.id,
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })
    const memberB = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/models.ts',
      name: 'save',
      space: SymbolSpace.Value,
      ownerId: classB.id,
      memberSemantics: { kind: MemberKind.Method, dispatch: MemberDispatch.Instance },
    })

    expect(memberA.id).not.toBe(memberB.id)
    expect(memberA.ownerId).toBe(classA.id)
    expect(memberB.ownerId).toBe(classB.id)
  })

  it('signature and implementation forms are independent but share one logical target', () => {
    const logical = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/api.ts',
      name: 'fetchData',
      space: SymbolSpace.Value,
    })

    const signatureOccurrence: DeclarationOccurrence = {
      symbolId: 'core:src/api.ts:function:fetchData:5:0',
      location: { filePath: 'core:src/api.ts', line: 5, column: 0, endLine: 5, endColumn: 40 },
      kind: SymbolKind.Function,
      form: DeclarationOccurrenceForm.Signature,
      logicalId: logical.id,
    }

    const definitionOccurrence: DeclarationOccurrence = {
      symbolId: 'core:src/api.ts:function:fetchData:10:0',
      location: { filePath: 'core:src/api.ts', line: 10, column: 0, endLine: 20, endColumn: 1 },
      kind: SymbolKind.Function,
      form: DeclarationOccurrenceForm.Definition,
      logicalId: logical.id,
    }

    expect(signatureOccurrence.form).toBe(DeclarationOccurrenceForm.Signature)
    expect(definitionOccurrence.form).toBe(DeclarationOccurrenceForm.Definition)
    expect(signatureOccurrence.logicalId).toBe(definitionOccurrence.logicalId)
  })

  it('discriminates ResolvedSymbolTarget kind unions correctly', () => {
    const logicalSymbol = createLogicalSymbol({
      workspace: 'core',
      surface: 'core:src/engine.ts',
      name: 'Engine',
      space: SymbolSpace.Type,
    })

    const declOccurrence: DeclarationOccurrence = {
      symbolId: 'core:src/engine.ts:class:Engine:1:0',
      location: { filePath: 'core:src/engine.ts', line: 1, column: 0 },
      kind: SymbolKind.Class,
      form: DeclarationOccurrenceForm.Definition,
      logicalId: logicalSymbol.id,
    }

    const logicalTarget: ResolvedSymbolTarget = {
      kind: 'logical-target',
      logicalSymbol,
      declarations: [declOccurrence],
      path: [],
    }

    const declarationTarget: ResolvedSymbolTarget = {
      kind: 'declaration',
      declaration: declOccurrence,
      logicalSymbol,
      path: [],
    }

    const publicBindingTarget: ResolvedSymbolTarget = {
      kind: 'public-binding',
      binding: {
        id: 'core:src/index.ts::Engine',
        surface: 'core:src/index.ts',
        exportedName: 'Engine',
        space: SymbolSpace.Type,
        targetId: logicalSymbol.id,
      },
      logicalSymbol,
      declarations: [declOccurrence],
      path: [],
    }

    expect(logicalTarget.kind).toBe('logical-target')
    expect(declarationTarget.kind).toBe('declaration')
    expect(publicBindingTarget.kind).toBe('public-binding')
    if (logicalTarget.kind === 'logical-target') {
      expect(logicalTarget.logicalSymbol.id).toBe(logicalSymbol.id)
      expect(logicalTarget.declarations).toHaveLength(1)
    }
    if (declarationTarget.kind === 'declaration') {
      expect(declarationTarget.declaration.symbolId).toBe(declOccurrence.symbolId)
    }
    if (publicBindingTarget.kind === 'public-binding') {
      expect(publicBindingTarget.binding.exportedName).toBe('Engine')
    }
  })

  it('given two local bindings with the same name and scope at different ranges, when identities are built, then they differ and keep their ranges', () => {
    const base = {
      filePath: 'ws:a.ts',
      scopeId: 'fn',
      localName: 'x',
      space: SymbolSpace.Value,
      targetId: undefined,
    }
    const first = createLocalBinding({
      ...base,
      range: { startLine: 2, startColumn: 4, endLine: 2, endColumn: 5 },
    })
    const second = createLocalBinding({
      ...base,
      range: { startLine: 6, startColumn: 4, endLine: 6, endColumn: 5 },
    })

    expect(first.id).not.toBe(second.id)
    expect(first.range.startLine).toBe(2)
    expect(second.range.startLine).toBe(6)
  })
})
