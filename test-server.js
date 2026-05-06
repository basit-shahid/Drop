
const { setupServer } = require('./server');
console.log('Starting standalone backend for verification...');
setupServer(null); // No Electron window
