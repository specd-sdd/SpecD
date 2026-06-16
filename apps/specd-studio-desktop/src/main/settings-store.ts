import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const SETTINGS_FILE = 'user-settings.json'

function getSettingsPath(): string {
  try {
    return path.join(app.getPath('userData'), SETTINGS_FILE)
  } catch {
    return path.join(process.cwd(), SETTINGS_FILE)
  }
}

let cache: Record<string, unknown> | null = null

function loadCache(): Record<string, unknown> {
  if (cache) {
    return cache
  }
  const storePath = getSettingsPath()
  try {
    if (fs.existsSync(storePath)) {
      const content = fs.readFileSync(storePath, 'utf-8')
      cache = JSON.parse(content) as Record<string, unknown>
    } else {
      cache = {}
    }
  } catch {
    cache = {}
  }
  return cache
}

function saveCache(data: Record<string, unknown>): void {
  cache = data
  const storePath = getSettingsPath()
  try {
    fs.mkdirSync(path.dirname(storePath), { recursive: true })
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save settings:', error)
  }
}

export function getSettingSync<T>(key: string): T | null {
  const settings = loadCache()
  return (settings[key] as T) ?? null
}

export function setSettingSync<T>(key: string, value: T): void {
  const settings = loadCache()
  settings[key] = value
  saveCache(settings)
}

export function removeSettingSync(key: string): void {
  const settings = loadCache()
  delete settings[key]
  saveCache(settings)
}

export async function getSetting<T>(key: string): Promise<T | null> {
  return await Promise.resolve(getSettingSync<T>(key))
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await Promise.resolve(setSettingSync<T>(key, value))
}

export async function removeSetting(key: string): Promise<void> {
  await Promise.resolve(removeSettingSync(key))
}
