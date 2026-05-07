
// Mobile Client Logic for Drop
let targetServerUrl = '';
let scanning = false;
let scanStream = null;
let remotePollInterval = null;

/**
 * Client-side File Security Validation
 */
const CLIENT_FILE_SECURITY = {
    // Maximum file size: 2GB
    MAX_FILE_SIZE: 2 * 1024 * 1024 * 1024,

    // Dangerous extensions (BLOCKED)
    DANGEROUS_EXTENSIONS: new Set([
        'exe', 'msi', 'scr', 'bat', 'cmd', 'com', 'dll', 'sys',
        'vbs', 'jse', 'wsf', 'jar', 'lnk', 'app', 'deb', 'rpm', 'dmg', 'iso', 'img',
        'ps1', 'psm1', 'psc1', 'psc2', 'sh', 'bash', 'ksh',
        'csh', 'zsh', 'cpp', 'c', 'h', 'py', 'rb', 'pl', 'php',
        'asp', 'jsp', 'class', 'swift', 'go', 'rs'
    ]),

    // Safe extensions (WHITELIST)
    SAFE_EXTENSIONS: new Set([
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'heic', 'heif',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods',
        'mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'aiff',
        'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpeg', 'mpg',
        'zip', '7z',
        'json', 'xml', 'csv', 'sql',
        'ttf', 'otf', 'woff', 'woff2',
        'md', 'markdown', 'rst'
    ]),

    /**
     * Validate file before upload
     */
    validateFile(file) {
        const errors = [];
        const warnings = [];

        // Check file size
        if (file.size > this.MAX_FILE_SIZE) {
            errors.push(`File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB (max 2GB)`);
        }

        // Get extension
        const filename = file.name.toLowerCase();
        const ext = filename.split('.').pop();

        // Check extension
        if (this.DANGEROUS_EXTENSIONS.has(ext)) {
            errors.push(`❌ BLOCKED: .${ext} files are not allowed for security reasons`);
        } else if (!this.SAFE_EXTENSIONS.has(ext)) {
            warnings.push(`⚠️ WARNING: .${ext} is not a recognized file type - processing with caution`);
        }

        // Check MIME type
        const validMimeTypes = [
            'image/', 'video/', 'audio/',
            'application/pdf', 'application/json', 'application/xml',
            'text/', 'application/zip',
            'application/vnd.ms-', 'application/vnd.openxmlformats-'
        ];

        const isValidMime = validMimeTypes.some(mime => file.type.startsWith(mime));
        if (!isValidMime && file.type) {
            warnings.push(`⚠️ WARNING: Unusual MIME type - ${file.type}`);
        }

        return { valid: errors.length === 0, errors, warnings };
    },

    /**
     * Validate multiple files
     */
    validateFiles(files) {
        const results = {
            valid: [],
            blocked: [],
            warnings: []
        };

        Array.from(files).forEach(file => {
            const validation = this.validateFile(file);
            if (validation.errors.length > 0) {
                results.blocked.push({
                    filename: file.name,
                    reasons: validation.errors
                });
            } else {
                results.valid.push(file);
                if (validation.warnings.length > 0) {
                    results.warnings.push({
                        filename: file.name,
                        warnings: validation.warnings
                    });
                }
            }
        });

        return results;
    }
};

const clientSetupView = document.getElementById('client-setup-view');
const clientUploadView = document.getElementById('client-upload-view');
const clientFileInput = document.getElementById('file-input');
const clientFileLabel = document.getElementById('file-label');
const clientUploadBtn = document.getElementById('upload-btn');
const clientStatus = document.getElementById('client-status');
const serverUrlInput = document.getElementById('server-url-input');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const startScanBtn = document.getElementById('start-scan-btn');
const scannerOverlay = document.getElementById('scanner-overlay');
const scannerVideo = document.getElementById('scanner-video');
const scannerCanvas = document.getElementById('scanner-canvas');
const closeScannerBtn = document.getElementById('close-scanner-btn');
const clientDownloadsSection = document.getElementById('client-downloads-section');
const remoteFileList = document.getElementById('remote-file-list');
const openChatBtn = document.getElementById('open-chat-btn');

