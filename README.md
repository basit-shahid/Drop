# 💧 Drop - Instant File Sync

**Drop** is a high-performance, neon-themed file synchronization ecosystem designed to bridge the gap between your PC and mobile devices. With a focus on speed, privacy, and minimalist aesthetics, Drop allows you to instantly transfer files across your local network or via remote tunnels.

## ✨ Features

- **🚀 Instant Transfers**: Send files between devices with zero lag.
- **📂 Smart Categorization**: Automatic sorting of incoming files into `Photos`, `Docs`, `Video`, `Music`, and `Other`.
- **📱 Multi-Platform Clients**:
  - **PC Server**: Electron-based desktop application for Windows.
  - **Mobile Apps**: Dedicated implementations for Expo (React Native) and Capacitor.
  - **Web Client**: Lightweight PWA for mobile browsers.
- **🔗 Seamless Connectivity**: Connect via Local IP or QR Code scanning.
- **🌐 Remote Access**: Integrated Cloudflare tunneling support for syncing when you're away from home.
- **🎨 Premium UI**: Sleek, glassmorphic design with neon cyan and magenta accents.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Multer.
- **Desktop**: Electron.
- **Frontend**: Vanilla HTML5, CSS3 (Glassmorphism), JavaScript.
- **Mobile**: Expo/React Native, Capacitor.
- **Tools**: Cloudflare Tunnel, QRcode, IP Utils.

## 🚀 Getting Started

### 🖥️ PC Server

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Start the Application**:
   ```bash
   npm start
   ```
3. **Build the Installer**:
   ```bash
   npm run build
   ```

### 📱 Mobile Clients

#### Expo App (`/drop-expo`)
1. Navigate to the directory: `cd drop-expo`
2. Install dependencies: `npm install`
3. Run the development server: `npx expo start`

#### Capacitor App (`/drop-client`)
1. Navigate to the directory: `cd drop-client`
2. Install dependencies: `npm install`
3. Run on Android: `npx cap run android`

## 📁 Project Structure

```text
├── drop-expo/       # Expo (React Native) mobile client
├── drop-client/     # Capacitor mobile client
├── main.js          # Electron entry point
├── server.js        # Express backend logic
├── index.html       # Desktop UI structure
├── style.css        # Neon design system
└── logo.png         # Project branding
```

## 🔒 Privacy & Security

Files are stored locally in your `Documents/AndroidFiles` directory. Session-based sharing ensures that your `FromPC` directory is cleared at the start of each session for maximum privacy.

---

*Made with ⚡ and Neon.*
