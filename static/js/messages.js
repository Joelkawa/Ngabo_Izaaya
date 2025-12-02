// Messages App JavaScript

class MessagesApp {
    constructor() {
        this.currentUser = null;
        this.currentConversation = null;
        this.conversations = [];
        this.onlineUsers = [];
        this.allUsers = [];
        this.isTyping = false;
        this.typingTimeout = null;
        this.pollingInterval = null;
        this.statusPollingInterval = null;
        this.lastMessageCheck = new Date();
        this.selectedMessage = null;
        this.currentImageData = null;
        this.currentAudioData = null;
        this.mediaStream = null;
        this.recordingStartTime = null;
        this.recordingTimer = null;
        this.initialize();
    }

    initialize() {
        console.log('Messages App Initialized');
        this.checkAuthentication();
    }

    async checkAuthentication() {
        try {
            const token = localStorage.getItem('family_token');
            if (!token) {
                this.redirectToLogin();
                return;
            }

            const response = await fetch('/api/v1/auth/users/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                this.currentUser = await response.json();
                console.log('User authenticated:', this.currentUser);
                this.setupEventListeners();
                this.loadData();
                this.startPolling();
                this.setupUserSelectionEvents();
            } else {
                this.redirectToLogin();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.redirectToLogin();
        }
    }

    redirectToLogin() {
        this.showNotification('Please login to access messages', 'error');
        setTimeout(() => {
            window.location.href = '/login';
        }, 1500);
    }

    async loadData() {
        try {
            await Promise.all([
                this.loadConversations(),
                this.loadOnlineUsers(),
                this.loadAllUsers()
            ]);
        } catch (error) {
            console.error('Error loading data:', error);
            this.showNotification('Failed to load data', 'error');
        }
    }

    async loadAllUsers() {
        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch('/api/v1/auth/users?limit=100', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const usersList = Array.isArray(data) ? data : (data.items || []);
                this.allUsers = usersList.filter(user => user.id !== this.currentUser.id);
                console.log('Loaded all users:', this.allUsers.length);
                
                if (document.getElementById('newConversationModal')?.classList.contains('active')) {
                    this.renderUserSelect();
                }
            }
        } catch (error) {
            console.error('Error loading users:', error);
            this.showNotification('Failed to load users', 'error');
        }
    }

    async loadConversations() {
        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch('/api/v1/messages/conversations', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.conversations = data.items;
                this.renderConversations();
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
            this.showNotification('Failed to load conversations', 'error');
        }
    }

