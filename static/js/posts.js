// Posts Application JavaScript

class PostsApp {
    constructor() {
        this.currentUser = null;
        this.posts = [];
        this.currentPage = 1;
        this.totalPages = 1;
        this.currentFilter = 'all';
        this.currentSort = 'newest';
        this.searchQuery = '';
        this.isLoading = false;
        this.hasMore = true;
        this.selectedPost = null;
        this.selectedImageIndex = 0;
        this.currentImages = [];
        this.initialize();
    }

    initialize() {
        console.log('Posts App Initialized');
        this.checkAuthentication();
        this.setupEventListeners();
        this.loadPosts();
        this.loadPopularTags();
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
        // Update sidebar user section
        const userSection = document.querySelector('.sidebar-footer .glass');
        if (userSection && this.currentUser) {
            userSection.innerHTML = `
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 gradient-bg rounded-full flex items-center justify-center">
                        ${this.getUserInitials(this.currentUser.name)}
                    </div>
                    <div>
                        <p class="font-medium">${this.currentUser.name}</p>
                        <p class="text-sm text-gray-500">${this.currentUser.role}</p>
                    </div>
                </div>
                <button class="btn btn-outline w-full mt-4" onclick="postsApp.logout()">
                    <i class="fas fa-sign-out-alt"></i>
                    Sign Out
                </button>
            `;
        }

        // Update create post modal author info
        const authorAvatar = document.getElementById('postAuthorAvatar');
        const authorName = document.getElementById('postAuthorName');
        
        if (authorAvatar && this.currentUser) {
            authorAvatar.textContent = this.getUserInitials(this.currentUser.name);
        }
        
        if (authorName && this.currentUser) {
            authorName.textContent = this.currentUser.name;
        }

        // Update comment avatar
        const commentAvatar = document.getElementById('commentAuthorAvatar');
        if (commentAvatar && this.currentUser) {
            commentAvatar.textContent = this.getUserInitials(this.currentUser.name);
        }
    }

    getUserInitials(name) {
        return name.split(' ').map(part => part.charAt(0)).join('').toUpperCase().substring(0, 2);
    }

