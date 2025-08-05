// Multi-chat internal chat client with file upload support
class InternalChat {
    constructor() {
        this.isTyping = false;
        this.abortController = null;
        this.attachedFiles = [];
        this.currentChatId = null;
        this.chats = new Map();
        this.chatOptionsModal = null;
        this.selectedChatForOptions = null;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupMarkdown();
        this.setupFileUpload();
        this.setupSidebar();
        this.loadChatList();
        this.createNewChat(); // Start with a new chat
        console.log('Multi-chat internal chat initialized');
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
                this.updateCharCount();
                this.autoResizeTextarea();
            });
            
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (chatInput.value.trim() || this.attachedFiles.length > 0) {
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
        
        // Attach button
        const attachButton = document.getElementById('attach-button');
        if (attachButton) {
            attachButton.addEventListener('click', () => this.triggerFileInput());
        }
        
        // File input
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
        
        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebar-toggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }
        
        // Chat search
        const chatSearch = document.getElementById('chat-search');
        if (chatSearch) {
            chatSearch.addEventListener('input', (e) => this.searchChats(e.target.value));
        }
        
        // Drag and drop
        this.setupDragAndDrop();
        
        // Initialize chat options modal
        this.chatOptionsModal = new bootstrap.Modal(document.getElementById('chatOptionsModal'));
    }
    
    setupSidebar() {
        // Handle sidebar interactions
        this.setupSidebarResize();
    }
    
    setupSidebarResize() {
        // Could add resize functionality here if needed
    }
    
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.toggle('collapsed');
        }
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
        this.updateChatList();
        this.saveChatList();
        
        return chatId;
    }
    
    switchToChat(chatId) {
        if (!this.chats.has(chatId)) {
            console.error('Chat not found:', chatId);
            return;
        }
        
        // Save current chat if switching away
        if (this.currentChatId && this.currentChatId !== chatId) {
            this.saveCurrentChatMessages();
        }
        
        this.currentChatId = chatId;
        const chat = this.chats.get(chatId);
        
        // Update UI
        this.updateCurrentChatTitle(chat.title);
        this.loadChatMessages(chat.messages);
        this.updateChatListActiveState();
        
        // Clear any attached files when switching chats
        this.clearAllFiles();
    }
    
    updateCurrentChatTitle(title) {
        const titleElement = document.getElementById('current-chat-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
    }
    
    loadChatMessages(messages) {
        const messagesContainer = document.getElementById('messages-content');
        const welcomePrompt = document.getElementById('welcome-prompt');
        
        if (!messagesContainer) return;
        
        // Clear current messages
        messagesContainer.innerHTML = '';
        
        if (messages.length === 0) {
            // Show welcome prompt for empty chats
            if (welcomePrompt) {
                welcomePrompt.style.display = 'block';
            }
        } else {
            // Hide welcome prompt and load messages
            if (welcomePrompt) {
                welcomePrompt.style.display = 'none';
            }
            
            messages.forEach(msg => {
                this.addMessage(msg.role, msg.content, false, msg.files || []);
            });
            
            this.scrollToBottom();
        }
    }
    
    saveCurrentChatMessages() {
        if (!this.currentChatId) return;
        
        const chat = this.chats.get(this.currentChatId);
        if (!chat) return;
        
        // Messages are automatically saved when added, but this ensures consistency
        this.saveChatToStorage(chat);
    }
    
    deleteChat(chatId) {
        if (!this.chats.has(chatId)) return;
        
        this.chats.delete(chatId);
        
        // If deleting current chat, switch to another or create new
        if (this.currentChatId === chatId) {
            const remainingChats = Array.from(this.chats.keys());
            if (remainingChats.length > 0) {
                this.switchToChat(remainingChats[0]);
            } else {
                this.createNewChat();
            }
        }
        
        this.updateChatList();
        this.saveChatList();
        this.deleteChatFromStorage(chatId);
    }
    
    renameChat(chatId, newTitle) {
        const chat = this.chats.get(chatId);
        if (!chat) return;
        
        chat.title = newTitle;
        chat.updatedAt = new Date();
        
        if (chatId === this.currentChatId) {
            this.updateCurrentChatTitle(newTitle);
        }
        
        this.updateChatList();
        this.saveChatToStorage(chat);
    }
    
    duplicateChat(chatId) {
        const originalChat = this.chats.get(chatId);
        if (!originalChat) return;
        
        const newChatId = this.generateChatId();
        const duplicatedChat = {
            id: newChatId,
            title: originalChat.title + ' (Copy)',
            messages: JSON.parse(JSON.stringify(originalChat.messages)), // Deep clone
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        this.chats.set(newChatId, duplicatedChat);
        this.switchToChat(newChatId);
        this.updateChatList();
        this.saveChatToStorage(duplicatedChat);
        
        return newChatId;
    }
    
    // UI Update Methods
    updateChatList() {
        const chatList = document.getElementById('chat-list');
        if (!chatList) return;
        
        const chatsArray = Array.from(this.chats.values())
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        if (chatsArray.length === 0) {
            chatList.innerHTML = `
                <div class="text-center text-muted p-3">
                    <i class="bi bi-chat-dots-fill"></i>
                    <p class="mb-0 mt-2">No chats yet</p>
                    <small>Start a new conversation</small>
                </div>
            `;
            return;
        }
        
        chatList.innerHTML = '';
        
        chatsArray.forEach(chat => {
            const chatItem = this.createChatListItem(chat);
            chatList.appendChild(chatItem);
        });
    }
    
    createChatListItem(chat) {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = chat.id;
        
        if (chat.id === this.currentChatId) {
            chatItem.classList.add('active');
        }
        
        // Get preview text from last message
        const lastMessage = chat.messages[chat.messages.length - 1];
        const preview = lastMessage ? 
            (lastMessage.content.length > 60 ? 
                lastMessage.content.substring(0, 60) + '...' : 
                lastMessage.content) : 
            'No messages yet';
        
        const messageCount = chat.messages.length;
        const formattedDate = this.formatChatDate(chat.updatedAt);
        
        chatItem.innerHTML = `
            <div class="chat-item-header">
                <div class="chat-item-title">${this.escapeHtml(chat.title)}</div>
                <div class="chat-item-menu">
                    <button onclick="window.chat.showChatOptions('${chat.id}')" title="Options">
                        <i class="bi bi-three-dots"></i>
                    </button>
                </div>
            </div>
            <div class="chat-item-preview">${this.escapeHtml(preview)}</div>
            <div class="chat-item-meta">
                <div class="chat-item-date">${formattedDate}</div>
                <div class="chat-item-count">${messageCount}</div>
            </div>
        `;
        
        // Add click handler for switching chats
        chatItem.addEventListener('click', (e) => {
            if (!e.target.closest('.chat-item-menu')) {
                this.switchToChat(chat.id);
            }
        });
        
        return chatItem;
    }
    
    updateChatListActiveState() {
        const chatItems = document.querySelectorAll('.chat-item');
        chatItems.forEach(item => {
            if (item.dataset.chatId === this.currentChatId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }
    
    formatChatDate(date) {
        const now = new Date();
        const chatDate = new Date(date);
        const diffInMs = now - chatDate;
        const diffInHours = diffInMs / (1000 * 60 * 60);
        
        if (diffInHours < 1) {
            return 'Just now';
        } else if (diffInHours < 24) {
            return `${Math.floor(diffInHours)}h ago`;
        } else if (diffInHours < 24 * 7) {
            return `${Math.floor(diffInHours / 24)}d ago`;
        } else {
            return chatDate.toLocaleDateString();
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
    
    // Storage Methods
    saveChatList() {
        try {
            const chatData = Array.from(this.chats.values()).map(chat => ({
                id: chat.id,
                title: chat.title,
                createdAt: chat.createdAt.toISOString(),
                updatedAt: chat.updatedAt.toISOString(),
                messageCount: chat.messages.length
            }));
            
            localStorage.setItem('internal_chat_list', JSON.stringify(chatData));
        } catch (error) {
            console.error('Failed to save chat list:', error);
        }
    }
    
    loadChatList() {
        try {
            const chatListData = localStorage.getItem('internal_chat_list');
            if (chatListData) {
                const chatList = JSON.parse(chatListData);
                
                // Load basic chat info first
                chatList.forEach(chatInfo => {
                    if (!this.chats.has(chatInfo.id)) {
                        const chat = {
                            id: chatInfo.id,
                            title: chatInfo.title,
                            messages: [],
                            createdAt: new Date(chatInfo.createdAt),
                            updatedAt: new Date(chatInfo.updatedAt)
                        };
                        this.chats.set(chatInfo.id, chat);
                        
                        // Load messages lazily when needed
                        this.loadChatFromStorage(chatInfo.id);
                    }
                });
                
                this.updateChatList();
            }
        } catch (error) {
            console.error('Failed to load chat list:', error);
        }
    }
    
    saveChatToStorage(chat) {
        try {
            localStorage.setItem(`internal_chat_${chat.id}`, JSON.stringify({
                id: chat.id,
                title: chat.title,
                messages: chat.messages,
                createdAt: chat.createdAt.toISOString(),
                updatedAt: chat.updatedAt.toISOString()
            }));
        } catch (error) {
            console.error('Failed to save chat to storage:', error);
        }
    }
    
    loadChatFromStorage(chatId) {
        try {
            const chatData = localStorage.getItem(`internal_chat_${chatId}`);
            if (chatData) {
                const parsed = JSON.parse(chatData);
                const chat = this.chats.get(chatId);
                
                if (chat) {
                    chat.messages = parsed.messages || [];
                    chat.title = parsed.title;
                    chat.createdAt = new Date(parsed.createdAt);
                    chat.updatedAt = new Date(parsed.updatedAt);
                }
            }
        } catch (error) {
            console.error('Failed to load chat from storage:', error);
        }
    }
    
    deleteChatFromStorage(chatId) {
        try {
            localStorage.removeItem(`internal_chat_${chatId}`);
        } catch (error) {
            console.error('Failed to delete chat from storage:', error);
        }
    }
    
    // File Upload Methods (same as before)
    setupFileUpload() {
        this.updateFileUploadUI();
    }
    
    setupDragAndDrop() {
        const chatContainer = document.querySelector('.chat-input-container');
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            chatContainer.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            chatContainer.addEventListener(eventName, () => this.highlight(chatContainer), false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            chatContainer.addEventListener(eventName, () => this.unhighlight(chatContainer), false);
        });
        
        chatContainer.addEventListener('drop', (e) => this.handleDrop(e), false);
    }
    
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    highlight(element) {
        element.classList.add('drag-over');
    }
    
    unhighlight(element) {
        element.classList.remove('drag-over');
    }
    
    handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        this.addFiles(files);
    }
    
    triggerFileInput() {
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.click();
        }
    }
    
    handleFileSelect(e) {
        const files = e.target.files;
        this.addFiles(files);
        e.target.value = '';
    }
    
    addFiles(files) {
        Array.from(files).forEach(file => {
            const existingFile = this.attachedFiles.find(f => 
                f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
            );
            
            if (!existingFile) {
                this.attachedFiles.push(file);
            }
        });
        
        this.updateFileUploadUI();
    }
    
    removeFile(index) {
        this.attachedFiles.splice(index, 1);
        this.updateFileUploadUI();
    }
    
    clearAllFiles() {
        this.attachedFiles = [];
        this.updateFileUploadUI();
    }
    
    updateFileUploadUI() {
        const fileUploadArea = document.getElementById('file-upload-area');
        const fileList = document.getElementById('file-list');
        const attachButton = document.getElementById('attach-button');
        const fileCount = document.getElementById('file-count');
        const fileCountNumber = document.getElementById('file-count-number');
        
        if (this.attachedFiles.length > 0) {
            if (fileUploadArea) {
                fileUploadArea.style.display = 'block';
            }
            
            if (fileList) {
                fileList.innerHTML = '';
                this.attachedFiles.forEach((file, index) => {
                    const fileItem = this.createFileItem(file, index);
                    fileList.appendChild(fileItem);
                });
            }
            
            if (attachButton) {
                attachButton.classList.add('has-files');
            }
            
            if (fileCount && fileCountNumber) {
                fileCount.style.display = 'inline';
                fileCountNumber.textContent = this.attachedFiles.length;
            }
        } else {
            if (fileUploadArea) {
                fileUploadArea.style.display = 'none';
            }
            
            if (attachButton) {
                attachButton.classList.remove('has-files');
            }
            
            if (fileCount) {
                fileCount.style.display = 'none';
            }
        }
    }
    
    createFileItem(file, index) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const icon = this.getFileIcon(file.type);
        const size = this.formatFileSize(file.size);
        
        fileItem.innerHTML = `
            <i class="bi ${icon}"></i>
            <div class="file-item-info">
                <div class="file-item-name">${file.name}</div>
                <div class="file-item-size">${size}</div>
            </div>
            <button type="button" class="file-item-remove" onclick="window.chat.removeFile(${index})" title="Remove file">
                <i class="bi bi-x"></i>
            </button>
        `;
        
        return fileItem;
    }
    
    getFileIcon(mimeType) {
        if (mimeType.startsWith('image/')) return 'bi-file-earmark-image';
        if (mimeType.startsWith('video/')) return 'bi-file-earmark-play';
        if (mimeType.startsWith('audio/')) return 'bi-file-earmark-music';
        if (mimeType.includes('pdf')) return 'bi-file-earmark-pdf';
        if (mimeType.includes('word')) return 'bi-file-earmark-word';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'bi-file-earmark-excel';
        if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'bi-file-earmark-ppt';
        if (mimeType.includes('zip') || mimeType.includes('archive')) return 'bi-file-earmark-zip';
        if (mimeType.includes('text') || mimeType.includes('json') || mimeType.includes('xml')) return 'bi-file-earmark-text';
        return 'bi-file-earmark';
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    
    // Message handling methods
    updateCharCount() {
        const textarea = document.getElementById('chat-input');
        const countEl = document.getElementById('char-count');
        
        if (textarea && countEl) {
            countEl.textContent = textarea.value.length;
        }
    }
    
    autoResizeTextarea() {
        const textarea = document.getElementById('chat-input');
        if (textarea) {
            textarea.style.height = 'auto';
            const maxHeight = 120;
            const newHeight = Math.min(textarea.scrollHeight, maxHeight);
            textarea.style.height = newHeight + 'px';
        }
    }
    
    updateButtons(isTyping) {
        const sendButton = document.getElementById('send-button');
        const stopButton = document.getElementById('stop-button');
        const chatInput = document.getElementById('chat-input');
        const attachButton = document.getElementById('attach-button');
        const status = document.getElementById('status');
        
        if (sendButton) {
            sendButton.style.display = isTyping ? 'none' : 'flex';
            sendButton.disabled = isTyping;
        }
        if (stopButton) {
            stopButton.style.display = isTyping ? 'flex' : 'none';
        }
        if (chatInput) {
            chatInput.disabled = isTyping;
        }
        if (attachButton) {
            attachButton.disabled = isTyping;
        }
        if (status) {
            status.textContent = isTyping ? 'Thinking...' : 'Ready';
        }
    }
    
    scrollToBottom() {
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
    
    addMessage(sender, content, isStreaming = false, files = []) {
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
                
                const icon = this.getFileIcon(file.type);
                const size = this.formatFileSize(file.size);
                
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
            this.enhanceCodeBlocks(contentDiv, content);
        }
        
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        
        // Save message to current chat if not streaming
        if (!isStreaming && this.currentChatId) {
            const chat = this.chats.get(this.currentChatId);
            if (chat) {
                chat.messages.push({
                    role: sender === 'user' ? 'user' : 'ai',
                    content: content,
                    files: files || [],
                    timestamp: Date.now()
                });
                
                chat.updatedAt = new Date();
                
                // Update chat title if this is the first user message
                if (sender === 'user' && chat.messages.filter(m => m.role === 'user').length === 1) {
                    const newTitle = content.length > 30 ? content.substring(0, 30) + '...' : content;
                    chat.title = newTitle;
                    this.updateCurrentChatTitle(newTitle);
                }
                
                this.updateChatList();
                this.saveChatToStorage(chat);
                this.saveChatList();
            }
        }
        
        this.scrollToBottom();
        return messageDiv;
    }
    
    enhanceCodeBlocks(contentDiv, originalContent) {
        if (window.Prism) {
            contentDiv.querySelectorAll('pre code').forEach((block) => {
                Prism.highlightElement(block);
            });
        }
        
        contentDiv.querySelectorAll('pre').forEach((preElement, index) => {
            this.addCopyButtonToCodeBlock(preElement, originalContent);
        });
        
        this.addMessageCopyButton(contentDiv, originalContent);
    }
    
    addCopyButtonToCodeBlock(preElement, originalContent) {
        const codeElement = preElement.querySelector('code');
        if (!codeElement) return;
        
        const codeText = codeElement.textContent || codeElement.innerText;
        
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.marginBottom = '1rem';
        
        const copyButton = document.createElement('button');
        copyButton.className = 'btn btn-outline-secondary btn-sm code-copy-btn';
        copyButton.innerHTML = '<i class="bi bi-clipboard"></i>';
        copyButton.title = 'Copy code';
        copyButton.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            z-index: 10;
            padding: 4px 8px;
            font-size: 12px;
            opacity: 0.7;
            transition: opacity 0.2s ease;
        `;
        
        copyButton.addEventListener('mouseenter', () => {
            copyButton.style.opacity = '1';
        });
        
        copyButton.addEventListener('mouseleave', () => {
            copyButton.style.opacity = '0.7';
        });
        
        copyButton.onclick = (e) => {
            e.stopPropagation();
            this.copyToClipboard(codeText, copyButton);
        };
        
        preElement.parentNode.insertBefore(wrapper, preElement);
        wrapper.appendChild(preElement);
        wrapper.appendChild(copyButton);
    }
    
    addMessageCopyButton(contentDiv, content) {
        const copyButton = document.createElement('button');
        copyButton.className = 'btn btn-outline-secondary btn-sm copy-btn';
        copyButton.innerHTML = '<i class="bi bi-clipboard"></i> Copy message';
        copyButton.title = 'Copy entire message';
        copyButton.onclick = () => this.copyToClipboard(content, copyButton);
        
        const buttonWrapper = document.createElement('div');
        buttonWrapper.className = 'message-actions';
        buttonWrapper.appendChild(copyButton);
        
        contentDiv.appendChild(buttonWrapper);
    }
    
    async sendMessage() {
        const input = document.getElementById('chat-input');
        if (!input) return;
        
        const message = input.value.trim();
        if (!message && this.attachedFiles.length === 0) return;
        if (this.isTyping) return;
        
        // Ensure we have a current chat
        if (!this.currentChatId) {
            this.createNewChat();
        }
        
        let messageContent = message;
        const filesToSend = [...this.attachedFiles];
        
        if (filesToSend.length > 0) {
            const fileInfo = filesToSend.map(file => 
                `📎 ${file.name} (${this.formatFileSize(file.size)})`
            ).join('\n');
            
            if (messageContent) {
                messageContent = `${messageContent}\n\n${fileInfo}`;
            } else {
                messageContent = fileInfo;
            }
        }
        
        // Add user message with files
        this.addMessage('user', messageContent, false, filesToSend);
        
        // Clear input and files
        input.value = '';
        this.clearAllFiles();
        this.updateCharCount();
        this.autoResizeTextarea();
        
        // Set typing state
        this.isTyping = true;
        this.updateButtons(true);
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
                    
                    if (this.isTextFile(file)) {
                        const content = await this.readFileAsText(file);
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
    
    isTextFile(file) {
        const textTypes = [
            'text/',
            'application/json',
            'application/xml',
            'application/javascript',
            'application/csv',
            'application/sql'
        ];
        
        return textTypes.some(type => file.type.startsWith(type)) || 
               file.name.match(/\.(txt|md|json|xml|csv|sql|js|ts|py|java|cpp|c|h|css|html|yml|yaml|toml|ini|cfg|conf|log)$/i);
    }
    
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }
    
    updateStreamingContent(messageElement, content) {
        const contentDiv = messageElement.querySelector('.streaming-content');
        if (contentDiv) {
            contentDiv.innerHTML = (window.marked ? marked.parse(content) : content) + 
                '<span class="cursor blink">▋</span>';
            this.scrollToBottom();
        }
    }
    
    finishStreaming(messageElement, finalContent) {
        const contentDiv = messageElement.querySelector('.message-content');
        if (contentDiv) {
            contentDiv.innerHTML = '';
            
            const contentWrapper = document.createElement('div');
            contentWrapper.innerHTML = window.marked ? marked.parse(finalContent) : finalContent;
            contentDiv.appendChild(contentWrapper);
            
            this.enhanceCodeBlocks(contentDiv, finalContent);
            
            // Save AI message to current chat
            if (this.currentChatId) {
                const chat = this.chats.get(this.currentChatId);
                if (chat) {
                    chat.messages.push({
                        role: 'ai',
                        content: finalContent,
                        timestamp: Date.now()
                    });
                    
                    chat.updatedAt = new Date();
                    this.updateChatList();
                    this.saveChatToStorage(chat);
                    this.saveChatList();
                }
            }
        }
        
        this.isTyping = false;
        this.updateButtons(false);
        this.abortController = null;
        this.scrollToBottom();
    }
    
    async copyToClipboard(text, button) {
        try {
            await navigator.clipboard.writeText(text);
            
            const originalContent = button.innerHTML;
            button.innerHTML = '<i class="bi bi-check"></i>';
            button.classList.add('text-success');
            
            setTimeout(() => {
                button.innerHTML = originalContent;
                button.classList.remove('text-success');
            }, 2000);
            
        } catch (err) {
            console.error('Failed to copy text: ', err);
            
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            
            try {
                document.execCommand('copy');
                
                const originalContent = button.innerHTML;
                button.innerHTML = '<i class="bi bi-check"></i>';
                button.classList.add('text-success');
                
                setTimeout(() => {
                    button.innerHTML = originalContent;
                    button.classList.remove('text-success');
                }, 2000);
                
            } catch (fallbackErr) {
                console.error('Fallback copy failed: ', fallbackErr);
            }
            
            document.body.removeChild(textArea);
        }
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
        this.updateButtons(false);
        this.abortController = null;
    }
    
    stopGeneration() {
        if (this.abortController) {
            this.abortController.abort();
            this.isTyping = false;
            this.updateButtons(false);
            this.abortController = null;
        }
    }
}

// Global functions for UI interactions
function createNewChat() {
    if (window.chat) {
        window.chat.createNewChat();
    }
}

function clearCurrentChat() {
    if (!window.chat || !window.chat.currentChatId) return;
    
    if (!confirm('Are you sure you want to clear this chat? This action cannot be undone.')) {
        return;
    }
    
    const chat = window.chat.chats.get(window.chat.currentChatId);
    if (chat) {
        chat.messages = [];
        chat.updatedAt = new Date();
        
        // Clear UI
        const messagesContainer = document.getElementById('messages-content');
        const welcomePrompt = document.getElementById('welcome-prompt');
        
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
        if (welcomePrompt) {
            welcomePrompt.style.display = 'block';
        }
        
        window.chat.updateChatList();
        window.chat.saveChatToStorage(chat);
        window.chat.saveChatList();
        
        console.log('Current chat cleared');
    }
}

function refreshChatList() {
    if (window.chat) {
        window.chat.loadChatList();
        window.chat.updateChatList();
    }
}

function deleteAllChats() {
    if (!window.chat) return;
    
    if (!confirm('Are you sure you want to delete ALL chats? This action cannot be undone.')) {
        return;
    }
    
    // Delete all chats from storage
    window.chat.chats.forEach((chat, chatId) => {
        window.chat.deleteChatFromStorage(chatId);
    });
    
    // Clear chat list from localStorage
    localStorage.removeItem('internal_chat_list');
    
    // Clear in-memory chats
    window.chat.chats.clear();
    window.chat.currentChatId = null;
    
    // Create a new chat
    window.chat.createNewChat();
    
    console.log('All chats deleted');
}

function clearAllFiles() {
    if (window.chat) {
        window.chat.clearAllFiles();
    }
}

function renameChatConfirm() {
    if (!window.chat || !window.chat.selectedChatForOptions) return;
    
    const newTitle = document.getElementById('rename-chat-input').value.trim();
    if (!newTitle) {
        alert('Please enter a valid chat name.');
        return;
    }
    
    window.chat.renameChat(window.chat.selectedChatForOptions, newTitle);
    window.chat.chatOptionsModal.hide();
    window.chat.selectedChatForOptions = null;
}

function duplicateChat() {
    if (!window.chat || !window.chat.selectedChatForOptions) return;
    
    window.chat.duplicateChat(window.chat.selectedChatForOptions);
    window.chat.chatOptionsModal.hide();
    window.chat.selectedChatForOptions = null;
}

function deleteChatConfirm() {
    if (!window.chat || !window.chat.selectedChatForOptions) return;
    
    const chat = window.chat.chats.get(window.chat.selectedChatForOptions);
    if (!chat) return;
    
    if (!confirm(`Are you sure you want to delete "${chat.title}"? This action cannot be undone.`)) {
        return;
    }
    
    window.chat.deleteChat(window.chat.selectedChatForOptions);
    window.chat.chatOptionsModal.hide();
    window.chat.selectedChatForOptions = null;
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chat = new InternalChat();
});