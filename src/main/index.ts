import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { join } from 'path'
import path from 'path'
import net from 'net'
import dotenv from 'dotenv'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createApp } from '../server/createApp.js'
import { backupDatabase, closeDatabase } from '../server/db/index.js'
import { stopJobCleanup } from '../server/services/fal.js'

let mainWindow: BrowserWindow | null = null
let serverPort = 3001
let appDataDir = ''

function findAvailablePort(start: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(start, () => {
      const { port } = server.address() as net.AddressInfo
      server.close(() => resolve(port))
    })
    server.on('error', async () => {
      if (start >= 3100) return reject(new Error('No available port found'))
      try {
        resolve(await findAvailablePort(start + 1))
      } catch (err) {
        reject(err)
      }
    })
  })
}

async function startEmbeddedServer(): Promise<number> {
  const envPath = is.dev
    ? path.resolve(process.cwd(), '.env')
    : path.join(process.resourcesPath, '.env')
  dotenv.config({ path: envPath })

  const projectRoot = is.dev
    ? process.cwd()
    : path.join(app.getPath('documents'), 'Pixflow')

  appDataDir = is.dev
    ? path.join(process.cwd(), 'data')
    : path.join(app.getPath('userData'), 'data')

  const expressApp = createApp({
    projectRoot,
    dataDir: appDataDir,
    openFolder: async (p) => {
      const err = await shell.openPath(p)
      if (err) throw new Error(err)
    },
  })

  const port = await findAvailablePort(3001)

  return new Promise((resolve, reject) => {
    const server = expressApp.listen(port, () => {
      console.log(`[Electron] Embedded server running on http://localhost:${port}`)
      resolve(port)
    })
    server.on('error', (err) => reject(err))
    server.setTimeout(600_000)
    server.keepAliveTimeout = 620_000
    server.headersTimeout = 621_000
  })
}

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.pixery.pixflow')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  try {
    serverPort = await startEmbeddedServer()
  } catch (err) {
    console.error('[Electron] Failed to start embedded server:', err)
    dialog.showErrorBox('Pixflow', `Failed to start server: ${err instanceof Error ? err.message : err}`)
    app.quit()
    return
  }

  ipcMain.handle('get-server-port', () => serverPort)

  setInterval(() => {
    if (appDataDir) {
      try {
        backupDatabase(appDataDir)
        console.log('[Electron] Periodic database backup complete')
      } catch (err) {
        console.error('[Electron] Periodic backup failed:', err)
      }
    }
  }, 30 * 60 * 1000)

  ipcMain.handle('open-path', async (_, filePath: string) => {
    return shell.openPath(filePath)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  stopJobCleanup()
  if (appDataDir) {
    try {
      backupDatabase(appDataDir)
      console.log('[Electron] Database backed up on quit')
    } catch (err) {
      console.error('[Electron] Backup failed:', err)
    }
    closeDatabase()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
