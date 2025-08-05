/**
 * Chat Artifacts System
 * Tracks all chat messages and code blocks with unique IDs for future reference
 * Format: in(n) / out(n) for messages, in(n)_code(x) / out(n)_code(x) for code blocks
 */

class ChatArtifacts {
    constructor() {
        this.messageCounters = {
            in: 0,   // User messages
            out: 0   // AI messages
        };
        this.artifacts = new Map(); // Store all artifacts with metadata
        this.chatId = null; // Current chat ID
        this.init();
    }
    
    init() {
        console.log('Chat Artifacts system initialized');
    }
    
    // Set current chat ID for artifact namespacing
    setChatId(chatId) {
        this.chatId = chatId;
        // Reset counters for new chat or load existing counters
        this.loadCountersForChat(chatId);
    }
    
    // Load or initialize counters for a specific chat
    loadCountersForChat(chatId) {
        const storageKey = `chat_artifacts_${chatId}`;
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const data = JSON.parse(stored);
                this.messageCounters = data.counters || { in: 0, out: 0 };
                
                // Reload artifacts for this chat
                this.loadArtifactsForChat(chatId);
            } else {
                // New chat, reset counters
                this.messageCounters = { in: 0, out: 0 };
            }
        } catch (error) {
            console.error('Error loading chat artifacts:', error);
            this.messageCounters = { in: 0, out: 0 };
        }
    }
    
    // Load artifacts from storage for a specific chat
    loadArtifactsForChat(chatId) {
        const storageKey = `chat_artifacts_${chatId}`;
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.artifacts) {
                    this.artifacts.clear();
                    Object.entries(data.artifacts).forEach(([id, artifact]) => {
                        this.artifacts.set(id, artifact);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading artifacts for chat:', error);
        }
    }
    
    // Save artifacts and counters to storage
    saveArtifactsForChat() {
        if (!this.chatId) return;
        
        const storageKey = `chat_artifacts_${this.chatId}`;
        const data = {
            counters: this.messageCounters,
            artifacts: Object.fromEntries(this.artifacts)
        };
        
        try {
            localStorage.setItem(storageKey, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving chat artifacts:', error);
        }
    }
    
    // Generate next message ID
    getNextMessageId(type) {
        if (!['in', 'out'].includes(type)) {
            throw new Error('Invalid message type. Must be "in" or "out"');
        }
        
        this.messageCounters[type]++;
        const messageId = `${type}(${this.messageCounters[type]})`;
        
        // Save updated counters
        this.saveArtifactsForChat();
        
        return messageId;
    }
    
    // Generate code block ID with parent message ID
    getCodeBlockId(parentMessageId, codeBlockIndex) {
        return `${parentMessageId}_code(${codeBlockIndex})`;
    }
    
    // Add message artifact
    addMessageArtifact(messageId, content, type, files = [], metadata = {}) {
        const artifact = {
            id: messageId,
            type: type, // 'in' or 'out'
            content: content,
            files: files,
            timestamp: Date.now(),
            chatId: this.chatId,
            metadata: metadata,
            codeBlocks: []
        };
        
        this.artifacts.set(messageId, artifact);
        this.saveArtifactsForChat();
        
        return artifact;
    }
    
    // Add code block artifact
    addCodeBlockArtifact(parentMessageId, codeBlockId, code, language = '', metadata = {}) {
        const artifact = {
            id: codeBlockId,
            parentId: parentMessageId,
            type: 'code_block',
            code: code,
            language: language,
            timestamp: Date.now(),
            chatId: this.chatId,
            metadata: metadata
        };
        
        // Add to main artifacts map
        this.artifacts.set(codeBlockId, artifact);
        
        // Add to parent message's code blocks array
        const parentArtifact = this.artifacts.get(parentMessageId);
        if (parentArtifact) {
            parentArtifact.codeBlocks.push(codeBlockId);
        }
        
        this.saveArtifactsForChat();
        return artifact;
    }
    
    // Process message element and assign IDs
    processMessageElement(messageElement, type, content, files = []) {
        const messageId = this.getNextMessageId(type);
        
        // Add ID to message element
        messageElement.setAttribute('data-artifact-id', messageId);
        messageElement.setAttribute('data-artifact-type', type);
        
        // Add visible ID badge to message
        this.addIdBadgeToMessage(messageElement, messageId, type);
        
        // Create message artifact
        this.addMessageArtifact(messageId, content, type, files);
        
        // Process code blocks within the message
        this.processCodeBlocksInMessage(messageElement, messageId);
        
        return messageId;
    }
    
    // Add visible ID badge to message
    addIdBadgeToMessage(messageElement, messageId, type) {
        const header = messageElement.querySelector('.message-header');
        if (header) {
            const idBadge = document.createElement('span');
            idBadge.className = `artifact-id-badge artifact-id-${type}`;
            idBadge.textContent = messageId;
            idBadge.title = `Message ID: ${messageId} (Click to copy)`;
            
            // Add click to copy functionality
            idBadge.addEventListener('click', () => {
                navigator.clipboard.writeText(messageId).then(() => {
                    this.showCopyFeedback(idBadge);
                }).catch(err => {
                    console.error('Failed to copy ID:', err);
                    // Fallback for older browsers
                    this.fallbackCopyToClipboard(messageId, idBadge);
                });
            });
            
            header.appendChild(idBadge);
        }
    }
    
    // Process code blocks within a message
    processCodeBlocksInMessage(messageElement, parentMessageId) {
        const codeBlocks = messageElement.querySelectorAll('pre code');
        
        codeBlocks.forEach((codeElement, index) => {
            const codeBlockIndex = index + 1;
            const codeBlockId = this.getCodeBlockId(parentMessageId, codeBlockIndex);
            
            // Get code content and language
            const code = codeElement.textContent || codeElement.innerText;
            const language = this.extractLanguageFromCodeBlock(codeElement);
            
            // Add ID to code block elements
            const preElement = codeElement.closest('pre');
            if (preElement) {
                preElement.setAttribute('data-artifact-id', codeBlockId);
                preElement.setAttribute('data-artifact-type', 'code_block');
                preElement.setAttribute('data-parent-id', parentMessageId);
                
                // Add visible ID badge to code block
                this.addIdBadgeToCodeBlock(preElement, codeBlockId);
                
                // Create code block artifact
                this.addCodeBlockArtifact(parentMessageId, codeBlockId, code, language);
            }
        });
    }
    
    // Add visible ID badge to code block
    addIdBadgeToCodeBlock(preElement, codeBlockId) {
        // Create ID badge
        const idBadge = document.createElement('span');
        idBadge.className = 'artifact-id-badge artifact-id-code';
        idBadge.textContent = codeBlockId;
        idBadge.title = `Code Block ID: ${codeBlockId} (Click to copy)`;
        
        // Add click to copy functionality
        idBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(codeBlockId).then(() => {
                this.showCopyFeedback(idBadge);
            }).catch(err => {
                console.error('Failed to copy code block ID:', err);
                this.fallbackCopyToClipboard(codeBlockId, idBadge);
            });
        });
        
        // Position the badge in the top-left corner
        idBadge.style.cssText = `
            position: absolute;
            top: 8px;
            left: 8px;
            z-index: 11;
            padding: 2px 6px;
            font-size: 11px;
            background: rgba(0, 0, 0, 0.7);
            color: #fff;
            border-radius: 4px;
            cursor: pointer;
            user-select: none;
            transition: all 0.2s ease;
        `;
        
        // Ensure the pre element has relative positioning
        preElement.style.position = 'relative';
        
        // Add the badge to the pre element
        preElement.appendChild(idBadge);
    }
    
    // Extract language from code block
    extractLanguageFromCodeBlock(codeElement) {
        // Try to get language from class attribute (Prism.js format)
        const classes = codeElement.className.split(' ');
        for (const cls of classes) {
            if (cls.startsWith('language-')) {
                return cls.replace('language-', '');
            }
        }
        
        // Try to get from data attributes
        return codeElement.getAttribute('data-language') || '';
    }
    
    // Show copy feedback
    showCopyFeedback(element) {
        const originalText = element.textContent;
        const originalBg = element.style.backgroundColor;
        
        element.textContent = '✓';
        element.style.backgroundColor = '#28a745';
        
        setTimeout(() => {
            element.textContent = originalText;
            element.style.backgroundColor = originalBg;
        }, 1000);
    }
    
    // Fallback copy method for older browsers
    fallbackCopyToClipboard(text, element) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showCopyFeedback(element);
        } catch (err) {
            console.error('Fallback copy failed:', err);
        }
        
        document.body.removeChild(textArea);
    }
    
    // Get artifact by ID
    getArtifact(artifactId) {
        return this.artifacts.get(artifactId);
    }
    
    // Get all artifacts for current chat
    getAllArtifacts() {
        return Array.from(this.artifacts.values())
            .filter(artifact => artifact.chatId === this.chatId);
    }
    
    // Get all message artifacts
    getMessageArtifacts() {
        return this.getAllArtifacts()
            .filter(artifact => artifact.type === 'in' || artifact.type === 'out')
            .sort((a, b) => a.timestamp - b.timestamp);
    }
    
    // Get all code block artifacts
    getCodeBlockArtifacts() {
        return this.getAllArtifacts()
            .filter(artifact => artifact.type === 'code_block')
            .sort((a, b) => a.timestamp - b.timestamp);
    }
    
    // Get code blocks for a specific message
    getCodeBlocksForMessage(messageId) {
        return this.getAllArtifacts()
            .filter(artifact => artifact.type === 'code_block' && artifact.parentId === messageId)
            .sort((a, b) => a.id.localeCompare(b.id)); // Sort by ID to maintain order
    }
    
    // Search artifacts by content
    searchArtifacts(query, type = null) {
        const lowerQuery = query.toLowerCase();
        return this.getAllArtifacts()
            .filter(artifact => {
                if (type && artifact.type !== type) return false;
                
                const content = artifact.content || artifact.code || '';
                return content.toLowerCase().includes(lowerQuery) ||
                       artifact.id.toLowerCase().includes(lowerQuery);
            })
            .sort((a, b) => b.timestamp - a.timestamp);
    }
    
    // Export artifacts for current chat
    exportArtifacts() {
        const artifacts = this.getAllArtifacts();
        const exportData = {
            chatId: this.chatId,
            timestamp: Date.now(),
            counters: this.messageCounters,
            artifacts: artifacts
        };
        
        return JSON.stringify(exportData, null, 2);
    }
    
    // Clear artifacts for current chat
    clearArtifacts() {
        if (!this.chatId) return;
        
        // Remove artifacts for current chat
        const artifactsToRemove = Array.from(this.artifacts.keys())
            .filter(id => {
                const artifact = this.artifacts.get(id);
                return artifact && artifact.chatId === this.chatId;
            });
        
        artifactsToRemove.forEach(id => this.artifacts.delete(id));
        
        // Reset counters
        this.messageCounters = { in: 0, out: 0 };
        
        // Clear from storage
        const storageKey = `chat_artifacts_${this.chatId}`;
        localStorage.removeItem(storageKey);
    }
    
    // Get next available ID (for reference)
    getNextAvailableId(type) {
        return `${type}(${this.messageCounters[type] + 1})`;
    }
    
    // Get current counters
    getCurrentCounters() {
        return { ...this.messageCounters };
    }
    
    // Get artifact statistics
    getStats() {
        const allArtifacts = this.getAllArtifacts();
        return {
            total: allArtifacts.length,
            messages: allArtifacts.filter(a => a.type === 'in' || a.type === 'out').length,
            userMessages: allArtifacts.filter(a => a.type === 'in').length,
            aiMessages: allArtifacts.filter(a => a.type === 'out').length,
            codeBlocks: allArtifacts.filter(a => a.type === 'code_block').length
        };
    }
    
    // Import artifacts from export data
    importArtifacts(exportData) {
        try {
            const data = typeof exportData === 'string' ? JSON.parse(exportData) : exportData;
            
            if (data.chatId && data.artifacts) {
                this.chatId = data.chatId;
                this.messageCounters = data.counters || { in: 0, out: 0 };
                
                this.artifacts.clear();
                data.artifacts.forEach(artifact => {
                    this.artifacts.set(artifact.id, artifact);
                });
                
                this.saveArtifactsForChat();
                return true;
            }
        } catch (error) {
            console.error('Error importing artifacts:', error);
            return false;
        }
        
        return false;
    }
    
    // Validate artifact ID format
    static isValidArtifactId(id) {
        // Message ID format: in(n) or out(n)
        const messagePattern = /^(in|out)\(\d+\)$/;
        // Code block ID format: in(n)_code(x) or out(n)_code(x)
        const codePattern = /^(in|out)\(\d+\)_code\(\d+\)$/;
        
        return messagePattern.test(id) || codePattern.test(id);
    }
    
    // Parse artifact ID to get components
    static parseArtifactId(id) {
        const messageMatch = id.match(/^(in|out)\((\d+)\)$/);
        if (messageMatch) {
            return {
                type: messageMatch[1],
                messageIndex: parseInt(messageMatch[2]),
                isCodeBlock: false
            };
        }
        
        const codeMatch = id.match(/^(in|out)\((\d+)\)_code\((\d+)\)$/);
        if (codeMatch) {
            return {
                type: codeMatch[1],
                messageIndex: parseInt(codeMatch[2]),
                codeIndex: parseInt(codeMatch[3]),
                isCodeBlock: true,
                parentId: `${codeMatch[1]}(${codeMatch[2]})`
            };
        }
        
        return null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatArtifacts;
} else if (typeof window !== 'undefined') {
    window.ChatArtifacts = ChatArtifacts;
}/**
 * Chat Artifacts System
 * Tracks all chat messages and code blocks with unique IDs for future reference
 * Format: in(n) / out(n) for messages, in(n)_code(x) / out(n)_code(x) for code blocks
 */

