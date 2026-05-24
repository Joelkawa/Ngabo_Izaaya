class FamilyApp {
    constructor() {
        this.menuToggle = document.getElementById('menuToggle');
        this.mobileMenu = document.getElementById('mobileMenu');
        this.overlay = document.getElementById('overlay');
        this.desktopAuthActions = document.getElementById('desktopAuthActions');
        this.mobileAuthActions = document.getElementById('mobileAuthActions');
        this.requestsModal = document.getElementById('requestsModal');
        this.requestsModalBody = document.getElementById('requestsModalBody');
        this.currentUser = null;
        this.pendingRequests = [];
        this.carouselState = {
            currentIndex: 0,
            autoSlideInterval: null,
        };

        this.initializeApp();
        this.setupEventListeners();
        this.loadInitialData();
    }

    initializeApp() {
        console.log('Ngabo Izaaya Association website initialized');
        this.setupNavigation();
        this.setActiveNavItem();
        this.updateTime();
    }

    setupNavigation() {
        if (this.menuToggle) {
            this.menuToggle.addEventListener('click', () => {
                this.toggleMenu();
            });
        }

        if (this.overlay) {
            this.overlay.addEventListener('click', () => this.closeMenu());
        }

        document.querySelectorAll('.mobile-nav-link').forEach((link) => {
            link.addEventListener('click', () => this.closeMenu());
        });
    }

    toggleMenu(forceState = null) {
        if (!this.mobileMenu || !this.menuToggle || !this.overlay) {
            return;
        }

        const shouldOpen = forceState === null ? !this.mobileMenu.classList.contains('active') : forceState;

        this.mobileMenu.classList.toggle('active', shouldOpen);
        this.overlay.classList.toggle('active', shouldOpen);
        this.menuToggle.classList.toggle('active', shouldOpen);
        this.menuToggle.setAttribute('aria-expanded', String(shouldOpen));
        document.body.classList.toggle('menu-open', shouldOpen);
    }

    closeMenu() {
        this.toggleMenu(false);
    }

    setActiveNavItem() {
        const currentPath = window.location.pathname;
        let currentPage = 'home';

        if (currentPath === '/' || currentPath === '/index.html') {
            currentPage = 'home';
        } else if (currentPath.startsWith('/family')) {
            currentPage = 'family';
        } else if (currentPath.startsWith('/history')) {
            currentPage = 'history';
        } else if (currentPath.startsWith('/events')) {
            currentPage = 'events';
        } else if (currentPath.startsWith('/posts')) {
            currentPage = 'posts';
        } else if (currentPath.startsWith('/messages')) {
            currentPage = 'messages';
        }

        document.querySelectorAll('.site-nav-link, .mobile-nav-link').forEach((item) => {
            item.classList.toggle('active', item.getAttribute('data-page') === currentPage);
        });
    }

    async navigateTo(page) {
        const pages = {
            home: '/',
            family: '/family',
            history: '/history',
            events: '/events',
            posts: '/posts',
            messages: '/messages',
        };

        if (pages[page]) {
            window.location.href = pages[page];
        }
    }

    async loadInitialData() {
        await this.checkAuthentication();

        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
            return;
        }

        try {
            await Promise.all([
                this.loadUpcomingEvents(),
                this.loadAnnouncements(),
                this.loadFamilyStats(),
            ]);
        } catch (error) {
            console.error('Error loading homepage data:', error);
        }
    }

    async loadUpcomingEvents() {
        try {
            const response = await fetch('/api/v1/events/calendar/upcoming?days=3650&limit=6', {
                headers: {
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to load upcoming events: ${response.status}`);
            }

            const events = await response.json();
            this.displayEvents(events);
        } catch (error) {
            console.error('Error loading events:', error);
            this.displayEvents([]);
        }
    }

    displayEvents(events) {
        const eventsContainer = document.getElementById('eventsList');
        if (!eventsContainer) {
            return;
        }

        this.setCarouselControlsVisible(events.length > 1);
        eventsContainer.innerHTML = '';

        if (!events.length) {
            eventsContainer.innerHTML = `
                <div class="carousel-item">
                    <div class="event-card">
                        <div class="event-content">
                            <h3 class="event-title">No upcoming events yet</h3>
                            <p class="event-description">
                                There are currently no future association events in the database.
                                Add a new event from the events page and it will appear here automatically.
                            </p>
                            <div class="event-tags">
                                <span class="event-tag">Stay tuned</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        events.forEach((event) => {
            const eventDate = new Date(event.date_of_happening);
            const formattedDate = eventDate.toLocaleDateString('en-UG', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
            const visual = this.getEventVisual(event);
            const eventName = this.escapeHtml(event.name || 'Association Event');
            const location = this.escapeHtml(event.location || 'Location to be confirmed');
            const details = this.escapeHtml(
                event.details || 'Association event details will be available on the events page.'
            );
            const hostLabel = this.escapeHtml(
                event.owner_name && event.owner_name !== 'Unknown' ? event.owner_name : 'Association'
            );

            const eventElement = `
                <div class="carousel-item">
                    <div class="event-card">
                        <div class="event-image">
                            <div class="animate-float">${visual}</div>
                        </div>
                        <div class="event-content">
                            <h3 class="event-title">${eventName}</h3>
                            <div class="event-date">
                                <i class="fas fa-calendar"></i>
                                <span>${formattedDate}</span>
                            </div>
                            <p class="event-description">${details}</p>
                            <div class="event-tags">
                                <span class="event-tag">${location}</span>
                                <span class="event-tag">${hostLabel}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            eventsContainer.insertAdjacentHTML('beforeend', eventElement);
        });

        this.setupCarousel();
    }

    setCarouselControlsVisible(isVisible) {
        document.querySelectorAll('.carousel-btn').forEach((button) => {
            button.style.display = isVisible ? 'flex' : 'none';
        });
    }

    getEventVisual(event) {
        const content = `${event.name || ''} ${event.details || ''}`.toLowerCase();

        if (content.includes('heritage') || content.includes('history') || content.includes('documentation')) {
            return '📜';
        }
        if (content.includes('youth') || content.includes('mentor') || content.includes('education')) {
            return '🌱';
        }
        if (content.includes('celebration') || content.includes('festival') || content.includes('reunion')) {
            return '🎉';
        }
        if (content.includes('meeting') || content.includes('executive') || content.includes('committee')) {
            return '🗂️';
        }
        if (content.includes('assembly') || content.includes('conference') || content.includes('forum')) {
            return '🏛️';
        }

        return '📅';
    }

    escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    setupCarousel() {
        const carouselTrack = document.querySelector('.carousel-track');
        const carouselItems = Array.from(document.querySelectorAll('.carousel-item'));
        const prevBtn = document.querySelector('.carousel-btn.prev');
        const nextBtn = document.querySelector('.carousel-btn.next');

        if (!carouselTrack || carouselItems.length === 0) {
            return;
        }

        if (this.carouselState.autoSlideInterval) {
            clearInterval(this.carouselState.autoSlideInterval);
        }

        const getVisibleItems = () => {
            if (window.innerWidth >= 1024) {
                return 3;
            }
            if (window.innerWidth >= 768) {
                return 2;
            }
            return 1;
        };

        const updateCarousel = () => {
            const visibleItems = getVisibleItems();
            const maxIndex = Math.max(carouselItems.length - visibleItems, 0);
            const itemWidth = 100 / visibleItems;

            if (this.carouselState.currentIndex > maxIndex) {
                this.carouselState.currentIndex = 0;
            }

            carouselTrack.style.transform = `translateX(-${this.carouselState.currentIndex * itemWidth}%)`;

            if (prevBtn) {
                prevBtn.disabled = maxIndex === 0;
            }
            if (nextBtn) {
                nextBtn.disabled = maxIndex === 0;
            }
        };

        const nextSlide = () => {
            const visibleItems = getVisibleItems();
            const maxIndex = Math.max(carouselItems.length - visibleItems, 0);

            if (maxIndex === 0) {
                return;
            }

            this.carouselState.currentIndex =
                this.carouselState.currentIndex >= maxIndex ? 0 : this.carouselState.currentIndex + 1;
            updateCarousel();
        };

        const prevSlide = () => {
            const visibleItems = getVisibleItems();
            const maxIndex = Math.max(carouselItems.length - visibleItems, 0);

            if (maxIndex === 0) {
                return;
            }

            this.carouselState.currentIndex =
                this.carouselState.currentIndex <= 0 ? maxIndex : this.carouselState.currentIndex - 1;
            updateCarousel();
        };

        if (prevBtn) {
            prevBtn.onclick = prevSlide;
        }

        if (nextBtn) {
            nextBtn.onclick = nextSlide;
        }

        const startAutoSlide = () => {
            this.carouselState.autoSlideInterval = window.setInterval(nextSlide, 5000);
        };

        const stopAutoSlide = () => {
            if (this.carouselState.autoSlideInterval) {
                clearInterval(this.carouselState.autoSlideInterval);
            }
        };

        carouselTrack.onmouseenter = stopAutoSlide;
        carouselTrack.onmouseleave = startAutoSlide;

        startAutoSlide();
        updateCarousel();
        this.carouselState.updateCarousel = updateCarousel;
    }

    async loadAnnouncements() {
        try {
            const response = await fetch('/api/v1/announcements/current-month?limit=8', {
                headers: {
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to load announcements: ${response.status}`);
            }

            const data = await response.json();
            this.displayAnnouncements(data.items || []);
        } catch (error) {
            console.error('Error loading announcements:', error);
            this.displayAnnouncements([]);
        }
    }

    displayAnnouncements(announcements) {
        const announcementsContainer = document.getElementById('announcementsList');
        if (!announcementsContainer) {
            return;
        }

        announcementsContainer.innerHTML = '';

        if (!announcements.length) {
            announcementsContainer.innerHTML = `
                <div class="announcement-empty">
                    <strong>No announcements for this month.</strong>
                    <p class="mt-4">When an announcement is created for the current month, it will appear here automatically.</p>
                </div>
            `;
            return;
        }

        announcements.forEach((announcement) => {
            const announcementDate = new Date(announcement.announcement_date);
            const formattedDate = announcementDate.toLocaleDateString('en-UG', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });
            const title = this.escapeHtml(announcement.title || 'Association Announcement');
            const creator = this.escapeHtml(announcement.creator_name || 'Association');
            const content = this.escapeHtml(announcement.content || '');

            const announcementElement = `
                <div class="announcement-card animate-fade-up">
                    <h4 class="announcement-title">${title}</h4>
                    <div class="announcement-date">
                        <i class="fas fa-clock"></i> ${formattedDate}
                        <span class="announcement-author">
                            <i class="fas fa-user"></i> ${creator}
                        </span>
                    </div>
                    <p class="announcement-content">${content}</p>
                </div>
            `;

            announcementsContainer.insertAdjacentHTML('beforeend', announcementElement);
        });
    }

    getAuthToken() {
        return localStorage.getItem('family_token');
    }

    getAuthHeaders() {
        const token = this.getAuthToken();
        return token
            ? {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            }
            : { Accept: 'application/json' };
    }

    isAdminUser() {
        if (!this.currentUser) {
            return false;
        }

        const role = typeof this.currentUser.role === 'string'
            ? this.currentUser.role
            : this.currentUser.role?.name;

        return role === 'admin';
    }

    renderAuthActions() {
        if (this.desktopAuthActions) {
            this.desktopAuthActions.innerHTML = this.getAuthActionsMarkup();
        }

        if (this.mobileAuthActions) {
            this.mobileAuthActions.innerHTML = this.getAuthActionsMarkup({ mobile: true });
        }

        this.bindAuthActionButtons();
    }

    getAuthActionsMarkup({ mobile = false } = {}) {
        const sizeClass = mobile ? '' : ' btn-small';
        const fullWidthClass = mobile ? ' w-full' : '';

        if (!this.currentUser) {
            return `
                <a href="/login" class="btn btn-outline${sizeClass}${fullWidthClass}">Member Login</a>
                <a href="/register" class="btn btn-primary${sizeClass}${fullWidthClass}">Join the Association</a>
            `;
        }

        if (this.isAdminUser()) {
            const countMarkup = this.pendingRequests.length
                ? `<span class="requests-count-badge">${this.pendingRequests.length}</span>`
                : '';

            return `
                <button class="btn btn-outline${sizeClass}${fullWidthClass}" type="button" data-auth-action="open-requests">
                    <i class="fas fa-user-clock"></i>
                    <span>Requests</span>
                    ${countMarkup}
                </button>
                <button class="btn btn-primary${sizeClass}${fullWidthClass}" type="button" data-auth-action="logout">
                    <i class="fas fa-right-from-bracket"></i>
                    <span>Logout</span>
                </button>
            `;
        }

        return `
            <button class="btn btn-primary${sizeClass}${fullWidthClass}" type="button" data-auth-action="logout">
                <i class="fas fa-right-from-bracket"></i>
                <span>Logout</span>
            </button>
        `;
    }

    bindAuthActionButtons() {
        document.querySelectorAll('[data-auth-action="logout"]').forEach((button) => {
            button.onclick = () => this.logout();
        });

        document.querySelectorAll('[data-auth-action="open-requests"]').forEach((button) => {
            button.onclick = async () => {
                this.closeMenu();
                await this.openRequestsModal();
            };
        });
    }

    async checkAuthentication() {
        const token = this.getAuthToken();
        if (!token) {
            this.currentUser = null;
            this.pendingRequests = [];
            this.closeRequestsModal();
            this.toggleAnnouncementCreateButton(false);
            this.renderAuthActions();
            return null;
        }

        try {
            const response = await fetch('/api/v1/auth/users/me', {
                headers: this.getAuthHeaders(),
            });

            if (!response.ok) {
                throw new Error(`Authentication check failed: ${response.status}`);
            }

            this.currentUser = await response.json();
            this.toggleAnnouncementCreateButton(true);
            if (this.isAdminUser()) {
                await this.loadPendingRequests({ silent: true });
            } else {
                this.pendingRequests = [];
            }
            this.renderAuthActions();
            return this.currentUser;
        } catch (error) {
            console.warn('Authentication check failed:', error);
            localStorage.removeItem('family_token');
            this.currentUser = null;
            this.pendingRequests = [];
            this.closeRequestsModal();
            this.toggleAnnouncementCreateButton(false);
            this.renderAuthActions();
            return null;
        }
    }

    toggleAnnouncementCreateButton(isVisible) {
        const button = document.getElementById('btnCreateAnnouncement');
        if (!button) {
            return;
        }

        button.classList.toggle('hidden', !isVisible);
    }

    syncModalBodyState() {
        const isAnyModalOpen = Boolean(document.querySelector('.announcement-modal.is-open'));
        document.body.classList.toggle('modal-open', isAnyModalOpen);
    }

    async loadPendingRequests({ silent = false } = {}) {
        if (!this.isAdminUser()) {
            this.pendingRequests = [];
            this.renderAuthActions();
            return [];
        }

        try {
            const response = await fetch('/api/v1/auth/requests', {
                headers: this.getAuthHeaders(),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || `Failed to load requests: ${response.status}`);
            }

            this.pendingRequests = await response.json();
            this.renderAuthActions();
            return this.pendingRequests;
        } catch (error) {
            console.error('Membership request loading error:', error);
            this.pendingRequests = [];
            this.renderAuthActions();
            if (!silent) {
                this.showNotification(error.message || 'Failed to load membership requests.', 'error');
            }
            return [];
        }
    }

    async openRequestsModal() {
        if (!this.isAdminUser()) {
            this.showNotification('Only admins can review membership requests.', 'info');
            return;
        }

        if (!this.requestsModal) {
            return;
        }

        this.requestsModal.classList.add('is-open');
        this.requestsModal.setAttribute('aria-hidden', 'false');
        this.syncModalBodyState();
        this.renderPendingRequests(true);
        await this.loadPendingRequests({ silent: false });
        this.renderPendingRequests();
    }

    closeRequestsModal() {
        if (!this.requestsModal) {
            return;
        }

        this.requestsModal.classList.remove('is-open');
        this.requestsModal.setAttribute('aria-hidden', 'true');
        this.syncModalBodyState();
    }

    renderPendingRequests(isLoading = false) {
        if (!this.requestsModalBody) {
            return;
        }

        if (isLoading) {
            this.requestsModalBody.innerHTML = `
                <div class="requests-empty">
                    <strong>Loading requests...</strong>
                    <p class="mt-4">Please wait while we fetch new membership applications.</p>
                </div>
            `;
            return;
        }

        if (!this.pendingRequests.length) {
            this.requestsModalBody.innerHTML = `
                <div class="requests-empty">
                    <strong>No pending requests right now.</strong>
                    <p class="mt-4">New member applications will appear here for approval.</p>
                </div>
            `;
            return;
        }

        const cardsMarkup = this.pendingRequests.map((request) => {
            const roleLabel = this.escapeHtml(request.role || 'user');
            const requestedAt = request.created_at ? formatDate(request.created_at) : 'Recently';

            return `
                <article class="request-card">
                    <div class="request-card-top">
                        <div>
                            <h3 class="request-member-name">${this.escapeHtml(request.name || 'New Member')}</h3>
                            <p class="request-member-email">${this.escapeHtml(request.email || 'No email provided')}</p>
                        </div>
                        <span class="request-status">Awaiting Approval</span>
                    </div>
                    <div class="request-member-meta">
                        <span><i class="fas fa-user-tag"></i> ${roleLabel}</span>
                        <span><i class="fas fa-calendar"></i> Requested on ${requestedAt}</span>
                    </div>
                    <div class="request-actions">
                        <button class="btn btn-outline request-action-btn" type="button" data-request-action="reject" data-request-id="${request.id}">
                            <i class="fas fa-xmark"></i>
                            <span>Decline</span>
                        </button>
                        <button class="btn btn-primary request-action-btn" type="button" data-request-action="approve" data-request-id="${request.id}">
                            <i class="fas fa-check"></i>
                            <span>Approve</span>
                        </button>
                    </div>
                </article>
            `;
        }).join('');

        this.requestsModalBody.innerHTML = `<div class="requests-list">${cardsMarkup}</div>`;

        this.requestsModalBody.querySelectorAll('[data-request-action]').forEach((button) => {
            button.addEventListener('click', async () => {
                const userId = Number.parseInt(button.dataset.requestId, 10);
                const action = button.dataset.requestAction;
                await this.handleMembershipRequestAction(userId, action);
            });
        });
    }

    async handleMembershipRequestAction(userId, action) {
        if (!this.isAdminUser() || !Number.isInteger(userId)) {
            return;
        }

        const isApprove = action === 'approve';
        const endpoint = `/api/v1/auth/requests/${userId}${isApprove ? '/approve' : ''}`;
        const method = isApprove ? 'POST' : 'DELETE';

        try {
            const response = await fetch(endpoint, {
                method,
                headers: this.getAuthHeaders(),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || `Failed to ${action} request.`);
            }

            this.pendingRequests = this.pendingRequests.filter((request) => request.id !== userId);
            this.renderPendingRequests();
            this.renderAuthActions();
            this.showNotification(
                isApprove ? 'Membership request approved.' : 'Membership request declined.',
                'success'
            );
        } catch (error) {
            console.error('Membership request action error:', error);
            this.showNotification(error.message || 'Unable to update membership request.', 'error');
        }
    }

    logout() {
        localStorage.removeItem('family_token');
        this.currentUser = null;
        this.pendingRequests = [];
        this.closeRequestsModal();
        this.closeMenu();
        this.toggleAnnouncementCreateButton(false);
        this.renderAuthActions();
        this.showNotification('Logged out successfully.', 'success');
        window.setTimeout(() => {
            window.location.reload();
        }, 450);
    }

    openAnnouncementModal() {
        if (!this.currentUser) {
            this.showNotification('Please sign in to create an announcement.', 'info');
            return;
        }

        const modal = document.getElementById('announcementModal');
        const dateInput = document.getElementById('announcementDate');
        if (!modal) {
            return;
        }

        if (dateInput) {
            dateInput.value = this.getDefaultAnnouncementDate();
        }

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        this.syncModalBodyState();
    }

    closeAnnouncementModal() {
        const modal = document.getElementById('announcementModal');
        const form = document.getElementById('announcementForm');
        if (!modal) {
            return;
        }

        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        this.syncModalBodyState();

        if (form) {
            form.reset();
        }
    }

    getDefaultAnnouncementDate() {
        const now = new Date();
        const pad = (value) => String(value).padStart(2, '0');

        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }

    isCurrentMonth(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }

    setAnnouncementSubmitting(isSubmitting) {
        const submitButton = document.getElementById('submitAnnouncement');
        if (!submitButton) {
            return;
        }

        submitButton.disabled = isSubmitting;
        submitButton.innerHTML = isSubmitting
            ? '<i class="fas fa-spinner fa-spin"></i> Publishing...'
            : '<i class="fas fa-paper-plane"></i> Publish Announcement';
    }

    async handleAnnouncementSubmit() {
        const titleInput = document.getElementById('announcementTitle');
        const contentInput = document.getElementById('announcementContent');
        const dateInput = document.getElementById('announcementDate');
        const token = this.getAuthToken();

        if (!titleInput || !contentInput || !dateInput || !token) {
            this.showNotification('Please sign in to create an announcement.', 'info');
            return;
        }

        const payload = {
            title: titleInput.value.trim(),
            content: contentInput.value.trim(),
            announcement_date: dateInput.value,
        };

        if (!payload.title || !payload.content || !dateInput.value) {
            this.showNotification('Please fill in all announcement fields.', 'error');
            return;
        }

        this.setAnnouncementSubmitting(true);

        try {
            const response = await fetch('/api/v1/announcements/', {
                method: 'POST',
                headers: {
                    ...this.getAuthHeaders(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || `Failed to create announcement: ${response.status}`);
            }

            const createdAnnouncement = await response.json();
            this.closeAnnouncementModal();
            await this.loadAnnouncements();

            this.showNotification(
                this.isCurrentMonth(createdAnnouncement.announcement_date)
                    ? 'Announcement published successfully.'
                    : 'Announcement saved. It will appear when its date falls within the current month.',
                'success'
            );
        } catch (error) {
            console.error('Announcement creation error:', error);
            this.showNotification(error.message || 'Failed to create announcement.', 'error');
        } finally {
            this.setAnnouncementSubmitting(false);
        }
    }

    async loadFamilyStats() {
        try {
            const statsContainer = document.getElementById('familyStats');
            if (!statsContainer) {
                return;
            }

            const fallbackStats = {
                totalMembers: 156,
                generations: 8,
                activeMembers: 12,
                upcomingEvents: 5,
            };

            const stats = {
                totalMembers: this.parseStatValue(
                    statsContainer.dataset.registeredMembers,
                    fallbackStats.totalMembers
                ),
                generations: this.parseStatValue(
                    statsContainer.dataset.generationsRecorded,
                    fallbackStats.generations
                ),
                activeMembers: this.parseStatValue(
                    statsContainer.dataset.activeFamilyMembers,
                    fallbackStats.activeMembers
                ),
                upcomingEvents: this.parseStatValue(
                    statsContainer.dataset.eventsOnCalendar,
                    fallbackStats.upcomingEvents
                ),
            };

            this.displayFamilyStats(stats);
        } catch (error) {
            console.error('Error loading family stats:', error);
        }
    }

    parseStatValue(value, fallback) {
        const parsedValue = Number.parseInt(value, 10);
        return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
    }

    displayFamilyStats(stats) {
        const statsContainer = document.getElementById('familyStats');
        if (!statsContainer) {
            return;
        }

        statsContainer.innerHTML = `
            <div class="feature-card">
                <div class="feature-icon">
                    <i class="fas fa-users"></i>
                </div>
                <h3 class="feature-title">${stats.totalMembers}</h3>
                <p class="feature-description">Registered Members</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">
                    <i class="fas fa-layer-group"></i>
                </div>
                <h3 class="feature-title">${stats.generations}</h3>
                <p class="feature-description">Generations Recorded</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">
                    <i class="fas fa-diagram-project"></i>
                </div>
                <h3 class="feature-title">${stats.activeMembers}</h3>
                <p class="feature-description">Active Family Members</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">
                    <i class="fas fa-calendar-check"></i>
                </div>
                <h3 class="feature-title">${stats.upcomingEvents}</h3>
                <p class="feature-description">Events on the Calendar</p>
            </div>
        `;
    }

    updateTime() {
        const updateClock = () => {
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-UG', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            });

            const dateString = now.toLocaleDateString('en-UG', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });

            const timeElement = document.getElementById('currentTime');
            const dateElement = document.getElementById('currentDate');

            if (timeElement) {
                timeElement.textContent = timeString;
            }
            if (dateElement) {
                dateElement.textContent = dateString;
            }
        };

        updateClock();
        window.setInterval(updateClock, 60000);
    }

    showNotification(message, type = 'info') {
        const palette = {
            success: '#245c4b',
            error: '#b42318',
            warning: '#b36b00',
            info: '#19473a',
        };

        const iconMap = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'triangle-exclamation',
            info: 'info-circle',
        };

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${iconMap[type] || iconMap.info}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close" type="button" aria-label="Close notification">
                <i class="fas fa-times"></i>
            </button>
        `;

        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${palette[type] || palette.info};
            color: white;
            padding: 16px 20px;
            border-radius: 18px;
            box-shadow: 0 18px 34px rgba(31, 41, 51, 0.18);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            z-index: 9999;
            animation: slideInRight 0.3s ease-out;
            max-width: 420px;
        `;

        const content = notification.querySelector('.notification-content');
        if (content) {
            content.style.cssText = 'display:flex; align-items:center; gap:12px;';
        }

        const closeBtn = notification.querySelector('.notification-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                notification.style.animation = 'slideInRight 0.3s ease-out reverse';
                window.setTimeout(() => notification.remove(), 300);
            });
        }

        document.body.appendChild(notification);

        window.setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideInRight 0.3s ease-out reverse';
                window.setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    showLoading() {
        let loadingOverlay = document.getElementById('loadingOverlay');

        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'loadingOverlay';
            loadingOverlay.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(255, 253, 248, 0.82);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9998;
                backdrop-filter: blur(6px);
            `;

            loadingOverlay.innerHTML = '<div class="spinner"></div>';
            document.body.appendChild(loadingOverlay);
        } else {
            loadingOverlay.style.display = 'flex';
        }
    }

    hideLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.handleResize());

        document.getElementById('btnCreateAnnouncement')?.addEventListener('click', () => {
            this.openAnnouncementModal();
        });

        document.getElementById('closeAnnouncementModal')?.addEventListener('click', () => {
            this.closeAnnouncementModal();
        });

        document.getElementById('closeRequestsModal')?.addEventListener('click', () => {
            this.closeRequestsModal();
        });

        document.getElementById('cancelAnnouncement')?.addEventListener('click', () => {
            this.closeAnnouncementModal();
        });

        document.getElementById('announcementForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.handleAnnouncementSubmit();
        });

        document.getElementById('announcementModal')?.addEventListener('click', (event) => {
            if (event.target.id === 'announcementModal') {
                this.closeAnnouncementModal();
            }
        });

        document.getElementById('requestsModal')?.addEventListener('click', (event) => {
            if (event.target.id === 'requestsModal') {
                this.closeRequestsModal();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeAnnouncementModal();
                this.closeRequestsModal();
            }
        });
    }

    handleResize() {
        if (window.innerWidth >= 1024) {
            this.closeMenu();
        }

        if (this.carouselState.updateCarousel) {
            this.carouselState.updateCarousel();
        }
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-UG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-UG', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

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

function showNotification(message, type = 'info') {
    if (window.familyApp) {
        window.familyApp.showNotification(message, type);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!window.familyApp) {
        window.familyApp = new FamilyApp();
    }
});
