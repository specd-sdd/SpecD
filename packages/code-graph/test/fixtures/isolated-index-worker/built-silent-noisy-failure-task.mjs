/** Runnable ESM fixture that announces an item, stays silent, writes noisy output, then fails. */
export async function runGraphIndexTask(input, _emitProgress, announce) {
  announce('src/silent.ts', { mandatory: true })
  await new Promise((resolve) => setTimeout(resolve, input.silentMs ?? 12_500))
  const invalid = Buffer.from([0xff, 0xfe, 0x41, 0x0a])
  if (input.invalidLast === true) {
    process.stderr.write('x'.repeat(1024 * 1024))
    process.stderr.write(invalid)
  } else {
    process.stderr.write(invalid)
    process.stderr.write('x'.repeat(1024 * 1024))
  }
  process.stdout.write('out-marker\n')
  const error = new Error('noisy fixture failure')
  error.code = 'NOISY_FAILURE'
  throw error
}
