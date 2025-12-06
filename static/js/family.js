// Family Tree Application JavaScript

class FamilyTreeApp {
    constructor() {
        this.currentUser = null;
        this.treeData = null;
        this.selectedPerson = null;
        this.treeScale = 1;
        this.initialize();
    }

    initialize() {
        console.log('Family Tree App Initialized');
        this.checkAuthentication();
        this.setupEventListeners();
        this.loadFamilyStats();
        this.loadFamilyTree();
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
                    console.log('User authenticated:', this.currentUser);
                    this.updateUIForAuth();
                } else {
                    localStorage.removeItem('family_token');
                    this.currentUser = null;
                }
            }
        } catch (error) {
            console.error('Auth check failed:', error);
        }
    }

    updateUIForAuth() {
        const userSection = document.querySelector('.sidebar-footer .glass');
        if (userSection && this.currentUser) {
            userSection.innerHTML = `
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 gradient-bg rounded-full flex items-center justify-center">
                        <i class="fas fa-user text-white"></i>
                    </div>
                    <div>
                        <p class="font-medium">${this.currentUser.name}</p>
                        <p class="text-sm text-gray-500">${this.currentUser.role}</p>
                    </div>
                </div>
                <button class="btn btn-outline w-full mt-4" onclick="familyTreeApp.logout()">
                    <i class="fas fa-sign-out-alt"></i>
                    Sign Out
                </button>
            `;
        }
    }

    async login(email, password) {
        try {
            const formData = new FormData();
            formData.append('username', email);
            formData.append('password', password);
            
            const response = await fetch('/api/v1/auth/token', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('family_token', data.access_token);
                this.showNotification('Login successful!', 'success');
                this.closeModal('loginModal');
                this.checkAuthentication();
                return true;
            } else {
                const error = await response.json();
                this.showError('loginError', error.detail || 'Login failed');
                return false;
            }
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
                    'Authorization': `Bearer ${localStorage.getItem('family_token') || ''}`
                },
                body: JSON.stringify(userData)
            });
            
            if (response.ok) {
                this.showNotification('Registration successful! Please login.', 'success');
                this.closeModal('registerModal');
                this.openModal('loginModal');
                return true;
            } else {
                const error = await response.json();
                this.showError('registerError', error.detail || 'Registration failed');
                return false;
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showError('registerError', 'Network error. Please try again.');
            return false;
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

    setupEventListeners() {
        // Search functionality
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

        // Tree controls
        document.getElementById('btnZoomIn')?.addEventListener('click', () => this.zoomTree(0.1));
        document.getElementById('btnZoomOut')?.addEventListener('click', () => this.zoomTree(-0.1));
        document.getElementById('btnCenterTree')?.addEventListener('click', () => this.centerTree());
        document.getElementById('btnAddMember')?.addEventListener('click', () => this.openAddMemberModal());
        document.getElementById('btnStartTree')?.addEventListener('click', () => this.openAddMemberModal());
        document.getElementById('btnViewFullTree')?.addEventListener('click', () => this.viewFullTree());
        document.getElementById('btnDownloadTree')?.addEventListener('click', () => this.downloadTree());
        document.getElementById('btnPrintTree')?.addEventListener('click', () => this.printTree());

        // Modal controls
        document.getElementById('closeAddMemberModal')?.addEventListener('click', () => this.closeModal('addMemberModal'));
        document.getElementById('closeLoginModal')?.addEventListener('click', () => this.closeModal('loginModal'));
        document.getElementById('closeRegisterModal')?.addEventListener('click', () => this.closeModal('registerModal'));
        document.getElementById('closePersonDetailsModal')?.addEventListener('click', () => this.closeModal('personDetailsModal'));
        
        document.getElementById('cancelAddMember')?.addEventListener('click', () => this.closeModal('addMemberModal'));
        document.getElementById('showRegister')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.closeModal('loginModal');
            this.openModal('registerModal');
        });
        
        document.getElementById('showLogin')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.closeModal('registerModal');
            this.openModal('loginModal');
        });

        // Tab switching
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                const tab = button.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Forms
        document.getElementById('addMemberForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addFamilyMember();
        });
        
        document.getElementById('loginForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });
        
        document.getElementById('registerForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });

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
            if (e.key === 'Enter' && e.ctrlKey) {
                this.openAddMemberModal();
            }
        });
    }

    async loadFamilyStats() {
        try {
            const response = await fetch('/api/v1/family/statistics');
            if (response.ok) {
                const stats = await response.json();
                this.updateStatsUI(stats);
            }
        } catch (error) {
            console.error('Error loading stats:', error);
            // Use default values
            this.updateStatsUI({
                total_people: 156,
                connected_to_family: 120,
                verified_count: 89,
                with_user_accounts: 45
            });
        }
    }

    updateStatsUI(stats) {
        const totalMembers = document.getElementById('totalMembers');
        const generations = document.getElementById('generations');
        const verifiedMembers = document.getElementById('verifiedMembers');
        const recentAdditions = document.getElementById('recentAdditions');
        
        if (totalMembers) totalMembers.textContent = stats.total_people;
        if (generations) generations.textContent = Math.max(3, Math.ceil(stats.total_people / 20));
        if (verifiedMembers) verifiedMembers.textContent = stats.verified_count;
        if (recentAdditions) recentAdditions.textContent = Math.floor(stats.total_people * 0.1);
    }

    async loadFamilyTree() {
        try {
            this.showLoading();
            
            // 1. Fetch the Flat List of all people
            // Limit is set high to get the full tree context
            const response = await fetch('/api/v1/family/people?skip=0&limit=100');
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.items && data.items.length > 0) {
                    // 2. Process the flat list into a hierarchy
                    const hierarchy = this.buildHierarchy(data.items);
                    this.renderFamilyTree(hierarchy);
                } else {
                    this.showEmptyState();
                }
            } else {
                console.error("Failed to fetch family list");
                this.showEmptyState();
            }
        } catch (error) {
            console.error('Error loading tree:', error);
            this.showEmptyState();
        } finally {
            this.hideLoading();
        }
    }

    buildHierarchy(flatList) {
        const map = {};
        const roots = [];
        const orphans = [];

        // Step A: Index everyone by Full Name
        // In a real DB, linking by UUID is safer, but we follow the name-based requirement
        flatList.forEach((person, index) => {
            person.fullName = `${person.first_name} ${person.last_name || ''}`.trim();
            person.children = []; 
            person.linkType = 'root'; // default
            map[person.fullName] = index;
        });

        // Step B: Link Children to Parents
        flatList.forEach(person => {
            const fatherName = person.father_name ? person.father_name.trim() : null;
            const motherName = person.mother_name ? person.mother_name.trim() : null;
            
            const hasFatherListed = fatherName && fatherName.length > 0;
            const hasMotherListed = motherName && motherName.length > 0;
            
            let isLinked = false;

            // 1. Try Linking to Father
            if (hasFatherListed && map[fatherName] !== undefined) {
                flatList[map[fatherName]].children.push(person);
                person.linkType = 'father';
                isLinked = true;
            } 
            // 2. Fallback: Try Linking to Mother (if Father not found/listed)
            else if (hasMotherListed && map[motherName] !== undefined) {
                flatList[map[motherName]].children.push(person);
                person.linkType = 'mother';
                isLinked = true;
            }

            // 3. Categorize Unlinked
            if (!isLinked) {
                // If they listed a parent but we couldn't find them -> Orphan
                // If they listed NO parents -> Root
                if (hasFatherListed || hasMotherListed) {
                    orphans.push(person);
                    person.missingLink = hasFatherListed ? `Missing: ${fatherName}` : `Missing: ${motherName}`;
                } else {
                    roots.push(person);
                }
            }
        });

        return { roots, orphans };
    }

    showEmptyState() {
        const treeLoading = document.getElementById('treeLoading');
        const treeContent = document.getElementById('treeContent');
        const emptyState = document.getElementById('emptyState');
        const treeVisualization = document.getElementById('treeVisualization');
        
        if (treeLoading) treeLoading.classList.add('hidden');
        if (treeContent) treeContent.classList.remove('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        if (treeVisualization) treeVisualization.classList.add('hidden');
    }

    renderFamilyTree(hierarchy) {
        const { roots, orphans } = hierarchy;
        
        const treeRootContainer = document.getElementById('treeRoot');
        const orphanContainer = document.getElementById('orphanContainer');
        const orphanGrid = document.getElementById('orphanGrid');
        
        // Clear previous
        treeRootContainer.innerHTML = '';
        orphanGrid.innerHTML = '';

        // 1. Render Main Tree (Recursive)
        if (roots.length > 0) {
            const ul = document.createElement('ul');
            roots.forEach(root => {
                ul.innerHTML += this.generateRecursiveHTML(root);
            });
            treeRootContainer.appendChild(ul);
        } else {
            treeRootContainer.innerHTML = '<p class="text-gray-500">No root family member found.</p>';
        }

        // 2. Render Orphans (Unlinked)
        if (orphans.length > 0) {
            orphanContainer.classList.remove('hidden');
            orphans.forEach(orphan => {
                const orphanNode = this.createPersonCardHTML(orphan, true); // true = isOrphan
                orphanGrid.innerHTML += orphanNode;
            });
        } else {
            orphanContainer.classList.add('hidden');
        }

        // Show UI
        document.getElementById('treeContent').classList.remove('hidden');
        document.getElementById('emptyState').classList.add('hidden');
        
        // Re-attach Event Listeners to the new DOM elements
        this.setupPersonNodeEvents();
    }

    generateRecursiveHTML(person) {
        let html = `
            <li>
                ${this.createPersonCardHTML(person)}
        `;

        // If person has children, recurse
        if (person.children && person.children.length > 0) {
            html += `<ul>`;
            person.children.forEach(child => {
                html += this.generateRecursiveHTML(child);
            });
            html += `</ul>`;
        }

        html += `</li>`;
        return html;
    }

    createPersonCardHTML(person, isOrphan = false) {
        const initials = this.getInitials(person.first_name, person.last_name);
        
        // Determine Badge
        let badgeHtml = '';
        if (isOrphan) {
            badgeHtml = `<div class="text-red-500 text-xs mt-2 font-bold">${person.missingLink}</div>`;
        } else {
            let badgeClass = 'badge-root';
            let badgeText = 'Root';
            
            if (person.linkType === 'father') { badgeClass = 'badge-father'; badgeText = 'Via Father'; }
            if (person.linkType === 'mother') { badgeClass = 'badge-mother'; badgeText = 'Via Mother'; }
            
            badgeHtml = `<span class="connection-badge ${badgeClass}">${badgeText}</span>`;
        }

        return `
            <div class="person-node" data-person-id="${person.id}">
                <div class="person-avatar">
                    ${initials}
                </div>
                <h4 class="person-name">${person.first_name} ${person.last_name || ''}</h4>
                <div class="person-tags">
                    <span class="person-tag">${person.is_verified ? 'Verified' : 'Unverified'}</span>
                </div>
                ${badgeHtml}
            </div>
        `;
    }

    buildTreeHTML(node, level) {
        if (!node || !node.person) return '';

        const generationClass = `generation-${Math.min(level + 1, 4)}`;
        const initials = this.getInitials(node.person.first_name, node.person.last_name);
        
        let html = `
            <div class="tree-main">
                <div class="tree-generation">
                    <div class="person-node ${generationClass}" data-person-id="${node.person.id}">
                        <div class="person-avatar">
                            ${initials}
                        </div>
                        <h4 class="person-name">${node.person.first_name} ${node.person.last_name}</h4>
                        <p class="person-details">Generation ${level + 1}</p>
                        <div class="person-tags">
                            <span class="person-tag">${node.person.is_verified ? 'Verified' : 'Unverified'}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add parents if available
        if (node.father || node.mother) {
            html = `
                <div class="tree-parents">
                    ${node.father ? this.buildTreeHTML(node.father, level + 1) : '<div></div>'}
                    ${node.mother ? this.buildTreeHTML(node.mother, level + 1) : '<div></div>'}
                </div>
                <div class="tree-connection">
                    ${html}
                </div>
            `;
        }

        // Add spouses if available
        if (node.spouses && node.spouses.length > 0) {
            let spousesHTML = '';
            node.spouses.forEach(spouse => {
                spousesHTML += this.buildTreeHTML(spouse, level);
            });
            
            html = `
                <div class="flex items-center justify-center gap-8">
                    ${html}
                    ${spousesHTML}
                </div>
            `;
        }

        // Add children if available
        if (node.children && node.children.length > 0) {
            let childrenHTML = '<div class="tree-children">';
            node.children.forEach(child => {
                childrenHTML += this.buildTreeHTML(child, level - 1);
            });
            childrenHTML += '</div>';
            
            html += childrenHTML;
        }

        return html;
    }

    getInitials(firstName, lastName) {
        return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }

    setupPersonNodeEvents() {
        document.querySelectorAll('.person-node').forEach(node => {
            node.addEventListener('click', () => {
                const personId = node.dataset.personId;
                this.selectPerson(personId);
            });
        });
    }

    async selectPerson(personId) {
        try {
            const response = await fetch(`/api/v1/family/people/${personId}`);
            if (response.ok) {
                this.selectedPerson = await response.json();
                this.showPersonDetails();
            }
        } catch (error) {
            console.error('Error loading person details:', error);
        }
    }

    showPersonDetails() {
        if (!this.selectedPerson) return;

        const title = document.getElementById('personDetailsTitle');
        const avatar = document.getElementById('personAvatar');
        const fullName = document.getElementById('personFullName');
        const generation = document.getElementById('personGeneration');
        const branch = document.getElementById('personBranch');
        const status = document.getElementById('personStatus');
        
        if (title) title.textContent = `${this.selectedPerson.first_name} ${this.selectedPerson.last_name}`;
        if (avatar) avatar.innerHTML = this.getInitials(this.selectedPerson.first_name, this.selectedPerson.last_name);
        if (fullName) fullName.textContent = `${this.selectedPerson.first_name} ${this.selectedPerson.last_name}`;
        if (generation) generation.textContent = 'Family Member';
        if (branch) branch.textContent = 'Main Branch';
        if (status) status.textContent = this.selectedPerson.is_verified ? 'Verified ✓' : 'Unverified';
        
        // Load relationships
        this.loadPersonRelationships(this.selectedPerson.id);
        
        this.openModal('personDetailsModal');
    }

    async loadPersonRelationships(personId) {
        try {
            const response = await fetch(`/api/v1/family/people/${personId}/family-tree?generations=1`);
            if (response.ok) {
                const treeData = await response.json();
                this.updateRelationshipsUI(treeData.tree);
            }
        } catch (error) {
            console.error('Error loading relationships:', error);
        }
    }

    updateRelationshipsUI(node) {
        const container = document.getElementById('personRelationships');
        if (!container) return;

        let html = '<div class="space-y-3">';
        
        if (node.father) {
            html += `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span>Father</span>
                    <strong>${node.father.person.first_name} ${node.father.person.last_name}</strong>
                </div>
            `;
        }
        
        if (node.mother) {
            html += `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span>Mother</span>
                    <strong>${node.mother.person.first_name} ${node.mother.person.last_name}</strong>
                </div>
            `;
        }
        
        if (node.spouses && node.spouses.length > 0) {
            node.spouses.forEach(spouse => {
                html += `
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span>Spouse</span>
                        <strong>${spouse.person.first_name} ${spouse.person.last_name}</strong>
                    </div>
                `;
            });
        }
        
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
                html += `
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span>Child</span>
                        <strong>${child.person.first_name} ${child.person.last_name}</strong>
                    </div>
                `;
            });
        }
        
        html += '</div>';
        container.innerHTML = html;
    }

    async searchFamilyMembers(query) {
        if (!query.trim()) {
            this.hideSearchResults();
            return;
        }

        try {
            const [firstName, lastName] = query.split(' ');
            const searchData = {
                first_name: firstName || '',
                last_name: lastName || ''
            };

            const response = await fetch('/api/v1/family/people/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(searchData)
            });

            if (response.ok) {
                const results = await response.json();
                this.displaySearchResults(results);
            }
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    displaySearchResults(results) {
        const container = document.getElementById('searchResults');
        if (!container) return;

        container.innerHTML = '';
        
        if (results.exact_match) {
            const exactMatch = this.createSearchResultItem(results.exact_match, true);
            container.appendChild(exactMatch);
        }

        if (results.matches && results.matches.length > 0) {
            results.matches.forEach(person => {
                const item = this.createSearchResultItem(person, false);
                container.appendChild(item);
            });
        }

        if (container.children.length === 0) {
            container.innerHTML = '<div class="search-result-item"><span class="search-result-name">No results found</span></div>';
        }

        container.classList.add('active');
    }

    createSearchResultItem(person, isExact) {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.innerHTML = `
            <div class="search-result-name">
                ${person.first_name} ${person.last_name}
                ${isExact ? '<span class="text-green-500 text-xs ml-2">✓ Exact match</span>' : ''}
            </div>
            <div class="search-result-details">
                ${person.middle_name ? `Middle: ${person.middle_name} • ` : ''}
                ${person.is_verified ? 'Verified' : 'Unverified'}
            </div>
        `;
        
        div.addEventListener('click', () => {
            this.selectPerson(person.id);
            this.hideSearchResults();
            document.getElementById('familySearch').value = '';
        });
        
        return div;
    }

    hideSearchResults() {
        const container = document.getElementById('searchResults');
        if (container) {
            container.classList.remove('active');
        }
    }

    async addFamilyMember() {
        if (!this.currentUser) {
            this.showNotification('Please login to add family members', 'error');
            this.openModal('loginModal');
            return;
        }

        const formData = {
            first_name: document.getElementById('firstName').value.trim(),
            last_name: document.getElementById('lastName').value.trim(),
            middle_name: document.getElementById('middleName').value.trim() || null,
            father_name: document.getElementById('fatherName').value.trim() || null,
            mother_name: document.getElementById('motherName').value.trim() || null,
            spouse_name: document.getElementById('spouseName').value.trim() || null
        };

        try {
            const token = localStorage.getItem('family_token');
            const response = await fetch('/api/v1/family/people', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                const newPerson = await response.json();
                this.showNotification('Family member added successfully!', 'success');
                this.closeModal('addMemberModal');
                this.resetAddMemberForm();
                this.loadFamilyStats();
                this.loadFamilyTree();
                
                // Auto-select the new person
                this.selectPerson(newPerson.id);
            } else {
                const error = await response.json();
                this.showNotification(error.detail || 'Failed to add member', 'error');
            }
        } catch (error) {
            console.error('Add member error:', error);
            this.showNotification('Network error. Please try again.', 'error');
        }
    }

    async handleLogin() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        if (!email || !password) {
            this.showError('loginError', 'Please fill in all fields');
            return;
        }

        const success = await this.login(email, password);
        if (success) {
            this.resetLoginForm();
        }
    }

    async handleRegister() {
        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;

        if (!name || !email || !password || !confirmPassword) {
            this.showError('registerError', 'Please fill in all required fields');
            return;
        }

        if (password !== confirmPassword) {
            this.showError('registerError', 'Passwords do not match');
            return;
        }

        const userData = {
            name: name,
            email: email,
            password: password,
            role: document.getElementById('registerRole').value
        };

        const success = await this.register(userData);
        if (success) {
            this.resetRegisterForm();
        }
    }

    resetAddMemberForm() {
        const form = document.getElementById('addMemberForm');
        if (form) form.reset();
        this.switchTab('basic');
    }

    resetLoginForm() {
        const form = document.getElementById('loginForm');
        if (form) form.reset();
        this.hideError('loginError');
    }

    resetRegisterForm() {
        const form = document.getElementById('registerForm');
        if (form) form.reset();
        this.hideError('registerError');
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === tabName);
        });

        // Show/hide tab content
        const advancedTab = document.getElementById('advancedTab');
        if (advancedTab) {
            advancedTab.style.display = tabName === 'advanced' ? 'block' : 'none';
        }
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

    openAddMemberModal() {
        if (!this.currentUser) {
            this.showNotification('Please login to add family members', 'info');
            this.openModal('loginModal');
        } else {
            this.openModal('addMemberModal');
        }
    }

    zoomTree(amount) {
        this.treeScale = Math.max(0.5, Math.min(2, this.treeScale + amount));
        const container = document.getElementById('treeViewContainer');
        if (container) {
            container.style.transform = `scale(${this.treeScale})`;
            container.style.transformOrigin = 'center center';
        }
    }

    centerTree() {
        const container = document.getElementById('treeViewContainer');
        if (container) {
            container.scrollTo({
                left: (container.scrollWidth - container.clientWidth) / 2,
                top: (container.scrollHeight - container.clientHeight) / 2,
                behavior: 'smooth'
            });
        }
    }

    viewFullTree() {
        this.showNotification('Full tree view coming soon!', 'info');
    }

    downloadTree() {
        this.showNotification('Tree download feature coming soon!', 'info');
    }

    printTree() {
        window.print();
    }

    showLoading() {
        const loading = document.getElementById('treeLoading');
        if (loading) loading.classList.remove('hidden');
    }

    hideLoading() {
        const loading = document.getElementById('treeLoading');
        if (loading) loading.classList.add('hidden');
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

    showError(elementId, message) {
        const element = document.getElementById(elementId);
        if (element) {
            const span = element.querySelector('span');
            if (span) span.textContent = message;
            element.classList.add('active');
        }
    }

    hideError(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.remove('active');
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.familyTreeApp = new FamilyTreeApp();
    
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

function showNotification(message, type = 'info') {
    if (window.familyTreeApp) {
        window.familyTreeApp.showNotification(message, type);
    }
}