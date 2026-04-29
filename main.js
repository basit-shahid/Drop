const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { setupServer } = require('./server');
const ip = require('ip');
const cloudflared = require('cloudflared');
const fs = require('fs');

let mainWindow;
let tunnel;
let tunnelUrl = null;

const { spawn } = require('child_process');

async function startTunnel(port) {
    try {
        console.log(`[Tunnel] Spawning Cloudflare tunnel for port ${port}...`);
        
        // Manual spawn gives us direct access to output for parsing
        const tunnelProcess = spawn('npx', ['cloudflared', 'tunnel', '--url', `http://127.0.0.1:${port}`], { shell: true });
        
        tunnelProcess.stderr.on('data', (data) => {
            const output = data.toString();
            // Look for the quick tunnel URL
            const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (urlMatch) {
                tunnelUrl = urlMatch[0];
                console.log('[Tunnel] Captured URL:', tunnelUrl);
                if (mainWindow) {
                    mainWindow.webContents.send('public-url', tunnelUrl);
                }
            }
        });

        tunnelProcess.on('error', (err) => {
            console.error('[Tunnel] Process error:', err);
        });

        tunnelProcess.on('close', (code) => {
            console.log('[Tunnel] Process exited with code', code);
            tunnelUrl = null;
        });

        // Ensure tunnel dies when electron app quits
        app.on('before-quit', () => {
            if (tunnelProcess) tunnelProcess.kill();
        });

    } catch (err) {
        console.error('[Tunnel] Spawn logic error:', err);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 400,
        height: 680,
        resizable: false,
        maximizable: false,
        icon: path.join(__dirname, 'logo.png'),
        backgroundColor: '#050505',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color: '#050505',
          symbolColor: '#ffffff'
        }
    });

    mainWindow.loadFile('index.html');

    // Setup the file server
    setupServer(mainWindow);

    // Start Cloudflare Tunnel
    startTunnel(5000);

    // Send all local IPs and tunnel URL to UI
    mainWindow.webContents.on('did-finish-load', () => {
        const interfaces = require('os').networkInterfaces();
        const localIPs = [];
        
        // Prioritize Wi-Fi and Wireless interfaces
        const sortedNames = Object.keys(interfaces).sort((a, b) => {
            const aW = a.toLowerCase().includes('wi-fi') || a.toLowerCase().includes('wireless');
            const bW = b.toLowerCase().includes('wi-fi') || b.toLowerCase().includes('wireless');
            if (aW && !bW) return -1;
            if (!aW && bW) return 1;
            return 0;
        });

        for (const name of sortedNames) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIPs.push(iface.address);
                }
            }
        }

        console.log(`[Server] Detected Local IPs (Prioritized): ${localIPs.join(', ')}`);
        mainWindow.webContents.send('server-info', { ips: localIPs, port: 5000 });
        
        if (tunnelUrl) {
            mainWindow.webContents.send('public-url', tunnelUrl);
        }
    });
}

app.whenReady().then(() => {
    createWindow();

    ipcMain.on('show-file', (event, filePath) => {
        if (filePath && fs.existsSync(filePath)) {
            shell.showItemInFolder(filePath);
        }
    });

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
