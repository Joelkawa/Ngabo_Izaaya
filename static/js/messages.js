class MessagesApp {
    constructor() {
        this.token = localStorage.getItem("family_token");
        this.currentUser = null;
        this.contacts = [];
        this.groups = [];
        this.messages = [];
        this.currentConversation = null;
        this.pendingAttachment = null;
        this.mediaRecorder = null;
        this.mediaStream = null;
        this.audioChunks = [];
        this.recordingStartedAt = null;
        this.recordingTimer = null;
        this.socket = null;
        this.reconnectTimer = null;
        this.presenceTimer = null;
        this.typingUsers = new Map();
        this.typingStopTimer = null;
        this.bootstrapRefreshTimer = null;
        this.groupSelectedIds = new Set();
        this.isClosing = false;

        this.cacheElements();
        this.initialize();
    }

    cacheElements() {
        this.shell = document.getElementById("messagesShell");
        this.groupsList = document.getElementById("groupsList");
        this.groupsEmptyState = document.getElementById("groupsEmptyState");
        this.contactsList = document.getElementById("contactsList");
        this.membersCountBadge = document.getElementById("membersCountBadge");
        this.contactSearchInput = document.getElementById("contactSearchInput");
        this.chatPlaceholder = document.getElementById("chatPlaceholder");
        this.chatThread = document.getElementById("chatThread");
        this.chatAvatar = document.getElementById("chatAvatar");
        this.chatName = document.getElementById("chatName");
        this.chatStatus = document.getElementById("chatStatus");
        this.chatParticipants = document.getElementById("chatParticipants");
        this.messagesArea = document.getElementById("messagesArea");
        this.messagesLoading = document.getElementById("messagesLoading");
        this.messageInput = document.getElementById("messageInput");
        this.typingIndicator = document.getElementById("typingIndicator");
        this.typingText = document.getElementById("typingText");
        this.attachmentPreview = document.getElementById("attachmentPreview");
        this.attachmentPreviewMedia = document.getElementById("attachmentPreviewMedia");
        this.attachmentPreviewName = document.getElementById("attachmentPreviewName");
        this.mediaFileInput = document.getElementById("mediaFileInput");
        this.groupModal = document.getElementById("groupModal");
        this.groupForm = document.getElementById("groupForm");
        this.groupNameInput = document.getElementById("groupNameInput");
        this.groupMemberSearch = document.getElementById("groupMemberSearch");
        this.groupMembersList = document.getElementById("groupMembersList");
        this.groupSelectedWrap = document.getElementById("groupSelectedWrap");
        this.groupSelectedList = document.getElementById("groupSelectedList");
        this.voiceRecorderModal = document.getElementById("voiceRecorderModal");
        this.voiceRecordStatus = document.getElementById("voiceRecordStatus");
        this.voiceTimer = document.getElementById("voiceTimer");
        this.recordedAudio = document.getElementById("recordedAudio");
        this.mediaViewerModal = document.getElementById("mediaViewerModal");
        this.mediaViewerBody = document.getElementById("mediaViewerBody");
    }

    async initialize() {
        if (!this.token) {
            this.redirectToLogin();
            return;
        }

        try {
            await this.loadCurrentUser();
            this.bindEvents();
            await this.loadBootstrap();
            this.connectSocket();
            this.startPresencePing();
        } catch (error) {
            console.error("Failed to initialize messages page:", error);
            this.showNotification("Please log in again to use messaging", "error");
            this.redirectToLogin();
        }
    }

    async loadCurrentUser() {
        const response = await fetch("/api/v1/auth/users/me", {
            headers: {
                Authorization: `Bearer ${this.token}`,
            },
        });

        if (!response.ok) {
            throw new Error("Authentication failed");
        }

        this.currentUser = await response.json();
    }

    redirectToLogin() {
        window.location.href = "/login";
    }

    bindEvents() {
        document.getElementById("btnOpenGroupModal")?.addEventListener("click", () => this.openGroupModal());
        document.getElementById("btnOpenGroupModalInline")?.addEventListener("click", () => this.openGroupModal());
        document.getElementById("btnCreateGroupPlaceholder")?.addEventListener("click", () => this.openGroupModal());
        document.getElementById("btnBackToContacts")?.addEventListener("click", () => this.closeMobileChat());
        document.getElementById("btnToggleParticipants")?.addEventListener("click", () => {
            this.chatParticipants.classList.toggle("hidden");
        });
        document.getElementById("btnUploadMedia")?.addEventListener("click", () => {
            if (!this.ensureConversationSelected()) return;
            this.mediaFileInput.click();
        });
        document.getElementById("btnRemoveAttachment")?.addEventListener("click", () => this.clearPendingAttachment());
        document.getElementById("btnSendMessage")?.addEventListener("click", () => this.handleSendMessage());
        document.getElementById("btnRecordVoice")?.addEventListener("click", () => this.openVoiceRecorder());
        document.getElementById("btnStartRecording")?.addEventListener("click", () => this.startRecording());
        document.getElementById("btnStopRecording")?.addEventListener("click", () => this.stopRecording());
        document.getElementById("btnSendRecording")?.addEventListener("click", () => this.sendRecording());
        document.getElementById("closeVoiceRecorderModal")?.addEventListener("click", () => this.closeVoiceRecorder());
        document.getElementById("closeMediaViewerModal")?.addEventListener("click", () => this.closeModal(this.mediaViewerModal));
        document.getElementById("closeGroupModal")?.addEventListener("click", () => this.closeGroupModal());
        document.getElementById("btnCancelGroupModal")?.addEventListener("click", () => this.closeGroupModal());

        this.contactSearchInput?.addEventListener("input", () => this.renderSidebar());
        this.groupMemberSearch?.addEventListener("input", () => this.renderGroupMemberOptions());
        this.groupForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.createGroup();
        });

        this.mediaFileInput?.addEventListener("change", (event) => {
            const file = event.target.files && event.target.files[0];
            if (file) {
                this.setPendingAttachment(file);
            }
        });

        this.messageInput?.addEventListener("input", () => {
            this.autoResizeComposer();
            this.handleTypingInput();
        });

        this.messageInput?.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                this.handleSendMessage();
            }
        });

        this.messagesArea?.addEventListener("click", (event) => {
            const trigger = event.target.closest("[data-media-trigger]");
            if (!trigger) return;

            const mediaType = trigger.dataset.mediaType;
            const mediaSrc = trigger.dataset.mediaSrc;
            if (!mediaType || !mediaSrc) return;
            this.openMediaViewer(mediaType, mediaSrc);
        });

        document.querySelectorAll(".modal").forEach((modal) => {
            modal.addEventListener("click", (event) => {
                if (event.target === modal) {
                    this.closeModal(modal);
                }
            });
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                this.closeModal(this.groupModal);
                this.closeVoiceRecorder();
                this.closeModal(this.mediaViewerModal);
            }
        });

        window.addEventListener("beforeunload", () => {
            this.isClosing = true;
            this.stopPresencePing();
            this.closeSocket();
        });
    }

    startPresencePing() {
        this.stopPresencePing();
        this.presenceTimer = window.setInterval(() => {
            this.sendSocketEvent("ping", {});
        }, 25000);
    }

    stopPresencePing() {
        if (this.presenceTimer) {
            clearInterval(this.presenceTimer);
            this.presenceTimer = null;
        }
    }

    async loadBootstrap(options = {}) {
        const response = await fetch("/api/v1/messages/bootstrap", {
            headers: {
                Authorization: `Bearer ${this.token}`,
            },
        });

        if (!response.ok) {
            throw new Error("Could not load contacts");
        }

        const data = await response.json();
        this.contacts = data.contacts || [];
        this.groups = data.groups || [];
        this.renderSidebar();
        this.renderGroupMemberOptions();

        if (this.currentConversation && !options.skipCurrentConversationRefresh) {
            this.updateCurrentConversationStatus();
        }
    }

    scheduleBootstrapRefresh() {
        if (this.bootstrapRefreshTimer) {
            clearTimeout(this.bootstrapRefreshTimer);
        }

        this.bootstrapRefreshTimer = window.setTimeout(() => {
            this.loadBootstrap({ skipCurrentConversationRefresh: true }).catch((error) => {
                console.error("Failed to refresh chat bootstrap:", error);
            });
        }, 180);
    }

    renderSidebar() {
        const query = (this.contactSearchInput?.value || "").trim().toLowerCase();

        const filteredGroups = this.groups.filter((group) => {
            const name = (group.name || this.getConversationDisplayName(group)).toLowerCase();
            return !query || name.includes(query);
        });
        const filteredContacts = this.contacts.filter((contact) => {
            const haystack = `${contact.name} ${contact.email || ""}`.toLowerCase();
            return !query || haystack.includes(query);
        });

        this.groupsList.innerHTML = filteredGroups.map((group) => this.renderGroupCard(group)).join("");
        this.groupsEmptyState.classList.toggle("hidden", filteredGroups.length > 0);
        this.contactsList.innerHTML = filteredContacts.map((contact) => this.renderContactCard(contact)).join("");
        this.membersCountBadge.textContent = String(filteredContacts.length);

        this.groupsList.querySelectorAll("[data-group-id]").forEach((button) => {
            button.addEventListener("click", () => {
                const conversationId = Number(button.dataset.groupId);
                this.openConversation(conversationId);
            });
        });

        this.contactsList.querySelectorAll("[data-contact-id]").forEach((button) => {
            button.addEventListener("click", () => {
                const userId = Number(button.dataset.contactId);
                this.openContact(userId);
            });
        });
    }

    renderGroupCard(group) {
        const isActive = this.currentConversation?.id === group.id;
        const lastMessagePreview = this.getConversationPreview(group.last_message);
        const participantCount = group.participants?.length || 0;

        return `
            <button type="button" class="contact-card ${isActive ? "active" : ""}" data-group-id="${group.id}">
                <div class="contact-card__avatar contact-card__avatar--group">
                    <i class="fas fa-users"></i>
                </div>
                <div class="contact-card__body">
                    <div class="contact-card__topline">
                        <h4>${this.escapeHtml(this.getConversationDisplayName(group))}</h4>
                        <span>${this.formatSidebarTime(group.last_message?.created_at || group.updated_at || group.created_at)}</span>
                    </div>
                    <p>${this.escapeHtml(lastMessagePreview || `${participantCount} members`)}</p>
                </div>
                ${group.unread_count ? `<span class="contact-card__badge">${group.unread_count}</span>` : ""}
            </button>
        `;
    }

    renderContactCard(contact) {
        const isActive = this.currentConversation?.conversation_type === "DIRECT"
            && this.getDirectPartnerId(this.currentConversation) === contact.user_id;
        const preview = contact.last_message_preview || (contact.is_online ? "Online now" : "Tap to start chatting");

        return `
            <button type="button" class="contact-card ${isActive ? "active" : ""}" data-contact-id="${contact.user_id}">
                <div class="contact-card__avatar">
                    ${this.escapeHtml(this.getInitials(contact.name))}
                    <span class="contact-card__presence ${contact.is_online ? "online" : ""}"></span>
                </div>
                <div class="contact-card__body">
                    <div class="contact-card__topline">
                        <h4>${this.escapeHtml(contact.name)}</h4>
                        <span>${this.formatSidebarTime(contact.last_message_at || contact.last_seen)}</span>
                    </div>
                    <p>${this.escapeHtml(preview)}</p>
                </div>
                ${contact.unread_count ? `<span class="contact-card__badge">${contact.unread_count}</span>` : ""}
            </button>
        `;
    }

    async openContact(userId) {
        const contact = this.contacts.find((entry) => entry.user_id === userId);
        if (!contact) return;

        if (contact.conversation_id) {
            await this.openConversation(contact.conversation_id);
            return;
        }

        try {
            const response = await fetch(`/api/v1/messages/conversations/direct/${userId}`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.token}`,
                },
            });

            if (!response.ok) {
                throw new Error("Could not open direct conversation");
            }

            const conversation = await response.json();
            contact.conversation_id = conversation.id;
            await this.loadBootstrap({ skipCurrentConversationRefresh: true });
            await this.openConversation(conversation.id);
        } catch (error) {
            console.error("Failed to open direct conversation:", error);
            this.showNotification("Could not open that conversation", "error");
        }
    }

    async openConversation(conversationId) {
        this.showChatThread(true);
        this.messagesLoading.classList.remove("hidden");
        this.chatParticipants.classList.add("hidden");

        try {
            const [conversationResponse, messagesResponse] = await Promise.all([
                fetch(`/api/v1/messages/conversations/${conversationId}`, {
                    headers: { Authorization: `Bearer ${this.token}` },
                }),
                fetch(`/api/v1/messages/conversations/${conversationId}/messages?limit=100`, {
                    headers: { Authorization: `Bearer ${this.token}` },
                }),
            ]);

            if (!conversationResponse.ok || !messagesResponse.ok) {
                throw new Error("Could not load conversation");
            }

            this.currentConversation = await conversationResponse.json();
            const messagesPayload = await messagesResponse.json();
            this.messages = (messagesPayload.items || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            this.renderCurrentConversation();
            this.renderMessages();
            this.autoResizeComposer();
            this.openMobileChat();
            this.markCurrentConversationRead();
        } catch (error) {
            console.error("Failed to load conversation:", error);
            this.showNotification("Could not load the conversation", "error");
            this.showChatThread(false);
        } finally {
            this.messagesLoading.classList.add("hidden");
        }
    }

    renderCurrentConversation() {
        if (!this.currentConversation) return;

        this.chatName.textContent = this.getConversationDisplayName(this.currentConversation);
        this.chatStatus.textContent = this.getConversationStatus(this.currentConversation);
        this.chatAvatar.textContent = this.getConversationAvatarLabel(this.currentConversation);
        this.renderParticipantsPanel();
        this.updateSidebarActiveState();
    }

    renderParticipantsPanel() {
        if (!this.currentConversation) return;

        const participants = this.currentConversation.participants || [];
        this.chatParticipants.innerHTML = participants.map((participant) => {
            const isOnline = participant.user_id === this.currentUser.id
                ? true
                : this.contacts.find((contact) => contact.user_id === participant.user_id)?.is_online;

            return `
                <div class="participant-pill">
                    <div class="participant-pill__avatar">${this.escapeHtml(this.getInitials(participant.user_name || "U"))}</div>
                    <div>
                        <h4>${this.escapeHtml(participant.user_name || "Unknown")}${participant.user_id === this.currentUser.id ? " (You)" : ""}</h4>
                        <p>${participant.is_admin ? "Group admin" : isOnline ? "Online" : "Member"}</p>
                    </div>
                </div>
            `;
        }).join("");
    }

    renderMessages() {
        if (!this.currentConversation) {
            this.messagesArea.innerHTML = "";
            return;
        }

        if (!this.messages.length) {
            this.messagesArea.innerHTML = `
                <div class="messages-empty">
                    <i class="fas fa-comment-dots"></i>
                    <p>No messages yet. Start the conversation.</p>
                </div>
            `;
            return;
        }

        const groupedMessages = this.groupMessagesByDay(this.messages);
        this.messagesArea.innerHTML = groupedMessages.map((group) => `
            <section class="message-day">
                <div class="message-day__label">${this.formatDayDivider(group.date)}</div>
                ${group.items.map((message) => this.renderMessage(message)).join("")}
            </section>
        `).join("");

        this.scrollMessagesToBottom();
    }

    renderMessage(message) {
        const isOwn = message.sender_id === this.currentUser.id;
        const showSender = !isOwn && this.currentConversation?.conversation_type === "GROUP";
        const mediaMarkup = this.renderMessageMedia(message);

        return `
            <article class="message-row ${isOwn ? "message-row--own" : ""}" data-message-id="${message.id}">
                <div class="message-bubble ${mediaMarkup ? "message-bubble--media" : ""}">
                    ${showSender ? `<div class="message-bubble__sender">${this.escapeHtml(message.sender_name || "Member")}</div>` : ""}
                    ${mediaMarkup}
                    ${message.content ? `<div class="message-bubble__text">${this.formatMessageText(message.content)}</div>` : ""}
                    <div class="message-bubble__meta">
                        <span>${this.formatMessageClock(message.created_at)}</span>
                        ${isOwn ? this.renderMessageStatus(message.status) : ""}
                    </div>
                </div>
            </article>
        `;
    }

    renderMessageMedia(message) {
        const mediaSource = this.getMessageMediaSource(message);
        if (!mediaSource) return "";

        if (message.message_type === "VIDEO" || (message.media_mime_type || "").startsWith("video/")) {
            return `
                <button type="button" class="message-media message-media--video" data-media-trigger="true" data-media-type="video" data-media-src="${this.escapeAttribute(mediaSource)}">
                    <video src="${this.escapeAttribute(mediaSource)}" playsinline preload="metadata"></video>
                    <span class="message-media__badge"><i class="fas fa-play"></i></span>
                </button>
            `;
        }

        if (message.message_type === "VOICE" || (message.media_mime_type || "").startsWith("audio/")) {
            return `
                <div class="message-voice">
                    <i class="fas fa-microphone"></i>
                    <audio controls src="${this.escapeAttribute(mediaSource)}"></audio>
                </div>
            `;
        }

        return `
            <button type="button" class="message-media" data-media-trigger="true" data-media-type="image" data-media-src="${this.escapeAttribute(mediaSource)}">
                <img src="${this.escapeAttribute(mediaSource)}" alt="Shared image">
            </button>
        `;
    }

    renderMessageStatus(status) {
        if (status === "READ") {
            return `<span class="message-status message-status--read"><i class="fas fa-check-double"></i></span>`;
        }
        return `<span class="message-status"><i class="fas fa-check"></i></span>`;
    }

    async handleSendMessage() {
        if (!this.ensureConversationSelected()) return;

        const content = (this.messageInput.value || "").trim();
        if (!content && !this.pendingAttachment) {
            return;
        }

        try {
            if (this.pendingAttachment) {
                await this.sendMediaMessage(content);
            } else {
                await this.sendTextMessage(content);
            }

            this.messageInput.value = "";
            this.autoResizeComposer();
            this.clearPendingAttachment();
            this.sendSocketEvent("typing", {
                conversation_id: this.currentConversation.id,
                is_typing: false,
            });
        } catch (error) {
            console.error("Failed to send message:", error);
            this.showNotification(error.message || "Message could not be sent", "error");
        }
    }

    async sendTextMessage(content) {
        const response = await fetch("/api/v1/messages/messages", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                conversation_id: this.currentConversation.id,
                message_type: "TEXT",
                content,
            }),
        });

        if (!response.ok) {
            throw new Error("Could not send your message");
        }

        const message = await response.json();
        this.addOrUpdateMessage(message);
        this.scheduleBootstrapRefresh();
    }

    async sendMediaMessage(content) {
        const formData = new FormData();
        formData.append("conversation_id", String(this.currentConversation.id));
        if (content) {
            formData.append("content", content);
        }
        if (this.pendingAttachment.duration) {
            formData.append("media_duration", String(this.pendingAttachment.duration));
        }
        formData.append("file", this.pendingAttachment.file, this.pendingAttachment.file.name);

        const response = await fetch("/api/v1/messages/messages/media", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.token}`,
            },
            body: formData,
        });

        if (!response.ok) {
            let errorMessage = "Could not send your file";
            try {
                const errorPayload = await response.json();
                errorMessage = errorPayload.detail || errorMessage;
            } catch (error) {
                console.debug("Could not parse media send failure", error);
            }
            throw new Error(errorMessage);
        }

        const message = await response.json();
        this.addOrUpdateMessage(message);
        this.scheduleBootstrapRefresh();
    }

    setPendingAttachment(file) {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        if (!isImage && !isVideo) {
            this.showNotification("Only image and video uploads are supported here", "error");
            return;
        }

        const previewUrl = URL.createObjectURL(file);
        this.clearPendingAttachment(false);
        this.pendingAttachment = {
            file,
            previewUrl,
            kind: isImage ? "image" : "video",
        };
        this.renderAttachmentPreview();
    }

    renderAttachmentPreview() {
        if (!this.pendingAttachment) {
            this.attachmentPreview.classList.add("hidden");
            this.attachmentPreviewMedia.innerHTML = "";
            return;
        }

        this.attachmentPreviewName.textContent = this.pendingAttachment.file.name;
        this.attachmentPreviewMedia.innerHTML = this.pendingAttachment.kind === "video"
            ? `<video src="${this.escapeAttribute(this.pendingAttachment.previewUrl)}" muted playsinline></video>`
            : `<img src="${this.escapeAttribute(this.pendingAttachment.previewUrl)}" alt="Pending attachment">`;
        this.attachmentPreview.classList.remove("hidden");
    }

    clearPendingAttachment(resetInput = true) {
        if (this.pendingAttachment?.previewUrl) {
            URL.revokeObjectURL(this.pendingAttachment.previewUrl);
        }
        this.pendingAttachment = null;
        this.attachmentPreview.classList.add("hidden");
        this.attachmentPreviewMedia.innerHTML = "";
        if (resetInput && this.mediaFileInput) {
            this.mediaFileInput.value = "";
        }
    }

    async openVoiceRecorder() {
        if (!this.ensureConversationSelected()) return;

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.showNotification("Voice recording is not supported on this device", "error");
            return;
        }

        this.recordedAudio.classList.add("hidden");
        this.recordedAudio.removeAttribute("src");
        this.voiceRecordStatus.textContent = "Ready to record";
        this.voiceTimer.textContent = "00:00";
        document.getElementById("btnStartRecording")?.classList.remove("hidden");
        document.getElementById("btnStopRecording")?.classList.add("hidden");
        document.getElementById("btnSendRecording")?.classList.add("hidden");
        this.openModal(this.voiceRecorderModal);
    }

    async startRecording() {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(this.mediaStream);
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            this.mediaRecorder.start();
            this.recordingStartedAt = Date.now();
            this.voiceRecordStatus.textContent = "Recording...";
            document.getElementById("btnStartRecording")?.classList.add("hidden");
            document.getElementById("btnStopRecording")?.classList.remove("hidden");
            this.startRecordingTimer();
        } catch (error) {
            console.error("Microphone access failed:", error);
            this.showNotification("Microphone access was denied", "error");
        }
    }

    startRecordingTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
        }

        this.recordingTimer = window.setInterval(() => {
            const elapsedSeconds = Math.floor((Date.now() - this.recordingStartedAt) / 1000);
            const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
            const seconds = String(elapsedSeconds % 60).padStart(2, "0");
            this.voiceTimer.textContent = `${minutes}:${seconds}`;
        }, 1000);
    }

    stopRecording() {
        if (!this.mediaRecorder) return;

        this.mediaRecorder.onstop = () => {
            const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });
            const previewUrl = URL.createObjectURL(audioBlob);
            this.pendingRecording = {
                file: new File([audioBlob], `voice-${Date.now()}.webm`, { type: "audio/webm" }),
                previewUrl,
                duration: Math.max(1, Math.floor((Date.now() - this.recordingStartedAt) / 1000)),
            };
            this.recordedAudio.src = previewUrl;
            this.recordedAudio.classList.remove("hidden");
            this.voiceRecordStatus.textContent = "Recording ready to send";
            document.getElementById("btnStopRecording")?.classList.add("hidden");
            document.getElementById("btnSendRecording")?.classList.remove("hidden");
        };

        this.mediaRecorder.stop();
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((track) => track.stop());
        }
        this.mediaStream = null;
        this.mediaRecorder = null;

        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
    }

    async sendRecording() {
        if (!this.pendingRecording) return;

        try {
            this.pendingAttachment = {
                file: this.pendingRecording.file,
                previewUrl: this.pendingRecording.previewUrl,
                kind: "audio",
                duration: this.pendingRecording.duration,
            };
            await this.sendMediaMessage("");
            this.clearPendingAttachment(false);
            this.closeVoiceRecorder();
            this.pendingRecording = null;
        } catch (error) {
            console.error("Failed to send recording:", error);
            this.showNotification(error.message || "Voice note could not be sent", "error");
        }
    }

    closeVoiceRecorder() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }

        if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
            this.mediaRecorder.onstop = null;
            this.mediaRecorder.stop();
        }
        this.mediaRecorder = null;

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((track) => track.stop());
        }
        this.mediaStream = null;

        if (this.pendingRecording?.previewUrl) {
            URL.revokeObjectURL(this.pendingRecording.previewUrl);
        }
        this.pendingRecording = null;
        this.closeModal(this.voiceRecorderModal);
    }

    openGroupModal() {
        this.groupSelectedIds.clear();
        this.groupForm.reset();
        this.groupSelectedWrap.classList.add("hidden");
        this.groupSelectedList.innerHTML = "";
        this.renderGroupMemberOptions();
        this.openModal(this.groupModal);
    }

    closeGroupModal() {
        this.closeModal(this.groupModal);
    }

    renderGroupMemberOptions() {
        if (!this.groupMembersList) return;

        const query = (this.groupMemberSearch?.value || "").trim().toLowerCase();
        const availableMembers = this.contacts.filter((contact) => {
            const haystack = `${contact.name} ${contact.email || ""}`.toLowerCase();
            return !query || haystack.includes(query);
        });

        this.groupMembersList.innerHTML = availableMembers.map((contact) => `
            <label class="group-member-option">
                <input type="checkbox" value="${contact.user_id}" ${this.groupSelectedIds.has(contact.user_id) ? "checked" : ""}>
                <span class="group-member-option__avatar">${this.escapeHtml(this.getInitials(contact.name))}</span>
                <span class="group-member-option__body">
                    <strong>${this.escapeHtml(contact.name)}</strong>
                    <small>${contact.is_online ? "Online now" : contact.email || "Member"}</small>
                </span>
            </label>
        `).join("");

        this.groupMembersList.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                const userId = Number(checkbox.value);
                if (checkbox.checked) {
                    this.groupSelectedIds.add(userId);
                } else {
                    this.groupSelectedIds.delete(userId);
                }
                this.renderSelectedGroupMembers();
            });
        });

        this.renderSelectedGroupMembers();
    }

    renderSelectedGroupMembers() {
        if (!this.groupSelectedList) return;

        const selectedMembers = this.contacts.filter((contact) => this.groupSelectedIds.has(contact.user_id));
        this.groupSelectedWrap.classList.toggle("hidden", selectedMembers.length === 0);
        this.groupSelectedList.innerHTML = selectedMembers.map((contact) => `
            <button type="button" class="selected-chip" data-remove-selected="${contact.user_id}">
                ${this.escapeHtml(contact.name)}
                <i class="fas fa-times"></i>
            </button>
        `).join("");

        this.groupSelectedList.querySelectorAll("[data-remove-selected]").forEach((button) => {
            button.addEventListener("click", () => {
                const userId = Number(button.dataset.removeSelected);
                this.groupSelectedIds.delete(userId);
                this.renderGroupMemberOptions();
            });
        });
    }

    async createGroup() {
        const name = (this.groupNameInput.value || "").trim();
        const participantIds = Array.from(this.groupSelectedIds);

        if (!name) {
            this.showNotification("Please give the group a name", "error");
            return;
        }

        if (!participantIds.length) {
            this.showNotification("Choose at least one member for the group", "error");
            return;
        }

        try {
            const response = await fetch("/api/v1/messages/conversations", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name,
                    conversation_type: "GROUP",
                    participant_ids: participantIds,
                }),
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => ({}));
                throw new Error(errorPayload.detail || "Group could not be created");
            }

            const conversation = await response.json();
            await this.loadBootstrap({ skipCurrentConversationRefresh: true });
            this.closeGroupModal();
            this.showNotification("Group created", "success");
            await this.openConversation(conversation.id);
        } catch (error) {
            console.error("Failed to create group:", error);
            this.showNotification(error.message || "Group could not be created", "error");
        }
    }

    connectSocket() {
        this.closeSocket();

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const socketUrl = `${protocol}//${window.location.host}/api/v1/messages/ws?token=${encodeURIComponent(this.token)}`;
        this.socket = new WebSocket(socketUrl);

        this.socket.addEventListener("open", () => {
            this.sendSocketEvent("ping", {});
        });

        this.socket.addEventListener("message", (event) => {
            try {
                const payload = JSON.parse(event.data);
                this.handleSocketEvent(payload);
            } catch (error) {
                console.error("Invalid websocket event:", error);
            }
        });

        this.socket.addEventListener("close", () => {
            if (this.isClosing) return;
            this.reconnectTimer = window.setTimeout(() => this.connectSocket(), 3000);
        });
    }

    closeSocket() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    sendSocketEvent(type, data) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        this.socket.send(JSON.stringify({ type, data }));
    }

    handleSocketEvent(event) {
        const { type, data } = event || {};
        if (!type) return;

        if (type === "message.created") {
            this.handleIncomingMessage(data);
            return;
        }

        if (type === "messages.read") {
            this.handleMessagesRead(data);
            return;
        }

        if (type === "typing.updated") {
            this.handleTypingEvent(data);
            return;
        }

        if (type === "presence.updated") {
            this.handlePresenceEvent(data);
            return;
        }

        if (type === "conversation.created" || type === "conversation.updated") {
            this.scheduleBootstrapRefresh();
        }
    }

    handleIncomingMessage(data) {
        if (!data || !data.message) return;

        const message = data.message;
        if (this.currentConversation && message.conversation_id === this.currentConversation.id) {
            this.addOrUpdateMessage(message);
            if (message.sender_id !== this.currentUser.id) {
                this.markCurrentConversationRead([message.id]);
            }
        } else if (message.sender_id !== this.currentUser.id) {
            const conversationName = data.conversation?.name || data.conversation?.participants?.find(
                (participant) => participant.user_id !== this.currentUser.id
            )?.user_name || "a member";
            this.showNotification(`New message from ${conversationName}`, "info");
        }

        this.scheduleBootstrapRefresh();
    }

    handleMessagesRead(data) {
        if (!data || !Array.isArray(data.messages)) return;

        let changed = false;
        data.messages.forEach((updatedMessage) => {
            const index = this.messages.findIndex((message) => message.id === updatedMessage.id);
            if (index >= 0) {
                this.messages[index] = updatedMessage;
                changed = true;
            }
        });

        if (changed) {
            this.renderMessages();
        }
        this.scheduleBootstrapRefresh();
    }

    handleTypingEvent(data) {
        if (!data || !this.currentConversation || Number(data.conversation_id) !== this.currentConversation.id) {
            return;
        }

        if (data.is_typing) {
            this.typingUsers.set(data.user_id, data.user_name || "Member");
        } else {
            this.typingUsers.delete(data.user_id);
        }

        this.renderTypingIndicator();
    }

    handlePresenceEvent(data) {
        if (!data) return;

        const contact = this.contacts.find((entry) => entry.user_id === data.user_id);
        if (contact) {
            contact.is_online = Boolean(data.is_online);
            contact.last_seen = data.last_seen;
        }

        this.renderSidebar();
        this.updateCurrentConversationStatus();
        this.renderParticipantsPanel();
        this.renderGroupMemberOptions();
    }

    renderTypingIndicator() {
        const names = Array.from(this.typingUsers.values());
        if (!names.length) {
            this.typingIndicator.classList.add("hidden");
            this.typingText.textContent = "";
            return;
        }

        this.typingText.textContent = names.length === 1
            ? `${names[0]} is typing…`
            : `${names.slice(0, 2).join(", ")} are typing…`;
        this.typingIndicator.classList.remove("hidden");
    }

    handleTypingInput() {
        if (!this.currentConversation) return;

        const hasContent = Boolean(this.messageInput.value.trim());
        this.sendSocketEvent("typing", {
            conversation_id: this.currentConversation.id,
            is_typing: hasContent,
        });

        if (this.typingStopTimer) {
            clearTimeout(this.typingStopTimer);
        }

        if (hasContent) {
            this.typingStopTimer = window.setTimeout(() => {
                this.sendSocketEvent("typing", {
                    conversation_id: this.currentConversation.id,
                    is_typing: false,
                });
            }, 1400);
        }
    }

    markCurrentConversationRead(messageIds = null) {
        if (!this.currentConversation) return;

        const targetIds = (messageIds || this.messages
            .filter((message) => message.sender_id !== this.currentUser.id)
            .filter((message) => !Array.isArray(message.read_by) || !message.read_by.some((entry) => entry.user_id === this.currentUser.id))
            .map((message) => message.id)
        );

        if (!targetIds.length) return;

        fetch("/api/v1/messages/messages/mark-read", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                conversation_id: this.currentConversation.id,
                message_ids: targetIds,
            }),
        }).catch((error) => {
            console.error("Failed to mark messages as read:", error);
        });
    }

    addOrUpdateMessage(message) {
        const index = this.messages.findIndex((existingMessage) => existingMessage.id === message.id);
        if (index >= 0) {
            this.messages[index] = message;
        } else {
            this.messages.push(message);
        }

        this.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        this.renderMessages();
    }

    showChatThread(isVisible) {
        this.chatPlaceholder.classList.toggle("hidden", isVisible);
        this.chatThread.classList.toggle("hidden", !isVisible);
        if (!isVisible) {
            this.currentConversation = null;
            this.messages = [];
            this.typingUsers.clear();
            this.renderTypingIndicator();
        }
    }

    openMobileChat() {
        this.shell.classList.add("chat-open");
    }

    closeMobileChat() {
        this.shell.classList.remove("chat-open");
    }

    updateSidebarActiveState() {
        this.renderSidebar();
    }

    updateCurrentConversationStatus() {
        if (!this.currentConversation) return;
        this.chatStatus.textContent = this.getConversationStatus(this.currentConversation);
    }

    ensureConversationSelected() {
        if (this.currentConversation) {
            return true;
        }
        this.showNotification("Select a contact first", "error");
        return false;
    }

    openMediaViewer(mediaType, mediaSource) {
        this.mediaViewerBody.innerHTML = mediaType === "video"
            ? `<video controls autoplay playsinline src="${this.escapeAttribute(mediaSource)}"></video>`
            : `<img src="${this.escapeAttribute(mediaSource)}" alt="Shared media">`;
        this.openModal(this.mediaViewerModal);
    }

    openModal(modal) {
        if (!modal) return;
        modal.classList.add("active");
        document.body.classList.add("modal-open");
    }

    closeModal(modal) {
        if (!modal) return;
        modal.classList.remove("active");
        if (!document.querySelector(".modal.active")) {
            document.body.classList.remove("modal-open");
        }
    }

    autoResizeComposer() {
        if (!this.messageInput) return;
        this.messageInput.style.height = "auto";
        this.messageInput.style.height = `${Math.min(this.messageInput.scrollHeight, 140)}px`;
    }

    scrollMessagesToBottom() {
        requestAnimationFrame(() => {
            this.messagesArea.scrollTop = this.messagesArea.scrollHeight;
        });
    }

    groupMessagesByDay(messages) {
        const groups = [];
        let currentKey = null;

        messages.forEach((message) => {
            const date = new Date(message.created_at);
            const key = date.toDateString();
            if (key !== currentKey) {
                groups.push({
                    date,
                    items: [],
                });
                currentKey = key;
            }
            groups[groups.length - 1].items.push(message);
        });

        return groups;
    }

    getConversationDisplayName(conversation) {
        if (!conversation) return "Conversation";
        if (conversation.conversation_type === "GROUP") {
            return conversation.name || "Group chat";
        }

        const partner = (conversation.participants || []).find(
            (participant) => participant.user_id !== this.currentUser.id
        );
        return partner?.user_name || conversation.name || "Direct chat";
    }

    getConversationAvatarLabel(conversation) {
        if (!conversation) return "NI";
        if (conversation.conversation_type === "GROUP") {
            return "GR";
        }
        return this.getInitials(this.getConversationDisplayName(conversation));
    }

    getConversationStatus(conversation) {
        if (!conversation) return "";

        if (conversation.conversation_type === "GROUP") {
            const memberCount = conversation.participants?.length || 0;
            const onlineMembers = (conversation.participants || []).filter((participant) => {
                if (participant.user_id === this.currentUser.id) return true;
                return this.contacts.find((contact) => contact.user_id === participant.user_id)?.is_online;
            }).length;
            return `${memberCount} members • ${onlineMembers} online`;
        }

        const partnerId = this.getDirectPartnerId(conversation);
        const contact = this.contacts.find((entry) => entry.user_id === partnerId);
        if (!contact) return "Member";
        if (contact.is_online) return "Online now";
        return contact.last_seen ? `Last seen ${this.humanizeLastSeen(contact.last_seen)}` : "Offline";
    }

    getDirectPartnerId(conversation) {
        return (conversation?.participants || []).find(
            (participant) => participant.user_id !== this.currentUser.id
        )?.user_id;
    }

    getConversationPreview(lastMessage) {
        if (!lastMessage) return "";
        if (lastMessage.message_type === "TEXT" && lastMessage.content) {
            return lastMessage.content;
        }
        if (lastMessage.message_type === "VOICE") return "Voice message";
        if (lastMessage.message_type === "VIDEO" || (lastMessage.media_mime_type || "").startsWith("video/")) {
            return "Video";
        }
        if (lastMessage.message_type === "IMAGE") return "Image";
        return lastMessage.content || "New message";
    }

    getMessageMediaSource(message) {
        if (message.media_url) {
            return message.media_url;
        }

        if (message.media_data_base64) {
            const mimeType = message.media_mime_type || this.getFallbackMimeType(message);
            return `data:${mimeType};base64,${message.media_data_base64}`;
        }

        return "";
    }

    getFallbackMimeType(message) {
        if (message.message_type === "VOICE") return "audio/webm";
        if (message.message_type === "VIDEO") return "video/mp4";
        return "image/jpeg";
    }

    formatMessageText(text) {
        return this.escapeHtml(text).replace(/\n/g, "<br>");
    }

    formatMessageClock(dateValue) {
        if (!dateValue) return "";
        return new Date(dateValue).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    formatDayDivider(dateValue) {
        const date = new Date(dateValue);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return "Today";
        if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
        return date.toLocaleDateString([], {
            weekday: "long",
            month: "short",
            day: "numeric",
        });
    }

    formatSidebarTime(dateValue) {
        if (!dateValue) return "";
        const date = new Date(dateValue);
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        }
        return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }

    humanizeLastSeen(dateValue) {
        const date = new Date(dateValue);
        const diffMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));

        if (diffMinutes < 60) {
            return `${diffMinutes}m ago`;
        }

        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) {
            return `${diffHours}h ago`;
        }

        return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }

    getInitials(name) {
        if (!name) return "NI";
        return name
            .split(" ")
            .filter(Boolean)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
    }

    escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = value ?? "";
        return div.innerHTML;
    }

    escapeAttribute(value) {
        return this.escapeHtml(value).replace(/"/g, "&quot;");
    }

    showNotification(message, type = "info") {
        if (window.familyApp && typeof window.familyApp.showNotification === "function") {
            window.familyApp.showNotification(message, type);
            return;
        }

        console[type === "error" ? "error" : "log"](message);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    window.messagesApp = new MessagesApp();
});
