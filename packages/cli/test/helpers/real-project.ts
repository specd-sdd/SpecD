import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Writes a minimal real project (config plus storage directories) in a fresh temp dir.
 *
 * @param tempDirs - Collector that receives the created directory for later cleanup
 * @param pluginLines - Extra `plugins:` yaml lines appended to the config
 * @returns Absolute path to the written `specd.yaml`
 */
export async function writeRealProject(
  tempDirs: string[],
  pluginLines: readonly string[] = [],
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'specd-real-project-'))
  tempDirs.push(dir)
  await mkdir(join(dir, 'specs'), { recursive: true })
  for (const name of ['changes', 'drafts', 'discarded', 'archive']) {
    await mkdir(join(dir, '.specd', name), { recursive: true })
  }
  const configPath = join(dir, 'specd.yaml')
  await writeFile(
    configPath,
    [
      "schema: '@specd/schema-std'",
      'configVersion: 2',
      'workspaces:',
      '  default:',
      '    specs:',
      '      adapter:',
      '        type: fs',
      '        config:',
      '          path: specs/',
      'storage:',
      ...['changes', 'drafts', 'discarded', 'archive'].flatMap((name) => [
        `  ${name}:`,
        '    adapter:',
        '      type: fs',
        '      config:',
        `        path: .specd/${name}`,
      ]),
      ...pluginLines,
      '',
    ].join('\n'),
    'utf8',
  )
  return configPath
}
