import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Runs `hg <args>` in the given working directory and returns trimmed stdout.
 *
 * @param cwd - Working directory for the hg command
 * @param args - Arguments to pass to the hg binary
 * @returns Trimmed stdout from the hg process
 * @throws When the hg process exits with a non-zero code
 */
export async function hg(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('hg', args, { cwd })
  return stdout.trim()
}
