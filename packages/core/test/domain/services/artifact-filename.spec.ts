import { describe, expect, it } from 'vitest'
import { ArtifactType } from '../../../src/domain/value-objects/artifact-type.js'
import { expectedArtifactFilename } from '../../../src/domain/services/artifact-filename.js'

describe('expectedArtifactFilename', () => {
  it('returns output basename for scope:change artifacts', () => {
    const artifactType = new ArtifactType({
      id: 'proposal',
      scope: 'change',
      output: 'proposal.md',
      requires: [],
      validations: [],
      deltaValidations: [],
      preHashCleanup: [],
    })

    expect(expectedArtifactFilename({ artifactType, key: 'proposal' })).toBe('proposal.md')
  })

  it('returns specs path for new spec-scoped artifacts', () => {
    const artifactType = new ArtifactType({
      id: 'specs',
      scope: 'spec',
      output: 'specs/**/spec.md',
      delta: true,
      requires: [],
      validations: [],
      deltaValidations: [],
      preHashCleanup: [],
    })

    expect(
      expectedArtifactFilename({
        artifactType,
        key: 'core:core/change-manifest',
        specExists: false,
      }),
    ).toBe('specs/core/core/change-manifest/spec.md')
  })

  it('returns delta path for existing delta-capable spec artifacts', () => {
    const artifactType = new ArtifactType({
      id: 'specs',
      scope: 'spec',
      output: 'specs/**/spec.md',
      delta: true,
      requires: [],
      validations: [],
      deltaValidations: [],
      preHashCleanup: [],
    })

    expect(
      expectedArtifactFilename({
        artifactType,
        key: 'cli:cli/change-validate',
        specExists: true,
      }),
    ).toBe('deltas/cli/cli/change-validate/spec.md.delta.yaml')
  })
})
