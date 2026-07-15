import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerChangeRunHooks } from '../../src/commands/change/run-hooks.js'

function setup() {
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: {} as never,
    configFilePath: null,
    kernel,
  })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('change run-hooks', () => {
  it('renders observable text progress while a hook is active and writes a summary to stdout', async () => {
    const { kernel, stderr, stdout } = setup()
    kernel.changes.runStepHooks.execute.mockImplementation(async (_input, onProgress) => {
      onProgress?.({ type: 'hook-start', hookId: 'lint', command: 'pnpm lint' })
      onProgress?.({
        type: 'hook-output',
        hookId: 'lint',
        stream: 'stdout',
        line: 'running lint',
      })
      onProgress?.({ type: 'hook-heartbeat', hookId: 'lint', elapsedMs: 5000 })
      onProgress?.({ type: 'hook-done', hookId: 'lint', success: true, exitCode: 0 })
      return {
        success: true,
        failedHooks: [],
        hooks: [
          {
            id: 'lint',
            command: 'pnpm lint',
            exitCode: 0,
            stdout: 'running lint\n',
            stderr: '',
            success: true,
          },
        ],
      }
    })

    const program = makeProgram()
    registerChangeRunHooks(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'run-hooks',
      'my-change',
      'implementing',
      '--phase',
      'pre',
    ])

    const err = stderr()
    expect(err).toContain('[running] lint')
    expect(err).toContain('running lint')
    expect(err).toContain('[done] lint')
    expect(err).toContain('  exit: 0')
    expect(err).not.toContain('last output:')
    expect(err).toContain(
      '[all hooks done] hooks=1 done=1 failed=0 -------------------------------------',
    )

    const out = stdout()
    expect(out).toContain('Hook summary')
    expect(out).toContain('result: ok')
    expect(out).toContain('hooks: 1')
    expect(out).toContain('done: 1')
    expect(out).toContain('failed: 0')
    expect(out).toContain('[done] lint')
    expect(out).toContain('last 10 lines:')
    expect(out).toContain('running lint')
  })

  it('writes failed hook summary with full output to stdout', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.runStepHooks.execute.mockImplementation(async (_input, onProgress) => {
      onProgress?.({ type: 'hook-start', hookId: 'lint', command: 'pnpm lint' })
      onProgress?.({
        type: 'hook-output',
        hookId: 'lint',
        stream: 'stdout',
        line: 'line-a',
      })
      onProgress?.({ type: 'hook-done', hookId: 'lint', success: false, exitCode: 1 })
      return {
        success: false,
        failedHooks: [
          {
            id: 'lint',
            command: 'pnpm lint',
            exitCode: 1,
            stdout: 'line-a\n',
            stderr: 'line-b\n',
            success: false,
          },
        ],
        hooks: [
          {
            id: 'lint',
            command: 'pnpm lint',
            exitCode: 1,
            stdout: 'line-a\n',
            stderr: 'line-b\n',
            success: false,
          },
        ],
      }
    })

    const program = makeProgram()
    registerChangeRunHooks(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'run-hooks',
        'my-change',
        'implementing',
        '--phase',
        'pre',
      ])
      .catch(() => {})

    expect(stderr()).toContain('[failed] lint')
    expect(stderr()).toContain('  exit: 1')
    expect(stderr()).not.toContain('full output:')
    expect(stderr()).toContain(
      '[all hooks done] hooks=1 done=0 failed=1 -------------------------------------',
    )
    expect(stdout()).toContain('result: error')
    expect(stdout()).toContain('hooks: 1')
    expect(stdout()).toContain('done: 0')
    expect(stdout()).toContain('failed: 1')
    expect(stdout()).toContain('[failed] lint')
    expect(stdout()).toContain('full output:')
    expect(stdout()).toContain('line-a')
    expect(stdout()).toContain('line-b')
  })

  it('emits structured progress and completion records on stdout in json mode', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.runStepHooks.execute.mockImplementation(async (_input, onProgress) => {
      onProgress?.({ type: 'hook-start', hookId: 'lint', command: 'pnpm lint' })
      onProgress?.({ type: 'hook-heartbeat', hookId: 'lint', elapsedMs: 5000 })
      onProgress?.({ type: 'hook-done', hookId: 'lint', success: true, exitCode: 0 })
      return {
        success: true,
        failedHooks: [],
        hooks: [
          {
            id: 'lint',
            command: 'pnpm lint',
            exitCode: 0,
            stdout: '',
            stderr: '',
            success: true,
          },
        ],
      }
    })

    const program = makeProgram()
    registerChangeRunHooks(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'run-hooks',
      'my-change',
      'implementing',
      '--phase',
      'pre',
      '--format',
      'json',
    ])

    expect(stderr()).toBe('')
    const lines = stdout()
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines[0]).toEqual({
      stream: 'hook-progress',
      event: { type: 'hook-start', hookId: 'lint', command: 'pnpm lint' },
    })
    expect(lines[1]).toEqual({
      stream: 'hook-progress',
      event: { type: 'hook-heartbeat', hookId: 'lint', elapsedMs: 5000 },
    })
    expect(lines[2]).toEqual({
      stream: 'hook-progress',
      event: { type: 'hook-done', hookId: 'lint', success: true, exitCode: 0 },
    })
    expect(lines[3]).toEqual({
      stream: 'run-hooks',
      event: {
        type: 'complete',
        result: {
          result: 'ok',
          hooks: [{ id: 'lint', command: 'pnpm lint', exitCode: 0, success: true }],
        },
      },
    })
  })

  it('emits failedHooks in the terminal json completion record for failed post hooks', async () => {
    const { kernel, stdout, stderr } = setup()
    kernel.changes.runStepHooks.execute.mockResolvedValue({
      success: false,
      failedHooks: [
        {
          id: 'lint',
          command: 'pnpm lint',
          exitCode: 1,
          stdout: '',
          stderr: 'lint failed',
          success: false,
        },
        {
          id: 'test',
          command: 'pnpm test',
          exitCode: 2,
          stdout: '',
          stderr: 'test failed',
          success: false,
        },
      ],
      hooks: [
        {
          id: 'lint',
          command: 'pnpm lint',
          exitCode: 1,
          stdout: '',
          stderr: 'lint failed',
          success: false,
        },
        {
          id: 'test',
          command: 'pnpm test',
          exitCode: 2,
          stdout: '',
          stderr: 'test failed',
          success: false,
        },
      ],
    })

    const program = makeProgram()
    registerChangeRunHooks(program.command('change'))
    await program
      .parseAsync([
        'node',
        'specd',
        'change',
        'run-hooks',
        'my-change',
        'implementing',
        '--phase',
        'post',
        '--format',
        'json',
      ])
      .catch(() => {})

    expect(stderr()).toContain('fatal: process.exit(2)')
    const lines = stdout()
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)

    expect(lines.at(-1)).toEqual({
      stream: 'run-hooks',
      event: {
        type: 'complete',
        result: {
          result: 'error',
          code: 'HOOK_FAILED',
          hooks: [
            {
              id: 'lint',
              command: 'pnpm lint',
              exitCode: 1,
              success: false,
              stderr: 'lint failed',
            },
            {
              id: 'test',
              command: 'pnpm test',
              exitCode: 2,
              success: false,
              stderr: 'test failed',
            },
          ],
          failedHooks: [
            {
              id: 'lint',
              command: 'pnpm lint',
              exitCode: 1,
              success: false,
              stderr: 'lint failed',
            },
            {
              id: 'test',
              command: 'pnpm test',
              exitCode: 2,
              success: false,
              stderr: 'test failed',
            },
          ],
        },
      },
    })
  })
})
