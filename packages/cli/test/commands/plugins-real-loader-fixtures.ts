import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Writes a plugin package under `<project>/node_modules` for the real plugin loader.
 *
 * @param tempDirs - Collector that receives the created project root for later cleanup
 * @param name - Scoped plugin package name
 * @param source - Source of the plugin entry module (must export `create`)
 * @param contributes - Manifest `contributes` section
 * @returns Absolute project root that resolves the package
 */
export async function writeProjectWithPluginSource(
  tempDirs: string[],
  name: string,
  source: string,
  contributes: Record<string, unknown> = {},
): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'specd-plugin-real-loader-'))
  tempDirs.push(projectRoot)
  const packageRoot = join(projectRoot, 'node_modules', ...name.split('/'))
  await mkdir(packageRoot, { recursive: true })
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', type: 'module', main: './index.js' }),
    'utf8',
  )
  await writeFile(join(packageRoot, 'index.js'), source, 'utf8')
  await writeFile(
    join(packageRoot, 'specd-plugin.json'),
    JSON.stringify({ schemaVersion: 2, name, version: '1.0.0', contributes }),
    'utf8',
  )
  return projectRoot
}
