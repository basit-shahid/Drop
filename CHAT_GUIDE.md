# Drop Chat - Complete Guide

Welcome to **Drop Chat**, the real-time messaging system integrated into the Drop file transfer platform! This guide covers all the features and how to use them across web and mobile clients.

## 🎯 Features

### Core Chat Features
- **Real-time Messaging**: Instant message delivery using WebSocket
- **WhatsApp-like UI**: Familiar interface similar to popular messaging apps
- **User Management**: See who's online, their status, and join time
- **Typing Indicators**: See when others are typing
- **Message History**: Access to previous conversations
- **Read Receipts**: Know when messages are read
- **Multiple Conversations**: Switch between different chat groups
- **User Status**: Online, Away, Busy status indicators
- **Avatar System**: Unique colored avatars for each user

## 🌐 Accessing Chat

### Web Client
1. **Start the Drop server**: `npm install` then start the Node.js server on port 5000
2. **Access the Upload Interface**: Open `http://localhost:5000` in your browser
3. **Click "💬 Open Chat"** button to enter the chat interface
4. **Enter your username** when prompted
5. **Start chatting!**

### Mobile (Expo/React Native)
1. **Run the Expo app**: `cd drop-expo && npm start`
2. **Switch to Chat Tab**: Tap the "💬 CHAT" tab at the top
3. **Connect to Server**: Use the IP address from the web interface (e.g., 192.168.1.5:5000)
4. **Enter your username** and join
5. **Start chatting on mobile!**

## 📱 Web Interface Guide

### Layout
The chat interface is divided into 4 main sections:

#### 1. **Sidebar (Left)**
- **Conversations List**: View all active conversations
- **Search**: Filter conversations by name
- **Add Chat**: Create new conversations
- **Menu**: Access additional options

#### 2. **Main Chat Area (Center)**
- **Chat Header**: Shows conversation name, member count, and quick actions
- **Messages Area**: All messages with sender info and timestamps
- **Input Area**: Type and send messages

#### 3. **User List (Right)**
- Click the "👥" icon in the header to toggle
- Shows all active users with their status
- See user avatars and online status

### Using the Web Chat

#### **Sending Messages**
1. Type your message in the input field at the bottom
2. Press `Enter` (or `Shift+Enter` for new line) to send
3. Or click the send button (📤)

#### **Switching Conversations**
1. Click any conversation in the left sidebar
2. The main chat area will show that conversation's messages
3. You can have multiple conversations

#### **Managing Your Status**
1. Click the Menu (≡) button in the sidebar header
2. Select "Change Status"
3. Choose: Online, Away, or Busy
4. Other users will see your status

#### **Creating New Conversations**
1. Click the "+" button in the sidebar header
2. Enter a conversation name
3. The conversation will be created and opened

#### **Viewing Active Users**
1. Click the "ℹ️" button in the chat header
2. The right sidebar will show all active users
3. Their status and join time is displayed

## 📲 Mobile Interface Guide

### Layout
The mobile interface includes:
- **Tab Bar**: Switch between Sync and Chat modes
- **Chat Header**: Conversation info and user list toggle
- **Messages**: Scrollable message history
- **Input Area**: Send messages
- **Leave Chat**: Exit the chat

### Using Mobile Chat

#### **Joining Chat**
1. Tap the "💬 CHAT" tab
2. Enter your username (max 20 characters)
3. Tap "Join Chat"
4. You're now connected!

#### **Sending Messages**
1. Type in the message input field
2. Tap the send button (📤)
3. Message appears immediately

#### **Viewing Active Users**
1. Tap the 👥 button in the header
2. Scroll through the list of active users
3. See their status and availability

#### **Typing Indicator**
- When someone types, you'll see "Someone is typing..." with an activity indicator
- The indicator disappears when they finish

#### **Leaving Chat**
1. Tap "Leave Chat" button
2. You'll be disconnected
3. Switch back to Sync or re-join

## 🔌 Server Architecture

### Chat Server (Node.js + Socket.io)

**File**: `chat-server.js`

**Key Features**:
- WebSocket communication via Socket.io
- In-memory message storage (last 500 messages)
- User session management
- Conversation tracking
- Typing indicators
- Read receipts

**Routes**:
- `GET /api/chat/users` - Get all active users
- `GET /api/chat/messages` - Get message history
- `GET /api/chat/conversations` - Get all conversations
- `DELETE /api/chat/clear` - Clear chat history

### Socket Events

#### Client → Server
- `user-join`: Join the chat with username
- `send-message`: Send a new message
- `message-read`: Mark message as read
- `typing`: Emit when user starts typing
- `stop-typing`: Emit when user stops typing
- `status-update`: Update user status
- `join-conversation`: Join a specific conversation
- `leave-conversation`: Leave a conversation

