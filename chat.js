class ChatClient {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.currentConversation = 'general';
        this.conversations = new Map();
        this.typingTimeout = null;
        this.encryptionKey = null;
        this.groupKey = null;
        this.init();
    }

    init() {
        console.log('[Chat] Initializing ChatClient...');
        this.setupElements();
        this.setupEventListeners();
        this.showUsernameModal();
    }

    setupElements() {
        this.usernameModal = document.getElementById('username-modal');
        this.usernameInput = document.getElementById('username-input');
        this.joinBtn = document.getElementById('join-btn');
        
        this.messageInput = document.getElementById('message-input');
        this.sendBtn = document.getElementById('send-btn');
        this.attachmentBtn = document.getElementById('attachment-btn');
        
        this.messagesContainer = document.getElementById('messages-container');
        this.conversationsList = document.getElementById('conversations-list');
        this.usersList = document.getElementById('users-list');
        
        this.chatTitle = document.getElementById('chat-title');
        this.chatSubtitle = document.getElementById('chat-subtitle');
        this.headerAvatar = document.getElementById('header-avatar');
        this.typingIndicator = document.getElementById('typing-indicator');
        
        this.addChatBtn = document.getElementById('add-chat-btn');
        this.menuBtn = document.getElementById('menu-btn');
        this.infoBtnEl = document.getElementById('info-btn');
        this.usersSidebar = document.getElementById('users-sidebar');
        this.closeUsersBtn = document.getElementById('close-users-btn');
        this.searchInput = document.getElementById('search-input');

        // Conversations Modal Elements
        this.conversationsBtn = document.getElementById('conversations-btn');
        this.conversationsModal = document.getElementById('conversations-modal');
        this.closeConversationsBtn = document.getElementById('close-conversations-modal');
        this.conversationsBackdrop = document.getElementById('conversations-backdrop');

        console.log('[Chat] ✅ DOM elements initialized');
    }

    setupEventListeners() {
        this.joinBtn.addEventListener('click', () => this.joinChat());
        this.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinChat();
        });

        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.messageInput.addEventListener('input', () => this.emitTyping());
        this.messageInput.addEventListener('input', () => this.autoResizeInput());

        this.addChatBtn?.addEventListener('click', () => this.showNewChatDialog());
        this.menuBtn?.addEventListener('click', () => this.showMenu());
        this.infoBtnEl?.addEventListener('click', () => this.toggleUsersSidebar());
        this.closeUsersBtn?.addEventListener('click', () => this.hideUsersSidebar());
        this.searchInput?.addEventListener('input', (e) => this.filterConversations(e.target.value));
        this.attachmentBtn?.addEventListener('click', () => this.handleAttachment());

        // Conversations Modal Event Listeners
        this.conversationsBtn?.addEventListener('click', () => this.openConversationsModal());
        this.closeConversationsBtn?.addEventListener('click', () => this.closeConversationsModal());
        this.conversationsBackdrop?.addEventListener('click', () => this.closeConversationsModal());
    }

    openConversationsModal() {
        this.conversationsModal?.classList.add('active');
    }

    closeConversationsModal() {
        this.conversationsModal?.classList.remove('active');
    }

    showUsernameModal() {
        this.usernameInput.focus();
    }

    async joinChat() {
        const username = this.usernameInput.value.trim();
        if (!username) {
            alert('Please enter a username');
            return;
        }

        // Check if ChatEncryption is available
        if (typeof ChatEncryption === 'undefined') {
            alert('❌ Error: Encryption module not loaded. Please refresh the page.');
            return;
        }

        // Check if socket.io is available
        if (typeof io === 'undefined') {
            alert('❌ Error: Socket.IO not loaded. Please refresh the page.');
            return;
        }

        try {
            console.log('[Chat] 🔐 Starting join with encryption...');
            
            this.currentUser = {
                username,
                deviceId: this.generateDeviceId()
            };

            console.log('[Chat] 🔑 Generating encryption keys...');
            // Generate encryption key for this user session
            this.encryptionKey = ChatEncryption.generateEncryptionKey();
            console.log('[Chat] ✅ User encryption key generated');

            // Generate group key for conversations
            this.groupKey = await ChatEncryption.createGroupKey('general');
            if (!this.groupKey) {
                throw new Error('Unable to initialize chat encryption key. Use HTTPS or localhost.');
            }
            console.log('[Chat] ✅ Group encryption key generated');

            this.connectSocket();
            this.usernameModal.classList.add('hidden');
            console.log('[Chat] ✅ Join successful');
        } catch (err) {
            console.error('[Chat] ❌ Error during join:', err);
            alert(`❌ Error: ${err.message}`);
        }
    }

    connectSocket() {
        console.log('[Chat] 🔌 Connecting socket with encryption');
        console.log('[Chat] Server URL:', window.location.origin);
        
        try {
            this.socket = io(window.location.origin, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: 5
            });

            this.setupSocketListeners();
        } catch (err) {
            console.error('[Chat] ❌ Socket connection error:', err);
            alert(`❌ Failed to connect: ${err.message}`);
        }
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('[Chat] ✅ Connected to encrypted chat server, ID:', this.socket.id);
            console.log('[Chat] 📤 Sending user-join event with data:', this.currentUser);
            this.socket.emit('user-join', this.currentUser);
            this.addSystemMessage('🔒 Connected with end-to-end encryption');
        });

        this.socket.on('connect_error', (error) => {
            console.error('[Chat] ❌ Connection error:', error);
            this.addSystemMessage(`⚠️ Connection error: ${error.message}`);
        });

        this.socket.on('disconnect', () => {
            console.log('[Chat] 🔌 Disconnected from server');
            this.addSystemMessage('⚠️ Disconnected from server');
        });

        this.socket.on('user-joined', (data) => {
            this.addSystemMessage(`${data.user.username} joined (${data.totalUsers} online)`);
            this.addUserToList(data.user);
        });

        this.socket.on('message-received', async (message) => {
            console.log('[Chat] 📨 Message received (encrypted), decrypting...');
            await this.handleReceivedMessage(message);
        });

        this.socket.on('message-history', async (messages) => {
            console.log('[Chat] 📚 Loading message history:', messages.length, 'messages');
            for (const msg of messages) {
                await this.handleReceivedMessage(msg);
            }
            this.scrollToBottom();
        });

        this.socket.on('user-left', (data) => {
            this.addSystemMessage(`${data.username} left (${data.totalUsers} online)`);
            this.removeUserFromList(data.userId);
        });

        this.socket.on('chat-cleared', () => {
            this.messagesContainer.innerHTML = '';
            this.addSystemMessage('Chat history cleared');
        });
    }

    async sendMessage() {
        const text = this.messageInput.value.trim();
        if (!text) return;

        try {
            if (!this.groupKey) {
                this.groupKey = await ChatEncryption.createGroupKey(this.currentConversation || 'general');
                if (!this.groupKey) {
                    throw new Error('Encryption key is not ready');
                }
            }

            console.log('[Chat] 📝 Encrypting message...');
            const encryptedText = await ChatEncryption.encryptMessage(text, this.groupKey);
            console.log('[Chat] ✅ Message encrypted, sending...');

            const message = {
                text: encryptedText,
                conversationId: this.currentConversation,
                type: 'text',
                isEncrypted: true
            };

            this.socket.emit('send-message', message);
            this.messageInput.value = '';
            this.messageInput.style.height = 'auto';
            this.socket.emit('stop-typing', { conversationId: this.currentConversation });
        } catch (err) {
            console.error('[Chat] ❌ Error sending message:', err);
            this.addSystemMessage(`⚠️ Failed to send message: ${err.message}`);
        }
    }

    async handleReceivedMessage(message) {
        try {
            if (message.isEncrypted) {
                console.log('[Chat] 🔓 Decrypting received message...');
                message.text = await ChatEncryption.decryptMessage(message.text, this.groupKey);
                console.log('[Chat] ✅ Message decrypted');
            }
            this.displayMessage(message);
        } catch (err) {
            console.error('[Chat] ❌ Error decrypting message:', err);
            this.addSystemMessage(`⚠️ Failed to decrypt message: ${err.message}`);
        }
    }

    displayMessage(message) {
        const isOwn = message.sender.id === this.socket.id;
        const messageEl = document.createElement('div');
        messageEl.className = `message ${isOwn ? 'sent' : 'received'}`;
        messageEl.id = `msg_${message.id}`;

        const time = new Date(message.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        const avatar = message.sender.avatar || { color: '888888', initials: 'XX' };
        const avatarColor = avatar.color || '888888';
        const avatarInitials = avatar.initials || 'XX';

        messageEl.innerHTML = `
            <div class="message-wrapper">
                <div class="message-avatar" style="background: linear-gradient(135deg, #${avatarColor}, #${avatarColor}d0)">
                    ${avatarInitials}
                </div>
                <div class="message-content">
                    ${!isOwn ? `<div class="message-sender">${message.sender.username}</div>` : ''}
                    <div class="message-bubble">
                        ${this.escapeHtml(message.text)}
                    </div>
                    <div class="message-time">
                        ${time}
                        ${isOwn ? '<div class="read-receipt"></div>' : ''}
                    </div>
                </div>
            </div>
        `;

        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
    }

    addSystemMessage(text) {
        const messageEl = document.createElement('div');
        messageEl.style.cssText = `
            text-align: center;
            padding: 12px;
            color: var(--text-dim);
            font-size: 12px;
            font-style: italic;
        `;
        messageEl.textContent = text;
        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
    }

    addConversationToList(conversation) {
        if (this.conversations.has(conversation.id)) return;
        this.conversations.set(conversation.id, conversation);
        this.renderConversation(conversation);
    }

    renderConversation(conversation) {
        const convItem = document.createElement('div');
        convItem.className = 'conversation-item';
        convItem.id = `conv_${conversation.id}`;
        if (conversation.id === this.currentConversation) convItem.classList.add('active');

        const lastMsg = conversation.lastMessage;
        const preview = lastMsg ? lastMsg.text.substring(0, 30) : 'No messages';
        const time = lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        }) : '';

        convItem.innerHTML = `
            <div class="conversation-avatar">${conversation.name.substring(0, 2).toUpperCase()}</div>
            <div class="conversation-info">
                <div class="conversation-name">${conversation.name}</div>
                <div class="conversation-preview">${preview}</div>
            </div>
            <div class="conversation-time">${time}</div>
        `;

        convItem.addEventListener('click', () => this.switchConversation(conversation.id));

        const existingItem = document.getElementById(`conv_${conversation.id}`);
        if (existingItem) {
            existingItem.replaceWith(convItem);
        } else {
            this.conversationsList.appendChild(convItem);
        }
    }

    switchConversation(convId) {
        if (this.currentConversation) {
            const old = document.getElementById(`conv_${this.currentConversation}`);
            if (old) old.classList.remove('active');
            this.socket.emit('leave-conversation', this.currentConversation);
        }

        this.currentConversation = convId;
        const conv = this.conversations.get(convId);

        const item = document.getElementById(`conv_${convId}`);
        if (item) item.classList.add('active');

        this.chatTitle.textContent = conv?.name || 'General Chat';
        this.chatSubtitle.textContent = `${conv?.participants?.length || 0} members`;

        this.messagesContainer.innerHTML = '';
        this.socket.emit('join-conversation', convId);
    }

    addUserToList(user) {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.id = `user_${user.id}`;

        const avatar = user.avatar || { color: '888888', initials: 'XX' };
        const avatarColor = avatar.color || '888888';
        const avatarInitials = avatar.initials || 'XX';

        userItem.innerHTML = `
            <div class="conversation-avatar" style="width: 36px; height: 36px; font-size: 11px; background: linear-gradient(135deg, #${avatarColor}, #${avatarColor}d0)">
                ${avatarInitials}
            </div>
            <div class="conversation-info" style="flex: 1;">
                <div class="conversation-name">${user.username}</div>
                <div class="user-status ${user.status}">${user.status}</div>
            </div>
        `;

        const existing = document.getElementById(`user_${user.id}`);
        if (existing) {
            existing.replaceWith(userItem);
        } else {
            this.usersList.appendChild(userItem);
        }
    }

    removeUserFromList(userId) {
        const userItem = document.getElementById(`user_${userId}`);
        if (userItem) userItem.remove();
    }

    updateUserStatus(data) {
        const userItem = document.getElementById(`user_${data.userId}`);
        if (userItem) {
            const statusEl = userItem.querySelector('.user-status');
            if (statusEl) {
                statusEl.textContent = data.status;
                statusEl.className = `user-status ${data.status}`;
            }
        }
    }

    showTypingIndicator(data) {
        this.typingIndicator.style.display = 'flex';
    }

    hideTypingIndicator(data) {
        this.typingIndicator.style.display = 'none';
    }

    emitTyping() {
        this.socket.emit('typing', { conversationId: this.currentConversation });

        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.socket.emit('stop-typing', { conversationId: this.currentConversation });
        }, 1000);
    }

    autoResizeInput() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 100) + 'px';
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    toggleUsersSidebar() {
        this.usersSidebar.classList.toggle('show');
    }

    hideUsersSidebar() {
        this.usersSidebar.classList.remove('show');
    }

    showNewChatDialog() {
        const name = prompt('Enter conversation name:');
        if (name) {
            const convId = `conv_${Date.now()}`;
            const conversation = {
                id: convId,
                name,
                createdAt: new Date(),
                participants: [this.socket.id],
                lastMessage: null
            };
            this.addConversationToList(conversation);
            this.switchConversation(convId);
        }
    }

    showMenu() {
        const menu = confirm('Menu:\nPress OK for options or Cancel to dismiss');
        if (menu) {
            const action = prompt('Options:\n1. Change Status\n2. Clear Chat\n3. Exit');
            if (action === '1') {
                this.changeStatus();
            } else if (action === '2') {
                if (confirm('Clear chat history?')) {
                    fetch('/api/chat/clear', { method: 'DELETE' });
                }
            }
        }
    }

    changeStatus() {
        const status = prompt('Status:\n1. Online\n2. Away\n3. Busy');
        const statusMap = { '1': 'online', '2': 'away', '3': 'busy' };
        if (status && statusMap[status]) {
            this.socket.emit('status-update', statusMap[status]);
        }
    }

    filterConversations(query) {
        const items = document.querySelectorAll('.conversation-item');
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
        });
    }

    handleAttachment() {
        alert('File sharing coming soon!');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    generateDeviceId() {
        let deviceId = localStorage.getItem('deviceId');
        if (!deviceId) {
            deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('deviceId', deviceId);
        }
        return deviceId;
    }
}

// Initialize chat when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Chat] DOM loaded, initializing ChatClient');
    new ChatClient();
});
