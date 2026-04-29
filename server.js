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
// Ensure directories exist and clear FromPC for transparency
[DOWNLOAD_BASE, FROM_PC_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    } else if (dir === FROM_PC_DIR) {
        // Clear previous files in this session
        try {
            fs.readdirSync(dir).forEach(file => {
                fs.unlinkSync(path.join(dir, file));
            });
            console.log('[Server] Shared files cleared for new session');
        } catch (err) {
            console.error('[Server] Failed to clear previous files:', err);
        }
    }
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
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

        const targetDir = path.join(DOWNLOAD_BASE, category);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        cb(null, targetDir);
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
                // Also send a specific event for the last active device
                mainWindow.webContents.send('device-activity', { 
                    name: req.headers['device-name'] || 'Unknown' 
                });
            }
        });
        next();
    }, upload.array('file'), (req, res) => {
        if (!req.files || req.files.length === 0) return res.status(400).send('No files uploaded.');

        const deviceName = (req.headers['device-name'] || req.body['device-name'] || 'UnknownDevice').trim();

        req.files.forEach(file => {
            const info = {
                filename: file.originalname,
                device: deviceName,
                path: file.path,
                category: path.basename(path.dirname(file.path)),
                time: new Date().toLocaleTimeString()
            };
            if (mainWindow) {
                mainWindow.webContents.send('file-received', info);
                mainWindow.webContents.send('device-activity', { name: deviceName });
            }
        });

        res.status(200).json({ message: `${req.files.length} files uploaded` });
    });

    app.get('/manifest.json', (req, res) => {
        res.json({
            name: "Drop",
            short_name: "Drop",
            start_url: "/",
            display: "standalone",
            background_color: "#050505",
            theme_color: "#00f7ff",
            icons: [{
                src: "/logo.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any maskable"
            }]
        });
    });

    app.get('/sw.js', (req, res) => {
        res.set('Content-Type', 'application/javascript');
        res.send("self.addEventListener('fetch', function(event) {});"); // Basic SW to enable PWA
    });

    app.get('/logo.png', (req, res) => {
        res.sendFile(path.join(__dirname, 'logo.png'));
    });

    app.get('/', (req, res) => {
        console.log(`[Server] Web client access attempt from ${req.ip}`);
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <title>Drop - Sync</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
                <meta name="theme-color" content="#00f7ff">
                <link rel="manifest" href="/manifest.json">
                <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
                <script>
                    if ('serviceWorker' in navigator) {
                        navigator.serviceWorker.register('/sw.js');
                    }
                </script>
                <style>
                    :root {
                        --bg: #050505;
                        --neon-cyan: #00f7ff;
                        --neon-magenta: #ff00ff;
                        --glass: rgba(255, 255, 255, 0.03);
                        --border: rgba(0, 247, 255, 0.2);
                    }
                    body { 
                        font-family: 'Outfit', sans-serif; 
                        background: var(--bg); 
                        color: #ffffff; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        min-height: 100vh; 
                        padding: 20px; 
                        margin: 0;
                        background-image: radial-gradient(circle at 10% 20%, rgba(0, 247, 255, 0.05) 0%, transparent 20%);
                    }
                    .card { 
                        background: rgba(15, 15, 15, 0.8); 
                        padding: 2.5rem; 
                        border-radius: 24px; 
                        border: 1px solid var(--border); 
                        width: 100%; 
                        max-width: 400px; 
                        text-align: center; 
                        backdrop-filter: blur(20px);
                        box-shadow: 0 0 20px rgba(0, 247, 255, 0.1);
                    }
                    h1 { font-size: 2.2rem; font-weight: 800; text-transform: uppercase; letter-spacing: -0.05em; color: var(--neon-cyan); margin-bottom: 2rem; text-shadow: 0 0 10px var(--neon-cyan); }
                    p { font-size: 0.9rem; color: #a0a0a0; margin-bottom: 2rem; }
                    
                    .upload-area {
                        position: relative;
                        background: var(--glass);
                        border: 2px dashed var(--border);
                        border-radius: 16px;
                        padding: 2rem;
                        margin-bottom: 1.5rem;
                        transition: all 0.3s;
                    }
                    .upload-area:hover {
                        border-color: var(--neon-cyan);
                        background: rgba(0, 247, 255, 0.05);
                    }
                    
                    input[type="file"] { 
                        position: absolute;
                        inset: 0;
                        opacity: 0;
                        cursor: pointer;
                        width: 100%;
                    }

                    .upload-icon { font-size: 2.5rem; display: block; margin-bottom: 1rem; }
                    
                    button { 
                        width: 100%; 
                        background: var(--neon-cyan); 
                        color: #000; 
                        border: none; 
                        padding: 1rem; 
                        border-radius: 12px; 
                        font-weight: 700; 
                        cursor: pointer; 
                        transition: all 0.3s; 
                        font-size: 1rem; 
                        text-transform: uppercase;
                        box-shadow: 0 0 15px var(--neon-cyan);
                    }
                    button:hover { transform: translateY(-2px); box-shadow: 0 0 25px var(--neon-cyan); }
                    button:disabled { opacity: 0.5; transform: none; box-shadow: none; }
                    
                    .progress-container { width: 100%; height: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 10px; margin: 1.5rem 0; display: none; overflow: hidden; }
                    .progress-bar { height: 100%; background: linear-gradient(90deg, var(--neon-cyan), var(--neon-magenta)); width: 0%; transition: width 0.3s; box-shadow: 0 0 10px var(--neon-cyan); }
                    #status-text { font-size: 0.8rem; color: var(--neon-cyan); margin-top: 1rem; font-weight: 600; text-transform: uppercase; }
                    
                    .downloads-section { margin-top: 3rem; text-align: left; border-top: 1px solid var(--border); padding-top: 2rem; }
                    .downloads-section h2 { font-size: 1.2rem; color: var(--neon-magenta); text-transform: uppercase; margin-bottom: 1.5rem; text-shadow: 0 0 8px var(--neon-magenta); }
                    .file-list { display: flex; flex-direction: column; gap: 10px; }
                    .file-item { 
                        background: var(--glass); 
                        border: 1px solid rgba(255,255,255,0.05); 
                        padding: 12px; 
                        border-radius: 12px; 
                        display: flex; 
                        justify-content: space-between; 
                        align-items: center;
                        text-decoration: none;
                        color: #fff;
                        transition: all 0.3s;
                    }
                    .file-item:hover { border-color: var(--neon-magenta); background: rgba(255, 0, 255, 0.05); transform: translateX(5px); }
                    .file-info { display: flex; flex-direction: column; }
                    .file-name { font-size: 0.9rem; font-weight: 600; }
                    .file-size { font-size: 0.7rem; color: #666; }
                    .dl-icon { color: var(--neon-magenta); font-size: 1.2rem; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>DROP</h1>
                    <p>Instant file sync with PC</p>
                    
                    <div id="upload-view">
                        <div class="upload-area" id="drop-zone">
                            <span class="upload-icon">📤</span>
                            <span id="file-label">Select or drop files</span>
                            <input type="file" id="file-input" multiple onchange="updateLabel()">
                        </div>

                        <div class="progress-container" id="p-container">
                            <div class="progress-bar" id="p-bar"></div>
                        </div>
                        <div id="status-text"></div>

                        <button onclick="uploadFile()" id="upload-btn">Upload Files</button>
                    </div>
                    
                    <div class="downloads-section">
                        <h2>Files from PC</h2>
                        <div id="pc-file-list" class="file-list">
                            <p style="font-size: 0.8rem; color: #444;">No shared files yet</p>
                        </div>
                    </div>
                </div>

                <script>
                    const fileInput = document.getElementById('file-input');
                    const fileLabel = document.getElementById('file-label');
                    const pContainer = document.getElementById('p-container');
                    const pBar = document.getElementById('p-bar');
                    const statusText = document.getElementById('status-text');
                    const uploadBtn = document.getElementById('upload-btn');
                    const pcFileList = document.getElementById('pc-file-list');

                    function updateLabel() {
                        const count = fileInput.files.length;
                        fileLabel.innerText = count > 0 ? (count + ' file' + (count > 1 ? 's' : '') + ' selected') : 'Select or drop files';
                    }

                    async function loadPcFiles() {
                        try {
                            const res = await fetch('/pc-files');
                            const files = await res.json();
                            if (files.length === 0) {
                                pcFileList.innerHTML = '<p style="font-size: 0.8rem; color: #444;">No shared files yet</p>';
                                return;
                            }
                            pcFileList.innerHTML = files.map(f => \`
                                <a href="/download/\${encodeURIComponent(f.name)}" class="file-item" download>
                                    <div class="file-info">
                                        <div class="file-name">\${f.name}</div>
                                        <div class="file-size">\${f.size}</div>
                                    </div>
                                    <div class="dl-icon">📥</div>
                                </a>
                            \`).join('');
                        } catch (e) {
                            console.error('Failed to load files', e);
                        }
                    }

                    function uploadFile() {
                        if (fileInput.files.length === 0) return;
                        
                        const formData = new FormData();
                        for (let f of fileInput.files) formData.append('file', f);
                        formData.append('device-name', 'WebSync'); // Internal default

                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', '/upload', true);
                        xhr.setRequestHeader('device-name', 'WebSync');
                        
                        pContainer.style.display = 'block';
                        uploadBtn.disabled = true;
                        
                        xhr.upload.onprogress = (e) => {
                            if (e.lengthComputable) {
                                const p = Math.round((e.loaded / e.total) * 100);
                                pBar.style.width = p + '%';
                                statusText.innerText = 'UPLOADING: ' + p + '%';
                            }
                        };

                        xhr.onload = () => {
                            if (xhr.status === 200) {
                                statusText.innerText = 'COMPLETED!';
                                setTimeout(() => {
                                    pContainer.style.display = 'none';
                                    pBar.style.width = '0%';
                                    statusText.innerText = '';
                                    uploadBtn.disabled = false;
                                    fileInput.value = '';
                                    updateLabel();
                                }, 2000);
                            } else {
                                statusText.innerText = 'ERROR OCCURRED';
                                uploadBtn.disabled = false;
                            }
                        };
                        xhr.send(formData);
                    }

                    // Initial load and polling
                    loadPcFiles();
                    setInterval(loadPcFiles, 5000);
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
        console.log(`Server running at http://0.0.0.0:${PORT}`);
    });
}

module.exports = { setupServer, PORT };
