/** Runnable ESM fixture that produces a stable task execution failure. */
export async function runGraphIndexTask() {
  const error = new Error('fixture task failure')
  error.code = 'FIXTURE_FAILURE'
  throw error
}
