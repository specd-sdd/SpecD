import { describe, it, expect } from 'vitest'
import { buildSchema, type SchemaYamlData } from '../../../src/domain/services/build-schema.js'
import { SchemaValidationError } from '../../../src/domain/errors/schema-validation-error.js'
import { CheckRegistry } from '../../../src/domain/services/check-registry.js'
import { resolveEffectiveBindings } from '../../../src/domain/services/transition-checks.js'
import {
  CheckBindingOverrideForbiddenError,
  CheckConfigOverrideForbiddenError,
  CheckDisableForbiddenError,
  CheckEmbeddingForbiddenError,
  DuplicateCheckBindingError,
  UnknownCheckError,
} from '../../../src/domain/errors/check-registry-errors.js'

function dataWith(workflow: Array<Record<string, unknown>>): SchemaYamlData {
  return {
    kind: 'schema',
    name: 'test',
    version: 1,
    artifacts: [{ id: 'spec', scope: 'spec', output: 'spec.md' }],
    workflow: workflow as unknown as SchemaYamlData['workflow'],
  }
}

function row(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    step: name,
    requires: [],
    requiresTaskCompletion: [],
    hooks: { pre: [], post: [] },
    ...extra,
  }
}

function archiving(archiveChecks: unknown): SchemaYamlData {
  return dataWith([row('archiving', { archiveChecks })])
}

function build(data: SchemaYamlData, registry?: CheckRegistry): ReturnType<typeof buildSchema> {
  return buildSchema('#test', data, new Map(), registry)
}

function pluginCheck(id: string): {
  id: string
  label: string
  execute: () => Promise<never>
} {
  return {
    id,
    label: id,
    execute: async () =>
      ({
        id,
        label: id,
        kind: 'predicate',
        outcome: 'pass',
      }) as never,
  }
}

describe('buildSchema archiveChecks — shape and step', () => {
  it('accepts archiveChecks on the archiving entry', () => {
    const schema = build(archiving([{ id: 'spec.overlap', skippable: false }]))
    expect(schema.workflowStep('archiving')?.archiveChecks).toEqual([
      { id: 'spec.overlap', skippable: false },
    ])
  })

  it('treats an empty archiveChecks array like an omitted one', () => {
    const schema = build(archiving([]))
    expect(schema.workflowStep('archiving')?.archiveChecks ?? []).toEqual([])
  })

  it('rejects archiveChecks on any other step, even when empty', () => {
    expect(() => build(dataWith([row('implementing', { archiveChecks: [] })]))).toThrow(
      SchemaValidationError,
    )
    expect(() =>
      build(dataWith([row('verifying', { archiveChecks: [{ id: 'spec.overlap' }] })])),
    ).toThrow(/only valid on 'archiving'/)
  })

  it('rejects an archiveChecks value that is not an array or not an array entry object', () => {
    expect(() => build(archiving({ id: 'spec.overlap' }))).toThrow(SchemaValidationError)
    expect(() => build(archiving('spec.overlap'))).toThrow(SchemaValidationError)
    expect(() => build(archiving([null]))).toThrow(SchemaValidationError)
    expect(() => build(archiving(['spec.overlap']))).toThrow(SchemaValidationError)
    expect(() => build(archiving([[{ id: 'spec.overlap' }]]))).toThrow(SchemaValidationError)
  })

  it('rejects a declaration without a string id', () => {
    expect(() => build(archiving([{ skippable: true }]))).toThrow(/string id/)
    expect(() => build(archiving([{ id: 3 }]))).toThrow(/string id/)
    expect(() => build(archiving([{ id: '' }]))).toThrow(/string id/)
  })

  it('rejects unsupported keys including onFailure', () => {
    expect(() => build(archiving([{ id: 'spec.overlap', onFailure: 'collect' }]))).toThrow(
      /unsupported key 'onFailure'/,
    )
    expect(() => build(archiving([{ id: 'spec.overlap', from: 'ready' }]))).toThrow(
      SchemaValidationError,
    )
  })

  it('rejects wrongly typed fields', () => {
    expect(() => build(archiving([{ id: 'spec.overlap', skippable: 'yes' }]))).toThrow(
      /'skippable' must be a boolean/,
    )
    expect(() => build(archiving([{ id: 'spec.overlap', disabled: 1 }]))).toThrow(
      /'disabled' must be a boolean/,
    )
    expect(() => build(archiving([{ id: 'spec.overlap', config: [1] }]))).toThrow(
      /'config' must be an object/,
    )
  })
})

describe('buildSchema archiveChecks — registry and coordinates', () => {
  it('rejects an unregistered check id', () => {
    expect(() => build(archiving([{ id: '@nope.check' }]))).toThrow(UnknownCheckError)
  })

  it('rejects the same id twice in one array', () => {
    expect(() => build(archiving([{ id: 'spec.overlap' }, { id: 'spec.overlap' }]))).toThrow(
      DuplicateCheckBindingError,
    )
  })

  it('allows the same id in checks and archiveChecks of the archiving entry', () => {
    const schema = build(
      dataWith([
        row('archiving', {
          checks: [{ id: 'impl.linksInScope', skippable: false }],
          archiveChecks: [{ id: 'impl.linksInScope', disabled: true }],
        }),
      ]),
    )
    expect(schema.workflowStep('archiving')?.checks).toEqual([
      { id: 'impl.linksInScope', skippable: false },
    ])
    expect(schema.workflowStep('archiving')?.archiveChecks).toEqual([
      { id: 'impl.linksInScope', disabled: true },
    ])
  })

  it('knows archive bindings when no registry is injected (fallback registry)', () => {
    expect(() => build(archiving([{ id: 'workspace.readOnly', disabled: true }]))).toThrow(
      CheckDisableForbiddenError,
    )
  })
})

