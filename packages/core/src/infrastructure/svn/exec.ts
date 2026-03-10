import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Runs `svn <args>` in the given working directory and returns trimmed stdout.
 *
 * @param cwd - Working directory for the svn command
 * @param args - Arguments to pass to the svn binary
 * @returns Trimmed stdout from the svn process
 * @throws When the svn process exits with a non-zero code
 */
export async function svn(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('svn', args, { cwd })
  return stdout.trim()
}
