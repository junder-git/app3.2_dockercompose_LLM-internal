// File upload functionality
class ChatFileUpload {
    constructor(chatInstance) {
        this.chat = chatInstance;
        this.attachedFiles = [];
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.updateFileUploadUI();
        console.log('File upload system initialized');
    }
    
    setupEventListeners() {
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
            <button type="button" class="file-item-remove" onclick="window.chat.fileUpload.removeFile(${index})" title="Remove file">
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
}