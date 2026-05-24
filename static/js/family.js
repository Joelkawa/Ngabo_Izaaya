// Family Tree Application JavaScript

class FamilyTreeApp {
    constructor() {
        this.currentUser = null;
        this.selectedPerson = null;
        this.treeScale = 1;
        this.formMode = 'add';
        this.editingPersonId = null;
        this.treePointerState = {
            active: false,
            pointerId: null,
            startX: 0,
            startY: 0,
            startLeft: 0,
            startTop: 0,
            hasMoved: false,
            personId: null,
        };
        this.treeSuppressClickUntil = 0;
        this.initialize();
    }

    initialize() {
        console.log('Family Tree App Initialized');
        this.setupEventListeners();
        this.updateUIForAuth();
        this.checkAuthentication();
        this.loadFamilyStats();
        this.loadFamilyTree();
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
        return this.currentUser?.role === 'admin';
    }

    async checkAuthentication() {
        const token = this.getAuthToken();
        if (!token) {
            this.currentUser = null;
            this.updateUIForAuth();
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
            this.updateUIForAuth();
            return this.currentUser;
        } catch (error) {
            console.warn('Auth check failed:', error);
            localStorage.removeItem('family_token');
            this.currentUser = null;
            this.updateUIForAuth();
            return null;
        }
    }

    updateUIForAuth() {
        const addButton = document.getElementById('btnAddMember');
        const startButton = document.getElementById('btnStartTree');
        const authNotice = document.getElementById('familyAuthNotice');
        const guestHint = document.getElementById('emptyStateGuestHint');

        const isAuthenticated = Boolean(this.currentUser);
        const isAdmin = this.isAdminUser();

        addButton?.classList.toggle('hidden', !isAuthenticated);
        startButton?.classList.toggle('hidden', !isAuthenticated);
        guestHint?.classList.toggle('hidden', isAuthenticated);
        this.syncPersonActionButtons();

        if (!authNotice) {
            return;
        }

        if (isAuthenticated) {
            authNotice.innerHTML = `
                <div>
                    <strong>Signed in as ${this.escapeHtml(this.currentUser.name)}.</strong>
                    <p>
                        ${isAdmin
                            ? 'You can add new members, correct names, and help connect pending records to the main family tree.'
                            : 'You can add new members and help connect pending records to the main family tree.'
                        }
                    </p>
                </div>
                <button id="btnTreeLogout" class="btn btn-outline btn-small" type="button">
                    <i class="fas fa-sign-out-alt"></i>
                    Sign Out
                </button>
            `;

            document.getElementById('btnTreeLogout')?.addEventListener('click', () => this.logout());
            return;
        }

        authNotice.innerHTML = `
            <div>
                <strong>Sign in to contribute to the family tree.</strong>
                <p>Only logged-in association members can add new people and help connect pending members.</p>
            </div>
            <button id="btnTreeOpenLogin" class="btn btn-outline btn-small" type="button">
                Member Login
            </button>
        `;

        document.getElementById('btnTreeOpenLogin')?.addEventListener('click', () => this.openModal('loginModal'));
    }

    async login(email, password) {
        try {
            const formData = new FormData();
            formData.append('username', email);
            formData.append('password', password);

            const response = await fetch('/api/v1/auth/token', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                this.showError('loginError', error.detail || 'Login failed');
                return false;
            }

            const data = await response.json();
            localStorage.setItem('family_token', data.access_token);
            this.showNotification('Login successful.', 'success');
            this.closeModal('loginModal');
            await this.checkAuthentication();
            return true;
        } catch (error) {
            console.error('Login error:', error);
            this.showError('loginError', 'Network error. Please try again.');
            return false;
        }
    }

    async register(userData) {
        try {
            const response = await fetch('/api/v1/auth/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(userData),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                this.showError('registerError', error.detail || 'Registration failed');
                return false;
            }

            this.showNotification(
                'Join request submitted. Wait for admin approval before signing in.',
                'success'
            );
            this.closeModal('registerModal');
            return true;
        } catch (error) {
            console.error('Registration error:', error);
            this.showError('registerError', 'Network error. Please try again.');
            return false;
        }
    }

    logout() {
        localStorage.removeItem('family_token');
        this.currentUser = null;
        this.updateUIForAuth();
        this.showNotification('Logged out successfully.', 'info');
        window.setTimeout(() => {
            window.location.reload();
        }, 800);
    }

    setupEventListeners() {
        const searchInput = document.getElementById('familySearch');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(() => {
                this.searchFamilyMembers(searchInput.value);
            }, 300));

