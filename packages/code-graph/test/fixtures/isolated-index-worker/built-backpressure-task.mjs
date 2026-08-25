/** Runnable ESM fixture that simulates a saturated, but still writable, IPC queue. */
export async function runGraphIndexTask(_input, emitProgress) {
  const originalSend = process.send.bind(process)
  process.send = (message, callback) => {
    originalSend(message, callback)
    return false
  }

  emitProgress({ queued: true })
  return { delivered: true }
}
