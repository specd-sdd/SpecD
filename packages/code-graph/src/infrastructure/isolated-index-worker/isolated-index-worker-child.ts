import { assertGraphIndexJsonValue } from './json-value.js'
import {
  GRAPH_INDEX_PROTOCOL,
  type ChildMessage,
  isStartMessage,
  serializeTaskError,
  type StartMessage,
} from './protocol.js'

/** Minimal child-process IPC surface used by the isolated runtime. */
type ChildProcessWithIpc = NodeJS.Process & {
  send?: (message: ChildMessage, callback?: (error: Error | null) => void) => boolean
  connected?: boolean
  disconnect?: () => void
}

/** Shape required from a dynamically imported trusted task module. */
type GraphIndexTaskModule = {
  readonly runGraphIndexTask?: (
    input: unknown,
    emitProgress: (value: unknown) => void,
  ) => Promise<unknown>
}

const childProcess = process as ChildProcessWithIpc
let receivedStart = false
let sentTerminal = false
let deliveryFailed = false

/** Failure at the strict JSON/IPC boundary rather than inside task domain logic. */
class ProtocolBoundaryError extends Error {}

/**
 * Marks the child as failed when it cannot deliver a terminal IPC envelope.
 *
 * @returns Nothing.
 */
function failDelivery(): void {
  deliveryFailed = true
  process.exitCode = 1
}

/**
 * Disconnects the IPC channel after a terminal envelope has been sent.
 *
 * @returns Nothing.
 */
function disconnectAfterTerminal(): void {
  if (childProcess.connected && typeof childProcess.disconnect === 'function') {
    try {
      childProcess.disconnect()
    } catch {
      failDelivery()
    }
  }
}

/**
 * Sends the sole terminal envelope and then permits the event loop to drain.
 *
 * @param message - Valid terminal envelope to deliver to the parent.
 * @returns Whether delivery was scheduled on the IPC channel.
 */
function sendTerminal(message: Exclude<ChildMessage, { readonly type: 'progress' }>): boolean {
  if (sentTerminal) return false
  sentTerminal = true

  if (!childProcess.connected || typeof childProcess.send !== 'function') {
    failDelivery()
    return false
  }

  try {
    childProcess.send(message, (error) => {
      if (error) {
        failDelivery()
        return
      }
      disconnectAfterTerminal()
    })
    return true
  } catch {
    failDelivery()
    return false
  }
}

/**
 * Sends a protocol-classified terminal failure.
 *
 * @param error - Failure explaining the invalid IPC or JSON boundary value.
 * @returns Nothing.
 */
function sendProtocolFailure(error: unknown): void {
  sendTerminal({
    protocol: GRAPH_INDEX_PROTOCOL,
    type: 'failure',
    category: 'protocol',
    error: serializeTaskError(error),
  })
}

/**
 * Sends a task-contract terminal failure.
 *
 * @param error - Failure explaining why the trusted module is unusable.
 * @returns Nothing.
 */
function sendTaskContractFailure(error: unknown): void {
  sendTerminal({
    protocol: GRAPH_INDEX_PROTOCOL,
    type: 'failure',
    category: 'task-contract',
    error: serializeTaskError(error),
  })
}

/**
 * Sends a task-execution terminal failure.
 *
 * @param error - Error thrown or rejected by the injected task.
 * @returns Nothing.
 */
function sendTaskExecutionFailure(error: unknown): void {
  sendTerminal({
    protocol: GRAPH_INDEX_PROTOCOL,
    type: 'failure',
    category: 'task-execution',
    error: serializeTaskError(error),
  })
}

/**
 * Sends one validated progress value from the injected task.
 *
 * @param value - Progress value supplied by the task.
 * @returns Nothing.
 * @throws TypeError when the value cannot cross the JSON boundary.
 */
function sendProgress(value: unknown): void {
  try {
    assertGraphIndexJsonValue(value)
  } catch {
    throw new ProtocolBoundaryError('Graph index task emitted non-JSON progress')
  }
  if (sentTerminal)
    throw new ProtocolBoundaryError('Graph index task emitted progress after completion')
  if (!childProcess.connected || typeof childProcess.send !== 'function') {
    throw new ProtocolBoundaryError('Graph index worker IPC channel is unavailable')
  }

  try {
    childProcess.send(
      {
        protocol: GRAPH_INDEX_PROTOCOL,
        type: 'progress',
        value,
      },
      (error) => {
        if (error) failDelivery()
      },
    )
  } catch (error) {
    throw error instanceof ProtocolBoundaryError
      ? error
      : new ProtocolBoundaryError('Graph index worker could not send progress')
  }
}

/**
 * Imports and invokes the one trusted task described by a validated start message.
 *
 * @param message - Parent start envelope.
 * @returns Promise that settles after a terminal envelope is scheduled.
 */
async function runTask(message: StartMessage): Promise<void> {
  let taskModuleUrl: URL
  try {
    taskModuleUrl = new URL(message.taskModuleHref)
    if (taskModuleUrl.protocol !== 'file:') {
      throw new TypeError('Graph index task module must use the file: scheme')
    }
  } catch (error) {
    sendTaskContractFailure(error)
    return
  }

  let module: GraphIndexTaskModule
  try {
    const importedModule: unknown = await import(taskModuleUrl.href)
    module = importedModule as GraphIndexTaskModule
  } catch (error) {
    sendTaskContractFailure(error)
    return
  }

  if (typeof module.runGraphIndexTask !== 'function') {
    sendTaskContractFailure(
      new TypeError('Graph index task module must export callable runGraphIndexTask'),
    )
    return
  }

  try {
    const result = await module.runGraphIndexTask(message.taskInput, sendProgress)
    try {
      assertGraphIndexJsonValue(result)
    } catch {
      throw new ProtocolBoundaryError('Graph index task returned a non-JSON result')
    }
    if (
      sendTerminal({ protocol: GRAPH_INDEX_PROTOCOL, type: 'result', value: result }) &&
      !deliveryFailed
    ) {
      process.exitCode = 0
    }
  } catch (error) {
    if (error instanceof ProtocolBoundaryError) {
      sendProtocolFailure(error)
      return
    }
    sendTaskExecutionFailure(error)
  }
}

/**
 * Handles exactly one parent start message for this isolated process.
 *
 * @param value - Raw Node IPC payload.
 * @returns Nothing.
 */
function onMessage(value: unknown): void {
  if (receivedStart || !isStartMessage(value)) {
    sendProtocolFailure(
      new TypeError('Graph index worker received an invalid or duplicate start message'),
    )
    return
  }

  receivedStart = true
  void runTask(value)
}

if (!childProcess.connected || typeof childProcess.send !== 'function') {
  failDelivery()
} else {
  process.on('message', onMessage)
}
