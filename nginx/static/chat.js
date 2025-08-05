// Simple internal chat client with file upload support
class InternalChat {
    constructor() {
        this.isTyping = false;
        this.abortController = null;
        this.messageCount = 0;
        this.attachedFiles = [];
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.loadChatHistory();
        this.setupMarkdown();
        this.setupFileUpload();
        console.log('Internal chat initialized with file upload support');
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
        
        // Drag and drop
        this.setupDragAndDrop();
    }
    
    setupFileUpload() {
        // Initialize file upload UI
        this.updateFileUploadUI();
    }
    
    setupDragAndDrop() {
        const chatContainer = document.querySelector('.chat-input-container');
        
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            chatContainer.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });
        
        // Highlight drop area when item is dragged over it
        ['dragenter', 'dragover'].forEach(eventName => {
            chatContainer.addEventListener(eventName, () => this.highlight(chatContainer), false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            chatContainer.addEventListener(eventName, () => this.unhighlight(chatContainer), false);
        });
        
        // Handle dropped files
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
        // Clear the input so the same file can be selected again
        e.target.value = '';
    }
    
    addFiles(files) {
        Array.from(files).forEach(file => {
            // Check if file already exists
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
            // Show upload area
            if (fileUploadArea) {
                fileUploadArea.style.display = 'block';
            }
            
            // Update file list
            if (fileList) {
                fileList.innerHTML = '';
                this.attachedFiles.forEach((file, index) => {
                    const fileItem = this.createFileItem(file, index);
                    fileList.appendChild(fileItem);
                });
            }
            
            // Update attach button style
            if (attachButton) {
                attachButton.classList.add('has-files');
            }
            
            // Show file count
            if (fileCount && fileCountNumber) {
                fileCount.style.display = 'inline';
                fileCountNumber.textContent = this.attachedFiles.length;
            }
        } else {
            // Hide upload area
            if (fileUploadArea) {
                fileUploadArea.style.display = 'none';
            }
            
            // Update attach button style
            if (attachButton) {
                attachButton.classList.remove('has-files');
            }
            
            // Hide file count
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
            
            // Apply syntax highlighting and add copy buttons to code blocks
            this.enhanceCodeBlocks(contentDiv, content);
        }
        
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        
        this.scrollToBottom();
        return messageDiv;
    }
    
    enhanceCodeBlocks(contentDiv, originalContent) {
        // Apply syntax highlighting
        if (window.Prism) {
            contentDiv.querySelectorAll('pre code').forEach((block) => {
                Prism.highlightElement(block);
            });
        }
        
        // Add copy buttons to each code block
        contentDiv.querySelectorAll('pre').forEach((preElement, index) => {
            this.addCopyButtonToCodeBlock(preElement, originalContent);
        });
        
        // Add overall message copy button
        this.addMessageCopyButton(contentDiv, originalContent);
    }
    
    addCopyButtonToCodeBlock(preElement, originalContent) {
        // Get the code content from the code element inside pre
        const codeElement = preElement.querySelector('code');
        if (!codeElement) return;
        
        const codeText = codeElement.textContent || codeElement.innerText;
        
        // Create wrapper for positioning
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.marginBottom = '1rem';
        
        // Create copy button
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
        
        // Wrap the pre element and add the button
        preElement.parentNode.insertBefore(wrapper, preElement);
        wrapper.appendChild(preElement);
        wrapper.appendChild(copyButton);
    }
    
    addMessageCopyButton(contentDiv, content) {
        // Add overall message copy button
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
        
        // Prepare message content with file information
        let messageContent = message;
        const filesToSend = [...this.attachedFiles]; // Copy the array
        
        if (filesToSend.length > 0) {
            // Add file information to the message
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
        // Prepare the request body
        const requestBody = {
            message: message,
            files: []
        };
        
        // Process files - convert to base64 for text files, or just metadata for others
        if (files && files.length > 0) {
            for (const file of files) {
                try {
                    const fileData = {
                        name: file.name,
                        type: file.type,
                        size: file.size
                    };
                    
                    // For text-based files, include content
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
            // Remove streaming class and add final content
            contentDiv.innerHTML = '';
            
            // Create content wrapper
            const contentWrapper = document.createElement('div');
            contentWrapper.innerHTML = window.marked ? marked.parse(finalContent) : finalContent;
            contentDiv.appendChild(contentWrapper);
            
            // Enhance with copy buttons for code blocks and message
            this.enhanceCodeBlocks(contentDiv, finalContent);
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
            const originalContent = button.innerHTML;
            button.innerHTML = '<i class="bi bi-check"></i>';
            button.classList.add('text-success');
            
            setTimeout(() => {
                button.innerHTML = originalContent;
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
                        const files = msg.files || [];
                        this.addMessage(msg.role, msg.content, false, files);
                    });
                    
                    this.scrollToBottom();
                }
            }
        } catch (error) {
            console.error('Failed to load chat history:', error);
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

// Clear all files function
function clearAllFiles() {
    if (window.chat) {
        window.chat.clearAllFiles();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chat = new InternalChat();
});