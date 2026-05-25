import { describe, expect, it } from 'vitest'
import {
  groupChangeArtifactEntries,
  sortSpecScopedArtifactFiles,
} from '../src/lib/group-change-artifacts.js'

describe('groupChangeArtifactEntries', () => {
  it('groups change-scoped files by artifact type in DAG order', () => {
    const groups = groupChangeArtifactEntries([
      { filename: 'tasks.md', artifactType: 'tasks', state: 'complete' },
      { filename: 'proposal.md', artifactType: 'proposal', state: 'complete' },
      { filename: 'design.md', artifactType: 'design', state: 'missing' },
    ])

    expect(groups.map((g) => g.scope)).toEqual(['change'])
    expect(groups[0]!.typeGroups!.map((t) => t.type)).toEqual(['proposal', 'design', 'tasks'])
  })

  it('groups spec-scoped files by specId with spec.md first', () => {
    const groups = groupChangeArtifactEntries([
      {
        filename: 'specs/ui/z/spec.md',
        artifactType: 'specs',
        state: 'complete',
      },
      {
        filename: 'specs/ui/z/verify.md',
        artifactType: 'verify',
        state: 'complete',
      },
      {
        filename: 'deltas/core/a/spec.md.delta.yaml',
        artifactType: 'specs',
        state: 'complete',
      },
      {
        filename: 'specs/core/a/spec.md',
        artifactType: 'specs',
        state: 'complete',
      },
    ])

    expect(groups.map((g) => g.scope)).toEqual(['spec'])
    expect(groups[0]!.specGroups!.map((s) => s.specId)).toEqual(['core:a', 'ui:z'])
    expect(groups[0]!.specGroups![1]!.files.map((f) => f.filename)).toEqual([
      'specs/ui/z/spec.md',
      'specs/ui/z/verify.md',
    ])
  })

  it('emits change before spec', () => {
    const groups = groupChangeArtifactEntries([
      { filename: 'proposal.md', artifactType: 'proposal' },
      { filename: 'specs/ui/foo/spec.md', artifactType: 'specs' },
    ])
    expect(groups.map((g) => g.scope)).toEqual(['change', 'spec'])
  })

  it('lists each change artifact type once even with many files', () => {
    const groups = groupChangeArtifactEntries([
      { filename: 'proposal.md', artifactType: 'proposal' },
      { filename: 'proposal.md.bak', artifactType: 'proposal' },
    ])
    expect(groups[0]!.typeGroups).toHaveLength(1)
    expect(groups[0]!.typeGroups![0]!.type).toBe('proposal')
    expect(groups[0]!.typeGroups![0]!.files).toHaveLength(2)
  })
})

describe('sortSpecScopedArtifactFiles', () => {
  it('places spec.md before other files alphabetically', () => {
    const sorted = sortSpecScopedArtifactFiles([
      { filename: 'specs/ui/a/verify.md', state: '', displayStatus: '' },
      { filename: 'specs/ui/a/spec.md', state: '', displayStatus: '' },
      { filename: 'deltas/ui/a/spec.md.delta.yaml', state: '', displayStatus: '' },
    ])
    expect(sorted.map((f) => f.filename)).toEqual([
      'specs/ui/a/spec.md',
      'deltas/ui/a/spec.md.delta.yaml',
      'specs/ui/a/verify.md',
    ])
  })
})
