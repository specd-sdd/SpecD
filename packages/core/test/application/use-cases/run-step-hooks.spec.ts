import { describe, it, expect, vi } from 'vitest'
import {
  RunStepHooks,
  type HookProgressEvent,
} from '../../../src/application/use-cases/run-step-hooks.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { SchemaMismatchError } from '../../../src/application/errors/schema-mismatch-error.js'
import { StepNotValidError } from '../../../src/domain/errors/step-not-valid-error.js'
import { HookNotFoundError } from '../../../src/domain/errors/hook-not-found-error.js'
import { HookResult } from '../../../src/domain/value-objects/hook-result.js'
import { type HookEntry } from '../../../src/domain/value-objects/workflow-step.js'
import {
  type HookRunner,
  type TemplateVariables,
} from '../../../src/application/ports/hook-runner.js'
import {
  makeChange,
  makeChangeRepository,
  makeArchiveRepository,
  makeArchivedChange,
  makeSchemaProvider,
  makeSchema,
  makeHookRunner,
} from './helpers.js'

/** Shorthand: creates a `RunStepHooks` with sensible defaults. */
function makeUseCase(opts: {
  changes?: ReturnType<typeof makeChangeRepository>
  archive?: ReturnType<typeof makeArchiveRepository>
  hookRunner?: HookRunner
  schema?: ReturnType<typeof makeSchema> | null
}): RunStepHooks {
  return new RunStepHooks(
    opts.changes ?? makeChangeRepository(),
    opts.archive ?? makeArchiveRepository(),
    opts.hookRunner ?? makeHookRunner(),
    makeSchemaProvider(opts.schema === undefined ? makeSchema() : opts.schema),
  )
}

/** Creates a schema with pre/post hooks on the 'implementing' step. */
function makeSchemaWithHooks(
  preHooks: HookEntry[] = [],
  postHooks: HookEntry[] = [],
): ReturnType<typeof makeSchema> {
  return makeSchema({
    workflow: [
      {
        step: 'implementing',
        requires: [],
        requiresTaskCompletion: [],
        hooks: { pre: preHooks, post: postHooks },
      },
    ],
  })
}

