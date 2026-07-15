import { describe, expect, it, vi, afterEach } from 'vitest'
import { createHookProgressPresenter } from '../../src/commands/change/_hook-progress-presenter.js'
import { captureStderr } from './helpers.js'

afterEach(() => vi.restoreAllMocks())

describe('createHookProgressPresenter', () => {
  it('renders append-only running snapshots in non-interactive text mode', () => {
    const stderr = captureStderr()
    const presenter = createHookProgressPresenter({
      format: 'text',
      stream: process.stderr,
    })

    presenter.onEvent({ type: 'hook-start', hookId: 'lint', command: 'pnpm lint' })
    presenter.onEvent({
      type: 'hook-output',
      hookId: 'lint',
      stream: 'stdout',
      line: 'running lint',
    })
    presenter.onEvent({
      type: 'hook-output',
      hookId: 'lint',
      stream: 'stdout',
      line: '',
    })
    presenter.onEvent({ type: 'hook-heartbeat', hookId: 'lint', elapsedMs: 5000 })
    presenter.finalizeHook({
      id: 'lint',
      command: 'pnpm lint',
      success: true,
      exitCode: 0,
      stdout: 'running lint\n',
      stderr: '',
    })

    const output = stderr()
    expect(output).toContain('[running] lint')
    expect(output).toContain('[still running] lint')
    expect(output).toContain('  | running lint')
    expect(output).toContain('[done] lint')
    expect(output).toContain('  exit: 0')
    expect(output.match(/command: pnpm lint/g)).toHaveLength(1)
    expect(output).not.toContain('last lines:')
  })

  it('renders compact failed output in non-interactive text mode', () => {
    const stderr = captureStderr()
    const presenter = createHookProgressPresenter({
      format: 'text',
      stream: process.stderr,
    })

    presenter.onEvent({ type: 'hook-start', phase: 'pre', hookId: 'test', command: 'pnpm test' })
    presenter.onEvent({
      type: 'hook-output',
      phase: 'pre',
      hookId: 'test',
      stream: 'stdout',
      line: 'line-a',
    })
    presenter.onEvent({
      type: 'hook-output',
      phase: 'pre',
      hookId: 'test',
      stream: 'stderr',
      line: 'line-b',
    })
    presenter.finalizeHook({
      phase: 'pre',
      id: 'test',
      command: 'pnpm test',
      success: false,
      exitCode: 1,
      stdout: 'line-a\n',
      stderr: 'line-b\n',
    })

    const output = stderr()
    const failedBlock = output.slice(output.lastIndexOf('[failed]'))
    expect(output).toContain('[failed] pre › test')
    expect(output).toContain('  exit: 1')
    expect(failedBlock).not.toContain('full output:')
    expect(failedBlock).not.toContain('line-a')
    expect(failedBlock).not.toContain('line-b')
  })

  it('emits structured hook-progress events to stderr for json format', () => {
    const stderr = captureStderr()
    const presenter = createHookProgressPresenter({
      format: 'json',
      stream: process.stderr,
    })

    presenter.onEvent({ type: 'hook-start', hookId: 'lint', command: 'pnpm lint' })
    presenter.onEvent({ type: 'hook-heartbeat', hookId: 'lint', elapsedMs: 5000 })

    const lines = stderr()
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { stream: string; event: Record<string, unknown> })

    expect(lines[0]).toEqual({
      stream: 'hook-progress',
      event: { type: 'hook-start', hookId: 'lint', command: 'pnpm lint' },
    })
    expect(lines[1]).toEqual({
      stream: 'hook-progress',
      event: { type: 'hook-heartbeat', hookId: 'lint', elapsedMs: 5000 },
    })
  })

  it('does not emit plain-text completion lines in json format', () => {
    const stderr = captureStderr()
    const presenter = createHookProgressPresenter({
      format: 'json',
      stream: process.stderr,
      autoFinalizeOnDone: true,
    })

    presenter.onEvent({ type: 'hook-start', hookId: 'lint', command: 'pnpm lint' })
    presenter.onEvent({ type: 'hook-done', hookId: 'lint', success: true, exitCode: 0 })

    const output = stderr()
    expect(output).toContain('"stream":"hook-progress"')
    expect(output).not.toContain('[done]')
    expect(output).not.toContain('[failed]')
    expect(output).not.toContain('exit:')
  })

  it('strips terminal control sequences from rendered hook output', () => {
    const stderr = captureStderr()
    const presenter = createHookProgressPresenter({
      format: 'text',
      stream: process.stderr,
    })

    presenter.onEvent({ type: 'hook-start', hookId: 'test', command: 'pnpm test' })
    presenter.onEvent({
      type: 'hook-output',
      hookId: 'test',
      stream: 'stdout',
      line: '\u001B[31mred\u001B[0m\u0007',
    })

    const output = stderr()
    expect(output).toContain('  | red')
    expect(output).not.toContain('\u001B[31m')
    expect(output).not.toContain('\u0007')
  })
})
