import { execFile, execFileSync } from 'node:child_process'
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
  const { stdout } = await execFileAsync('svn', args, spawnOptions(cwd))
  return stdout.trim()
}

/**
 * Runs `svn <args>` synchronously in the given working directory and returns
 * trimmed stdout.
 *
 * @param cwd - Working directory for the svn command
 * @param args - Arguments to pass to the svn binary
 * @returns Trimmed stdout from the svn process
 * @throws When the svn process exits with a non-zero code
 */
export function svnSync(cwd: string, ...args: string[]): string {
  return execFileSync('svn', args, { ...spawnOptions(cwd), encoding: 'utf-8' }).trim()
}

/**
 * Hides the console window when Subversion runs on Windows.
 *
 * @param cwd - Working directory for the svn command
 * @param platform - Host platform used to decide `windowsHide`
 * @returns Spawn options for `execFile`
 */
export function spawnOptions(
  cwd: string,
  platform: NodeJS.Platform = process.platform,
): { cwd: string; windowsHide?: true } {
  return platform === 'win32' ? { cwd, windowsHide: true } : { cwd }
}