describe('RunStepHooks', () => {
  // ── Change Loading & Validation ──────────────────────────────────

  describe('change loading & validation', () => {
    it('throws ChangeNotFoundError when change does not exist', async () => {
      const uc = makeUseCase({ changes: makeChangeRepository([]) })

      await expect(
        uc.execute({ name: 'missing', step: 'implementing', phase: 'pre' }),
      ).rejects.toThrow(ChangeNotFoundError)
    })

    it('throws SchemaNotFoundError when schema cannot be resolved', async () => {
      const change = makeChange('my-change')
      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: null,
      })

      await expect(
        uc.execute({ name: 'my-change', step: 'implementing', phase: 'pre' }),
      ).rejects.toThrow(SchemaNotFoundError)
    })

    it('throws SchemaMismatchError when schema name does not match change schema name', async () => {
      const change = makeChange('my-change', { schemaName: 'alpha-schema' })
      const schema = makeSchema({ name: 'beta-schema' })
      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema,
      })

      await expect(
        uc.execute({ name: 'my-change', step: 'implementing', phase: 'pre' }),
      ).rejects.toThrow(SchemaMismatchError)
    })
  })

  // ── Step Validation ──────────────────────────────────────────────

  describe('step validation', () => {
    it('throws StepNotValidError when step is not a valid ChangeState', async () => {
      const change = makeChange('my-change')
      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchema(),
      })

      await expect(
        uc.execute({ name: 'my-change', step: 'not-a-state', phase: 'pre' }),
      ).rejects.toThrow(StepNotValidError)
    })

    it('accepts archiving as a valid step', async () => {
      const change = makeChange('my-change')
      const schema = makeSchema({ workflow: [] })
      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema,
      })

      const result = await uc.execute({ name: 'my-change', step: 'archiving', phase: 'pre' })
      expect(result).toEqual({ hooks: [], success: true, failedHook: null })
    })

    it('returns empty result when step is valid but schema has no workflowStep', async () => {
      const change = makeChange('my-change')
      // Schema with no workflow steps at all
      const schema = makeSchema({ workflow: [] })
      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema,
      })

      const result = await uc.execute({ name: 'my-change', step: 'implementing', phase: 'pre' })

      expect(result).toEqual({ hooks: [], success: true, failedHook: null })
    })
  })

  // ── Hook Collection & Filtering ──────────────────────────────────

  describe('hook collection & filtering', () => {
    it('filters out instruction hooks and only executes run hooks', async () => {
      const change = makeChange('my-change')
      const instrHook: HookEntry = { id: 'review', type: 'instruction', text: 'Review the code' }
      const runHook: HookEntry = { id: 'lint', type: 'run', command: 'pnpm lint' }

      const commands: string[] = []
      const hookRunner = {
        async run(command: string, _variables: TemplateVariables): Promise<HookResult> {
          commands.push(command)
          return new HookResult(0, '', '')
        },
      }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([instrHook, runHook]),
        hookRunner,
      })

      const result = await uc.execute({ name: 'my-change', step: 'implementing', phase: 'pre' })

      expect(commands).toEqual(['pnpm lint'])
      expect(result.hooks).toHaveLength(1)
      expect(result.hooks[0]!.id).toBe('lint')
    })

    it('--only filter finds matching run hook', async () => {
      const change = makeChange('my-change')
      const hookA: HookEntry = { id: 'lint', type: 'run', command: 'pnpm lint' }
      const hookB: HookEntry = { id: 'test', type: 'run', command: 'pnpm test' }

      const commands: string[] = []
      const hookRunner = {
        async run(command: string, _variables: TemplateVariables): Promise<HookResult> {
          commands.push(command)
          return new HookResult(0, '', '')
        },
      }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([hookA, hookB]),
        hookRunner,
      })

      const result = await uc.execute({
        name: 'my-change',
        step: 'implementing',
        phase: 'pre',
        only: 'test',
      })

      expect(commands).toEqual(['pnpm test'])
      expect(result.hooks).toHaveLength(1)
      expect(result.hooks[0]!.id).toBe('test')
    })

    it('--only filter throws HookNotFoundError(wrong-type) for instruction hook', async () => {
      const change = makeChange('my-change')
      const instrHook: HookEntry = { id: 'review', type: 'instruction', text: 'Review the code' }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([instrHook]),
      })

      await expect(
        uc.execute({
          name: 'my-change',
          step: 'implementing',
          phase: 'pre',
          only: 'review',
        }),
      ).rejects.toSatisfy((err: HookNotFoundError) => {
        expect(err).toBeInstanceOf(HookNotFoundError)
        expect(err.reason).toBe('wrong-type')
        return true
      })
    })

    it('--only filter throws HookNotFoundError(not-found) for missing ID', async () => {
      const change = makeChange('my-change')
      const runHook: HookEntry = { id: 'lint', type: 'run', command: 'pnpm lint' }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([runHook]),
      })

      await expect(
        uc.execute({
          name: 'my-change',
          step: 'implementing',
          phase: 'pre',
          only: 'does-not-exist',
        }),
      ).rejects.toSatisfy((err: HookNotFoundError) => {
        expect(err).toBeInstanceOf(HookNotFoundError)
        expect(err.reason).toBe('not-found')
        return true
      })
    })

    it('returns empty result when no run hooks after filtering', async () => {
      const change = makeChange('my-change')
      const instrHook: HookEntry = { id: 'review', type: 'instruction', text: 'Review the code' }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([instrHook]),
      })

      const result = await uc.execute({ name: 'my-change', step: 'implementing', phase: 'pre' })

      expect(result).toEqual({ hooks: [], success: true, failedHook: null })
    })
  })

  // ── Execution Semantics ──────────────────────────────────────────

  describe('execution semantics', () => {
    it('pre-phase fail-fast: stops on first failure, subsequent hooks NOT run', async () => {
      const change = makeChange('my-change')
      const hookA: HookEntry = { id: 'fail-hook', type: 'run', command: 'fail' }
      const hookB: HookEntry = { id: 'skip-hook', type: 'run', command: 'skip' }

      const commands: string[] = []
      const hookRunner = {
        async run(command: string, _variables: TemplateVariables): Promise<HookResult> {
          commands.push(command)
          if (command === 'fail') return new HookResult(1, '', 'error')
          return new HookResult(0, '', '')
        },
      }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([hookA, hookB]),
        hookRunner,
      })

      const result = await uc.execute({ name: 'my-change', step: 'implementing', phase: 'pre' })

      expect(result.success).toBe(false)
      expect(result.hooks).toHaveLength(1)
      expect(result.failedHook).not.toBeNull()
      expect(result.failedHook!.id).toBe('fail-hook')
      expect(commands).toEqual(['fail'])
    })

    it('pre-phase success: all hooks run, success is true', async () => {
      const change = makeChange('my-change')
      const hookA: HookEntry = { id: 'lint', type: 'run', command: 'pnpm lint' }
      const hookB: HookEntry = { id: 'test', type: 'run', command: 'pnpm test' }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([hookA, hookB]),
        hookRunner: makeHookRunner(0),
      })

      const result = await uc.execute({ name: 'my-change', step: 'implementing', phase: 'pre' })

      expect(result.success).toBe(true)
      expect(result.hooks).toHaveLength(2)
      expect(result.failedHook).toBeNull()
    })

    it('post-phase fail-soft: continues after failure, all hooks run', async () => {
      const change = makeChange('my-change')
      const hookA: HookEntry = { id: 'notify', type: 'run', command: 'notify' }
      const hookB: HookEntry = { id: 'cleanup', type: 'run', command: 'cleanup' }

      const commands: string[] = []
      const hookRunner = {
        async run(command: string, _variables: TemplateVariables): Promise<HookResult> {
          commands.push(command)
          if (command === 'notify') return new HookResult(1, '', 'failed')
          return new HookResult(0, '', '')
        },
      }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([], [hookA, hookB]),
        hookRunner,
      })

      const result = await uc.execute({ name: 'my-change', step: 'implementing', phase: 'post' })

      expect(result.success).toBe(false)
      expect(result.hooks).toHaveLength(2)
      expect(result.failedHook!.id).toBe('notify')
      expect(commands).toEqual(['notify', 'cleanup'])
    })

    it('post-phase success: all hooks run, success is true', async () => {
      const change = makeChange('my-change')
      const hookA: HookEntry = { id: 'notify', type: 'run', command: 'notify' }
      const hookB: HookEntry = { id: 'cleanup', type: 'run', command: 'cleanup' }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([], [hookA, hookB]),
        hookRunner: makeHookRunner(0),
      })

      const result = await uc.execute({ name: 'my-change', step: 'implementing', phase: 'post' })

      expect(result.success).toBe(true)
      expect(result.hooks).toHaveLength(2)
      expect(result.failedHook).toBeNull()
    })
  })

  // ── onProgress Callbacks ─────────────────────────────────────────

  describe('onProgress callbacks', () => {
    it('emits hook-start before each hook execution', async () => {
      const change = makeChange('my-change')
      const hook: HookEntry = { id: 'lint', type: 'run', command: 'pnpm lint' }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([hook]),
        hookRunner: makeHookRunner(0),
      })

      const events: HookProgressEvent[] = []
      await uc.execute({ name: 'my-change', step: 'implementing', phase: 'pre' }, (e) =>
        events.push(e),
      )

      expect(events[0]).toEqual({ type: 'hook-start', hookId: 'lint', command: 'pnpm lint' })
    })

    it('emits hook-done after each hook execution with correct fields', async () => {
      const change = makeChange('my-change')
      const hook: HookEntry = { id: 'lint', type: 'run', command: 'pnpm lint' }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([hook]),
        hookRunner: makeHookRunner(0),
      })

      const events: HookProgressEvent[] = []
      await uc.execute({ name: 'my-change', step: 'implementing', phase: 'pre' }, (e) =>
        events.push(e),
      )

      expect(events[1]).toEqual({
        type: 'hook-done',
        hookId: 'lint',
        success: true,
        exitCode: 0,
      })
    })

    it('events emitted for ALL hooks in a multiple-hooks scenario', async () => {
      const change = makeChange('my-change')
      const hookA: HookEntry = { id: 'lint', type: 'run', command: 'pnpm lint' }
      const hookB: HookEntry = { id: 'test', type: 'run', command: 'pnpm test' }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([hookA, hookB]),
        hookRunner: makeHookRunner(0),
      })

      const events: HookProgressEvent[] = []
      await uc.execute({ name: 'my-change', step: 'implementing', phase: 'pre' }, (e) =>
        events.push(e),
      )

      expect(events).toHaveLength(4)
      expect(events[0]).toMatchObject({ type: 'hook-start', hookId: 'lint' })
      expect(events[1]).toMatchObject({ type: 'hook-done', hookId: 'lint' })
      expect(events[2]).toMatchObject({ type: 'hook-start', hookId: 'test' })
      expect(events[3]).toMatchObject({ type: 'hook-done', hookId: 'test' })
    })

    it('onProgress is optional — no error when undefined', async () => {
      const change = makeChange('my-change')
      const hook: HookEntry = { id: 'lint', type: 'run', command: 'pnpm lint' }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([hook]),
        hookRunner: makeHookRunner(0),
      })

      // Calling without onProgress should not throw
      const result = await uc.execute({ name: 'my-change', step: 'implementing', phase: 'pre' })
      expect(result.success).toBe(true)
    })

    it('pre-phase fail-fast: hook-done emitted for failed hook but NOT for subsequent hooks', async () => {
      const change = makeChange('my-change')
      const hookA: HookEntry = { id: 'fail-hook', type: 'run', command: 'fail' }
      const hookB: HookEntry = { id: 'skip-hook', type: 'run', command: 'skip' }

      const hookRunner = {
        async run(command: string, _variables: TemplateVariables): Promise<HookResult> {
          if (command === 'fail') return new HookResult(1, '', 'error')
          return new HookResult(0, '', '')
        },
      }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([hookA, hookB]),
        hookRunner,
      })

      const events: HookProgressEvent[] = []
      await uc.execute({ name: 'my-change', step: 'implementing', phase: 'pre' }, (e) =>
        events.push(e),
      )

      // Should see start+done for the failed hook, nothing for the skipped hook
      expect(events).toHaveLength(2)
      expect(events[0]).toEqual({ type: 'hook-start', hookId: 'fail-hook', command: 'fail' })
      expect(events[1]).toEqual({
        type: 'hook-done',
        hookId: 'fail-hook',
        success: false,
        exitCode: 1,
      })
    })
  })

  // ── Template Variables ───────────────────────────────────────────

  describe('template variables', () => {
    it('builds correct TemplateVariables from change context', async () => {
      const change = makeChange('my-change')
      const hook: HookEntry = { id: 'lint', type: 'run', command: 'pnpm lint' }

      let capturedVars: unknown = null
      const hookRunner = {
        async run(_command: string, variables: unknown): Promise<HookResult> {
          capturedVars = variables
          return new HookResult(0, '', '')
        },
      }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([hook]),
        hookRunner,
      })

      await uc.execute({ name: 'my-change', step: 'implementing', phase: 'pre' })

      expect(capturedVars).toEqual({
        change: {
          name: 'my-change',
          workspace: 'default',
          path: '/test/changes/my-change',
        },
      })
    })

    it('uses first workspace or "default" fallback', async () => {
      // makeChange produces a change with no workspaces array on the entity,
      // so workspace falls back to 'default'. Verify that path.
      const change = makeChange('my-change')
      const hook: HookEntry = { id: 'lint', type: 'run', command: 'pnpm lint' }

      let capturedVars: unknown = null
      const hookRunner = {
        async run(_command: string, variables: unknown): Promise<HookResult> {
          capturedVars = variables
          return new HookResult(0, '', '')
        },
      }

      const uc = makeUseCase({
        changes: makeChangeRepository([change]),
        schema: makeSchemaWithHooks([hook]),
        hookRunner,
      })

      await uc.execute({ name: 'my-change', step: 'implementing', phase: 'pre' })

      // The change created by makeChange has no workspaces, so it falls back to 'default'
      expect((capturedVars as { change: { workspace: string } }).change.workspace).toBe('default')
    })
  })

  // ── Archive Fallback ───────────────────────────────────────────

  describe('archive fallback', () => {
    /** Schema with post hooks on 'archiving' step. */
    function makeArchivingSchema(
      postHooks: HookEntry[] = [{ id: 'post-hook', type: 'run', command: 'echo done' }],
    ): ReturnType<typeof makeSchema> {
      return makeSchema({
        workflow: [
          {
            step: 'archiving',
            requires: [],
            requiresTaskCompletion: [],
            hooks: { pre: [], post: postHooks },
          },
        ],
      })
    }

    it('falls back to archive when change not in ChangeRepository for archiving+post', async () => {
      const archived = makeArchivedChange('my-change')
      const commands: string[] = []
      const hookRunner = {
        async run(command: string): Promise<HookResult> {
          commands.push(command)
          return new HookResult(0, '', '')
        },
      }

      const uc = makeUseCase({
        changes: makeChangeRepository([]),
        archive: makeArchiveRepository([archived]),
        schema: makeArchivingSchema(),
        hookRunner,
      })

      const result = await uc.execute({
        name: 'my-change',
        step: 'archiving',
        phase: 'post',
      })

      expect(result.success).toBe(true)
      expect(result.hooks).toHaveLength(1)
      expect(commands).toEqual(['echo done'])
    })

    it('throws ChangeNotFoundError when change not in either repository', async () => {
      const uc = makeUseCase({
        changes: makeChangeRepository([]),
        archive: makeArchiveRepository([]),
        schema: makeArchivingSchema(),
      })

      await expect(
        uc.execute({ name: 'missing', step: 'archiving', phase: 'post' }),
      ).rejects.toThrow(ChangeNotFoundError)
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
        hookRunner: makeHookRunner(0),
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

    it('builds template variables from ArchivedChange properties', async () => {
      const archived = makeArchivedChange('my-change', { workspace: 'core' })
      let capturedVars: unknown = null
      const hookRunner = {
        async run(_command: string, variables: unknown): Promise<HookResult> {
          capturedVars = variables
          return new HookResult(0, '', '')
        },
      }

      const uc = makeUseCase({
        changes: makeChangeRepository([]),
        archive: makeArchiveRepository([archived]),
        schema: makeArchivingSchema(),
        hookRunner,
      })

      await uc.execute({ name: 'my-change', step: 'archiving', phase: 'post' })

      expect(capturedVars).toEqual({
        change: {
          name: 'my-change',
          workspace: 'core',
          path: `/test/archive/${archived.archivedName}`,
        },
      })
    })
  })
})
