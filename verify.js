const fs = require('fs');
const path = require('path');
const http = require('http');

const filePath = path.join(__dirname, 'test-file.txt');
fs.writeFileSync(filePath, 'Hello from Android Simulator!');

const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
const deviceName = 'Pixel_7_Pro';

const data = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="file"; filename="test-file.txt"\r\n`,
    `Content-Type: text/plain\r\n\r\n`,
    `Hello from Android Simulator!\r\n`,
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
        } else {
            console.log('FAILURE: Status code', res.statusCode);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.write(data);
req.end();