#### Server → Client
- `user-joined`: New user joined
- `message-received`: New message received
- `message-history`: Previous messages
- `user-typing`: Someone is typing
- `user-stop-typing`: Someone stopped typing
- `user-status-changed`: User status updated
- `user-left`: User disconnected
- `message-read-status`: Message was read
- `conversations-list`: All conversations

## 🎨 Design System

### Colors
- **Background**: `#050505` (Deep black)
- **Primary**: `#00f7ff` (Cyan neon)
- **Accent**: `#ff00ff` (Magenta neon)
- **Text**: `#ffffff` (White)
- **Dim Text**: `#a0a0a0` (Gray)

### Components
- **Message Bubbles**: Rounded with gradient borders
- **Avatars**: Circular with initials and unique colors
- **Inputs**: Glass morphism effect
- **Buttons**: Gradient backgrounds with hover effects

## ⚙️ Installation & Setup

### Prerequisites
- Node.js (v14+)
- npm or yarn
- Modern web browser
- Expo CLI (for mobile)

### Installation Steps

#### 1. **Install Server Dependencies**
```bash
cd d:/Drop
npm install
```

This installs:
- Express: Web framework
- Socket.io: Real-time communication
- CORS: Cross-origin support
- Other file transfer dependencies

#### 2. **Install Mobile Dependencies** (Optional)
```bash
cd d:/Drop/drop-expo
npm install
```

### Starting the Server

```bash
# From the Drop directory
npm start
# or for Electron app
npm start  # if configured in package.json
```

The server will start on `http://localhost:5000`

### Accessing Chat

**Web**: Open `http://localhost:5000` and click "💬 Open Chat"

**Mobile**: 
1. Get your PC's IP: Look at the QR code display
2. In Expo app: Connect to that IP
3. Switch to Chat tab

## 🔐 Security Notes

1. **Local Network**: Chat works on your local network
2. **No Authentication**: Currently uses username only (for LAN)
3. **No Encryption**: Messages stored in memory (not persistent)
4. **For Production**: Add auth, HTTPS, persistent storage, rate limiting

## 🐛 Troubleshooting

### Can't Connect to Server
- ✅ Check server is running (`npm start`)
- ✅ Verify correct IP address
- ✅ Check port 5000 is not blocked by firewall
- ✅ Use `localhost:5000` for same machine

### Messages Not Sending
- ✅ Check internet/network connection
- ✅ Verify socket connection (check browser console)
- ✅ Try refreshing the page
- ✅ Clear browser cache

### Typing Indicator Not Working
- ✅ Normal - appears only on other users' screens
- ✅ Timeout set to 1 second after you stop typing

### Mobile App Not Connecting
- ✅ Both devices on same WiFi network
- ✅ Use correct server IP (not localhost)
- ✅ Port number must be included (usually :5000)

## 📊 Performance Notes

- **In-Memory Storage**: Last 500 messages kept in memory
- **Real-time Delivery**: Sub-100ms latency on local network
- **Scalability**: Works for up to ~100 concurrent users on local network
- **Message Size**: Unlimited text messages

## 🚀 Future Enhancements

- [ ] Message persistence (database)
- [ ] Image/file sharing in chat
- [ ] Voice/video calls
- [ ] End-to-end encryption
- [ ] User authentication
- [ ] Message reactions/emojis
- [ ] Search message history
- [ ] User roles/permissions
- [ ] Dark/Light theme toggle
- [ ] Message editing/deletion

## 📝 File Structure

```
d:/Drop/
├── server.js              # Main server with file transfer
├── chat-server.js         # Chat WebSocket server
├── chat.html              # Web chat interface
├── chat.js                # Web chat client logic
├── chat-style.css         # Web chat styling
├── package.json           # Dependencies
└── drop-expo/
    ├── App.js             # Expo app with tabs
    ├── package.json       # Mobile dependencies
    └── components/
        └── ChatScreen.jsx # Mobile chat component
```

## 💡 Tips & Tricks

1. **Quick Status Change**: Use menu options to change status
2. **Multiple Conversations**: Keep different chat groups organized
3. **Mobile Friendly**: Works great on tablets and phones
4. **Night Mode**: Uses dark theme by default (great for eyes!)
5. **Network Resilience**: Auto-reconnects if connection drops

## 📞 Support

For issues or feature requests:
1. Check the troubleshooting section
2. Review console errors (F12 in browser)
3. Verify network connectivity
4. Check server logs for errors

---

**Happy Chatting!** 💬✨
