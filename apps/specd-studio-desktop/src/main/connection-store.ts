import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { setSettingSync } from './settings-store.js'

export interface RecentConnection {
  kind: 'local' | 'remote'
  path?: string // For local
  apiBaseUrl?: string // For remote
  token?: string // Optional token for remote
}

const STORE_FILE = 'recent-connections.json'

function getStorePath(): string {
  try {
    return path.join(app.getPath('userData'), STORE_FILE)
  } catch {
    return path.join(process.cwd(), STORE_FILE)
  }
}

export async function readRecents(): Promise<RecentConnection[]> {
  const storePath = getStorePath()
  try {
    const content = await fs.readFile(storePath, 'utf-8')
    const parsed = JSON.parse(content) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is RecentConnection => {
        return item !== null && typeof item === 'object' && 'kind' in item
      })
    }
  } catch {
    // Ignore error (e.g. file not found)
  }
  return []
}

export async function writeRecents(recents: RecentConnection[]): Promise<void> {
  const storePath = getStorePath()
  await fs.mkdir(path.dirname(storePath), { recursive: true })
  await fs.writeFile(storePath, JSON.stringify(recents, null, 2), 'utf-8')
  setSettingSync('recentConnections', recents)
}

export async function addRecentConnection(entry: RecentConnection): Promise<RecentConnection[]> {
  const recents = await readRecents()
  const filtered = recents.filter((item) => {
    if (entry.kind === 'local' && item.kind === 'local') {
      return item.path !== entry.path
    }
    if (entry.kind === 'remote' && item.kind === 'remote') {
      return item.apiBaseUrl !== entry.apiBaseUrl
    }
    return true
  })
  filtered.unshift(entry)
  const limited = filtered.slice(0, 10)
  await writeRecents(limited)
  return limited
}

export async function removeRecentConnection(entry: RecentConnection): Promise<RecentConnection[]> {
  const recents = await readRecents()
  const filtered = recents.filter((item) => {
    if (entry.kind === 'local' && item.kind === 'local') {
      return item.path !== entry.path
    }
    if (entry.kind === 'remote' && item.kind === 'remote') {
      return item.apiBaseUrl !== entry.apiBaseUrl
    }
    return true
  })
  await writeRecents(filtered)
  return filtered
}

export async function clearRecentConnections(): Promise<void> {
  await writeRecents([])
}
