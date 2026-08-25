import {
  GraphIndexProgressHandlerError,
  GraphIndexTaskContractError,
  GraphIndexTaskExecutionError,
  GraphIndexWorkerExitError,
  GraphIndexWorkerProtocolError,
  GraphIndexWorkerSignalError,
  GraphIndexWorkerStartError,
  codeGraphVersion,
  getCodeGraphVersion,
  runIsolatedGraphIndex,
  type GraphIndexJsonPrimitive,
  type GraphIndexJsonValue,
  type GraphIndexTask,
  type GraphIndexTaskProgressEmitter,
  type IsolatedGraphIndexRunner,
  type RunIsolatedGraphIndexInput,
} from '@specd/sdk'

// These are process-coordination details, not SDK worker contracts.
// @ts-expect-error The curated SDK entrypoint never exports graph-index locks.
import type { ChildMessage } from '@specd/sdk'
// @ts-expect-error The curated SDK entrypoint never exports graph-index leases.
import type { GraphIndexLockLease } from '@specd/sdk'
// @ts-expect-error The curated SDK entrypoint never exports graph-index lease options.
import type { GraphIndexLockLeaseOptions } from '@specd/sdk'
// @ts-expect-error The curated SDK entrypoint never exports raw child IPC envelopes.
import type { StartMessage } from '@specd/sdk'

declare const childMessage: ChildMessage
declare const lease: GraphIndexLockLease
declare const leaseOptions: GraphIndexLockLeaseOptions
declare const startMessage: StartMessage

const primitive: GraphIndexJsonPrimitive = 'worker-contract'
const value: GraphIndexJsonValue = { primitive }
const emitProgress: GraphIndexTaskProgressEmitter<GraphIndexJsonValue> = () => undefined
const task: GraphIndexTask<GraphIndexJsonValue, GraphIndexJsonValue, GraphIndexJsonValue> = async (
  input,
  emit,
) => {
  emit(input)
  return input
}
const input: RunIsolatedGraphIndexInput<GraphIndexJsonValue, GraphIndexJsonValue> = {
  storageRoot: '/tmp/specd-sdk-worker-contract',
  taskModule: new URL('file:///tmp/specd-sdk-worker-task.js'),
  taskInput: value,
  onProgress: emitProgress,
}

const workerErrors = [
  GraphIndexWorkerStartError,
  GraphIndexTaskContractError,
  GraphIndexTaskExecutionError,
  GraphIndexWorkerProtocolError,
  GraphIndexWorkerExitError,
  GraphIndexWorkerSignalError,
  GraphIndexProgressHandlerError,
]

void primitive
void value
void task
void input
void workerErrors
void codeGraphVersion
void getCodeGraphVersion
void runIsolatedGraphIndex
void childMessage
void lease
void leaseOptions
void startMessage
declare const runner: IsolatedGraphIndexRunner
void runner
