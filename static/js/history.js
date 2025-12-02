// History Page JavaScript

class HistoryApp {
    constructor() {
        this.currentUser = null;
        this.currentTab = 'histories';
        this.historiesPage = 1;
        this.historiesLimit = 9;
        this.hasMoreHistories = true;
        this.initialize();
    }

    initialize() {
        console.log('History App Initialized');
        this.checkAuthentication();
        this.setupEventListeners();
        this.loadStatistics();
        this.loadHistoryData();
        this.populateYearFilter();
    }

    async checkAuthentication() {
        try {
            const token = localStorage.getItem('family_token');
            if (token) {
                const response = await fetch('/api/v1/auth/users/me', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    this.currentUser = await response.json();
                    this.updateUIForAuth();
                } else {
                    localStorage.removeItem('family_token');
                    this.currentUser = null;
                }
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.currentUser = null;
        }
    }

    updateUIForAuth() {
        // Show/hide admin features based on role
        const addHistoryBtn = document.getElementById('btnAddHistory');
        if (addHistoryBtn) {
            if (this.currentUser?.role?.name === 'admin') {
                addHistoryBtn.style.display = 'flex';
            } else if (this.currentUser) {
                addHistoryBtn.style.display = 'flex';
            } else {
                addHistoryBtn.style.display = 'flex';
            }
        }
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Search functionality
        const searchInput = document.getElementById('historySearch');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(() => {
                this.searchHistories(searchInput.value);
            }, 500));
        }

        // Filter changes
        document.getElementById('categoryFilter')?.addEventListener('change', () => {
            this.loadHistoryData();
        });

        document.getElementById('yearFilter')?.addEventListener('change', () => {
            this.loadHistoryData();
        });

        // Action buttons
        document.getElementById('btnAddHistory')?.addEventListener('click', () => {
            this.openAddHistoryModal();
        });

        document.getElementById('btnViewTimeline')?.addEventListener('click', () => {
            this.switchTab('timeline');
        });

        document.getElementById('btnLoadMoreHistories')?.addEventListener('click', () => {
            this.loadMoreHistories();
        });

        // Modal controls
        document.getElementById('closeAddHistoryModal')?.addEventListener('click', () => {
            this.closeModal('addHistoryModal');
        });

        document.getElementById('closeViewHistoryModal')?.addEventListener('click', () => {
            this.closeModal('viewHistoryModal');
        });

        document.getElementById('closeAddTimelineModal')?.addEventListener('click', () => {
            this.closeModal('addTimelineModal');
        });

        document.getElementById('closeUploadDocumentModal')?.addEventListener('click', () => {
            this.closeModal('uploadDocumentModal');
        });