class ChatArtifacts {
    constructor() {
        this.messageCounters = {
            in: 0,   // User messages
            out: 0   // AI messages
        };
        this.artifacts = new Map(); // Store all artifacts with metadata
        this.chatId = null; // Current chat ID
        this.init();
    }
    
    init() {
        console.log('Chat Artifacts system initialized');
    }
    
    // Set current chat ID for artifact namespacing
    setChatId(chatId) {
        this.chatId = chatId;
        // Reset counters for new chat or load existing counters
        this.loadCountersForChat(chatId);
    }
    
    // Load or initialize counters for a specific chat
    loadCountersForChat(chatId) {
        const storageKey = `chat_artifacts_${chatId}`;
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const data = JSON.parse(stored);
                this.messageCounters = data.counters || { in: 0, out: 0 };
                
                // Reload artifacts for this chat
                this.loadArtifactsForChat(chatId);
            } else {
                // New chat, reset counters
                this.messageCounters = { in: 0, out: 0 };
            }
        } catch (error) {
            console.error('Error loading chat artifacts:', error);
            this.messageCounters = { in: 0, out: 0 };
        }
    }
    
    // Load artifacts from storage for a specific chat
    loadArtifactsForChat(chatId) {
        const storageKey = `chat_artifacts_${chatId}`;
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.artifacts) {
                    this.artifacts.clear();
                    Object.entries(data.artifacts).forEach(([id, artifact]) => {
                        this.artifacts.set(id, artifact);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading artifacts for chat:', error);
        }
    }
    
    // Save artifacts and counters to storage
    saveArtifactsForChat() {
        if (!this.chatId) return;
        
        const storageKey = `chat_artifacts_${this.chatId}`;
        const data = {
            counters: this.messageCounters,
            artifacts: Object.fromEntries(this.artifacts)
        };
        
        try {
            localStorage.setItem(storageKey, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving chat artifacts:', error);
        }
    }
    
    // Generate next message ID
    getNextMessageId(type) {
        if (!['in', 'out'].includes(type)) {
            throw new Error('Invalid message type. Must be "in" or "out"');
        }
        
        this.messageCounters[type]++;
        const messageId = `${type}(${this.messageCounters[type]})`;
        
        // Save updated counters
        this.saveArtifactsForChat();
        
        return messageId;
    }
    
    // Generate code block ID with parent message ID
    getCodeBlockId(parentMessageId, codeBlockIndex) {
        return `${parentMessageId}_code(${codeBlockIndex})`;
    }
    
    // Add message artifact
    addMessageArtifact(messageId, content, type, files = [], metadata = {}) {
        const artifact = {
            id: messageId,
            type: type, // 'in' or 'out'
            content: content,
            files: files,
            timestamp: Date.now(),
            chatId: this.chatId,
            metadata: metadata,
            codeBlocks: []
        };
        
        this.artifacts.set(messageId, artifact);
        this.saveArtifactsForChat();
        
        return artifact;
    }
    
    // Add code block artifact
    addCodeBlockArtifact(parentMessageId, codeBlockId, code, language = '', metadata = {}) {
        const artifact = {
            id: codeBlockId,
            parentId: parentMessageId,
            type: 'code_block',
            code: code,
            language: language,
            timestamp: Date.now(),
            chatId: this.chatId,
            metadata: metadata
        };
        
        // Add to main artifacts map
        this.artifacts.set(codeBlockId, artifact);
        
        // Add to parent message's code blocks array
        const parentArtifact = this.artifacts.get(parentMessageId);
        if (parentArtifact) {
            parentArtifact.codeBlocks.push(codeBlockId);
        }
        
        this.saveArtifactsForChat();
        return artifact;
    }
    
    // Process message element and assign IDs
    processMessageElement(messageElement, type, content, files = []) {
        const messageId = this.getNextMessageId(type);
        
        // Add ID to message element
        messageElement.setAttribute('data-artifact-id', messageId);
        messageElement.setAttribute('data-artifact-type', type);
        
        // Add visible ID badge to message
        this.addIdBadgeToMessage(messageElement, messageId, type);
        
        // Create message artifact
        this.addMessageArtifact(messageId, content, type, files);
        
        // Process code blocks within the message
        this.processCodeBlocksInMessage(messageElement, messageId);
        
        return messageId;
    }
    
    // Add visible ID badge to message
    addIdBadgeToMessage(messageElement, messageId, type) {
        const header = messageElement.querySelector('.message-header');
        if (header) {
            const idBadge = document.createElement('span');
            idBadge.className = `artifact-id-badge artifact-id-${type}`;
            idBadge.textContent = messageId;
            idBadge.title = `Message ID: ${messageId} (Click to copy)`;
            
            // Add click to copy functionality
            idBadge.addEventListener('click', () => {
                navigator.clipboard.writeText(messageId).then(() => {
                    this.showCopyFeedback(idBadge);
                });
            });
            
            header.appendChild(idBadge);
        }
    }
    
    // Process code blocks within a message
    processCodeBlocksInMessage(messageElement, parentMessageId) {
        const codeBlocks = messageElement.querySelectorAll('pre code');
        
        codeBlocks.forEach((codeElement, index) => {
            const codeBlockIndex = index + 1;
            const codeBlockId = this.getCodeBlockId(parentMessageId, codeBlockIndex);
            
            // Get code content and language
            const code = codeElement.textContent || codeElement.innerText;
            const language = this.extractLanguageFromCodeBlock(codeElement);
            
            // Add ID to code block elements
            const preElement = codeElement.closest('pre');
            if (preElement) {
                preElement.setAttribute('data-artifact-id', codeBlockId);
                preElement.setAttribute('data-artifact-type', 'code_block');
                preElement.setAttribute('data-parent-id', parentMessageId);
                
                // Add visible ID badge to code block
                this.addIdBadgeToCodeBlock(preElement, codeBlockId);
                
                // Create code block artifact
                this.addCodeBlockArtifact(parentMessageId, codeBlockId, code, language);
            }
        });
    }
    
    // Add visible ID badge to code block
    addIdBadgeToCodeBlock(preElement, codeBlockId) {
        // Create ID badge
        const idBadge = document.createElement('span');
        idBadge.className = 'artifact-id-badge artifact-id-code';
        idBadge.textContent = codeBlockId;
        idBadge.title = `Code Block ID: ${codeBlockId} (Click to copy)`;
        
        // Add click to copy functionality
        idBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(codeBlockId).then(() => {
                this.showCopyFeedback(idBadge);
            });
        });
        
        // Position the badge in the top-left corner
        idBadge.style.cssText = `
            position: absolute;
            top: 8px;
            left: 8px;
            z-index: 11;
            padding: 2px 6px;
            font-size: 11px;
            background: rgba(0, 0, 0, 0.7);
            color: #fff;
            border-radius: 4px;
            cursor: pointer;
            user-select: none;
            transition: all 0.2s ease;
        `;
        
        // Ensure the pre element has relative positioning
        preElement.style.position = 'relative';
        
        // Add the badge to the pre element
        preElement.appendChild(idBadge);
    }
    
    // Extract language from code block
    extractLanguageFromCodeBlock(codeElement) {
        // Try to get language from class attribute (Prism.js format)
        const classes = codeElement.className.split(' ');
        for (const cls of classes) {
            if (cls.startsWith('language-')) {
                return cls.replace('language-', '');
            }
        }
        
        // Try to get from data attributes
        return codeElement.getAttribute('data-language') || '';
    }
    
    // Show copy feedback
    showCopyFeedback(element) {
        const originalText = element.textContent;
        const originalBg = element.style.backgroundColor;
        
        element.textContent = '✓';
        element.style.backgroundColor = '#28a745';
        
        setTimeout(() => {
            element.textContent = originalText;
            element.style.backgroundColor = originalBg;
        }, 1000);
    }
    
    // Get artifact by ID
    getArtifact(artifactId) {
        return this.artifacts.get(artifactId);
    }
    
    // Get all artifacts for current chat
    getAllArtifacts() {
        return Array.from(this.artifacts.values())
            .filter(artifact => artifact.chatId === this.chatId);
    }
    
    // Get all message artifacts
    getMessageArtifacts() {
        return this.getAllArtifacts()
            .filter(artifact => artifact.type === 'in' || artifact.type === 'out')
            .sort((a, b) => a.timestamp - b.timestamp);
    }
    
    // Get all code block artifacts
    getCodeBlockArtifacts() {
        return this.getAllArtifacts()
            .filter(artifact => artifact.type === 'code_block')
            .sort((a, b) => a.timestamp - b.timestamp);
    }
    
    // Get code blocks for a specific message
    getCodeBlocksForMessage(messageId) {
        return this.getAllArtifacts()
            .filter(artifact => artifact.type === 'code_block' && artifact.parentId === messageId)
            .sort((a, b) => a.id.localeCompare(b.id)); // Sort by ID to maintain order
    }
    
    // Search artifacts by content
    searchArtifacts(query, type = null) {
        const lowerQuery = query.toLowerCase();
        return this.getAllArtifacts()
            .filter(artifact => {
                if (type && artifact.type !== type) return false;
                
                const content = artifact.content || artifact.code || '';
                return content.toLowerCase().includes(lowerQuery) ||
                       artifact.id.toLowerCase().includes(lowerQuery);
            })
            .sort((a, b) => b.timestamp - a.timestamp);
    }
    
    // Export artifacts for current chat
    exportArtifacts() {
        const artifacts = this.getAllArtifacts();
        const exportData = {
            chatId: this.chatId,
            timestamp: Date.now(),
            counters: this.messageCounters,
            artifacts: artifacts
        };
        
        return JSON.stringify(exportData, null, 2);
    }
    
    // Clear artifacts for current chat
    clearArtifacts() {
        if (!this.chatId) return;
        
        // Remove artifacts for current chat
        const artifactsToRemove = Array.from(this.artifacts.keys())
            .filter(id => {
                const artifact = this.artifacts.get(id);
                return artifact && artifact.chatId === this.chatId;
            });
        
        artifactsToRemove.forEach(id => this.artifacts.delete(id));
        
        // Reset counters
        this.messageCounters = { in: 0, out: 0 };
        
        // Clear from storage
        const storageKey = `chat_artifacts_${this.chatId}`;
        localStorage.removeItem(storageKey);
    }
    
    // Get next available ID (for reference)
    getNextAvailableId(type) {
        return `${type}(${this.messageCounters[type] + 1})`;
    }
    
    // Validate artifact ID format
    static isValidArtifactId(id) {
        // Message ID format: in(n) or out(n)
        const messagePattern = /^(in|out)\(\d+\)$/;
        // Code block ID format: in(n)_code(x) or out(n)_code(x)
        const codePattern = /^(in|out)\(\d+\)_code\(\d+\)$/;
        
        return messagePattern.test(id) || codePattern.test(id);
    }
    
    // Parse artifact ID to get components
    static parseArtifactId(id) {
        const messageMatch = id.match(/^(in|out)\((\d+)\)$/);
        if (messageMatch) {
            return {
                type: messageMatch[1],
                messageIndex: parseInt(messageMatch[2]),
                isCodeBlock: false
            };
        }
        
        const codeMatch = id.match(/^(in|out)\((\d+)\)_code\((\d+)\)$/);
        if (codeMatch) {
            return {
                type: codeMatch[1],
                messageIndex: parseInt(codeMatch[2]),
                codeIndex: parseInt(codeMatch[3]),
                isCodeBlock: true,
                parentId: `${codeMatch[1]}(${codeMatch[2]})`
            };
        }
        
        return null;
    }
}

