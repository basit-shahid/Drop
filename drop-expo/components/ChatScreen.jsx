import React, { useState, useEffect, useRef } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    TextInput,
    FlatList,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { io } from 'socket.io-client';

export default function ChatScreen({ serverUrl }) {
    const [socket, setSocket] = useState(null);
    const [username, setUsername] = useState('');
    const [isJoined, setIsJoined] = useState(false);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [users, setUsers] = useState([]);
    const [isTyping, setIsTyping] = useState(false);
    const [showUserList, setShowUserList] = useState(false);
    const typingTimeoutRef = useRef(null);
    const flatListRef = useRef(null);

    const colors = {
        bg: '#050505',
        bgSecondary: '#0f0f0f',
        text: '#ffffff',
        textDim: '#a0a0a0',
        cyan: '#00f7ff',
        magenta: '#ff00ff',
        glass: 'rgba(255, 255, 255, 0.03)',
        border: 'rgba(0, 247, 255, 0.2)',
    };

    useEffect(() => {
        if (!isJoined || !socket) return;

        socket.on('message-received', (message) => {
            setMessages(prev => [...prev, message]);
            flatListRef.current?.scrollToEnd({ animated: true });
        });

        socket.on('user-joined', (data) => {
            setUsers(prev => [...prev, data.user]);
            addSystemMessage(`${data.user.username} joined`);
        });

        socket.on('user-left', (data) => {
            setUsers(prev => prev.filter(u => u.id !== data.userId));
            addSystemMessage(`${data.username} left`);
        });

        socket.on('user-typing', (data) => {
            setIsTyping(true);
        });

        socket.on('user-stop-typing', () => {
            setIsTyping(false);
        });

        socket.on('message-history', (history) => {
            setMessages(history);
        });

        return () => {
            socket.off('message-received');
            socket.off('user-joined');
            socket.off('user-left');
            socket.off('user-typing');
            socket.off('user-stop-typing');
            socket.off('message-history');
        };
    }, [socket, isJoined]);

    const joinChat = () => {
        if (!username.trim()) {
            Alert.alert('Error', 'Please enter a username');
            return;
        }

        const newSocket = io(serverUrl, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
        });

        newSocket.on('connect', () => {
            newSocket.emit('user-join', {
                username: username.trim(),
                deviceId: `mobile_${Date.now()}`,
            });
            setIsJoined(true);
            addSystemMessage('You joined the chat');
        });

        newSocket.on('disconnect', () => {
            setIsJoined(false);
            addSystemMessage('Disconnected from server');
        });

        newSocket.on('connect_error', (error) => {
            Alert.alert('Connection Error', error.message);
        });

        setSocket(newSocket);
    };

    const sendMessage = () => {
        if (!inputText.trim() || !socket) return;

        socket.emit('send-message', {
            text: inputText.trim(),
            conversationId: 'general',
            type: 'text',
        });

        setInputText('');
        socket.emit('stop-typing', { conversationId: 'general' });
    };

    const handleTyping = (text) => {
        setInputText(text);

        if (socket && isJoined) {
            socket.emit('typing', { conversationId: 'general' });

            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
                socket.emit('stop-typing', { conversationId: 'general' });
            }, 1000);
        }
    };

    const addSystemMessage = (text) => {
        setMessages(prev => [...prev, {
            id: `sys_${Date.now()}`,
            text,
            isSystem: true,
            timestamp: new Date(),
        }]);
    };

    const leaveChat = () => {
        if (socket) {
            socket.disconnect();
        }
        setIsJoined(false);
        setMessages([]);
        setUsers([]);
        setUsername('');
    };

    const renderMessage = ({ item }) => {
        if (item.isSystem) {
            return (
                <View style={styles.systemMessageContainer}>
                    <Text style={styles.systemMessage}>{item.text}</Text>
                </View>
            );
        }

        const isOwn = item.sender?.id === socket?.id;
        const bgColor = isOwn ? colors.cyan : colors.magenta;
        const textColor = isOwn ? '#000' : colors.text;

        return (
            <View style={[styles.messageContainer, isOwn && styles.ownMessage]}>
                <View style={[
                    styles.messageBubble,
                    {
                        backgroundColor: isOwn
                            ? `rgba(0, 247, 255, 0.2)`
                            : `rgba(255, 0, 255, 0.1)`,
                        borderColor: isOwn ? 'rgba(0, 247, 255, 0.3)' : 'rgba(255, 0, 255, 0.3)',
                    },
                ]}>
                    {!isOwn && (
                        <Text style={styles.senderName}>
                            {item.sender?.username || 'Unknown'}
                        </Text>
                    )}
                    <Text style={styles.messageText}>{item.text}</Text>
                    <Text style={styles.messageTime}>
                        {new Date(item.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </Text>
                </View>
            </View>
        );
    };

    const renderUserItem = ({ item }) => (
        <View style={styles.userItem}>
            <View style={[
                styles.userAvatar,
                { backgroundColor: `#${item.avatar?.color || '00f7ff'}` },
            ]}>
                <Text style={styles.userInitials}>{item.avatar?.initials || 'U'}</Text>
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.username}</Text>
                <Text style={[styles.userStatus, { color: item.status === 'online' ? '#00ff00' : '#ffaa00' }]}>
                    {item.status}
                </Text>
            </View>
        </View>
    );

    if (!isJoined) {
        return (
            <LinearGradient colors={['#050505', '#0f0f0f']} style={styles.container}>
                <View style={styles.joinContainer}>
                    <Text style={styles.title}>💬 Drop Chat</Text>
                    <Text style={styles.subtitle}>Join the conversation</Text>

                    <TextInput
                        style={styles.usernameInput}
                        placeholder="Enter your username"
                        placeholderTextColor={colors.textDim}
                        value={username}
                        onChangeText={setUsername}
                        maxLength={20}
                    />

                    <TouchableOpacity
                        style={styles.joinButton}
                        onPress={joinChat}
                    >
                        <LinearGradient
                            colors={[colors.cyan, colors.magenta]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.gradientButton}
                        >
                            <Text style={styles.joinButtonText}>Join Chat</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={['#050505', '#0f0f0f']} style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardAvoid}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <View style={styles.headerAvatar}>
                            <Text style={styles.headerInitials}>
                                {username.substring(0, 2).toUpperCase()}
                            </Text>
                        </View>
                        <View>
                            <Text style={styles.headerTitle}>General Chat</Text>
                            <Text style={styles.headerSubtitle}>{users.length} members</Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        onPress={() => setShowUserList(!showUserList)}
                        style={styles.headerButton}
                    >
                        <Text style={styles.headerButtonText}>👥</Text>
                    </TouchableOpacity>
                </View>

                {/* Messages or Users List */}
                {showUserList ? (
                    <FlatList
                        data={users}
                        renderItem={renderUserItem}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                    />
                ) : (
                    <>
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            renderItem={renderMessage}
                            keyExtractor={(item) => item.id || `${Math.random()}`}
                            contentContainerStyle={styles.listContent}
                            onEndReachedThreshold={0.3}
                        />

                        {isTyping && (
                            <View style={styles.typingContainer}>
                                <ActivityIndicator color={colors.cyan} />
                                <Text style={styles.typingText}>Someone is typing...</Text>
                            </View>
                        )}
                    </>
                )}

                {/* Input Area */}
                <View style={styles.inputArea}>
                    <TextInput
                        style={styles.messageInput}
                        placeholder="Type a message..."
                        placeholderTextColor={colors.textDim}
                        value={inputText}
                        onChangeText={handleTyping}
                        multiline
                        maxHeight={100}
                    />
                    <TouchableOpacity
                        onPress={sendMessage}
                        style={styles.sendButton}
                        disabled={!inputText.trim()}
                    >
                        <Text style={styles.sendButtonText}>📤</Text>
                    </TouchableOpacity>
                </View>

                {/* Leave Button */}
                <TouchableOpacity
                    onPress={leaveChat}
                    style={styles.leaveButton}
                >
                    <Text style={styles.leaveButtonText}>Leave Chat</Text>
                </TouchableOpacity>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#050505',
    },
    keyboardAvoid: {
        flex: 1,
    },
    joinContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        color: '#00f7ff',
        marginBottom: 8,
        textShadowColor: 'rgba(0, 247, 255, 0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    subtitle: {
        fontSize: 16,
        color: '#a0a0a0',
        marginBottom: 24,
    },
    usernameInput: {
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderWidth: 1,
        borderColor: 'rgba(0, 247, 255, 0.2)',
        borderRadius: 12,
        padding: 12,
        color: '#ffffff',
        marginBottom: 16,
        fontSize: 14,
    },
    joinButton: {
        width: '100%',
        borderRadius: 12,
        overflow: 'hidden',
    },
    gradientButton: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    joinButtonText: {
        color: '#050505',
        fontSize: 16,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 247, 255, 0.2)',
        backgroundColor: 'rgba(15, 15, 15, 0.6)',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    headerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#00f7ff',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerInitials: {
        fontSize: 12,
        fontWeight: '600',
        color: '#050505',
    },
    headerTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#a0a0a0',
    },
    headerButton: {
        padding: 8,
    },
    headerButtonText: {
        fontSize: 20,
    },
    listContent: {
        flexGrow: 1,
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    systemMessageContainer: {
        alignItems: 'center',
        marginVertical: 12,
    },
    systemMessage: {
        color: '#a0a0a0',
        fontSize: 12,
        fontStyle: 'italic',
    },
    messageContainer: {
        marginBottom: 8,
        flexDirection: 'row',
        justifyContent: 'flex-start',
    },
    ownMessage: {
        justifyContent: 'flex-end',
    },
    messageBubble: {
        maxWidth: '75%',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 18,
        borderWidth: 1,
    },
    senderName: {
        fontSize: 12,
        fontWeight: '600',
        color: '#00f7ff',
        marginBottom: 4,
    },
    messageText: {
        color: '#ffffff',
        fontSize: 14,
    },
    messageTime: {
        fontSize: 11,
        color: '#a0a0a0',
        marginTop: 4,
    },
    typingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    typingText: {
        marginLeft: 8,
        color: '#a0a0a0',
        fontSize: 12,
    },
    inputArea: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0, 247, 255, 0.2)',
        backgroundColor: 'rgba(15, 15, 15, 0.6)',
        gap: 8,
    },
    messageInput: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderWidth: 1,
        borderColor: 'rgba(0, 247, 255, 0.2)',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        color: '#ffffff',
        fontSize: 14,
        maxHeight: 100,
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#00f7ff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonText: {
        fontSize: 20,
    },
    leaveButton: {
        marginHorizontal: 12,
        marginBottom: 12,
        backgroundColor: 'rgba(255, 0, 0, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(255, 0, 0, 0.3)',
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    leaveButtonText: {
        color: '#ff6b6b',
        fontWeight: '600',
        fontSize: 14,
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 247, 255, 0.1)',
    },
    userAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    userInitials: {
        fontSize: 11,
        fontWeight: '600',
        color: '#050505',
    },
    userName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
    userStatus: {
        fontSize: 11,
    },
});
