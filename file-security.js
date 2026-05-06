const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * File Security Module - Comprehensive malware and threat detection
 */

class FileSecurityScanner {
    constructor() {
        // Maximum file size: 2GB
        this.MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

        // File signature validation (magic bytes)
        this.MAGIC_BYTES = {
            'jpg': [0xFF, 0xD8, 0xFF],
            'jpeg': [0xFF, 0xD8, 0xFF],
            'png': [0x89, 0x50, 0x4E, 0x47],
            'gif': [0x47, 0x49, 0x46],
            'pdf': [0x25, 0x50, 0x44, 0x46],
            'zip': [0x50, 0x4B, 0x03, 0x04],
            'rar': [0x52, 0x61, 0x72, 0x21],
            '7z': [0x37, 0x7A, 0xBC, 0xAF],
            'mp4': [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70],
            'mp3': [0x49, 0x44, 0x33], // ID3 tag
            'wav': [0x52, 0x49, 0x46, 0x46],
            'exe': [0x4D, 0x5A], // MZ header
            'dll': [0x4D, 0x5A],
            'bat': [0x3A, 0x20], // DOS batch
            'msi': [0xD0, 0xCF, 0x11, 0xE0],
            'doc': [0xD0, 0xCF, 0x11, 0xE0],
            'xls': [0xD0, 0xCF, 0x11, 0xE0],
            'docx': [0x50, 0x4B, 0x03, 0x04],
            'xlsx': [0x50, 0x4B, 0x03, 0x04],
            'webp': [0x52, 0x49, 0x46, 0x46]
        };

        // Dangerous file extensions (BLOCKED)
        this.DANGEROUS_EXTENSIONS = new Set([
            'exe', 'msi', 'scr', 'bat', 'cmd', 'com', 'dll', 'sys',
            'vbs', 'js', 'jse', 'wsf', 'jar', 'rar', 'zip', // Executable archives
            'lnk', 'app', 'deb', 'rpm', 'dmg', 'iso', 'img',
            'ps1', 'psm1', 'psc1', 'psc2', 'sh', 'bash', 'ksh',
            'csh', 'zsh', 'cpp', 'c', 'h', 'py', 'rb', 'pl', 'php',
            'asp', 'jsp', 'class', 'swift', 'go', 'rs'
        ]);

        // Suspicious content patterns (regex patterns that indicate malware)
        this.MALICIOUS_PATTERNS = [
            /cmd\.exe|powershell|system32/gi,
            /eval\s*\(/gi,
            /exec\s*\(/gi,
            /base64_decode/gi,
            /<script[^>]*>.*?<\/script>/gi,
            /onclick\s*=/gi,
            /onerror\s*=/gi,
            /onfocus\s*=/gi,
            /onload\s*=/gi,
            /javascript:/gi,
            /vbscript:/gi,
            /document\.write/gi,
            /window\.location\s*=/gi
        ];

        // Safe extensions (WHITELIST)
        this.SAFE_EXTENSIONS = new Set([
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'heic', 'heif',
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods',
            'mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'aiff',
            'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpeg', 'mpg',
            'zip', '7z', // Safe archives only
            'json', 'xml', 'csv', 'sql',
            'ttf', 'otf', 'woff', 'woff2',
            'md', 'markdown', 'rst'
        ]);

        // Quarantine directory
        this.QUARANTINE_DIR = path.join(os.homedir(), 'Documents', 'AndroidFiles', '.quarantine');
        this.LOG_FILE = path.join(os.homedir(), 'Documents', 'AndroidFiles', 'security-log.txt');

        // Create directories
        this.ensureDirectories();
    }

    ensureDirectories() {
        [this.QUARANTINE_DIR].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * Log security events
     */
    log(level, message, details = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level}] ${message} ${JSON.stringify(details)}\n`;
        
        try {
            fs.appendFileSync(this.LOG_FILE, logEntry);
        } catch (err) {
            console.error('Failed to write security log:', err);
        }
        
        console.log(logEntry);
    }

    /**
     * Verify file signature (magic bytes)
     */
    verifyFileSignature(filePath, extension) {
        try {
            const buffer = Buffer.alloc(12);
            const fd = fs.openSync(filePath, 'r');
            fs.readSync(fd, buffer, 0, 12, 0);
            fs.closeSync(fd);

            const ext = extension.toLowerCase();
            const expectedSignature = this.MAGIC_BYTES[ext];

            if (!expectedSignature) {
                // Extension not in known signatures - allow with caution
                return { valid: true, reason: 'Unknown extension type - allowed' };
            }

            const fileSignature = Array.from(buffer.slice(0, expectedSignature.length));
            const isValid = fileSignature.every((byte, index) => byte === expectedSignature[index]);

            return {
                valid: isValid,
                reason: isValid ? 'File signature matches' : 'File signature mismatch - possible spoofed file type',
                expected: expectedSignature,
                actual: fileSignature
            };
        } catch (err) {
            this.log('WARN', 'Failed to verify signature', { error: err.message, filePath });
            return { valid: false, reason: 'Could not read file signature' };
        }
    }

    /**
     * Check file content for malicious patterns
     */
    scanForMaliciousContent(filePath) {
        try {
            // Only scan text-based files
            const ext = path.extname(filePath).toLowerCase().slice(1);
            const textExtensions = ['txt', 'json', 'xml', 'csv', 'html', 'js', 'py', 'sh', 'bat'];
            
            if (!textExtensions.includes(ext)) {
                return { infected: false, reason: 'Binary file - skipped content scan' };
            }

            const content = fs.readFileSync(filePath, 'utf8').slice(0, 1000000); // First 1MB

            for (const pattern of this.MALICIOUS_PATTERNS) {
                if (pattern.test(content)) {
                    return {
                        infected: true,
                        reason: `Malicious pattern detected: ${pattern}`,
                        pattern: pattern.toString()
                    };
                }
            }

            return { infected: false, reason: 'No malicious patterns detected' };
        } catch (err) {
            this.log('WARN', 'Failed to scan content', { error: err.message, filePath });
            return { infected: false, reason: 'Could not scan content' };
        }
    }

    /**
     * Comprehensive security check
     */
    async scanFile(filePath, originalFilename) {
        const ext = path.extname(originalFilename).toLowerCase().slice(1);
        const fileSize = fs.statSync(filePath).size;

        const results = {
            filename: originalFilename,
            extension: ext,
            fileSize: fileSize,
            timestamp: new Date().toISOString(),
            checks: {
                sizeCheck: null,
                extensionCheck: null,
                signatureCheck: null,
                contentCheck: null
            },
            verdict: 'SAFE',
            reasons: []
        };

        // Check 1: File size
        if (fileSize > this.MAX_FILE_SIZE) {
            results.checks.sizeCheck = 'BLOCKED';
            results.verdict = 'BLOCKED';
            results.reasons.push(`File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB (max 2GB)`);
            this.log('BLOCKED', 'File too large', { filename: originalFilename, size: fileSize });
        } else {
            results.checks.sizeCheck = 'PASSED';
        }

        // Check 2: Extension validation
        if (this.DANGEROUS_EXTENSIONS.has(ext)) {
            results.checks.extensionCheck = 'BLOCKED';
            results.verdict = 'BLOCKED';
            results.reasons.push(`Dangerous file extension: .${ext} is not allowed`);
            this.log('BLOCKED', 'Dangerous extension', { filename: originalFilename, extension: ext });
        } else if (!this.SAFE_EXTENSIONS.has(ext)) {
            results.checks.extensionCheck = 'WARNING';
            results.reasons.push(`Unknown extension: .${ext} - processed with caution`);
            this.log('WARN', 'Unknown extension', { filename: originalFilename, extension: ext });
        } else {
            results.checks.extensionCheck = 'PASSED';
        }

        // Check 3: File signature verification
        if (results.verdict !== 'BLOCKED') {
            const sigCheck = this.verifyFileSignature(filePath, ext);
            results.checks.signatureCheck = sigCheck.valid ? 'PASSED' : 'WARNING';
            if (!sigCheck.valid) {
                results.reasons.push(sigCheck.reason);
                this.log('WARN', 'Signature mismatch', { filename: originalFilename, ...sigCheck });
            }
        }

        // Check 4: Malicious content scan
        if (results.verdict !== 'BLOCKED') {
            const contentCheck = this.scanForMaliciousContent(filePath);
            results.checks.contentCheck = contentCheck.infected ? 'INFECTED' : 'PASSED';
            if (contentCheck.infected) {
                results.verdict = 'BLOCKED';
                results.reasons.push(contentCheck.reason);
                this.log('BLOCKED', 'Malicious content detected', { filename: originalFilename, ...contentCheck });
            }
        }

        // Determine final verdict
        if (results.verdict !== 'BLOCKED' && results.reasons.length === 0) {
            results.verdict = 'SAFE';
            this.log('INFO', 'File passed all security checks', { filename: originalFilename });
        } else if (results.verdict !== 'BLOCKED' && results.reasons.length > 0) {
            results.verdict = 'REVIEW';
            this.log('WARN', 'File flagged for review', { filename: originalFilename, reasons: results.reasons });
        }

        return results;
    }

    /**
     * Quarantine suspicious file
     */
    quarantineFile(filePath, originalFilename, reason) {
        try {
            const quarantineFileName = `${Date.now()}-${originalFilename}`;
            const quarantinePath = path.join(this.QUARANTINE_DIR, quarantineFileName);
            
            fs.copyFileSync(filePath, quarantinePath);
            fs.unlinkSync(filePath); // Remove original
            
            this.log('WARN', 'File quarantined', { 
                filename: originalFilename, 
                reason: reason,
                quarantinePath: quarantinePath 
            });

            return quarantinePath;
        } catch (err) {
            this.log('ERROR', 'Failed to quarantine file', { error: err.message, filename: originalFilename });
            return null;
        }
    }

    /**
     * Get security report
     */
    getSecurityReport() {
        try {
            const logContent = fs.readFileSync(this.LOG_FILE, 'utf8');
            const lines = logContent.split('\n').filter(l => l.trim());
            
            const blocked = lines.filter(l => l.includes('[BLOCKED]')).length;
            const warnings = lines.filter(l => l.includes('[WARN]')).length;
            const passed = lines.filter(l => l.includes('[INFO]')).length;

            return {
                timestamp: new Date().toISOString(),
                totalScans: lines.length,
                blocked: blocked,
                warnings: warnings,
                passed: passed,
                quarantineDir: this.QUARANTINE_DIR,
                logFile: this.LOG_FILE
            };
        } catch (err) {
            return { error: 'Could not generate report' };
        }
    }
}

module.exports = FileSecurityScanner;
