// Chat Core Module - Thin orchestrator that delegates to specialized modules
class InternalChat {
    constructor() {
        // State - minimal, just coordination
        this.currentChatId = null;
        this.chats = new Map();
        this.isTyping = false;
        this.selectedChatForOptions = null;
        
        // Initialize subsystems
        this.redis = new ChatRedis();
        this.ollama = new ChatOllama();
        this.artifacts = new ChatArtifacts();
        this.fileUpload = new ChatFileUpload(this);
        this.ui = new ChatUI(this);
        
        // UI components
        this.chatOptionsModal = null;
        
        this.init();
    }
    
    async init() {
        console.log('Internal Chat Core initializing...');
        
        this.setupEventListeners();
        this.setupMarkdown();
        this.setupOllamaCallbacks();
        
        // Initialize chat system - delegate to Redis
        await this.redis.initializeChatSystem(this);
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
            stopButton.addEventListener('click', () => this.ollama.stopStream());
        }
        
        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebar-toggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => this.ui.toggleSidebar());
        }
        
        // Chat search
        const chatSearch = document.getElementById('chat-search');
        if (chatSearch) {
            chatSearch.addEventListener('input', (e) => this.ui.searchChats(e.target.value, this.chats));
        }
        
        // Initialize chat options modal
        this.chatOptionsModal = new bootstrap.Modal(document.getElementById('chatOptionsModal'));
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
    
    setupOllamaCallbacks() {
        // Set up streaming callback - delegate to UI for updates
        this.ollama.setChunkCallback((data) => {
            // Update chat ID if provided
            if (data.chatId && data.chatId !== this.currentChatId) {
                this.setCurrentChatId(data.chatId);
            }
            
            // Delegate to UI for streaming updates
            this.ui.updateStreamingContent(data.content);
        });
    }
    
    // Simple state management
    setCurrentChatId(chatId) {
        this.currentChatId = chatId;
        this.artifacts.setChatId(chatId);
    }
    
    setTypingState(isTyping) {
        this.isTyping = isTyping;
        this.ui.updateButtons(isTyping);
    }
    
    // Chat Management - delegate to Redis
    async createNewChat() {
        const result = await this.redis.createNewChat();
        if (result.success) {
            this.redis.addChatToLocalCache(result, this.chats);
            await this.switchToChat(result.chat_id);
            this.ui.updateChatList(this.chats);
            return result.chat_id;
        } else {
            this.ui.showToast('Failed to create new chat', 'error');
            return null;
        }
    }
    
    async switchToChat(chatId) {
        // Validate and switch - delegate to Redis
        if (await this.redis.switchToChat(chatId, this)) {
            this.ui.updateChatListActiveState(this.currentChatId);
            this.fileUpload.clearAllFiles();
        }
    }
    
    // Improved loadChatMessages method in chat_core.js
    async loadChatMessages(chatId) {
        // Delegate to Redis for loading
        const result = await this.redis.getChatHistory(chatId);
        
        if (result.success && result.messages && result.messages.length > 0) {
            // Only render if we have messages
            this.ui.renderChatMessages(result, this.artifacts);
        } else {
            // Handle empty chat or error case
            this.ui.showEmptyChat(result.error);
        }
    }
    
    async deleteChat(chatId) {
        const result = await this.redis.deleteChat(chatId);
        if (result.success) {
            await this.redis.handleChatDeletion(chatId, this);
            this.ui.updateChatList(this.chats);
        } else {
            this.ui.showToast('Failed to delete chat', 'error');
        }
    }
    
    async refreshChatList() {
        await this.redis.refreshChatList(this);
        this.ui.updateChatList(this.chats);
    }
    
    async clearCurrentChatArtifacts() {
        if (!this.currentChatId) return false;
        
        const result = await this.redis.clearChat(this.currentChatId);
        if (result.success) {
            this.ui.clearMessagesUI();
            await this.refreshChatList();
            this.ui.updateCurrentChatTitle('New Chat');
        }
        return result.success;
    }
    
    // Message Handling - delegate to Ollama
    async sendMessage() {
        const input = document.getElementById('chat-input');
        if (!input) return;
        const message = input.value.trim();
        if (!message && this.fileUpload.attachedFiles.length === 0) return;
        if (this.isTyping) return;
        
        // Prepare message - delegate to Ollama for formatting
        const { messageContent, filesToSend } = this.ollama.prepareMessage(message, this.fileUpload.attachedFiles);
        // Add user message to UI
        this.ui.addMessage('user', messageContent, false, filesToSend);
        //this.ui.addMessageFromRedis(messageContent)
        
        // Clear input and files
        input.value = '';
        this.fileUpload.clearAllFiles();
        this.ui.updateCharCount();
        this.ui.autoResizeTextarea();
        this.ui.hideWelcomePrompt();
        
        // Set typing state
        this.setTypingState(true);
        
        try {
            // Send to Ollama - it handles streaming and callbacks
            const stream = await this.ollama.streamMessage(message, filesToSend, this.currentChatId);
            
            // Handle response - delegate to UI
            if (stream.chatId && stream.chatId !== this.currentChatId) {
                this.setCurrentChatId(stream.chatId);
                this.redis.addNewChatToCache(stream.chatId, message, this.chats);
                this.ui.updateChatList(this.chats);
            }
            
            if (stream.content) {
                this.ui.addMessage('assistant', stream.content, false);
                this.ui.updateCurrentChatTitle(this.ollama.generateTitle(message));
            }
            
        } catch (error) {
            // Delegate error handling to Ollama and UI
            const errorInfo = this.ollama.classifyError(error);
            this.ui.addMessage('system', `Error: ${errorInfo.userFriendly}`, true);
            this.ui.showToast(errorInfo.userFriendly, 'error');
        } finally {
            this.setTypingState(false);
        }
    }
    
    // Chat Options - minimal coordination
    showChatOptions(chatId) {
        this.selectedChatForOptions = chatId;
        this.ui.showChatOptionsModal(chatId, this.chats.get(chatId), this.chatOptionsModal);
    }
    
    async renameChat(chatId, newTitle) {
        this.redis.renameChatInCache(chatId, newTitle, this.chats);
        this.ui.updateChatList(this.chats);
        if (chatId === this.currentChatId) {
            this.ui.updateCurrentChatTitle(newTitle);
        }
    }
    
    async duplicateChat(chatId) {
        // Delegate to Redis for implementation
        return await this.redis.duplicateChat(chatId);
    }
    
    // Artifact integration - simple delegation
    async getArtifactReference(artifactId) {
        return await this.artifacts.getArtifact(artifactId);
    }
    
    async searchArtifacts(query, type = null) {
        return await this.artifacts.searchArtifacts(query, type);
    }
    
    async exportChatArtifacts() {
        try {
            const exportData = await this.artifacts.exportArtifacts();
            this.ui.downloadFile(exportData, `chat-${this.currentChatId}-artifacts.json`, 'application/json');
            this.ui.showToast('Artifacts exported successfully', 'success');
        } catch (error) {
            this.ui.showToast('Failed to export artifacts', 'error');
        }
    }
    
    // Utility - simple delegation
    getChatTimestamp(chatId) {
        return this.redis.extractChatTimestamp(chatId);
    }
}