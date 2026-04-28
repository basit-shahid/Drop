const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { ipcMain } = require('electron');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Base directories
const DOWNLOAD_BASE = path.join(process.env.USERPROFILE, 'Documents', 'AndroidFiles');
const FROM_PC_DIR = path.join(DOWNLOAD_BASE, 'FromPC');

// Ensure directories exist
[DOWNLOAD_BASE, FROM_PC_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Check header first (for scripts), then body (for forms)
        let deviceName = (req.headers['device-name'] || req.body['device-name'] || 'UnknownDevice').trim().toLowerCase();
        
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

        const deviceDir = path.join(DOWNLOAD_BASE, deviceName.replace(/[^a-z0-9_-]/gi, '_'), category);
        
        if (!fs.existsSync(deviceDir)) {
            fs.mkdirSync(deviceDir, { recursive: true });
        }
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
        if (!req.files || req.files.length === 0) {
            return res.status(400).send('No files uploaded.');
        }

        req.files.forEach(file => {
            const info = {
                filename: file.originalname,
                device: (req.headers['device-name'] || req.body['device-name'] || 'UnknownDevice').trim().toLowerCase(),
                path: file.path,
                category: path.basename(path.dirname(file.path)),
                time: new Date().toLocaleTimeString()
            };

            // Send info to UI
            if (mainWindow) {
                mainWindow.webContents.send('file-received', info);
            }
        });

        if (req.headers['accept'] && req.headers['accept'].includes('application/json')) {
            res.status(200).json({
                message: `${req.files.length} files uploaded successfully`
            });
        } else {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #1e1e2e; color: white; }
                        .card { background: #313244; padding: 2rem; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center; }
                        a { color: #89b4fa; text-decoration: none; border: 1px solid #89b4fa; padding: 0.5rem 1rem; border-radius: 50px; margin-top: 1rem; display: inline-block; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Success!</h1>
                        <p>${req.files.length} files were sent to PC.</p>
                        <a href="/">Send more files</a>
                    </div>
                </body>
                </html>
            `);
        }
    });

    app.get('/check-device/:name', (req, res) => {
        const deviceName = req.params.name.trim().toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
        const deviceDir = path.join(DOWNLOAD_BASE, deviceName);
        
        if (fs.existsSync(deviceDir)) {
            res.json({ available: false });
        } else {
            res.json({ available: true });
        }
    });

    app.get('/', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Drop - Upload</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #1e1e2e; color: white; }
                    .card { background: #313244; padding: 2rem; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center; width: 90%; max-width: 400px; }
                    input[type="file"] { margin: 1rem 0; }
                    button { background: #89b4fa; border: none; padding: 0.8rem 2rem; border-radius: 50px; color: #1e1e2e; font-weight: bold; cursor: pointer; transition: opacity 0.2s; }
                    button:disabled { opacity: 0.5; cursor: not-allowed; }
                    input[type="text"] { background: #45475a; border: 1px solid #585b70; color: white; padding: 0.5rem; border-radius: 5px; margin-bottom: 0.5rem; width: 100%; box-sizing: border-box; }
                    #error-msg { color: #f38ba8; font-size: 0.8rem; margin-bottom: 1rem; display: none; }
                    .progress-container { width: 100%; background: #45475a; border-radius: 10px; height: 10px; margin: 1rem 0; display: none; overflow: hidden; }
                    .progress-bar { height: 100%; background: #89b4fa; width: 0%; transition: width 0.2s; }
                    #status-text { font-size: 0.8rem; color: #a6adc8; margin-top: 0.5rem; }
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
                        <button id="reset-btn" onclick="clearRegistration()" style="background: transparent; color: #a6adc8; font-size: 0.7rem; margin-top: 1rem; border: 1px solid #585b70; padding: 0.3rem 0.6rem; border-radius: 5px;">Reset Name</button>
                        
                        <div id="pc-files-view" style="margin-top: 2rem; border-top: 1px solid #45475a; padding-top: 1rem;">
                            <h3 style="font-size: 1rem; margin-bottom: 1rem;">Files from PC</h3>
                            <div id="pc-file-list" style="text-align: left; margin-bottom: 1rem;">
                                <p style="color: #6c7086; font-size: 0.8rem;">Loading files...</p>
                            </div>
                            <button onclick="fetchPcFiles()" style="background: transparent; color: #89b4fa; border: 1px solid #89b4fa; padding: 0.3rem 0.6rem; font-size: 0.7rem; width: auto;">Refresh List</button>
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
                        const savedDn = localStorage.getItem('drop-device-name');
                        if (savedDn) {
                            regView.style.display = 'none';
                            upView.style.display = 'block';
                            dnDisplay.innerText = savedDn;
                            fetchPcFiles();
                        } else {
                            regView.style.display = 'block';
                            upView.style.display = 'none';
                        }
                    }

                    async function fetchPcFiles() {
                        const list = document.getElementById('pc-file-list');
                        try {
                            const res = await fetch('/pc-files');
                            const files = await res.json();
                            if (files.length === 0) {
                                list.innerHTML = '<p style="color: #6c7086; font-size: 0.8rem;">No files from PC yet.</p>';
                                return;
                            }
                            list.innerHTML = files.map(f => {
                                return '<div style="background: #45475a; padding: 0.8rem; border-radius: 12px; margin-bottom: 0.6rem; display: flex; justify-content: space-between; align-items: center;">' +
                                    '<div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px;">' +
                                        '<div style="font-size: 0.85rem; font-weight: bold; color: #cdd6f4;">' + f.name + '</div>' +
                                        '<div style="font-size: 0.7rem; color: #a6adc8;">' + f.size + '</div>' +
                                    '</div>' +
                                    '<a href="/download/' + encodeURIComponent(f.name) + '" download style="background: #89b4fa; color: #1e1e2e; text-decoration: none; padding: 0.4rem 0.8rem; border-radius: 8px; font-size: 0.75rem; font-weight: bold;">Get</a>' +
                                '</div>';
                            }).join('');
                        } catch (err) {
                            list.innerHTML = '<p style="color: #f38ba8; font-size: 0.8rem;">Error loading files.</p>';
                        }
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
                            errMsg.innerText = 'Server error';
                            errMsg.style.display = 'block';
                        } finally {
                            regBtn.disabled = false;
                        }
                    }

                    function uploadFile() {
                        const fileInput = document.getElementById('file-input');
                        const files = fileInput.files;
                        if (files.length === 0) return;

                        const deviceName = localStorage.getItem('drop-device-name');
                        const formData = new FormData();
                        for (let i = 0; i < files.length; i++) {
                            formData.append('file', files[i]);
                        }
                        formData.append('device-name', deviceName);

                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', '/upload', true);
                        xhr.setRequestHeader('device-name', deviceName); // Also send in header for progress tracking

                        pContainer.style.display = 'block';
                        uploadBtn.disabled = true;
                        resetBtn.style.display = 'none';

                        const totalFiles = files.length;
                        xhr.upload.onprogress = (e) => {
                            if (e.lengthComputable) {
                                const percent = Math.round((e.loaded / e.total) * 100);
                                pBar.style.width = percent + '%';
                                statusText.innerText = 'Uploading ' + totalFiles + ' file(s): ' + percent + '%';
                            }
                        };

                        xhr.onload = () => {
                            statusText.innerText = 'Success!';
                            setTimeout(() => {
                                pContainer.style.display = 'none';
                                pBar.style.width = '0%';
                                statusText.innerText = '';
                                uploadBtn.disabled = false;
                                resetBtn.style.display = 'inline-block';
                                fileInput.value = '';
                            }, 2000);
                        };

                        xhr.onerror = () => {
                            statusText.innerText = 'Upload failed!';
                            uploadBtn.disabled = false;
                            resetBtn.style.display = 'inline-block';
                        };

                        xhr.send(formData);
                    }

                    function clearRegistration() {
                        if (confirm('Change device name?')) {
                            localStorage.removeItem('drop-device-name');
                            checkRegistration();
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
            if (err) return res.status(500).json({ error: 'Cannot read directory' });
            const fileInfos = files.map(f => {
                const stats = fs.statSync(path.join(FROM_PC_DIR, f));
                return { name: f, size: (stats.size / 1024 / 1024).toFixed(2) + ' MB' };
            });
            res.json(fileInfos);
        });
    });

    app.get('/download/:filename', (req, res) => {
        const filePath = path.join(FROM_PC_DIR, req.params.filename);
        if (fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            res.status(404).send('File not found');
        }
    });

    app.get('/status', (req, res) => {
        res.send('Server is running');
    });

    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running at http://0.0.0.0:${PORT}`);
    });

    return server;
}

module.exports = { setupServer, PORT };
