import { describe, expect, it } from 'vitest'
import { CheckRegistry } from '../../../src/domain/services/check-registry.js'
import {
  DuplicateCheckBindingError,
  DuplicateCheckError,
  InvalidCheckKindError,
  InvalidPluginNameError,
  UnknownCheckError,
} from '../../../src/domain/errors/check-registry-errors.js'
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
    expect(() => registry.register('123plugin', checkDef)).toThrow(InvalidPluginNameError)
    expect(() => registry.register('MyPlugin', checkDef)).toThrow(InvalidPluginNameError)
    expect(() => registry.register('plugin@invalid', checkDef)).toThrow(InvalidPluginNameError)
  })

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
      'Plugin',
      'PLUGIN',
      '../escape',
      'plugin/sub',
      'plugin.name',
      'plugin:name',
      '@scope',
      '__proto__',
      '-leading-dash',
      '9leadingnumber',
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
})
