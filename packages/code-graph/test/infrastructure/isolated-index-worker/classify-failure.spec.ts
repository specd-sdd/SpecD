import { describe, expect, it } from 'vitest'
import {
  GraphIndexProgressHandlerError,
  GraphIndexTaskContractError,
  GraphIndexTaskExecutionError,
  GraphIndexWorkerExitError,
  GraphIndexWorkerProtocolError,
  GraphIndexWorkerSignalError,
  GraphIndexWorkerStartError,
} from '../../../src/domain/errors/isolated-graph-index-errors.js'
import {
  classifyWorkerFailure,
  type ClassifyWorkerFailureInput,
} from '../../../src/infrastructure/isolated-index-worker/classify-failure.js'

describe('classifyWorkerFailure', () => {
  it('classifies start error as start-failed', () => {
    const cause = classifyWorkerFailure({
      error: new GraphIndexWorkerStartError('start failed'),
      exitCode: null,
      signal: null,
      stderrTail: '',
    })
    expect(cause).toBe('start-failed')
  })

  it('classifies task contract error as task-contract', () => {
    const cause = classifyWorkerFailure({
      error: new GraphIndexTaskContractError('invalid contract'),
      exitCode: null,
      signal: null,
      stderrTail: '',
    })
    expect(cause).toBe('task-contract')
  })

  it('classifies task execution error as task-error', () => {
    const cause = classifyWorkerFailure({
      error: new GraphIndexTaskExecutionError('execution error'),
      exitCode: null,
      signal: null,
      stderrTail: '',
    })
    expect(cause).toBe('task-error')
  })

  it('classifies protocol error as protocol', () => {
    const cause = classifyWorkerFailure({
      error: new GraphIndexWorkerProtocolError('protocol error'),
      exitCode: null,
      signal: null,
      stderrTail: '',
    })
    expect(cause).toBe('protocol')
  })

  it('classifies progress handler error as protocol', () => {
    const cause = classifyWorkerFailure({
      error: new GraphIndexProgressHandlerError(
        'progress handler error',
        new Error('handler failed'),
      ),
      exitCode: null,
      signal: null,
      stderrTail: '',
    })
    expect(cause).toBe('protocol')
  })

  it('classifies forwardedSignal as cancelled', () => {
    const cause = classifyWorkerFailure({
      error: new GraphIndexWorkerSignalError('SIGINT', 'SIGINT'),
      exitCode: null,
      signal: 'SIGINT',
      forwardedSignal: 'SIGINT',
      stderrTail: '',
    })
    expect(cause).toBe('cancelled')
  })

  it('classifies out-of-memory patterns in stderr as resource-limit', () => {
    const oomSamples = [
      'FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory',
      'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      '<--- Last few GCs --->\n\nFATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\n----- Native stack trace -----',
      '# FATAL ERROR: Allocation failed - JavaScript heap out of memory',
    ]
    for (const sample of oomSamples) {
      const cause = classifyWorkerFailure({
        error: new GraphIndexWorkerExitError('exited', 134, null),
        exitCode: 134,
        signal: null,
        stderrTail: sample,
      })
      expect(cause).toBe('resource-limit')
    }
  })

  it('does not classify ordinary task output that mentions memory as resource-limit', () => {
    const samples = [
      'JavaScript heap out of memory',
      'warning: the build reported JavaScript heap out of memory in a child tool',
      'Reached heap limit Allocation failed',
    ]
    for (const sample of samples) {
      const cause = classifyWorkerFailure({
        error: new GraphIndexWorkerExitError('exited', 1, null),
        exitCode: 1,
        signal: null,
        stderrTail: sample,
      })
      expect(cause).toBe('exited')
    }
  })

  it('classifies native crash signals and exit codes', () => {
    const signals = ['SIGSEGV', 'SIGBUS', 'SIGILL', 'SIGABRT']
    for (const signal of signals) {
      const cause = classifyWorkerFailure({
        error: new GraphIndexWorkerExitError('signal', null, signal),
        exitCode: null,
        signal,
        stderrTail: '',
      })
      expect(cause).toBe('native-crash')
    }

    const exitCodes = [3221225477, 3221226505, 134]
    for (const exitCode of exitCodes) {
      const cause = classifyWorkerFailure({
        error: new GraphIndexWorkerExitError('exit', exitCode, null),
        exitCode,
        signal: null,
        stderrTail: '',
      })
      expect(cause).toBe('native-crash')
    }
  })

  it('falls back to exited for normal non-crash exit codes', () => {
    const cause = classifyWorkerFailure({
      error: new GraphIndexWorkerExitError('exit', 1, null),
      exitCode: 1,
      signal: null,
      stderrTail: '',
    })
    expect(cause).toBe('exited')
  })

  it('respects exact precedence ordering', () => {
    // 1. start-failed beats everything
    expect(
      classifyWorkerFailure({
        error: new GraphIndexWorkerStartError('start'),
        exitCode: 134,
        signal: 'SIGSEGV',
        forwardedSignal: 'SIGINT',
        stderrTail:
          'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      }),
    ).toBe('start-failed')

    // 2. task-contract beats cancelled and resource-limit
    expect(
      classifyWorkerFailure({
        error: new GraphIndexTaskContractError('contract'),
        exitCode: 134,
        signal: 'SIGSEGV',
        forwardedSignal: 'SIGINT',
        stderrTail:
          'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      }),
    ).toBe('task-contract')

    // 3. task-error beats cancelled and resource-limit
    expect(
      classifyWorkerFailure({
        error: new GraphIndexTaskExecutionError('exec'),
        exitCode: 134,
        signal: 'SIGSEGV',
        forwardedSignal: 'SIGINT',
        stderrTail:
          'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      }),
    ).toBe('task-error')

    // 4. protocol beats cancelled and resource-limit
    expect(
      classifyWorkerFailure({
        error: new GraphIndexWorkerProtocolError('proto'),
        exitCode: 134,
        signal: 'SIGSEGV',
        forwardedSignal: 'SIGINT',
        stderrTail:
          'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      }),
    ).toBe('protocol')

    // 5. cancelled beats resource-limit and native-crash
    expect(
      classifyWorkerFailure({
        error: new GraphIndexWorkerExitError('exit', 134, 'SIGSEGV'),
        exitCode: 134,
        signal: 'SIGSEGV',
        forwardedSignal: 'SIGINT',
        stderrTail:
          'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      }),
    ).toBe('cancelled')

    // 6. resource-limit beats native-crash
    expect(
      classifyWorkerFailure({
        error: new GraphIndexWorkerExitError('exit', 134, 'SIGSEGV'),
        exitCode: 134,
        signal: 'SIGSEGV',
        stderrTail:
          'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      }),
    ).toBe('resource-limit')
  })
})