// Handle Share Intent from Android
window.addEventListener('shareIntent', (event) => {
    console.log('[Native] Share intent received:', event.detail);
    const uris = event.detail.uris;
    if (uris && uris.length > 0) {
        // In a real app, we'd use Capacitor Filesystem to read these URIs
        // For now, we notify the user we caught the intent
        clientStatus.innerText = `📲 RECEIVED ${uris.length} SHARED FILE(S)`;
        alert(`Shared files detected! To upload them, please select them from the file picker in the Drop app. (Direct native-to-web sharing requires additional plugin configuration)`);
    }
});

async function loadRemoteFiles() {
    if (!targetServerUrl) return;
    try {
        const res = await fetch(targetServerUrl + 'pc-files');
        const files = await res.json();
        clientDownloadsSection.style.display = files.length > 0 ? 'block' : 'none';
        if (files.length === 0) return;
        
        remoteFileList.innerHTML = files.map(f => `
            <div class="file-item" onclick="window.open('${targetServerUrl}download/${encodeURIComponent(f.name)}', '_blank')">
                <div class="file-info">
                    <div class="file-name">${f.name}</div>
                    <div class="file-size">${f.size}</div>
                </div>
                <div class="dl-icon">📥</div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Remote files load failed', e);
    }
}

// Scanner Logic
async function startScanner() {
    try {
        scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        scannerVideo.srcObject = scanStream;
        scannerVideo.setAttribute('playsinline', true);
        scannerVideo.play();
        scannerOverlay.style.display = 'flex';
        scanning = true;
        requestAnimationFrame(tick);
    } catch (err) {
        alert('Camera access denied or not available.');
    }
}

function stopScanner() {
    scanning = false;
    if (scanStream) {
        scanStream.getTracks().forEach(track => track.stop());
        scanStream = null;
    }
    scannerOverlay.style.display = 'none';
    scannerVideo.srcObject = null;
}

function tick() {
    if (scannerVideo.readyState === scannerVideo.HAVE_ENOUGH_DATA && scanning) {
        const canvas = scannerCanvas;
        const context = canvas.getContext('2d');
        canvas.height = scannerVideo.videoHeight;
        canvas.width = scannerVideo.videoWidth;
        context.drawImage(scannerVideo, 0, 0, canvas.width, canvas.height);
        
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
        });

        if (code) {
            let url = code.data;
            if (url.startsWith('http')) {
                stopScanner();
                handleConnect(url);
                return;
            }
        }
    }
    if (scanning) requestAnimationFrame(tick);
}

function handleConnect(url) {
    if (!url) return;
    if (!url.startsWith('http')) url = 'http://' + url;
    if (!url.endsWith('/')) url += '/';
    targetServerUrl = url;
    clientSetupView.style.display = 'none';
    clientUploadView.style.display = 'block';
    clientStatus.innerText = 'SYNCED TO PC';
    
    loadRemoteFiles();
    if (remotePollInterval) clearInterval(remotePollInterval);
    remotePollInterval = setInterval(loadRemoteFiles, 5000);

    // Show Chat Button
    if (openChatBtn) {
        openChatBtn.style.display = 'block';
        openChatBtn.onclick = () => {
            const chatUrl = targetServerUrl + 'chat';
            window.open(chatUrl, '_blank');
        };
    }
}

startScanBtn.addEventListener('click', startScanner);
closeScannerBtn.addEventListener('click', stopScanner);
connectBtn.addEventListener('click', () => handleConnect(serverUrlInput.value.trim()));
disconnectBtn.addEventListener('click', () => {
    targetServerUrl = '';
    if (remotePollInterval) clearInterval(remotePollInterval);
    remotePollInterval = null;
    clientSetupView.style.display = 'block';
    clientUploadView.style.display = 'none';
    clientDownloadsSection.style.display = 'none';
    clientStatus.innerText = 'READY FOR SYNC';
});

clientFileInput.addEventListener('change', () => {
    if (clientFileInput.files.length === 0) {
        clientFileLabel.innerText = 'SELECT OR DROP FILES';
        clientStatus.innerText = 'READY FOR UPLOAD';
        return;
    }

    // Validate files
    const validation = CLIENT_FILE_SECURITY.validateFiles(clientFileInput.files);
    const count = validation.valid.length;
    
    clientFileLabel.innerText = count > 0 ? `${count} FILE${count > 1 ? 'S' : ''} READY` : 'SELECT OR DROP FILES';
    
    if (validation.blocked.length > 0) {
        clientStatus.innerText = `⚠️ ${validation.blocked.length} FILE${validation.blocked.length > 1 ? 'S' : ''} BLOCKED`;
        console.warn('Blocked files:', validation.blocked);
    } else if (validation.warnings.length > 0) {
        clientStatus.innerText = `⚠️ ${validation.warnings.length} FILE${validation.warnings.length > 1 ? 'S' : ''} WARNING`;
        console.warn('Files with warnings:', validation.warnings);
    } else {
        clientStatus.innerText = 'READY FOR UPLOAD';
    }
});

async function uploadFromMobile() {
    if (clientFileInput.files.length === 0 || !targetServerUrl) return;

    // Validate files before upload
    const validation = CLIENT_FILE_SECURITY.validateFiles(clientFileInput.files);

    if (validation.blocked.length > 0) {
        clientStatus.innerText = `❌ ${validation.blocked.length} blocked file(s)`;
        alert(`🚫 SECURITY: Cannot upload ${validation.blocked.length} file(s):\n\n${
            validation.blocked.map(f => `• ${f.filename}\n  ${f.reasons.join('\n  ')}`).join('\n\n')
        }`);
        return;
    }

    if (validation.valid.length === 0) {
        clientStatus.innerText = 'NO VALID FILES';
        return;
    }

    const formData = new FormData();
    // Only add valid files
    validation.valid.forEach(f => formData.append('file', f));
    formData.append('device-name', 'Mobile-App');

    clientUploadBtn.disabled = true;
    clientStatus.innerText = 'UPLOADING...';
    
    try {
        const response = await fetch(targetServerUrl + 'upload', {
            method: 'POST',
            headers: { 'device-name': 'Mobile-App' },
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            
            // Show detailed results
            let message = 'SYNC COMPLETED!';
            if (result.summary.blocked > 0) {
                message = `✅ ${result.summary.safe} OK, ⚠️ ${result.summary.blocked} BLOCKED`;
            }
            
            clientStatus.innerText = message;
            
            // Show detailed report if there were issues
            if (result.summary.blocked > 0 || result.summary.review > 0) {
                console.log('File Processing Report:', result);
                if (result.details.blocked.length > 0) {
                    alert(`🚫 BLOCKED FILES:\n${result.details.blocked.map(f => `• ${f.filename}`).join('\n')}`);
                }
            }

            setTimeout(() => {
                clientFileInput.value = '';
                clientFileLabel.innerText = 'SELECT OR DROP FILES';
                clientStatus.innerText = 'SYNCED TO PC';
                clientUploadBtn.disabled = false;
            }, 2000);
        } else {
            clientStatus.innerText = 'UPLOAD FAILED';
            clientUploadBtn.disabled = false;
        }
    } catch (err) {
        clientStatus.innerText = 'SERVER OFFLINE';
        console.error('Upload error:', err);
        clientUploadBtn.disabled = false;
    }
}

clientUploadBtn.addEventListener('click', uploadFromMobile);
