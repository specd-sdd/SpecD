import { describe, expect, it } from 'vitest'
import { run } from '../../../src/domain/checks/workflow-requires.js'
import {
  makeArtifactType,
  makeSchema,
  makeWorkflowStep,
} from '../../application/use-cases/helpers.js'
import { type ArtifactStatus } from '../../../src/domain/value-objects/artifact-status.js'

function schemaWithReadyRequires(): ReturnType<typeof makeSchema> {
  return makeSchema(
    [makeArtifactType('proposal'), makeArtifactType('specs')],
    [makeWorkflowStep('ready', { requires: ['proposal'] })],
  )
}

function statusMap(
  entries: readonly [string, ArtifactStatus][],
): ReadonlyMap<string, ArtifactStatus> {
  return new Map(entries)
}

describe('workflow.requires fail codes', () => {
  it('fails REVIEW_REQUIRED when a required artifact is pending-review', () => {
    const result = run({
      schema: schemaWithReadyRequires(),
      target: 'ready',
      effectiveStatusByArtifact: statusMap([['proposal', 'pending-review']]),
    })
    expect(result.outcome).toBe('fail')
    if (result.outcome !== 'fail') return
    expect(result.code).toBe('REVIEW_REQUIRED')
  })

  it('fails ARTIFACT_DRIFT when a required artifact is drifted-pending-review', () => {
    const result = run({
      schema: schemaWithReadyRequires(),
      target: 'ready',
      effectiveStatusByArtifact: statusMap([['proposal', 'drifted-pending-review']]),
    })
    expect(result.outcome).toBe('fail')
    if (result.outcome !== 'fail') return
    expect(result.code).toBe('ARTIFACT_DRIFT')
  })

  it('fails PENDING_PARENT_REVIEW when a required artifact is pending-parent-artifact-review', () => {
    const result = run({
      schema: schemaWithReadyRequires(),
      target: 'ready',
      effectiveStatusByArtifact: statusMap([['proposal', 'pending-parent-artifact-review']]),
    })
    expect(result.outcome).toBe('fail')
    if (result.outcome !== 'fail') return
    expect(result.code).toBe('PENDING_PARENT_REVIEW')
  })

  it('fails INCOMPLETE_ARTIFACT when a required artifact is missing or in-progress', () => {
    const missing = run({
      schema: schemaWithReadyRequires(),
      target: 'ready',
      effectiveStatusByArtifact: statusMap([]),
    })
    expect(missing.outcome).toBe('fail')
    if (missing.outcome !== 'fail') return
    expect(missing.code).toBe('INCOMPLETE_ARTIFACT')

    const inProgress = run({
      schema: schemaWithReadyRequires(),
      target: 'ready',
      effectiveStatusByArtifact: statusMap([['proposal', 'in-progress']]),
    })
    expect(inProgress.outcome).toBe('fail')
    if (inProgress.outcome !== 'fail') return
    expect(inProgress.code).toBe('INCOMPLETE_ARTIFACT')
  })
})
