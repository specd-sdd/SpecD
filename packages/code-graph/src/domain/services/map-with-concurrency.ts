/**
 * Maps values with a fixed concurrency ceiling while preserving input order.
 * New work stops being scheduled after the first rejection; already-running
 * mappers are allowed to settle before the returned promise rejects.
 *
 * @param values - Values to transform.
 * @param concurrency - Positive integer maximum number of active mappers.
 * @param mapper - Asynchronous transformation applied to each value.
 * @returns Results in the same order as the input values.
 */
export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('concurrency must be a positive integer')
  }
  if (values.length === 0) return []

  const results = new Array<R>(values.length)
  let nextIndex = 0
  let firstError: Error | undefined

  const worker = async (): Promise<void> => {
    while (firstError === undefined) {
      const index = nextIndex
      if (index >= values.length) return
      nextIndex += 1
      const value = values[index] as T

      try {
        results[index] = await mapper(value, index)
      } catch (error) {
        firstError = error instanceof Error ? error : new Error(String(error))
      }
    }
  }

  const workerCount = Math.min(concurrency, values.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  if (firstError !== undefined) throw firstError
  return results
}