// CSS for artifact ID badges
const artifactStyles = `
    .artifact-id-badge {
        display: inline-block;
        padding: 2px 6px;
        margin-left: 8px;
        font-size: 10px;
        font-weight: 500;
        border-radius: 4px;
        cursor: pointer;
        user-select: none;
        transition: all 0.2s ease;
        font-family: monospace;
    }
    
    .artifact-id-in {
        background: rgba(13, 110, 253, 0.2);
        color: #0d6efd;
        border: 1px solid rgba(13, 110, 253, 0.3);
    }
    
    .artifact-id-out {
        background: rgba(25, 135, 84, 0.2);
        color: #198754;
        border: 1px solid rgba(25, 135, 84, 0.3);
    }
    
    .artifact-id-code {
        background: rgba(0, 0, 0, 0.7);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .artifact-id-badge:hover {
        transform: scale(1.05);
        opacity: 0.8;
    }
    
    .artifact-id-badge:active {
        transform: scale(0.95);
    }
    
    /* Dark theme adjustments */
    @media (prefers-color-scheme: dark) {
        .artifact-id-in {
            background: rgba(13, 110, 253, 0.3);
            color: #66b3ff;
        }
        
        .artifact-id-out {
            background: rgba(25, 135, 84, 0.3);
            color: #66d9a3;
        }
    }
`;

// Inject styles
if (typeof document !== 'undefined') {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = artifactStyles;
    document.head.appendChild(styleSheet);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatArtifacts;
} else if (typeof window !== 'undefined') {
    window.ChatArtifacts = ChatArtifacts;
}