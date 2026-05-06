const http = require('http');
const socketIo = require('socket.io');

// In-memory storage for messages and users
const users = new Map();
const messages = [];
const conversations = new Map();

class ChatServer {
    constructor(expressApp, port = 5000) {
        this.app = expressApp;
        this.port = port;
        this.httpServer = http.createServer(expressApp);
        this.io = socketIo(this.httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        this.setupSocketHandlers();
        this.setupRoutes();
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`[Chat] User connected: ${socket.id}`);

            const relayToUser = (targetUserId, eventName, payload) => {
                if (!targetUserId) return;
                const targetSocket = this.io.sockets.sockets.get(targetUserId);
                if (targetSocket) {
                    targetSocket.emit(eventName, payload);
                }
            };

            // User joins chat
            socket.on('user-join', (data) => {
                const { username, deviceId } = data;
                users.set(socket.id, {
                    id: socket.id,
                    username: username || `User_${socket.id.substring(0, 5)}`,
                    deviceId,
                    status: 'online',
                    joinedAt: new Date(),
                    avatar: this.generateAvatar(username)
                });

                const userList = Array.from(users.values());
                
                // Broadcast user joined
                this.io.emit('user-joined', {
                    user: users.get(socket.id),
                    totalUsers: userList.length
                });

                // Send existing messages to new user
                socket.emit('message-history', messages.slice(-50)); // Last 50 messages

                // Send active conversations
                const convos = Array.from(conversations.values());
                socket.emit('conversations-list', convos);

                console.log(`[Chat] Total users: ${userList.length}`);
            });

            // Send message
            socket.on('send-message', (data) => {
                const sender = users.get(socket.id);
                if (!sender) return;

                const message = {
                    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    sender: sender,
                    text: data.text,
                    timestamp: new Date(),
                    conversationId: data.conversationId || 'general',
                    type: data.type || 'text', // text, image, file
                    isEncrypted: data.isEncrypted === true,
                    media: data.media || null,
                    read: false
                };

                messages.push(message);

                // Keep only last 500 messages in memory
                if (messages.length > 500) {
                    messages.shift();
                }

                // Update or create conversation
                const convId = data.conversationId || 'general';
                if (!conversations.has(convId)) {
                    conversations.set(convId, {
                        id: convId,
                        name: data.conversationName || 'General Chat',
                        createdAt: new Date(),
                        participants: [sender.id],
                        lastMessage: message
                    });
                } else {
                    const conv = conversations.get(convId);
                    conv.lastMessage = message;
                    if (!conv.participants.includes(sender.id)) {
                        conv.participants.push(sender.id);
                    }
                }

                // Broadcast message
                this.io.emit('message-received', message);

                const preview = message.isEncrypted
                    ? '[encrypted payload]'
                    : String(data.text || '').substring(0, 50);
                console.log(`[Chat] Message from ${sender.username}: ${preview}`);
            });

            // Mark message as read
            socket.on('message-read', (messageId) => {
                const message = messages.find(m => m.id === messageId);
                if (message) {
                    message.read = true;
                    this.io.emit('message-read-status', {
                        messageId,
                        userId: socket.id
                    });
                }
            });

            // User typing indicator
            socket.on('typing', (data) => {
                socket.broadcast.emit('user-typing', {
                    userId: socket.id,
                    username: users.get(socket.id)?.username,
                    conversationId: data.conversationId || 'general'
                });
            });

            // User stopped typing
            socket.on('stop-typing', (data) => {
                socket.broadcast.emit('user-stop-typing', {
                    userId: socket.id,
                    conversationId: data.conversationId || 'general'
                });
            });

            // Update user status
            socket.on('status-update', (status) => {
                const user = users.get(socket.id);
                if (user) {
                    user.status = status; // online, away, busy, offline
                    this.io.emit('user-status-changed', {
                        userId: socket.id,
                        username: user.username,
                        status
                    });
                }
            });

            // User disconnects
            socket.on('disconnect', () => {
                const user = users.get(socket.id);
                if (user) {
                    users.delete(socket.id);
                    this.io.emit('user-left', {
                        userId: socket.id,
                        username: user.username,
                        totalUsers: users.size
                    });
                    console.log(`[Chat] User disconnected: ${user.username} (${users.size} remaining)`);
                }
            });

            // Create or join a specific conversation
            socket.on('join-conversation', (convId) => {
                socket.join(`conv_${convId}`);
                const user = users.get(socket.id);
                if (user) {
                    this.io.to(`conv_${convId}`).emit('user-joined-conversation', {
                        userId: socket.id,
                        username: user.username,
                        conversationId: convId
                    });
                }
            });

            // Leave a conversation
            socket.on('leave-conversation', (convId) => {
                socket.leave(`conv_${convId}`);
            });

            // Create a conversation
            socket.on('create-conversation', (data) => {
                const user = users.get(socket.id);
                if (!user) return;

                const convId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const conversation = {
                    id: convId,
                    name: data.name || 'New Conversation',
                    createdAt: new Date(),
                    participants: [socket.id],
                    lastMessage: null
                };

                conversations.set(convId, conversation);
                this.io.emit('conversation-created', conversation);
                console.log(`[Chat] Conversation created: ${data.name}`);
            });

            // Load conversation history
            socket.on('load-conversation', (data) => {
                const convMessages = messages.filter(m => m.conversationId === data.conversationId);
                socket.emit('message-history', convMessages.slice(-50));
            });
        });
    }

    setupRoutes() {
        // Get all active users
        this.app.get('/api/chat/users', (req, res) => {
            const userList = Array.from(users.values()).map(u => ({
                id: u.id,
                username: u.username,
                status: u.status,
                avatar: u.avatar,
                joinedAt: u.joinedAt
            }));
            res.json(userList);
        });

        // Get message history
        this.app.get('/api/chat/messages', (req, res) => {
            res.json(messages.slice(-100)); // Last 100 messages
        });

        // Get conversations
        this.app.get('/api/chat/conversations', (req, res) => {
            const convos = Array.from(conversations.values());
            res.json(convos);
        });

        // Clear chat history
        this.app.delete('/api/chat/clear', (req, res) => {
            messages.length = 0;
            conversations.clear();
            this.io.emit('chat-cleared');
            res.json({ message: 'Chat history cleared' });
        });
    }

    generateAvatar(username) {
        const colors = ['FF6B6B', '4ECDC4', '45B7D1', 'FFA07A', '98D8C8', 'F7DC6F'];
        const hash = (username || 'User').split('').reduce((acc, char) => {
            return acc + char.charCodeAt(0);
        }, 0);
        const color = colors[hash % colors.length];
        const initials = (username || 'U').substring(0, 2).toUpperCase();
        
        return {
            initials,
            color
        };
    }

    start() {
        this.httpServer.on('error', (err) => {
            if (err && err.code === 'EADDRINUSE') {
                console.error(`[Chat Server] Port ${this.port} is already in use.`);
                return;
            }
            throw err;
        });

        this.httpServer.listen(this.port, () => {
            console.log(`[Chat Server] Running on port ${this.port}`);
        });
        return this.httpServer;
    }
}

module.exports = ChatServer;