        // Form submissions
        document.getElementById('addHistoryForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addFamilyHistory();
        });

        document.getElementById('addTimelineForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addTimelineEvent();
        });

        document.getElementById('uploadDocumentForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.uploadDocument();
        });

        // Cancel buttons
        document.getElementById('cancelAddHistory')?.addEventListener('click', () => {
            this.closeModal('addHistoryModal');
        });

        document.getElementById('cancelAddTimeline')?.addEventListener('click', () => {
            this.closeModal('addTimelineModal');
        });

        document.getElementById('cancelUploadDocument')?.addEventListener('click', () => {
            this.closeModal('uploadDocumentModal');
        });

        // File upload handling
        const fileUploadArea = document.getElementById('fileUploadArea');
        const fileInput = document.getElementById('documentFile');
        
        if (fileUploadArea && fileInput) {
            fileUploadArea.addEventListener('click', () => fileInput.click());
            fileUploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                fileUploadArea.style.borderColor = '#667eea';
                fileUploadArea.style.background = '#f3f4f6';
            });
            fileUploadArea.addEventListener('dragleave', () => {
                fileUploadArea.style.borderColor = '#d1d5db';
                fileUploadArea.style.background = '';
            });
            fileUploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                fileUploadArea.style.borderColor = '#d1d5db';
                fileUploadArea.style.background = '';
                
                if (e.dataTransfer.files.length) {
                    fileInput.files = e.dataTransfer.files;
                    this.handleFileSelect(e.dataTransfer.files[0]);
                }
            });
            
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length) {
                    this.handleFileSelect(e.target.files[0]);
                }
            });
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
            }
        });
    }

    async loadStatistics() {
        try {
            const response = await fetch('/api/v1/history/statistics');
            if (response.ok) {
                const stats = await response.json();
                this.updateStatsUI(stats);
            }
        } catch (error) {
            console.error('Error loading statistics:', error);
        }
    }

    updateStatsUI(stats) {
        const totalHistories = document.getElementById('totalHistories');
        const totalDocuments = document.getElementById('totalDocuments');
        const totalTimelineEvents = document.getElementById('totalTimelineEvents');
        const publishedHistories = document.getElementById('publishedHistories');
        
        if (totalHistories) totalHistories.textContent = stats.total_histories || 0;
        if (totalDocuments) totalDocuments.textContent = stats.total_documents || 0;
        if (totalTimelineEvents) totalTimelineEvents.textContent = stats.total_timeline_events || 0;
        if (publishedHistories) publishedHistories.textContent = stats.published_histories || 0;
    }

    async loadHistoryData() {
        switch (this.currentTab) {
            case 'histories':
                await this.loadHistories();
                break;
            case 'timeline':
                await this.loadTimeline();
                break;
            case 'documents':
                await this.loadDocuments();
                break;
        }
    }

    async loadHistories() {
        try {
            this.showLoading('histories');
            
            const category = document.getElementById('categoryFilter')?.value || '';
            const year = document.getElementById('yearFilter')?.value || '';
            const search = document.getElementById('historySearch')?.value || '';
            
            let url = `/api/v1/history/histories?skip=${(this.historiesPage - 1) * this.historiesLimit}&limit=${this.historiesLimit}`;
            
            if (category) url += `&category=${category}`;
            if (year) url += `&year=${year}`;
            
            const response = await fetch(url);
            
            if (response.ok) {
                const data = await response.json();
                this.displayHistories(data.items);
                
                // Check if there are more histories
                this.hasMoreHistories = data.items.length === this.historiesLimit;
                this.updateLoadMoreButton();
            }
        } catch (error) {
            console.error('Error loading histories:', error);
            this.showNotification('Failed to load histories', 'error');
        } finally {
            this.hideLoading('histories');
        }
    }

    displayHistories(histories) {
        const container = document.getElementById('historiesList');
        if (!container) return;
        
        // Clear only on first page load
        if (this.historiesPage === 1) {
            container.innerHTML = '';
        }
        
        if (histories.length === 0 && this.historiesPage === 1) {
            container.innerHTML = `
                <div class="empty-state col-span-3">
                    <div class="empty-state-icon">
                        <i class="fas fa-book"></i>
                    </div>
                    <h3>No History Entries</h3>
                    <p>Be the first to add our family history!</p>
                    <button class="btn btn-primary mt-4" onclick="historyApp.openAddHistoryModal()">
                        <i class="fas fa-plus-circle"></i>
                        Add First History
                    </button>
                </div>
            `;
            return;
        }
        
        histories.forEach(history => {
            const historyElement = this.createHistoryCard(history);
            container.appendChild(historyElement);
        });
    }

    createHistoryCard(history) {
        const div = document.createElement('div');
        div.className = 'history-card';
        div.innerHTML = `
            <div class="history-card-header">
                <h3 class="history-card-title">${history.title}</h3>
                <div class="history-card-meta">
                    ${history.category ? `<span class="history-card-badge">${this.formatCategory(history.category)}</span>` : ''}
                    ${history.year ? `<span class="history-card-badge">${history.year}</span>` : ''}
                    ${history.location ? `<span class="history-card-badge">${history.location}</span>` : ''}
                </div>
            </div>
            <div class="history-card-content">
                <p class="history-card-text">${history.content.substring(0, 200)}${history.content.length > 200 ? '...' : ''}</p>
            </div>
            <div class="history-card-footer">
                <div class="history-card-author">
                    <i class="fas fa-user-circle"></i>
                    <span>${history.creator_name || 'Unknown'}</span>
                </div>
                <button class="btn btn-sm btn-outline view-history-btn" data-history-id="${history.id}">
                    <i class="fas fa-eye"></i>
                    View
                </button>
            </div>
        `;
        
        // Add click event to view button
        div.querySelector('.view-history-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.viewHistory(history.id);
        });
        
        // Make entire card clickable
        div.addEventListener('click', () => {
            this.viewHistory(history.id);
        });
        
        return div;
    }

    async viewHistory(historyId) {
        try {
            this.showLoading('view');
            
            const token = localStorage.getItem('family_token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            
            const response = await fetch(`/api/v1/history/histories/${historyId}`, { headers });
            
            if (response.ok) {
                const history = await response.json();
                this.displayHistoryDetails(history);
                
                // Load documents for this history
                await this.loadHistoryDocuments(historyId);
            } else if (response.status === 403) {
                this.showNotification('This history is not published yet', 'error');
            } else {
                this.showNotification('History not found', 'error');
            }
        } catch (error) {
            console.error('Error viewing history:', error);
            this.showNotification('Failed to load history', 'error');
        } finally {
            this.hideLoading('view');
        }
    }

    displayHistoryDetails(history) {
        const title = document.getElementById('viewHistoryTitle');
        const yearBadge = document.getElementById('historyYearBadge');
        const categoryBadge = document.getElementById('historyCategoryBadge');
        const locationBadge = document.getElementById('historyLocationBadge');
        const content = document.getElementById('historyFullContent');
        const creator = document.getElementById('historyCreator');
        const date = document.getElementById('historyDate');
        
        if (title) title.textContent = history.title;
        if (yearBadge) yearBadge.textContent = history.year ? `Year: ${history.year}` : '';
        if (categoryBadge) categoryBadge.textContent = `Category: ${this.formatCategory(history.category)}`;
        if (locationBadge) locationBadge.textContent = history.location ? `Location: ${history.location}` : '';
        if (content) content.textContent = history.content;
        if (creator) creator.textContent = `Added by: ${history.creator_name || 'Unknown'}`;
        if (date) date.textContent = `Created: ${this.formatDate(history.created_at)}`;
        
        this.openModal('viewHistoryModal');
    }

    async loadHistoryDocuments(historyId) {
        try {
            const token = localStorage.getItem('family_token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            
            const response = await fetch(`/api/v1/history/histories/${historyId}/documents`, { headers });
            
            if (response.ok) {
                const data = await response.json();
                this.displayHistoryDocuments(data.items);
            }
        } catch (error) {
            console.error('Error loading documents:', error);
        }
    }

    displayHistoryDocuments(documents) {
        const container = document.getElementById('historyDocumentsList');
        if (!container) return;
        
        if (documents.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">No documents attached</p>';
            return;
        }
        
        let html = '<div class="space-y-3">';
        documents.forEach(doc => {
            html += `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-file text-gray-500"></i>
                        <div>
                            <div class="font-medium">${doc.file_name}</div>
                            <div class="text-sm text-gray-600">${this.formatFileSize(doc.file_size)} • ${doc.document_type}</div>
                        </div>
                    </div>
                    <a href="${doc.file_path}" target="_blank" class="btn btn-sm btn-outline">
                        <i class="fas fa-download"></i>
                        Download
                    </a>
                </div>
            `;
        });
        html += '</div>';
        
        container.innerHTML = html;
    }

    async loadTimeline() {
        try {
            this.showLoading('timeline');
            
            const response = await fetch('/api/v1/history/timeline?limit=50');
            
            if (response.ok) {
                const data = await response.json();
                this.displayTimeline(data.items);
            }
        } catch (error) {
            console.error('Error loading timeline:', error);
        } finally {
            this.hideLoading('timeline');
        }
    }

    displayTimeline(events) {
        const container = document.getElementById('timelineView');
        if (!container) return;
        
        if (events.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <i class="fas fa-stream"></i>
                    </div>
                    <h3>No Timeline Events</h3>
                    <p>Add events to build our family timeline</p>
                    ${this.currentUser?.role?.name === 'admin' ? `
                        <button class="btn btn-primary mt-4" onclick="historyApp.openAddTimelineModal()">
                            <i class="fas fa-plus-circle"></i>
                            Add First Event
                        </button>
                    ` : ''}
                </div>
            `;
            return;
        }
        
        // Sort events by year
        events.sort((a, b) => b.year - a.year);
        
        let html = '<div class="timeline">';
        
        events.forEach((event, index) => {
            html += `
                <div class="timeline-event">
                    <div class="timeline-year">${event.year}</div>
                    <div class="timeline-content">
                        <h4 class="timeline-title">${event.title}</h4>
                        ${event.description ? `<p class="timeline-description">${event.description}</p>` : ''}
                        <div class="timeline-meta mt-3">
                            <span class="timeline-tag">${event.event_type}</span>
                            <span class="timeline-tag ${event.importance_level}">${event.importance_level}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        
        // Add Add Event button for admins
        if (this.currentUser?.role?.name === 'admin') {
            html += `
                <div class="text-center mt-8">
                    <button class="btn btn-primary" onclick="historyApp.openAddTimelineModal()">
                        <i class="fas fa-calendar-plus"></i>
                        Add Timeline Event
                    </button>
                </div>
            `;
        }
        
        container.innerHTML = html;
    }

    async loadDocuments() {
        try {
            this.showLoading('documents');
            
            // For now, we'll load histories and show their documents
            const response = await fetch('/api/v1/history/histories?limit=20');
            
            if (response.ok) {
                const data = await response.json();
                this.displayDocuments(data.items);
            }
        } catch (error) {
            console.error('Error loading documents:', error);
        } finally {
            this.hideLoading('documents');
        }
    }

    displayDocuments(histories) {
        const container = document.getElementById('documentsList');
        if (!container) return;
        
        if (histories.length === 0) {
            container.innerHTML = `
                <div class="empty-state col-span-3">
                    <div class="empty-state-icon">
                        <i class="fas fa-file"></i>
                    </div>
                    <h3>No Documents</h3>
                    <p>Upload documents to preserve our history</p>
                    ${this.currentUser ? `
                        <button class="btn btn-primary mt-4" onclick="historyApp.openUploadDocumentModal()">
                            <i class="fas fa-upload"></i>
                            Upload Document
                        </button>
                    ` : ''}
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="col-span-3">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-lg font-semibold">Historical Documents</h3>
                    ${this.currentUser ? `
                        <button class="btn btn-primary" onclick="historyApp.openUploadDocumentModal()">
                            <i class="fas fa-upload"></i>
                            Upload Document
                        </button>
                    ` : ''}
                </div>
                <p class="text-gray-600 mb-6">
                    Documents are attached to specific history entries. View history entries to see their documents.
                </p>
                <button class="btn btn-outline" onclick="historyApp.switchTab('histories')">
                    <i class="fas fa-book"></i>
                    View History Entries
                </button>
            </div>
        `;
    }

    async addFamilyHistory() {
        if (!this.currentUser) {
            this.showNotification('Please login first', 'error');
            this.openLoginModal();
            return;
        }
        
        const title = document.getElementById('historyTitle').value;
        const year = document.getElementById('historyYear').value;
        const category = document.getElementById('historyCategory').value;
        const location = document.getElementById('historyLocation').value;
        const content = document.getElementById('historyContent').value;
        const isPublished = document.getElementById('historyPublished').checked;
        
        if (!title || !category || !content) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        try {
            const token = localStorage.getItem('family_token');
            const historyData = {
                title: title,
                content: content,
                year: year ? parseInt(year) : null,
                location: location || null,
                category: category,
                is_published: isPublished
            };
            
            const response = await fetch('/api/v1/history/histories', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(historyData)
            });
            
            if (response.ok) {
                const history = await response.json();
                this.showNotification('History entry added successfully!', 'success');
                this.closeModal('addHistoryModal');
                this.resetAddHistoryForm();
                
                // Refresh histories
                this.historiesPage = 1;
                await this.loadHistories();
                await this.loadStatistics();
            } else {
                const error = await response.json();
                this.showNotification(error.detail || 'Failed to add history', 'error');
            }
        } catch (error) {
            console.error('Error adding history:', error);
            this.showNotification('Network error. Please try again.', 'error');
        }
    }

    async addTimelineEvent() {
        if (!this.currentUser?.role?.name === 'admin') {
            this.showNotification('Admin access required', 'error');
            return;
        }
        
        const year = document.getElementById('timelineYear').value;
        const title = document.getElementById('timelineTitle').value;
        const description = document.getElementById('timelineDescription').value;
        const eventType = document.getElementById('timelineEventType').value;
        const importanceLevel = document.getElementById('timelineImportance').value;
        
        if (!year || !title) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        try {
            const token = localStorage.getItem('family_token');
            const timelineData = {
                year: parseInt(year),
                title: title,
                description: description || null,
                event_type: eventType,
                importance_level: importanceLevel
            };
            
            const response = await fetch('/api/v1/history/timeline', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(timelineData)
            });
            
            if (response.ok) {
                this.showNotification('Timeline event added successfully!', 'success');
                this.closeModal('addTimelineModal');
                this.resetAddTimelineForm();
                
                // Refresh timeline
                await this.loadTimeline();
                await this.loadStatistics();
            } else {
                const error = await response.json();
                this.showNotification(error.detail || 'Failed to add event', 'error');
            }
        } catch (error) {
            console.error('Error adding timeline event:', error);
            this.showNotification('Network error. Please try again.', 'error');
        }
    }

    async uploadDocument() {
        if (!this.currentUser) {
            this.showNotification('Please login first', 'error');
            this.openLoginModal();
            return;
        }
        
        const fileInput = document.getElementById('documentFile');
        const historyId = document.getElementById('documentHistory').value;
        const documentType = document.getElementById('documentType').value;
        const description = document.getElementById('documentDescription').value;
        
        if (!fileInput.files.length || !historyId || !documentType) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        const file = fileInput.files[0];
        
        // Validate file size (50MB limit)
        if (file.size > 50 * 1024 * 1024) {
            this.showNotification('File size must be less than 50MB', 'error');
            return;
        }
        
        try {
            const token = localStorage.getItem('family_token');
            const formData = new FormData();
            formData.append('file', file);
            formData.append('document_type', documentType);
            if (description) formData.append('description', description);
            
            const response = await fetch(`/api/v1/history/histories/${historyId}/documents`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            if (response.ok) {
                this.showNotification('Document uploaded successfully!', 'success');
                this.closeModal('uploadDocumentModal');
                this.resetUploadDocumentForm();
                
                // Refresh statistics
                await this.loadStatistics();
            } else {
                const error = await response.json();
                this.showNotification(error.detail || 'Failed to upload document', 'error');
            }
        } catch (error) {
            console.error('Error uploading document:', error);
            this.showNotification('Network error. Please try again.', 'error');
        }
    }

    handleFileSelect(file) {
        const fileName = document.getElementById('fileName');
        const filePreview = document.getElementById('filePreview');
        
        if (fileName) fileName.textContent = file.name;
        if (filePreview) filePreview.classList.remove('hidden');
    }

    clearFile() {
        const fileInput = document.getElementById('documentFile');
        const filePreview = document.getElementById('filePreview');
        
        if (fileInput) fileInput.value = '';
        if (filePreview) filePreview.classList.add('hidden');
    }

    async searchHistories(query) {
        // Implement search functionality
        // For now, we'll just filter the displayed histories
        if (query.trim()) {
            this.showNotification('Search functionality coming soon!', 'info');
        }
    }

    async loadMoreHistories() {
        if (!this.hasMoreHistories) return;
        
        this.historiesPage++;
        await this.loadHistories();
    }

    switchTab(tabName) {
        this.currentTab = tabName;
        this.historiesPage = 1;
        this.hasMoreHistories = true;
        
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === tabName);
        });
        
        // Show/hide tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}Tab`);
        });
        
        // Load data for the tab
        this.loadHistoryData();
    }

    populateYearFilter() {
        const yearFilter = document.getElementById('yearFilter');
        if (!yearFilter) return;
        
        const currentYear = new Date().getFullYear();
        for (let year = currentYear; year >= 1800; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearFilter.appendChild(option);
        }
    }

    openAddHistoryModal() {
        if (!this.currentUser) {
            // Show auth required message
            const authRequired = document.getElementById('authRequiredHistory');
            const addHistoryForm = document.getElementById('addHistoryForm');
            
            if (authRequired) authRequired.style.display = 'block';
            if (addHistoryForm) addHistoryForm.style.display = 'none';
        } else {
            // Show form
            const authRequired = document.getElementById('authRequiredHistory');
            const addHistoryForm = document.getElementById('addHistoryForm');
            
            if (authRequired) authRequired.style.display = 'none';
            if (addHistoryForm) addHistoryForm.style.display = 'block';
            
            // Populate history dropdown for document upload
            this.populateHistoryDropdown();
        }
        
        this.openModal('addHistoryModal');
    }

    openAddTimelineModal() {
        if (!this.currentUser?.role?.name === 'admin') {
            // Show auth required message
            const authRequired = document.getElementById('authRequiredTimeline');
            const addTimelineForm = document.getElementById('addTimelineForm');
            
            if (authRequired) authRequired.style.display = 'block';
            if (addTimelineForm) addTimelineForm.style.display = 'none';
        } else {
            // Show form
            const authRequired = document.getElementById('authRequiredTimeline');
            const addTimelineForm = document.getElementById('addTimelineForm');
            
            if (authRequired) authRequired.style.display = 'none';
            if (addTimelineForm) addTimelineForm.style.display = 'block';
        }
        
        this.openModal('addTimelineModal');
    }

    openUploadDocumentModal() {
        if (!this.currentUser) {
            // Show auth required message
            const authRequired = document.getElementById('authRequiredDocument');
            const uploadDocumentForm = document.getElementById('uploadDocumentForm');
            
            if (authRequired) authRequired.style.display = 'block';
            if (uploadDocumentForm) uploadDocumentForm.style.display = 'none';
        } else {
            // Show form
            const authRequired = document.getElementById('authRequiredDocument');
            const uploadDocumentForm = document.getElementById('uploadDocumentForm');
            
            if (authRequired) authRequired.style.display = 'none';
            if (uploadDocumentForm) uploadDocumentForm.style.display = 'block';
            
            // Populate history dropdown
            this.populateHistoryDropdown();
        }
        
        this.openModal('uploadDocumentModal');
    }

    async populateHistoryDropdown() {
        const historyDropdown = document.getElementById('documentHistory');
        if (!historyDropdown) return;
        
        try {
            const token = localStorage.getItem('family_token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            
            const response = await fetch('/api/v1/history/histories?limit=50', { headers });
            
            if (response.ok) {
                const data = await response.json();
                
                // Clear existing options except the first one
                while (historyDropdown.options.length > 1) {
                    historyDropdown.remove(1);
                }
                
                data.items.forEach(history => {
                    const option = document.createElement('option');
                    option.value = history.id;
                    option.textContent = history.title;
                    historyDropdown.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading histories for dropdown:', error);
        }
    }

    openLoginModal() {
        this.closeAllModals();
        // Redirect to login page
        window.location.href = '/login';
    }

    openRegisterModal() {
        this.closeAllModals();
        // Redirect to register page
        window.location.href = '/register';
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
    }

    resetAddHistoryForm() {
        const form = document.getElementById('addHistoryForm');
        if (form) form.reset();
    }

    resetAddTimelineForm() {
        const form = document.getElementById('addTimelineForm');
        if (form) form.reset();
    }

    resetUploadDocumentForm() {
        const form = document.getElementById('uploadDocumentForm');
        if (form) form.reset();
        this.clearFile();
    }

    updateLoadMoreButton() {
        const button = document.getElementById('btnLoadMoreHistories');
        if (button) {
            button.disabled = !this.hasMoreHistories;
            button.innerHTML = this.hasMoreHistories 
                ? '<span>Load More</span>' 
                : '<span>No More Histories</span>';
        }
    }

    showLoading(context) {
        let element;
        switch (context) {
            case 'histories':
                element = document.getElementById('btnLoadMoreHistories');
                if (element) {
                    const spinner = element.querySelector('.fa-spinner');
                    const text = element.querySelector('span');
                    if (spinner) spinner.classList.remove('hidden');
                    if (text) text.textContent = 'Loading...';
                }
                break;
            case 'view':
                // Show loading overlay
                break;
        }
    }

    hideLoading(context) {
        let element;
        switch (context) {
            case 'histories':
                element = document.getElementById('btnLoadMoreHistories');
                if (element) {
                    const spinner = element.querySelector('.fa-spinner');
                    const text = element.querySelector('span');
                    if (spinner) spinner.classList.add('hidden');
                    if (text) text.textContent = 'Load More';
                }
                break;
            case 'view':
                // Hide loading overlay
                break;
        }
    }

    formatCategory(category) {
        const categories = {
            'origin': 'Origin Stories',
            'migration': 'Migration',
            'achievement': 'Achievements',
            'tradition': 'Traditions',
            'landmarks': 'Family Landmarks',
            'cultural': 'Cultural Heritage'
        };
        return categories[category] || category;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showNotification(message, type = 'info') {
        // Use existing notification system from main.js
        if (window.familyApp && typeof window.familyApp.showNotification === 'function') {
            window.familyApp.showNotification(message, type);
        } else {
            // Fallback notification
            console.log(`${type.toUpperCase()}: ${message}`);
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.historyApp = new HistoryApp();
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