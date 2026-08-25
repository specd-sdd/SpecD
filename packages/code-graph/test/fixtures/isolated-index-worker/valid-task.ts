/** Deterministic trusted task fixture for isolated worker integration tests. */
export async function runGraphIndexTask(
  input: { readonly marker: string },
  emitProgress: (value: string) => void,
): Promise<{ readonly marker: string; readonly pid: number }> {
  emitProgress('A')
  emitProgress('B')
  emitProgress('C')
  return { marker: input.marker, pid: process.pid }
}
