import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

const PLUGIN_PACKAGES = [
  'packages/plugin-agent-claude',
  'packages/plugin-agent-copilot',
  'packages/plugin-agent-codex',
  'packages/plugin-agent-opencode',
]

async function syncManifest(packageDir: string): Promise<void> {
  const packageJsonPath = path.join(PROJECT_ROOT, packageDir, 'package.json')
  const manifestPath = path.join(PROJECT_ROOT, packageDir, 'specd-plugin.json')

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { version: string }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>

  manifest.version = packageJson.version

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log(`synced ${packageDir}/specd-plugin.json → v${packageJson.version}`)
}

async function main(): Promise<void> {
  const targetPackage = process.argv[2]

  if (targetPackage) {
    await syncManifest(targetPackage)
  } else {
    for (const pkg of PLUGIN_PACKAGES) {
      await syncManifest(pkg)
    }
  }
}

await main()
