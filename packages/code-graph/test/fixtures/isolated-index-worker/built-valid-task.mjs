/** Runnable ESM fixture used against the published isolated-worker entrypoint. */
export async function runGraphIndexTask(input, emitProgress) {
  emitProgress('A')
  emitProgress('B')
  emitProgress('C')
  return { marker: input.marker, pid: process.pid }
}
