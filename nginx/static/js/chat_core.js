// Core chat functionality - Redis Backend
class InternalChat {
    constructor() {
        this.isTyping = false;
        this.abortController = null;
        this.currentChatId = null;
        this.chats = new Map();
        this.chatOptionsModal = null;
        this.selectedChatForOptions = null;
        
        // Initialize subsystems
        this.artifacts = new ChatArtifacts();
        this.fileUpload = new ChatFileUpload(this);
        this.ui = new ChatUI(this);
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupMarkdown();
        this.setupSidebar();
        this.loadChatList();
        this.createNewChat(); // Start with a new chat
        console.log('Multi-chat internal chat initialized (Redis backend)');
    }
    
    setupMarkdown() {
        if (window.marked) {
            marked.setOptions({
                breaks: true,
                gfm: true,
                headerIds: false,
                sanitize: false
            });
        }
    }
    
    setupEventListeners() {
        // Form submission
        const chatForm = document.getElementById('chat-form');
        if (chatForm) {
            chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendMessage();
            });
        }
        
        // Input handling
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.addEventListener('input', () => {
                this.ui.updateCharCount();
                this.ui.autoResizeTextarea();
            });
            
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (chatInput.value.trim() || this.fileUpload.attachedFiles.length > 0) {
                        this.sendMessage();
                    }
                }
            });
        }
        
        // Stop button
        const stopButton = document.getElementById('stop-button');
        if (stopButton) {
            stopButton.addEventListener('click', () => this.stopGeneration());
        }
        
        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebar-toggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => this.ui.toggleSidebar());
        }
        
        // Chat search
        const chatSearch = document.getElementById('chat-search');
        if (chatSearch) {
            chatSearch.addEventListener('input', (e) => this.searchChats(e.target.value));
        }
        
        // Initialize chat options modal
        this.chatOptionsModal = new bootstrap.Modal(document.getElementById('chatOptionsModal'));
    }
    
    setupSidebar() {
        // Handle sidebar interactions
        this.ui.setupSidebarResize();
    }
    
    // Chat Management Methods
    generateChatId() {
        return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    createNewChat() {
        const chatId = this.generateChatId();
        const chat = {
            id: chatId,
            title: 'New Chat',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        this.chats.set(chatId, chat);
        this.switchToChat(chatId);
        this.loadChatList(); // Reload from Redis to get updated list
        
        return chatId;
    }
    
    switchToChat(chatId) {
        if (!chatId) {
            console.error('Invalid chat ID');
            return;
        }
        
        this.currentChatId = chatId;
        
        // Set artifact system chat ID
        this.artifacts.setChatId(chatId);
        
        // Load chat messages from Redis
        this.loadChatMessages(chatId);
        this.ui.updateChatListActiveState();
        
        // Clear any attached files when switching chats
        this.fileUpload.clearAllFiles();
    }
    
    async loadChatMessages(chatId) {
        const messagesContainer = document.getElementById('messages-content');
        const welcomePrompt = document.getElementById('welcome-prompt');
        
        if (!messagesContainer) return;
        
        // Clear current messages
        messagesContainer.innerHTML = '';
        
        try {
            const response = await fetch(`/api/chat/history?chat_id=${chatId}`);
            if (!response.ok) {
                throw new Error('Failed to load chat history');
            }
            
            const data = await response.json();
            const messages = data.messages || [];
            
            if (messages.length === 0) {
                // Show welcome prompt for empty chats
                if (welcomePrompt) {
                    welcomePrompt.style.display = 'block';
                }
                
                // Update chat title
                this.ui.updateCurrentChatTitle('New Chat');
            } else {
                // Hide welcome prompt and load messages
                if (welcomePrompt) {
                    welcomePrompt.style.display = 'none';
                }
                
                // Update chat title from first user message if available
                const firstUserMessage = messages.find(msg => msg.role === 'user');
                if (firstUserMessage) {
                    const title = firstUserMessage.content.length > 30 ? 
                        firstUserMessage.content.substring(0, 30) + '...' : 
                        firstUserMessage.content;
                    this.ui.updateCurrentChatTitle(title);
                }
                
                // Load messages and process with artifacts
                for (const msg of messages) {
                    const messageElement = this.addMessageFromRedis(msg);
                    
                    // Process with artifacts system using the Redis-provided ID
                    if (messageElement && msg.id) {
                        const messageType = msg.role === 'user' ? 'in' : 'out';
                        this.artifacts.processMessageElement(
                            messageElement, 
                            messageType, 
                            msg.content, 
                            msg.files || [], 
                            msg.id
                        );
                    }
                }
                
                this.ui.scrollToBottom();
            }
        } catch (error) {
            console.error('Failed to load chat messages:', error);
            if (welcomePrompt) {
                welcomePrompt.style.display = 'block';
            }
            this.ui.updateCurrentChatTitle('Error Loading Chat');
        }
    }
    
    async deleteChat(chatId) {
        if (!chatId) return;
        
        try {
            const response = await fetch('/api/chat/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ chat_id: chatId })
            });
            
            if (response.ok) {
                // Remove from local cache
                this.chats.delete(chatId);
                
                // If deleting current chat, switch to another or create new
                if (this.currentChatId === chatId) {
                    await this.loadChatList();
                    const remainingChats = Array.from(this.chats.keys());
                    if (remainingChats.length > 0) {
                        this.switchToChat(remainingChats[0]);
                    } else {
                        this.createNewChat();
                    }
                } else {
                    await this.loadChatList();
                }
            }
        } catch (error) {
            console.error('Failed to delete chat:', error);
        }
    }
    
    async renameChat(chatId, newTitle) {
        // For now, just update local cache - you might want to add a Redis endpoint for this
        const chat = this.chats.get(chatId);
        if (chat) {
            chat.title = newTitle;
            chat.updatedAt = new Date();
            
            if (chatId === this.currentChatId) {
                this.ui.updateCurrentChatTitle(newTitle);
            }
            
            this.ui.updateChatList();
        }
    }
    
    async duplicateChat(chatId) {
        // This would require a new Redis endpoint to duplicate a chat
        // For now, just create a new chat
        return this.createNewChat();
    }
    
    searchChats(query) {
        const chatItems = document.querySelectorAll('.chat-item');
        const lowerQuery = query.toLowerCase();
        
        chatItems.forEach(item => {
            const title = item.querySelector('.chat-item-title').textContent.toLowerCase();
            const preview = item.querySelector('.chat-item-preview').textContent.toLowerCase();
            
            if (title.includes(lowerQuery) || preview.includes(lowerQuery)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }
    
    // Chat Options Methods
    showChatOptions(chatId) {
        this.selectedChatForOptions = chatId;
        const chat = this.chats.get(chatId);
        
        if (!chat) return;
        
        // Set current title in rename input
        const renameInput = document.getElementById('rename-chat-input');
        if (renameInput) {
            renameInput.value = chat.title;
        }
        
        this.chatOptionsModal.show();
    }
    
    // Load chat list from Redis
    async loadChatList() {
        try {
            const response = await fetch('/api/chat/list');
            if (response.ok) {
                const data = await response.json();
                const chats = data.chats || [];
                
                // Update local cache
                this.chats.clear();
                chats.forEach(chatInfo => {
                    const chat = {
                        id: chatInfo.id,
                        title: this.generateTitleFromPreview(chatInfo.preview),
                        messages: [], // Will be loaded when needed
                        createdAt: new Date(),
                        updatedAt: new Date(chatInfo.last_updated * 1000),
                        messageCount: chatInfo.message_count,
                        preview: chatInfo.preview
                    };
                    this.chats.set(chatInfo.id, chat);
                });
                
                this.ui.updateChatList();
            }
        } catch (error) {
            console.error('Failed to load chat list:', error);
        }
    }
    
    generateTitleFromPreview(preview) {
        if (!preview || preview.trim() === '') {
            return 'New Chat';
        }
        return preview.length > 30 ? preview.substring(0, 30) + '...' : preview;
    }
    
    // Message handling methods
    addMessageFromRedis(messageData) {
        const messagesContainer = document.getElementById('messages-content');
        if (!messagesContainer) return null;
        
        const sender = messageData.role === 'user' ? 'user' : 'ai';
        const content = messageData.content || '';
        const files = messageData.files || [];
        
        return this.createMessageElement(sender, content, files, false);
    }
    
    addMessage(sender, content, isStreaming = false, files = []) {
        return this.createMessageElement(sender, content, files, isStreaming);
    }
    
    createMessageElement(sender, content, files = [], isStreaming = false) {
        const messagesContainer = document.getElementById('messages-content');
        if (!messagesContainer) return null;
        
        // Hide welcome prompt
        const welcomePrompt = document.getElementById('welcome-prompt');
        if (welcomePrompt && sender === 'user') {
            welcomePrompt.style.display = 'none';
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${sender}`;
        
        // Header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';
        
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'message-avatar';
        
        const labelSpan = document.createElement('span');
        
        if (sender === 'user') {
            avatarDiv.innerHTML = '<i class="bi bi-person-circle"></i>';
            labelSpan.textContent = 'You';
        } else {
            avatarDiv.innerHTML = '<i class="bi bi-robot"></i>';
            labelSpan.textContent = 'AI Assistant';
        }
        
        headerDiv.appendChild(avatarDiv);
        headerDiv.appendChild(labelSpan);
        
        // Files (for user messages)
        if (files && files.length > 0) {
            const filesDiv = document.createElement('div');
            filesDiv.className = 'message-files';
            
            files.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'message-file-item';
                
                const icon = this.fileUpload.getFileIcon(file.type);
                const size = this.fileUpload.formatFileSize(file.size);
                
                fileItem.innerHTML = `
                    <i class="bi ${icon}"></i>
                    <span>${file.name}</span>
                    <small>(${size})</small>
                `;
                
                filesDiv.appendChild(fileItem);
            });
            
            messageDiv.appendChild(headerDiv);
            messageDiv.appendChild(filesDiv);
        } else {
            messageDiv.appendChild(headerDiv);
        }
        
        // Content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (sender === 'user') {
            contentDiv.innerHTML = window.marked ? marked.parse(content) : content;
        } else if (isStreaming) {
            const streamDiv = document.createElement('div');
            streamDiv.className = 'streaming-content';
            contentDiv.appendChild(streamDiv);
        } else {
            contentDiv.innerHTML = window.marked ? marked.parse(content) : content;
            this.ui.enhanceCodeBlocks(contentDiv, content);
        }
        
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        
        this.ui.scrollToBottom();
        return messageDiv;
    }
    
    async sendMessage() {
        const input = document.getElementById('chat-input');
        if (!input) return;
        
        const message = input.value.trim();
        if (!message && this.fileUpload.attachedFiles.length === 0) return;
        if (this.isTyping) return;
        
        // Ensure we have a current chat
        if (!this.currentChatId) {
            this.createNewChat();
        }
        
        let messageContent = message;
        const filesToSend = [...this.fileUpload.attachedFiles];
        
        if (filesToSend.length > 0) {
            const fileInfo = filesToSend.map(file => 
                `📎 ${file.name} (${this.fileUpload.formatFileSize(file.size)})`
            ).join('\n');
            
            if (messageContent) {
                messageContent = `${messageContent}\n\n${fileInfo}`;
            } else {
                messageContent = fileInfo;
            }
        }
        
        // Add user message with files (this will be stored in Redis by the stream endpoint)
        this.addMessage('user', messageContent, false, filesToSend);
        
        // Clear input and files
        input.value = '';
        this.fileUpload.clearAllFiles();
        this.ui.updateCharCount();
        this.ui.autoResizeTextarea();
        
        // Set typing state
        this.isTyping = true;
        this.ui.updateButtons(true);
        this.abortController = new AbortController();
        
        // Add AI message container
        const aiMessage = this.addMessage('ai', '', true);
        
        try {
            await this.streamResponse(message, aiMessage, filesToSend);
        } catch (error) {
            console.error('Chat error:', error);
            this.handleError(error, aiMessage);
        }
    }
    
    async streamResponse(message, aiMessage, files = []) {
        const requestBody = {
            message: message,
            files: [],
            chatId: this.currentChatId
        };
        
        if (files && files.length > 0) {
            for (const file of files) {
                try {
                    const fileData = {
                        name: file.name,
                        type: file.type,
                        size: file.size
                    };
                    
                    if (this.fileUpload.isTextFile(file)) {
                        const content = await this.fileUpload.readFileAsText(file);
                        fileData.content = content;
                    }
                    
                    requestBody.files.push(fileData);
                } catch (error) {
                    console.error('Error processing file:', file.name, error);
                }
            }
        }
        
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify(requestBody),
            signal: this.abortController.signal
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    
                    if (data === '[DONE]') {
                        this.finishStreaming(aiMessage, accumulated);
                        return;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            accumulated += parsed.content;
                            this.updateStreamingContent(aiMessage, accumulated);
                        }
                    } catch (e) {
                        // Ignore malformed JSON
                    }
                }
            }
        }
        
        this.finishStreaming(aiMessage, accumulated);
    }
    
    updateStreamingContent(messageElement, content) {
        const contentDiv = messageElement.querySelector('.streaming-content');
        if (contentDiv) {
            contentDiv.innerHTML = (window.marked ? marked.parse(content) : content) + 
                '<span class="cursor blink">▋</span>';
            this.ui.scrollToBottom();
        }
    }
    
    finishStreaming(messageElement, finalContent) {
        const contentDiv = messageElement.querySelector('.message-content');
        if (contentDiv) {
            contentDiv.innerHTML = '';
            
            const contentWrapper = document.createElement('div');
            contentWrapper.innerHTML = window.marked ? marked.parse(finalContent) : finalContent;
            contentDiv.appendChild(contentWrapper);
            
            this.ui.enhanceCodeBlocks(contentDiv, finalContent);
            
            // Messages and artifacts are already saved in Redis by the stream endpoint
            // Reload chat list to update message counts and timestamps
            this.loadChatList();
        }
        
        this.isTyping = false;
        this.ui.updateButtons(false);
        this.abortController = null;
        this.ui.scrollToBottom();
    }
    
    handleError(error, aiMessage) {
        console.error('Stream error:', error);
        
        const contentDiv = aiMessage.querySelector('.message-content');
        if (contentDiv) {
            let errorMessage = 'Sorry, there was an error processing your request.';
            
            if (error.name === 'AbortError') {
                errorMessage = 'Response generation was stopped.';
            } else if (error.message.includes('fetch')) {
                errorMessage = 'Connection error. Please check if the AI service is running.';
            }
            
            contentDiv.innerHTML = `<div class="text-danger"><i class="bi bi-exclamation-triangle"></i> ${errorMessage}</div>`;
        }
        
        this.isTyping = false;
        this.ui.updateButtons(false);
        this.abortController = null;
    }
    
    stopGeneration() {
        if (this.abortController) {
            this.abortController.abort();
            this.isTyping = false;
            this.ui.updateButtons(false);
            this.abortController = null;
        }
    }
    
    // Artifact management methods (Redis-based)
    async clearCurrentChatArtifacts() {
        if (this.artifacts && this.currentChatId) {
            return await this.artifacts.clearArtifacts();
        }
        return false;
    }
    
    async exportChatArtifacts() {
        if (this.artifacts) {
            const exportData = await this.artifacts.exportArtifacts();
            const blob = new Blob([exportData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat_artifacts_${this.currentChatId}_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }
    
    async getArtifactReference(artifactId) {
        if (this.artifacts) {
            return await this.artifacts.getArtifact(artifactId);
        }
        return null;
    }
    
    async searchArtifacts(query, type = null) {
        if (this.artifacts) {
            return await this.artifacts.searchArtifacts(query, type);
        }
        return [];
    }
}