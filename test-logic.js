const { setupServer } = require('./server');
const http = require('http');

console.log('Starting test server...');
const server = setupServer(null); // No mainWindow for testing

// Wait for server to start
setTimeout(() => {
    console.log('Sending test file...');
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const deviceName = 'Test_Device_123';

    const data = [
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="file"; filename="test-file.txt"\r\n`,
        `Content-Type: text/plain\r\n\r\n`,
        `Hello from the test script!\r\n`,
        `--${boundary}--\r\n`
    ].join('');

    const options = {
        hostname: 'localhost',
        port: 5000,
        path: '/upload',
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'device-name': deviceName
        }
    };

    const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
            console.log('Response:', responseData);
            if (res.statusCode === 200) {
                console.log('SUCCESS: File uploaded correctly.');
                // Verify file exists
                const path = require('path');
                const fs = require('fs');
                const deviceDir = path.join(process.env.USERPROFILE, 'Documents', 'AndroidFiles', 'Test_Device_123');
                console.log('Checking directory:', deviceDir);
                if (fs.existsSync(deviceDir)) {
                    const files = fs.readdirSync(deviceDir);
                    console.log('Files in directory:', files);
                    if (files.some(f => f.includes('test-file.txt'))) {
                        console.log('VERIFICATION PASSED: File found in device folder.');
                    } else {
                        console.log('VERIFICATION FAILED: File not found.');
                    }
                } else {
                    console.log('VERIFICATION FAILED: Device directory not created.');
                }
            } else {
                console.log('FAILURE: Status code', res.statusCode);
            }
            process.exit(0);
        });
    });

    req.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
        process.exit(1);
    });

    req.write(data);
    req.end();
}, 2000);
