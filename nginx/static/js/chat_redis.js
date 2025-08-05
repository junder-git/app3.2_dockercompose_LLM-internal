// Chat Redis Module - Handles all Redis data operations
class ChatRedis {
    constructor() {
        this.baseUrl = '';
        console.log('Chat Redis module initialized');
    }
    
    // Chat Management
    async createNewChat() {
        try {
            const response = await fetch('/api/chat/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to create chat: ${response.status}`);
            }
            
            const data = await response.json();
            return {
                success: true,
                chat_id: data.chat_id,
                created_at: data.created_at
            };
        } catch (error) {
            console.error('Redis: Failed to create new chat:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async getChatList() {
        try {
            const response = await fetch('/api/chat/list');
            if (!response.ok) {
                throw new Error(`Failed to get chat list: ${response.status}`);
            }
            
            const data = await response.json();
            return {
                success: true,
                chats: data.chats || []
            };
        } catch (error) {
            console.error('Redis: Failed to load chat list:', error);
            return {
                success: false,
                error: error.message,
                chats: []
            };
        }
    }
    
    async getChatHistory(chatId) {
        if (!chatId) {
            return {
                success: false,
                error: 'Missing chat_id',
                messages: []
            };
        }
        
        try {
            const response = await fetch(`/api/chat/history?chat_id=${encodeURIComponent(chatId)}`);
            if (!response.ok) {
                throw new Error(`Failed to load chat history: ${response.status}`);
            }
            
            const data = await response.json();
            return {
                success: true,
                messages: data.messages || [],
                chat_id: data.chat_id
            };
        } catch (error) {
            console.error('Redis: Failed to load chat messages:', error);
            return {
                success: false,
                error: error.message,
                messages: []
            };
        }
    }
    
    async deleteChat(chatId) {
        if (!chatId) return { success: false, error: 'Missing chat_id' };
        
        try {
            const response = await fetch('/api/chat/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ chat_id: chatId })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to delete chat: ${response.status}`);
            }
            
            const data = await response.json();
            return {
                success: true,
                deleted_count: data.deleted_count
            };
        } catch (error) {
            console.error('Redis: Failed to delete chat:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async clearChat(chatId) {
        if (!chatId) return { success: false, error: 'Missing chat_id' };
        
        try {
            const response = await fetch('/api/chat/clear', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ chat_id: chatId })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to clear chat: ${response.status}`);
            }
            
            return { success: true };
        } catch (error) {
            console.error('Redis: Failed to clear chat:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async deleteAllChats() {
        try {
            const response = await fetch('/api/chat/delete-all', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to delete all chats: ${response.status}`);
            }
            
            const data = await response.json();
            return {
                success: true,
                deleted_count: data.deleted_count
            };
        } catch (error) {
            console.error('Redis: Failed to delete all chats:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Artifact Management
    async getChatArtifacts(chatId) {
        if (!chatId) return { success: false, error: 'Missing chat_id', artifacts: [] };
        
        try {
            const response = await fetch(`/api/chat/artifacts?chat_id=${encodeURIComponent(chatId)}`);
            if (!response.ok) {
                throw new Error(`Failed to get artifacts: ${response.status}`);
            }
            
            const data = await response.json();
            return {
                success: true,
                artifacts: data.artifacts || []
            };
        } catch (error) {
            console.error('Redis: Failed to fetch artifacts:', error);
            return {
                success: false,
                error: error.message,
                artifacts: []
            };
        }
    }
    
    async getMessageDetails(chatId, messageId) {
        if (!chatId || !messageId) {
            return {
                success: false,
                error: 'Missing chat_id or message_id'
            };
        }
        
        try {
            const response = await fetch(`/api/message/details?chat_id=${encodeURIComponent(chatId)}&message_id=${encodeURIComponent(messageId)}`);
            if (!response.ok) {
                if (response.status === 404) {
                    return {
                        success: false,
                        error: 'Message not found'
                    };
                }
                throw new Error(`Failed to get message details: ${response.status}`);
            }
            
            const data = await response.json();
            return {
                success: true,
                message: data.message,
                artifacts: data.artifacts || []
            };
        } catch (error) {
            console.error('Redis: Failed to fetch message details:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Utility methods
    isValidChatId(chatId) {
        return chatId && /^chat\(\d+\)$/.test(chatId);
    }
    
    extractChatTimestamp(chatId) {
        const match = chatId.match(/^chat\((\d+)\)$/);
        return match ? parseInt(match[1]) : null;
    }
    
    generateTitleFromPreview(preview) {
        if (!preview || preview.trim() === '') {
            return 'New Chat';
        }
        return preview.length > 30 ? preview.substring(0, 30) + '...' : preview;
    }
    
    // Error handling
    handleApiError(error, operation) {
        console.error(`Redis: ${operation} failed:`, error);
        return {
            success: false,
            error: error.message || 'Unknown error occurred'
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatRedis;
} else if (typeof window !== 'undefined') {
    window.ChatRedis = ChatRedis;
}