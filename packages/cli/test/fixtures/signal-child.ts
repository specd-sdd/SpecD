import { writeFileSync } from 'node:fs'
import { registerCliCleanup } from '../../src/helpers/cli-cleanup.js'
import { installCliSignalHandlers } from '../../src/helpers/cli-signals.js'

/**
 * Child process used by the signal tests: registers one cleanup, installs the CLI signal
 * handlers and stays alive until a signal arrives.
 *
 * argv: `<marker file> <clean|hang>`
 */
const marker = process.argv[2]
const hang = process.argv[3] === 'hang'

registerCliCleanup(async () => {
  if (marker !== undefined) writeFileSync(marker, 'cleanup-started')
  if (hang) await new Promise<void>(() => {})
})
installCliSignalHandlers()
setInterval(() => {}, 1000)
process.stdout.write('ready\n')