    async loadOnlineUsers() {
        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch('/api/v1/messages/status/online', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.onlineUsers = data.items;
                this.renderOnlineUsers();
                this.updateUserListStatus();
            }
        } catch (error) {
            console.error('Error loading online users:', error);
        }
    }

    async updateUserStatus(status) {
        try {
            const token = localStorage.getItem('family_token');
            await fetch('/api/v1/messages/status', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            });
        } catch (error) {
            console.error('Error updating status:', error);
        }
    }

    startPolling() {
        // Update user status to online
        this.updateUserStatus('ONLINE');
        
        // Start polling for new messages and online status
        this.pollingInterval = setInterval(() => {
            this.pollForUpdates();
        }, 5000); // Poll every 5 seconds
        
        // Update online status periodically
        this.statusPollingInterval = setInterval(() => {
            this.updateUserStatus('ONLINE');
        }, 30000); // Update status every 30 seconds
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
        }
    }

    async pollForUpdates() {
        try {
            // Poll for new messages in current conversation
            if (this.currentConversation) {
                await this.pollForNewMessages();
            }
            
            // Poll for new conversations and online status
            await Promise.all([
                this.pollForNewConversations(),
                this.loadOnlineUsers()
            ]);
        } catch (error) {
            console.error('Polling error:', error);
        }
    }

    async pollForNewMessages() {
        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch(`/api/v1/messages/conversations/${this.currentConversation.id}/messages/new?since=${this.lastMessageCheck.toISOString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.items.length > 0) {
                    // Add new messages to UI
                    data.items.forEach(message => {
                        this.addMessageToUI(message);
                    });
                    this.lastMessageCheck = new Date();
                    
                    // Show notification for new messages not from current user
                    const newMessagesFromOthers = data.items.filter(msg => msg.sender_id !== this.currentUser.id);
                    if (newMessagesFromOthers.length > 0 && !document.hasFocus()) {
                        const senderName = newMessagesFromOthers[0].sender_name || 'Someone';
                        this.showNotification(`New message from ${senderName}`, 'info');
                    }
                }
            }
        } catch (error) {
            console.error('Error polling for new messages:', error);
        }
    }

    async pollForNewConversations() {
        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch('/api/v1/messages/conversations', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const oldCount = this.conversations.length;
                this.conversations = data.items;
                
                // If new conversation was added, refresh the list
                if (this.conversations.length > oldCount) {
                    this.renderConversations();
                    this.showNotification('New conversation available', 'info');
                }
            }
        } catch (error) {
            console.error('Error polling for conversations:', error);
        }
    }

    async sendTypingIndicator(isTyping) {
        if (!this.currentConversation) return;

        this.isTyping = isTyping;
        
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }
        
        if (isTyping) {
            this.typingTimeout = setTimeout(() => {
                this.sendTypingIndicator(false);
            }, 3000);
        }
        
        try {
            const token = localStorage.getItem('family_token');
            await fetch('/api/v1/messages/typing', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    conversation_id: this.currentConversation.id,
                    is_typing: isTyping
                })
            });
        } catch (error) {
            console.error('Error sending typing indicator:', error);
        }
    }

    async sendMessage(content, messageType = 'text', mediaData = null) {
        if (!this.currentConversation) {
            this.showNotification('Please select a conversation first', 'error');
            return;
        }

        if (!content && !mediaData) {
            return;
        }

        try {
            const token = localStorage.getItem('family_token');
            const messageData = {
                conversation_id: this.currentConversation.id,
                message_type: messageType,
                content: content,
                media_data: mediaData
            };

            const response = await fetch('/api/v1/messages/messages', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(messageData)
            });

            if (response.ok) {
                const message = await response.json();
                
                // Add message to UI immediately
                this.addMessageToUI(message);
                
                // Clear input
                const messageInput = document.getElementById('messageInput');
                if (messageInput) messageInput.value = '';
                
                // Send typing stop
                this.sendTypingIndicator(false);
                
                // Update last message check time
                this.lastMessageCheck = new Date();
            } else {
                throw new Error('Failed to send message');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.showNotification('Failed to send message', 'error');
        }
    }

    async loadMessages() {
        if (!this.currentConversation) return;

        const messagesArea = document.getElementById('messagesArea');
        const loading = document.getElementById('messagesLoading');
        
        messagesArea.innerHTML = '';
        loading.classList.remove('hidden');
        
        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch(`/api/v1/messages/conversations/${this.currentConversation.id}/messages?limit=50`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.renderMessages(data.items);
                this.lastMessageCheck = new Date();
            }
        } catch (error) {
            console.error('Error loading messages:', error);
            this.showNotification('Failed to load messages', 'error');
        } finally {
            loading.classList.add('hidden');
        }
    }

    renderConversations() {
        const container = document.getElementById('conversationsList');
        if (!container) return;

        if (this.conversations.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-comments text-3xl mb-4"></i>
                    <p>No conversations yet</p>
                    <button class="btn btn-outline mt-4" id="btnStartFirstChat">
                        Start your first conversation
                    </button>
                </div>
            `;
            
            document.getElementById('btnStartFirstChat')?.addEventListener('click', () => {
                this.openModal('newConversationModal');
            });
            return;
        }

        container.innerHTML = this.conversations.map(conv => this.createConversationItem(conv)).join('');
        
        // Add click handlers
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.addEventListener('click', () => {
                const conversationId = parseInt(item.dataset.conversationId);
                this.selectConversation(conversationId);
            });
        });
    }

    createConversationItem(conversation) {
        const lastMessage = conversation.last_message?.content || 'No messages yet';
        const unread = conversation.unread_count > 0;
        const isActive = this.currentConversation?.id === conversation.id;
        
        // Get conversation name (group name or other participant's name)
        let name = conversation.name || 'Group Chat';
        let avatarIcon = 'fas fa-users';
        
        if (conversation.conversation_type === 'DIRECT' && conversation.participants) {
            const otherParticipant = conversation.participants.find(p => p.user_id !== this.currentUser.id);
            if (otherParticipant) {
                name = otherParticipant.user_name || 'Unknown User';
                avatarIcon = 'fas fa-user';
            }
        }

        // Format last message time
        const time = conversation.last_message ? 
            this.formatMessageTime(conversation.last_message.created_at) : '';

        return `
            <div class="conversation-item ${isActive ? 'active' : ''}" data-conversation-id="${conversation.id}">
                <div class="conversation-avatar">
                    <i class="${avatarIcon}"></i>
                </div>
                <div class="conversation-info">
                    <div class="conversation-name">${this.escapeHtml(name)}</div>
                    <div class="conversation-last-message ${unread ? 'font-semibold text-gray-900' : ''}">
                        ${this.escapeHtml(lastMessage)}
                    </div>
                </div>
                <div class="conversation-meta">
                    <div class="conversation-time">${time}</div>
                    ${unread ? `<div class="conversation-unread">${conversation.unread_count}</div>` : ''}
                </div>
            </div>
        `;
    }

    renderOnlineUsers() {
        const container = document.getElementById('onlineUsers');
        if (!container) return;

        container.innerHTML = this.onlineUsers.map(user => `
            <div class="online-user">
                <div class="online-user-avatar">
                    ${this.getUserInitials(user.user_name)}
                </div>
                <div class="online-user-name">${this.escapeHtml(user.user_name)}</div>
            </div>
        `).join('');
    }

    renderUserSelect() {
        const participantsSelect = document.getElementById('participantsSelect');
        
        if (participantsSelect) {
            participantsSelect.innerHTML = '';
            
            // Create search input for group chat participants
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.id = 'participantSearchInput';
            searchInput.placeholder = 'Search family members...';
            searchInput.className = 'participant-search-input';
            searchInput.addEventListener('input', (e) => this.filterParticipants(e.target.value));
            
            participantsSelect.appendChild(searchInput);
            
            // Create container for checkboxes
            const checkboxesContainer = document.createElement('div');
            checkboxesContainer.className = 'participants-checkbox-container';
            checkboxesContainer.id = 'participantsCheckboxContainer';
            participantsSelect.appendChild(checkboxesContainer);
            
            // Render all users in checkbox container
            this.renderParticipantCheckboxes();
            
            // Initialize selected count
            this.updateSelectedCount();
        }
        
        // Setup enhanced user search for direct messages
        this.setupEnhancedUserSearch();
    }

    setupEnhancedUserSearch() {
        const select = document.getElementById('selectUser');
        if (!select) return;
        
        // Create a search wrapper if it doesn't exist
        let searchWrapper = document.querySelector('.user-search-wrapper');
        if (!searchWrapper) {
            searchWrapper = document.createElement('div');
            searchWrapper.className = 'user-search-wrapper';
            searchWrapper.innerHTML = `
                <input type="text" id="userSearchInput" placeholder="Search by name or email..." class="user-search-input">
                <div class="search-results" id="userSearchResults"></div>
            `;
            
            const selectContainer = select.parentNode;
            selectContainer.insertBefore(searchWrapper, select);
            select.style.display = 'none';
        }
        
        const searchInput = document.getElementById('userSearchInput');
        const searchResults = document.getElementById('userSearchResults');
        
        if (!searchInput || !searchResults) return;
        
        // Clear previous listeners
        searchInput.replaceWith(searchInput.cloneNode(true));
        const newSearchInput = document.getElementById('userSearchInput');
        
        newSearchInput.addEventListener('input', debounce(() => {
            const query = newSearchInput.value.toLowerCase().trim();
            
            if (!query) {
                searchResults.style.display = 'none';
                return;
            }
            
            const results = this.allUsers.filter(user => 
                user.name.toLowerCase().includes(query) ||
                user.email?.toLowerCase().includes(query)
            );
            
            this.displayUserSearchResults(results, searchResults, newSearchInput, select);
        }, 300));
        
        // Show all users on focus
        newSearchInput.addEventListener('focus', () => {
            const query = newSearchInput.value.toLowerCase().trim();
            const results = query 
                ? this.allUsers.filter(user => 
                    user.name.toLowerCase().includes(query) ||
                    user.email?.toLowerCase().includes(query)
                  )
                : this.allUsers;
            
            this.displayUserSearchResults(results, searchResults, newSearchInput, select);
        });
        
        // Hide results on click outside
        document.addEventListener('click', (e) => {
            if (!searchWrapper.contains(e.target)) {
                searchResults.style.display = 'none';
            }
        });
        
        // Clear search when modal opens
        newSearchInput.value = '';
        searchResults.style.display = 'none';
    }

    displayUserSearchResults(results, resultsContainer, searchInput, originalSelect) {
        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="search-result-item no-results">
                    <i class="fas fa-search"></i>
                    <div>
                        <div class="search-result-name">No users found</div>
                        <div class="search-result-email">Try different search terms</div>
                    </div>
                </div>
            `;
            resultsContainer.style.display = 'block';
            return;
        }
        
        resultsContainer.innerHTML = results.map(user => {
            const isOnline = this.onlineUsers.some(online => online.user_id === user.id);
            return `
                <div class="search-result-item" data-user-id="${user.id}">
                    <div class="search-result-avatar">
                        ${this.getUserInitials(user.name)}
                    </div>
                    <div class="search-result-info">
                        <div class="search-result-name">
                            ${this.escapeHtml(user.name)}
                            <span class="search-result-status ${isOnline ? 'online' : 'offline'}">
                                ${isOnline ? '●' : '○'}
                            </span>
                        </div>
                        <div class="search-result-email">${user.email || 'No email'}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        resultsContainer.style.display = 'block';
        
        // Add click handlers
        resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const userId = item.dataset.userId;
                const user = this.allUsers.find(u => u.id == userId);
                
                if (user) {
                searchInput.value = user.name;
                
                // --- FIX STARTS HERE ---
                // Create the option if it doesn't exist so the value can be set
                if (originalSelect) {
                    originalSelect.innerHTML = ''; // Clear old options
                    const option = document.createElement('option');
                    option.value = userId;
                    option.text = user.name;
                    originalSelect.appendChild(option);
                    originalSelect.value = userId; // Now this works
                }
            }
            });
        });
    }

    renderParticipantCheckboxes(filterText = '') {
        const container = document.getElementById('participantsCheckboxContainer');
        if (!container) return;
        
        const filteredUsers = filterText 
            ? this.allUsers.filter(user => 
                user.name.toLowerCase().includes(filterText.toLowerCase()) ||
                user.email?.toLowerCase().includes(filterText.toLowerCase())
              )
            : this.allUsers;
        
        if (filteredUsers.length === 0) {
            container.innerHTML = '<div class="no-users-found">No users found</div>';
            return;
        }
        
        container.innerHTML = filteredUsers.map(user => {
            const isOnline = this.onlineUsers.some(online => online.user_id === user.id);
            return `
                <div class="participant-checkbox">
                    <input type="checkbox" id="user-${user.id}" value="${user.id}" class="participant-checkbox-input">
                    <label for="user-${user.id}">
                        <span class="participant-name">${this.escapeHtml(user.name)}</span>
                        <span class="participant-status ${isOnline ? 'online' : 'offline'}">
                            ${isOnline ? '● Online' : '○ Offline'}
                        </span>
                    </label>
                </div>
            `;
        }).join('');
        
        // Add change listeners to update count and show selected users
        container.querySelectorAll('.participant-checkbox-input').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateSelectedCount();
                this.updateSelectedParticipantsList();
            });
        });
    }

    filterParticipants(searchText) {
        this.renderParticipantCheckboxes(searchText);
    }

    showSelectedUserInfo(user) {
        // Remove existing info if any
        const existingInfo = document.getElementById('selectedUserInfo');
        if (existingInfo) existingInfo.remove();
        
        const infoDiv = document.createElement('div');
        infoDiv.id = 'selectedUserInfo';
        infoDiv.className = 'selected-user-info';
        
        const isOnline = this.onlineUsers.some(online => online.user_id === user.id);
        
        infoDiv.innerHTML = `
            <div class="selected-user-header">
                <h4>Selected User</h4>
                <button class="btn-clear-selection" id="btnClearSelection">Clear</button>
            </div>
            <div class="selected-user-details">
                <div class="selected-user-avatar">
                    ${this.getUserInitials(user.name)}
                </div>
                <div>
                    <div class="selected-user-name">${this.escapeHtml(user.name)}</div>
                    <div class="selected-user-status ${isOnline ? 'online' : 'offline'}">
                        ${isOnline ? '● Online' : '○ Offline'}
                    </div>
                    <div class="selected-user-email">${user.email || 'No email'}</div>
                </div>
            </div>
        `;
        
        const directTab = document.getElementById('directTab');
        if (directTab) {
            directTab.appendChild(infoDiv);
        }
        
        document.getElementById('btnClearSelection')?.addEventListener('click', () => {
            this.clearUserSelection();
        });
    }

    clearUserSelection() {
        const searchInput = document.getElementById('userSearchInput');
        const select = document.getElementById('selectUser');
        const infoDiv = document.getElementById('selectedUserInfo');
        
        if (searchInput) {
            searchInput.value = '';
            searchInput.classList.remove('selected');
        }
        
        if (select) {
            select.value = '';
        }
        
        if (infoDiv) {
            infoDiv.remove();
        }
    }

    updateSelectedCount() {
        const selected = document.querySelectorAll('.participant-checkbox-input:checked').length;
        document.getElementById('selectedCount').textContent = selected;
        
        // Update button text based on selection
        const startButton = document.querySelector('#newConversationForm button[type="submit"]');
        if (startButton && selected > 0) {
            startButton.innerHTML = `<i class="fas fa-comment"></i> Start Group Chat (${selected})`;
        } else if (startButton) {
            startButton.innerHTML = `<i class="fas fa-comment"></i> Start Chat`;
        }
    }

    updateSelectedParticipantsList() {
        const selectedUsers = Array.from(document.querySelectorAll('.participant-checkbox-input:checked'))
            .map(cb => {
                const userId = parseInt(cb.value);
                return this.allUsers.find(u => u.id === userId);
            })
            .filter(user => user);
        
        const summaryDiv = document.getElementById('selectedParticipantsSummary');
        const listDiv = document.getElementById('selectedParticipantsList');
        
        if (!summaryDiv || !listDiv) return;
        
        if (selectedUsers.length > 0) {
            summaryDiv.classList.remove('hidden');
            listDiv.innerHTML = selectedUsers.map(user => `
                <div class="selected-participant-tag">
                    <span>${this.escapeHtml(user.name)}</span>
                    <button type="button" onclick="messagesApp.unselectParticipant(${user.id})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');
        } else {
            summaryDiv.classList.add('hidden');
            listDiv.innerHTML = '';
        }
    }

    unselectParticipant(userId) {
        const checkbox = document.getElementById(`user-${userId}`);
        if (checkbox) {
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change'));
        }
    }

    async selectConversation(conversationId) {
        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch(`/api/v1/messages/conversations/${conversationId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                this.currentConversation = await response.json();
                this.renderActiveChat();
                this.loadMessages();
                this.updateUI();
                
                // Update conversation list highlight
                document.querySelectorAll('.conversation-item').forEach(item => {
                    item.classList.toggle('active', 
                        parseInt(item.dataset.conversationId) === conversationId
                    );
                });
            }
        } catch (error) {
            console.error('Error selecting conversation:', error);
            this.showNotification('Failed to load conversation', 'error');
        }
    }

    renderActiveChat() {
        if (!this.currentConversation) {
            document.getElementById('chatWelcome').classList.remove('hidden');
            document.getElementById('activeChat').classList.add('hidden');
            return;
        }

        document.getElementById('chatWelcome').classList.add('hidden');
        document.getElementById('activeChat').classList.remove('hidden');

        // Set chat header info
        const name = this.currentConversation.name || 
            this.currentConversation.participants
                .filter(p => p.user_id !== this.currentUser.id)
                .map(p => p.user_name)
                .join(', ');
        
        const status = this.getChatStatus();
        
        document.getElementById('chatName').textContent = name;
        document.getElementById('chatStatus').textContent = status;
        document.getElementById('chatAvatar').innerHTML = 
            `<i class="${this.currentConversation.conversation_type === 'DIRECT' ? 'fas fa-user' : 'fas fa-users'}"></i>`;
    }

    getChatStatus() {
        if (!this.currentConversation) return '';
        
        if (this.currentConversation.conversation_type === 'DIRECT') {
            const otherUser = this.currentConversation.participants.find(p => p.user_id !== this.currentUser.id);
            if (otherUser) {
                const online = this.onlineUsers.find(u => u.user_id === otherUser.user_id);
                return online ? 'Online' : 'Offline';
            }
        }
        
        const onlineCount = this.currentConversation.participants.filter(p => 
            this.onlineUsers.find(u => u.user_id === p.user_id)
        ).length;
        
        return `${onlineCount} online • ${this.currentConversation.participants.length} members`;
    }

    renderMessages(messages) {
        const container = document.getElementById('messagesArea');
        
        // Group messages by date
        const groupedMessages = this.groupMessagesByDate(messages);
        
        let html = '';
        
        groupedMessages.forEach(group => {
            html += `
                <div class="message-group">
                    <div class="message-group-date">
                        <span>${this.formatDate(group.date)}</span>
                    </div>
                    ${group.messages.map(msg => this.createMessageElement(msg)).join('')}
                </div>
            `;
        });
        
        container.innerHTML = html;
        
        // Scroll to bottom
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
        
        // Add message event listeners
        this.setupMessageEventListeners();
    }

    createMessageElement(message) {
        const isSent = message.sender_id === this.currentUser.id;
        const senderName = isSent ? 'You' : (message.sender_name || 'Unknown');
        const time = this.formatMessageTime(message.created_at);
        
        let contentHtml = '';
        
        switch (message.message_type) {
            case 'text':
                contentHtml = `<div class="message-content">${this.escapeHtml(message.content)}</div>`;
                break;
            case 'image':
                contentHtml = `
                    <div class="message-media">
                        <img src="data:image/jpeg;base64,${message.media_data || ''}" 
                             alt="Image" 
                             onclick="messagesApp.previewImage(this.src)">
                    </div>
                `;
                break;
            case 'voice':
                contentHtml = `
                    <div class="voice-message">
                        <button class="voice-play-btn" onclick="messagesApp.playVoiceMessage(this)">
                            <i class="fas fa-play"></i>
                        </button>
                        <div class="voice-progress">
                            <div class="voice-progress-bar"></div>
                        </div>
                        <div class="voice-duration">${Math.floor(message.media_duration / 60)}:${String(message.media_duration % 60).padStart(2, '0')}</div>
                    </div>
                `;
                break;
            default:
                contentHtml = `<div class="message-content">${this.escapeHtml(message.content || 'Unsupported message type')}</div>`;
        }
        
        // Add reply if exists
        let replyHtml = '';
        if (message.replied_to_message) {
            replyHtml = `
                <div class="message-reply" onclick="messagesApp.scrollToMessage(${message.replied_to_message.id})">
                    <div class="reply-sender">${message.replied_to_message.sender_name}</div>
                    <div class="reply-content">${this.escapeHtml(message.replied_to_message.content || 'Media message')}</div>
                </div>
            `;
        }
        
        // Read receipts
        let readReceiptHtml = '';
        if (isSent && message.status === 'read') {
            readReceiptHtml = `<span class="message-read"><i class="fas fa-check-double"></i></span>`;
        } else if (isSent && message.status === 'sent') {
            readReceiptHtml = `<span class="message-sent"><i class="fas fa-check"></i></span>`;
        }
        
        return `
            <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" data-timestamp="${message.created_at}">
                <div class="message-bubble">
                    ${replyHtml}
                    ${contentHtml}
                    <div class="message-meta">
                        <span class="message-time">${time}</span>
                        ${readReceiptHtml}
                    </div>
                </div>
            </div>
        `;
    }

    addMessageToUI(message) {
        const container = document.getElementById('messagesArea');
        const messageElement = this.createMessageElement(message);
        
        // Check if we need to add a date separator
        const lastMessageGroup = container.querySelector('.message-group:last-child');
        const lastMessage = lastMessageGroup?.querySelector('.message:last-child');
        
        if (lastMessage) {
            const lastMessageDate = new Date(lastMessage.dataset.timestamp);
            const newMessageDate = new Date(message.created_at);
            
            if (this.isSameDay(lastMessageDate, newMessageDate)) {
                // Same day, add to existing group
                lastMessageGroup.insertAdjacentHTML('beforeend', messageElement);
            } else {
                // New day, create new group
                container.insertAdjacentHTML('beforeend', `
                    <div class="message-group">
                        <div class="message-group-date">
                            <span>${this.formatDate(newMessageDate)}</span>
                        </div>
                        ${messageElement}
                    </div>
                `);
            }
        } else {
            // First message
            container.innerHTML = `
                <div class="message-group">
                    <div class="message-group-date">
                        <span>${this.formatDate(new Date(message.created_at))}</span>
                    </div>
                    ${messageElement}
                </div>
            `;
        }
        
        // Scroll to bottom
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }

    async startNewConversation(userIds, isGroup = false, groupName = '') {
        try {
            const token = localStorage.getItem('family_token');
            const conversationData = {
                conversation_type: isGroup ? 'GROUP' : 'DIRECT',
                participant_ids: userIds,
                name: isGroup ? groupName : undefined
            };

            const response = await fetch('/api/v1/messages/conversations', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(conversationData)
            });

           if (response.ok) {
                const conversation = await response.json();
                this.showNotification('Conversation created!', 'success');
                this.closeModal('newConversationModal');
                this.selectConversation(conversation.id);
                this.loadConversations();
                this.resetNewConversationForm();
            } else {
                const error = await response.json();
                
                // Handle FastAPI/Pydantic validation errors (Arrays)
                let errorMessage = 'Failed to create conversation';
                if (error.detail) {
                    if (Array.isArray(error.detail)) {
                        // Join multiple validation errors into one string
                        errorMessage = error.detail.map(e => e.msg).join(', ');
                    } else if (typeof error.detail === 'string') {
                        errorMessage = error.detail;
                    } else {
                        errorMessage = JSON.stringify(error.detail);
                    }
                }
                throw new Error(errorMessage.value);
            }
        } catch (error) {
            console.error('Error creating conversation:', error);
            this.showNotification(error.message || 'Failed to create conversation', 'error');
        }
    }

    resetNewConversationForm() {
        // Clear search inputs
        const searchInput = document.getElementById('userSearchInput');
        if (searchInput) {
            searchInput.value = '';
            searchInput.classList.remove('selected');
        }
        
        // Clear select
        const select = document.getElementById('selectUser');
        if (select) select.value = '';
        
        // Clear selected user info
        const infoDiv = document.getElementById('selectedUserInfo');
        if (infoDiv) infoDiv.remove();
        
        // Clear group chat fields
        const groupName = document.getElementById('groupName');
        if (groupName) groupName.value = '';
        
        const participantSearch = document.getElementById('participantSearchInput');
        if (participantSearch) participantSearch.value = '';
        
        document.querySelectorAll('.participant-checkbox-input').forEach(cb => {
            cb.checked = false;
        });
        this.updateSelectedCount();
        this.updateSelectedParticipantsList();
        
        // Reset to direct message tab
        this.switchTab('DIRECT');
    }

    handleNewConversation() {
        const activeTab = document.querySelector('.tab-button.active').dataset.tab;
        
        if (activeTab === 'DIRECT') {
            const select = document.getElementById('selectUser');
            const userId = select.value;
            
            if (!userId) {
                this.showNotification('Please select a user', 'error');
                return;
            }
            
            this.startNewConversation([parseInt(userId)], false);
        } else {
            const groupName = document.getElementById('groupName').value;
            if (!groupName.trim()) {
                this.showNotification('Please enter a group name', 'error');
                return;
            }
            
            const selectedUsers = Array.from(document.querySelectorAll('.participant-checkbox-input:checked'))
                .map(cb => parseInt(cb.value));
            
            if (selectedUsers.length === 0) {
                this.showNotification('Please select at least one participant', 'error');
                return;
            }
            
            this.startNewConversation(selectedUsers, true, groupName.trim());
        }
    }

    setupEventListeners() {
        // New conversation button
        document.getElementById('btnNewConversation')?.addEventListener('click', () => {
            this.openModal('newConversationModal');
        });
        
        document.getElementById('btnStartNewChat')?.addEventListener('click', () => {
            this.openModal('newConversationModal');
        });

        // Close chat
        document.getElementById('btnCloseChat')?.addEventListener('click', () => {
            this.currentConversation = null;
            this.updateUI();
        });

        // Message input
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.addEventListener('input', () => {
                if (messageInput.value.trim() && !this.isTyping) {
                    this.sendTypingIndicator(true);
                } else if (!messageInput.value.trim() && this.isTyping) {
                    this.sendTypingIndicator(false);
                }
            });
            
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
        }

        // Send button
        document.getElementById('btnSend')?.addEventListener('click', () => {
            this.handleSendMessage();
        });

        // Modal controls
        document.getElementById('closeNewConversationModal')?.addEventListener('click', () => {
            this.closeModal('newConversationModal');
        });
        
        document.getElementById('cancelNewConversation')?.addEventListener('click', () => {
            this.closeModal('newConversationModal');
        });

        // Form submission
        document.getElementById('newConversationForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleNewConversation();
        });

        // Tab switching
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                const tab = button.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Attachment buttons
        document.getElementById('btnImage')?.addEventListener('click', () => {
            this.openImagePicker();
        });
        
        document.getElementById('btnVoice')?.addEventListener('click', () => {
            this.openVoiceRecorder();
        });

        // Chat info
        document.getElementById('btnChatInfo')?.addEventListener('click', () => {
            this.toggleChatInfo();
        });
        
        document.getElementById('btnCloseInfo')?.addEventListener('click', () => {
            this.toggleChatInfo();
        });

        // Search conversations
        const searchInput = document.getElementById('conversationSearch');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(() => {
                this.searchConversations(searchInput.value);
            }, 300));
        }

        // Close modals on overlay click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
                this.toggleChatInfo(false);
            }
            if (e.key === 'Enter' && e.ctrlKey) {
                this.openModal('newConversationModal');
            }
        });

        // Modal open event - load users when modal opens
        document.getElementById('newConversationModal')?.addEventListener('modal-open', () => {
            if (this.allUsers.length === 0) {
                this.loadAllUsers();
            } else {
                this.renderUserSelect();
            }
        });

        // Before unload event to update status and stop polling
        window.addEventListener('beforeunload', () => {
            this.updateUserStatus('OFFLINE');
            this.stopPolling();
        });
    }

    setupUserSelectionEvents() {
        // Real-time updates for online status
        setInterval(() => {
            this.loadOnlineUsers();
        }, 30000); // Every 30 seconds
    }

    updateUserListStatus() {
        // Update search results with current online status
        const searchResults = document.getElementById('userSearchResults');
        if (searchResults && searchResults.style.display !== 'none') {
            const query = document.getElementById('userSearchInput')?.value || '';
            const results = query 
                ? this.allUsers.filter(user => 
                    user.name.toLowerCase().includes(query.toLowerCase()) ||
                    user.email?.toLowerCase().includes(query.toLowerCase())
                  )
                : this.allUsers;
            
            this.displayUserSearchResults(results, searchResults);
        }
        
        // Update participant checkboxes
        const participantSearch = document.getElementById('participantSearchInput');
        this.renderParticipantCheckboxes(participantSearch?.value || '');
        
        // Update selected user info if showing
        const infoDiv = document.getElementById('selectedUserInfo');
        if (infoDiv) {
            const userId = document.getElementById('selectUser')?.value;
            if (userId) {
                const user = this.allUsers.find(u => u.id == userId);
                if (user) {
                    this.showSelectedUserInfo(user);
                }
            }
        }
    }

    handleSendMessage() {
        const messageInput = document.getElementById('messageInput');
        const content = messageInput.value.trim();
        
        if (content) {
            this.sendMessage(content, 'text');
            messageInput.value = '';
            messageInput.focus();
        }
    }

    openImagePicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                this.previewImageFile(file);
            }
        };
        input.click();
    }

    async previewImageFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('previewImage').src = e.target.result;
            this.currentImageData = e.target.result.split(',')[1];
            this.openModal('imagePreviewModal');
        };
        reader.readAsDataURL(file);
    }

    previewImage(src) {
        document.getElementById('previewImage').src = src;
        this.openModal('imagePreviewModal');
    }

    async sendImage() {
        if (!this.currentImageData) return;
        
        await this.sendMessage('', 'image', this.currentImageData);
        this.closeModal('imagePreviewModal');
        this.currentImageData = null;
    }

    async openVoiceRecorder() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaStream = stream;
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (e) => {
                this.audioChunks.push(e.data);
            };
            
            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.currentAudioData = e.target.result.split(',')[1];
                    document.getElementById('sendVoiceMessage').disabled = false;
                };
                reader.readAsDataURL(audioBlob);
            };
            
            this.openModal('voiceRecorderModal');
            
            // Setup voice recorder controls
            this.setupVoiceRecorderControls();
        } catch (error) {
            console.error('Error accessing microphone:', error);
            this.showNotification('Microphone access denied', 'error');
        }
    }

    setupVoiceRecorderControls() {
        document.getElementById('btnRecord').addEventListener('click', () => this.startRecording());
        document.getElementById('btnStop').addEventListener('click', () => this.stopRecording());
        document.getElementById('btnPlay').addEventListener('click', () => this.playRecording());
        document.getElementById('sendVoiceMessage').addEventListener('click', () => this.sendVoiceMessage());
        document.getElementById('cancelVoiceMessage').addEventListener('click', () => this.closeModal('voiceRecorderModal'));
    }

    startRecording() {
        if (!this.mediaRecorder) return;
        
        this.audioChunks = [];
        this.mediaRecorder.start();
        this.startRecordingTimer();
        
        document.getElementById('btnRecord').disabled = true;
        document.getElementById('btnStop').disabled = false;
        document.getElementById('btnPlay').disabled = true;
    }

    stopRecording() {
        if (!this.mediaRecorder) return;
        
        this.mediaRecorder.stop();
        this.stopRecordingTimer();
        
        document.getElementById('btnRecord').disabled = false;
        document.getElementById('btnStop').disabled = true;
        document.getElementById('btnPlay').disabled = false;
        
        // Show audio preview
        document.getElementById('audioPreview').style.display = 'block';
        
        // Stop all tracks
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }
    }

    startRecordingTimer() {
        this.recordingStartTime = Date.now();
        this.recordingTimer = setInterval(() => {
            const elapsed = Date.now() - this.recordingStartTime;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            document.getElementById('voiceTimer').textContent = 
                `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        }, 1000);
    }

    stopRecordingTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
        }
    }

    playRecording() {
        const audio = document.getElementById('recordedAudio');
        if (audio.src) {
            audio.play();
        }
    }

    async sendVoiceMessage() {
        if (!this.currentAudioData) return;
        
        await this.sendMessage('Voice message', 'voice', this.currentAudioData);
        this.closeModal('voiceRecorderModal');
        this.currentAudioData = null;
        this.mediaRecorder = null;
        this.mediaStream = null;
    }

    playVoiceMessage(button) {
        // Implement voice message playback
        const voiceMessage = button.closest('.voice-message');
        const progressBar = voiceMessage.querySelector('.voice-progress-bar');
        const duration = voiceMessage.querySelector('.voice-duration').textContent;
        
        // Simulate playback
        let progress = 0;
        const interval = setInterval(() => {
            progress += 10;
            progressBar.style.width = `${progress}%`;
            
            if (progress >= 100) {
                clearInterval(interval);
                setTimeout(() => {
                    progressBar.style.width = '0%';
                }, 1000);
            }
        }, 100);
    }

    searchConversations(query) {
        if (!query.trim()) {
            this.renderConversations();
            return;
        }
        
        const filtered = this.conversations.filter(conv => {
            const name = conv.name || 
                conv.participants
                    .filter(p => p.user_id !== this.currentUser.id)
                    .map(p => p.user_name)
                    .join(', ');
            
            return name.toLowerCase().includes(query.toLowerCase());
        });
        
        const container = document.getElementById('conversationsList');
        container.innerHTML = filtered.map(conv => this.createConversationItem(conv)).join('');
    }

    toggleChatInfo(show = null) {
        const sidebar = document.getElementById('chatInfoSidebar');
        if (show === null) {
            sidebar.classList.toggle('hidden');
        } else {
            sidebar.classList.toggle('hidden', !show);
        }
        
        if (!sidebar.classList.contains('hidden')) {
            this.loadChatInfo();
        }
    }

    async loadChatInfo() {
        if (!this.currentConversation) return;
        
        const container = document.getElementById('participantsList');
        container.innerHTML = this.currentConversation.participants.map(p => `
            <div class="participant-item">
                <div class="participant-avatar">
                    ${this.getUserInitials(p.user_name)}
                </div>
                <div class="participant-info">
                    <div class="participant-name">
                        ${this.escapeHtml(p.user_name)}
                        ${p.user_id === this.currentUser.id ? ' (You)' : ''}
                    </div>
                    <div class="participant-role">
                        ${p.is_admin ? 'Admin' : 'Member'}
                    </div>
                </div>
                <div class="participant-status ${this.onlineUsers.find(u => u.user_id === p.user_id) ? 'online' : 'offline'}"></div>
            </div>
        `).join('');
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === tabName);
        });

        // Show/hide tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('hidden', content.id !== `${tabName}Tab`);
        });
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Trigger custom event
            modal.dispatchEvent(new Event('modal-open'));
            
            // Load users if it's the new conversation modal
            if (modalId === 'newConversationModal') {
                if (this.allUsers.length === 0) {
                    this.loadAllUsers();
                } else {
                    this.renderUserSelect();
                }
            }
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            
            // Clean up if it's the voice recorder modal
            if (modalId === 'voiceRecorderModal') {
                if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                    this.mediaRecorder.stop();
                }
                if (this.mediaStream) {
                    this.mediaStream.getTracks().forEach(track => track.stop());
                }
                this.mediaRecorder = null;
                this.mediaStream = null;
                this.currentAudioData = null;
            }
            
            // Clean up if it's the image preview modal
            if (modalId === 'imagePreviewModal') {
                this.currentImageData = null;
            }
            
            // Clean up if it's the new conversation modal
            if (modalId === 'newConversationModal') {
                this.resetNewConversationForm();
            }
        }
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            this.closeModal(modal.id);
        });
    }

    updateUI() {
        if (this.currentConversation) {
            document.getElementById('chatWelcome').classList.add('hidden');
            document.getElementById('activeChat').classList.remove('hidden');
        } else {
            document.getElementById('chatWelcome').classList.remove('hidden');
            document.getElementById('activeChat').classList.add('hidden');
        }
    }

    setupMessageEventListeners() {
        // Right-click for message options
        document.querySelectorAll('.message-bubble').forEach(bubble => {
            bubble.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const messageId = bubble.closest('.message').dataset.messageId;
                this.selectedMessage = messageId;
                this.openMessageOptions(e.clientX, e.clientY);
            });
        });
    }

    openMessageOptions(x, y) {
        const modal = document.getElementById('messageOptionsModal');
        modal.style.left = `${x}px`;
        modal.style.top = `${y}px`;
        this.openModal('messageOptionsModal');
    }

    scrollToMessage(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageElement.style.backgroundColor = 'rgba(255, 255, 0, 0.1)';
            setTimeout(() => {
                messageElement.style.backgroundColor = '';
            }, 2000);
        }
    }

    // Utility methods
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getUserInitials(name) {
        if (!name) return '?';
        return name.split(' ')
            .map(part => part.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    formatMessageTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    formatDate(date) {
        const d = new Date(date);
        const now = new Date();
        const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'long' });
        return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
    }

    isSameDay(date1, date2) {
        return date1.getDate() === date2.getDate() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getFullYear() === date2.getFullYear();
    }

    groupMessagesByDate(messages) {
        const groups = [];
        let currentGroup = null;
        
        messages.forEach(message => {
            const messageDate = new Date(message.created_at);
            const dateKey = messageDate.toDateString();
            
            if (!currentGroup || currentGroup.date !== dateKey) {
                currentGroup = {
                    date: dateKey,
                    messages: []
                };
                groups.push(currentGroup);
            }
            
            currentGroup.messages.push(message);
        });
        
        return groups;
    }

    showNotification(message, type = 'info') {
        // Use existing notification system from main.js
        if (window.familyApp && typeof window.familyApp.showNotification === 'function') {
            window.familyApp.showNotification(message, type);
        } else {
            // Fallback notification
            console.log(`${type.toUpperCase()}: ${message}`);
            
            // Create simple notification
            const notification = document.createElement('div');
            notification.className = `notification notification-${type}`;
            notification.innerHTML = `
                <div class="notification-content">
                    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                    <span>${message}</span>
                </div>
            `;
            
            document.body.appendChild(notification);
            
            // Auto remove after 3 seconds
            setTimeout(() => {
                notification.classList.add('fade-out');
                setTimeout(() => {
                    notification.remove();
                }, 300);
            }, 3000);
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.messagesApp = new MessagesApp();
    
    // Update time display if exists
    if (typeof window.familyApp !== 'undefined' && window.familyApp.updateTime) {
        window.familyApp.updateTime();
    }
});

// Utility functions
function debounce(func, wait) {
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