describe('buildSchema archiveChecks — governance of built-in checks', () => {
  const locked = ['workspace.readOnly', 'deps.consistent', 'impl.filesResolved']
  const categoryA = [
    'schema.nameMatch',
    'archive.archivable',
    'workflow.taskCompletion',
    'verification.current',
    'hook.pre',
    'hook.post',
  ]

  it('rejects disabling the six Category A and the three locked archive checks', () => {
    for (const id of [...categoryA, ...locked]) {
      expect(() => build(archiving([{ id, disabled: true }])), id).toThrow(
        CheckDisableForbiddenError,
      )
    }
  })

  it('rejects making locked checks skippable', () => {
    for (const id of ['impl.filesResolved', 'workspace.readOnly', 'deps.consistent']) {
      expect(() => build(archiving([{ id, skippable: true }])), id).toThrow(
        CheckBindingOverrideForbiddenError,
      )
    }
    expect(() => build(archiving([{ id: 'schema.nameMatch', skippable: true }]))).toThrow(
      CheckBindingOverrideForbiddenError,
    )
  })

  it('rejects configuring locked checks', () => {
    expect(() => build(archiving([{ id: 'deps.consistent', config: { strict: true } }]))).toThrow(
      CheckConfigOverrideForbiddenError,
    )
  })

  it('rejects embedding a check no archive binding serves when its embedding is locked', () => {
    expect(() => build(archiving([{ id: 'approval.spec' }]))).toThrow(CheckEmbeddingForbiddenError)
  })

  it('accepts a redundant declaration that repeats the code-defined policy', () => {
    expect(() => build(archiving([{ id: 'workspace.readOnly', skippable: false }]))).not.toThrow()
  })

  it('keeps spec.overlap and impl.linksInScope tunable', () => {
    const schema = build(
      archiving([
        { id: 'spec.overlap', skippable: false },
        { id: 'impl.linksInScope', disabled: true },
      ]),
    )
    expect(schema.workflowStep('archiving')?.archiveChecks).toHaveLength(2)
  })

  it('keeps the transition-side policy of the archive-locked checks', () => {
    expect(() =>
      build(dataWith([row('ready', { checks: [{ id: 'workspace.readOnly', disabled: true }] })])),
    ).not.toThrow()
  })
})

describe('buildSchema archiveChecks — governance of plugin checks', () => {
  it('lets a schema tune a plugin check bound to archive without embedding and cascades defaultConfig', () => {
    const registry = new CheckRegistry()
    registry.register(
      'sec',
      pluginCheck('scan'),
      [{ scope: 'archive', allowBindingOverride: true, allowConfigOverride: true }],
      { allowSchemaEmbedding: false, defaultConfig: { minSeverity: 'high' } },
    )
    const schema = build(
      archiving([{ id: '@sec.scan', skippable: true, config: { minSeverity: 'critical' } }]),
      registry,
    )
    expect(schema.workflowStep('archiving')?.archiveChecks?.[0]?.id).toBe('@sec.scan')
    const effective = resolveEffectiveBindings({
      baseBindings: registry
        .bindings()
        .filter((b) => b.applicability.some((a) => a.scope === 'archive')),
      schema,
      operation: 'archive',
      registry,
    })
    const resolved = effective.find((b) => b.check.id === '@sec.scan')
    expect(resolved?.skippable).toBe(true)
    expect(resolved?.effectiveConfig).toEqual({ minSeverity: 'critical' })
  })

  it('rejects a plugin check without an archive binding when embedding is locked', () => {
    const registry = new CheckRegistry()
    registry.register('sec', pluginCheck('scan'), [{ scope: 'transition', to: 'verifying' }], {
      allowSchemaEmbedding: false,
    })
    expect(() => build(archiving([{ id: '@sec.scan' }]), registry)).toThrow(
      CheckEmbeddingForbiddenError,
    )
  })

  it('embeds a registered plugin check that allows schema embedding', () => {
    const registry = new CheckRegistry()
    registry.register('qa', pluginCheck('lint'), undefined)
    expect(() => build(archiving([{ id: '@qa.lint', skippable: true }]), registry)).not.toThrow()
  })

  it('applies the plugin binding policy, configuration and disablement locks on archive', () => {
    const policy = new CheckRegistry()
    policy.register(
      'sec',
      pluginCheck('scan'),
      [{ scope: 'archive', skippable: false, allowBindingOverride: false }],
      { allowSchemaEmbedding: false },
    )
    expect(() => build(archiving([{ id: '@sec.scan', skippable: true }]), policy)).toThrow(
      CheckBindingOverrideForbiddenError,
    )

    const config = new CheckRegistry()
    config.register('sec', pluginCheck('scan'), [{ scope: 'archive' }], {
      allowConfigOverride: false,
      allowSchemaEmbedding: false,
    })
    expect(() => build(archiving([{ id: '@sec.scan', config: { a: 1 } }]), config)).toThrow(
      CheckConfigOverrideForbiddenError,
    )

    const disable = new CheckRegistry()
    disable.register('sec', pluginCheck('scan'), [{ scope: 'archive' }], {
      allowDisable: false,
      allowSchemaEmbedding: false,
    })
    expect(() => build(archiving([{ id: '@sec.scan', disabled: true }]), disable)).toThrow(
      CheckDisableForbiddenError,
    )
  })
})
