class PostsApp {
    constructor() {
        this.currentUser = null;
        this.posts = [];
        this.currentPage = 1;
        this.pageSize = 12;
        this.totalPages = 1;
        this.hasMore = false;
        this.isLoading = false;
        this.currentFilter = "all";
        this.currentSort = "newest";
        this.searchQuery = "";
        this.selectedPost = null;
        this.pendingDeletePostId = null;
        this.pendingMedia = [];
        this.selectedComposerMode = "text";
        this.selectedTags = [];
        this.viewerImages = [];
        this.viewerIndex = 0;
        this.searchDebounceTimer = null;
        this.elements = {};
    }

    async initialize() {
        this.cacheElements();
        this.setupEventListeners();
        await this.checkAuthentication();
        this.updateAuthUi();
        await Promise.all([this.loadPosts({ reset: true }), this.loadPopularTags()]);
    }

    cacheElements() {
        this.elements.postsLoading = document.getElementById("postsLoading");
        this.elements.emptyPostsState = document.getElementById("emptyPostsState");
        this.elements.postsGrid = document.getElementById("postsGrid");
        this.elements.loadMoreContainer = document.getElementById("loadMoreContainer");
        this.elements.btnLoadMore = document.getElementById("btnLoadMore");
        this.elements.loadMoreText = document.getElementById("loadMoreText");
        this.elements.loadMoreSpinner = document.getElementById("loadMoreSpinner");
        this.elements.postsSearch = document.getElementById("postsSearch");
        this.elements.sortPosts = document.getElementById("sortPosts");
        this.elements.btnCreatePost = document.getElementById("btnCreatePost");
        this.elements.btnCreateFirstPost = document.getElementById("btnCreateFirstPost");
        this.elements.btnRefreshPosts = document.getElementById("btnRefreshPosts");
        this.elements.postAuthorAvatar = document.getElementById("postAuthorAvatar");
        this.elements.postAuthorName = document.getElementById("postAuthorName");
        this.elements.commentAuthorAvatar = document.getElementById("commentAuthorAvatar");
        this.elements.commentFormContainer = document.getElementById("commentFormContainer");
        this.elements.commentsModalTitle = document.getElementById("commentsModalTitle");
        this.elements.commentsList = document.getElementById("commentsList");
        this.elements.likesList = document.getElementById("likesList");
        this.elements.postDetailContainer = document.querySelector(".post-detail-container");
        this.elements.mediaUploadContainer = document.getElementById("mediaUploadContainer");
        this.elements.mediaDropZone = document.getElementById("mediaDropZone");
        this.elements.mediaPreview = document.getElementById("mediaPreview");
        this.elements.fileInput = document.getElementById("fileInput");
        this.elements.postTitle = document.getElementById("postTitle");
        this.elements.postContent = document.getElementById("postContent");
        this.elements.postTags = document.getElementById("postTags");
        this.elements.tagsPreview = document.getElementById("tagsPreview");
        this.elements.popularTags = document.getElementById("popularTags");
        this.elements.charCount = document.getElementById("charCount");
        this.elements.commentForm = document.getElementById("commentForm");
        this.elements.commentInput = document.getElementById("commentInput");
        this.elements.createPostForm = document.getElementById("createPostForm");
        this.elements.viewerImage = document.getElementById("viewerImage");
        this.elements.imageCaption = document.getElementById("imageCaption");
        this.elements.postActionsBtn = document.getElementById("postActionsBtn");
        this.elements.postActionsMenu = document.getElementById("postActionsMenu");
        this.elements.btnDeletePost = document.getElementById("btnDeletePost");
        this.elements.btnEditPost = document.getElementById("btnEditPost");
        this.elements.btnReportPost = document.getElementById("btnReportPost");
        this.elements.btnConfirmDelete = document.getElementById("btnConfirmDelete");
        this.elements.authHint = document.getElementById("postsAuthHint");
    }

