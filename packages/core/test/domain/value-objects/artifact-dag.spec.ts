import { describe, it, expect } from 'vitest'
import { ArtifactDag } from '../../../src/domain/value-objects/artifact-dag.js'
import { ArtifactType } from '../../../src/domain/value-objects/artifact-type.js'
import { Schema } from '../../../src/domain/value-objects/schema.js'

function artifact(
  id: string,
  requires: readonly string[] = [],
  scope: 'change' | 'spec' = 'change',
): ArtifactType {
  return new ArtifactType({
    id,
    scope,
    output: `${id}.md`,
    requires,
    validations: [],
    deltaValidations: [],
    preHashCleanup: [],
  })
}

const stdLikeArtifacts = [
  artifact('proposal'),
  artifact('specs', ['proposal'], 'spec'),
  artifact('verify', ['specs'], 'spec'),
  artifact('design', ['proposal', 'specs', 'verify']),
  artifact('tasks', ['specs', 'design']),
]

describe('ArtifactDag', () => {
  it('returns schema-std topological order', () => {
    const dag = ArtifactDag.from(stdLikeArtifacts)
    expect(dag.topologicalOrder()).toEqual(['proposal', 'specs', 'verify', 'design', 'tasks'])
  })

  it('returns roots without requires', () => {
    const dag = ArtifactDag.from(stdLikeArtifacts)
    expect(dag.roots()).toEqual(['proposal'])
  })

  it('returns direct children via childrenOf', () => {
    const dag = ArtifactDag.from(stdLikeArtifacts)
    expect(dag.childrenOf('proposal')).toEqual(['specs', 'design'])
    expect(dag.childrenOf('specs')).toEqual(['verify', 'design', 'tasks'])
  })

  it('returns descendants excluding seed ids', () => {
    const dag = ArtifactDag.from(stdLikeArtifacts)
    expect(dag.descendantsOf(['specs'])).toEqual(['verify', 'design', 'tasks'])
  })

  it('memoizes on Schema.artifactDag()', () => {
    const schema = new Schema('schema', 'test', 1, stdLikeArtifacts, [])
    const first = schema.artifactDag()
    const second = schema.artifactDag()
    expect(first).toBe(second)
  })
})
