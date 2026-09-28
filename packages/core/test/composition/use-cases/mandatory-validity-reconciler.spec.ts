import { describe, expect, it } from 'vitest'
import { createEditChange } from '../../../src/composition/use-cases/edit-change.js'
import { createValidateArtifacts } from '../../../src/composition/use-cases/validate-artifacts.js'
import { createArchiveChange } from '../../../src/composition/use-cases/archive-change.js'
import { InvalidCompositionFactoryArgumentsError } from '../../../src/domain/errors/invalid-composition-factory-arguments-error.js'

describe('mandatory validity reconciler composition', () => {
  it('rejects EditChange explicit deps without reconcile', () => {
    expect(() =>
      createEditChange({
        changes: {},
        listWorkspaces: {},
        actor: {},
        schemaProvider: {},
      } as never),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })

  it('rejects ValidateArtifacts explicit deps without reconcile', () => {
    expect(() =>
      createValidateArtifacts({
        changes: {},
        listWorkspaces: {},
        schemaProvider: {},
        parsers: new Map(),
        actor: {},
        contentHasher: {},
        extractorTransforms: new Map(),
        workspaceRoutes: [],
      } as never),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })

  it('rejects ArchiveChange explicit deps without reconcile', () => {
    expect(() =>
      createArchiveChange({
        changes: {},
        listWorkspaces: {},
        archive: {},
        archiveBindings: [],
        actor: {},
        parsers: new Map(),
        schemaProvider: {},
        materializeMetadata: {},
        extractorTransforms: new Map(),
        workspaceRoutes: [],
        projectRoot: '/tmp/project',
        batchSnapshot: {},
        contentHasher: {},
      } as never),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})