    setupEventListeners() {
        this.elements.btnCreatePost?.addEventListener("click", () => this.openCreatePostModal());
        this.elements.btnCreateFirstPost?.addEventListener("click", () => this.openCreatePostModal());
        this.elements.btnRefreshPosts?.addEventListener("click", () => this.loadPosts({ reset: true }));
        this.elements.btnLoadMore?.addEventListener("click", () => this.loadMorePosts());

        document.querySelectorAll(".filter-btn").forEach((button) => {
            button.addEventListener("click", () => this.setFilter(button.dataset.filter || "all"));
        });

        this.elements.sortPosts?.addEventListener("change", (event) => {
            this.currentSort = event.target.value || "newest";
            this.loadPosts({ reset: true });
        });

        this.elements.postsSearch?.addEventListener("input", (event) => {
            window.clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = window.setTimeout(() => {
                this.searchQuery = event.target.value.trim();
                this.loadPosts({ reset: true });
            }, 350);
        });

        this.elements.postsGrid?.addEventListener("click", (event) => this.handlePostAction(event));
        this.elements.postDetailContainer?.addEventListener("click", (event) => this.handlePostAction(event));
        this.elements.popularTags?.addEventListener("click", (event) => this.handlePopularTagClick(event));

        this.elements.createPostForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.submitPost();
        });

        this.elements.commentForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.submitComment();
        });

        this.elements.postContent?.addEventListener("input", () => {
            if (this.elements.charCount) {
                this.elements.charCount.textContent = String(this.elements.postContent.value.length);
            }
        });

        document.querySelectorAll(".post-type-btn").forEach((button) => {
            button.addEventListener("click", () => this.selectComposerMode(button.dataset.type || "text"));
        });

        this.elements.mediaDropZone?.addEventListener("click", () => this.elements.fileInput?.click());
        this.elements.mediaDropZone?.addEventListener("dragover", (event) => {
            event.preventDefault();
            this.elements.mediaDropZone?.classList.add("dragover");
        });
        this.elements.mediaDropZone?.addEventListener("dragleave", () => {
            this.elements.mediaDropZone?.classList.remove("dragover");
        });
        this.elements.mediaDropZone?.addEventListener("drop", (event) => {
            event.preventDefault();
            this.elements.mediaDropZone?.classList.remove("dragover");
            this.handleMediaFiles(event.dataTransfer?.files);
        });

        this.elements.fileInput?.addEventListener("change", (event) => {
            this.handleMediaFiles(event.target.files);
            event.target.value = "";
        });

        document.getElementById("btnBrowseMedia")?.addEventListener("click", (event) => {
            event.preventDefault();
            this.elements.fileInput?.click();
        });

        document.getElementById("btnRemoveMedia")?.addEventListener("click", (event) => {
            event.preventDefault();
            this.pendingMedia = [];
            this.renderMediaPreview();
            this.syncComposerModeVisibility();
        });

        this.elements.mediaPreview?.addEventListener("click", (event) => {
            const removeButton = event.target.closest("[data-remove-media-index]");
            if (!removeButton) {
                return;
            }
            const index = Number(removeButton.dataset.removeMediaIndex);
            if (Number.isFinite(index)) {
                this.removePendingMedia(index);
            }
        });

        this.elements.postTags?.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                this.addTag(this.elements.postTags.value);
                this.elements.postTags.value = "";
            }
        });

        this.elements.postTags?.addEventListener("blur", () => {
            if (this.elements.postTags.value.trim()) {
                this.addTag(this.elements.postTags.value);
                this.elements.postTags.value = "";
            }
        });

        this.elements.tagsPreview?.addEventListener("click", (event) => {
            const removeButton = event.target.closest("[data-remove-tag]");
            if (!removeButton) {
                return;
            }
            const tag = removeButton.dataset.removeTag;
            this.selectedTags = this.selectedTags.filter((item) => item !== tag);
            this.renderTagPreview();
        });

        document.getElementById("closeCreatePostModal")?.addEventListener("click", () => this.closeModal("createPostModal"));
        document.getElementById("btnCancelPost")?.addEventListener("click", () => this.closeModal("createPostModal"));
        document.getElementById("closePostDetailModal")?.addEventListener("click", () => this.closeModal("postDetailModal"));
        document.getElementById("closeCommentsModal")?.addEventListener("click", () => this.closeModal("commentsModal"));
        document.getElementById("closeLikesModal")?.addEventListener("click", () => this.closeModal("likesModal"));
        document.getElementById("closeImageViewerModal")?.addEventListener("click", () => this.closeModal("imageViewerModal"));
        document.getElementById("btnCancelDelete")?.addEventListener("click", () => this.closeModal("deleteConfirmModal"));
        document.getElementById("btnPrevImage")?.addEventListener("click", () => this.showPreviousImage());
        document.getElementById("btnNextImage")?.addEventListener("click", () => this.showNextImage());
        this.elements.btnConfirmDelete?.addEventListener("click", () => this.confirmDeletePost());

        this.elements.postActionsBtn?.addEventListener("click", (event) => {
            event.stopPropagation();
            this.elements.postActionsMenu?.classList.toggle("show");
        });

        this.elements.btnDeletePost?.addEventListener("click", () => this.openDeleteConfirmModal());
        this.elements.btnEditPost?.addEventListener("click", () => {
            this.showNotification("Post editing can be added next. Delete and recreate is available for now.", "info");
        });
        this.elements.btnReportPost?.addEventListener("click", () => {
            this.showNotification("Reporting is not configured yet.", "info");
        });

        document.addEventListener("click", (event) => {
            if (
                this.elements.postActionsMenu &&
                this.elements.postActionsBtn &&
                !this.elements.postActionsBtn.contains(event.target) &&
                !this.elements.postActionsMenu.contains(event.target)
            ) {
                this.elements.postActionsMenu.classList.remove("show");
            }
        });

        document.querySelectorAll(".modal").forEach((modal) => {
            modal.addEventListener("click", (event) => {
                if (event.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                this.closeAllModals();
            }
            if (event.key === "ArrowLeft" && this.isModalOpen("imageViewerModal")) {
                this.showPreviousImage();
            }
            if (event.key === "ArrowRight" && this.isModalOpen("imageViewerModal")) {
                this.showNextImage();
            }
        });
    }

    getAuthToken() {
        return localStorage.getItem("family_token");
    }

    getAuthHeaders() {
        const headers = { Accept: "application/json" };
        const token = this.getAuthToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        return headers;
    }

    async checkAuthentication() {
        const token = this.getAuthToken();
        if (!token) {
            this.currentUser = null;
            return null;
        }

        try {
            const response = await fetch("/api/v1/auth/users/me", {
                headers: this.getAuthHeaders(),
            });

            if (!response.ok) {
                throw new Error(`Authentication failed: ${response.status}`);
            }

            this.currentUser = await response.json();
            return this.currentUser;
        } catch (error) {
            console.warn("Authentication check failed:", error);
            localStorage.removeItem("family_token");
            this.currentUser = null;
            return null;
        }
    }

    updateAuthUi() {
        const fallbackName = this.currentUser?.name || "Association Member";
        const initials = this.getInitials(fallbackName);

        if (this.elements.postAuthorAvatar) {
            this.elements.postAuthorAvatar.textContent = initials;
        }
        if (this.elements.postAuthorName) {
            this.elements.postAuthorName.textContent = fallbackName;
        }
        if (this.elements.commentAuthorAvatar) {
            this.elements.commentAuthorAvatar.textContent = initials;
        }

        const createLabel = this.currentUser ? "Create New Post" : "Member Login to Post";
        const firstLabel = this.currentUser ? "Create Your First Post" : "Sign In to View and Post";
        if (this.elements.btnCreatePost) {
            this.elements.btnCreatePost.innerHTML = `<i class="fas fa-plus-circle"></i> ${createLabel}`;
        }
        if (this.elements.btnCreateFirstPost) {
            this.elements.btnCreateFirstPost.innerHTML = `<i class="fas fa-plus-circle"></i> ${firstLabel}`;
        }

        const myPostsButton = document.querySelector('.filter-btn[data-filter="mine"]');
        if (myPostsButton) {
            myPostsButton.disabled = !this.currentUser;
            myPostsButton.classList.toggle("is-disabled", !this.currentUser);
        }

        if (this.elements.authHint) {
            this.elements.authHint.textContent = this.currentUser
                ? `Signed in as ${this.currentUser.name}. You can share text, photo, and video posts, then comment and like across the association feed.`
                : "Anyone can read posts here. Sign in to share updates and join the conversation with likes and comments.";
        }

        this.renderCommentComposerState();
    }

    requireLogin(message) {
        this.showNotification(message || "Please sign in to continue.", "info");
        window.setTimeout(() => {
            window.location.href = "/login";
        }, 450);
        return false;
    }

    async loadPosts({ reset = false } = {}) {
        if (this.isLoading) {
            return;
        }

        if (reset) {
            this.currentPage = 1;
            this.posts = [];
            this.hasMore = false;
        }

        this.isLoading = true;
        this.toggleLoading(true);

        try {
            const params = new URLSearchParams({
                skip: String((this.currentPage - 1) * this.pageSize),
                limit: String(this.pageSize),
                sort_by: this.getSortField(),
                sort_order: this.getSortOrder(),
            });

            if (this.searchQuery) {
                params.append("search_query", this.searchQuery);
            }

            if (this.currentFilter === "mine" && this.currentUser) {
                params.append("author_id", String(this.currentUser.id));
            } else if (["text", "image", "video"].includes(this.currentFilter)) {
                params.append("post_type", this.currentFilter.toUpperCase());
            }

            const response = await fetch(`/api/v1/posts/posts?${params.toString()}`, {
                headers: this.getAuthHeaders(),
            });

            if (!response.ok) {
                throw new Error(`Failed to load posts: ${response.status}`);
            }

            const data = await response.json();
            const normalizedItems = (data.items || []).map((post) => this.normalizePost(post));

            if (reset) {
                this.posts = normalizedItems;
            } else {
                this.posts = [...this.posts, ...normalizedItems];
            }

            this.totalPages = data.total_pages || 1;
            this.hasMore = this.currentPage < this.totalPages;
            this.renderPosts();
            this.updateLoadMoreUi();
        } catch (error) {
            console.error("Error loading posts:", error);
            this.posts = reset ? [] : this.posts;
            this.renderPosts();
            this.updateLoadMoreUi();
            this.showNotification("Unable to load posts right now. Please try again.", "error");
        } finally {
            this.isLoading = false;
            this.toggleLoading(false);
        }
    }

    loadMorePosts() {
        if (!this.hasMore || this.isLoading) {
            return;
        }
        this.currentPage += 1;
        this.loadPosts({ reset: false });
    }

    renderPosts() {
        if (!this.elements.postsGrid || !this.elements.emptyPostsState) {
            return;
        }

        if (!this.posts.length) {
            this.elements.postsGrid.innerHTML = "";
            this.elements.postsGrid.style.display = "none";
            this.elements.emptyPostsState.style.display = "block";

            const emptyTitle = this.elements.emptyPostsState.querySelector("h3");
            const emptyMessage = this.elements.emptyPostsState.querySelector("p");
            if (emptyTitle) {
                emptyTitle.textContent = "No Posts Yet";
            }
            if (emptyMessage) {
                emptyMessage.textContent = this.currentUser
                    ? "Be the first to share a family update, photo, or video from the association."
                    : "There are no published association posts yet. Sign in to add the first one.";
            }
            return;
        }

        this.elements.emptyPostsState.style.display = "none";
        this.elements.postsGrid.style.display = "grid";
        this.elements.postsGrid.innerHTML = this.posts
            .map((post, index) => this.renderPostCard(post, index))
            .join("");
    }

    renderPostCard(post, index) {
        const mediaUrls = this.normalizeMediaUrls(post.media_urls);
        const hasMedia = mediaUrls.length > 0;
        const content = post.content ? this.escapeHtml(post.content) : "";
        const isLongContent = content.length > 240;
        const cardContent = isLongContent ? `${content.slice(0, 240)}...` : content;
        const tags = Array.isArray(post.tags) ? post.tags : [];

        return `
            <article class="post-card ${index < 3 ? "new-post" : ""}" data-post-id="${post.id}">
                <div class="post-header">
                    <div class="post-author">
                        <div class="author-avatar">${this.getInitials(post.author?.name || "Association")}</div>
                        <div class="author-info">
                            <div class="author-name">${this.escapeHtml(post.author?.name || "Association Member")}</div>
                            <div class="post-meta">
                                <span>${this.formatTimeAgo(post.created_at)}</span>
                                <span>•</span>
                                <span class="visibility-icon">${this.getVisibilityIcon(post.visibility)}</span>
                                <span>${this.getVisibilityLabel(post.visibility)}</span>
                            </div>
                        </div>
                    </div>
                    ${post.title ? `<h3 class="post-title">${this.escapeHtml(post.title)}</h3>` : ""}
                    ${content ? `
                        <div class="post-content ${isLongContent ? "truncated" : ""}">
                            ${cardContent}
                        </div>
                    ` : ""}
                    ${(isLongContent || hasMedia) ? `
                        <button class="read-more" type="button" data-action="view-post" data-post-id="${post.id}">
                            View post <i class="fas fa-chevron-right"></i>
                        </button>
                    ` : ""}
                </div>
                ${hasMedia ? this.renderMediaGrid(mediaUrls, post.id) : ""}
                ${tags.length ? `
                    <div class="post-tags">
                        ${tags.map((tag) => `
                            <button class="tag" type="button" data-action="filter-tag" data-tag="${this.escapeAttribute(tag.name || tag)}">
                                ${this.escapeHtml(tag.name || tag)}
                            </button>
                        `).join("")}
                    </div>
                ` : ""}
                <div class="post-stats">
                    <button class="post-stat-link" type="button" data-action="open-likes" data-post-id="${post.id}">
                        ${post.like_count} ${post.like_count === 1 ? "like" : "likes"}
                    </button>
                    <span>${post.comment_count} ${post.comment_count === 1 ? "comment" : "comments"}</span>
                    <span>${post.view_count} ${post.view_count === 1 ? "view" : "views"}</span>
                </div>
                <div class="post-actions">
                    <button class="action-btn ${post.has_liked ? "liked" : ""}" type="button" data-action="toggle-like" data-post-id="${post.id}">
                        <i class="fas fa-heart"></i>
                        <span>${post.has_liked ? "Liked" : "Like"}</span>
                    </button>
                    <button class="action-btn" type="button" data-action="open-comments" data-post-id="${post.id}">
                        <i class="fas fa-comment"></i>
                        <span>Comment</span>
                    </button>
                    <button class="action-btn" type="button" data-action="view-post" data-post-id="${post.id}">
                        <i class="fas fa-expand"></i>
                        <span>View</span>
                    </button>
                </div>
            </article>
        `;
    }

    renderMediaGrid(mediaUrls, postId) {
        const previewUrls = mediaUrls.slice(0, 4);
        let gridClass = "media-grid";
        if (previewUrls.length === 1) {
            gridClass += " single";
        } else if (previewUrls.length === 2) {
            gridClass += " double";
        } else {
            gridClass += " multiple";
        }

        const overflowCount = mediaUrls.length - previewUrls.length;
        const items = previewUrls
            .map((url, index) => this.renderMediaItem(
                url,
                postId,
                index,
                overflowCount > 0 && index === previewUrls.length - 1 ? overflowCount : 0,
            ))
            .join("");

        return `
            <div class="post-media">
                <div class="${gridClass}">
                    ${items}
                </div>
            </div>
        `;
    }

    renderMediaItem(url, postId, index, overflowCount = 0) {
        const resolvedUrl = this.resolveMediaUrl(url);
        if (this.isVideoUrl(resolvedUrl)) {
            return `
                <button class="media-item" type="button" data-action="view-post" data-post-id="${postId}" data-media-index="${index}">
                    <video muted playsinline preload="metadata">
                        <source src="${resolvedUrl}">
                    </video>
                    <div class="media-overlay"><i class="fas fa-play"></i></div>
                    ${overflowCount ? `<div class="more-media-count">+${overflowCount}</div>` : ""}
                </button>
            `;
        }

        return `
            <button class="media-item" type="button" data-action="open-image" data-post-id="${postId}" data-media-index="${index}">
                <img src="${resolvedUrl}" alt="Post media ${index + 1}" loading="lazy">
                <div class="media-overlay"><i class="fas fa-expand"></i></div>
                ${overflowCount ? `<div class="more-media-count">+${overflowCount}</div>` : ""}
            </button>
        `;
    }

    renderDetailMediaGrid(mediaUrls, postId) {
        let gridClass = "media-grid";
        if (mediaUrls.length === 1) {
            gridClass += " single";
        } else if (mediaUrls.length === 2) {
            gridClass += " double";
        } else {
            gridClass += " multiple";
        }

        return `
            <div class="${gridClass}">
                ${mediaUrls.map((url, index) => {
                    const resolvedUrl = this.resolveMediaUrl(url);
                    if (this.isVideoUrl(resolvedUrl)) {
                        return `
                            <div class="media-item">
                                <video controls playsinline preload="metadata">
                                    <source src="${resolvedUrl}">
                                </video>
                            </div>
                        `;
                    }

                    return `
                        <button class="media-item" type="button" data-action="open-image" data-post-id="${postId}" data-media-index="${index}">
                            <img src="${resolvedUrl}" alt="Post media ${index + 1}" loading="lazy">
                            <div class="media-overlay"><i class="fas fa-expand"></i></div>
                        </button>
                    `;
                }).join("")}
            </div>
        `;
    }

    async openCreatePostModal() {
        if (!this.currentUser) {
            this.requireLogin("Please sign in to create a post.");
            return;
        }

        this.resetCreatePostForm();
        this.openModal("createPostModal");
    }

    selectComposerMode(mode) {
        this.selectedComposerMode = mode;
        document.querySelectorAll(".post-type-btn").forEach((button) => {
            button.classList.toggle("active", button.dataset.type === mode);
        });
        this.syncComposerModeVisibility();
    }

    syncComposerModeVisibility() {
        const shouldShowMedia = this.selectedComposerMode !== "text" || this.pendingMedia.length > 0;
        if (this.elements.mediaUploadContainer) {
            this.elements.mediaUploadContainer.style.display = shouldShowMedia ? "block" : "none";
        }
    }

    handleMediaFiles(fileList) {
        if (!fileList || !fileList.length) {
            return;
        }

        const files = Array.from(fileList);
        const remainingSlots = 10 - this.pendingMedia.length;
        if (remainingSlots <= 0) {
            this.showNotification("You can add up to 10 media files per post.", "error");
            return;
        }

        const acceptedFiles = files.slice(0, remainingSlots);
        const invalidFiles = acceptedFiles.filter((file) => !this.isAcceptedMediaFile(file));
        if (invalidFiles.length) {
            this.showNotification("Only image and video files are supported.", "error");
        }

        acceptedFiles
            .filter((file) => this.isAcceptedMediaFile(file))
            .forEach((file) => {
                this.pendingMedia.push({
                    file,
                    previewUrl: URL.createObjectURL(file),
                    type: file.type.startsWith("video/") ? "video" : "image",
                });
            });

        if (this.pendingMedia.length) {
            this.selectComposerMode("image");
        }

        this.renderMediaPreview();
        this.syncComposerModeVisibility();
    }

    isAcceptedMediaFile(file) {
        return Boolean(file && (file.type.startsWith("image/") || file.type.startsWith("video/")));
    }

    renderMediaPreview() {
        if (!this.elements.mediaPreview) {
            return;
        }

        this.elements.mediaPreview.innerHTML = this.pendingMedia
            .map((item, index) => `
                <div class="media-preview-item">
                    ${item.type === "video"
                        ? `<video muted playsinline preload="metadata"><source src="${item.previewUrl}"></video>`
                        : `<img src="${item.previewUrl}" alt="Selected media ${index + 1}">`
                    }
                    <button class="remove-media-btn" type="button" data-remove-media-index="${index}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `)
            .join("");
    }

    removePendingMedia(index) {
        const media = this.pendingMedia[index];
        if (media?.previewUrl) {
            URL.revokeObjectURL(media.previewUrl);
        }
        this.pendingMedia.splice(index, 1);
        this.renderMediaPreview();
        this.syncComposerModeVisibility();
    }

    addTag(rawValue) {
        const value = (rawValue || "").trim().replace(/^#+/, "");
        if (!value) {
            return;
        }
        if (this.selectedTags.includes(value)) {
            return;
        }
        this.selectedTags.push(value);
        this.renderTagPreview();
    }

    renderTagPreview() {
        if (!this.elements.tagsPreview) {
            return;
        }

        this.elements.tagsPreview.innerHTML = this.selectedTags
            .map((tag) => `
                <span class="tag-pill">
                    ${this.escapeHtml(tag)}
                    <button class="remove-tag" type="button" data-remove-tag="${this.escapeAttribute(tag)}">
                        <i class="fas fa-times"></i>
                    </button>
                </span>
            `)
            .join("");
    }

    async loadPopularTags() {
        try {
            const response = await fetch("/api/v1/posts/tags?limit=10", {
                headers: { Accept: "application/json" },
            });

            if (!response.ok) {
                return;
            }

            const tags = await response.json();
            if (!this.elements.popularTags) {
                return;
            }

            if (!tags.length) {
                this.elements.popularTags.innerHTML = "<small>Popular tags will appear here as members start tagging posts.</small>";
                return;
            }

            this.elements.popularTags.innerHTML = `
                <small>Popular:</small>
                ${tags.map((tag) => `
                    <button type="button" data-suggested-tag="${this.escapeAttribute(tag.name)}">#${this.escapeHtml(tag.name)}</button>
                `).join("")}
            `;
        } catch (error) {
            console.warn("Unable to load popular tags:", error);
        }
    }

    handlePopularTagClick(event) {
        const tagButton = event.target.closest("[data-suggested-tag]");
        if (!tagButton) {
            return;
        }
        this.addTag(tagButton.dataset.suggestedTag || "");
    }

    async submitPost() {
        if (!this.currentUser) {
            this.requireLogin("Please sign in to create a post.");
            return;
        }

        const title = this.elements.postTitle?.value.trim() || "";
        const content = this.elements.postContent?.value.trim() || "";

        if (!content && !this.pendingMedia.length) {
            this.showNotification("Add some text, an image, or a video before posting.", "error");
            return;
        }

        const submitButton = document.getElementById("btnSubmitPost");
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing...';
        }

        try {
            const formData = new FormData();
            if (title) {
                formData.append("title", title);
            }
            if (content) {
                formData.append("content", content);
            }
            formData.append("visibility", "PUBLIC");
            formData.append("tags", JSON.stringify(this.selectedTags));
            this.pendingMedia.forEach((item) => {
                formData.append("files", item.file);
            });

            const response = await fetch("/api/v1/posts/posts/create-with-media", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.getAuthToken()}`,
                },
                body: formData,
            });

            if (!response.ok) {
                const errorPayload = await this.safeJson(response);
                const detail = this.extractErrorMessage(errorPayload) || "Unable to create post.";
                throw new Error(detail);
            }

            const createdPost = this.normalizePost(await response.json());
            this.showNotification("Post shared successfully.", "success");
            this.closeModal("createPostModal");
            this.resetCreatePostForm();
            await this.loadPosts({ reset: true });
            await this.viewPostDetail(createdPost.id, { silentLoading: true });
        } catch (error) {
            console.error("Error creating post:", error);
            this.showNotification(error.message || "Unable to create post.", "error");
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.innerHTML = '<i class="fas fa-paper-plane"></i> Post to Family';
            }
        }
    }

    resetCreatePostForm() {
        this.elements.createPostForm?.reset();
        this.pendingMedia.forEach((item) => {
            if (item.previewUrl) {
                URL.revokeObjectURL(item.previewUrl);
            }
        });
        this.pendingMedia = [];
        this.selectedTags = [];
        this.selectedComposerMode = "text";
        this.renderMediaPreview();
        this.renderTagPreview();
        this.syncComposerModeVisibility();
        this.selectComposerMode("text");
        if (this.elements.charCount) {
            this.elements.charCount.textContent = "0";
        }
    }

    async viewPostDetail(postId, { silentLoading = false } = {}) {
        if (!silentLoading) {
            this.toggleLoading(true);
        }

        try {
            const response = await fetch(`/api/v1/posts/posts/${postId}`, {
                headers: this.getAuthHeaders(),
            });

            if (!response.ok) {
                throw new Error(`Failed to load post ${postId}`);
            }

            this.selectedPost = this.normalizePost(await response.json());
            this.renderPostDetail();
            this.openModal("postDetailModal");
        } catch (error) {
            console.error("Error loading post detail:", error);
            this.showNotification("Unable to open that post right now.", "error");
        } finally {
            if (!silentLoading) {
                this.toggleLoading(false);
            }
        }
    }

    renderPostDetail() {
        if (!this.elements.postDetailContainer || !this.selectedPost) {
            return;
        }

        const post = this.selectedPost;
        const mediaUrls = this.normalizeMediaUrls(post.media_urls);
        const tags = Array.isArray(post.tags) ? post.tags : [];
        const comments = Array.isArray(post.comments) ? post.comments : [];
        const canManage = Boolean(
            this.currentUser && (this.currentUser.id === post.author_id || this.currentUser.role === "admin")
        );

        this.elements.postDetailContainer.innerHTML = `
            <div class="post-header">
                <div class="post-author">
                    <div class="author-avatar">${this.getInitials(post.author?.name || "Association")}</div>
                    <div class="author-info">
                        <div class="author-name">${this.escapeHtml(post.author?.name || "Association Member")}</div>
                        <div class="post-meta">
                            <span>${this.formatFullDate(post.created_at)}</span>
                            <span>•</span>
                            <span class="visibility-icon">${this.getVisibilityIcon(post.visibility)}</span>
                            <span>${this.getVisibilityLabel(post.visibility)}</span>
                        </div>
                    </div>
                </div>
                ${post.title ? `<h3 class="post-title">${this.escapeHtml(post.title)}</h3>` : ""}
            </div>
            <div class="post-detail-content">
                ${post.content ? `<div class="post-content">${this.escapeHtml(post.content).replace(/\n/g, "<br>")}</div>` : ""}
                ${mediaUrls.length ? `<div class="post-detail-media">${this.renderDetailMediaGrid(mediaUrls, post.id)}</div>` : ""}
            </div>
            ${tags.length ? `
                <div class="post-tags">
                    ${tags.map((tag) => `
                        <button class="tag" type="button" data-action="filter-tag" data-tag="${this.escapeAttribute(tag.name || tag)}">
                            ${this.escapeHtml(tag.name || tag)}
                        </button>
                    `).join("")}
                </div>
            ` : ""}
            <div class="post-detail-stats">
                <button class="post-stat-link" type="button" data-action="open-likes" data-post-id="${post.id}">
                    <i class="fas fa-heart"></i> ${post.like_count} likes
                </button>
                <span><i class="fas fa-comment"></i> ${post.comment_count} comments</span>
                <span><i class="fas fa-eye"></i> ${post.view_count} views</span>
            </div>
            <div class="post-detail-actions">
                <button class="action-btn ${post.has_liked ? "liked" : ""}" type="button" data-action="toggle-like" data-post-id="${post.id}">
                    <i class="fas fa-heart"></i>
                    <span>${post.has_liked ? "Liked" : "Like"}</span>
                </button>
                <button class="action-btn" type="button" data-action="open-comments" data-post-id="${post.id}">
                    <i class="fas fa-comment"></i>
                    <span>Comment</span>
                </button>
                <button class="action-btn" type="button" data-action="open-likes" data-post-id="${post.id}">
                    <i class="fas fa-users"></i>
                    <span>See Likes</span>
                </button>
            </div>
            <div class="post-detail-comments">
                <h4>Recent comments</h4>
                <div id="postDetailComments">
                    ${comments.length ? comments.slice(0, 3).map((comment) => this.renderCommentItem(comment)).join("") : '<p class="text-muted">No comments yet. Start the conversation from the comments modal.</p>'}
                </div>
                <button class="btn btn-outline w-full mt-4" type="button" data-action="open-comments" data-post-id="${post.id}">
                    <i class="fas fa-comments"></i> View all comments
                </button>
            </div>
        `;

        if (this.elements.postActionsBtn) {
            this.elements.postActionsBtn.style.display = canManage ? "inline-flex" : "none";
        }
        if (this.elements.btnEditPost) {
            this.elements.btnEditPost.style.display = "none";
        }
        if (this.elements.btnDeletePost) {
            this.elements.btnDeletePost.style.display = canManage ? "flex" : "none";
        }
        if (this.elements.btnReportPost) {
            this.elements.btnReportPost.style.display = "none";
        }
        this.elements.postActionsMenu?.classList.remove("show");
    }

    renderCommentItem(comment) {
        const author = comment.author?.name || "Association Member";
        return `
            <div class="comment-item">
                <div class="comment-author">
                    <div class="author-avatar-small">${this.getInitials(author)}</div>
                    <div>
                        <div class="font-medium">${this.escapeHtml(author)}</div>
                        <div class="text-sm text-gray-500">${this.formatTimeAgo(comment.created_at)}</div>
                    </div>
                </div>
                <div class="comment-content">
                    <div class="comment-text">${this.escapeHtml(comment.content || "")}</div>
                    <div class="comment-meta">
                        <span>${comment.like_count || 0} likes</span>
                        <span>•</span>
                        <span>${comment.reply_count || 0} replies</span>
                    </div>
                </div>
            </div>
        `;
    }

    async openComments(postId) {
        const post = this.posts.find((item) => item.id === postId) || this.selectedPost;
        if (post) {
            this.selectedPost = post;
        }

        if (!this.selectedPost || this.selectedPost.id !== postId) {
            await this.viewPostDetail(postId, { silentLoading: true });
        }

        if (!this.selectedPost) {
            return;
        }

        if (this.elements.commentsModalTitle) {
            this.elements.commentsModalTitle.textContent = this.selectedPost.title || "Post Comments";
        }

        this.renderCommentComposerState();
        this.openModal("commentsModal");
        await this.loadComments(postId, "commentsList");
    }

    renderCommentComposerState() {
        if (!this.elements.commentFormContainer) {
            return;
        }

        if (this.currentUser) {
            this.elements.commentFormContainer.innerHTML = `
                <div class="comment-author">
                    <div class="author-avatar-small" id="commentAuthorAvatar">${this.getInitials(this.currentUser.name)}</div>
                </div>
                <form id="commentForm">
                    <div class="comment-input-container">
                        <textarea id="commentInput" placeholder="Write a comment..." rows="2" maxlength="1000"></textarea>
                        <div class="comment-actions">
                            <button type="submit" class="btn btn-primary btn-sm" id="btnSubmitComment">
                                <i class="fas fa-paper-plane"></i> Post
                            </button>
                        </div>
                    </div>
                </form>
            `;
            this.elements.commentForm = document.getElementById("commentForm");
            this.elements.commentInput = document.getElementById("commentInput");
            this.elements.commentForm?.addEventListener("submit", (event) => {
                event.preventDefault();
                this.submitComment();
            });
            return;
        }

        this.elements.commentFormContainer.innerHTML = `
            <div class="comments-auth-state">
                <p>Sign in to comment on posts and join the discussion.</p>
                <button class="btn btn-outline" type="button" id="btnCommentLogin">
                    <i class="fas fa-sign-in-alt"></i> Member Login
                </button>
            </div>
        `;
        document.getElementById("btnCommentLogin")?.addEventListener("click", () => {
            this.requireLogin("Please sign in to comment on posts.");
        });
        this.elements.commentForm = null;
        this.elements.commentInput = null;
    }

    async loadComments(postId, containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            return;
        }

        container.innerHTML = '<p class="text-muted">Loading comments...</p>';

        try {
            const response = await fetch(`/api/v1/posts/posts/${postId}/comments?limit=50`, {
                headers: this.getAuthHeaders(),
            });

            if (!response.ok) {
                throw new Error(`Failed to load comments: ${response.status}`);
            }

            const payload = await response.json();
            const comments = Array.isArray(payload.items) ? payload.items : [];
            container.innerHTML = comments.length
                ? comments.map((comment) => this.renderCommentItem(comment)).join("")
                : '<p class="text-muted">No comments yet. Be the first to comment.</p>';
        } catch (error) {
            console.error("Error loading comments:", error);
            container.innerHTML = '<p class="text-muted">Unable to load comments right now.</p>';
        }
    }

    async submitComment() {
        if (!this.currentUser) {
            this.requireLogin("Please sign in to comment on posts.");
            return;
        }
        if (!this.selectedPost) {
            return;
        }

        const content = this.elements.commentInput?.value.trim();
        if (!content) {
            this.showNotification("Write a comment before posting.", "error");
            return;
        }

        const submitButton = document.getElementById("btnSubmitComment");
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';
        }

        try {
            const response = await fetch(`/api/v1/posts/posts/${this.selectedPost.id}/comments`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.getAuthToken()}`,
                },
                body: JSON.stringify({ content, parent_comment_id: null }),
            });

            if (!response.ok) {
                const errorPayload = await this.safeJson(response);
                throw new Error(this.extractErrorMessage(errorPayload) || "Unable to post comment.");
            }

            this.showNotification("Comment posted.", "success");
            if (this.elements.commentInput) {
                this.elements.commentInput.value = "";
            }

            this.updatePostInStore(this.selectedPost.id, {
                comment_count: (this.selectedPost.comment_count || 0) + 1,
            });
            this.selectedPost.comment_count = (this.selectedPost.comment_count || 0) + 1;
            await Promise.all([
                this.loadComments(this.selectedPost.id, "commentsList"),
                this.refreshSelectedPost(),
            ]);
            this.renderPosts();
        } catch (error) {
            console.error("Error posting comment:", error);
            this.showNotification(error.message || "Unable to post comment.", "error");
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.innerHTML = '<i class="fas fa-paper-plane"></i> Post';
            }
        }
    }

    async toggleLike(postId) {
        if (!this.currentUser) {
            this.requireLogin("Please sign in to like posts.");
            return;
        }

        try {
            const response = await fetch(`/api/v1/posts/posts/${postId}/like`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.getAuthToken()}`,
                },
            });

            if (!response.ok) {
                const errorPayload = await this.safeJson(response);
                throw new Error(this.extractErrorMessage(errorPayload) || "Unable to like this post.");
            }

            const result = await response.json();
            this.updatePostInStore(postId, {
                has_liked: Boolean(result.liked),
                like_count: Number(result.like_count || 0),
            });

            if (this.selectedPost?.id === postId) {
                this.selectedPost.has_liked = Boolean(result.liked);
                this.selectedPost.like_count = Number(result.like_count || 0);
                this.renderPostDetail();
            }

            this.renderPosts();
        } catch (error) {
            console.error("Error toggling like:", error);
            this.showNotification(error.message || "Unable to update like.", "error");
        }
    }

    async openLikes(postId) {
        try {
            const response = await fetch(`/api/v1/posts/posts/${postId}/likes?limit=50`, {
                headers: this.getAuthHeaders(),
            });

            if (!response.ok) {
                throw new Error(`Failed to load likes: ${response.status}`);
            }

            const likes = await response.json();
            this.renderLikes(likes);
            this.openModal("likesModal");
        } catch (error) {
            console.error("Error loading likes:", error);
            this.showNotification("Unable to load likes right now.", "error");
        }
    }

    renderLikes(likes) {
        if (!this.elements.likesList) {
            return;
        }

        if (!likes.length) {
            this.elements.likesList.innerHTML = '<p class="text-muted">No likes yet.</p>';
            return;
        }

        this.elements.likesList.innerHTML = likes
            .map((like) => `
                <div class="like-item">
                    <div class="like-avatar">${this.getInitials(like.user_name || "Association")}</div>
                    <div class="like-info">
                        <div class="like-name">${this.escapeHtml(like.user_name || "Association Member")}</div>
                        <div class="like-time">${this.formatTimeAgo(like.created_at)}</div>
                    </div>
                </div>
            `)
            .join("");
    }

    openDeleteConfirmModal() {
        if (!this.selectedPost) {
            return;
        }
        this.pendingDeletePostId = this.selectedPost.id;
        const confirmText = document.getElementById("deleteConfirmText");
        if (confirmText) {
            confirmText.textContent = `Delete "${this.selectedPost.title || "this post"}"? This action cannot be undone.`;
        }
        this.openModal("deleteConfirmModal");
    }

    async confirmDeletePost() {
        if (!this.pendingDeletePostId) {
            return;
        }

        try {
            const response = await fetch(`/api/v1/posts/posts/${this.pendingDeletePostId}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${this.getAuthToken()}`,
                },
            });

            if (!response.ok) {
                const errorPayload = await this.safeJson(response);
                throw new Error(this.extractErrorMessage(errorPayload) || "Unable to delete this post.");
            }

            this.showNotification("Post deleted.", "success");
            this.posts = this.posts.filter((post) => post.id !== this.pendingDeletePostId);
            if (this.selectedPost?.id === this.pendingDeletePostId) {
                this.selectedPost = null;
            }
            this.closeModal("deleteConfirmModal");
            this.closeModal("postDetailModal");
            this.renderPosts();
            this.updateLoadMoreUi();
        } catch (error) {
            console.error("Error deleting post:", error);
            this.showNotification(error.message || "Unable to delete post.", "error");
        } finally {
            this.pendingDeletePostId = null;
        }
    }

    async refreshSelectedPost() {
        if (!this.selectedPost?.id) {
            return;
        }

        try {
            const response = await fetch(`/api/v1/posts/posts/${this.selectedPost.id}`, {
                headers: this.getAuthHeaders(),
            });
            if (!response.ok) {
                return;
            }
            this.selectedPost = this.normalizePost(await response.json());
            if (this.isModalOpen("postDetailModal")) {
                this.renderPostDetail();
            }
        } catch (error) {
            console.warn("Unable to refresh selected post:", error);
        }
    }

    updatePostInStore(postId, updates) {
        this.posts = this.posts.map((post) => {
            if (post.id !== postId) {
                return post;
            }
            return { ...post, ...updates };
        });
        if (this.selectedPost?.id === postId) {
            this.selectedPost = { ...this.selectedPost, ...updates };
        }
    }

    handlePostAction(event) {
        const actionTarget = event.target.closest("[data-action]");
        if (!actionTarget) {
            return;
        }

        const action = actionTarget.dataset.action;
        const postId = Number(actionTarget.dataset.postId);

        switch (action) {
        case "view-post":
            if (Number.isFinite(postId)) {
                this.viewPostDetail(postId);
            }
            break;
        case "toggle-like":
            event.preventDefault();
            if (Number.isFinite(postId)) {
                this.toggleLike(postId);
            }
            break;
        case "open-comments":
            event.preventDefault();
            if (Number.isFinite(postId)) {
                this.openComments(postId);
            }
            break;
        case "open-likes":
            event.preventDefault();
            if (Number.isFinite(postId)) {
                this.openLikes(postId);
            }
            break;
        case "filter-tag":
            this.searchQuery = actionTarget.dataset.tag || "";
            if (this.elements.postsSearch) {
                this.elements.postsSearch.value = this.searchQuery;
            }
            this.loadPosts({ reset: true });
            break;
        case "open-image":
            event.preventDefault();
            if (Number.isFinite(postId)) {
                this.openImageViewer(postId, Number(actionTarget.dataset.mediaIndex || 0));
            }
            break;
        default:
            break;
        }
    }

    async openImageViewer(postId, mediaIndex) {
        const post = this.selectedPost?.id === postId
            ? this.selectedPost
            : this.posts.find((item) => item.id === postId);

        if (!post) {
            await this.viewPostDetail(postId, { silentLoading: true });
        }

        const sourcePost = this.selectedPost?.id === postId
            ? this.selectedPost
            : this.posts.find((item) => item.id === postId);

        if (!sourcePost) {
            return;
        }

        const imageUrls = this.normalizeMediaUrls(sourcePost.media_urls).filter((url) => !this.isVideoUrl(url));
        if (!imageUrls.length) {
            return;
        }

        this.viewerImages = imageUrls;
        this.viewerIndex = Math.min(Math.max(mediaIndex, 0), imageUrls.length - 1);
        this.renderViewerImage();
        this.openModal("imageViewerModal");
    }

    renderViewerImage() {
        if (!this.elements.viewerImage || !this.viewerImages.length) {
            return;
        }

        this.elements.viewerImage.src = this.resolveMediaUrl(this.viewerImages[this.viewerIndex]);
        this.elements.viewerImage.alt = `Post image ${this.viewerIndex + 1}`;
        if (this.elements.imageCaption) {
            this.elements.imageCaption.textContent = `Image ${this.viewerIndex + 1} of ${this.viewerImages.length}`;
        }
    }

    showPreviousImage() {
        if (!this.viewerImages.length) {
            return;
        }
        this.viewerIndex = (this.viewerIndex - 1 + this.viewerImages.length) % this.viewerImages.length;
        this.renderViewerImage();
    }

    showNextImage() {
        if (!this.viewerImages.length) {
            return;
        }
        this.viewerIndex = (this.viewerIndex + 1) % this.viewerImages.length;
        this.renderViewerImage();
    }

    setFilter(filter) {
        if (filter === "mine" && !this.currentUser) {
            this.requireLogin("Please sign in to view your own posts.");
            return;
        }

        this.currentFilter = filter;
        document.querySelectorAll(".filter-btn").forEach((button) => {
            button.classList.toggle("active", button.dataset.filter === filter);
        });
        this.loadPosts({ reset: true });
    }

    getSortField() {
        switch (this.currentSort) {
        case "popular":
            return "like_count";
        case "commented":
            return "comment_count";
        default:
            return "created_at";
        }
    }

    getSortOrder() {
        return this.currentSort === "oldest" ? "asc" : "desc";
    }

    normalizePost(post) {
        return {
            ...post,
            media_urls: this.normalizeMediaUrls(post.media_urls),
            tags: Array.isArray(post.tags) ? post.tags : [],
            comments: Array.isArray(post.comments) ? post.comments : [],
            like_count: Number(post.like_count || 0),
            comment_count: Number(post.comment_count || 0),
            view_count: Number(post.view_count || 0),
            has_liked: Boolean(post.has_liked),
        };
    }

    normalizeMediaUrls(mediaUrls) {
        if (!Array.isArray(mediaUrls)) {
            return [];
        }

        return mediaUrls
            .map((url) => this.resolveMediaUrl(url))
            .filter((url) => {
                if (!url || url === "string" || url.endsWith("/string")) {
                    return false;
                }
                if (url.startsWith("blob:") || url.startsWith("http://") || url.startsWith("https://")) {
                    return true;
                }
                if (url.startsWith("/uploads/")) {
                    return true;
                }
                return /\.[a-z0-9]+$/i.test(url);
            });
    }

    resolveMediaUrl(url) {
        const value = String(url || "").trim();
        if (!value) {
            return "";
        }
        if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("blob:")) {
            return value;
        }
        if (value.startsWith("/uploads/")) {
            return value;
        }
        if (value.startsWith("uploads/")) {
            return `/${value}`;
        }
        if (value.startsWith("/")) {
            return value;
        }
        return value;
    }

    isVideoUrl(url) {
        return /\.(mp4|mov|avi|wmv|flv|webm|m4v)(\?.*)?$/i.test(String(url || ""));
    }

    getVisibilityLabel(visibility) {
        if (visibility === "PUBLIC") {
            return "Public";
        }
        if (visibility === "PRIVATE") {
            return "Private";
        }
        return "Family Only";
    }

    getVisibilityIcon(visibility) {
        if (visibility === "PUBLIC") {
            return '<i class="fas fa-globe-africa"></i>';
        }
        if (visibility === "PRIVATE") {
            return '<i class="fas fa-lock"></i>';
        }
        return '<i class="fas fa-users"></i>';
    }

    toggleLoading(isLoading) {
        if (this.elements.postsLoading) {
            this.elements.postsLoading.style.display = isLoading && this.currentPage === 1 ? "flex" : "none";
        }
    }

    updateLoadMoreUi() {
        if (!this.elements.loadMoreContainer || !this.elements.loadMoreText || !this.elements.loadMoreSpinner) {
            return;
        }

        this.elements.loadMoreContainer.style.display = this.hasMore && this.posts.length ? "block" : "none";
        this.elements.loadMoreText.textContent = this.hasMore ? "Load More Posts" : "No More Posts";
        this.elements.loadMoreSpinner.style.display = this.isLoading && this.currentPage > 1 ? "inline-block" : "none";
        if (this.elements.btnLoadMore) {
            this.elements.btnLoadMore.disabled = this.isLoading;
        }
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            return;
        }
        modal.classList.add("active");
        document.body.classList.add("modal-open");
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            return;
        }
        modal.classList.remove("active");
        if (!document.querySelector(".modal.active")) {
            document.body.classList.remove("modal-open");
        }
    }

    closeAllModals() {
        document.querySelectorAll(".modal.active").forEach((modal) => {
            modal.classList.remove("active");
        });
        document.body.classList.remove("modal-open");
    }

    isModalOpen(modalId) {
        return Boolean(document.getElementById(modalId)?.classList.contains("active"));
    }

    getInitials(name) {
        return String(name || "Association")
            .split(" ")
            .filter(Boolean)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
    }

    formatTimeAgo(value) {
        if (!value) {
            return "Recently";
        }
        const date = new Date(value);
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        if (Number.isNaN(seconds)) {
            return "Recently";
        }
        if (seconds < 60) {
            return "Just now";
        }
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
            return `${minutes}m ago`;
        }
        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return `${hours}h ago`;
        }
        const days = Math.floor(hours / 24);
        if (days < 7) {
            return `${days}d ago`;
        }
        return this.formatFullDate(value);
    }

    formatFullDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "Unknown date";
        }
        return date.toLocaleString("en-UG", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    }

    escapeHtml(value) {
        return String(value || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    escapeAttribute(value) {
        return this.escapeHtml(value).replaceAll("`", "&#96;");
    }

    async safeJson(response) {
        try {
            return await response.json();
        } catch (_error) {
            return null;
        }
    }

    extractErrorMessage(payload) {
        if (!payload) {
            return "";
        }
        if (typeof payload.detail === "string") {
            return payload.detail;
        }
        if (Array.isArray(payload.detail)) {
            return payload.detail.map((item) => item.msg || item.message || "Invalid request").join(", ");
        }
        return "";
    }

    showNotification(message, type = "info") {
        let stack = document.getElementById("postsToastStack");
        if (!stack) {
            stack = document.createElement("div");
            stack.id = "postsToastStack";
            stack.className = "posts-toast-stack";
            document.body.appendChild(stack);
        }

        const toast = document.createElement("div");
        toast.className = `posts-toast ${type}`;
        toast.innerHTML = `
            <div class="posts-toast-message">${this.escapeHtml(message)}</div>
            <button class="notification-close" type="button" aria-label="Close notification">
                <i class="fas fa-times"></i>
            </button>
        `;

        toast.querySelector(".notification-close")?.addEventListener("click", () => {
            toast.remove();
        });

        stack.appendChild(toast);

        window.setTimeout(() => {
            toast.remove();
        }, 4200);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const app = new PostsApp();
    window.postsApp = app;
    await app.initialize();
});
