// Chat Ollama Module - Handles streaming communication with Ollama
class ChatOllama {
    constructor() {
        this.abortController = null;
        this.isStreaming = false;
        console.log('Chat Ollama module initialized');
    }
    
    // Stream message to Ollama via backend
    async streamMessage(message, files = [], chatId = null) {
        if (this.isStreaming) {
            throw new Error('Already streaming a message');
        }
        
        this.isStreaming = true;
        this.abortController = new AbortController();
        
        try {
            const requestBody = {
                message: message,
                files: await this.processFiles(files),
                chat_id: chatId
            };
            
            console.log('Ollama: Streaming request:', { 
                message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
                filesCount: files.length,
                chatId 
            });
            
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
                const errorText = await response.text();
                throw new Error(`Stream failed: ${response.status} - ${errorText}`);
            }
            
            return this.handleStreamResponse(response);
            
        } catch (error) {
            this.isStreaming = false;
            this.abortController = null;
            
            if (error.name === 'AbortError') {
                throw new Error('Stream was cancelled');
            }
            
            console.error('Ollama: Stream error:', error);
            throw error;
        }
    }
    
    // Process files for sending to backend
    async processFiles(files) {
        const processedFiles = [];
        
        for (const file of files) {
            try {
                const fileData = {
                    name: file.name,
                    type: file.type,
                    size: file.size
                };
                
                // Read text files content
                if (this.isTextFile(file)) {
                    fileData.content = await this.readFileAsText(file);
                }
                
                processedFiles.push(fileData);
            } catch (error) {
                console.error('Ollama: Error processing file:', file.name, error);
                // Continue processing other files
            }
        }
        
        return processedFiles;
    }
    
    // Handle streaming response from server
    async handleStreamResponse(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        let chatId = null;
        let accumulated = '';
        let receivedChatId = false;
        
        const stream = {
            chatId: null,
            content: '',
            isComplete: false,
            error: null
        };
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        
                        if (data === '[DONE]') {
                            stream.isComplete = true;
                            stream.content = accumulated;
                            this.isStreaming = false;
                            this.abortController = null;
                            return stream;
                        }
                        
                        try {
                            const parsed = JSON.parse(data);
                            
                            // Handle chat_id from server
                            if (parsed.chat_id && !receivedChatId) {
                                chatId = parsed.chat_id;
                                stream.chatId = chatId;
                                receivedChatId = true;
                                console.log('Ollama: Received chat_id:', chatId);
                            }
                            
                            // Handle content chunks
                            if (parsed.content) {
                                accumulated += parsed.content;
                                stream.content = accumulated;
                                
                                // Yield intermediate result for streaming UI updates
                                if (this.onChunk) {
                                    this.onChunk({
                                        chatId: chatId,
                                        content: accumulated,
                                        chunk: parsed.content,
                                        isComplete: false
                                    });
                                }
                            }
                            
                            // Handle errors from server
                            if (parsed.error) {
                                stream.error = parsed.error;
                                throw new Error(parsed.error);
                            }
                            
                        } catch (e) {
                            if (e.message !== 'Unexpected end of JSON input') {
                                console.error('Ollama: JSON parse error:', e, 'Data:', data);
                                stream.error = e.message;
                                throw e;
                            }
                        }
                    }
                }
            }
            
            // Stream ended without [DONE] signal
            stream.isComplete = true;
            stream.content = accumulated;
            this.isStreaming = false;
            this.abortController = null;
            return stream;
            
        } catch (error) {
            this.isStreaming = false;
            this.abortController = null;
            stream.error = error.message;
            throw error;
        }
    }
    
    // Stop current streaming
    stopStream() {
        if (this.abortController && this.isStreaming) {
            console.log('Ollama: Stopping stream');
            this.abortController.abort();
            this.isStreaming = false;
            this.abortController = null;
            return true;
        }
        return false;
    }
    
    // Check if currently streaming
    getStreamingStatus() {
        return {
            isStreaming: this.isStreaming,
            canStop: this.abortController !== null
        };
    }
    
    // Set callback for streaming chunks
    setChunkCallback(callback) {
        this.onChunk = callback;
    }
    
    // Clear chunk callback
    clearChunkCallback() {
        this.onChunk = null;
    }
    
    // File handling utilities
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
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }
    
    // Format file information for display
    formatFileInfo(files) {
        if (!files || files.length === 0) return '';
        
        return files.map(file => 
            `📎 ${file.name} (${this.formatFileSize(file.size)})`
        ).join('\n');
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    
    // Error classification
    classifyError(error) {
        if (error.name === 'AbortError') {
            return {
                type: 'cancelled',
                message: 'Stream was cancelled',
                userFriendly: 'Response generation was stopped.'
            };
        }
        
        if (error.message.includes('fetch')) {
            return {
                type: 'network',
                message: error.message,
                userFriendly: 'Connection error. Please check if the AI service is running.'
            };
        }
        
        if (error.message.includes('400')) {
            return {
                type: 'bad_request',
                message: error.message,
                userFriendly: 'Invalid request. Please try again.'
            };
        }
        
        if (error.message.includes('500')) {
            return {
                type: 'server_error',
                message: error.message,
                userFriendly: 'Server error. Please try again in a moment.'
            };
        }
        
        return {
            type: 'unknown',
            message: error.message,
            userFriendly: 'An unexpected error occurred. Please try again.'
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatOllama;
} else if (typeof window !== 'undefined') {
    window.ChatOllama = ChatOllama;
}