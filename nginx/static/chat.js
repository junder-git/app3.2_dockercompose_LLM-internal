// Simple internal chat client
class InternalChat {
    constructor() {
        this.isTyping = false;
        this.abortController = null;
        this.messageCount = 0;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.loadChatHistory();
        this.setupMarkdown();
        console.log('Internal chat initialized');
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
                    if (chatInput.value.trim()) {
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
    
    addMessage(sender, content, isStreaming = false) {
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
            
            // Apply syntax highlighting
            if (window.Prism) {
                contentDiv.querySelectorAll('pre code').forEach((block) => {
                    Prism.highlightElement(block);
                });
            }
        }
        
        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        
        this.scrollToBottom();
        return messageDiv;
    }
    
    async sendMessage() {
        const input = document.getElementById('chat-input');
        if (!input) return;
        
        const message = input.value.trim();
        if (!message || this.isTyping) return;
        
        // Add user message
        this.addMessage('user', message);
        
        // Clear input
        input.value = '';
        this.updateCharCount();
        this.autoResizeTextarea();
        
        // Set typing state
        this.isTyping = true;
        this.updateButtons(true);
        this.abortController = new AbortController();
        
        // Add AI message container
        const aiMessage = this.addMessage('ai', '', true);
        
        try {
            await this.streamResponse(message, aiMessage);
        } catch (error) {
            console.error('Chat error:', error);
            this.handleError(error, aiMessage);
        }
    }
    
    async streamResponse(message, aiMessage) {
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify({ message }),
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
            this.scrollToBottom();
        }
    }
    
    finishStreaming(messageElement, finalContent) {
        const contentDiv = messageElement.querySelector('.message-content');
        if (contentDiv) {
            // Remove streaming class and add final content with copy button
            contentDiv.innerHTML = '';
            
            // Create content wrapper
            const contentWrapper = document.createElement('div');
            contentWrapper.innerHTML = window.marked ? marked.parse(finalContent) : finalContent;
            
            // Add copy button
            const copyButton = document.createElement('button');
            copyButton.className = 'btn btn-outline-secondary btn-sm copy-btn';
            copyButton.innerHTML = '<i class="bi bi-clipboard"></i>';
            copyButton.title = 'Copy to clipboard';
            copyButton.onclick = () => this.copyToClipboard(finalContent, copyButton);
            
            const buttonWrapper = document.createElement('div');
            buttonWrapper.className = 'message-actions';
            buttonWrapper.appendChild(copyButton);
            
            contentDiv.appendChild(contentWrapper);
            contentDiv.appendChild(buttonWrapper);
            
            // Apply syntax highlighting
            if (window.Prism) {
                contentDiv.querySelectorAll('pre code').forEach((block) => {
                    Prism.highlightElement(block);
                });
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
            
            // Visual feedback
            const originalIcon = button.innerHTML;
            button.innerHTML = '<i class="bi bi-check"></i>';
            button.classList.add('text-success');
            
            setTimeout(() => {
                button.innerHTML = originalIcon;
                button.classList.remove('text-success');
            }, 2000);
            
        } catch (err) {
            console.error('Failed to copy text: ', err);
            
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            
            try {
                document.execCommand('copy');
                
                // Visual feedback
                const originalIcon = button.innerHTML;
                button.innerHTML = '<i class="bi bi-check"></i>';
                button.classList.add('text-success');
                
                setTimeout(() => {
                    button.innerHTML = originalIcon;
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
    
    async loadChatHistory() {
        try {
            const response = await fetch('/api/chat/history');
            if (response.ok) {
                const data = await response.json();
                if (data.messages && data.messages.length > 0) {
                    // Hide welcome prompt if there are messages
                    const welcomePrompt = document.getElementById('welcome-prompt');
                    if (welcomePrompt) {
                        welcomePrompt.style.display = 'none';
                    }
                    
                    // Add each message
                    data.messages.forEach(msg => {
                        this.addMessage(msg.role, msg.content);
                        
                        // Add copy button to AI messages
                        if (msg.role === 'ai') {
                            const lastMessage = document.querySelector('.message-ai:last-child');
                            if (lastMessage) {
                                this.addCopyButtonToMessage(lastMessage, msg.content);
                            }
                        }
                    });
                    
                    this.scrollToBottom();
                }
            }
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    }
    
    addCopyButtonToMessage(messageElement, content) {
        const contentDiv = messageElement.querySelector('.message-content');
        if (contentDiv && !messageElement.querySelector('.copy-btn')) {
            const copyButton = document.createElement('button');
            copyButton.className = 'btn btn-outline-secondary btn-sm copy-btn';
            copyButton.innerHTML = '<i class="bi bi-clipboard"></i>';
            copyButton.title = 'Copy to clipboard';
            copyButton.onclick = () => this.copyToClipboard(content, copyButton);
            
            const buttonWrapper = document.createElement('div');
            buttonWrapper.className = 'message-actions';
            buttonWrapper.appendChild(copyButton);
            
            contentDiv.appendChild(buttonWrapper);
        }
    }
}

// Clear chat function
async function clearAllHistory() {
    if (!confirm('Are you sure you want to clear all chat history?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/chat/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            // Clear the UI
            const messagesContainer = document.getElementById('messages-content');
            const welcomePrompt = document.getElementById('welcome-prompt');
            
            if (messagesContainer) {
                messagesContainer.innerHTML = '';
            }
            if (welcomePrompt) {
                welcomePrompt.style.display = 'block';
            }
            
            console.log('Chat history cleared');
        } else {
            throw new Error('Failed to clear chat history');
        }
    } catch (error) {
        console.error('Error clearing chat:', error);
        alert('Failed to clear chat history. Please try again.');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chat = new InternalChat();
});