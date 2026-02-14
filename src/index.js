const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let db;
let countStatement;
let questionByIndexStatement;
let startupFailed = false;

function logStartupError(error) {
  const detail = error && error.stack ? error.stack : String(error);
  const line = `[${new Date().toISOString()}] ${detail}\n`;
  try {
    const logPath = path.join(app.getPath('userData'), 'startup-error.log');
    fs.appendFileSync(logPath, line, 'utf8');
  } catch {
    // ignore logging errors
  }
}

function reportStartupError(error) {
  startupFailed = true;
  logStartupError(error);
  const message = error && error.message ? error.message : String(error);
  dialog.showErrorBox(
    '应用启动失败',
    `启动时发生错误: ${message}\n\n已写入日志: ${path.join(app.getPath('userData'), 'startup-error.log')}`
  );
}

function resolveDatabasePath() {
  const candidates = [
    path.join(process.resourcesPath, 'questions.db'),
    path.join(process.resourcesPath, 'resources', 'questions.db'),
    path.join(process.cwd(), 'resources', 'questions.db'),
    path.join(app.getAppPath(), 'resources', 'questions.db'),
    path.join(__dirname, '..', 'resources', 'questions.db')
  ];

  const dbPath = candidates.find((candidate) => {
    if (!fs.existsSync(candidate)) {
      return false;
    }

    // Native sqlite cannot open files from inside app.asar.
    return !candidate.includes(`${path.sep}app.asar${path.sep}`);
  });
  if (!dbPath) {
    throw new Error('questions.db not found in resources directory');
  }
  return dbPath;
}

function initDatabase() {
  const dbPath = resolveDatabasePath();
  db = new Database(dbPath, { readonly: true, fileMustExist: true });
  countStatement = db.prepare('SELECT COUNT(*) AS total FROM Questions');
  questionByIndexStatement = db.prepare(
    'SELECT id, Title, Answer, Analyse, SourceAttach FROM Questions ORDER BY id LIMIT 1 OFFSET ?'
  );
}

function registerIpcHandlers() {
  ipcMain.handle('questions:get-count', () => {
    const row = countStatement.get();
    return row ? row.total : 0;
  });

  ipcMain.handle('questions:get-by-index', (_event, index) => {
    if (!Number.isInteger(index) || index < 0) {
      return null;
    }

    const row = questionByIndexStatement.get(index);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      title: row.Title || '',
      answer: row.Answer,
      analyse: row.Analyse || '',
      sourceAttach: row.SourceAttach
    };
  });
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
};

app.whenReady().then(() => {
  try {
    Menu.setApplicationMenu(null);
    initDatabase();
    registerIpcHandlers();
    createWindow();
  } catch (error) {
    reportStartupError(error);
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (!startupFailed && BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (db) {
    db.close();
    db = null;
  }
});

process.on('uncaughtException', (error) => {
  reportStartupError(error);
  app.quit();
});

process.on('unhandledRejection', (reason) => {
  reportStartupError(reason);
  app.quit();
});
