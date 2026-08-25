/** Fixture that supplies a stable task failure for process-boundary tests. */
export async function runGraphIndexTask(): Promise<never> {
  const error = new Error('fixture task failure') as Error & { code: string }
  error.code = 'FIXTURE_FAILURE'
  throw error
}
