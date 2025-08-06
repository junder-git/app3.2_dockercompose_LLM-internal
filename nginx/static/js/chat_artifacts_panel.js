// FIXED Artifact panel functionality - Redis Backend with admin/jai format
class ChatArtifactsPanel {
    constructor() {
        this.modal = null;
        this.currentCodeArtifact = null;
        this.keyboardHandler = null;
        this.init();
    }
    
    init() {
        // Initialize artifact panel modal when DOM is loaded
        document.addEventListener('DOMContentLoaded', () => {
            this.modal = new bootstrap.Modal(document.getElementById('artifactPanelModal'));
            this.setupEventListeners();
        });
        console.log('Chat Artifacts Panel initialized (Redis backend, admin/jai format)');
    }
    
    setupEventListeners() {
        // Set up search and filter handlers
        const searchInput = document.getElementById('artifact-search');
        const typeFilter = document.getElementById('artifact-type-filter');
        
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(this.filterArtifacts.bind(this), 300));
        }
        
        if (typeFilter) {
            typeFilter.addEventListener('change', this.filterArtifacts.bind(this));
        }
    }
    
    // Show artifact panel
    async show() {
        if (this.modal) {
            await this.refresh();
            this.modal.show();
        }
    }
    
    // FIXED: Refresh artifact panel data from Redis with better error handling
    async refresh() {
        if (!window.chat || !window.chat.currentChatId) {
            console.warn('🔍 No current chat ID available for artifacts');
            return;
        }
        
        try {
            console.log('🔍 Refreshing artifacts for chat:', window.chat.currentChatId);
            await this.updateArtifactStats();
            await this.displayArtifacts();
        } catch (error) {
            console.error('🔍 Error refreshing artifact panel:', error);
        }
    }
    
    // FIXED: Update artifact statistics with direct API call
    async updateArtifactStats() {
        if (!window.chat?.currentChatId) {
            console.warn('🔍 No current chat ID for stats');
            return;
        }
        
        try {
            console.log('🔍 Fetching artifacts via API for chat:', window.chat.currentChatId);
            
            // FIXED: Direct API call instead of going through chat.artifacts
            const response = await fetch(`/api/chat/artifacts?chat_id=${encodeURIComponent(window.chat.currentChatId)}`);
            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            const allArtifacts = data.artifacts || [];
            
            console.log('🔍 Raw artifacts from API:', allArtifacts);
            console.log('🔍 Artifacts count:', allArtifacts.length);
            
            // FIXED: Better artifact classification
            const messageArtifacts = [];
            const codeBlockArtifacts = [];
            const adminMessages = [];
            const jaiMessages = [];
            
            allArtifacts.forEach(artifact => {
                console.log(`🔍 Processing artifact: ${artifact.id}, type: ${artifact.type}`);
                
                // Check if it's a code block by ID pattern
                if (artifact.id && artifact.id.includes('_code(')) {
                    codeBlockArtifacts.push(artifact);
                    console.log(`🔍 Code block: ${artifact.id}`);
                } else {
                    // It's a message artifact
                    messageArtifacts.push(artifact);
                    
                    if (artifact.type === 'admin' || (artifact.id && artifact.id.startsWith('admin('))) {
                        adminMessages.push(artifact);
                        console.log(`🔍 Admin message: ${artifact.id}`);
                    } else if (artifact.type === 'jai' || (artifact.id && artifact.id.startsWith('jai('))) {
                        jaiMessages.push(artifact);
                        console.log(`🔍 JAI message: ${artifact.id}`);
                    }
                }
            });
            
            const stats = {
                total: allArtifacts.length,
                messages: messageArtifacts.length,
                adminMessages: adminMessages.length,
                jaiMessages: jaiMessages.length,
                codeBlocks: codeBlockArtifacts.length
            };
            
            console.log('🔍 Final calculated stats:', stats);
            
            // Update stats display
            this.updateStatsDisplay(stats);
            
        } catch (error) {
            console.error('🔍 Error updating artifact stats:', error);
            this.resetStatsDisplay();
        }
    }
    
    // Update stats display elements
    updateStatsDisplay(stats) {
        const elements = {
            'total-messages': stats.total,
            'user-messages': stats.adminMessages,
            'ai-messages': stats.jaiMessages,
            'code-blocks': stats.codeBlocks
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value || 0;
                console.log(`🔍 Updated ${id}: ${value}`);
            }
        });
    }
    
    // Reset stats display to 0
    resetStatsDisplay() {
        const elements = ['total-messages', 'user-messages', 'ai-messages', 'code-blocks'];
        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = '0';
        });
    }
    
    // FIXED: Display artifacts with direct API call
    async displayArtifacts() {
        const artifactList = document.getElementById('artifact-list');
        if (!artifactList) {
            console.error('🔍 Artifact list element not found');
            return;
        }
        
        if (!window.chat?.currentChatId) {
            artifactList.innerHTML = `
                <div class="text-center text-muted p-3">
                    <i class="bi bi-exclamation-triangle"></i>
                    <p class="mb-0 mt-2">No chat selected</p>
                </div>
            `;
            return;
        }
        
        try {
            console.log('🔍 Displaying artifacts for chat:', window.chat.currentChatId);
            
            // FIXED: Direct API call
            const response = await fetch(`/api/chat/artifacts?chat_id=${encodeURIComponent(window.chat.currentChatId)}`);
            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            const allArtifacts = data.artifacts || [];
            
            console.log('🔍 Artifacts to display:', allArtifacts.length);
            
            if (allArtifacts.length === 0) {
                artifactList.innerHTML = `
                    <div class="text-center text-muted p-3">
                        <i class="bi bi-inbox"></i>
                        <p class="mb-0 mt-2">No artifacts found</p>
                        <small>Chat: ${window.chat.currentChatId}</small>
                    </div>
                `;
                return;
            }
            
            // Sort by timestamp
            allArtifacts.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            
            artifactList.innerHTML = '';
            
            allArtifacts.forEach((artifact, index) => {
                console.log(`🔍 Creating display for artifact ${index + 1}:`, artifact.id);
                try {
                    const artifactElement = this.createArtifactListItem(artifact);
                    if (artifactElement) {
                        artifactList.appendChild(artifactElement);
                    }
                } catch (itemError) {
                    console.error(`🔍 Error creating artifact item:`, itemError);
                }
            });
            
            console.log(`🔍 Successfully displayed ${allArtifacts.length} artifacts`);
            
        } catch (error) {
            console.error('🔍 Error displaying artifacts:', error);
            artifactList.innerHTML = `
                <div class="text-center text-danger p-3">
                    <i class="bi bi-exclamation-triangle"></i>
                    <p class="mb-0 mt-2">Error loading artifacts</p>
                    <small>${error.message}</small>
                </div>
            `;
        }
    }
    
    // FIXED: Create artifact list item with better detection
    createArtifactListItem(artifact) {
        const item = document.createElement('div');
        item.className = 'artifact-item border rounded p-3 mb-2';
        item.dataset.artifactId = artifact.id;
        
        // ROBUST: Determine if this is a code block
        const isCodeBlock = artifact.id && artifact.id.includes('_code(');
        
        // Determine display type
        let displayType;
        if (isCodeBlock) {
            displayType = 'code_block';
        } else if (artifact.id && artifact.id.startsWith('admin(')) {
            displayType = 'admin';
        } else if (artifact.id && artifact.id.startsWith('jai(')) {
            displayType = 'jai';
        } else {
            displayType = artifact.type || 'unknown';
        }
        
        item.dataset.artifactType = displayType;
        
        const typeIcon = this.getArtifactTypeIcon(displayType);
        const typeLabel = this.getArtifactTypeLabel(displayType);
        const timestamp = new Date((artifact.timestamp || 0) * 1000).toLocaleString();
        
        let content = '';
        let preview = '';
        
        if (isCodeBlock) {
            content = artifact.code || artifact.content || '';
            preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
        } else {
            content = artifact.content || '';
            preview = content.length > 150 ? content.substring(0, 150) + '...' : content;
        }
        
        const languageInfo = artifact.language ? ` (${artifact.language})` : '';
        const parentInfo = artifact.parent_id ? ` [Parent: ${artifact.parent_id}]` : '';
        
        item.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-2">
                <div class="d-flex align-items-center">
                    <i class="bi ${typeIcon} me-2"></i>
                    <strong class="artifact-id">${artifact.id}</strong>
                    <span class="badge bg-secondary ms-2">${typeLabel}${languageInfo}</span>
                    ${parentInfo ? `<small class="text-muted ms-2">${parentInfo}</small>` : ''}
                </div>
                <div class="artifact-actions">
                    <button class="btn btn-sm btn-outline-primary" onclick="window.artifactsPanel.copyArtifactId('${artifact.id}')" title="Copy ID">
                        <i class="bi bi-clipboard"></i>
                    </button>
                    ${isCodeBlock ? `
                        <button class="btn btn-sm btn-outline-info" onclick="window.artifactsPanel.showCodePanel('${artifact.id}')" title="View Code">
                            <i class="bi bi-code-square"></i>
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-outline-success" onclick="window.artifactsPanel.jumpToArtifact('${artifact.id}')" title="Jump to Message">
                        <i class="bi bi-arrow-right"></i>
                    </button>
                </div>
            </div>
            <div class="artifact-preview">
                <small class="text-muted">Created: ${timestamp}</small>
                <div class="mt-2">
                    <code class="artifact-content-preview">${this.escapeHtml(preview)}</code>
                </div>
                ${isCodeBlock ? `<div class="mt-1"><small class="text-success">📝 Code Block (${content.length} chars)</small></div>` : ''}
            </div>
        `;
        
        return item;
    }
    
    // Get icon for artifact type
    getArtifactTypeIcon(type) {
        switch (type) {
            case 'admin': return 'bi-person-circle-fill text-primary';
            case 'jai': return 'bi-robot text-success';
            case 'code_block': return 'bi-code-square text-warning';
            default: return 'bi-question-circle';
        }
    }
    
    // Get label for artifact type
    getArtifactTypeLabel(type) {
        switch (type) {
            case 'admin': return 'Admin';
            case 'jai': return 'JAI';
            case 'code_block': return 'Code';
            default: return 'Unknown';
        }
    }
    
    // NEW: Show code panel for code blocks
    async showCodePanel(artifactId) {
        try {
            console.log('🔍 Showing code panel for:', artifactId);
            
            // Fetch the specific artifact
            const response = await fetch(`/api/chat/artifacts?chat_id=${encodeURIComponent(window.chat.currentChatId)}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch artifact: ${response.status}`);
            }
            
            const data = await response.json();
            const artifact = data.artifacts.find(a => a.id === artifactId);
            
            if (!artifact) {
                throw new Error('Artifact not found');
            }
            
            // Create and show code panel
            this.createCodePanel(artifact);
            
        } catch (error) {
            console.error('🔍 Error showing code panel:', error);
            if (window.chat && window.chat.ui) {
                window.chat.ui.showToast('Failed to load code block', 'error');
            }
        }
    }
    
    // ENHANCED: Create code panel with full features
    createCodePanel(artifact) {
        // Remove existing code panel
        this.closeCodePanel();
        
        const code = artifact.code || artifact.content || '';
        const language = artifact.language || '';
        
        // Create backdrop for mobile
        const backdrop = document.createElement('div');
        backdrop.id = 'code-panel-backdrop';
        backdrop.className = 'code-panel-backdrop';
        backdrop.onclick = () => this.closeCodePanel();
        
        // Create code panel HTML
        const panel = document.createElement('div');
        panel.id = 'code-panel';
        panel.className = 'code-panel';
        panel.innerHTML = `
            <div class="code-panel-header">
                <div class="code-panel-title">
                    <i class="bi bi-code-square"></i>
                    <strong>${artifact.id}</strong>
                    ${language ? `<span class="badge bg-info ms-2">${language}</span>` : ''}
                    <small class="text-muted ms-2">(${code.split('\n').length} lines)</small>
                </div>
                <div class="code-panel-actions">
                    <button class="btn btn-sm btn-outline-secondary" onclick="window.artifactsPanel.copyCodeContent('${artifact.id}')" title="Copy Code">
                        <i class="bi bi-clipboard"></i> Copy
                    </button>
                    <button class="btn btn-sm btn-outline-info" onclick="window.artifactsPanel.downloadCode('${artifact.id}')" title="Download">
                        <i class="bi bi-download"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.artifactsPanel.closeCodePanel()" title="Close">
                        <i class="bi bi-x"></i>
                    </button>
                </div>
            </div>
            <div class="code-panel-content">
                <pre><code class="language-${language}">${this.escapeHtml(code)}</code></pre>
            </div>
        `;
        
        // Add backdrop and panel to page
        document.body.appendChild(backdrop);
        document.body.appendChild(panel);
        
        // Animate in
        setTimeout(() => {
            backdrop.classList.add('show');
            panel.classList.add('show');
            panel.classList.add('opening');
        }, 10);
        
        // Apply syntax highlighting if Prism is available
        if (window.Prism) {
            setTimeout(() => {
                const codeElement = panel.querySelector('code');
                if (codeElement) {
                    Prism.highlightElement(codeElement);
                }
            }, 100);
        }
        
        // Store current artifact for copy function
        this.currentCodeArtifact = artifact;
        
        // Add keyboard support
        this.addCodePanelKeyboardSupport();
        
        console.log('🔍 Code panel created and animated for:', artifact.id);
    }
    
    // Enhanced close with animation
    closeCodePanel() {
        const panel = document.getElementById('code-panel');
        const backdrop = document.getElementById('code-panel-backdrop');
        
        if (panel) {
            panel.classList.remove('show');
            setTimeout(() => panel.remove(), 300);
        }
        
        if (backdrop) {
            backdrop.classList.remove('show');
            setTimeout(() => backdrop.remove(), 300);
        }
        
        this.currentCodeArtifact = null;
        this.removeCodePanelKeyboardSupport();
    }
    
    // NEW: Download code functionality
    downloadCode(artifactId) {
        try {
            if (this.currentCodeArtifact && this.currentCodeArtifact.id === artifactId) {
                const code = this.currentCodeArtifact.code || this.currentCodeArtifact.content || '';
                const language = this.currentCodeArtifact.language || 'txt';
                const filename = `${artifactId.replace(/[^a-zA-Z0-9]/g, '_')}.${language}`;
                
                const blob = new Blob([code], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                if (window.chat && window.chat.ui) {
                    window.chat.ui.showToast(`Downloaded ${filename}`, 'success');
                }
            }
        } catch (error) {
            console.error('🔍 Error downloading code:', error);
            if (window.chat && window.chat.ui) {
                window.chat.ui.showToast('Failed to download code', 'error');
            }
        }
    }
    
    // NEW: Keyboard support for code panel
    addCodePanelKeyboardSupport() {
        this.keyboardHandler = (e) => {
            switch(e.key) {
                case 'Escape':
                    this.closeCodePanel();
                    break;
                case 'c':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (this.currentCodeArtifact) {
                            this.copyCodeContent(this.currentCodeArtifact.id);
                        }
                    }
                    break;
                case 'd':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (this.currentCodeArtifact) {
                            this.downloadCode(this.currentCodeArtifact.id);
                        }
                    }
                    break;
            }
        };
        
        document.addEventListener('keydown', this.keyboardHandler);
    }
    
    // Remove keyboard support
    removeCodePanelKeyboardSupport() {
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler);
            this.keyboardHandler = null;
        }
    }
    
    // NEW: Copy code content
    async copyCodeContent(artifactId) {
        try {
            if (this.currentCodeArtifact && this.currentCodeArtifact.id === artifactId) {
                const code = this.currentCodeArtifact.code || this.currentCodeArtifact.content || '';
                await navigator.clipboard.writeText(code);
                
                if (window.chat && window.chat.ui) {
                    window.chat.ui.showToast('Code copied to clipboard!', 'success');
                }
            }
        } catch (error) {
            console.error('🔍 Error copying code:', error);
            if (window.chat && window.chat.ui) {
                window.chat.ui.showToast('Failed to copy code', 'error');
            }
        }
    }
    
    // Filter artifacts based on search and type
    filterArtifacts() {
        const searchTerm = document.getElementById('artifact-search')?.value.toLowerCase() || '';
        const typeFilter = document.getElementById('artifact-type-filter')?.value || '';
        
        const artifactItems = document.querySelectorAll('.artifact-item');
        
        artifactItems.forEach(item => {
            const artifactId = item.dataset.artifactId.toLowerCase();
            const artifactType = item.dataset.artifactType;
            const contentPreview = item.querySelector('.artifact-content-preview')?.textContent.toLowerCase() || '';
            
            const matchesSearch = !searchTerm || 
                artifactId.includes(searchTerm) || 
                contentPreview.includes(searchTerm);
            
            const matchesType = !typeFilter || artifactType === typeFilter;
            
            if (matchesSearch && matchesType) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }
    
    // Copy artifact ID to clipboard
    copyArtifactId(artifactId) {
        navigator.clipboard.writeText(artifactId).then(() => {
            if (window.chat && window.chat.ui) {
                window.chat.ui.showToast('Artifact ID copied!', 'success');
            }
        }).catch(err => {
            console.error('Failed to copy artifact ID:', err);
            if (window.chat && window.chat.ui) {
                window.chat.ui.showToast('Failed to copy ID', 'error');
            }
        });
    }
    
    // Jump to artifact in chat
    jumpToArtifact(artifactId) {
        // Close the modal first
        if (this.modal) {
            this.modal.hide();
        }
        
        // Find the message element with this artifact ID
        const messageElement = document.querySelector(`[data-artifact-id="${artifactId}"]`);
        if (messageElement) {
            // Scroll to the element
            messageElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
            
            // Highlight the element temporarily
            messageElement.style.transition = 'background-color 0.3s ease';
            messageElement.style.backgroundColor = 'rgba(13, 110, 253, 0.2)';
            
            setTimeout(() => {
                messageElement.style.backgroundColor = '';
                setTimeout(() => {
                    messageElement.style.transition = '';
                }, 300);
            }, 1500);
            
            if (window.chat && window.chat.ui) {
                window.chat.ui.showToast(`Jumped to ${artifactId}`, 'info');
            }
        } else {
            if (window.chat && window.chat.ui) {
                window.chat.ui.showToast('Artifact not found in current view', 'warning');
            }
        }
    }
    
    // Utility function for debouncing
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // Utility function to escape HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize artifacts panel
window.artifactsPanel = new ChatArtifactsPanel();

// Initialize auto-close on outside click for desktop
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('code-panel');
        const clickedButton = e.target.closest('.code-block-btn, .code-block-overlay');
        
        if (panel && !panel.contains(e.target) && !clickedButton) {
            // Only auto-close on desktop
            if (window.innerWidth > 768) {
                window.artifactsPanel?.closeCodePanel();
            }
        }
    });
    
    console.log('🔍 Code panel auto-close initialized');
});