    setupEventListeners() {
        // Create post button
        document.getElementById('btnCreatePost')?.addEventListener('click', () => this.openCreatePostModal());
        document.getElementById('btnCreateFirstPost')?.addEventListener('click', () => this.openCreatePostModal());
        
        // Refresh button
        document.getElementById('btnRefreshPosts')?.addEventListener('click', () => this.refreshPosts());
        
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.dataset.filter;
                this.setFilter(filter);
            });
        });
        
        // Search
        const searchInput = document.getElementById('postsSearch');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(() => {
                this.searchQuery = searchInput.value.trim();
                this.resetAndLoadPosts();
            }, 500));
        }
        
        // Sort
        document.getElementById('sortPosts')?.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.resetAndLoadPosts();
        });
        
        // Load more
        document.getElementById('btnLoadMore')?.addEventListener('click', () => this.loadMorePosts());
        
        // Modal controls
        this.setupModalEvents();
        
        // Create post form
        this.setupCreatePostForm();
        
        // Image viewer
        this.setupImageViewer();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
            if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey) {
                this.openCreatePostModal();
            }
        });
    }

    setupModalEvents() {
        // Create post modal
        document.getElementById('closeCreatePostModal')?.addEventListener('click', () => this.closeModal('createPostModal'));
        document.getElementById('btnCancelPost')?.addEventListener('click', () => this.closeModal('createPostModal'));
        
        // Post detail modal
        document.getElementById('closePostDetailModal')?.addEventListener('click', () => this.closeModal('postDetailModal'));
        
        // Edit post modal
        document.getElementById('closeEditPostModal')?.addEventListener('click', () => this.closeModal('editPostModal'));
        
        // Comments modal
        document.getElementById('closeCommentsModal')?.addEventListener('click', () => this.closeModal('commentsModal'));
        
        // Likes modal
        document.getElementById('closeLikesModal')?.addEventListener('click', () => this.closeModal('likesModal'));
        
        // Delete confirmation
        document.getElementById('btnCancelDelete')?.addEventListener('click', () => this.closeModal('deleteConfirmModal'));
        document.getElementById('btnConfirmDelete')?.addEventListener('click', () => this.confirmDeletePost());
        
        // Image viewer
        document.getElementById('closeImageViewerModal')?.addEventListener('click', () => this.closeModal('imageViewerModal'));
        document.getElementById('btnPrevImage')?.addEventListener('click', () => this.showPreviousImage());
        document.getElementById('btnNextImage')?.addEventListener('click', () => this.showNextImage());
        
        // Close modals on overlay click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });
        
        // Post actions dropdown
        const actionsBtn = document.getElementById('postActionsBtn');
        const actionsMenu = document.getElementById('postActionsMenu');
        
        if (actionsBtn && actionsMenu) {
            actionsBtn.addEventListener('click', () => {
                actionsMenu.classList.toggle('show');
            });
            
            // Close dropdown when clicking elsewhere
            document.addEventListener('click', (e) => {
                if (!actionsBtn.contains(e.target) && !actionsMenu.contains(e.target)) {
                    actionsMenu.classList.remove('show');
                }
            });
        }
    }

    setupCreatePostForm() {
        const form = document.getElementById('createPostForm');
        if (!form) return;
        
        // Character counter
        const textarea = document.getElementById('postContent');
        const charCount = document.getElementById('charCount');
        
        if (textarea && charCount) {
            textarea.addEventListener('input', () => {
                charCount.textContent = textarea.value.length;
            });
        }
        
        // Post type buttons
        document.querySelectorAll('.post-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                this.handlePostTypeSelection(type);
            });
        });
        
        // Media upload
        const dropZone = document.getElementById('mediaDropZone');
        const browseBtn = document.getElementById('btnBrowseMedia');
        const fileInput = document.getElementById('fileInput');
        const removeMediaBtn = document.getElementById('btnRemoveMedia');
        
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });
            
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });
            
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                const files = e.dataTransfer.files;
                this.handleMediaFiles(files);
            });
        }
        
        if (browseBtn && fileInput) {
            browseBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                this.handleMediaFiles(e.target.files);
                fileInput.value = ''; // Reset input
            });
        }
        
        if (removeMediaBtn) {
            removeMediaBtn.addEventListener('click', () => this.removeAllMedia());
        }
        
        // Tags input
        const tagsInput = document.getElementById('postTags');
        if (tagsInput) {
            tagsInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    this.addTag(tagsInput.value.trim());
                    tagsInput.value = '';
                }
            });
            
            tagsInput.addEventListener('blur', () => {
                if (tagsInput.value.trim()) {
                    this.addTag(tagsInput.value.trim());
                    tagsInput.value = '';
                }
            });
        }
        
        // Form submission
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitPost();
        });
    }

    setupImageViewer() {
        // Keyboard navigation for image viewer
        document.addEventListener('keydown', (e) => {
            const viewerModal = document.getElementById('imageViewerModal');
            if (viewerModal.classList.contains('active')) {
                if (e.key === 'ArrowLeft') {
                    this.showPreviousImage();
                } else if (e.key === 'ArrowRight') {
                    this.showNextImage();
                } else if (e.key === 'Escape') {
                    this.closeModal('imageViewerModal');
                }
            }
        });
        
        // Swipe support for mobile
        let touchStartX = 0;
        let touchEndX = 0;
        
        const viewerContainer = document.querySelector('.image-viewer-container');
        if (viewerContainer) {
            viewerContainer.addEventListener('touchstart', (e) => {
                touchStartX = e.changedTouches[0].screenX;
            });
            
            viewerContainer.addEventListener('touchend', (e) => {
                touchEndX = e.changedTouches[0].screenX;
                this.handleSwipe();
            });
        }
    }

    handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;
        
        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                this.showNextImage(); // Swipe left
            } else {
                this.showPreviousImage(); // Swipe right
            }
        }
    }

    async loadPosts() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading();
        
        try {
            // Build query parameters
            const params = new URLSearchParams({
                page: this.currentPage,
                size: 12,
                sort_by: this.getSortField(),
                sort_order: this.getSortOrder()
            });
            
            // Add search query if exists
            if (this.searchQuery) {
                params.append('search', this.searchQuery);
            }
            
            // Add filter if not 'all'
            if (this.currentFilter !== 'all' && this.currentFilter !== 'mine') {
                if (this.currentFilter === 'family_only') {
                    params.append('visibility', 'family_only');
                } else {
                    params.append('post_type', this.currentFilter);
                }
            }
            
            // If filtering by 'mine', need to load all and filter client-side
            const response = await fetch(`/api/v1/posts/posts?${params}`);
            
            if (response.ok) {
                const data = await response.json();
                this.handlePostsResponse(data);
            } else {
                throw new Error('Failed to load posts');
            }
        } catch (error) {
            console.error('Error loading posts:', error);
            this.showNotification('Failed to load posts. Please try again.', 'error');
            this.showEmptyState();
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }

    handlePostsResponse(data) {
        let posts = data.items;
        
        // Filter by 'mine' if needed
        if (this.currentFilter === 'mine' && this.currentUser) {
            posts = posts.filter(post => post.author_id === this.currentUser.id);
        }
        
        if (this.currentPage === 1) {
            this.posts = posts;
        } else {
            this.posts = [...this.posts, ...posts];
        }
        
        this.totalPages = data.total_pages;
        this.hasMore = this.currentPage < this.totalPages;
        
        this.renderPosts();
        this.updateLoadMoreButton();
        
        // Show/hide empty state
        if (this.posts.length === 0) {
            this.showEmptyState();
        } else {
            this.hideEmptyState();
        }
    }

    renderPosts() {
        const container = document.getElementById('postsGrid');
        if (!container) return;
        
        if (this.currentPage === 1) {
            container.innerHTML = '';
        }
        
        this.posts.forEach((post, index) => {
            const postElement = this.createPostElement(post);
            if (this.currentPage === 1 && index < 3) {
                postElement.classList.add('new-post');
            }
            container.appendChild(postElement);
        });
        
        container.style.display = 'grid';
    }

    createPostElement(post) {
        const div = document.createElement('div');
        div.className = 'post-card';
        div.dataset.postId = post.id;
        
        const hasMedia = post.media_urls && post.media_urls.length > 0;
        const mediaCount = hasMedia ? post.media_urls.length : 0;
        const isTruncated = post.content && post.content.length > 200;
        const truncatedContent = isTruncated ? post.content.substring(0, 200) + '...' : post.content;
        
        div.innerHTML = `
            <div class="post-header">
                <div class="post-author">
                    <div class="author-avatar">
                        ${this.getUserInitials(post.author.name)}
                    </div>
                    <div class="author-info">
                        <div class="author-name">${post.author.name}</div>
                        <div class="post-meta">
                            <span>${this.formatTimeAgo(post.created_at)}</span>
                            <span>•</span>
                            <span class="visibility-icon">
                                ${this.getVisibilityIcon(post.visibility)}
                            </span>
                            <span>${this.getVisibilityText(post.visibility)}</span>
                        </div>
                    </div>
                </div>
                ${post.title ? `<h3 class="post-title">${post.title}</h3>` : ''}
                ${post.content ? `
                    <div class="post-content ${isTruncated ? 'truncated' : ''}">
                        ${truncatedContent}
                    </div>
                    ${isTruncated ? `
                        <div class="read-more" onclick="postsApp.viewPostDetail(${post.id})">
                            Read more <i class="fas fa-chevron-right"></i>
                        </div>
                    ` : ''}
                ` : ''}
            </div>
            
            ${hasMedia ? this.createMediaGrid(post.media_urls, post.id) : ''}
            
            ${post.tags && post.tags.length > 0 ? `
                <div class="post-tags">
                    ${post.tags.map(tag => `
                        <span class="tag" onclick="postsApp.filterByTag('${tag.name}')">${tag.name}</span>
                    `).join('')}
                </div>
            ` : ''}
            
            <div class="post-stats">
                <span>${post.like_count} ${post.like_count === 1 ? 'like' : 'likes'}</span>
                <span>${post.comment_count} ${post.comment_count === 1 ? 'comment' : 'comments'}</span>
                <span>${post.view_count} ${post.view_count === 1 ? 'view' : 'views'}</span>
            </div>
            
            <div class="post-actions">
                <button class="action-btn ${post.has_liked ? 'liked' : ''}" 
                        onclick="postsApp.toggleLike(${post.id})">
                    <i class="fas fa-heart"></i>
                    ${post.has_liked ? 'Liked' : 'Like'}
                </button>
                <button class="action-btn" onclick="postsApp.openComments(${post.id})">
                    <i class="fas fa-comment"></i>
                    Comment
                </button>
                <button class="action-btn" onclick="postsApp.sharePost(${post.id})">
                    <i class="fas fa-share"></i>
                    Share
                </button>
            </div>
        `;
        
        // Add click event for viewing post detail
        if (!isTruncated && !hasMedia) {
            div.querySelector('.post-content')?.addEventListener('click', () => {
                this.viewPostDetail(post.id);
            });
        }
        
        return div;
    }

    createMediaGrid(mediaUrls, postId) {
        if (!mediaUrls || mediaUrls.length === 0) return '';
        
        const count = mediaUrls.length;
        let gridClass = 'media-grid';
        let itemsHTML = '';
        
        if (count === 1) {
            gridClass += ' single';
            itemsHTML = this.createMediaItem(mediaUrls[0], 0, postId, true);
        } else if (count === 2) {
            gridClass += ' double';
            mediaUrls.forEach((url, index) => {
                itemsHTML += this.createMediaItem(url, index, postId, false);
            });
        } else {
            gridClass += ' multiple';
            mediaUrls.slice(0, 4).forEach((url, index) => {
                itemsHTML += this.createMediaItem(url, index, postId, false);
            });
            
            if (count > 4) {
                itemsHTML += `
                    <div class="media-item" onclick="postsApp.viewPostDetail(${postId})">
                        <div class="media-overlay">
                            +${count - 4} more
                        </div>
                        <div class="more-media-count">+${count - 4}</div>
                    </div>
                `;
            }
        }
        
        return `
            <div class="post-media">
                <div class="${gridClass}">
                    ${itemsHTML}
                </div>
            </div>
        `;
    }

    createMediaItem(url, index, postId, isSingle) {
        const isVideo = url.match(/\.(mp4|mov|avi|wmv|flv|webm)$/i);
        
        return `
            <div class="media-item ${isSingle ? 'single' : ''}" 
                 onclick="${isVideo ? `postsApp.playVideo('${url}')` : `postsApp.viewImage('${url}', ${postId}, ${index})`}">
                ${isVideo ? `
                    <video>
                        <source src="${url}" type="video/mp4">
                    </video>
                    <div class="media-overlay">
                        <i class="fas fa-play"></i>
                    </div>
                ` : `
                    <img src="${url}" alt="Post image ${index + 1}" loading="lazy">
                    <div class="media-overlay">
                        <i class="fas fa-expand"></i>
                    </div>
                `}
            </div>
        `;
    }

    async viewPostDetail(postId) {
        try {
            this.showLoading();
            const token = localStorage.getItem('family_token');
            
            const response = await fetch(`/api/v1/posts/posts/${postId}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            
            if (response.ok) {
                this.selectedPost = await response.json();
                this.showPostDetail();
            } else {
                throw new Error('Failed to load post details');
            }
        } catch (error) {
            console.error('Error loading post details:', error);
            this.showNotification('Failed to load post details', 'error');
        } finally {
            this.hideLoading();
        }
    }

    showPostDetail() {
        if (!this.selectedPost) return;
        
        const container = document.querySelector('.post-detail-container');
        if (!container) return;
        
        const hasMedia = this.selectedPost.media_urls && this.selectedPost.media_urls.length > 0;
        const mediaCount = hasMedia ? this.selectedPost.media_urls.length : 0;
        
        container.innerHTML = `
            <div class="post-header">
                <div class="post-author">
                    <div class="author-avatar">
                        ${this.getUserInitials(this.selectedPost.author.name)}
                    </div>
                    <div class="author-info">
                        <div class="author-name">${this.selectedPost.author.name}</div>
                        <div class="post-meta">
                            <span>${this.formatTimeAgo(this.selectedPost.created_at)}</span>
                            <span>•</span>
                            <span class="visibility-icon">
                                ${this.getVisibilityIcon(this.selectedPost.visibility)}
                            </span>
                            <span>${this.getVisibilityText(this.selectedPost.visibility)}</span>
                        </div>
                    </div>
                </div>
                ${this.selectedPost.title ? `<h3 class="post-title">${this.selectedPost.title}</h3>` : ''}
            </div>
            
            <div class="post-detail-content">
                ${this.selectedPost.content ? `
                    <div class="post-content">
                        ${this.selectedPost.content}
                    </div>
                ` : ''}
            </div>
            
            ${hasMedia ? this.createMediaGrid(this.selectedPost.media_urls, this.selectedPost.id) : ''}
            
            ${this.selectedPost.tags && this.selectedPost.tags.length > 0 ? `
                <div class="post-tags">
                    ${this.selectedPost.tags.map(tag => `
                        <span class="tag" onclick="postsApp.filterByTag('${tag.name}')">${tag.name}</span>
                    `).join('')}
                </div>
            ` : ''}
            
            <div class="post-detail-stats">
                <span><i class="fas fa-heart"></i> ${this.selectedPost.like_count} likes</span>
                <span><i class="fas fa-comment"></i> ${this.selectedPost.comment_count} comments</span>
                <span><i class="fas fa-eye"></i> ${this.selectedPost.view_count} views</span>
            </div>
            
            <div class="post-detail-actions">
                <button class="action-btn ${this.selectedPost.has_liked ? 'liked' : ''}" 
                        onclick="postsApp.toggleLike(${this.selectedPost.id})">
                    <i class="fas fa-heart"></i>
                    ${this.selectedPost.has_liked ? 'Liked' : 'Like'}
                </button>
                <button class="action-btn" onclick="postsApp.openComments(${this.selectedPost.id})">
                    <i class="fas fa-comment"></i>
                    Comment
                </button>
                <button class="action-btn" onclick="postsApp.sharePost(${this.selectedPost.id})">
                    <i class="fas fa-share"></i>
                    Share
                </button>
                <button class="action-btn" onclick="postsApp.openLikes(${this.selectedPost.id})">
                    <i class="fas fa-users"></i>
                    See Likes
                </button>
            </div>
            
            <div class="post-detail-comments">
                <h4>Recent Comments</h4>
                <div id="postDetailComments">
                    <!-- Comments will be loaded here -->
                </div>
                <button class="btn btn-outline w-full mt-4" onclick="postsApp.openComments(${this.selectedPost.id})">
                    <i class="fas fa-comments"></i>
                    View All Comments
                </button>
            </div>
        `;
        
        this.openModal('postDetailModal');
        this.loadPostComments(this.selectedPost.id, true);
        
        // Setup action buttons if user is the author
        if (this.currentUser && this.selectedPost.author_id === this.currentUser.id) {
            document.getElementById('btnEditPost').style.display = 'block';
            document.getElementById('btnDeletePost').style.display = 'block';
        } else {
            document.getElementById('btnEditPost').style.display = 'none';
            document.getElementById('btnDeletePost').style.display = 'none';
        }
        
        // Setup action button events
        document.getElementById('btnEditPost')?.addEventListener('click', () => this.openEditPostModal());
        document.getElementById('btnDeletePost')?.addEventListener('click', () => this.openDeleteConfirmModal());
        document.getElementById('btnReportPost')?.addEventListener('click', () => this.reportPost());
    }

    async toggleLike(postId) {
        if (!this.currentUser) {
            this.showNotification('Please login to like posts', 'info');
            this.openLoginModal();
            return;
        }
        
        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch(`/api/v1/posts/posts/${postId}/like`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // Update UI
                const postElement = document.querySelector(`.post-card[data-post-id="${postId}"]`);
                if (postElement) {
                    const likeBtn = postElement.querySelector('.action-btn');
                    const likeText = postElement.querySelector('.action-btn span') || likeBtn;
                    const stats = postElement.querySelector('.post-stats span:first-child');
                    
                    if (result.liked) {
                        likeBtn.classList.add('liked');
                        likeText.innerHTML = '<i class="fas fa-heart"></i> Liked';
                    } else {
                        likeBtn.classList.remove('liked');
                        likeText.innerHTML = '<i class="fas fa-heart"></i> Like';
                    }
                    
                    if (stats) {
                        stats.textContent = `${result.like_count} ${result.like_count === 1 ? 'like' : 'likes'}`;
                    }
                }
                
                // Update selected post if open
                if (this.selectedPost && this.selectedPost.id === postId) {
                    this.selectedPost.has_liked = result.liked;
                    this.selectedPost.like_count = result.like_count;
                }
                
                this.showNotification(result.message, 'success');
            }
        } catch (error) {
            console.error('Error toggling like:', error);
            this.showNotification('Failed to like post', 'error');
        }
    }

    async openComments(postId) {
        this.selectedPost = this.posts.find(p => p.id === postId) || this.selectedPost;
        
        if (!this.selectedPost) {
            await this.viewPostDetail(postId);
        }
        
        this.openModal('commentsModal');
        document.getElementById('commentsModalTitle').textContent = `Comments (${this.selectedPost.comment_count})`;
        this.loadPostComments(postId);
    }

    async loadPostComments(postId, limit = false) {
        try {
            const params = new URLSearchParams();
            if (limit) {
                params.append('limit', 3);
            }
            
            const response = await fetch(`/api/v1/posts/posts/${postId}/comments?${params}`);
            
            if (response.ok) {
                const data = await response.json();
                this.renderComments(data.items, limit ? 'postDetailComments' : 'commentsList');
            }
        } catch (error) {
            console.error('Error loading comments:', error);
        }
    }

    renderComments(comments, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (comments.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-8">No comments yet. Be the first to comment!</p>';
            return;
        }
        
        container.innerHTML = comments.map(comment => `
            <div class="comment-item">
                <div class="comment-author">
                    <div class="author-avatar-small">
                        ${this.getUserInitials(comment.author.name)}
                    </div>
                    <div>
                        <div class="font-medium">${comment.author.name}</div>
                        <div class="text-sm text-gray-500">${this.formatTimeAgo(comment.created_at)}</div>
                    </div>
                </div>
                <div class="comment-content">
                    <div class="comment-text">${comment.content}</div>
                    <div class="comment-meta">
                        <button class="comment-action-btn" onclick="postsApp.toggleCommentLike(${comment.id})">
                            <i class="fas fa-heart"></i> Like
                        </button>
                        <span>•</span>
                        <span>${comment.reply_count} replies</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    async openLikes(postId) {
        try {
            const response = await fetch(`/api/v1/posts/posts/${postId}/likes?limit=50`);
            
            if (response.ok) {
                const likes = await response.json();
                this.renderLikes(likes);
                this.openModal('likesModal');
            }
        } catch (error) {
            console.error('Error loading likes:', error);
            this.showNotification('Failed to load likes', 'error');
        }
    }

    renderLikes(likes) {
        const container = document.getElementById('likesList');
        if (!container) return;
        
        if (likes.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-8">No likes yet</p>';
            return;
        }
        
        container.innerHTML = likes.map(like => `
            <div class="like-item">
                <div class="like-avatar">
                    ${this.getUserInitials(like.user_name)}
                </div>
                <div class="like-info">
                    <div class="like-name">${like.user_name}</div>
                    <div class="like-time">${this.formatTimeAgo(like.created_at)}</div>
                </div>
            </div>
        `).join('');
    }

    viewImage(imageUrl, postId, index) {
        this.currentImages = this.selectedPost?.media_urls || [];
        this.selectedImageIndex = index;
        
        const image = document.getElementById('viewerImage');
        const caption = document.getElementById('imageCaption');
        
        if (image) {
            image.src = imageUrl;
            image.alt = `Image ${index + 1} from post`;
        }
        
        if (caption) {
            caption.textContent = `Image ${index + 1} of ${this.currentImages.length}`;
        }
        
        this.openModal('imageViewerModal');
    }

    showPreviousImage() {
        if (this.currentImages.length === 0) return;
        
        this.selectedImageIndex = (this.selectedImageIndex - 1 + this.currentImages.length) % this.currentImages.length;
        this.viewImage(this.currentImages[this.selectedImageIndex], null, this.selectedImageIndex);
    }

    showNextImage() {
        if (this.currentImages.length === 0) return;
        
        this.selectedImageIndex = (this.selectedImageIndex + 1) % this.currentImages.length;
        this.viewImage(this.currentImages[this.selectedImageIndex], null, this.selectedImageIndex);
    }

    playVideo(videoUrl) {
        // For now, just open the video in a new tab
        window.open(videoUrl, '_blank');
    }

    async submitPost() {
        if (!this.currentUser) {
            this.showNotification('Please login to create posts', 'info');
            this.openLoginModal();
            return;
        }
        
        const title = document.getElementById('postTitle').value.trim();
        const content = document.getElementById('postContent').value.trim();
        const visibility = document.getElementById('postVisibility').value;
        const mediaUrls = this.getMediaUrls(); // In production, you'd upload files first
        const tags = this.getTags();
        
        if (!content && mediaUrls.length === 0) {
            this.showNotification('Please add content or media to your post', 'error');
            return;
        }
        
        try {
            const token = localStorage.getItem('family_token');
            const postData = {
                title: title || null,
                content: content || null,
                post_type: mediaUrls.length > 0 ? (mediaUrls.length === 1 ? 'image' : 'mixed') : 'text',
                media_urls: mediaUrls,
                visibility: visibility,
                tags: tags
            };
            
            const response = await fetch('/api/v1/posts/posts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(postData)
            });
            
            if (response.ok) {
                const newPost = await response.json();
                this.showNotification('Post created successfully!', 'success');
                this.closeModal('createPostModal');
                this.resetCreatePostForm();
                this.resetAndLoadPosts();
            } else {
                const error = await response.json();
                this.showNotification(error.detail || 'Failed to create post', 'error');
            }
        } catch (error) {
            console.error('Error creating post:', error);
            this.showNotification('Network error. Please try again.', 'error');
        }
    }

    getMediaUrls() {
        // In a real app, you would upload files to a server and get URLs
        // For now, return empty array - implement file upload separately
        return [];
    }

    getTags() {
        const tagElements = document.querySelectorAll('.tag-pill');
        return Array.from(tagElements).map(tag => tag.textContent.trim());
    }

    addTag(tagText) {
        if (!tagText) return;
        
        const tagsPreview = document.getElementById('tagsPreview');
        const tagPill = document.createElement('div');
        tagPill.className = 'tag-pill';
        tagPill.innerHTML = `
            ${tagText}
            <button class="remove-tag" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        tagsPreview.appendChild(tagPill);
    }

    removeAllMedia() {
        const preview = document.getElementById('mediaPreview');
        if (preview) {
            preview.innerHTML = '';
        }
        document.getElementById('mediaUploadContainer').style.display = 'none';
    }

    handleMediaFiles(files) {
        // Implement file validation and preview
        const container = document.getElementById('mediaUploadContainer');
        const preview = document.getElementById('mediaPreview');
        
        if (!container || !preview) return;
        
        container.style.display = 'block';
        
        Array.from(files).slice(0, 10).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const isVideo = file.type.startsWith('video/');
                const item = document.createElement('div');
                item.className = 'media-preview-item';
                item.innerHTML = `
                    ${isVideo ? `
                        <video controls>
                            <source src="${e.target.result}" type="${file.type}">
                        </video>
                    ` : `
                        <img src="${e.target.result}" alt="${file.name}">
                    `}
                    <button class="remove-media-btn" onclick="this.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                preview.appendChild(item);
            };
            reader.readAsDataURL(file);
        });
    }

    handlePostTypeSelection(type) {
        const container = document.getElementById('mediaUploadContainer');
        const buttons = document.querySelectorAll('.post-type-btn');
        
        buttons.forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
        if (type === 'text') {
            container.style.display = 'none';
        } else {
            container.style.display = 'block';
        }
    }

    setFilter(filter) {
        this.currentFilter = filter;
        this.currentPage = 1;
        
        // Update button states
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        
        this.loadPosts();
    }

    filterByTag(tagName) {
        this.searchQuery = tagName;
        document.getElementById('postsSearch').value = tagName;
        this.resetAndLoadPosts();
    }

    resetAndLoadPosts() {
        this.currentPage = 1;
        this.posts = [];
        this.loadPosts();
    }

    async loadMorePosts() {
        if (this.isLoading || !this.hasMore) return;
        
        this.currentPage++;
        await this.loadPosts();
    }

    refreshPosts() {
        this.resetAndLoadPosts();
        this.showNotification('Posts refreshed', 'success');
    }

    updateLoadMoreButton() {
        const container = document.getElementById('loadMoreContainer');
        const spinner = document.getElementById('loadMoreSpinner');
        const text = document.getElementById('loadMoreText');
        
        if (!container || !spinner || !text) return;
        
        if (this.hasMore) {
            container.style.display = 'block';
            spinner.style.display = 'none';
            text.textContent = 'Load More Posts';
        } else if (this.posts.length > 0) {
            container.style.display = 'block';
            spinner.style.display = 'none';
            text.textContent = 'No more posts to load';
            text.parentElement.disabled = true;
        } else {
            container.style.display = 'none';
        }
    }

    async loadPopularTags() {
        try {
            const response = await fetch('/api/v1/posts/tags?limit=10');
            if (response.ok) {
                const tags = await response.json();
                this.renderPopularTags(tags);
            }
        } catch (error) {
            console.error('Error loading popular tags:', error);
        }
    }

    renderPopularTags(tags) {
        const container = document.getElementById('popularTags');
        if (!container || !tags.length) return;
        
        container.innerHTML = '<small>Popular: </small>' + tags.map(tag => `
            <button onclick="postsApp.filterByTag('${tag.name}')">${tag.name}</button>
        `).join('');
    }

    openCreatePostModal() {
        if (!this.currentUser) {
            this.showNotification('Please login to create posts', 'info');
            this.openLoginModal();
            return;
        }
        
        this.openModal('createPostModal');
    }

    openEditPostModal() {
        // Implement edit post functionality
        this.showNotification('Edit post feature coming soon!', 'info');
    }

    openDeleteConfirmModal() {
        if (!this.selectedPost) return;
        
        document.getElementById('deleteConfirmText').textContent = 
            `Are you sure you want to delete this post? This action cannot be undone.`;
        
        this.openModal('deleteConfirmModal');
    }

    async confirmDeletePost() {
        if (!this.selectedPost || !this.currentUser) return;
        
        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch(`/api/v1/posts/posts/${this.selectedPost.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                this.showNotification('Post deleted successfully', 'success');
                this.closeModal('deleteConfirmModal');
                this.closeModal('postDetailModal');
                this.resetAndLoadPosts();
            } else {
                const error = await response.json();
                this.showNotification(error.detail || 'Failed to delete post', 'error');
            }
        } catch (error) {
            console.error('Error deleting post:', error);
            this.showNotification('Failed to delete post', 'error');
        }
    }

    sharePost(postId) {
        // Implement share functionality
        this.showNotification('Share feature coming soon!', 'info');
    }

    reportPost() {
        this.showNotification('Report feature coming soon!', 'info');
    }

    openLoginModal() {
        // You can implement a login modal or redirect to login page
        window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
    }

    resetCreatePostForm() {
        const form = document.getElementById('createPostForm');
        if (form) form.reset();
        
        document.getElementById('charCount').textContent = '0';
        document.getElementById('mediaPreview').innerHTML = '';
        document.getElementById('tagsPreview').innerHTML = '';
        document.getElementById('mediaUploadContainer').style.display = 'none';
        
        document.querySelectorAll('.post-type-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }

    // Utility methods
    formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        if (diffSec < 60) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHour < 24) return `${diffHour}h ago`;
        if (diffDay < 7) return `${diffDay}d ago`;
        
        return date.toLocaleDateString();
    }

    getVisibilityIcon(visibility) {
        switch (visibility) {
            case 'public': return '🌍';
            case 'family_only': return '👨‍👩‍👧‍👦';
            case 'private': return '🔒';
            default: return '👤';
        }
    }

    getVisibilityText(visibility) {
        switch (visibility) {
            case 'public': return 'Public';
            case 'family_only': return 'Family Only';
            case 'private': return 'Private';
            default: return visibility;
        }
    }

    getSortField() {
        switch (this.currentSort) {
            case 'popular': return 'like_count';
            case 'commented': return 'comment_count';
            default: return 'created_at';
        }
    }

    getSortOrder() {
        return this.currentSort === 'oldest' ? 'asc' : 'desc';
    }

    // Modal control methods
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

    showLoading() {
        const loading = document.getElementById('postsLoading');
        const grid = document.getElementById('postsGrid');
        const emptyState = document.getElementById('emptyPostsState');
        
        if (loading) loading.style.display = 'flex';
        if (grid) grid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'none';
    }

    hideLoading() {
        const loading = document.getElementById('postsLoading');
        if (loading) loading.style.display = 'none';
    }

    showEmptyState() {
        const grid = document.getElementById('postsGrid');
        const emptyState = document.getElementById('emptyPostsState');
        const loadMore = document.getElementById('loadMoreContainer');
        
        if (grid) grid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        if (loadMore) loadMore.style.display = 'none';
    }

    hideEmptyState() {
        const emptyState = document.getElementById('emptyPostsState');
        if (emptyState) emptyState.style.display = 'none';
    }

    showNotification(message, type = 'info') {
        if (window.familyApp && typeof window.familyApp.showNotification === 'function') {
            window.familyApp.showNotification(message, type);
        } else {
            // Fallback notification
            alert(`${type.toUpperCase()}: ${message}`);
        }
    }

    logout() {
        localStorage.removeItem('family_token');
        this.currentUser = null;
        this.showNotification('Logged out successfully', 'info');
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.postsApp = new PostsApp();
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
}// Posts Application JavaScript

class PostsApp {
    constructor() {
        this.currentUser = null;
        this.posts = [];
        this.currentPage = 1;
        this.totalPages = 1;
        this.currentFilter = 'all';
        this.currentSort = 'newest';
        this.searchQuery = '';
        this.isLoading = false;
        this.hasMore = true;
        this.selectedPost = null;
        this.selectedImageIndex = 0;
        this.currentImages = [];
        this.initialize();
    }

    initialize() {
        console.log('Posts App Initialized');
        this.checkAuthentication();
        this.setupEventListeners();
        this.loadPosts();
        this.loadPopularTags();
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
        // Update sidebar user section
        const userSection = document.querySelector('.sidebar-footer .glass');
        if (userSection && this.currentUser) {
            userSection.innerHTML = `
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 gradient-bg rounded-full flex items-center justify-center">
                        ${this.getUserInitials(this.currentUser.name)}
                    </div>
                    <div>
                        <p class="font-medium">${this.currentUser.name}</p>
                        <p class="text-sm text-gray-500">${this.currentUser.role}</p>
                    </div>
                </div>
                <button class="btn btn-outline w-full mt-4" onclick="postsApp.logout()">
                    <i class="fas fa-sign-out-alt"></i>
                    Sign Out
                </button>
            `;
        }

        // Update create post modal author info
        const authorAvatar = document.getElementById('postAuthorAvatar');
        const authorName = document.getElementById('postAuthorName');
        
        if (authorAvatar && this.currentUser) {
            authorAvatar.textContent = this.getUserInitials(this.currentUser.name);
        }
        
        if (authorName && this.currentUser) {
            authorName.textContent = this.currentUser.name;
        }

        // Update comment avatar
        const commentAvatar = document.getElementById('commentAuthorAvatar');
        if (commentAvatar && this.currentUser) {
            commentAvatar.textContent = this.getUserInitials(this.currentUser.name);
        }
    }

    getUserInitials(name) {
        return name.split(' ').map(part => part.charAt(0)).join('').toUpperCase().substring(0, 2);
    }

    setupEventListeners() {
        // Create post button
        document.getElementById('btnCreatePost')?.addEventListener('click', () => this.openCreatePostModal());
        document.getElementById('btnCreateFirstPost')?.addEventListener('click', () => this.openCreatePostModal());
        
        // Refresh button
        document.getElementById('btnRefreshPosts')?.addEventListener('click', () => this.refreshPosts());
        
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.dataset.filter;
                this.setFilter(filter);
            });
        });
        
        // Search
        const searchInput = document.getElementById('postsSearch');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(() => {
                this.searchQuery = searchInput.value.trim();
                this.resetAndLoadPosts();
            }, 500));
        }
        
        // Sort
        document.getElementById('sortPosts')?.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.resetAndLoadPosts();
        });
        
        // Load more
        document.getElementById('btnLoadMore')?.addEventListener('click', () => this.loadMorePosts());
        
        // Modal controls
        this.setupModalEvents();
        
        // Create post form
        this.setupCreatePostForm();
        
        // Image viewer
        this.setupImageViewer();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
            if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey) {
                this.openCreatePostModal();
            }
        });
    }

    setupModalEvents() {
        // Create post modal
        document.getElementById('closeCreatePostModal')?.addEventListener('click', () => this.closeModal('createPostModal'));
        document.getElementById('btnCancelPost')?.addEventListener('click', () => this.closeModal('createPostModal'));
        
        // Post detail modal
        document.getElementById('closePostDetailModal')?.addEventListener('click', () => this.closeModal('postDetailModal'));
        
        // Edit post modal
        document.getElementById('closeEditPostModal')?.addEventListener('click', () => this.closeModal('editPostModal'));
        
        // Comments modal
        document.getElementById('closeCommentsModal')?.addEventListener('click', () => this.closeModal('commentsModal'));
        
        // Likes modal
        document.getElementById('closeLikesModal')?.addEventListener('click', () => this.closeModal('likesModal'));
        
        // Delete confirmation
        document.getElementById('btnCancelDelete')?.addEventListener('click', () => this.closeModal('deleteConfirmModal'));
        document.getElementById('btnConfirmDelete')?.addEventListener('click', () => this.confirmDeletePost());
        
        // Image viewer
        document.getElementById('closeImageViewerModal')?.addEventListener('click', () => this.closeModal('imageViewerModal'));
        document.getElementById('btnPrevImage')?.addEventListener('click', () => this.showPreviousImage());
        document.getElementById('btnNextImage')?.addEventListener('click', () => this.showNextImage());
        
        // Close modals on overlay click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });
        
        // Post actions dropdown
        const actionsBtn = document.getElementById('postActionsBtn');
        const actionsMenu = document.getElementById('postActionsMenu');
        
        if (actionsBtn && actionsMenu) {
            actionsBtn.addEventListener('click', () => {
                actionsMenu.classList.toggle('show');
            });
            
            // Close dropdown when clicking elsewhere
            document.addEventListener('click', (e) => {
                if (!actionsBtn.contains(e.target) && !actionsMenu.contains(e.target)) {
                    actionsMenu.classList.remove('show');
                }
            });
        }
    }

    setupCreatePostForm() {
        const form = document.getElementById('createPostForm');
        if (!form) return;
        
        // Character counter
        const textarea = document.getElementById('postContent');
        const charCount = document.getElementById('charCount');
        
        if (textarea && charCount) {
            textarea.addEventListener('input', () => {
                charCount.textContent = textarea.value.length;
            });
        }
        
        // Post type buttons
        document.querySelectorAll('.post-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                this.handlePostTypeSelection(type);
            });
        });
        
        // Media upload
        const dropZone = document.getElementById('mediaDropZone');
        const browseBtn = document.getElementById('btnBrowseMedia');
        const fileInput = document.getElementById('fileInput');
        const removeMediaBtn = document.getElementById('btnRemoveMedia');
        
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });
            
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });
            
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                const files = e.dataTransfer.files;
                this.handleMediaFiles(files);
            });
        }
        
        if (browseBtn && fileInput) {
            browseBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                this.handleMediaFiles(e.target.files);
                fileInput.value = ''; // Reset input
            });
        }
        
        if (removeMediaBtn) {
            removeMediaBtn.addEventListener('click', () => this.removeAllMedia());
        }
        
        // Tags input
        const tagsInput = document.getElementById('postTags');
        if (tagsInput) {
            tagsInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    this.addTag(tagsInput.value.trim());
                    tagsInput.value = '';
                }
            });
            
            tagsInput.addEventListener('blur', () => {
                if (tagsInput.value.trim()) {
                    this.addTag(tagsInput.value.trim());
                    tagsInput.value = '';
                }
            });
        }
        
        // Form submission
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitPost();
        });
    }

    setupImageViewer() {
        // Keyboard navigation for image viewer
        document.addEventListener('keydown', (e) => {
            const viewerModal = document.getElementById('imageViewerModal');
            if (viewerModal.classList.contains('active')) {
                if (e.key === 'ArrowLeft') {
                    this.showPreviousImage();
                } else if (e.key === 'ArrowRight') {
                    this.showNextImage();
                } else if (e.key === 'Escape') {
                    this.closeModal('imageViewerModal');
                }
            }
        });
        
        // Swipe support for mobile
        let touchStartX = 0;
        let touchEndX = 0;
        
        const viewerContainer = document.querySelector('.image-viewer-container');
        if (viewerContainer) {
            viewerContainer.addEventListener('touchstart', (e) => {
                touchStartX = e.changedTouches[0].screenX;
            });
            
            viewerContainer.addEventListener('touchend', (e) => {
                touchEndX = e.changedTouches[0].screenX;
                this.handleSwipe();
            });
        }
    }

    handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;
        
        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                this.showNextImage(); // Swipe left
            } else {
                this.showPreviousImage(); // Swipe right
            }
        }
    }

    async loadPosts() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading();
        
        try {
            // Build query parameters
            const params = new URLSearchParams({
                page: this.currentPage,
                size: 12,
                sort_by: this.getSortField(),
                sort_order: this.getSortOrder()
            });
            
            // Add search query if exists
            if (this.searchQuery) {
                params.append('search', this.searchQuery);
            }
            
            // Add filter if not 'all'
            if (this.currentFilter !== 'all' && this.currentFilter !== 'mine') {
                if (this.currentFilter === 'family_only') {
                    params.append('visibility', 'family_only');
                } else {
                    params.append('post_type', this.currentFilter);
                }
            }
            
            // If filtering by 'mine', need to load all and filter client-side
            const response = await fetch(`/api/v1/posts/posts?${params}`);
            
            if (response.ok) {
                const data = await response.json();
                this.handlePostsResponse(data);
            } else {
                throw new Error('Failed to load posts');
            }
        } catch (error) {
            console.error('Error loading posts:', error);
            this.showNotification('Failed to load posts. Please try again.', 'error');
            this.showEmptyState();
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }

    handlePostsResponse(data) {
        let posts = data.items;
        
        // Filter by 'mine' if needed
        if (this.currentFilter === 'mine' && this.currentUser) {
            posts = posts.filter(post => post.author_id === this.currentUser.id);
        }
        
        if (this.currentPage === 1) {
            this.posts = posts;
        } else {
            this.posts = [...this.posts, ...posts];
        }
        
        this.totalPages = data.total_pages;
        this.hasMore = this.currentPage < this.totalPages;
        
        this.renderPosts();
        this.updateLoadMoreButton();
        
        // Show/hide empty state
        if (this.posts.length === 0) {
            this.showEmptyState();
        } else {
            this.hideEmptyState();
        }
    }

    renderPosts() {
        const container = document.getElementById('postsGrid');
        if (!container) return;
        
        if (this.currentPage === 1) {
            container.innerHTML = '';
        }
        
        this.posts.forEach((post, index) => {
            const postElement = this.createPostElement(post);
            if (this.currentPage === 1 && index < 3) {
                postElement.classList.add('new-post');
            }
            container.appendChild(postElement);
        });
        
        container.style.display = 'grid';
    }

    createPostElement(post) {
        const div = document.createElement('div');
        div.className = 'post-card';
        div.dataset.postId = post.id;
        
        const hasMedia = post.media_urls && post.media_urls.length > 0;
        const mediaCount = hasMedia ? post.media_urls.length : 0;
        const isTruncated = post.content && post.content.length > 200;
        const truncatedContent = isTruncated ? post.content.substring(0, 200) + '...' : post.content;
        
        div.innerHTML = `
            <div class="post-header">
                <div class="post-author">
                    <div class="author-avatar">
                        ${this.getUserInitials(post.author.name)}
                    </div>
                    <div class="author-info">
                        <div class="author-name">${post.author.name}</div>
                        <div class="post-meta">
                            <span>${this.formatTimeAgo(post.created_at)}</span>
                            <span>•</span>
                            <span class="visibility-icon">
                                ${this.getVisibilityIcon(post.visibility)}
                            </span>
                            <span>${this.getVisibilityText(post.visibility)}</span>
                        </div>
                    </div>
                </div>
                ${post.title ? `<h3 class="post-title">${post.title}</h3>` : ''}
                ${post.content ? `
                    <div class="post-content ${isTruncated ? 'truncated' : ''}">
                        ${truncatedContent}
                    </div>
                    ${isTruncated ? `
                        <div class="read-more" onclick="postsApp.viewPostDetail(${post.id})">
                            Read more <i class="fas fa-chevron-right"></i>
                        </div>
                    ` : ''}
                ` : ''}
            </div>
            
            ${hasMedia ? this.createMediaGrid(post.media_urls, post.id) : ''}
            
            ${post.tags && post.tags.length > 0 ? `
                <div class="post-tags">
                    ${post.tags.map(tag => `
                        <span class="tag" onclick="postsApp.filterByTag('${tag.name}')">${tag.name}</span>
                    `).join('')}
                </div>
            ` : ''}
            
            <div class="post-stats">
                <span>${post.like_count} ${post.like_count === 1 ? 'like' : 'likes'}</span>
                <span>${post.comment_count} ${post.comment_count === 1 ? 'comment' : 'comments'}</span>
                <span>${post.view_count} ${post.view_count === 1 ? 'view' : 'views'}</span>
            </div>
            
            <div class="post-actions">
                <button class="action-btn ${post.has_liked ? 'liked' : ''}" 
                        onclick="postsApp.toggleLike(${post.id})">
                    <i class="fas fa-heart"></i>
                    ${post.has_liked ? 'Liked' : 'Like'}
                </button>
                <button class="action-btn" onclick="postsApp.openComments(${post.id})">
                    <i class="fas fa-comment"></i>
                    Comment
                </button>
                <button class="action-btn" onclick="postsApp.sharePost(${post.id})">
                    <i class="fas fa-share"></i>
                    Share
                </button>
            </div>
        `;
        
        // Add click event for viewing post detail
        if (!isTruncated && !hasMedia) {
            div.querySelector('.post-content')?.addEventListener('click', () => {
                this.viewPostDetail(post.id);
            });
        }
        
        return div;
    }

    createMediaGrid(mediaUrls, postId) {
        if (!mediaUrls || mediaUrls.length === 0) return '';
        
        const count = mediaUrls.length;
        let gridClass = 'media-grid';
        let itemsHTML = '';
        
        if (count === 1) {
            gridClass += ' single';
            itemsHTML = this.createMediaItem(mediaUrls[0], 0, postId, true);
        } else if (count === 2) {
            gridClass += ' double';
            mediaUrls.forEach((url, index) => {
                itemsHTML += this.createMediaItem(url, index, postId, false);
            });
        } else {
            gridClass += ' multiple';
            mediaUrls.slice(0, 4).forEach((url, index) => {
                itemsHTML += this.createMediaItem(url, index, postId, false);
            });
            
            if (count > 4) {
                itemsHTML += `
                    <div class="media-item" onclick="postsApp.viewPostDetail(${postId})">
                        <div class="media-overlay">
                            +${count - 4} more
                        </div>
                        <div class="more-media-count">+${count - 4}</div>
                    </div>
                `;
            }
        }
        
        return `
            <div class="post-media">
                <div class="${gridClass}">
                    ${itemsHTML}
                </div>
            </div>
        `;
    }

    createMediaItem(url, index, postId, isSingle) {
        const isVideo = url.match(/\.(mp4|mov|avi|wmv|flv|webm)$/i);
        
        return `
            <div class="media-item ${isSingle ? 'single' : ''}" 
                 onclick="${isVideo ? `postsApp.playVideo('${url}')` : `postsApp.viewImage('${url}', ${postId}, ${index})`}">
                ${isVideo ? `
                    <video>
                        <source src="${url}" type="video/mp4">
                    </video>
                    <div class="media-overlay">
                        <i class="fas fa-play"></i>
                    </div>
                ` : `
                    <img src="${url}" alt="Post image ${index + 1}" loading="lazy">
                    <div class="media-overlay">
                        <i class="fas fa-expand"></i>
                    </div>
                `}
            </div>
        `;
    }

    async viewPostDetail(postId) {
        try {
            this.showLoading();
            const token = localStorage.getItem('family_token');
            
            const response = await fetch(`/api/v1/posts/posts/${postId}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            
            if (response.ok) {
                this.selectedPost = await response.json();
                this.showPostDetail();
            } else {
                throw new Error('Failed to load post details');
            }
        } catch (error) {
            console.error('Error loading post details:', error);
            this.showNotification('Failed to load post details', 'error');
        } finally {
            this.hideLoading();
        }
    }

    showPostDetail() {
        if (!this.selectedPost) return;
        
        const container = document.querySelector('.post-detail-container');
        if (!container) return;
        
        const hasMedia = this.selectedPost.media_urls && this.selectedPost.media_urls.length > 0;
        const mediaCount = hasMedia ? this.selectedPost.media_urls.length : 0;
        
        container.innerHTML = `
            <div class="post-header">
                <div class="post-author">
                    <div class="author-avatar">
                        ${this.getUserInitials(this.selectedPost.author.name)}
                    </div>
                    <div class="author-info">
                        <div class="author-name">${this.selectedPost.author.name}</div>
                        <div class="post-meta">
                            <span>${this.formatTimeAgo(this.selectedPost.created_at)}</span>
                            <span>•</span>
                            <span class="visibility-icon">
                                ${this.getVisibilityIcon(this.selectedPost.visibility)}
                            </span>
                            <span>${this.getVisibilityText(this.selectedPost.visibility)}</span>
                        </div>
                    </div>
                </div>
                ${this.selectedPost.title ? `<h3 class="post-title">${this.selectedPost.title}</h3>` : ''}
            </div>
            
            <div class="post-detail-content">
                ${this.selectedPost.content ? `
                    <div class="post-content">
                        ${this.selectedPost.content}
                    </div>
                ` : ''}
            </div>
            
            ${hasMedia ? this.createMediaGrid(this.selectedPost.media_urls, this.selectedPost.id) : ''}
            
            ${this.selectedPost.tags && this.selectedPost.tags.length > 0 ? `
                <div class="post-tags">
                    ${this.selectedPost.tags.map(tag => `
                        <span class="tag" onclick="postsApp.filterByTag('${tag.name}')">${tag.name}</span>
                    `).join('')}
                </div>
            ` : ''}
            
            <div class="post-detail-stats">
                <span><i class="fas fa-heart"></i> ${this.selectedPost.like_count} likes</span>
                <span><i class="fas fa-comment"></i> ${this.selectedPost.comment_count} comments</span>
                <span><i class="fas fa-eye"></i> ${this.selectedPost.view_count} views</span>
            </div>
            
            <div class="post-detail-actions">
                <button class="action-btn ${this.selectedPost.has_liked ? 'liked' : ''}" 
                        onclick="postsApp.toggleLike(${this.selectedPost.id})">
                    <i class="fas fa-heart"></i>
                    ${this.selectedPost.has_liked ? 'Liked' : 'Like'}
                </button>
                <button class="action-btn" onclick="postsApp.openComments(${this.selectedPost.id})">
                    <i class="fas fa-comment"></i>
                    Comment
                </button>
                <button class="action-btn" onclick="postsApp.sharePost(${this.selectedPost.id})">
                    <i class="fas fa-share"></i>
                    Share
                </button>
                <button class="action-btn" onclick="postsApp.openLikes(${this.selectedPost.id})">
                    <i class="fas fa-users"></i>
                    See Likes
                </button>
            </div>
            
            <div class="post-detail-comments">
                <h4>Recent Comments</h4>
                <div id="postDetailComments">
                    <!-- Comments will be loaded here -->
                </div>
                <button class="btn btn-outline w-full mt-4" onclick="postsApp.openComments(${this.selectedPost.id})">
                    <i class="fas fa-comments"></i>
                    View All Comments
                </button>
            </div>
        `;
        
        this.openModal('postDetailModal');
        this.loadPostComments(this.selectedPost.id, true);
        
        // Setup action buttons if user is the author
        if (this.currentUser && this.selectedPost.author_id === this.currentUser.id) {
            document.getElementById('btnEditPost').style.display = 'block';
            document.getElementById('btnDeletePost').style.display = 'block';
        } else {
            document.getElementById('btnEditPost').style.display = 'none';
            document.getElementById('btnDeletePost').style.display = 'none';
        }
        
        // Setup action button events
        document.getElementById('btnEditPost')?.addEventListener('click', () => this.openEditPostModal());
        document.getElementById('btnDeletePost')?.addEventListener('click', () => this.openDeleteConfirmModal());
        document.getElementById('btnReportPost')?.addEventListener('click', () => this.reportPost());
    }

    async toggleLike(postId) {
        if (!this.currentUser) {
            this.showNotification('Please login to like posts', 'info');
            this.openLoginModal();
            return;
        }
        
        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch(`/api/v1/posts/posts/${postId}/like`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // Update UI
                const postElement = document.querySelector(`.post-card[data-post-id="${postId}"]`);
                if (postElement) {
                    const likeBtn = postElement.querySelector('.action-btn');
                    const likeText = postElement.querySelector('.action-btn span') || likeBtn;
                    const stats = postElement.querySelector('.post-stats span:first-child');
                    
                    if (result.liked) {
                        likeBtn.classList.add('liked');
                        likeText.innerHTML = '<i class="fas fa-heart"></i> Liked';
                    } else {
                        likeBtn.classList.remove('liked');
                        likeText.innerHTML = '<i class="fas fa-heart"></i> Like';
                    }
                    
                    if (stats) {
                        stats.textContent = `${result.like_count} ${result.like_count === 1 ? 'like' : 'likes'}`;
                    }
                }
                
                // Update selected post if open
                if (this.selectedPost && this.selectedPost.id === postId) {
                    this.selectedPost.has_liked = result.liked;
                    this.selectedPost.like_count = result.like_count;
                }
                
                this.showNotification(result.message, 'success');
            }
        } catch (error) {
            console.error('Error toggling like:', error);
            this.showNotification('Failed to like post', 'error');
        }
    }

    async openComments(postId) {
        this.selectedPost = this.posts.find(p => p.id === postId) || this.selectedPost;
        
        if (!this.selectedPost) {
            await this.viewPostDetail(postId);
        }
        
        this.openModal('commentsModal');
        document.getElementById('commentsModalTitle').textContent = `Comments (${this.selectedPost.comment_count})`;
        this.loadPostComments(postId);
    }

    async loadPostComments(postId, limit = false) {
        try {
            const params = new URLSearchParams();
            if (limit) {
                params.append('limit', 3);
            }
            
            const response = await fetch(`/api/v1/posts/posts/${postId}/comments?${params}`);
            
            if (response.ok) {
                const data = await response.json();
                this.renderComments(data.items, limit ? 'postDetailComments' : 'commentsList');
            }
        } catch (error) {
            console.error('Error loading comments:', error);
        }
    }

    renderComments(comments, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (comments.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-8">No comments yet. Be the first to comment!</p>';
            return;
        }
        
        container.innerHTML = comments.map(comment => `
            <div class="comment-item">
                <div class="comment-author">
                    <div class="author-avatar-small">
                        ${this.getUserInitials(comment.author.name)}
                    </div>
                    <div>
                        <div class="font-medium">${comment.author.name}</div>
                        <div class="text-sm text-gray-500">${this.formatTimeAgo(comment.created_at)}</div>
                    </div>
                </div>
                <div class="comment-content">
                    <div class="comment-text">${comment.content}</div>
                    <div class="comment-meta">
                        <button class="comment-action-btn" onclick="postsApp.toggleCommentLike(${comment.id})">
                            <i class="fas fa-heart"></i> Like
                        </button>
                        <span>•</span>
                        <span>${comment.reply_count} replies</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    async openLikes(postId) {
        try {
            const response = await fetch(`/api/v1/posts/posts/${postId}/likes?limit=50`);
            
            if (response.ok) {
                const likes = await response.json();
                this.renderLikes(likes);
                this.openModal('likesModal');
            }
        } catch (error) {
            console.error('Error loading likes:', error);
            this.showNotification('Failed to load likes', 'error');
        }
    }

    renderLikes(likes) {
        const container = document.getElementById('likesList');
        if (!container) return;
        
        if (likes.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-8">No likes yet</p>';
            return;
        }
        
        container.innerHTML = likes.map(like => `
            <div class="like-item">
                <div class="like-avatar">
                    ${this.getUserInitials(like.user_name)}
                </div>
                <div class="like-info">
                    <div class="like-name">${like.user_name}</div>
                    <div class="like-time">${this.formatTimeAgo(like.created_at)}</div>
                </div>
            </div>
        `).join('');
    }

    viewImage(imageUrl, postId, index) {
        this.currentImages = this.selectedPost?.media_urls || [];
        this.selectedImageIndex = index;
        
        const image = document.getElementById('viewerImage');
        const caption = document.getElementById('imageCaption');
        
        if (image) {
            image.src = imageUrl;
            image.alt = `Image ${index + 1} from post`;
        }
        
        if (caption) {
            caption.textContent = `Image ${index + 1} of ${this.currentImages.length}`;
        }
        
        this.openModal('imageViewerModal');
    }

    showPreviousImage() {
        if (this.currentImages.length === 0) return;
        
        this.selectedImageIndex = (this.selectedImageIndex - 1 + this.currentImages.length) % this.currentImages.length;
        this.viewImage(this.currentImages[this.selectedImageIndex], null, this.selectedImageIndex);
    }

    showNextImage() {
        if (this.currentImages.length === 0) return;
        
        this.selectedImageIndex = (this.selectedImageIndex + 1) % this.currentImages.length;
        this.viewImage(this.currentImages[this.selectedImageIndex], null, this.selectedImageIndex);
    }

    playVideo(videoUrl) {
        // For now, just open the video in a new tab
        window.open(videoUrl, '_blank');
    }

    async submitPost() {
        if (!this.currentUser) {
            this.showNotification('Please login to create posts', 'info');
            this.openLoginModal();
            return;
        }
        
        const title = document.getElementById('postTitle').value.trim();
        const content = document.getElementById('postContent').value.trim();
        const visibility = document.getElementById('postVisibility').value;
        const mediaUrls = this.getMediaUrls(); // In production, you'd upload files first
        const tags = this.getTags();
        
        if (!content && mediaUrls.length === 0) {
            this.showNotification('Please add content or media to your post', 'error');
            return;
        }
        
        try {
            const token = localStorage.getItem('family_token');
            const postData = {
                title: title || null,
                content: content || null,
                post_type: mediaUrls.length > 0 ? (mediaUrls.length === 1 ? 'image' : 'mixed') : 'text',
                media_urls: mediaUrls,
                visibility: visibility,
                tags: tags
            };
            
            const response = await fetch('/api/v1/posts/posts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(postData)
            });
            
            if (response.ok) {
                const newPost = await response.json();
                this.showNotification('Post created successfully!', 'success');
                this.closeModal('createPostModal');
                this.resetCreatePostForm();
                this.resetAndLoadPosts();
            } else {
                const error = await response.json();
                this.showNotification(error.detail || 'Failed to create post', 'error');
            }
        } catch (error) {
            console.error('Error creating post:', error);
            this.showNotification('Network error. Please try again.', 'error');
        }
    }

    getMediaUrls() {
        // In a real app, you would upload files to a server and get URLs
        // For now, return empty array - implement file upload separately
        return [];
    }

    getTags() {
        const tagElements = document.querySelectorAll('.tag-pill');
        return Array.from(tagElements).map(tag => tag.textContent.trim());
    }

    addTag(tagText) {
        if (!tagText) return;
        
        const tagsPreview = document.getElementById('tagsPreview');
        const tagPill = document.createElement('div');
        tagPill.className = 'tag-pill';
        tagPill.innerHTML = `
            ${tagText}
            <button class="remove-tag" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        tagsPreview.appendChild(tagPill);
    }

    removeAllMedia() {
        const preview = document.getElementById('mediaPreview');
        if (preview) {
            preview.innerHTML = '';
        }
        document.getElementById('mediaUploadContainer').style.display = 'none';
    }

    handleMediaFiles(files) {
        // Implement file validation and preview
        const container = document.getElementById('mediaUploadContainer');
        const preview = document.getElementById('mediaPreview');
        
        if (!container || !preview) return;
        
        container.style.display = 'block';
        
        Array.from(files).slice(0, 10).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const isVideo = file.type.startsWith('video/');
                const item = document.createElement('div');
                item.className = 'media-preview-item';
                item.innerHTML = `
                    ${isVideo ? `
                        <video controls>
                            <source src="${e.target.result}" type="${file.type}">
                        </video>
                    ` : `
                        <img src="${e.target.result}" alt="${file.name}">
                    `}
                    <button class="remove-media-btn" onclick="this.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                preview.appendChild(item);
            };
            reader.readAsDataURL(file);
        });
    }

    handlePostTypeSelection(type) {
        const container = document.getElementById('mediaUploadContainer');
        const buttons = document.querySelectorAll('.post-type-btn');
        
        buttons.forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
        if (type === 'text') {
            container.style.display = 'none';
        } else {
            container.style.display = 'block';
        }
    }

    setFilter(filter) {
        this.currentFilter = filter;
        this.currentPage = 1;
        
        // Update button states
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        
        this.loadPosts();
    }

    filterByTag(tagName) {
        this.searchQuery = tagName;
        document.getElementById('postsSearch').value = tagName;
        this.resetAndLoadPosts();
    }

    resetAndLoadPosts() {
        this.currentPage = 1;
        this.posts = [];
        this.loadPosts();
    }

    async loadMorePosts() {
        if (this.isLoading || !this.hasMore) return;
        
        this.currentPage++;
        await this.loadPosts();
    }

    refreshPosts() {
        this.resetAndLoadPosts();
        this.showNotification('Posts refreshed', 'success');
    }

    updateLoadMoreButton() {
        const container = document.getElementById('loadMoreContainer');
        const spinner = document.getElementById('loadMoreSpinner');
        const text = document.getElementById('loadMoreText');
        
        if (!container || !spinner || !text) return;
        
        if (this.hasMore) {
            container.style.display = 'block';
            spinner.style.display = 'none';
            text.textContent = 'Load More Posts';
        } else if (this.posts.length > 0) {
            container.style.display = 'block';
            spinner.style.display = 'none';
            text.textContent = 'No more posts to load';
            text.parentElement.disabled = true;
        } else {
            container.style.display = 'none';
        }
    }

    async loadPopularTags() {
        try {
            const response = await fetch('/api/v1/posts/tags?limit=10');
            if (response.ok) {
                const tags = await response.json();
                this.renderPopularTags(tags);
            }
        } catch (error) {
            console.error('Error loading popular tags:', error);
        }
    }

    renderPopularTags(tags) {
        const container = document.getElementById('popularTags');
        if (!container || !tags.length) return;
        
        container.innerHTML = '<small>Popular: </small>' + tags.map(tag => `
            <button onclick="postsApp.filterByTag('${tag.name}')">${tag.name}</button>
        `).join('');
    }

    openCreatePostModal() {
        if (!this.currentUser) {
            this.showNotification('Please login to create posts', 'info');
            this.openLoginModal();
            return;
        }
        
        this.openModal('createPostModal');
    }

    openEditPostModal() {
        // Implement edit post functionality
        this.showNotification('Edit post feature coming soon!', 'info');
    }

    openDeleteConfirmModal() {
        if (!this.selectedPost) return;
        
        document.getElementById('deleteConfirmText').textContent = 
            `Are you sure you want to delete this post? This action cannot be undone.`;
        
        this.openModal('deleteConfirmModal');
    }

    async confirmDeletePost() {
        if (!this.selectedPost || !this.currentUser) return;
        
        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch(`/api/v1/posts/posts/${this.selectedPost.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                this.showNotification('Post deleted successfully', 'success');
                this.closeModal('deleteConfirmModal');
                this.closeModal('postDetailModal');
                this.resetAndLoadPosts();
            } else {
                const error = await response.json();
                this.showNotification(error.detail || 'Failed to delete post', 'error');
            }
        } catch (error) {
            console.error('Error deleting post:', error);
            this.showNotification('Failed to delete post', 'error');
        }
    }

    sharePost(postId) {
        // Implement share functionality
        this.showNotification('Share feature coming soon!', 'info');
    }

    reportPost() {
        this.showNotification('Report feature coming soon!', 'info');
    }

    openLoginModal() {
        // You can implement a login modal or redirect to login page
        window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
    }

    resetCreatePostForm() {
        const form = document.getElementById('createPostForm');
        if (form) form.reset();
        
        document.getElementById('charCount').textContent = '0';
        document.getElementById('mediaPreview').innerHTML = '';
        document.getElementById('tagsPreview').innerHTML = '';
        document.getElementById('mediaUploadContainer').style.display = 'none';
        
        document.querySelectorAll('.post-type-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }

    // Utility methods
    formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        if (diffSec < 60) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHour < 24) return `${diffHour}h ago`;
        if (diffDay < 7) return `${diffDay}d ago`;
        
        return date.toLocaleDateString();
    }

    getVisibilityIcon(visibility) {
        switch (visibility) {
            case 'public': return '🌍';
            case 'family_only': return '👨‍👩‍👧‍👦';
            case 'private': return '🔒';
            default: return '👤';
        }
    }

    getVisibilityText(visibility) {
        switch (visibility) {
            case 'public': return 'Public';
            case 'family_only': return 'Family Only';
            case 'private': return 'Private';
            default: return visibility;
        }
    }

    getSortField() {
        switch (this.currentSort) {
            case 'popular': return 'like_count';
            case 'commented': return 'comment_count';
            default: return 'created_at';
        }
    }

    getSortOrder() {
        return this.currentSort === 'oldest' ? 'asc' : 'desc';
    }

    // Modal control methods
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

    showLoading() {
        const loading = document.getElementById('postsLoading');
        const grid = document.getElementById('postsGrid');
        const emptyState = document.getElementById('emptyPostsState');
        
        if (loading) loading.style.display = 'flex';
        if (grid) grid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'none';
    }

    hideLoading() {
        const loading = document.getElementById('postsLoading');
        if (loading) loading.style.display = 'none';
    }

    showEmptyState() {
        const grid = document.getElementById('postsGrid');
        const emptyState = document.getElementById('emptyPostsState');
        const loadMore = document.getElementById('loadMoreContainer');
        
        if (grid) grid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        if (loadMore) loadMore.style.display = 'none';
    }

    hideEmptyState() {
        const emptyState = document.getElementById('emptyPostsState');
        if (emptyState) emptyState.style.display = 'none';
    }

    showNotification(message, type = 'info') {
        if (window.familyApp && typeof window.familyApp.showNotification === 'function') {
            window.familyApp.showNotification(message, type);
        } else {
            // Fallback notification
            alert(`${type.toUpperCase()}: ${message}`);
        }
    }

    logout() {
        localStorage.removeItem('family_token');
        this.currentUser = null;
        this.showNotification('Logged out successfully', 'info');
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.postsApp = new PostsApp();
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