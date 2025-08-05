// UI functionality and visual elements - Updated for chat(n) format
class ChatUI {
    constructor(chatInstance) {
        this.chatInstance = chatInstance;
        this.init();
    }
    
    init() {
        console.log('Chat UI system initialized (chat(n) format)');
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
    
    updateCurrentChatTitle(title) {
        const titleElement = document.getElementById('current-chat-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
    }
    
    // UI Update Methods
    updateChatList() {
        const chatList = document.getElementById('chat-list');
        if (!chatList) return;
        
        const chatsArray = Array.from(this.chatInstance.chats.values())
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
        
        if (chat.id === this.chatInstance.currentChatId) {
            chatItem.classList.add('active');
        }
        
        // Get preview text from last message
        const lastMessage = chat.messages[chat.messages.length - 1];
        const preview = chat.preview || (lastMessage ? 
            (lastMessage.content.length > 60 ? 
                lastMessage.content.substring(0, 60) + '...' : 
                lastMessage.content) : 
            'No messages yet');
        
        const messageCount = chat.messageCount || chat.messages.length;
        const formattedDate = this.formatChatDate(chat.updatedAt);
        
        // Extract timestamp from chat ID for display
        const chatTimestamp = this.chatInstance.getChatTimestamp(chat.id);
        const chatDisplayId = chatTimestamp ? `chat(${chatTimestamp})` : chat.id;
        
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
            <div class="chat-item-id">
                <small class="text-muted">${chatDisplayId}</small>
            </div>
        `;
        
        // Add click handler for switching chats
        chatItem.addEventListener('click', (e) => {
            if (!e.target.closest('.chat-item-menu')) {
                this.chatInstance.switchToChat(chat.id);
            }
        });
        
        return chatItem;
    }
    
    updateChatListActiveState() {
        const chatItems = document.querySelectorAll('.chat-item');
        chatItems.forEach(item => {
            if (item.dataset.chatId === this.chatInstance.currentChatId) {
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
    
    // Show toast notification
    showToast(message, type = 'info') {
        // Create toast element if it doesn't exist
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'position-fixed top-0 end-0 p-3';
            toastContainer.style.zIndex = '9999';
            document.body.appendChild(toastContainer);
        }
        
        const toastId = `toast-${Date.now()}`;
        const iconMap = {
            success: 'bi-check-circle-fill text-success',
            error: 'bi-x-circle-fill text-danger',
            warning: 'bi-exclamation-triangle-fill text-warning',
            info: 'bi-info-circle-fill text-info'
        };
        
        const toastHTML = `
            <div id="${toastId}" class="toast" role="alert">
                <div class="toast-header">
                    <i class="bi ${iconMap[type] || iconMap.info} me-2"></i>
                    <strong class="me-auto">Notification</strong>
                    <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
                </div>
                <div class="toast-body">
                    ${this.escapeHtml(message)}
                </div>
            </div>
        `;
        
        toastContainer.insertAdjacentHTML('beforeend', toastHTML);
        
        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, { delay: 3000 });
        toast.show();
        
        // Remove toast element after it's hidden
        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    }
    // This method now assumes messages exist and are valid
    renderChatMessages(result, artifacts) {
        const messagesContainer = document.getElementById('messages-content');
        const welcomePrompt = document.getElementById('welcome-prompt');
        
        if (!messagesContainer) return;
        
        // Clear current messages and hide welcome prompt
        messagesContainer.innerHTML = '';
        if (welcomePrompt) {
            welcomePrompt.style.display = 'none';
        }
        
        const messages = result.messages; // We know this exists and has length > 0
        console.log(`Rendering ${messages.length} messages for chat`);
        
        // Update chat title from first user message
        const firstUserMessage = messages.find(msg => msg.role === 'user');
        if (firstUserMessage && firstUserMessage.content) {
            const title = firstUserMessage.content.length > 30 ? 
                firstUserMessage.content.substring(0, 30) + '...' : 
                firstUserMessage.content;
            this.updateCurrentChatTitle(title);
        }
        
        // Load messages and process with artifacts
        for (const msg of messages) {
            const messageElement = this.addMessage(msg.id, msg.content);           
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
                
                artifacts.processMessageElement(
                    messageElement, 
                    messageType, 
                    msg.content, 
                    msg.files || [], 
                    msg.id
                );
            }
        }
        
        this.scrollToBottom();
    }

    // New method to handle empty chat state
    showEmptyChat(error = null) {
        const messagesContainer = document.getElementById('messages-content');
        const welcomePrompt = document.getElementById('welcome-prompt');
        
        // Clear messages
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
        
        // Show welcome prompt
        if (welcomePrompt) {
            welcomePrompt.style.display = 'block';
        }
        
        // Update title based on state
        if (error) {
            console.error('Failed to load chat messages:', error);
            this.updateCurrentChatTitle('Error Loading Chat');
            this.showToast('Failed to load chat messages', 'error');
        } else {
            this.updateCurrentChatTitle('New Chat');
        }
    }

    // Search chats with provided chats map
    searchChats(query, chatsMap) {
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

    // Clear messages UI
    clearMessagesUI() {
        const messagesContainer = document.getElementById('messages-content');
        const welcomePrompt = document.getElementById('welcome-prompt');
        
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
        if (welcomePrompt) {
            welcomePrompt.style.display = 'block';
        }
    }

    // Hide welcome prompt
    hideWelcomePrompt() {
        const welcomePrompt = document.getElementById('welcome-prompt');
        if (welcomePrompt) {
            welcomePrompt.style.display = 'none';
        }
    }

    // Show chat options modal
    showChatOptionsModal(chatId, chat, modal) {
        if (chat) {
            const renameInput = document.getElementById('rename-chat-input');
            if (renameInput) {
                renameInput.value = chat.title;
            }
            modal.show();
        }
    }

    // Download file utility
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Update streaming content
    updateStreamingContent(content) {
        const messagesContainer = document.getElementById('messages-content');
        if (!messagesContainer) return;
        
        let streamingMessage = messagesContainer.querySelector('.message.streaming');
        
        if (!streamingMessage && content) {
            // Create new streaming message
            streamingMessage = this.addMessage('assistant', '', true);
            streamingMessage.classList.add('streaming');
        }
        
        if (streamingMessage && content) {
            const contentDiv = streamingMessage.querySelector('.message-content');
            if (contentDiv) {
                // Update content with markdown rendering
                if (window.marked) {
                    contentDiv.innerHTML = marked.parse(content);
                } else {
                    contentDiv.textContent = content;
                }
                
                // Enhance code blocks
                this.enhanceCodeBlocks(contentDiv, content);
                
                // Scroll to keep content visible
                this.scrollToBottom();
            }
        }
    }

    // Message handling methods
    addMessage(sender, content, isStreaming = false, files = []) {
        const messagesContainer = document.getElementById('messages-content');
        if (!messagesContainer) return null;
        
        const messageElement = document.createElement('div');
        messageElement.className = `message message-${sender}`;
        const roleLabel = sender === 'user' ? 'You' : sender === 'assistant' ? 'JAI' : 'System';
        
        messageElement.innerHTML = `
            <div class="message-header">
                <div class="message-role">${roleLabel}</div>
                <div class="message-time">${Date.now()}</div>
            </div>
            <div class="message-content"></div>
        `;
                
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
            this.enhanceCodeBlocks(contentDiv, content);
        }
        
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        
        // Process with artifacts system if not streaming
        if (!isStreaming && this.currentChatId) {
            const messageType = sender === 'user' ? 'in' : 'out';
            this.chatInstance.artifacts.processMessageElement(messageDiv, messageType, content, files);
            
            // Save message to current chat
            const chat = this.chatInstance.chats.get(this.chatInstance.currentChatId);
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
            }
        }
        return this.chatInstance.loadChatMessages(this.chatInstance.currentChatId)
    }
}