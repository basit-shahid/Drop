const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');
const { ipcMain } = require('electron');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Robust path handling
const DOWNLOAD_BASE = path.join(os.homedir(), 'Documents', 'AndroidFiles');
const FROM_PC_DIR = path.join(DOWNLOAD_BASE, 'FromPC');
const DEVICES_FILE = path.join(DOWNLOAD_BASE, 'devices.json');

// Ensure directories exist
[DOWNLOAD_BASE, FROM_PC_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function getKnownDevices() {
    if (!fs.existsSync(DEVICES_FILE)) return [];
    try {
        const data = fs.readFileSync(DEVICES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function saveDevice(name) {
    const devices = getKnownDevices();
    if (!devices.includes(name)) {
        devices.push(name);
        fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
    }
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let deviceName = (req.headers['device-name'] || req.body['device-name'] || 'UnknownDevice').trim().replace(/[^a-z0-9_-]/gi, '_');
        const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
        
        let category = 'other';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(ext)) {
            category = 'photos';
        } else if (['doc', 'docx', 'pdf', 'txt', 'rtf', 'odt'].includes(ext)) {
            category = 'docx';
        } else if (['mp4', 'mkv', 'avi', 'mov', 'wmv'].includes(ext)) {
            category = 'video';
        } else if (['mp3', 'wav', 'flac', 'm4a', 'ogg'].includes(ext)) {
            category = 'music';
        }

        const deviceDir = path.join(DOWNLOAD_BASE, deviceName, category);
        if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
        cb(null, deviceDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

function setupServer(mainWindow) {
    app.post('/upload', (req, res, next) => {
        let received = 0;
        const total = parseInt(req.headers['content-length'], 10);
        let lastUpdate = 0;
        req.on('data', (chunk) => {
            received += chunk.length;
            const now = Date.now();
            if (mainWindow && total && (now - lastUpdate > 100)) {
                lastUpdate = now;
                const progress = Math.round((received / total) * 100);
                mainWindow.webContents.send('upload-progress', { 
                    progress, 
                    deviceName: req.headers['device-name'] || 'Unknown' 
                });
            }
        });
        next();
    }, upload.array('file'), (req, res) => {
        if (!req.files || req.files.length === 0) return res.status(400).send('No files uploaded.');

        req.files.forEach(file => {
            const info = {
                filename: file.originalname,
                device: (req.headers['device-name'] || req.body['device-name'] || 'UnknownDevice').trim(),
                path: file.path,
                category: path.basename(path.dirname(file.path)),
                time: new Date().toLocaleTimeString()
            };
            if (mainWindow) mainWindow.webContents.send('file-received', info);
        });

        res.status(200).json({ message: `${req.files.length} files uploaded` });
    });

    app.get('/known-devices', (req, res) => {
        res.json(getKnownDevices());
    });

    app.get('/check-device/:name', (req, res) => {
        const name = req.params.name.trim();
        const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
        const deviceDir = path.join(DOWNLOAD_BASE, safeName);
        if (fs.existsSync(deviceDir)) {
            res.json({ available: false });
        } else {
            saveDevice(name);
            res.json({ available: true });
        }
    });

    app.get('/', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Drop</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: 'Inter', system-ui, sans-serif; background: #000000; color: #ffffff; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; margin: 0; }
                    .card { background: #0a0a0a; padding: 2.5rem; border-radius: 12px; border: 1px solid #222222; width: 100%; max-width: 400px; text-align: center; }
                    h1 { font-size: 1.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: -0.05em; margin-bottom: 2rem; margin-top: 0; }
                    p { font-size: 0.9rem; color: #888888; margin-bottom: 1.5rem; }
                    input[type="text"], input[type="file"] { width: 100%; background: #111111; border: 1px solid #222222; color: #ffffff; padding: 0.8rem; border-radius: 4px; margin-bottom: 1rem; font-size: 0.9rem; outline: none; box-sizing: border-box; }
                    button { width: 100%; background: #ffffff; color: #000000; border: none; padding: 1rem; border-radius: 4px; font-weight: 700; cursor: pointer; transition: opacity 0.2s; font-size: 0.9rem; text-transform: uppercase; }
                    button:disabled { opacity: 0.5; }
                    button.secondary { background: transparent; color: #ffffff; border: 1px solid #222222; margin-top: 0.5rem; }
                    #error-msg { color: #ffffff; font-size: 0.8rem; margin-bottom: 1rem; border: 1px solid #ff0000; padding: 0.5rem; display: none; }
                    .progress-container { width: 100%; height: 2px; background: #222222; margin: 1.5rem 0; display: none; overflow: hidden; }
                    .progress-bar { height: 100%; background: #ffffff; width: 0%; transition: width 0.1s; }
                    #status-text { font-size: 0.75rem; color: #888888; margin-top: 0.5rem; text-transform: uppercase; font-weight: 700; }
                    .pc-file-item { background: #111; border: 1px solid #222; padding: 0.8rem; border-radius: 4px; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Drop</h1>
                    <div id="registration-view">
                        <p>Register this device</p>
                        <input type="text" id="dn-input" placeholder="e.g. My Phone" required>
                        <div id="error-msg"></div>
                        <button id="reg-btn" onclick="registerDevice()">Register</button>
                        <div id="known-devices-view"></div>
                    </div>
                    <div id="upload-view" style="display: none;">
                        <p>Linked as <strong id="device-display"></strong></p>
                        <div id="upload-form">
                            <input type="file" id="file-input" multiple required>
                            <div class="progress-container" id="p-container">
                                <div class="progress-bar" id="p-bar"></div>
                            </div>
                            <div id="status-text"></div>
                            <button onclick="uploadFile()" id="upload-btn">Upload Files</button>
                        </div>
                        <button id="reset-btn" onclick="clearRegistration()" style="background: transparent; color: #888; font-size: 0.7rem; margin-top: 1rem; border: 1px solid #222; padding: 0.3rem 0.6rem; border-radius: 4px;">Reset Name</button>
                        
                        <div id="pc-files-view" style="margin-top: 2rem; border-top: 1px solid #222; padding-top: 1rem;">
                            <h3 style="font-size: 0.9rem; margin-bottom: 1rem; text-transform: uppercase;">Files from PC</h3>
                            <div id="pc-file-list" style="text-align: left; margin-bottom: 1rem;"></div>
                            <button onclick="fetchPcFiles()" class="secondary" style="font-size: 0.7rem; padding: 0.5rem;">Refresh List</button>
                        </div>
                    </div>
                </div>
                <script>
                    const regView = document.getElementById('registration-view');
                    const upView = document.getElementById('upload-view');
                    const dnInput = document.getElementById('dn-input');
                    const dnDisplay = document.getElementById('device-display');
                    const errMsg = document.getElementById('error-msg');
                    const regBtn = document.getElementById('reg-btn');
                    const pContainer = document.getElementById('p-container');
                    const pBar = document.getElementById('p-bar');
                    const statusText = document.getElementById('status-text');
                    const uploadBtn = document.getElementById('upload-btn');
                    const resetBtn = document.getElementById('reset-btn');

                    function checkRegistration() {
                        const name = localStorage.getItem('drop-device-name');
                        if (name) {
                            regView.style.display = 'none';
                            upView.style.display = 'block';
                            dnDisplay.innerText = name;
                            fetchPcFiles();
                        } else {
                            regView.style.display = 'block';
                            upView.style.display = 'none';
                            fetchKnownDevices();
                        }
                    }

                    async function fetchKnownDevices() {
                        const view = document.getElementById('known-devices-view');
                        try {
                            const res = await fetch('/known-devices');
                            const devices = await res.json();
                            if (devices.length > 0) {
                                view.innerHTML = '<p style="margin-top: 1.5rem; font-size: 0.7rem; color: #444;">Quick Sync</p>' +
                                    '<div style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center;">' +
                                    devices.map(d => '<button class="secondary" style="width: auto; padding: 0.5rem; font-size: 0.7rem;" onclick="selectDevice(\\'' + d + '\\')">' + d + '</button>').join('') +
                                    '</div>';
                            }
                        } catch (e) {}
                    }

                    function selectDevice(name) {
                        dnInput.value = name;
                        registerDevice();
                    }

                    async function registerDevice() {
                        const name = dnInput.value.trim();
                        if (!name) return;
                        regBtn.disabled = true;
                        errMsg.style.display = 'none';
                        try {
                            const res = await fetch('/check-device/' + encodeURIComponent(name));
                            const data = await res.json();
                            if (data.available) {
                                localStorage.setItem('drop-device-name', name);
                                checkRegistration();
                            } else {
                                errMsg.innerText = 'Name already taken';
                                errMsg.style.display = 'block';
                            }
                        } catch (err) {
                            errMsg.innerText = 'Server offline or error';
                            errMsg.style.display = 'block';
                        } finally {
                            regBtn.disabled = false;
                        }
                    }

                    async function fetchPcFiles() {
                        const list = document.getElementById('pc-file-list');
                        list.innerHTML = '<p style="color: #444; font-size: 0.75rem;">Updating...</p>';
                        try {
                            const res = await fetch('/pc-files');
                            const files = await res.json();
                            if (files.length === 0) {
                                list.innerHTML = '<p style="color: #444; font-size: 0.75rem;">No files available.</p>';
                                return;
                            }
                            list.innerHTML = files.map(f => \`
                                <div class="pc-file-item">
                                    <div style="flex: 1; overflow: hidden;">
                                        <div style="font-size: 0.8rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">\${f.name}</div>
                                        <div style="font-size: 0.65rem; color: #444;">\${f.size}</div>
                                    </div>
                                    <a href="/download/\${encodeURIComponent(f.name)}" download style="background: #fff; color: #000; text-decoration: none; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.7rem; font-weight: 800;">GET</a>
                                </div>
                            \`).join('');
                        } catch (err) {
                            list.innerHTML = '<p style="color: #ff0000; font-size: 0.75rem;">Error.</p>';
                        }
                    }

                    function uploadFile() {
                        const fileInput = document.getElementById('file-input');
                        if (fileInput.files.length === 0) return;
                        const name = localStorage.getItem('drop-device-name');
                        const formData = new FormData();
                        for (let f of fileInput.files) formData.append('file', f);
                        formData.append('device-name', name);

                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', '/upload', true);
                        xhr.setRequestHeader('device-name', name);
                        pContainer.style.display = 'block';
                        uploadBtn.disabled = true;
                        xhr.upload.onprogress = (e) => {
                            if (e.lengthComputable) {
                                const p = Math.round((e.loaded / e.total) * 100);
                                pBar.style.width = p + '%';
                                statusText.innerText = 'Sending: ' + p + '%';
                            }
                        };
                        xhr.onload = () => {
                            statusText.innerText = 'Uploaded!';
                            setTimeout(() => {
                                pContainer.style.display = 'none';
                                pBar.style.width = '0%';
                                statusText.innerText = '';
                                uploadBtn.disabled = false;
                                fileInput.value = '';
                            }, 1500);
                        };
                        xhr.send(formData);
                    }

                    function clearRegistration() {
                        if (confirm('Logout?')) {
                            localStorage.removeItem('drop-device-name');
                            location.reload();
                        }
                    }
                    checkRegistration();
                </script>
            </body>
            </html>
        `);
    });

    app.get('/pc-files', (req, res) => {
        fs.readdir(FROM_PC_DIR, (err, files) => {
            if (err) return res.status(500).json([]);
            res.json(files.map(f => {
                const s = fs.statSync(path.join(FROM_PC_DIR, f));
                return { name: f, size: (s.size / 1024 / 1024).toFixed(2) + ' MB' };
            }));
        });
    });

    app.get('/download/:filename', (req, res) => {
        const p = path.join(FROM_PC_DIR, req.params.filename);
        if (fs.existsSync(p)) res.download(p);
        else res.status(404).send('Not found');
    });

    return app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running at http://0.0.0.0:\${PORT}`);
    });
}

module.exports = { setupServer, PORT };
