/** Fixture that intentionally violates the JSON return-value boundary. */
export async function runGraphIndexTask(): Promise<unknown> {
  return { invalid: undefined }
}
