// Main Application JavaScript
class FamilyApp {
    constructor() {
        this.initializeApp();
        this.setupEventListeners();
        this.loadInitialData();
    }

    initializeApp() {
        console.log('Family App Initialized');
        this.setupNavigation();
        this.updateTime();

        // Show welcome message
        setTimeout(() => {
            this.showNotification('Welcome to Ngabo Izaaya Family App!', 'success');
        }, 1000);
    }

    setupNavigation() {
        // Toggle sidebar on mobile
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');

        if (menuToggle && sidebar) {
            menuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('active');
                overlay.classList.toggle('active');
            });
        }

        if (overlay) {
            overlay.addEventListener('click', () => {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
            });
        }

        // Set active navigation item
        this.setActiveNavItem();

        // Handle bottom navigation clicks
        document.querySelectorAll('.bottom-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.getAttribute('data-page');
                this.navigateTo(page);
            });
        });

        // Handle sidebar navigation clicks
        document.querySelectorAll('.sidebar-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.getAttribute('data-page');
                this.navigateTo(page);

                // Close sidebar on mobile
                if (window.innerWidth < 1024) {
                    sidebar.classList.remove('active');
                    overlay.classList.remove('active');
                }
            });
        });
    }

    setActiveNavItem() {
        const currentPath = window.location.pathname;
        let currentPage = 'home';

        if (currentPath === '/' || currentPath === '/index.html') {
            currentPage = 'home';
        } else if (currentPath.includes('/family')) {
            currentPage = 'family';
        } else if (currentPath.includes('/history')) {
            currentPage = 'history';
        } else if (currentPath.includes('/events')) {
            currentPage = 'events';
        } else if (currentPath.includes('/posts')) {
            currentPage = 'posts';
        } else if (currentPath.includes('/messages')) {
            currentPage = 'messages';
        }

        // Set active state on bottom nav
        document.querySelectorAll('.bottom-nav-item').forEach(item => {
            const page = item.getAttribute('data-page');
            if (page === currentPage) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Set active state on sidebar nav
        document.querySelectorAll('.sidebar-nav-item').forEach(item => {
            const page = item.getAttribute('data-page');
            if (page === currentPage) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    async navigateTo(page) {
        // Show loading state
        this.showLoading();

        try {
            const pages = {
                'home': '/',
                'family': '/family',
                'history': '/history',
                'events': '/events',
                'posts': '/posts',
                'messages': '/messages'
            };

            if (pages[page]) {
                window.location.href = pages[page];
            }
        } catch (error) {
            console.error('Navigation error:', error);
            this.showNotification('Error navigating to page', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async loadInitialData() {
        try {
            // Only load events if on home page
            if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
                await this.loadUpcomingEvents();
                await this.loadAnnouncements();
                await this.loadFamilyStats();
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    async loadUpcomingEvents() {
        try {
            // Simulate API call
            const events = [
                {
                    id: 1,
                    title: "Family Reunion 2024",
                    date: "2024-06-15",
                    location: "Family Compound",
                    description: "Annual family reunion with games, food, and cultural activities.",
                    type: "reunion",
                    image: "🎉"
                },
                {
                    id: 2,
                    title: "Cultural Day Celebration",
                    date: "2024-07-20",
                    location: "Community Hall",
                    description: "Celebration of our cultural heritage with traditional performances.",
                    type: "cultural"
                },
                {
                    id: 3,
                    title: "Youth Conference",
                    date: "2024-08-10",
                    location: "Conference Center",
                    description: "Empowering the youth with skills and knowledge.",
                    type: "conference"
                },
                {
                    id: 4,
                    title: "Thanksgiving Service",
                    date: "2024-09-01",
                    location: "Family Chapel",
                    description: "Annual thanksgiving service for family blessings.",
                    type: "religious"
                },
                {
                    id: 5,
                    title: "Elder's Council Meeting",
                    date: "2024-10-05",
                    location: "Elder's Lodge",
                    description: "Quarterly meeting of family elders.",
                    type: "meeting"
                }
            ];

            this.displayEvents(events);
        } catch (error) {
            console.error('Error loading events:', error);
            this.showNotification('Failed to load events', 'error');
        }
    }

    displayEvents(events) {
        const eventsContainer = document.getElementById('eventsList');
        if (!eventsContainer) return;

        // Clear loading state
        eventsContainer.innerHTML = '';

        // Add events to carousel
        events.forEach(event => {
            const eventDate = new Date(event.date);
            const formattedDate = eventDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            const eventElement = `
                <div class="carousel-item">
                    <div class="event-card">
                        <div class="event-image">
                            <div class="animate-float">${event.image || '📅'}</div>
                        </div>
                        <div class="event-content">
                            <h3 class="event-title">${event.title}</h3>
                            <div class="event-date">
                                <i class="fas fa-calendar"></i>
                                <span>${formattedDate}</span>
                            </div>
                            <p class="event-description">${event.description}</p>
                            <div class="event-tags">
                                <span class="event-tag">${event.type}</span>
                                <span class="event-tag">${event.location}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            eventsContainer.innerHTML += eventElement;
        });

        // Setup carousel if on home page
        this.setupCarousel();
    }

    setupCarousel() {
        const carouselTrack = document.querySelector('.carousel-track');
        const carouselItems = document.querySelectorAll('.carousel-item');
        const prevBtn = document.querySelector('.carousel-btn.prev');
        const nextBtn = document.querySelector('.carousel-btn.next');

        if (!carouselTrack || carouselItems.length === 0) return;

        let currentIndex = 0;
        const totalItems = carouselItems.length;
        let autoSlideInterval;

        const updateCarousel = () => {
            if (window.innerWidth >= 1024) {
                // Show 3 items on desktop
                const itemWidth = 33.333;
                carouselTrack.style.transform = `translateX(-${currentIndex * itemWidth}%)`;
            } else if (window.innerWidth >= 768) {
                // Show 2 items on tablet
                const itemWidth = 50;
                carouselTrack.style.transform = `translateX(-${currentIndex * itemWidth}%)`;
            } else {
                // Show 1 item on mobile
                const itemWidth = 100;
                carouselTrack.style.transform = `translateX(-${currentIndex * itemWidth}%)`;
            }
        };

        const nextSlide = () => {
            currentIndex = (currentIndex + 1) % totalItems;
            updateCarousel();
        };

        const prevSlide = () => {
            currentIndex = (currentIndex - 1 + totalItems) % totalItems;
            updateCarousel();
        };

        if (prevBtn) {
            prevBtn.addEventListener('click', prevSlide);
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', nextSlide);
        }

        // Auto slide every 5 seconds
        const startAutoSlide = () => {
            autoSlideInterval = setInterval(nextSlide, 5000);
        };

        const stopAutoSlide = () => {
            clearInterval(autoSlideInterval);
        };

        // Pause on hover
        if (carouselTrack) {
            carouselTrack.addEventListener('mouseenter', stopAutoSlide);
            carouselTrack.addEventListener('mouseleave', startAutoSlide);
        }

        // Handle window resize
        window.addEventListener('resize', updateCarousel);

        // Start auto slide
        startAutoSlide();
        updateCarousel();
    }

    async loadAnnouncements() {
        try {
            // Simulate API call
            const announcements = [
                {
                    id: 1,
                    title: "New Family Website Launched",
                    date: "2024-01-15",
                    content: "Welcome to our new family portal! Stay connected with family events, history, and updates."
                },
                {
                    id: 2,
                    title: "Family Tree Project",
                    date: "2024-01-10",
                    content: "Help us complete the family tree by adding your branch information."
                },
                {
                    id: 3,
                    title: "Cultural Preservation Initiative",
                    date: "2024-01-05",
                    content: "Share stories, photos, and artifacts to preserve our family heritage."
                }
            ];

            this.displayAnnouncements(announcements);
        } catch (error) {
            console.error('Error loading announcements:', error);
        }
    }

    displayAnnouncements(announcements) {
        const announcementsContainer = document.getElementById('announcementsList');
        if (!announcementsContainer) return;

        announcements.forEach(announcement => {
            const announcementDate = new Date(announcement.date);
            const formattedDate = announcementDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            const announcementElement = `
                <div class="announcement-card animate-fade-up">
                    <h4 class="announcement-title">${announcement.title}</h4>
                    <div class="announcement-date">
                        <i class="fas fa-clock"></i> ${formattedDate}
                    </div>
                    <p class="announcement-content">${announcement.content}</p>
                </div>
            `;

            announcementsContainer.innerHTML += announcementElement;
        });
    }

    async loadFamilyStats() {
        try {
            // Simulate API call
            const stats = {
                totalMembers: 156,
                generations: 8,
                recentAdditions: 12,
                upcomingEvents: 5
            };

            this.displayFamilyStats(stats);
        } catch (error) {
            console.error('Error loading family stats:', error);
        }
    }

    displayFamilyStats(stats) {
        const statsContainer = document.getElementById('familyStats');
        if (!statsContainer) return;

        statsContainer.innerHTML = `
            <div class="feature-card">
                <div class="feature-icon">
                    <i class="fas fa-users"></i>
                </div>
                <h3 class="feature-title">${stats.totalMembers}+</h3>
                <p class="feature-description">Family Members</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">
                    <i class="fas fa-layer-group"></i>
                </div>
                <h3 class="feature-title">${stats.generations}</h3>
                <p class="feature-description">Generations</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">
                    <i class="fas fa-user-plus"></i>
                </div>
                <h3 class="feature-title">${stats.recentAdditions}</h3>
                <p class="feature-description">Recent Additions</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">
                    <i class="fas fa-calendar-check"></i>
                </div>
                <h3 class="feature-title">${stats.upcomingEvents}</h3>
                <p class="feature-description">Upcoming Events</p>
            </div>
        `;
    }

    updateTime() {
        const updateClock = () => {
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });

            const dateString = now.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            const timeElement = document.getElementById('currentTime');
            const dateElement = document.getElementById('currentDate');

            if (timeElement) timeElement.textContent = timeString;
            if (dateElement) dateElement.textContent = dateString;
        };

        updateClock();
        setInterval(updateClock, 60000); // Update every minute
    }

    showNotification(message, type = 'info') {
        // Create notification element
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

        // Add styles
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            z-index: 9999;
            animation: slideInRight 0.3s ease-out;
            max-width: 400px;
        `;

        // Add close functionality
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            notification.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => notification.remove(), 300);
        });

        // Add to page
        document.body.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideInRight 0.3s ease-out reverse';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    showLoading() {
        // Create or show loading overlay
        let loadingOverlay = document.getElementById('loadingOverlay');

        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'loadingOverlay';
            loadingOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(255, 255, 255, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9998;
                backdrop-filter: blur(5px);
            `;

            loadingOverlay.innerHTML = `
                <div class="spinner"></div>
            `;

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
        // Add any additional event listeners here
        window.addEventListener('resize', () => {
            // Handle responsive behavior
            this.handleResize();
        });
    }

    handleResize() {
        // Update navigation visibility based on screen size
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');

        if (window.innerWidth >= 1024) {
            // Desktop - show sidebar, hide overlay
            if (sidebar) sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
        }
    }
}

// Utility functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

// Debounce function for performance
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

document.addEventListener('DOMContentLoaded', () => {
    window.familyApp = new FamilyApp();
});