
class EventsApp {
    constructor() {
        this.currentUser = null;
        this.events = [];
        this.filteredEvents = [];
        this.upcomingEvents = [];
        this.currentView = 'calendar';
        this.currentDate = new Date();
        this.currentMonth = this.currentDate.getMonth();
        this.currentYear = this.currentDate.getFullYear();
        this.selectedEvent = null;
        this.currentPage = 1;
        this.totalPages = 1;
        this.pageSize = 10;
        this.editMode = false;
        this.editingEventId = null;
        this.isLoading = false;
        this.eventTypeColors = {
            reunion: '#667eea',
            birthday: '#f093fb',
            wedding: '#f5576c',
            anniversary: '#4facfe',
            holiday: '#10b981',
            meeting: '#f59e0b',
            cultural: '#8b5cf6',
            religious: '#3b82f6',
            other: '#94a3b8'
        };
        
        this.eventTypeIcons = {
            reunion: 'fas fa-users',
            birthday: 'fas fa-birthday-cake',
            wedding: 'fas fa-ring',
            anniversary: 'fas fa-heart',
            holiday: 'fas fa-gift',
            meeting: 'fas fa-comments',
            cultural: 'fas fa-theater-masks',
            religious: 'fas fa-church',
            other: 'fas fa-calendar'
        };
        
        this.initialize();
    }

    /**
     * Initialize the events application
     */
    initialize() {
        console.log('[EventsApp] Initializing...');
        this.checkAuthentication();
        this.setupEventListeners();
        this.setupFileUploads();
        this.setDefaultDate();
        this.loadInitialData();
        this.setupCalendar(this.currentYear, this.currentMonth);
        this.setupServiceWorker();
    }

    getAuthHeaders() {
        const token = localStorage.getItem('family_token');
        return token
            ? { Authorization: `Bearer ${token}` }
            : {};
    }


