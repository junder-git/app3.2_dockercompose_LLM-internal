// Chat Core Module - Main orchestrator that coordinates Redis, Ollama, UI, and Artifacts
class InternalChat {
    constructor() {
        // State
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
        this.setupSidebar();
        this.setupOllamaCallbacks();
        
        // Initialize chat system
        try {
            await this.initializeChatSystem();
            console.log('Multi-chat system initialized successfully');
        } catch (error) {
            console.error('Failed to initialize chat system:', error);
            await this.createNewChat(); // Fallback
        }
    }
    
    async initializeChatSystem() {
        const result = await this.redis.getChatList();
        
        if (result.success && result.chats.length > 0) {
            // Load existing chats
            this.chats.clear();
            result.chats.forEach(chatInfo => {
                if (this.redis.isValidChatId(chatInfo.id)) {
                    const chat = {
                        id: chatInfo.id,
                        title: this.redis.generateTitleFromPreview(chatInfo.preview),
                        messages: [], // Loaded on demand
                        createdAt: new Date(this.redis.extractChatTimestamp(chatInfo.id)),
                        updatedAt: new Date(chatInfo.last_updated * 1000),
                        messageCount: chatInfo.message_count,
                        preview: chatInfo.preview
                    };
                    this.chats.set(chatInfo.id, chat);
                }
            });
            
            // Switch to most recent chat
            const sortedChats = Array.from(this.chats.values())
                .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            
            if (sortedChats.length > 0) {
                await this.switchToChat(sortedChats[0].id);
            }
            
            this.ui.updateChatList();
        } else {
            // Create first chat
            await this.createNewChat();
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
    
    setupSidebar() {
        this.ui.setupSidebarResize();
    }
    
    setupOllamaCallbacks() {
        // Set up streaming callback for real-time UI updates
        this.ollama.setChunkCallback((data) => {
            if (data.chatId && data.chatId !== this.currentChatId) {
                // Update current chat ID if server provided a new one
                this.currentChatId = data.chatId;
                this.artifacts.setChatId(data.chatId);
                
                // Add to local cache if new
                if (!this.chats.has(data.chatId)) {
                    const chat = {
                        id: data.chatId,
                        title: 'New Chat',
                        messages: [],
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        messageCount: 0,
                        preview: ''
                    };
                    this.chats.set(data.chatId, chat);
                }
            }
            
            // Update streaming content in real-time
            this.updateStreamingContent(data.content);
        });
    }
    
    // Chat Management
    async createNewChat() {
        try {
            const result = await this.redis.createNewChat();
            
            if (result.success) {
                const chat = {
                    id: result.chat_id,
                    title: 'New Chat',
                    messages: [],
                    createdAt: new Date(result.created_at * 1000),
                    updatedAt: new Date(result.created_at * 1000),
                    messageCount: 0,
                    preview: ''
                };
                
                this.chats.set(result.chat_id, chat);
                await this.switchToChat(result.chat_id);
                this.ui.updateChatList();
                
                console.log('Created new chat:', result.chat_id);
                return result.chat_id;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Failed to create new chat:', error);
            this.ui.showToast('Failed to create new chat', 'error');
            return null;
        }
    }
    
    async switchToChat(chatId) {
        if (!chatId || !this.redis.isValidChatId(chatId)) {
            console.error('Invalid chat ID:', chatId);
            return;
        }
        
        console.log('Switching to chat:', chatId);
        this.currentChatId = chatId;
        this.artifacts.setChatId(chatId);
        
        await this.loadChatMessages(chatId);
        this.ui.updateChatListActiveState();
        this.fileUpload.clearAllFiles();
    }
    
    async loadChatMessages(chatId) {
        const messagesContainer = document.getElementById('messages-content');
        const welcomePrompt = document.getElementById('welcome-prompt');
        
        if (!messagesContainer) return;
        
        // Clear current messages
        messagesContainer.innerHTML = '';
        
        const result = await this.redis.getChatHistory(chatId);
        
        if (result.success) {
            const messages = result.messages;
            console.log(`Loaded ${messages.length} messages for chat ${chatId}`);
            
            if (messages.length === 0) {
                // Show welcome prompt for empty chats
                if (welcomePrompt) {
                    welcomePrompt.style.display = 'block';
                }
                this.ui.updateCurrentChatTitle('New Chat');
            } else {
                // Hide welcome prompt and load messages
                if (welcomePrompt) {
                    welcomePrompt.style.display = 'none';
                }
                
                // Update chat title from first user message
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
                    
                    if (messageElement && msg.id) {
                        // Determine artifact type from message ID format
                        let messageType;
                        if (msg.id.startsWith('admin(')) {
                            messageType = 'admin';
                        } else if (msg.id.startsWith('jai(')) {
                            messageType = 'jai';
                        } else {
                            messageType = msg.role === 'user' ? 'admin' : 'jai';
                        }
                        
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
        } else {
            console.error('Failed to load chat messages:', result.error);
            if (welcomePrompt) {
                welcomePrompt.style.display = 'block';
            }
            this.ui.updateCurrentChatTitle('Error Loading Chat');
        }
    }
    
    async deleteChat(chatId) {
        if (!chatId || !this.redis.isValidChatId(chatId)) return;
        
        const result = await this.redis.deleteChat(chatId);
        
        if (result.success) {
            this.chats.delete(chatId);
            
            // If deleting current chat, switch to another or create new
            if (this.currentChatId === chatId) {
                await this.refreshChatList();
                const remainingChats = Array.from(this.chats.keys());
                if (remainingChats.length > 0) {
                    await this.switchToChat(remainingChats[0]);
                } else {
                    await this.createNewChat();
                }
            } else {
                await this.refreshChatList();
            }
            
            console.log(`Deleted chat ${chatId}, removed ${result.deleted_count} items`);
        } else {
            console.error('Failed to delete chat:', result.error);
            this.ui.showToast('Failed to delete chat', 'error');
        }
    }
    
    async refreshChatList() {
        const result = await this.redis.getChatList();
        
        if (result.success) {
            this.chats.clear();
            result.chats.forEach(chatInfo => {
                if (this.redis.isValidChatId(chatInfo.id)) {
                    const chat = {
                        id: chatInfo.id,
                        title: this.redis.generateTitleFromPreview(chatInfo.preview),
                        messages: [],
                        createdAt: new Date(this.redis.extractChatTimestamp(chatInfo.id)),
                        updatedAt: new Date(chatInfo.last_updated * 1000),
                        messageCount: chatInfo.message_count,
                        preview: chatInfo.preview
                    };
                    this.chats.set(chatInfo.id, chat);
                }
            });
            
            this.ui.updateChatList();
        }
    }
    
    // Message Handling
    async sendMessage() {
        const input = document.getElementById('chat-input');
        if (!input) return;
        
        const message = input.value.trim();
        if (!message && this.fileUpload.attachedFiles.length === 0) return;
        if (this.isTyping) return;
        
        console.log('Sending message to chat:', this.currentChatId);
        
        // Prepare message content
        const filesToSend = [...this.fileUpload.attachedFiles];
        let messageContent = message;
        
        if (filesToSend.length > 0) {
            const fileInfo = this.ollama.formatFileInfo(filesToSend);
            messageContent = messageContent ? `${messageContent}\n\n${fileInfo}` : fileInfo;
        }
        
        // Add user message to UI
        this.addMessage('user', messageContent, false, filesToSend);
        
        // Clear input and files
        input.value = '';
        this.fileUpload.clearAllFiles();
        this.ui.updateCharCount();
        this.ui.autoResize