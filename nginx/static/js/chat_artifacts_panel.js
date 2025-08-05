// Artifact panel functionality - Redis Backend with admin/jai format
class ChatArtifactsPanel {
    constructor() {
        this.modal = null;
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
    
    // Refresh artifact panel data from Redis
    async refresh() {
        if (!window.chat || !window.chat.artifacts) return;
        
        try {
            await this.updateArtifactStats();
            await this.displayArtifacts();
        } catch (error) {
            console.error('Error refreshing artifact panel:', error);
        }
    }
    
    // Update artifact statistics from Redis
    async updateArtifactStats() {
        if (!window.chat || !window.chat.artifacts) return;
        
        try {
            const allArtifacts = await window.chat.artifacts.getAllArtifacts();
            
            // Count artifacts properly
            const messageArtifacts = allArtifacts.filter(a => !a.id.includes('_code('));
            const codeBlockArtifacts = allArtifacts.filter(a => a.id.includes('_code('));
            const adminMessages = allArtifacts.filter(a => a.type === 'admin' && !a.id.includes('_code('));
            const jaiMessages = allArtifacts.filter(a => a.type === 'jai' && !a.id.includes('_code('));
            
            const stats = {
                messages: messageArtifacts.length,
                adminMessages: adminMessages.length,
                jaiMessages: jaiMessages.length,
                codeBlocks: codeBlockArtifacts.length
            };
            
            // Update stats display
            const totalElement = document.getElementById('total-messages');
            const userElement = document.getElementById('user-messages');
            const aiElement = document.getElementById('ai-messages');
            const codeElement = document.getElementById('code-blocks');
            
            if (totalElement) totalElement.textContent = stats.messages || 0;
            if (userElement) userElement.textContent = stats.adminMessages || 0;
            if (aiElement) aiElement.textContent = stats.jaiMessages || 0;
            if (codeElement) codeElement.textContent = stats.codeBlocks || 0;
        } catch (error) {
            console.error('Error updating artifact stats:', error);
            
            // Reset to 0 on error
            const elements = ['total-messages', 'user-messages', 'ai-messages', 'code-blocks'];
            elements.forEach(id => {
                const element = document.getElementById(id);
                if (element) element.textContent = '0';
            });
        }
    }
    
    // Display artifacts in the panel from Redis
    async displayArtifacts() {
        const artifactList = document.getElementById('artifact-list');
        if (!artifactList || !window.chat || !window.chat.artifacts) return;
        
        try {
            const allArtifacts = await window.chat.artifacts.getAllArtifacts();
            
            if (allArtifacts.length === 0) {
                artifactList.innerHTML = `
                    <div class="text-center text-muted p-3">
                        <i class="bi bi-inbox"></i>
                        <p class="mb-0 mt-2">No artifacts found</p>
                    </div>
                `;
                return;
            }
            
            // Sort by creation time
            allArtifacts.sort((a, b) => a.timestamp - b.timestamp);
            
            artifactList.innerHTML = '';
            
            allArtifacts.forEach(artifact => {
                const artifactElement = this.createArtifactListItem(artifact);
                artifactList.appendChild(artifactElement);
            });
        } catch (error) {
            console.error('Error displaying artifacts:', error);
            artifactList.innerHTML = `
                <div class="text-center text-danger p-3">
                    <i class="bi bi-exclamation-triangle"></i>
                    <p class="mb-0 mt-2">Error loading artifacts</p>
                    <small>${error.message}</small>
                </div>
            `;
        }
    }
    
    // Create artifact list item element
    createArtifactListItem(artifact) {
        const item = document.createElement('div');
        item.className = 'artifact-item border rounded p-3 mb-2';
        item.dataset.artifactId = artifact.id;
        
        // FIXED: Determine if this is a code block by ID format, not by type field
        const isCodeBlock = artifact.id.includes('_code(');
        const displayType = isCodeBlock ? 'code_block' : artifact.type;
        
        item.dataset.artifactType = displayType;
        
        const typeIcon = this.getArtifactTypeIcon(displayType);
        const typeLabel = this.getArtifactTypeLabel(displayType);
        const timestamp = new Date(artifact.timestamp * 1000).toLocaleString();
        
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
                    <button class="btn btn-sm btn-outline-info" onclick="window.artifactsPanel.copyArtifactContent('${artifact.id}')" title="Copy Content">
                        <i class="bi bi-files"></i>
                    </button>
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
            </div>
        `;
        
        return item;
    }
    
    // Get icon for artifact type (updated for admin/jai)
    getArtifactTypeIcon(type) {
        switch (type) {
            case 'admin': return 'bi-person-circle-fill text-primary';
            case 'jai': return 'bi-robot text-success';
            case 'code_block': return 'bi-code-square text-warning';
            default: return 'bi-question-circle';
        }
    }
    
    // Get label for artifact type (updated for admin/jai)
    getArtifactTypeLabel(type) {
        switch (type) {
            case 'admin': return 'Admin';
            case 'jai': return 'JAI';
            case 'code_block': return 'Code';
            default: return 'Unknown';
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
    
    // Copy artifact content to clipboard
    async copyArtifactContent(artifactId) {
        try {
            const artifact = await window.chat?.getArtifactReference(artifactId);
            if (artifact) {
                const content = artifact.code || artifact.content || '';
                await navigator.clipboard.writeText(content);
                
                if (window.chat && window.chat.ui) {
                    window.chat.ui.showToast('Artifact content copied!', 'success');
                }
            } else {
                if (window.chat && window.chat.ui) {
                    window.chat.ui.showToast('Artifact not found', 'warning');
                }
            }
        } catch (error) {
            console.error('Failed to copy artifact content:', error);
            if (window.chat && window.chat.ui) {
                window.chat.ui.showToast('Failed to copy content', 'error');
            }
        }
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