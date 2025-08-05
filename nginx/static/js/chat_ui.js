// UI functionality and visual elements
class ChatUI {
    constructor(chatInstance) {
        this.chat = chatInstance;
        this.init();
    }
    
    init() {
        console.log('Chat UI system initialized');
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
        
        const chatsArray = Array.from(this.chat.chats.values())
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
        
        if (chat.id === this.chat.currentChatId) {
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
                this.chat.switchToChat(chat.id);
            }
        });
        
        return chatItem;
    }
    
    updateChatListActiveState() {
        const chatItems = document.querySelectorAll('.chat-item');
        chatItems.forEach(item => {
            if (item.dataset.chatId === this.chat.currentChatId) {
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
}