    /**
     * Check user authentication status
     */
    async checkAuthentication() {
        try {
            const token = localStorage.getItem('family_token');
            if (token) {
                const response = await fetch('/api/v1/auth/users/me', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    signal: AbortSignal.timeout(5000)
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
            if (error.name !== 'AbortError') {
                console.warn('[EventsApp] Auth check failed:', error);
            }
            this.currentUser = null;
        }
    }

    /**
     * Update UI based on authentication status
     */
    updateUIForAuth() {
        const createEventBtn = document.getElementById('btnCreateEvent');
        if (createEventBtn) {
            createEventBtn.disabled = !this.currentUser;
            createEventBtn.title = this.currentUser ? 'Create new event' : 'Please login to create events';
            if (!this.currentUser) {
                createEventBtn.addEventListener('click', () => {
                    window.location.href = '/login?return=/events';
                });
            }
        }
    }

    /**
     * Set default date to today
     */
    setDefaultDate() {
        const dateFilter = document.getElementById('dateFilter');
        if (dateFilter) {
            dateFilter.value = '';
            dateFilter.min = '2000-01-01';
            dateFilter.max = '2100-12-31';
        }
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // View tabs
        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const view = tab.dataset.view;
                this.switchView(view);
            });
        });

        // Date controls
        document.getElementById('btnToday')?.addEventListener('click', () => {
            this.goToToday();
        });

        document.getElementById('dateFilter')?.addEventListener('change', debounce((e) => {
            if (e.target.value) {
                this.currentDate = this.parseDateInput(e.target.value);
                this.currentMonth = this.currentDate.getMonth();
                this.currentYear = this.currentDate.getFullYear();
                this.setupCalendar(this.currentYear, this.currentMonth);
            }

            this.currentPage = 1;
            this.filterEvents();
            this.updateViews();
            this.checkEmptyState();
        }, 300));

        // Upcoming events filter
        document.getElementById('upcomingFilter')?.addEventListener('change', debounce(() => {
            this.loadUpcomingEvents();
        }, 300));

        // Event type filter
        document.getElementById('eventTypeFilter')?.addEventListener('change', debounce(() => {
            this.filterEvents();
            this.updateViews();
        }, 300));

        // Create event button
        document.getElementById('btnCreateEvent')?.addEventListener('click', () => {
            this.openCreateEventModal();
        });

        document.getElementById('btnCreateFirstEvent')?.addEventListener('click', () => {
            this.openCreateEventModal();
        });

        // Calendar navigation
        document.getElementById('prevMonth')?.addEventListener('click', () => {
            this.navigateCalendar(-1);
        });

        document.getElementById('nextMonth')?.addEventListener('click', () => {
            this.navigateCalendar(1);
        });

        // List controls
        document.getElementById('listSort')?.addEventListener('change', () => {
            this.sortEvents();
            this.displayListView();
        });

        document.getElementById('prevPage')?.addEventListener('click', () => {
            this.prevPage();
        });

        document.getElementById('nextPage')?.addEventListener('click', () => {
            this.nextPage();
        });

        // Modal controls
        this.setupModalListeners();

        // Event form
        document.getElementById('eventForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveEvent();
        });

        // Upload picture form
        document.getElementById('uploadPictureForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.uploadEventPicture();
        });

        // Event details actions
        document.getElementById('btnEditEvent')?.addEventListener('click', () => {
            this.editEvent();
        });

        document.getElementById('btnDeleteEvent')?.addEventListener('click', () => {
            this.confirmDeleteEvent();
        });

        document.getElementById('btnUploadPicture')?.addEventListener('click', () => {
            this.openUploadPictureModal();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
            if (e.key === '+' && e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                this.openCreateEventModal();
            }
        });

        // Window resize handling
        window.addEventListener('resize', debounce(() => {
            this.handleResize();
        }, 250));

        // Online/offline handling
        window.addEventListener('online', () => {
            this.showNotification('Back online. Syncing events...', 'success');
            this.loadInitialData();
        });

        window.addEventListener('offline', () => {
            this.showNotification('You are offline. Some features may be limited.', 'warning');
        });
    }

    /**
     * Setup modal event listeners
     */
    setupModalListeners() {
        const modals = [
            'eventDetailsModal',
            'eventFormModal',
            'uploadPictureModal',
            'pictureViewModal'
        ];

        modals.forEach(modalId => {
            const closeBtn = document.getElementById(`close${modalId.charAt(0).toUpperCase() + modalId.slice(1)}`);
            closeBtn?.addEventListener('click', () => {
                this.closeModal(modalId);
                if (modalId === 'eventFormModal') this.resetEventForm();
                if (modalId === 'uploadPictureModal') this.resetUploadForm();
            });

            const modal = document.getElementById(modalId);
            modal?.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modalId);
                    if (modalId === 'eventFormModal') this.resetEventForm();
                    if (modalId === 'uploadPictureModal') this.resetUploadForm();
                }
            });
        });

        document.getElementById('cancelEventForm')?.addEventListener('click', () => {
            this.closeModal('eventFormModal');
            this.resetEventForm();
        });

        document.getElementById('cancelUpload')?.addEventListener('click', () => {
            this.closeModal('uploadPictureModal');
            this.resetUploadForm();
        });
    }

    /**
     * Setup file upload functionality
     */
    setupFileUploads() {
        this.setupFileUpload('eventPicture', 'fileUploadArea', 'fileUploadContent', 'filePreview', 'previewImage', 'removeFile');
        this.setupFileUpload('pictureFile', 'pictureUploadArea', 'pictureUploadContent', 'picturePreview', 'picturePreviewImage', 'removePicture');
    }

    /**
     * Setup individual file upload
     */
    setupFileUpload(inputId, areaId, contentId, previewId, imageId, removeId) {
        const input = document.getElementById(inputId);
        const area = document.getElementById(areaId);
        const content = document.getElementById(contentId);
        const preview = document.getElementById(previewId);
        const image = document.getElementById(imageId);
        const removeBtn = document.getElementById(removeId);
        const browseLink = content?.querySelector('.browse-link');

        if (!input || !area || !content || !preview || !image || !removeBtn) return;

        // Click to browse
        area.addEventListener('click', (e) => {
            if (e.target !== removeBtn) {
                input.click();
            }
        });

        browseLink?.addEventListener('click', (e) => {
            e.stopPropagation();
            input.click();
        });

        // Drag and drop
        area.addEventListener('dragover', (e) => {
            e.preventDefault();
            area.classList.add('dragover');
        });

        area.addEventListener('dragleave', () => {
            area.classList.remove('dragover');
        });

        area.addEventListener('drop', (e) => {
            e.preventDefault();
            area.classList.remove('dragover');
            
            if (e.dataTransfer.files.length) {
                input.files = e.dataTransfer.files;
                this.previewFile(e.dataTransfer.files[0], image, preview, content);
            }
        });

        // File selection
        input.addEventListener('change', (e) => {
            if (e.target.files.length) {
                this.previewFile(e.target.files[0], image, preview, content);
            }
        });

        // Remove file
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            input.value = '';
            preview.classList.add('hidden');
            content.classList.remove('hidden');
        });
    }

    /**
     * Preview selected file
     */
    previewFile(file, imageElement, previewContainer, uploadContent) {
        if (!file.type.startsWith('image/')) {
            this.showNotification('Please select an image file (JPG, PNG, GIF, WEBP)', 'error');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            this.showNotification('File size must be less than 10MB', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            imageElement.src = e.target.result;
            
            // Update file info
            const fileName = previewContainer.querySelector('[id$="FileName"]');
            const fileSize = previewContainer.querySelector('[id$="FileSize"]');
            
            if (fileName) fileName.textContent = file.name;
            if (fileSize) fileSize.textContent = this.formatFileSize(file.size);
            
            previewContainer.classList.remove('hidden');
            uploadContent.classList.add('hidden');
        };
        reader.onerror = () => {
            this.showNotification('Error reading file', 'error');
        };
        reader.readAsDataURL(file);
    }

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Load initial data
     */
    async loadInitialData() {
        this.showLoading();
        try {
            await Promise.all([
                this.loadEvents(),
                this.loadUpcomingEvents(),
                this.loadEventStats()
            ]);
        } catch (error) {
            console.error('[EventsApp] Error loading initial data:', error);
            //this.showNotification('Error loading events. Please try again.', 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Load all events
     */
    async loadEvents() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading();
        
        try {
            const params = new URLSearchParams({
                skip: '0',
                limit: '200'
            });

            const response = await fetch(`/api/v1/events/events?${params}`, {
                headers: {
                    'Cache-Control': 'max-age=60'
                },
                signal: AbortSignal.timeout(10000)
            });
            
            if (response.ok) {
                const data = await response.json();
                this.events = data.items || [];
                this.currentPage = 1;
                this.filterEvents();
                this.setupCalendar(this.currentYear, this.currentMonth);
                this.updateViews();
                this.updateEventStats();
                
                // Cache events for offline use
                this.cacheEvents(this.events);
            } else {
                throw new Error('Failed to load events');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('[EventsApp] Request timeout');
                this.showNotification('Request timeout. Please check your connection.', 'warning');
            } else if (!navigator.onLine) {
                // Try to load from cache
                this.loadEventsFromCache();
            } else {
                throw error;
            }
        } finally {
            this.isLoading = false;
            this.hideLoading();
            this.checkEmptyState();
        }
    }

    /**
     * Cache events for offline use
     */
    cacheEvents(events) {
        try {
            localStorage.setItem('events_cache', JSON.stringify({
                events: events,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.warn('[EventsApp] Failed to cache events:', error);
        }
    }

    /**
     * Load events from cache
     */
    loadEventsFromCache() {
        try {
            const cached = localStorage.getItem('events_cache');
            if (cached) {
                const { events, timestamp } = JSON.parse(cached);
                // Use cache if less than 1 hour old
                if (Date.now() - timestamp < 3600000) {
                    this.events = events;
                    this.currentPage = 1;
                    this.filterEvents();
                    this.setupCalendar(this.currentYear, this.currentMonth);
                    this.updateViews();
                    this.updateEventStats();
                    this.showNotification('Showing cached events (offline mode)', 'info');
                }
            }
        } catch (error) {
            console.warn('[EventsApp] Failed to load from cache:', error);
        }
    }

    /**
     * Load upcoming events
     */
    async loadUpcomingEvents() {
        try {
            const filter = document.getElementById('upcomingFilter')?.value || '30';
            const days = filter === 'all' ? 365 : parseInt(filter);
            
            const response = await fetch(`/api/v1/events/calendar/upcoming?days=${days}`, {
                headers: {
                    'Cache-Control': 'max-age=60'
                },
                signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
                this.upcomingEvents = await response.json();
                this.displayUpcomingEvents();
            }
        } catch (error) {
            console.warn('[EventsApp] Failed to load upcoming events:', error);
            this.upcomingEvents = [];
            this.displayUpcomingEvents();
        }
    }

    /**
     * Load event statistics
     */
    async loadEventStats() {
        try {
            const today = new Date();
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - today.getDay());
            
            const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            
            // Count events
            const todayCount = this.events.filter(event => {
                const eventDate = new Date(event.date_of_happening);
                return eventDate.toDateString() === today.toDateString();
            }).length;
            
            const weekCount = this.events.filter(event => {
                const eventDate = new Date(event.date_of_happening);
                return eventDate >= weekStart && eventDate <= today;
            }).length;
            
            const monthCount = this.events.filter(event => {
                const eventDate = new Date(event.date_of_happening);
                return eventDate >= monthStart && eventDate <= today;
            }).length;
            
            // Update UI
            this.updateStatElement('todayCount', todayCount);
            this.updateStatElement('weekCount', weekCount);
            this.updateStatElement('monthCount', monthCount);
            this.updateStatElement('totalEvents', this.events.length);
            
        } catch (error) {
            console.warn('[EventsApp] Failed to load event stats:', error);
        }
    }

    updateEventStats() {
        this.loadEventStats();
    }

    /**
     * Update statistics element
     */
    updateStatElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            // Animate counter
            this.animateCounter(element, value);
        }
    }

    /**
     * Animate counter value
     */
    animateCounter(element, targetValue) {
        const current = parseInt(element.textContent) || 0;
        const duration = 500; // ms
        const steps = 20;
        const increment = (targetValue - current) / steps;
        let step = 0;
        
        const timer = setInterval(() => {
            step++;
            const value = Math.round(current + (increment * step));
            element.textContent = value;
            
            if (step >= steps) {
                element.textContent = targetValue;
                clearInterval(timer);
            }
        }, duration / steps);
    }

    /**
     * Display upcoming events
     */
    displayUpcomingEvents() {
        const container = document.getElementById('upcomingEvents');
        if (!container) return;
        
        if (this.upcomingEvents.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-check"></i>
                    <p>No upcoming events</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        this.upcomingEvents.forEach(event => {
            const eventDate = new Date(event.date_of_happening);
            const imageUrl = this.getPrimaryEventImageUrl(event);
            const safeName = this.escapeHtml(event.name || 'Event');
            const safeDetails = this.escapeHtml(event.details || 'No description available');
            const safeLocation = this.escapeHtml(event.location || '');
            const safeOwner = this.escapeHtml(event.owner_name || 'Family');
            const today = new Date();
            const diffTime = eventDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            let countdownClass = '';
            let countdownText = '';
            
            if (diffDays === 0) {
                countdownClass = 'countdown-today';
                countdownText = 'Today';
            } else if (diffDays === 1) {
                countdownClass = 'countdown-soon';
                countdownText = 'Tomorrow';
            } else if (diffDays <= 7) {
                countdownClass = 'countdown-soon';
                countdownText = `In ${diffDays} days`;
            } else {
                countdownText = `${diffDays} days to go`;
            }
            
            html += `
                <div class="upcoming-event-card" data-event-id="${event.id}">
                    ${imageUrl ? `
                        <div class="upcoming-event-media">
                            <img src="${imageUrl}" alt="${safeName}" loading="lazy">
                        </div>
                    ` : ''}
                    <div class="upcoming-event-header">
                        <div class="upcoming-event-date">
                            <div class="upcoming-date-badge">
                                <div class="upcoming-date-day">${eventDate.getDate()}</div>
                                <div class="upcoming-date-month">${eventDate.toLocaleString('default', { month: 'short' }).toUpperCase()}</div>
                            </div>
                            <div class="upcoming-event-meta">
                                <div class="event-type-badge event-type-${event.type || 'other'}">
                                    <i class="${this.eventTypeIcons[event.type || 'other']}"></i>
                                    <span>${this.formatEventType(event.type)}</span>
                                </div>
                                <div class="upcoming-event-time">
                                    <i class="fas fa-clock"></i>
                                    ${eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                        <div class="upcoming-countdown ${countdownClass}">
                            ${countdownText}
                        </div>
                    </div>
                    <div class="upcoming-event-title">${safeName}</div>
                    <div class="upcoming-event-description">${safeDetails}</div>
                    ${event.location ? `
                        <div class="upcoming-event-location">
                            <i class="fas fa-map-marker-alt"></i>
                            ${safeLocation}
                        </div>
                    ` : ''}
                    <div class="upcoming-event-footer">
                        <div class="upcoming-event-tags">
                            <span class="upcoming-event-tag">${safeOwner}</span>
                            ${event.type ? `<span class="upcoming-event-tag">${this.escapeHtml(this.formatEventType(event.type))}</span>` : ''}
                        </div>
                        <button class="btn btn-outline btn-sm view-upcoming-event">
                            <i class="fas fa-eye"></i>
                            View Details
                        </button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
        // Add event listeners
        container.querySelectorAll('.upcoming-event-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.view-upcoming-event')) {
                    const eventId = card.dataset.eventId;
                    this.showEventDetails(eventId);
                }
            });
            
            const viewBtn = card.querySelector('.view-upcoming-event');
            viewBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                const eventId = card.dataset.eventId;
                this.showEventDetails(eventId);
            });
        });
    }

    /**
     * Format event type for display
     */
    formatEventType(type) {
        const types = {
            reunion: 'Family Reunion',
            birthday: 'Birthday',
            wedding: 'Wedding',
            anniversary: 'Anniversary',
            holiday: 'Holiday',
            meeting: 'Meeting',
            cultural: 'Cultural',
            religious: 'Religious',
            other: 'Other'
        };
        return types[type] || 'Event';
    }

    /**
     * Filter events based on criteria
     */
    filterEvents() {
        const typeFilter = document.getElementById('eventTypeFilter')?.value || 'all';
        const dateFilterValue = document.getElementById('dateFilter')?.value || '';
        const hasStoredTypes = this.events.some(event => Boolean(event.type));
        
        this.filteredEvents = this.events.filter(event => {
            // Type filter
            if (typeFilter !== 'all' && hasStoredTypes && event.type !== typeFilter) {
                return false;
            }
            
            // Date filter
            if (dateFilterValue) {
                const selectedDate = this.parseDateInput(dateFilterValue);
                selectedDate.setHours(0, 0, 0, 0);
                const nextDate = new Date(selectedDate);
                nextDate.setDate(nextDate.getDate() + 1);
                
                const eventDate = new Date(event.date_of_happening);
                eventDate.setHours(0, 0, 0, 0);
                
                return eventDate >= selectedDate && eventDate < nextDate;
            }
            
            return true;
        });

        this.sortEvents();
    }

    /**
     * Sort events
     */
    sortEvents() {
        const sortBy = document.getElementById('listSort')?.value || 'date_asc';
        
        this.filteredEvents.sort((a, b) => {
            const dateA = new Date(a.date_of_happening);
            const dateB = new Date(b.date_of_happening);
            
            switch (sortBy) {
                case 'date_desc':
                    return dateB - dateA;
                case 'name_asc':
                    return a.name.localeCompare(b.name);
                case 'name_desc':
                    return b.name.localeCompare(a.name);
                default: // date_asc
                    return dateA - dateB;
            }
        });
    }

    /**
     * Navigate to today
     */
    goToToday() {
        this.currentDate = new Date();
        this.currentMonth = this.currentDate.getMonth();
        this.currentYear = this.currentDate.getFullYear();
        
        this.setDateFilterValue(this.currentDate);
        this.currentPage = 1;
        this.filterEvents();
        this.setupCalendar(this.currentYear, this.currentMonth);
        this.updateViews();
        this.checkEmptyState();
        this.scrollToToday();
    }

    /**
     * Scroll to today in calendar
     */
    scrollToToday() {
        const todayElement = document.querySelector('.calendar-day.today');
        if (todayElement) {
            todayElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'center' 
            });
        }
    }

    /**
     * Navigate calendar months
     */
    navigateCalendar(direction) {
        this.currentMonth += direction;
        
        if (this.currentMonth < 0) {
            this.currentMonth = 11;
            this.currentYear--;
        } else if (this.currentMonth > 11) {
            this.currentMonth = 0;
            this.currentYear++;
        }
        
        this.setupCalendar(this.currentYear, this.currentMonth);
    }

    /**
     * Setup calendar for given month/year
     */
    setupCalendar(year, month) {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        // Update header
        const monthYearElement = document.getElementById('currentMonthYear');
        if (monthYearElement) {
            monthYearElement.textContent = `${monthNames[month]} ${year}`;
        }
        
        // Get calendar data
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();
        
        // Clear previous days
        const calendarDays = document.getElementById('calendarDays');
        if (!calendarDays) return;
        
        calendarDays.innerHTML = '';
        
        // Add empty cells for days before first day of month
        for (let i = 0; i < startingDay; i++) {
            const dayElement = this.createCalendarDay(
                new Date(year, month, i - startingDay + 1),
                true
            );
            calendarDays.appendChild(dayElement);
        }
        
        // Add days of current month
        const today = new Date();
        for (let day = 1; day <= daysInMonth; day++) {
            const dayDate = new Date(year, month, day);
            const isToday = year === today.getFullYear() && 
                           month === today.getMonth() && 
                           day === today.getDate();
            
            const dayElement = this.createCalendarDay(dayDate, false, isToday);
            calendarDays.appendChild(dayElement);
        }
        
        // Update events for selected day
        this.displayCalendarEvents(this.currentDate);
    }

    /**
     * Create calendar day element
     */
    createCalendarDay(date, isOtherMonth, isToday = false) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = date.getDate();
        dayElement.dataset.date = date.toISOString().split('T')[0];
        
        if (isOtherMonth) {
            dayElement.classList.add('other-month');
        }
        
        if (isToday) {
            dayElement.classList.add('today');
        }
        
        // Check for events on this day
        const eventsOnDay = this.getEventsForDate(date);
        if (eventsOnDay.length > 0) {
            dayElement.classList.add('has-events');
            
            // Add event type indicators
            const indicators = document.createElement('div');
            indicators.className = 'calendar-event-indicators';
            
            eventsOnDay.slice(0, 3).forEach(event => {
                const indicator = document.createElement('div');
                indicator.className = 'calendar-event-indicator';
                indicator.style.backgroundColor = this.eventTypeColors[event.type || 'other'];
                indicators.appendChild(indicator);
            });
            
            dayElement.appendChild(indicators);
            
            // Add event type class for styling
            const mainEventType = eventsOnDay[0].type || 'other';
            dayElement.classList.add(`event-${mainEventType}`);
        }
        
        // Add click handler
        dayElement.addEventListener('click', () => {
            this.selectCalendarDay(date);
        });
        
        return dayElement;
    }

    /**
     * Get events for specific date
     */
    getEventsForDate(date) {
        return this.events.filter(event => {
            const eventDate = new Date(event.date_of_happening);
            return eventDate.getFullYear() === date.getFullYear() &&
                   eventDate.getMonth() === date.getMonth() &&
                   eventDate.getDate() === date.getDate();
        });
    }

    /**
     * Select calendar day
     */
    selectCalendarDay(date) {
        this.currentDate = date;
        
        // Update selected state
        document.querySelectorAll('.calendar-day').forEach(day => {
            day.classList.remove('selected');
        });
        
        const selectedDay = document.querySelector(`.calendar-day[data-date="${date.toISOString().split('T')[0]}"]`);
        if (selectedDay) {
            selectedDay.classList.add('selected');
        }
        
        // Update date filter
        const dateFilter = document.getElementById('dateFilter');
        if (dateFilter) {
            this.setDateFilterValue(date);
        }
        
        this.currentPage = 1;
        this.filterEvents();
        this.updateViews();
        this.checkEmptyState();
    }

    /**
     * Display events for selected day
     */
    displayCalendarEvents(date) {
        const eventsContainer = document.getElementById('calendarEvents');
        const eventsTitle = document.getElementById('calendarEventsTitle');
        
        if (!eventsContainer || !eventsTitle) return;
        
        const eventsForDay = this.getEventsForDate(date);
        const today = new Date();
        const isToday = date.toDateString() === today.toDateString();
        
        eventsTitle.textContent = isToday ? "Today's Events" : `${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
        
        if (eventsForDay.length === 0) {
            eventsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <p>No events scheduled</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        eventsForDay.forEach(event => {
            const eventDate = new Date(event.date_of_happening);
            const timeString = eventDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            html += `
                <div class="calendar-event-item" data-event-id="${event.id}">
                    <div class="calendar-event-time">
                        <i class="fas fa-clock"></i>
                        ${timeString}
                    </div>
                    <div class="calendar-event-name">${event.name}</div>
                    ${event.location ? `
                        <div class="calendar-event-location">
                            <i class="fas fa-map-marker-alt"></i>
                            ${event.location}
                        </div>
                    ` : ''}
                    <div class="event-type-badge event-type-${event.type || 'other'}">
                        <i class="${this.eventTypeIcons[event.type || 'other']}"></i>
                        <span>${this.formatEventType(event.type)}</span>
                    </div>
                </div>
            `;
        });
        
        eventsContainer.innerHTML = html;
        
        // Add click handlers
        eventsContainer.querySelectorAll('.calendar-event-item').forEach(item => {
            item.addEventListener('click', () => {
                const eventId = item.dataset.eventId;
                this.showEventDetails(eventId);
            });
        });
    }

    /**
     * Switch between views
     */
    switchView(view) {
        this.currentView = view;
        
        // Update active tab
        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === view);
        });
        
        // Hide all views
        document.getElementById('calendarView')?.classList.add('hidden');
        document.getElementById('listView')?.classList.add('hidden');
        document.getElementById('detailedView')?.classList.add('hidden');
        
        // Show selected view
        document.getElementById(`${view}View`)?.classList.remove('hidden');
        
        this.updateViews();
    }

    /**
     * Update all views
     */
    updateViews() {
        switch (this.currentView) {
            case 'calendar':
                this.displayCalendarEvents(this.currentDate);
                break;
            case 'list':
                this.displayListView();
                break;
            case 'detailed':
                this.displayDetailedView();
                break;
        }
    }

    /**
     * Display list view
     */
    displayListView() {
        const eventsList = document.getElementById('eventsList');
        if (!eventsList) return;
        
        if (this.filteredEvents.length === 0) {
            eventsList.innerHTML = '<p class="text-center py-8 text-gray-500">No events found</p>';
            return;
        }
        
        // Calculate pagination
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, this.filteredEvents.length);
        this.totalPages = Math.ceil(this.filteredEvents.length / this.pageSize);
        
        let html = '';
        for (let i = startIndex; i < endIndex; i++) {
            const event = this.filteredEvents[i];
            html += this.createListEventItem(event);
        }
        
        eventsList.innerHTML = html;
        
        // Update pagination controls
        this.updatePagination();
        
        // Add click handlers
        this.setupListEventListeners();
    }

    /**
     * Create list event item
     */
    createListEventItem(event) {
        const eventDate = new Date(event.date_of_happening);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const imageUrl = this.getPrimaryEventImageUrl(event);
        const safeName = this.escapeHtml(event.name || 'Event');
        const safeLocation = this.escapeHtml(event.location || '');
        const safeOwner = this.escapeHtml(event.owner_name || 'Family Member');
        
        return `
            <div class="list-event-item" data-event-id="${event.id}">
                ${imageUrl ? `
                    <div class="list-event-media">
                        <img src="${imageUrl}" alt="${safeName}" loading="lazy">
                    </div>
                ` : ''}
                <div class="list-event-date">
                    <div class="list-event-day">${eventDate.getDate()}</div>
                    <div class="list-event-month">${monthNames[eventDate.getMonth()]}</div>
                </div>
                <div class="list-event-content">
                    <div class="list-event-name">${safeName}</div>
                    <div class="list-event-meta">
                        <span>
                            <i class="fas fa-clock"></i>
                            ${eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        ${event.location ? `
                            <span>
                                <i class="fas fa-map-marker-alt"></i>
                                ${safeLocation}
                            </span>
                        ` : ''}
                        <span>
                            <i class="fas fa-user"></i>
                            ${safeOwner}
                        </span>
                    </div>
                </div>
                <div class="list-event-actions">
                    <button class="btn btn-outline btn-sm view-event-btn" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Setup list event listeners
     */
    setupListEventListeners() {
        document.querySelectorAll('.list-event-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.view-event-btn')) {
                    const eventId = item.dataset.eventId;
                    this.showEventDetails(eventId);
                }
            });
            
            const viewBtn = item.querySelector('.view-event-btn');
            viewBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                const eventId = item.dataset.eventId;
                this.showEventDetails(eventId);
            });
        });
    }

    /**
     * Update pagination controls
     */
    updatePagination() {
        const pageInfo = document.getElementById('pageInfo');
        const prevPageBtn = document.getElementById('prevPage');
        const nextPageBtn = document.getElementById('nextPage');
        
        if (pageInfo) {
            pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
        }
        
        if (prevPageBtn) {
            prevPageBtn.disabled = this.currentPage <= 1;
            prevPageBtn.title = this.currentPage <= 1 ? 'First page' : 'Previous page';
        }
        
        if (nextPageBtn) {
            nextPageBtn.disabled = this.currentPage >= this.totalPages;
            nextPageBtn.title = this.currentPage >= this.totalPages ? 'Last page' : 'Next page';
        }
    }

    /**
     * Go to previous page
     */
    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.displayListView();
            this.scrollToTop();
        }
    }

    /**
     * Go to next page
     */
    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.displayListView();
            this.scrollToTop();
        }
    }

    /**
     * Scroll to top of content
     */
    scrollToTop() {
        const currentView = document.getElementById(`${this.currentView}View`);
        if (currentView) {
            currentView.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /**
     * Display detailed view
     */
    displayDetailedView() {
        const detailedEvents = document.getElementById('detailedEvents');
        if (!detailedEvents) return;
        
        if (this.filteredEvents.length === 0) {
            detailedEvents.innerHTML = '<p class="text-center py-8 text-gray-500">No events found</p>';
            return;
        }
        
        let html = '';
        this.filteredEvents.forEach(event => {
            html += this.createDetailedEventCard(event);
        });
        
        detailedEvents.innerHTML = html;
        
        // Add click handlers
        detailedEvents.querySelectorAll('.detailed-event-card').forEach(card => {
            card.addEventListener('click', () => {
                const eventId = card.dataset.eventId;
                this.showEventDetails(eventId);
            });
        });
    }

    /**
     * Create detailed event card
     */
    createDetailedEventCard(event) {
        const eventDate = new Date(event.date_of_happening);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const imageUrl = this.getPrimaryEventImageUrl(event);
        const safeName = this.escapeHtml(event.name || 'Event');
        const safeDetails = this.escapeHtml(event.details || 'No description available');
        const safeLocation = this.escapeHtml(event.location || '');
        const safeOwner = this.escapeHtml(event.owner_name || 'Family Member');
        const today = new Date();
        const diffDays = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
        
        let urgencyBadge = '';
        if (diffDays === 0) {
            urgencyBadge = '<div class="event-urgency-badge today">Today</div>';
        } else if (diffDays === 1) {
            urgencyBadge = '<div class="event-urgency-badge tomorrow">Tomorrow</div>';
        } else if (diffDays <= 7) {
            urgencyBadge = `<div class="event-urgency-badge soon">In ${diffDays} days</div>`;
        }
        
        return `
            <div class="detailed-event-card" data-event-id="${event.id}">
                <div class="detailed-event-image ${imageUrl ? 'has-photo' : ''}" style="${imageUrl ? '' : `background: ${this.eventTypeColors[event.type || 'other']}22`}">
                    ${imageUrl ? `<img src="${imageUrl}" alt="${safeName}" loading="lazy">` : ''}
                    <div class="detailed-event-date">
                        <div class="detailed-event-day">${eventDate.getDate()}</div>
                        <div class="detailed-event-month">${monthNames[eventDate.getMonth()]}</div>
                    </div>
                    ${urgencyBadge}
                    <div class="event-type-icon">
                        <i class="${this.eventTypeIcons[event.type || 'other']}"></i>
                    </div>
                </div>
                <div class="detailed-event-content">
                    <div class="detailed-event-name">${safeName}</div>
                    <div class="detailed-event-description">${safeDetails}</div>
                    <div class="detailed-event-meta">
                        <div class="detailed-event-meta-item">
                            <i class="fas fa-clock"></i>
                            ${eventDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        ${event.location ? `
                            <div class="detailed-event-meta-item">
                                <i class="fas fa-map-marker-alt"></i>
                                ${safeLocation}
                            </div>
                        ` : ''}
                        <div class="detailed-event-meta-item">
                            <i class="fas fa-user"></i>
                            ${safeOwner}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Show event details
     */
    async showEventDetails(eventId) {
        try {
            const response = await fetch(`/api/v1/events/events/${eventId}`, {
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (response.ok) {
                this.selectedEvent = await response.json();
                this.displayEventDetails();
            } else {
                throw new Error('Failed to load event details');
            }
        } catch (error) {
            console.error('[EventsApp] Error loading event details:', error);
            this.showNotification('Error loading event details', 'error');
        }
    }

    /**
     * Display event details in modal
     */
    displayEventDetails() {
        if (!this.selectedEvent) return;
        
        const eventDate = new Date(this.selectedEvent.date_of_happening);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const eventType = this.selectedEvent.type || 'other';
        
        // Update modal content
        const title = document.getElementById('eventDetailsTitle');
        const name = document.getElementById('eventDetailsName');
        const dateBadge = document.getElementById('eventDateBadge');
        const timeElement = document.getElementById('eventDetailsTime');
        const locationElement = document.getElementById('eventDetailsLocation');
        const ownerElement = document.getElementById('eventDetailsOwner');
        const descriptionElement = document.getElementById('eventDetailsDescription');
        const editBtn = document.getElementById('btnEditEvent');
        const deleteBtn = document.getElementById('btnDeleteEvent');
        const typeBadge = document.getElementById('eventTypeBadge');
        
        if (title) title.textContent = 'Event Details';
        if (name) name.textContent = this.selectedEvent.name;
        
        if (dateBadge) {
            dateBadge.innerHTML = `
                <div class="event-date-day">${eventDate.getDate()}</div>
                <div class="event-date-month">${monthNames[eventDate.getMonth()]}</div>
                <div class="event-date-year">${eventDate.getFullYear()}</div>
            `;
        }
        
        if (typeBadge) {
            typeBadge.className = `event-type-badge event-type-${eventType}`;
            typeBadge.innerHTML = `
                <i class="${this.eventTypeIcons[eventType]}"></i>
                <span>${this.formatEventType(eventType)}</span>
            `;
        }
        
        if (timeElement) {
            const timeSpan = timeElement.querySelector('span');
            if (timeSpan) {
                timeSpan.textContent = eventDate.toLocaleString('en-US', {
                    weekday: 'long',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        }
        
        if (locationElement) {
            const locationSpan = locationElement.querySelector('span');
            if (locationSpan) {
                locationSpan.textContent = this.selectedEvent.location || 'Location not specified';
            }
            locationElement.style.display = this.selectedEvent.location ? 'flex' : 'none';
        }
        
        if (ownerElement) {
            const ownerSpan = ownerElement.querySelector('span');
            if (ownerSpan) {
                ownerSpan.textContent = this.selectedEvent.owner_name || 'Family Member';
            }
        }
        
        if (descriptionElement) {
            descriptionElement.textContent = this.selectedEvent.details || 'No description available';
        }
        
        // Show/hide action buttons based on ownership
        const isOwner = this.currentUser && this.currentUser.id === this.selectedEvent.created_by;
        if (editBtn) {
            editBtn.style.display = isOwner ? 'inline-flex' : 'none';
            editBtn.disabled = !isOwner;
        }
        if (deleteBtn) {
            deleteBtn.style.display = isOwner ? 'inline-flex' : 'none';
            deleteBtn.disabled = !isOwner;
        }
        
        // Load event pictures
        this.loadEventPictures();
        
        this.openModal('eventDetailsModal');
    }

    /**
     * Load event pictures
     */
    async loadEventPictures() {
        if (!this.selectedEvent) return;
        
        const picturesGrid = document.getElementById('eventPicturesGrid');
        const picturesSection = document.getElementById('eventPicturesSection');
        
        if (!picturesGrid || !picturesSection) return;
        
        try {
            const response = await fetch(`/api/v1/events/events/${this.selectedEvent.id}/pictures`);
            
            if (response.ok) {
                const data = await response.json();
                this.displayEventPictures(data.items || []);
            } else {
                picturesGrid.innerHTML = '<p class="text-gray-500 text-center py-4">No pictures uploaded yet</p>';
                picturesSection.style.display = 'none';
            }
        } catch (error) {
            console.warn('[EventsApp] Error loading pictures:', error);
            picturesGrid.innerHTML = '<p class="text-gray-500 text-center py-4">Error loading pictures</p>';
            picturesSection.style.display = 'none';
        }
    }

    /**
     * Display event pictures
     */
    displayEventPictures(pictures) {
        const picturesGrid = document.getElementById('eventPicturesGrid');
        const picturesSection = document.getElementById('eventPicturesSection');
        
        if (!picturesGrid || !picturesSection) return;
        
        if (pictures.length === 0) {
            picturesGrid.innerHTML = '<p class="text-gray-500 text-center py-4">No pictures uploaded yet</p>';
            picturesSection.style.display = 'none';
            return;
        }
        
        picturesSection.style.display = 'block';
        
        let html = '';
        pictures.forEach(picture => {
            const imageUrl = this.resolveImageUrl(picture.file_path);
            
            html += `
                <div class="event-picture-item" data-picture-id="${picture.id}">
                    <img src="${imageUrl}" alt="${this.escapeHtml(picture.description || 'Event picture')}" 
                         loading="lazy" data-description="${this.escapeHtml(picture.description || '')}">
                    ${picture.description ? `
                        <div class="event-picture-overlay">${this.escapeHtml(picture.description)}</div>
                    ` : ''}
                </div>
            `;
        });
        
        picturesGrid.innerHTML = html;
        
        // Add click handlers for picture view
        picturesGrid.querySelectorAll('.event-picture-item').forEach(item => {
            item.addEventListener('click', () => {
                const img = item.querySelector('img');
                const description = img.dataset.description;
                this.showPictureView(img.src, description);
            });
        });
    }

    /**
     * Show picture in fullscreen view
     */
    showPictureView(imageSrc, description) {
        const image = document.getElementById('fullscreenImage');
        const title = document.getElementById('pictureViewTitle');
        const descriptionText = document.getElementById('pictureDescriptionText');
        
        if (image) image.src = imageSrc;
        if (title) title.textContent = 'Event Picture';
        if (descriptionText) descriptionText.textContent = description || 'No description';
        
        this.openModal('pictureViewModal');
    }

    /**
     * Open create event modal
     */
    openCreateEventModal() {
        if (!this.currentUser) {
            this.showNotification('Please login to create events', 'info');
            // Optionally redirect to login
            window.location.href = '/login?return=/events';
            return;
        }
        
        this.editMode = false;
        this.editingEventId = null;
        
        const title = document.getElementById('eventFormTitle');
        const submitBtnText = document.getElementById('submitBtnText');
        
        if (title) title.textContent = 'Create New Event';
        if (submitBtnText) submitBtnText.textContent = 'Create Event';

        // Reset form first so default date and time values are preserved afterwards.
        const form = document.getElementById('eventForm');
        if (form) form.reset();
        
        // Set default date and time to now
        const now = new Date();
        const dateInput = document.getElementById('eventDate');
        const timeInput = document.getElementById('eventTime');
        
        if (dateInput) {
            dateInput.value = now.toISOString().split('T')[0];
            dateInput.min = '2000-01-01';
            dateInput.max = '2100-12-31';
        }
        
        if (timeInput) {
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            timeInput.value = `${hours}:${minutes}`;
        }

        // Reset categories
        document.querySelectorAll('input[name="eventCategory"]').forEach(cb => {
            cb.checked = false;
        });
        
        // Reset picture upload
        const filePreview = document.getElementById('filePreview');
        const fileUploadContent = document.getElementById('fileUploadContent');
        if (filePreview) filePreview.classList.add('hidden');
        if (fileUploadContent) fileUploadContent.classList.remove('hidden');
        
        this.openModal('eventFormModal');
    }

    /**
     * Save event (create or update)
     */
    async saveEvent() {
        if (!this.currentUser) {
            this.showNotification('Please login to save events', 'error');
            window.location.href = '/login?return=/events';
            return;
        }

        // Validate form
        if (!this.validateEventForm()) {
            return;
        }

        const formData = this.getEventFormData();
        const token = localStorage.getItem('family_token');
        
        if (!token) {
            this.showNotification('Authentication required', 'error');
            return;
        }

        this.showLoading();
        
        try {
            let response;
            
            if (this.editMode && this.editingEventId) {
                // Update existing event
                response = await fetch(`/api/v1/events/events/${this.editingEventId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(formData.eventData)
                });
            } else {
                // Create new event
                response = await fetch('/api/v1/events/events', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(formData.eventData)
                });
            }

            if (response.ok) {
                const event = await response.json();
                
                // Upload picture if provided
                if (formData.pictureFile) {
                    await this.uploadEventPictureForEvent(event.id, formData.pictureFile);
                }
                
                this.showNotification(
                    this.editMode ? 'Event updated successfully!' : 'Event created successfully!',
                    'success'
                );
                
                this.closeModal('eventFormModal');
                this.resetEventForm();
                await this.loadInitialData();
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to save event');
            }
        } catch (error) {
            console.error('[EventsApp] Error saving event:', error);
            this.showNotification(error.message || 'Network error. Please try again.', 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Validate event form
     */
    validateEventForm() {
        const name = document.getElementById('eventName').value.trim();
        const description = document.getElementById('eventDescription').value.trim();
        const date = document.getElementById('eventDate').value;
        const time = document.getElementById('eventTime').value;
        const type = document.getElementById('eventType').value;

        if (!name) {
            this.showNotification('Event name is required', 'error');
            return false;
        }

        if (!description) {
            this.showNotification('Event description is required', 'error');
            return false;
        }

        if (!date || !time) {
            this.showNotification('Event date and time are required', 'error');
            return false;
        }

        if (!type) {
            this.showNotification('Event type is required', 'error');
            return false;
        }

        // Check if date is in the past
        const eventDateTime = new Date(`${date}T${time}`);
        if (eventDateTime < new Date() && !this.editMode) {
            if (!confirm('This event date is in the past. Do you want to create it anyway?')) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get event form data
     */
    getEventFormData() {
        const name = document.getElementById('eventName').value.trim();
        const description = document.getElementById('eventDescription').value.trim();
        const date = document.getElementById('eventDate').value;
        const time = document.getElementById('eventTime').value;
        const location = document.getElementById('eventLocation').value.trim();
        const type = document.getElementById('eventType').value;
        const pictureFile = document.getElementById('eventPicture').files[0];
        
        // Get selected categories
        const categories = [];
        document.querySelectorAll('input[name="eventCategory"]:checked').forEach(cb => {
            categories.push(cb.value);
        });

        // Combine date and time
        const dateTime = new Date(`${date}T${time}`);
        
        return {
            eventData: {
                name: name,
                details: description,
                date_of_happening: dateTime.toISOString(),
                location: location || null,
                type: type,
                categories: categories.length > 0 ? categories : null
            },
            pictureFile: pictureFile
        };
    }

    /**
     * Upload picture for event
     */
    async uploadEventPictureForEvent(eventId, file) {
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch(`/api/v1/events/events/${eventId}/pictures`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            return response.ok;
        } catch (error) {
            console.warn('[EventsApp] Error uploading picture:', error);
            return false;
        }
    }

    /**
     * Edit event
     */
    editEvent() {
        if (!this.selectedEvent) return;
        
        this.editMode = true;
        this.editingEventId = this.selectedEvent.id;
        
        const title = document.getElementById('eventFormTitle');
        const submitBtnText = document.getElementById('submitBtnText');
        
        if (title) title.textContent = 'Edit Event';
        if (submitBtnText) submitBtnText.textContent = 'Update Event';
        
        // Populate form with event data
        const eventDate = new Date(this.selectedEvent.date_of_happening);
        
        document.getElementById('eventName').value = this.selectedEvent.name;
        document.getElementById('eventDescription').value = this.selectedEvent.details || '';
        document.getElementById('eventDate').value = eventDate.toISOString().split('T')[0];
        document.getElementById('eventTime').value = 
            eventDate.getHours().toString().padStart(2, '0') + ':' + 
            eventDate.getMinutes().toString().padStart(2, '0');
        document.getElementById('eventLocation').value = this.selectedEvent.location || '';
        document.getElementById('eventType').value = this.selectedEvent.type || 'other';
        
        // Set categories
        document.querySelectorAll('input[name="eventCategory"]').forEach(cb => {
            cb.checked = (this.selectedEvent.categories || []).includes(cb.value);
        });
        
        this.closeModal('eventDetailsModal');
        this.openModal('eventFormModal');
    }

    /**
     * Confirm event deletion
     */
    confirmDeleteEvent() {
        if (!this.selectedEvent) return;
        
        if (!confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
            return;
        }
        
        this.deleteEvent();
    }

    /**
     * Delete event
     */
    async deleteEvent() {
        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch(`/api/v1/events/events/${this.selectedEvent.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                this.showNotification('Event deleted successfully', 'success');
                this.closeModal('eventDetailsModal');
                await this.loadInitialData();
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to delete event');
            }
        } catch (error) {
            console.error('[EventsApp] Error deleting event:', error);
            this.showNotification(error.message || 'Network error. Please try again.', 'error');
        }
    }

    /**
     * Open upload picture modal
     */
    openUploadPictureModal() {
        if (!this.currentUser) {
            this.showNotification('Please login to upload pictures', 'info');
            // Optionally redirect to login
            window.location.href = '/login?return=/events';
            return;
        }
        
        if (!this.selectedEvent) return;
        
        document.getElementById('uploadEventId').value = this.selectedEvent.id;
        this.openModal('uploadPictureModal');
    }

    /**
     * Upload event picture
     */
    async uploadEventPicture() {
        const eventId = document.getElementById('uploadEventId').value;
        const pictureFile = document.getElementById('pictureFile').files[0];
        const description = document.getElementById('pictureDescription').value.trim();

        if (!pictureFile) {
            this.showNotification('Please select a picture to upload', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', pictureFile);
        if (description) {
            formData.append('description', description);
        }

        this.showLoading();
        
        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch(`/api/v1/events/events/${eventId}/pictures`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (response.ok) {
                this.showNotification('Picture uploaded successfully', 'success');
                this.closeModal('uploadPictureModal');
                this.resetUploadForm();
                
                // Reload event details to show new picture
                if (this.selectedEvent) {
                    await this.showEventDetails(this.selectedEvent.id);
                }
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to upload picture');
            }
        } catch (error) {
            console.error('[EventsApp] Error uploading picture:', error);
            this.showNotification(error.message || 'Network error. Please try again.', 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Reset event form
     */
    resetEventForm() {
        const form = document.getElementById('eventForm');
        if (form) form.reset();
        
        const filePreview = document.getElementById('filePreview');
        const fileUploadContent = document.getElementById('fileUploadContent');
        
        if (filePreview) filePreview.classList.add('hidden');
        if (fileUploadContent) fileUploadContent.classList.remove('hidden');
        
        this.editMode = false;
        this.editingEventId = null;
    }

    /**
     * Reset upload form
     */
    resetUploadForm() {
        const form = document.getElementById('uploadPictureForm');
        if (form) form.reset();
        
        const picturePreview = document.getElementById('picturePreview');
        const pictureUploadContent = document.getElementById('pictureUploadContent');
        
        if (picturePreview) picturePreview.classList.add('hidden');
        if (pictureUploadContent) pictureUploadContent.classList.remove('hidden');
    }

    /**
     * Open modal
     */
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
        }
    }

    /**
     * Close modal
     */
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        }
    }

    /**
     * Close all modals
     */
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
    }

    /**
     * Show loading overlay
     */
    showLoading() {
        const loading = document.getElementById('eventsLoading');
        if (loading) {
            loading.style.display = 'flex';
            loading.classList.add('fade-in');
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const loading = document.getElementById('eventsLoading');
        if (loading) {
            loading.classList.remove('fade-in');
            setTimeout(() => {
                loading.style.display = 'none';
            }, 300);
        }
    }

    /**
     * Check and show empty state
     */
    checkEmptyState() {
        const noEvents = document.getElementById('noEvents');
        const calendarView = document.getElementById('calendarView');
        const listView = document.getElementById('listView');
        const detailedView = document.getElementById('detailedView');

        if (this.events.length === 0) {
            noEvents?.classList.remove('hidden');
            calendarView?.classList.add('hidden');
            listView?.classList.add('hidden');
            detailedView?.classList.add('hidden');
        } else {
            noEvents?.classList.add('hidden');
            document.getElementById(`${this.currentView}View`)?.classList.remove('hidden');
        }
    }

    parseDateInput(dateString) {
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    setDateFilterValue(date) {
        const dateFilter = document.getElementById('dateFilter');
        if (!dateFilter) {
            return;
        }

        dateFilter.value = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0'),
        ].join('-');
    }

    resolveImageUrl(filePath) {
        if (!filePath) {
            return '';
        }

        if (filePath.startsWith('http') || filePath.startsWith('data:')) {
            return filePath;
        }

        const normalizedPath = filePath.replace(/^\/+/, '');
        if (normalizedPath.startsWith('uploads/')) {
            return `/${normalizedPath}`;
        }

        if (normalizedPath.startsWith('static/')) {
            return `/${normalizedPath}`;
        }

        return `/uploads/${normalizedPath}`;
    }

    getPrimaryEventImageUrl(event) {
        if (!event?.pictures || event.pictures.length === 0) {
            return '';
        }

        return this.resolveImageUrl(event.pictures[0].file_path);
    }

    escapeHtml(value) {
        return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    /**
     * Handle window resize
     */
    handleResize() {
        // Adjust calendar view on mobile
        if (window.innerWidth < 768) {
            document.querySelectorAll('.calendar-day').forEach(day => {
                day.style.fontSize = '12px';
            });
        } else {
            document.querySelectorAll('.calendar-day').forEach(day => {
                day.style.fontSize = '';
            });
        }
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        if (window.familyApp && typeof window.familyApp.showNotification === 'function') {
            window.familyApp.showNotification(message, type);
        } else {
            // Fallback notification
            const notification = document.createElement('div');
            notification.className = `notification notification-${type}`;
            notification.innerHTML = `
                <div class="notification-content">
                    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                    <span>${message}</span>
                </div>
                <button class="notification-close">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
                color: white;
                padding: 16px 24px;
                border-radius: 12px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                z-index: 10000;
                animation: slideInRight 0.3s ease-out;
                max-width: 400px;
            `;
            
            const closeBtn = notification.querySelector('.notification-close');
            closeBtn.addEventListener('click', () => {
                notification.style.animation = 'slideInRight 0.3s ease-out reverse';
                setTimeout(() => notification.remove(), 300);
            });
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.animation = 'slideInRight 0.3s ease-out reverse';
                    setTimeout(() => notification.remove(), 300);
                }
            }, 5000);
        }
    }
}

/**
 * Debounce function for performance
 */
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

/**
 * Initialize app when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're offline
    if (!navigator.onLine) {
        console.warn('[EventsApp] Starting in offline mode');
    }
    
    // Initialize the app
    window.eventsApp = new EventsApp();
    
    // Update time display if exists
    if (typeof window.familyApp !== 'undefined' && window.familyApp.updateTime) {
        window.familyApp.updateTime();
    }
});

/**
 * Error boundary for unhandled errors
 */
window.addEventListener('error', (event) => {
    console.error('[EventsApp] Unhandled error:', event.error);
    // You might want to send this to an error tracking service
});

/**
 * Unhandled promise rejection handler
 */
window.addEventListener('unhandledrejection', (event) => {
    console.error('[EventsApp] Unhandled promise rejection:', event.reason);
    event.preventDefault();
});
