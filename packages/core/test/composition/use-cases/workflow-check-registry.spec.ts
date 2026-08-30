import { describe, expect, it } from 'vitest'
import { resolveWorkflowCheckRegistry } from '../../../src/composition/use-cases/workflow-check-registry.js'
import { type CompositionResolver } from '../../../src/composition/composition-resolver.js'
import { Change } from '../../../src/domain/entities/change.js'
import { type CheckExecutionContext } from '../../../src/domain/services/transition-checks.js'
import {
  makeChangeRepository,
  makeListWorkspaces,
  makeNoopParsers,
  makeRunStepHooks,
  makeSchema,
  makeSchemaProvider,
  testActor,
} from '../../application/use-cases/helpers.js'

function makeChange(name: string, specIds: readonly string[]): Change {
  return new Change({
    name,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: [...specIds],
    history: [
      {
        type: 'created',
        at: new Date('2024-01-01T00:00:00Z'),
        by: testActor,
        specIds: [...specIds],
        schemaName: '@specd/schema-std',
        schemaVersion: 1,
      },
    ],
  })
}

function makeResolver(changes: Change[]): CompositionResolver {
  const repo = makeChangeRepository(changes)
  return {
    getChangeRepository: () => repo,
    getSchemaProvider: () => makeSchemaProvider(makeSchema()),
    getListWorkspaces: () => makeListWorkspaces(),
    getArtifactParserRegistry: () => makeNoopParsers(),
    getExtractorTransforms: () => new Map(),
    getSpecWorkspaceRoutes: () => [],
    getRunStepHooks: () => makeRunStepHooks(),
    getContentHasher: () => ({ hash: () => 'sha256:test' }),
  } as unknown as CompositionResolver
}

function archiveCtx(change: Change): CheckExecutionContext {
  return {
    change,
    schema: makeSchema(),
    attempt: { scope: 'archive' },
    approvals: { spec: false, signoff: false },
    allowOverlap: false,
    allowOutOfScope: false,
    effectiveStatusByArtifact: new Map(),
  }
}

describe('resolveWorkflowCheckRegistry', () => {
  it('wires spec.overlap peers when includeOverlapDetection is true', async () => {
    const alpha = makeChange('alpha', ['core:core/config'])
    const beta = makeChange('beta', ['core:core/config'])
    const registry = resolveWorkflowCheckRegistry(makeResolver([alpha, beta]), {
      includeOverlapDetection: true,
    })
    const overlap = registry.archiveBindings.find((binding) => binding.check.id === 'spec.overlap')
    expect(overlap).toBeDefined()

    const result = await overlap!.check.execute(archiveCtx(alpha))

    expect(result.outcome).toBe('fail')
    if (result.outcome !== 'fail') return
    expect(result.message).toContain('beta (core:core/config)')
    expect(result.details).toMatchObject({
      peers: [{ changeName: 'beta', overlappingSpecIds: ['core:core/config'] }],
    })
  })

  it('does not block overlap when includeOverlapDetection is omitted', async () => {
    const alpha = makeChange('alpha', ['core:core/config'])
    const beta = makeChange('beta', ['core:core/config'])
    const registry = resolveWorkflowCheckRegistry(makeResolver([alpha, beta]))
    const overlap = registry.archiveBindings.find((binding) => binding.check.id === 'spec.overlap')
    expect(overlap).toBeDefined()

    const result = await overlap!.check.execute(archiveCtx(alpha))

    expect(result.outcome).toBe('pass')
  })
})
