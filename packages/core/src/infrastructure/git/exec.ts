import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Runs `git <args>` in the given working directory and returns trimmed stdout.
 *
 * @param cwd - Working directory for the git command
 * @param args - Arguments to pass to the git binary
 * @returns Trimmed stdout from the git process
 * @throws When the git process exits with a non-zero code
 */
export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd })
  return stdout.trim()
}
