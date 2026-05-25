import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IpcRequestEnvelope, IpcResponseEnvelope } from '@specd/client'
import { dispatchIpc } from './ipc-handlers.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

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
 *
 */
function createWindow(): void {
  const win = new BrowserWindow({
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

  const target = resolveRenderer()
  if (target.startsWith('http')) {
    void win.loadURL(target)
  } else {
    void win.loadFile(target)
  }
}

void app.whenReady().then(() => {
  ipcMain.handle(
    'specd:invoke',
    (_event, envelope: IpcRequestEnvelope): Promise<IpcResponseEnvelope> => dispatchIpc(envelope),
  )

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
