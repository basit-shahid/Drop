const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { setupServer } = require('./server');
const ip = require('ip');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        backgroundColor: '#1e1e2e',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color: '#1e1e2e',
          symbolColor: '#cdd6f4'
        }
    });

    mainWindow.loadFile('index.html');

    // Setup the file server
    setupServer(mainWindow);

    // Send local IP to UI
    mainWindow.webContents.on('did-finish-load', () => {
        const localIP = ip.address();
        mainWindow.webContents.send('server-info', { ip: localIP, port: 5000 });
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

ipcMain.on('open-folder', () => {
    const { shell } = require('electron');
    const folderPath = path.join(process.env.USERPROFILE, 'Documents', 'AndroidFiles');
    shell.openPath(folderPath);
});

ipcMain.on('select-files-to-phone', async () => {
    const { dialog } = require('electron');
    const fs = require('fs');
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections']
    });

    if (!result.canceled) {
        const fromPcDir = path.join(process.env.USERPROFILE, 'Documents', 'AndroidFiles', 'FromPC');
        if (!fs.existsSync(fromPcDir)) fs.mkdirSync(fromPcDir, { recursive: true });

        result.filePaths.forEach(filePath => {
            const destPath = path.join(fromPcDir, path.basename(filePath));
            fs.copyFileSync(filePath, destPath);
        });
        
        mainWindow.webContents.send('files-sent-to-phone');
    }
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
