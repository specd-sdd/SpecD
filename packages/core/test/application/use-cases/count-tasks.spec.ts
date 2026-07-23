import { describe, expect, it } from 'vitest'
import { CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { buildSchema } from '../../../src/domain/services/build-schema.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import {
  makeArtifactType,
  makeChange,
  makeChangeRepository,
  makeSchema,
  makeSchemaProvider,
} from './helpers.js'

describe('CountTasks', () => {
  it('aggregates files and accepts uppercase default complete markers', async () => {
    const change = makeChange('count')
    const tasks = new ChangeArtifact({ type: 'tasks' })
    tasks.setFile(new ArtifactFile({ key: 'one', filename: 'one.md' }))
    tasks.setFile(new ArtifactFile({ key: 'two', filename: 'two.md' }))
    change.setArtifact(tasks)
    const repo = makeChangeRepository([change])
    repo.artifact = async (_change, filename) =>
      new SpecArtifact(filename, filename === 'one.md' ? '- [X] done\n- [ ] todo' : '- [x] done')
    const schema = buildSchema(
      '#test',
      {
        kind: 'schema',
        name: 'test',
        version: 1,
        artifacts: [{ id: 'tasks', scope: 'change', output: 'tasks.md', hasTasks: true }],
      },
      new Map(),
    )

    const result = await new CountTasks(repo, makeSchemaProvider(schema)).execute({ change })

    expect(result.byArtifact.tasks).toEqual({ complete: 2, incomplete: 1, total: 3 })
    expect(result.total).toEqual({ complete: 2, incomplete: 1, total: 3 })
  })

  it('aggregates counts across distinct task artifact types', async () => {
    const change = makeChange('multiple-artifacts')
    const tasks = new ChangeArtifact({ type: 'tasks' })
    tasks.setFile(new ArtifactFile({ key: 'tasks', filename: 'tasks.md' }))
    const checklist = new ChangeArtifact({ type: 'checklist' })
    checklist.setFile(new ArtifactFile({ key: 'checklist', filename: 'checklist.md' }))
    change.setArtifact(tasks)
    change.setArtifact(checklist)
    const repo = makeChangeRepository([change])
    repo.artifact = async (_change, filename) =>
      new SpecArtifact(
        filename,
        filename === 'tasks.md'
          ? '- [x] first\n- [x] second\n- [ ] unfinished'
          : '- [x] third\n- [x] fourth\n- [x] fifth',
      )
    const schema = makeSchema([
      makeArtifactType('tasks', {
        hasTasks: true,
        taskCompletionCheck: {
          incompletePattern: '^\\s*-\\s+\\[ \\]',
          completePattern: '^\\s*-\\s+\\[[xX]\\]',
        },
      }),
      makeArtifactType('checklist', {
        hasTasks: true,
        taskCompletionCheck: {
          incompletePattern: '^\\s*-\\s+\\[ \\]',
          completePattern: '^\\s*-\\s+\\[[xX]\\]',
        },
      }),
    ])

    const result = await new CountTasks(repo, makeSchemaProvider(schema)).execute({ change })

    expect(result.byArtifact).toEqual({
      tasks: { complete: 2, incomplete: 1, total: 3 },
      checklist: { complete: 3, incomplete: 0, total: 3 },
    })
    expect(result.total).toEqual({ complete: 5, incomplete: 1, total: 6 })
  })

  it('keeps a zero-valued entry when both configured patterns are unsafe', async () => {
    const change = makeChange('unsafe-patterns')
    const tasks = new ChangeArtifact({ type: 'tasks' })
    tasks.setFile(new ArtifactFile({ key: 'tasks', filename: 'tasks.md' }))
    change.setArtifact(tasks)
    const repo = makeChangeRepository([change])
    repo.artifact = async (_change, filename) => new SpecArtifact(filename, '- [ ] unfinished')
    const schema = makeSchema([
      makeArtifactType('tasks', {
        hasTasks: true,
        taskCompletionCheck: { incompletePattern: '(', completePattern: '(' },
      }),
    ])

    const result = await new CountTasks(repo, makeSchemaProvider(schema)).execute({ change })

    expect(result.byArtifact.tasks).toEqual({ complete: 0, incomplete: 0, total: 0 })
    expect(result.total).toEqual({ complete: 0, incomplete: 0, total: 0 })
  })

  it('counts with the safe resolved pattern when the other pattern is unsafe', async () => {
    const change = makeChange('one-unsafe-pattern')
    const tasks = new ChangeArtifact({ type: 'tasks' })
    tasks.setFile(new ArtifactFile({ key: 'tasks', filename: 'tasks.md' }))
    change.setArtifact(tasks)
    const repo = makeChangeRepository([change])
    repo.artifact = async (_change, filename) =>
      new SpecArtifact(filename, '- [x] done\n- [ ] unfinished')
    const schema = makeSchema([
      makeArtifactType('tasks', {
        hasTasks: true,
        taskCompletionCheck: {
          incompletePattern: '(',
          completePattern: '^\\s*-\\s+\\[[xX]\\]',
        },
      }),
    ])

    const result = await new CountTasks(repo, makeSchemaProvider(schema)).execute({ change })

    expect(result.byArtifact.tasks).toEqual({ complete: 1, incomplete: 0, total: 1 })
    expect(result.total).toEqual({ complete: 1, incomplete: 0, total: 1 })
  })

  it('omits missing content and ignores artifacts without task capability', async () => {
    const change = makeChange('no-content')
    const tasks = new ChangeArtifact({ type: 'tasks' })
    tasks.setFile(new ArtifactFile({ key: 'tasks', filename: 'tasks.md' }))
    const proposal = new ChangeArtifact({ type: 'proposal' })
    proposal.setFile(new ArtifactFile({ key: 'proposal', filename: 'proposal.md' }))
    change.setArtifact(tasks)
    change.setArtifact(proposal)
    const repo = makeChangeRepository([change])
    repo.artifact = async () => null
    const schema = makeSchema([
      makeArtifactType('tasks', {
        hasTasks: true,
        taskCompletionCheck: {
          incompletePattern: '^\\s*-\\s+\\[ \\]',
          completePattern: '^\\s*-\\s+\\[[xX]\\]',
        },
      }),
      makeArtifactType('proposal', { hasTasks: false, taskCompletionCheck: {} }),
    ])

    const result = await new CountTasks(repo, makeSchemaProvider(schema)).execute({ change })

    expect(result.byArtifact).toEqual({})
    expect(result.total).toEqual({ complete: 0, incomplete: 0, total: 0 })
  })
})
