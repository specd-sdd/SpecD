/** Delivers a valid result, then proves the parent still rejects a later bad exit. */
export async function runGraphIndexTask() {
  setTimeout(() => process.exit(17), 75)
  return { pid: process.pid }
}
