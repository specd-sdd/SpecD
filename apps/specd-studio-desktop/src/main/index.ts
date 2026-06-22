import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  type MenuItem,
  type MenuItemConstructorOptions,
  shell,
} from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IpcRequestEnvelope, IpcResponseEnvelope } from '@specd/client'
import { dispatchIpc, onSessionChangeMain } from './ipc-handlers.js'
import { readRecents, writeRecents, type RecentConnection } from './connection-store.js'
import { getSettingSync, setSettingSync, removeSettingSync } from './settings-store.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | null = null

type StorageGetPayload = { readonly key: string }
type StorageSetPayload = { readonly key: string; readonly value: unknown }

function isRecentConnection(value: unknown): value is RecentConnection {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<RecentConnection>
  return candidate.kind === 'local' || candidate.kind === 'remote'
}

function isRecentConnectionList(value: unknown): value is RecentConnection[] {
  return Array.isArray(value) && value.every(isRecentConnection)
}

/**
 *
 */
function resolvePreload(): string {
  return path.join(dirname, '../preload/bridge.cjs')
}

/**
 *
 */
function resolveRenderer(): string {
  if (process.env['SPECD_STUDIO_DEV'] === '1') {
    return 'http://127.0.0.1:5175'
  }
  return path.join(dirname, '../renderer/index.html')
}

/**
 * Rebuilds the application menu dynamically including recent connections.
 */
async function rebuildMenu(): Promise<void> {
  const recents = await readRecents()

  const recentItems: MenuItemConstructorOptions[] = recents.map((recent) => {
    const label = recent.kind === 'local' ? `Local: ${recent.path}` : `Remote: ${recent.apiBaseUrl}`
    return {
      label,
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('session:select-recent', recent)
        }
      },
    }
  })

  const template: Array<MenuItemConstructorOptions | MenuItem> = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open SpecD Project...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('session:trigger-open-project')
            }
          },
        },
        {
          label: 'Open Recent',
          submenu:
            recentItems.length > 0
              ? [
                  ...recentItems,
                  { type: 'separator' },
                  {
                    label: 'Clear Recents',
                    click: () => {
                      if (mainWindow) {
                        mainWindow.webContents.send('session:trigger-clear-recents')
                      }
                    },
                  },
                ]
              : [{ label: 'No Recent Connections', enabled: false }],
        },
        {
          label: 'Close Project',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('session:trigger-close')
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      role: 'window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

/**
 *
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const target = resolveRenderer()
  if (target.startsWith('http')) {
    void mainWindow.loadURL(target)
  } else {
    void mainWindow.loadFile(target)
  }
}

void app.whenReady().then(() => {
  ipcMain.handle(
    'specd:invoke',
    (_event, envelope: IpcRequestEnvelope): Promise<IpcResponseEnvelope> => dispatchIpc(envelope),
  )

  ipcMain.on('storage:get-sync', (event, payload: StorageGetPayload) => {
    const { key } = payload
    const value: unknown = getSettingSync(key)
    event.returnValue = value
  })

  ipcMain.on('storage:set-sync', (event, payload: StorageSetPayload) => {
    const { key, value } = payload
    setSettingSync(key, value)
    if (key === 'recentConnections' && isRecentConnectionList(value)) {
      void writeRecents(value).then(() => rebuildMenu())
    }
    event.returnValue = null
  })

  ipcMain.on('storage:remove-sync', (event, payload: StorageGetPayload) => {
    const { key } = payload
    removeSettingSync(key)
    if (key === 'recentConnections') {
      void writeRecents([]).then(() => rebuildMenu())
    }
    event.returnValue = null
  })

  onSessionChangeMain((session) => {
    void rebuildMenu()
    if (mainWindow) {
      mainWindow.webContents.send('session:change', session)
    }
  })

  void rebuildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
