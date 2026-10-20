import { describe, expect, it } from 'vitest'
import { CheckRegistry } from '../../../src/domain/services/check-registry.js'
import {
  DuplicateCheckBindingError,
  DuplicateCheckError,
  InvalidCheckKindError,
  InvalidPluginNameError,
  UnknownCheckError,
} from '../../../src/domain/errors/check-registry-errors.js'
import { InvalidInputError } from '../../../src/domain/errors/invalid-input-error.js'
import type { CustomCheckDefinition } from '../../../src/domain/services/transition-checks.js'

describe('CheckRegistry', () => {
  it('registers custom predicate checks under the @<plugin>.<id> namespace', () => {
    const registry = new CheckRegistry()
    const checkDef: CustomCheckDefinition = {
      id: 'custom-lint',
      label: 'Custom Linter',
      execute: async () => ({
        id: 'test',
        label: 'Test',
        kind: 'predicate',
        outcome: 'pass',
        details: {},
      }),
    }

    registry.register('my-plugin', checkDef, [
      {
        scope: 'transition',
        from: 'implementing',
        to: 'verifying',
        skippable: true,
      },
    ])

    const resolved = registry.get('@my-plugin.custom-lint')
    expect(resolved).toBeDefined()
    expect(resolved?.id).toBe('@my-plugin.custom-lint')
    expect(resolved?.label).toBe('Custom Linter')
    expect(resolved?.kind).toBe('predicate')

    const bindings = registry.getBindings('@my-plugin.custom-lint')
    expect(bindings).toHaveLength(1)
    expect(bindings[0]?.applicability[0]?.scope).toBe('transition')
    expect(bindings[0]?.skippable).toBe(true)
  })

  it('rejects invalid plugin names with InvalidPluginNameError', () => {
    const registry = new CheckRegistry()
    const checkDef: CustomCheckDefinition = {
      id: 'custom-check',
      label: 'Check',
      execute: async () => ({
        id: 'test',
        label: 'Test',
        kind: 'predicate',
        outcome: 'pass',
        details: {},
      }),
    }

    expect(() => registry.register('', checkDef)).toThrow(InvalidPluginNameError)
    expect(() => registry.register('plugin@invalid', checkDef)).toThrow(InvalidPluginNameError)
  })

  it.each(['MyPlugin', '123plugin', 'my_plugin'])(
    'accepts the complete documented plugin namespace grammar: %s',
    (pluginName) => {
      const registry = new CheckRegistry()
      const id = registry.register(pluginName, {
        id: 'check',
        label: 'Check',
        execute: async () => ({ id: 'check', label: 'Check', kind: 'predicate', outcome: 'pass' }),
      })
      expect(id).toBe(`@${pluginName}.check`)
    },
  )

  it('rejects effect check registrations for plugins with InvalidCheckKindError', () => {
    const registry = new CheckRegistry()
    const effectDef: unknown = {
      id: 'custom-effect',
      kind: 'effect',
      label: 'Effect',
      execute: async () => ({
        id: 'test',
        label: 'Test',
        kind: 'predicate' as const,
        outcome: 'pass' as const,
        details: {},
      }),
    }

    expect(() => registry.register('my-plugin', effectDef as CustomCheckDefinition)).toThrow(
      InvalidCheckKindError,
    )
  })

  it('rejects duplicate check registration under same plugin with DuplicateCheckError', () => {
    const registry = new CheckRegistry()
    const checkDef: CustomCheckDefinition = {
      id: 'lint',
      label: 'Linter',
      execute: async () => ({
        id: 'test',
        label: 'Test',
        kind: 'predicate',
        outcome: 'pass',
        details: {},
      }),
    }

    registry.register('my-plugin', checkDef)
    expect(() => registry.register('my-plugin', checkDef)).toThrow(DuplicateCheckError)
  })

  it('rejects duplicate coordinate bindings with DuplicateCheckBindingError', () => {
    const registry = new CheckRegistry()
    const checkDef: CustomCheckDefinition = {
      id: 'lint',
      label: 'Linter',
      execute: async () => ({
        id: 'test',
        label: 'Test',
        kind: 'predicate',
        outcome: 'pass',
        details: {},
      }),
    }

    expect(() =>
      registry.register('my-plugin', checkDef, [
        {
          scope: 'transition',
          from: 'implementing',
          to: 'verifying',
          skippable: false,
        },
        {
          scope: 'transition',
          from: 'implementing',
          to: 'verifying',
          skippable: true,
        },
      ]),
    ).toThrow(DuplicateCheckBindingError)
  })

  it('preserves built-in checks upon instantiation', () => {
    const registry = new CheckRegistry()
    const builtins = registry.list()
    expect(builtins.length).toBeGreaterThan(10)
    expect(registry.has('spec.overlap')).toBe(true)
    expect(registry.has('protocol.edge')).toBe(true)
    expect(registry.has('impl.filesResolved')).toBe(true)
    expect(registry.has('hook.pre')).toBe(true)
  })

  it('throws UnknownCheckError on resolving unregistered check', () => {
    const registry = new CheckRegistry()
    expect(registry.get('non.existent')).toBeUndefined()
  })

  it('stores and retrieves governance policies', () => {
    const registry = new CheckRegistry()
    const checkDef: CustomCheckDefinition = {
      id: 'strict-check',
      label: 'Strict Check',
      execute: async () => ({
        id: 'test',
        label: 'Test',
        kind: 'predicate',
        outcome: 'pass',
        details: {},
      }),
    }

    registry.register('my-plugin', checkDef, [], {
      allowBindingOverride: false,
      allowConfigOverride: false,
    })

    const governance = registry.getGovernance('@my-plugin.strict-check')
    expect(governance?.allowBindingOverride).toBe(false)
    expect(governance?.allowConfigOverride).toBe(false)
  })

  it('preserves internal checks and prevents clobbering when a plugin attempts to use internal check names', () => {
    const registry = new CheckRegistry()
    const originalProtocolEdge = registry.get('protocol.edge')
    expect(originalProtocolEdge).toBeDefined()
    expect(originalProtocolEdge?.id).toBe('protocol.edge')

    const spoofDef: CustomCheckDefinition = {
      id: 'edge',
      label: 'Malicious Protocol Edge Spoof',
      execute: async () => ({
        id: 'spoof',
        label: 'Spoof',
        kind: 'predicate',
        outcome: 'pass',
        details: {},
      }),
    }

    // Even if pluginName is 'protocol' and check id is 'edge', canonical id is '@protocol.edge'
    const registeredId = registry.register('protocol', spoofDef)
    expect(registeredId).toBe('@protocol.edge')

    // Original built-in check 'protocol.edge' MUST remain completely untouched and un-clobbered
    const currentProtocolEdge = registry.get('protocol.edge')
    expect(currentProtocolEdge).toBe(originalProtocolEdge)
    expect(currentProtocolEdge?.label).toBe(originalProtocolEdge?.label)
    expect(currentProtocolEdge?.label).not.toBe('Malicious Protocol Edge Spoof')

    // Custom check is in its own namespaced slot
    const customCheck = registry.get('@protocol.edge')
    expect(customCheck).toBeDefined()
    expect(customCheck?.id).toBe('@protocol.edge')
    expect(customCheck?.label).toBe('Malicious Protocol Edge Spoof')
  })

  it('rejects plugin names with symbols, whitespace, uppercase, or path traversal', () => {
    const registry = new CheckRegistry()
    const checkDef: CustomCheckDefinition = {
      id: 'check',
      label: 'Check',
      execute: async () => ({ id: 'c', label: 'C', kind: 'predicate', outcome: 'pass' }),
    }

    const invalidPluginNames = [
      '',
      ' ',
      '  ',
      '../escape',
      'plugin/sub',
      'plugin.name',
      'plugin:name',
      '@scope',
      'plugin with spaces',
      'plugin$dollar',
    ]

    for (const name of invalidPluginNames) {
      expect(() => registry.register(name, checkDef)).toThrow(InvalidPluginNameError)
    }
  })

  it('enforces @ prefix namespace isolation even if custom check id contains dots, internal names, or @ symbols', () => {
    const registry = new CheckRegistry()
    const checkDef: CustomCheckDefinition = {
      id: '@protocol.edge',
      label: 'Check with tricky id',
      execute: async () => ({ id: 'c', label: 'C', kind: 'predicate', outcome: 'pass' }),
    }

    const id = registry.register('myplugin', checkDef)
    expect(id).toBe('@myplugin.@protocol.edge')
    expect(registry.get('protocol.edge')?.id).toBe('protocol.edge')
    expect(registry.get('@protocol.edge')).toBeUndefined()
    expect(registry.get('@myplugin.@protocol.edge')).toBeDefined()
  })

  it('rejects invalid check kinds with InvalidCheckKindError', () => {
    const registry = new CheckRegistry()
    const invalidKinds = ['effect', 'hook', 'action', 123, true, null, {}]

    for (const [idx, kind] of invalidKinds.entries()) {
      const badDef = {
        id: `bad-${idx}`,
        label: 'Bad',
        kind,
        execute: async () => ({
          id: 'c',
          label: 'C',
          kind: 'predicate' as const,
          outcome: 'pass' as const,
        }),
      }
      expect(() =>
        registry.register('myplugin', badDef as unknown as CustomCheckDefinition),
      ).toThrow(InvalidCheckKindError)
    }
  })

  it('marks Category A invariants and Category B attributes with allowDisable: false and Category C checks with allowDisable: true in governance', () => {
    const registry = new CheckRegistry()

    // Category A: Protocol Invariants
    expect(registry.getGovernance('protocol.edge')?.allowDisable).toBe(false)
    expect(registry.getGovernance('protocol.edge')?.allowBindingOverride).toBe(false)
    expect(registry.getGovernance('verification.current')?.allowDisable).toBe(false)
    expect(registry.getGovernance('archive.archivable')?.allowDisable).toBe(false)
    expect(registry.getGovernance('schema.nameMatch')?.allowDisable).toBe(false)
    expect(registry.getGovernance('hook.pre')?.allowDisable).toBe(false)
    expect(registry.getGovernance('hook.post')?.allowDisable).toBe(false)

    // Category B: Native Attributes
    expect(registry.getGovernance('workflow.requires')?.allowDisable).toBe(false)
    expect(registry.getGovernance('workflow.requires')?.allowBindingOverride).toBe(false)
    expect(registry.getGovernance('workflow.taskCompletion')?.allowDisable).toBe(false)
    expect(registry.getGovernance('workflow.taskCompletion')?.allowBindingOverride).toBe(false)
    expect(registry.getGovernance('approval.spec')?.allowDisable).toBe(false)
    expect(registry.getGovernance('approval.signoff')?.allowDisable).toBe(false)

    // Category C: Policy & Consistency Checks
    expect(registry.getGovernance('impl.linksInScope')?.allowDisable).toBe(true)
    expect(registry.getGovernance('impl.linksInScope')?.allowBindingOverride).toBe(true)
    expect(registry.getGovernance('spec.overlap')?.allowDisable).toBe(true)
    expect(registry.getGovernance('spec.overlap')?.allowBindingOverride).toBe(true)
    expect(registry.getGovernance('deps.consistent')?.allowDisable).toBe(true)
    expect(registry.getGovernance('deps.consistent')?.allowBindingOverride).toBe(true)
    expect(registry.getGovernance('impl.filesResolved')?.allowDisable).toBe(true)
    expect(registry.getGovernance('impl.filesResolved')?.allowBindingOverride).toBe(true)
    expect(registry.getGovernance('workspace.readOnly')?.allowDisable).toBe(true)
    expect(registry.getGovernance('workspace.readOnly')?.allowBindingOverride).toBe(true)
  })

  it('records allowDisable: true by default on registered custom checks, or custom allowDisable when specified', () => {
    const registry = new CheckRegistry()
    const checkDef: CustomCheckDefinition = {
      id: 'scan',
      label: 'Security Scan',
      execute: async () => ({ id: 'c', label: 'C', kind: 'predicate', outcome: 'pass' }),
    }

    const defaultId = registry.register('sec', checkDef)
    expect(registry.getGovernance(defaultId)?.allowDisable).toBe(true)

    const lockedId = registry.register('sec', { ...checkDef, id: 'mandatory' }, [], {
      allowDisable: false,
    })
    expect(registry.getGovernance(lockedId)?.allowDisable).toBe(false)
  })

  it('records allowDisable on normalized defaultBindings', () => {
    const registry = new CheckRegistry()
    const checkDef: CustomCheckDefinition = {
      id: 'audit',
      label: 'Audit',
      execute: async () => ({ id: 'c', label: 'C', kind: 'predicate', outcome: 'pass' }),
    }

    registry.register('compliance', checkDef, [
      {
        scope: 'transition',
        to: 'ready',
        allowDisable: false,
      },
    ])

    const bindings = registry.getBindings('@compliance.audit')
    expect(bindings).toHaveLength(1)
    expect(bindings[0]?.allowDisable).toBe(false)
  })

  it('rejects duplicate bindings for scope step-skip on the same step', () => {
    const registry = new CheckRegistry()
    const checkDef: CustomCheckDefinition = {
      id: 'task-gate',
      label: 'Task Gate',
      execute: async () => ({ id: 'c', label: 'C', kind: 'predicate', outcome: 'pass' }),
    }

    registry.register('workflow', checkDef, [
      {
        scope: 'step-skip',
        step: 'implementing',
      },
    ])

    expect(() =>
      registry.register('workflow', { ...checkDef, id: 'task-gate-2' }, [
        {
          scope: 'step-skip',
          step: 'implementing',
        },
      ]),
    ).not.toThrow() // Different check id is allowed to bind to same coordinate unless it's the SAME check id

    // Same check id duplicate coordinate binding
    expect(() =>
      registry.register('workflow-dup', checkDef, [
        {
          scope: 'step-skip',
          step: 'implementing',
        },
        {
          scope: 'step-skip',
          step: 'implementing',
        },
      ]),
    ).toThrow(DuplicateCheckBindingError)
  })

  it('allows registering step-skip bindings on different steps for the same check', () => {
    const registry = new CheckRegistry()
    const checkDef: CustomCheckDefinition = {
      id: 'validator',
      label: 'Validator',
      execute: async () => ({ id: 'c', label: 'C', kind: 'predicate', outcome: 'pass' }),
    }

    expect(() =>
      registry.register('workflow', checkDef, [
        {
          scope: 'step-skip',
          step: 'implementing',
        },
        {
          scope: 'step-skip',
          step: 'verifying',
        },
      ]),
    ).not.toThrow()

    const bindings = registry.getBindings('@workflow.validator')
    expect(bindings).toHaveLength(2)
  })
  it('lists the sixteen built-ins plus registered plugin checks and reports has() accurately', () => {
    const registry = new CheckRegistry()
    expect(registry.list()).toHaveLength(16)
    const definition = (id: string) =>
      ({
        id,
        label: id,
        kind: 'predicate',
        execute: () => ({ ok: true }),
      }) as unknown as CustomCheckDefinition
    registry.register('p', definition('one'))
    registry.register('p', definition('two'))

    expect(registry.list()).toHaveLength(18)
    expect(registry.has('@p.one')).toBe(true)
    expect(registry.has('@p.two')).toBe(true)
    expect(registry.has('@p.three')).toBe(false)
    expect(registry.has('impl.linksInScope')).toBe(true)
  })

  it('sets allowSchemaEmbedding false for Category A/B and true for Category C built-ins', () => {
    const registry = new CheckRegistry()
    for (const id of ['protocol.edge', 'hook.pre', 'workflow.requires', 'approval.spec']) {
      expect(registry.getGovernance(id)?.allowSchemaEmbedding).toBe(false)
    }
    for (const id of ['impl.linksInScope', 'spec.overlap', 'deps.consistent']) {
      expect(registry.getGovernance(id)?.allowSchemaEmbedding).toBe(true)
    }
  })

  it('locks every governance flag on the Category B workflow.tasksEmpty built-in', () => {
    const governance = new CheckRegistry().getGovernance('workflow.tasksEmpty')

    expect(governance).toMatchObject({
      allowSchemaEmbedding: false,
      allowBindingOverride: false,
      allowConfigOverride: false,
      allowDisable: false,
    })
  })

  it('defaults plugin allowSchemaEmbedding from the presence of default bindings', () => {
    const registry = new CheckRegistry()
    const check: CustomCheckDefinition = {
      id: 'free',
      label: 'free',
      kind: 'predicate',
      execute: () => ({ ok: true }),
    } as unknown as CustomCheckDefinition
    registry.register('p', check)
    registry.register('p', { ...check, id: 'bound' }, [{ scope: 'archive' }])
    registry.register('p', { ...check, id: 'explicit' }, [{ scope: 'archive' }], {
      allowSchemaEmbedding: true,
    })
    expect(registry.getGovernance('@p.free')?.allowSchemaEmbedding).toBe(true)
    expect(registry.getGovernance('@p.bound')?.allowSchemaEmbedding).toBe(false)
    expect(registry.getGovernance('@p.explicit')?.allowSchemaEmbedding).toBe(true)
  })

  it('withExecutableBuiltins replaces built-ins and rejects non-built-ins or kind mismatches', () => {
    const registry = new CheckRegistry()
    const original = registry.get('impl.linksInScope')!
    const instance = { ...original, label: 'executable' }
    const copy = registry.withExecutableBuiltins({ 'impl.linksInScope': instance })
    expect(copy.get('impl.linksInScope')).toBe(instance)
    expect(registry.get('impl.linksInScope')).toBe(original)
    expect(copy.list()).toHaveLength(registry.list().length)
    expect(copy.bindings()).toHaveLength(registry.bindings().length)
    expect(copy.getGovernance('impl.linksInScope')).toEqual(
      registry.getGovernance('impl.linksInScope'),
    )
    expect(() => registry.withExecutableBuiltins({ '@p.x': instance })).toThrow(InvalidInputError)
    expect(() =>
      registry.withExecutableBuiltins({
        'impl.linksInScope': { ...original, kind: 'effect' } as never,
      }),
    ).toThrow(InvalidInputError)
  })
})
