// Global functions for UI interactions

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chat = new InternalChat();
});

// Chat management functions
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
        
        // Clear artifacts for this chat
        window.chat.clearCurrentChatArtifacts();
        
        // Clear UI
        const messagesContainer = document.getElementById('messages-content');
        const welcomePrompt = document.getElementById('welcome-prompt');
        
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
        if (welcomePrompt) {
            welcomePrompt.style.display = 'block';
        }
        
        window.chat.ui.updateChatList();
        window.chat.saveChatToStorage(chat);
        window.chat.saveChatList();
        
        console.log('Current chat and artifacts cleared');
    }
}

function refreshChatList() {
    if (window.chat) {
        window.chat.loadChatList();
        window.chat.ui.updateChatList();
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

// File upload functions
function clearAllFiles() {
    if (window.chat && window.chat.fileUpload) {
        window.chat.fileUpload.clearAllFiles();
    }
}

// Chat options functions
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

// Artifact management functions
function showArtifactPanel() {
    if (window.artifactsPanel) {
        window.artifactsPanel.show();
    }
}

function refreshArtifactPanel() {
    if (window.artifactsPanel) {
        window.artifactsPanel.refresh();
    }
}

function exportChatArtifacts() {
    if (window.chat) {
        window.chat.exportChatArtifacts();
    }
}

function searchChatArtifacts(query, type = null) {
    if (window.chat) {
        return window.chat.searchArtifacts(query, type);
    }
    return [];
}

function getArtifactById(artifactId) {
    if (window.chat) {
        return window.chat.getArtifactReference(artifactId);
    }
    return null;
}

function showArtifactInfo(artifactId) {
    const artifact = getArtifactById(artifactId);
    if (artifact) {
        console.log('Artifact Info:', artifact);
        alert(`Artifact: ${artifact.id}\nType: ${artifact.type}\nTimestamp: ${new Date(artifact.timestamp).toLocaleString()}\nContent Length: ${(artifact.content || artifact.code || '').length} characters`);
    } else {
        alert(`Artifact with ID "${artifactId}" not found.`);
    }
}