            searchInput.addEventListener('focus', () => {
                if (searchInput.value.trim()) {
                    this.searchFamilyMembers(searchInput.value);
                }
            });
        }

        document.getElementById('btnZoomIn')?.addEventListener('click', () => this.zoomTree(0.1));
        document.getElementById('btnZoomOut')?.addEventListener('click', () => this.zoomTree(-0.1));
        document.getElementById('btnCenterTree')?.addEventListener('click', () => this.centerTree());
        document.getElementById('btnAddMember')?.addEventListener('click', () => this.openAddMemberModal());
        document.getElementById('btnStartTree')?.addEventListener('click', () => this.openAddMemberModal());
        document.getElementById('btnFamilyLoginNotice')?.addEventListener('click', () => this.openModal('loginModal'));
        document.getElementById('btnEmptyStateLogin')?.addEventListener('click', () => this.openModal('loginModal'));
        document.getElementById('btnEditPerson')?.addEventListener('click', () => this.openEditMemberModal());
        document.getElementById('btnViewTreeFromPerson')?.addEventListener('click', () => this.focusPersonInTree());

        this.setupTreeViewInteractions();

        document.getElementById('closeAddMemberModal')?.addEventListener('click', () => this.closeModal('addMemberModal'));
        document.getElementById('closeLoginModal')?.addEventListener('click', () => this.closeModal('loginModal'));
        document.getElementById('closeRegisterModal')?.addEventListener('click', () => this.closeModal('registerModal'));
        document.getElementById('closePersonDetailsModal')?.addEventListener('click', () => this.closeModal('personDetailsModal'));
        document.getElementById('cancelAddMember')?.addEventListener('click', () => this.closeModal('addMemberModal'));

        document.getElementById('showRegister')?.addEventListener('click', (event) => {
            event.preventDefault();
            this.closeModal('loginModal');
            this.openModal('registerModal');
        });

        document.getElementById('showLogin')?.addEventListener('click', (event) => {
            event.preventDefault();
            this.closeModal('registerModal');
            this.openModal('loginModal');
        });

        document.getElementById('addMemberForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.submitMemberForm();
        });

        document.getElementById('loginForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.handleLogin();
        });

        document.getElementById('registerForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.handleRegister();
        });

        document.querySelectorAll('.modal').forEach((modal) => {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        document.addEventListener('click', (event) => {
            const searchResults = document.getElementById('searchResults');
            const searchBox = document.querySelector('.family-search');

            if (searchResults && searchBox && !searchBox.contains(event.target)) {
                this.hideSearchResults();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    setupTreeViewInteractions() {
        const container = document.getElementById('treeViewContainer');
        if (!container || container.dataset.interactionsBound === 'true') {
            return;
        }

        container.dataset.interactionsBound = 'true';

        container.addEventListener('wheel', (event) => {
            const hasHorizontalOverflow = container.scrollWidth > container.clientWidth;
            const hasVerticalOverflow = container.scrollHeight > container.clientHeight;

            if (!hasHorizontalOverflow && !hasVerticalOverflow) {
                return;
            }

            let deltaLeft = event.deltaX;
            let deltaTop = event.deltaY;

            if (hasHorizontalOverflow && !hasVerticalOverflow && Math.abs(deltaLeft) < Math.abs(deltaTop)) {
                deltaLeft = event.deltaY;
                deltaTop = 0;
            }

            if (event.shiftKey && hasHorizontalOverflow && Math.abs(event.deltaY) > 0) {
                deltaLeft += event.deltaY;
                deltaTop = 0;
            }

            if (deltaLeft === 0 && deltaTop === 0) {
                return;
            }

            event.preventDefault();
            container.scrollLeft += deltaLeft;
            if (deltaTop !== 0) {
                container.scrollTop += deltaTop;
            }
        }, { passive: false });

        container.addEventListener('keydown', (event) => {
            const step = 120;
            const verticalPageStep = Math.max(container.clientHeight * 0.75, step);

            switch (event.key) {
                case 'ArrowLeft':
                    event.preventDefault();
                    container.scrollBy({ left: -step, behavior: 'smooth' });
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    container.scrollBy({ left: step, behavior: 'smooth' });
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    container.scrollBy({ top: -step, behavior: 'smooth' });
                    break;
                case 'ArrowDown':
                    event.preventDefault();
                    container.scrollBy({ top: step, behavior: 'smooth' });
                    break;
                case 'PageUp':
                    event.preventDefault();
                    container.scrollBy({ top: -verticalPageStep, behavior: 'smooth' });
                    break;
                case 'PageDown':
                    event.preventDefault();
                    container.scrollBy({ top: verticalPageStep, behavior: 'smooth' });
                    break;
                case 'Home':
                    event.preventDefault();
                    container.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
                    break;
                case 'End':
                    event.preventDefault();
                    container.scrollTo({
                        left: container.scrollWidth,
                        top: container.scrollHeight,
                        behavior: 'smooth',
                    });
                    break;
                default:
                    break;
            }
        });

        container.addEventListener('pointerdown', (event) => this.startTreePointerPan(event));
        container.addEventListener('pointermove', (event) => this.moveTreePointerPan(event));
        container.addEventListener('pointerup', (event) => this.endTreePointerPan(event));
        container.addEventListener('pointercancel', (event) => this.endTreePointerPan(event));
        container.addEventListener('pointerleave', (event) => this.endTreePointerPan(event));
        container.addEventListener('click', () => {
            container.focus({ preventScroll: true });
        });
    }

    async loadFamilyStats() {
        try {
            const response = await fetch('/api/v1/family/statistics', {
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
                throw new Error(`Failed to load family statistics: ${response.status}`);
            }

            const stats = await response.json();
            this.updateStatsUI(stats);
        } catch (error) {
            console.error('Error loading stats:', error);
            this.updateStatsUI({
                total_people: 156,
                generations: 8,
                connected_to_family: 120,
                pending_members: 36,
            });
        }
    }

    updateStatsUI(stats) {
        const totalMembers = document.getElementById('totalMembers');
        const generations = document.getElementById('generations');
        const connectedMembers = document.getElementById('connectedMembers');
        const pendingMembers = document.getElementById('pendingMembers');

        if (totalMembers) {
            totalMembers.textContent = stats.total_people ?? 0;
        }
        if (generations) {
            generations.textContent = stats.generations ?? 0;
        }
        if (connectedMembers) {
            connectedMembers.textContent = stats.connected_to_family ?? 0;
        }
        if (pendingMembers) {
            pendingMembers.textContent = stats.pending_members ?? 0;
        }
    }

    async loadFamilyTree() {
        try {
            this.showLoading();

            const response = await fetch('/api/v1/family/people?skip=0&limit=200', {
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch family members: ${response.status}`);
            }

            const data = await response.json();
            if (!data.items || data.items.length === 0) {
                this.showEmptyState();
                return;
            }

            const hierarchy = this.buildHierarchy(data.items);
            this.renderFamilyTree(hierarchy);
        } catch (error) {
            console.error('Error loading tree:', error);
            this.showEmptyState();
        } finally {
            this.hideLoading();
        }
    }

    buildHierarchy(flatList) {
        const people = flatList.map((person) => ({
            ...person,
            fullName: this.getDisplayName(person),
            children: [],
            linkType: 'root',
            missingLink: null,
        }));

        const peopleByName = new Map();
        people.forEach((person) => {
            peopleByName.set(this.normalizeName(person.fullName), person);
        });

        const roots = [];
        const pendingMembers = [];

        people.forEach((person) => {
            const fatherKey = this.normalizeName(person.father_name);
            const motherKey = this.normalizeName(person.mother_name);
            const spouseKey = this.normalizeName(person.spouse_name);

            let isLinked = false;

            if (fatherKey && peopleByName.has(fatherKey)) {
                peopleByName.get(fatherKey).children.push(person);
                person.linkType = 'father';
                isLinked = true;
            } else if (motherKey && peopleByName.has(motherKey)) {
                peopleByName.get(motherKey).children.push(person);
                person.linkType = 'mother';
                isLinked = true;
            } else if (spouseKey && peopleByName.has(spouseKey)) {
                person.linkType = 'spouse';
            }

            if (isLinked) {
                return;
            }

            if (person.is_connected_to_tree) {
                roots.push(person);
                return;
            }

            person.missingLink = this.getMissingConnectionLabel(person);
            pendingMembers.push(person);
        });

        roots.forEach((person) => this.sortTreeChildren(person));

        return {
            roots: this.sortPeople(roots),
            pendingMembers: this.sortPeople(pendingMembers),
        };
    }

    sortTreeChildren(person) {
        if (!person.children || person.children.length === 0) {
            return;
        }

        person.children = this.sortPeople(person.children);
        person.children.forEach((child) => this.sortTreeChildren(child));
    }

    sortPeople(people) {
        return [...people].sort((left, right) => {
            const leftName = this.getDisplayName(left).toLowerCase();
            const rightName = this.getDisplayName(right).toLowerCase();
            return leftName.localeCompare(rightName);
        });
    }

    startTreePointerPan(event) {
        const container = document.getElementById('treeViewContainer');
        if (!container) {
            return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        this.treePointerState = {
            active: true,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: container.scrollLeft,
            startTop: container.scrollTop,
            hasMoved: false,
            personId: event.target.closest('.person-node')?.dataset.personId || null,
        };

        container.classList.add('is-grab-ready');
        container.focus({ preventScroll: true });
        if (typeof container.setPointerCapture === 'function') {
            try {
                container.setPointerCapture(event.pointerId);
            } catch (error) {
                console.debug('Pointer capture could not be started.', error);
            }
        }
    }

    moveTreePointerPan(event) {
        const container = document.getElementById('treeViewContainer');
        if (!container || !this.treePointerState.active || this.treePointerState.pointerId !== event.pointerId) {
            return;
        }

        const deltaX = event.clientX - this.treePointerState.startX;
        const deltaY = event.clientY - this.treePointerState.startY;

        if (!this.treePointerState.hasMoved && (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6)) {
            this.treePointerState.hasMoved = true;
        }

        if (!this.treePointerState.hasMoved) {
            return;
        }

        event.preventDefault();
        container.classList.add('is-grabbing');
        container.scrollLeft = this.treePointerState.startLeft - deltaX;
        container.scrollTop = this.treePointerState.startTop - deltaY;
    }

    endTreePointerPan(event) {
        const container = document.getElementById('treeViewContainer');
        if (!container || !this.treePointerState.active || this.treePointerState.pointerId !== event.pointerId) {
            return;
        }

        if (this.treePointerState.hasMoved) {
            this.treeSuppressClickUntil = Date.now() + 180;
        } else if (this.treePointerState.personId) {
            this.treeSuppressClickUntil = Date.now() + 300;
            this.selectPerson(this.treePointerState.personId);
        }

        container.classList.remove('is-grab-ready', 'is-grabbing');
        if (typeof container.releasePointerCapture === 'function') {
            try {
                container.releasePointerCapture(event.pointerId);
            } catch (error) {
                console.debug('Pointer capture was already released.', error);
            }
        }
        this.treePointerState = {
            active: false,
            pointerId: null,
            startX: 0,
            startY: 0,
            startLeft: 0,
            startTop: 0,
            hasMoved: false,
            personId: null,
        };
    }

    showEmptyState() {
        document.getElementById('treeLoading')?.classList.add('hidden');
        document.getElementById('treeContent')?.classList.remove('hidden');
        document.getElementById('emptyState')?.classList.remove('hidden');

        const treeRoot = document.getElementById('treeRoot');
        const pendingMembersContainer = document.getElementById('pendingMembersContainer');
        const pendingMembersGrid = document.getElementById('pendingMembersGrid');
        if (treeRoot) {
            treeRoot.innerHTML = '';
        }
        if (pendingMembersGrid) {
            pendingMembersGrid.innerHTML = '';
        }
        pendingMembersContainer?.classList.add('hidden');
    }

    renderFamilyTree(hierarchy) {
        const { roots, pendingMembers } = hierarchy;
        const treeRootContainer = document.getElementById('treeRoot');
        const pendingMembersContainer = document.getElementById('pendingMembersContainer');
        const pendingMembersGrid = document.getElementById('pendingMembersGrid');
        const treeContent = document.getElementById('treeContent');
        const emptyState = document.getElementById('emptyState');

        if (!treeRootContainer || !pendingMembersContainer || !pendingMembersGrid || !treeContent || !emptyState) {
            return;
        }

        treeRootContainer.innerHTML = '';
        pendingMembersGrid.innerHTML = '';

        if (roots.length > 0) {
            const treeList = document.createElement('ul');
            roots.forEach((rootPerson) => {
                treeList.insertAdjacentHTML('beforeend', this.generateRecursiveHTML(rootPerson));
            });
            treeRootContainer.appendChild(treeList);
        } else if (pendingMembers.length > 0) {
            treeRootContainer.innerHTML = `
                <div class="tree-inline-empty">
                    <strong>No connected family branches yet.</strong>
                    <p>Pending members are listed below and will move into the main tree once matching family links are added.</p>
                </div>
            `;
        }

        if (pendingMembers.length > 0) {
            pendingMembersContainer.classList.remove('hidden');
            pendingMembers.forEach((person) => {
                pendingMembersGrid.insertAdjacentHTML('beforeend', this.createPersonCardHTML(person, true));
            });
        } else {
            pendingMembersContainer.classList.add('hidden');
        }

        treeContent.classList.remove('hidden');
        emptyState.classList.add('hidden');
        this.setupPersonNodeEvents();
        this.highlightSelectedPersonNode();
    }

    generateRecursiveHTML(person) {
        let html = `
            <li>
                ${this.createPersonCardHTML(person)}
        `;

        if (person.children && person.children.length > 0) {
            html += '<ul>';
            person.children.forEach((child) => {
                html += this.generateRecursiveHTML(child);
            });
            html += '</ul>';
        }

        html += '</li>';
        return html;
    }

    createPersonCardHTML(person, isPending = false) {
        const displayName = this.escapeHtml(this.getDisplayName(person));
        const initials = this.escapeHtml(this.getInitials(person.first_name, person.last_name));
        const verifiedText = person.is_verified ? 'Verified' : 'Unverified';

        let badgeHtml = '';
        if (isPending) {
            badgeHtml = `
                <div class="pending-reason">
                    <i class="fas fa-circle-info"></i>
                    <span>${this.escapeHtml(person.missingLink || 'Waiting for a family connection')}</span>
                </div>
            `;
        } else {
            let badgeClass = 'badge-root';
            let badgeText = 'Root / Founder';

            if (person.linkType === 'father') {
                badgeClass = 'badge-father';
                badgeText = 'Linked via Father';
            } else if (person.linkType === 'mother') {
                badgeClass = 'badge-mother';
                badgeText = 'Linked via Mother';
            } else if (person.linkType === 'spouse') {
                badgeClass = 'badge-spouse';
                badgeText = 'Linked via Spouse';
            }

            badgeHtml = `<span class="connection-badge ${badgeClass}">${badgeText}</span>`;
        }

        return `
            <div
                class="person-node ${isPending ? 'person-node-pending' : ''}"
                data-person-id="${person.id}"
                tabindex="0"
                role="button"
                aria-label="View details for ${displayName}"
            >
                <div class="person-avatar">${initials}</div>
                <h4 class="person-name">${displayName}</h4>
                <div class="person-tags">
                    <span class="person-tag">${verifiedText}</span>
                    ${person.is_connected_to_tree ? '<span class="person-tag">Connected</span>' : '<span class="person-tag">Pending</span>'}
                </div>
                ${badgeHtml}
            </div>
        `;
    }

    setupPersonNodeEvents() {
        document.querySelectorAll('.person-node').forEach((node) => {
            node.addEventListener('click', () => {
                if (Date.now() < this.treeSuppressClickUntil) {
                    return;
                }

                const personId = node.dataset.personId;
                if (personId) {
                    this.selectPerson(personId);
                }
            });

            node.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                event.preventDefault();
                const personId = node.dataset.personId;
                if (personId) {
                    this.selectPerson(personId);
                }
            });
        });
    }

    async selectPerson(personId) {
        try {
            const response = await fetch(`/api/v1/family/people/${personId}`, {
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
                throw new Error(`Failed to load person details: ${response.status}`);
            }

            this.selectedPerson = await response.json();
            this.showPersonDetails();
        } catch (error) {
            console.error('Error loading person details:', error);
            this.showNotification('Unable to load family member details.', 'error');
        }
    }

    showPersonDetails() {
        if (!this.selectedPerson) {
            return;
        }

        const fullName = this.getDisplayName(this.selectedPerson);
        const branchText = this.selectedPerson.is_connected_to_tree
            ? 'Connected to the family tree'
            : 'Pending connection';
        const statusText = this.selectedPerson.is_verified ? 'Verified' : 'Unverified';

        const title = document.getElementById('personDetailsTitle');
        const avatar = document.getElementById('personAvatar');
        const fullNameElement = document.getElementById('personFullName');
        const generation = document.getElementById('personGeneration');
        const branch = document.getElementById('personBranch');
        const status = document.getElementById('personStatus');

        if (title) {
            title.textContent = fullName;
        }
        if (avatar) {
            avatar.textContent = this.getInitials(this.selectedPerson.first_name, this.selectedPerson.last_name);
        }
        if (fullNameElement) {
            fullNameElement.textContent = fullName;
        }
        if (generation) {
            generation.textContent = this.selectedPerson.is_connected_to_tree ? 'Visible in the family tree' : 'Pending family connection';
        }
        if (branch) {
            branch.textContent = branchText;
        }
        if (status) {
            status.textContent = statusText;
        }

        this.highlightSelectedPersonNode();
        this.syncPersonActionButtons();
        this.loadPersonRelationships(this.selectedPerson.id);
        this.openModal('personDetailsModal');
    }

    async loadPersonRelationships(personId) {
        try {
            const response = await fetch(`/api/v1/family/people/${personId}/family-tree?generations=1`, {
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
                this.updateRelationshipsUI(null);
                return;
            }

            const treeData = await response.json();
            this.updateRelationshipsUI(treeData.tree);
        } catch (error) {
            console.error('Error loading relationships:', error);
            this.updateRelationshipsUI(null);
        }
    }

    updateRelationshipsUI(node) {
        const container = document.getElementById('personRelationships');
        if (!container) {
            return;
        }

        if (!node) {
            container.innerHTML = '<p class="text-gray-600">No confirmed family relationships are recorded yet.</p>';
            return;
        }

        let html = '<div class="space-y-3">';

        if (node.father) {
            html += `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span>Father</span>
                    <strong>${this.escapeHtml(this.getDisplayName(node.father.person))}</strong>
                </div>
            `;
        }

        if (node.mother) {
            html += `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span>Mother</span>
                    <strong>${this.escapeHtml(this.getDisplayName(node.mother.person))}</strong>
                </div>
            `;
        }

        if (node.spouses && node.spouses.length > 0) {
            node.spouses.forEach((spouse) => {
                html += `
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span>Spouse</span>
                        <strong>${this.escapeHtml(this.getDisplayName(spouse.person))}</strong>
                    </div>
                `;
            });
        }

        if (node.children && node.children.length > 0) {
            node.children.forEach((child) => {
                html += `
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span>Child</span>
                        <strong>${this.escapeHtml(this.getDisplayName(child.person))}</strong>
                    </div>
                `;
            });
        }

        if (html === '<div class="space-y-3">') {
            html += '<p class="text-gray-600">No confirmed family relationships are recorded yet.</p>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    async searchFamilyMembers(query) {
        if (!query.trim()) {
            this.hideSearchResults();
            return;
        }

        const nameParts = query.trim().split(/\s+/);
        const searchData = {
            first_name: nameParts[0] || '',
            last_name: nameParts.slice(1).join(' ') || '',
        };

        try {
            const response = await fetch('/api/v1/family/people/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(searchData),
            });

            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }

            const results = await response.json();
            this.displaySearchResults(results);
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    displaySearchResults(results) {
        const container = document.getElementById('searchResults');
        if (!container) {
            return;
        }

        container.innerHTML = '';

        if (results.exact_match) {
            container.appendChild(this.createSearchResultItem(results.exact_match, true));
        }

        if (results.matches && results.matches.length > 0) {
            results.matches.forEach((person) => {
                container.appendChild(this.createSearchResultItem(person, false));
            });
        }

        if (container.children.length === 0) {
            container.innerHTML = '<div class="search-result-item"><span class="search-result-name">No results found</span></div>';
        }

        container.classList.add('active');
    }

    createSearchResultItem(person, isExact) {
        const div = document.createElement('div');
        const displayName = this.escapeHtml(this.getDisplayName(person));
        const statusLabel = person.is_connected_to_tree ? 'Connected' : 'Pending';

        div.className = 'search-result-item';
        div.innerHTML = `
            <div class="search-result-name">
                ${displayName}
                ${isExact ? '<span class="text-green-500 text-xs ml-2">Exact match</span>' : ''}
            </div>
            <div class="search-result-details">
                ${person.middle_name ? `Middle: ${this.escapeHtml(person.middle_name)} • ` : ''}
                ${person.is_verified ? 'Verified' : 'Unverified'} • ${statusLabel}
            </div>
        `;

        div.addEventListener('click', () => {
            this.selectPerson(person.id);
            this.hideSearchResults();

            const searchInput = document.getElementById('familySearch');
            if (searchInput) {
                searchInput.value = '';
            }
        });

        return div;
    }

    hideSearchResults() {
        const container = document.getElementById('searchResults');
        container?.classList.remove('active');
    }

    async addFamilyMember() {
        if (!this.currentUser) {
            this.showNotification('Sign in first to add family members.', 'info');
            return;
        }

        const payload = this.getMemberFormPayload();

        if (!payload.first_name || !payload.last_name) {
            this.showNotification('First name and last name are required.', 'error');
            return;
        }

        try {
            const response = await fetch('/api/v1/family/people/auto-add', {
                method: 'POST',
                headers: {
                    ...this.getAuthHeaders(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || `Failed to add family member: ${response.status}`);
            }

            const result = await response.json();
            this.closeModal('addMemberModal');
            this.resetAddMemberForm();
            await this.loadFamilyStats();
            await this.loadFamilyTree();
            await this.selectPerson(result.person.id);

            this.showNotification(
                result.family_connected
                    ? 'Family member added and connected to the tree.'
                    : 'Family member added as pending until matching family links are found.',
                'success'
            );
        } catch (error) {
            console.error('Add member error:', error);
            this.showNotification(error.message || 'Failed to add family member.', 'error');
        }
    }

    async updateFamilyMember() {
        if (!this.currentUser || !this.isAdminUser()) {
            this.showNotification('Only logged-in administrators can edit family members.', 'error');
            return;
        }

        if (!this.editingPersonId) {
            this.showNotification('Select a family member to edit first.', 'info');
            return;
        }

        const payload = this.getMemberFormPayload();
        if (!payload.first_name || !payload.last_name) {
            this.showNotification('First name and last name are required.', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/v1/family/people/${this.editingPersonId}`, {
                method: 'PUT',
                headers: {
                    ...this.getAuthHeaders(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || `Failed to update family member: ${response.status}`);
            }

            const person = await response.json();
            this.selectedPerson = person;
            this.closeModal('addMemberModal');
            this.resetAddMemberForm();
            this.setMemberFormMode('add');
            await this.loadFamilyStats();
            await this.loadFamilyTree();
            await this.selectPerson(person.id);

            this.showNotification('Family member details updated successfully.', 'success');
        } catch (error) {
            console.error('Update member error:', error);
            this.showNotification(error.message || 'Failed to update family member.', 'error');
        }
    }

    async handleLogin() {
        const email = document.getElementById('loginEmail')?.value || '';
        const password = document.getElementById('loginPassword')?.value || '';

        if (!email || !password) {
            this.showError('loginError', 'Please fill in all fields.');
            return;
        }

        const success = await this.login(email, password);
        if (success) {
            this.resetLoginForm();
        }
    }

    async handleRegister() {
        const name = document.getElementById('registerName')?.value || '';
        const email = document.getElementById('registerEmail')?.value || '';
        const password = document.getElementById('registerPassword')?.value || '';
        const confirmPassword = document.getElementById('registerConfirmPassword')?.value || '';

        if (!name || !email || !password || !confirmPassword) {
            this.showError('registerError', 'Please fill in all required fields.');
            return;
        }

        if (password !== confirmPassword) {
            this.showError('registerError', 'Passwords do not match.');
            return;
        }

        const success = await this.register({
            name,
            email,
            password,
            role: document.getElementById('registerRole')?.value || 'user',
        });

        if (success) {
            this.resetRegisterForm();
        }
    }

    resetAddMemberForm() {
        document.getElementById('addMemberForm')?.reset();
        this.editingPersonId = null;
    }

    resetLoginForm() {
        document.getElementById('loginForm')?.reset();
        this.hideError('loginError');
    }

    resetRegisterForm() {
        document.getElementById('registerForm')?.reset();
        this.hideError('registerError');
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            return;
        }

        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            return;
        }

        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach((modal) => {
            modal.classList.remove('active');
        });
        document.body.classList.remove('modal-open');
    }

    openAddMemberModal() {
        if (!this.currentUser) {
            this.showNotification('Sign in first to add family members.', 'info');
            return;
        }

        this.setMemberFormMode('add');
        this.resetAddMemberForm();
        this.openModal('addMemberModal');
    }

    openEditMemberModal() {
        if (!this.selectedPerson) {
            this.showNotification('Select a family member first.', 'info');
            return;
        }

        if (!this.currentUser || !this.isAdminUser()) {
            this.showNotification('Only logged-in administrators can edit family members.', 'error');
            return;
        }

        this.editingPersonId = this.selectedPerson.id;
        this.setMemberFormMode('edit');
        this.populateMemberForm(this.selectedPerson);
        this.closeModal('personDetailsModal');
        this.openModal('addMemberModal');
    }

    async submitMemberForm() {
        if (this.formMode === 'edit') {
            await this.updateFamilyMember();
            return;
        }

        await this.addFamilyMember();
    }

    zoomTree(amount) {
        const treeRoot = document.getElementById('treeRoot');
        if (!treeRoot) {
            return;
        }

        this.treeScale = Math.max(0.7, Math.min(1.6, this.treeScale + amount));

        if (window.CSS && CSS.supports && CSS.supports('zoom', '1')) {
            treeRoot.style.zoom = String(this.treeScale);
            treeRoot.style.transform = '';
            return;
        }

        treeRoot.style.transform = `scale(${this.treeScale})`;
        treeRoot.style.transformOrigin = 'top center';
    }

    centerTree() {
        const container = document.getElementById('treeViewContainer');
        if (!container) {
            return;
        }

        container.scrollTo({
            left: Math.max((container.scrollWidth - container.clientWidth) / 2, 0),
            top: 0,
            behavior: 'smooth',
        });
    }

    focusPersonInTree() {
        if (!this.selectedPerson) {
            return;
        }

        const targetNode = document.querySelector(`.person-node[data-person-id="${this.selectedPerson.id}"]`);
        if (!targetNode) {
            this.closeModal('personDetailsModal');
            return;
        }

        this.highlightSelectedPersonNode(this.selectedPerson.id);
        this.closeModal('personDetailsModal');

        const treeContainer = document.getElementById('treeViewContainer');
        if (treeContainer && treeContainer.contains(targetNode)) {
            const containerRect = treeContainer.getBoundingClientRect();
            const nodeRect = targetNode.getBoundingClientRect();
            const nextLeft = treeContainer.scrollLeft + (nodeRect.left - containerRect.left) - ((containerRect.width - nodeRect.width) / 2);
            const nextTop = treeContainer.scrollTop + (nodeRect.top - containerRect.top) - ((containerRect.height - nodeRect.height) / 2);

            treeContainer.scrollTo({
                left: Math.max(nextLeft, 0),
                top: Math.max(nextTop, 0),
                behavior: 'smooth',
            });
            treeContainer.focus({ preventScroll: true });
            return;
        }

        targetNode.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center',
        });
    }

    showLoading() {
        document.getElementById('treeLoading')?.classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('treeLoading')?.classList.add('hidden');
    }

    showNotification(message, type = 'info') {
        if (window.familyApp && typeof window.familyApp.showNotification === 'function') {
            window.familyApp.showNotification(message, type);
            return;
        }

        console.log(`${type.toUpperCase()}: ${message}`);
    }

    showError(elementId, message) {
        const element = document.getElementById(elementId);
        if (!element) {
            return;
        }

        const span = element.querySelector('span');
        if (span) {
            span.textContent = message;
        }
        element.classList.add('active');
    }

    hideError(elementId) {
        document.getElementById(elementId)?.classList.remove('active');
    }

    getDisplayName(person) {
        return [person.first_name, person.middle_name, person.last_name].filter(Boolean).join(' ').trim();
    }

    getInitials(firstName = '', lastName = '') {
        const firstInitial = firstName.charAt(0) || '?';
        const lastInitial = lastName.charAt(0) || '';
        return `${firstInitial}${lastInitial}`.toUpperCase();
    }

    getMissingConnectionLabel(person) {
        if (person.father_name) {
            return `Waiting for father match: ${person.father_name}`;
        }
        if (person.mother_name) {
            return `Waiting for mother match: ${person.mother_name}`;
        }
        if (person.spouse_name) {
            return `Waiting for spouse match: ${person.spouse_name}`;
        }
        return 'No linked parent or spouse has been matched yet';
    }

    normalizeName(value) {
        return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    getMemberFormPayload() {
        return {
            first_name: document.getElementById('firstName')?.value.trim() || '',
            last_name: document.getElementById('lastName')?.value.trim() || '',
            middle_name: document.getElementById('middleName')?.value.trim() || null,
            father_name: document.getElementById('fatherName')?.value.trim() || null,
            mother_name: document.getElementById('motherName')?.value.trim() || null,
            spouse_name: document.getElementById('spouseName')?.value.trim() || null,
        };
    }

    syncPersonActionButtons() {
        const editButton = document.getElementById('btnEditPerson');
        if (!editButton) {
            return;
        }

        const canEdit = Boolean(this.selectedPerson && this.currentUser && this.isAdminUser());
        editButton.classList.toggle('hidden', !canEdit);
    }

    setMemberFormMode(mode = 'add') {
        this.formMode = mode;

        const title = document.getElementById('memberFormTitle');
        const helper = document.getElementById('memberFormHelper');
        const submitButton = document.getElementById('memberFormSubmit');

        if (mode === 'edit') {
            if (title) {
                title.textContent = 'Edit Family Member';
            }
            if (helper) {
                helper.textContent = 'Administrators can correct recorded names here and update parent or spouse labels if a connection needs to be fixed.';
            }
            if (submitButton) {
                submitButton.innerHTML = `
                    <i class="fas fa-save"></i>
                    Save Changes
                `;
            }
            return;
        }

        if (title) {
            title.textContent = 'Add Family Member';
        }
        if (helper) {
            helper.textContent = 'Use full names for father, mother, or spouse if the person already exists in the system. That helps connect the new member to the family tree automatically.';
        }
        if (submitButton) {
            submitButton.innerHTML = `
                <i class="fas fa-user-plus"></i>
                Add Member
            `;
        }
    }

    populateMemberForm(person) {
        document.getElementById('firstName').value = person?.first_name || '';
        document.getElementById('middleName').value = person?.middle_name || '';
        document.getElementById('lastName').value = person?.last_name || '';
        document.getElementById('fatherName').value = person?.father_name || '';
        document.getElementById('motherName').value = person?.mother_name || '';
        document.getElementById('spouseName').value = person?.spouse_name || '';
    }

    highlightSelectedPersonNode(personId = this.selectedPerson?.id) {
        document.querySelectorAll('.person-node').forEach((node) => {
            node.classList.toggle('selected', String(node.dataset.personId) === String(personId));
        });
    }

    escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.familyTreeApp = new FamilyTreeApp();

    if (typeof window.familyApp !== 'undefined' && window.familyApp.updateTime) {
        window.familyApp.updateTime();
    }
});

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
    if (window.familyTreeApp) {
        window.familyTreeApp.showNotification(message, type);
    }
}
