import { describe, it, expect, vi } from 'vitest'
import { GetHookInstructions } from '../../../src/application/use-cases/get-hook-instructions.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { TemplateExpander } from '../../../src/application/template-expander.js'
import { type HookEntry } from '../../../src/domain/value-objects/workflow-step.js'
import { HookResult } from '../../../src/domain/value-objects/hook-result.js'
import {
  makeChange,
  makeChangeRepository,
  makeArchiveRepository,
  makeArchivedChange,
  makeSchemaProvider,
  makeSchema,
} from './helpers.js'

/** Creates a template expander with a test project root. */
function makeExpander(): TemplateExpander {
  return new TemplateExpander({ project: { root: '/test/project' } })
}

/** Creates a schema with instruction hooks on the 'archiving' step. */
function makeArchivingSchema(
  postHooks: HookEntry[] = [
    {
      id: 'post-instr',
      type: 'instruction',
      text: 'Post-archive: {{change.name}} at {{change.path}}',
    },
  ],
): ReturnType<typeof makeSchema> {
  return makeSchema({
    workflow: [
      {
        step: 'archiving',
        requires: [],
        hooks: { pre: [], post: postHooks },
      },
    ],
  })
}

/** Shorthand: creates a `GetHookInstructions` with sensible defaults. */
function makeUseCase(opts: {
  changes?: ReturnType<typeof makeChangeRepository>
  archive?: ReturnType<typeof makeArchiveRepository>
  schema?: ReturnType<typeof makeSchema> | null
}): GetHookInstructions {
  return new GetHookInstructions(
    opts.changes ?? makeChangeRepository(),
    opts.archive ?? makeArchiveRepository(),
    makeSchemaProvider(opts.schema === undefined ? makeSchema() : opts.schema),
    makeExpander(),
  )
}

describe('GetHookInstructions — archive fallback', () => {
  it('falls back to archive when change not in ChangeRepository for archiving+post', async () => {
    const archived = makeArchivedChange('my-change')

    const uc = makeUseCase({
      changes: makeChangeRepository([]),
      archive: makeArchiveRepository([archived]),
      schema: makeArchivingSchema(),
    })

    const result = await uc.execute({
      name: 'my-change',
      step: 'archiving',
      phase: 'post',
    })

    expect(result.phase).toBe('post')
    expect(result.instructions).toHaveLength(1)
    expect(result.instructions[0]!.id).toBe('post-instr')
    expect(result.instructions[0]!.text).toContain('my-change')
    expect(result.instructions[0]!.text).toContain(`/test/archive/${archived.archivedName}`)
  })

  it('throws ChangeNotFoundError when change not in either repository', async () => {
    const uc = makeUseCase({
      changes: makeChangeRepository([]),
      archive: makeArchiveRepository([]),
      schema: makeArchivingSchema(),
    })

    await expect(uc.execute({ name: 'missing', step: 'archiving', phase: 'post' })).rejects.toThrow(
      ChangeNotFoundError,
    )
  })

  it('uses active change when found, does not query archive', async () => {
    const change = makeChange('my-change')
    const archived = makeArchivedChange('my-change')
    const archive = makeArchiveRepository([archived])
    const getSpy = vi.spyOn(archive, 'get')

    const uc = makeUseCase({
      changes: makeChangeRepository([change]),
      archive,
      schema: makeArchivingSchema(),
    })

    await uc.execute({ name: 'my-change', step: 'archiving', phase: 'post' })

    expect(getSpy).not.toHaveBeenCalled()
  })

  it('throws ChangeNotFoundError for non-archiving step even if archived', async () => {
    const archived = makeArchivedChange('my-change')

    const uc = makeUseCase({
      changes: makeChangeRepository([]),
      archive: makeArchiveRepository([archived]),
      schema: makeSchema(),
    })

    await expect(
      uc.execute({ name: 'my-change', step: 'implementing', phase: 'post' }),
    ).rejects.toThrow(ChangeNotFoundError)
  })
})
