// Login Page JavaScript

class LoginApp {
    constructor() {
        this.forgotPasswordModal = document.getElementById('forgotPasswordModal');
        this.initialize();
    }

    initialize() {
        console.log('Login App Initialized');
        this.setupEventListeners();
        this.checkExistingAuth();
        this.handleInitialForgotPasswordIntent();
    }

    async checkExistingAuth() {
        const token = localStorage.getItem('family_token');
        if (!token) {
            return;
        }

        try {
            const response = await fetch('/api/v1/auth/users/me', {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                localStorage.removeItem('family_token');
                return;
            }

            window.location.href = '/';
        } catch (error) {
            console.error('Existing auth validation failed:', error);
            localStorage.removeItem('family_token');
        }
    }

    setupEventListeners() {
        // Password toggle
        document.getElementById('togglePassword')?.addEventListener('click', () => {
            this.togglePasswordVisibility();
        });

        // Form submission
        document.getElementById('loginForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Forgot password
        document.getElementById('openForgotPasswordModal')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openForgotPasswordModal();
        });

        document.getElementById('closeForgotPasswordModal')?.addEventListener('click', () => {
            this.closeForgotPasswordModal();
        });

        document.getElementById('cancelForgotPassword')?.addEventListener('click', () => {
            this.closeForgotPasswordModal();
        });

        document.getElementById('forgotPasswordForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.handleForgotPassword();
        });

        document.getElementById('forgotPasswordModal')?.addEventListener('click', (event) => {
            if (event.target.id === 'forgotPasswordModal') {
                this.closeForgotPasswordModal();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeForgotPasswordModal();
            }
        });
    }

    handleInitialForgotPasswordIntent() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('forgot') === '1') {
            this.openForgotPasswordModal();
        }
    }

    togglePasswordVisibility() {
        const passwordInput = document.getElementById('password');
        const toggleButton = document.getElementById('togglePassword');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleButton.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            passwordInput.type = 'password';
            toggleButton.innerHTML = '<i class="fas fa-eye"></i>';
        }
    }

    async handleLogin() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        if (!email || !password) {
            this.showError('Please fill in all fields');
            return;
        }

        this.showLoading();

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
                
                // Store remember me preference
                const rememberMe = document.getElementById('rememberMe').checked;
                if (rememberMe) {
                    localStorage.setItem('remember_me', 'true');
                } else {
                    localStorage.removeItem('remember_me');
                }
                
                this.showNotification('Login successful! Redirecting...', 'success');
                
                // Redirect to home page
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
                
            } else {
                const error = await response.json();
                this.showError(error.detail || 'Invalid email or password');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Network error. Please try again.');
        } finally {
            this.hideLoading();
        }
    }

    syncModalBodyState() {
        const hasOpenModal = Boolean(document.querySelector('.announcement-modal.is-open'));
        document.body.classList.toggle('modal-open', hasOpenModal);
    }

    openForgotPasswordModal() {
        if (!this.forgotPasswordModal) {
            return;
        }

        const loginEmail = document.getElementById('email')?.value?.trim();
        const forgotEmail = document.getElementById('forgotPasswordEmail');
        if (forgotEmail && loginEmail) {
            forgotEmail.value = loginEmail;
        }

        this.hideForgotPasswordMessages();
        this.forgotPasswordModal.classList.add('is-open');
        this.forgotPasswordModal.setAttribute('aria-hidden', 'false');
        this.syncModalBodyState();
    }

    closeForgotPasswordModal() {
        if (!this.forgotPasswordModal) {
            return;
        }

        this.forgotPasswordModal.classList.remove('is-open');
        this.forgotPasswordModal.setAttribute('aria-hidden', 'true');
        this.syncModalBodyState();
    }

    hideForgotPasswordMessages() {
        document.getElementById('forgotPasswordError')?.classList.remove('active');
        document.getElementById('forgotPasswordSuccess')?.classList.remove('active');
    }

    showForgotPasswordError(message) {
        this.hideForgotPasswordMessages();
        const container = document.getElementById('forgotPasswordError');
        const messageElement = document.getElementById('forgotPasswordErrorMessage');
        if (container && messageElement) {
            messageElement.textContent = message;
            container.classList.add('active');
        }
    }

    showForgotPasswordSuccess(message) {
        this.hideForgotPasswordMessages();
        const container = document.getElementById('forgotPasswordSuccess');
        const messageElement = document.getElementById('forgotPasswordSuccessMessage');
        if (container && messageElement) {
            messageElement.textContent = message;
            container.classList.add('active');
        }
    }

    setForgotPasswordSubmitting(isSubmitting) {
        const submitButton = document.getElementById('submitForgotPassword');
        if (!submitButton) {
            return;
        }

        submitButton.disabled = isSubmitting;
        submitButton.innerHTML = isSubmitting
            ? '<i class="fas fa-spinner fa-spin"></i> Sending...'
            : '<i class="fas fa-paper-plane"></i> Send Reset Link';
    }

    async handleForgotPassword() {
        const emailInput = document.getElementById('forgotPasswordEmail');
        const email = emailInput?.value?.trim();

        if (!email) {
            this.showForgotPasswordError('Please enter your email address.');
            return;
        }

        this.setForgotPasswordSubmitting(true);
        this.hideForgotPasswordMessages();

        try {
            const response = await fetch('/api/v1/auth/password-reset/request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({ email }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.detail || 'Unable to send a reset link right now.');
            }

            this.showForgotPasswordSuccess(
                payload.message || 'If that account exists, a reset link has been sent.'
            );
            this.showNotification('Password reset link sent if the account exists.', 'success');
        } catch (error) {
            console.error('Forgot password error:', error);
            this.showForgotPasswordError(error.message || 'Unable to send a reset link right now.');
        } finally {
            this.setForgotPasswordSubmitting(false);
        }
    }

    showError(message) {
        const errorElement = document.getElementById('loginError');
        const messageElement = document.getElementById('errorMessage');
        
        if (errorElement && messageElement) {
            messageElement.textContent = message;
            errorElement.classList.add('active');
            
            // Auto-hide error after 5 seconds
            setTimeout(() => {
                this.hideError();
            }, 5000);
        }
    }

    hideError() {
        const errorElement = document.getElementById('loginError');
        if (errorElement) {
            errorElement.classList.remove('active');
        }
    }

    showLoading() {
        const submitButton = document.querySelector('#loginForm button[type="submit"]');
        if (submitButton) {
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
            submitButton.disabled = true;
        }
    }

    hideLoading() {
        const submitButton = document.querySelector('#loginForm button[type="submit"]');
        if (submitButton) {
            submitButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
            submitButton.disabled = false;
        }
    }

    showNotification(message, type = 'info') {
        // Use existing notification system from main.js
        if (window.familyApp && typeof window.familyApp.showNotification === 'function') {
            window.familyApp.showNotification(message, type);
        } else {
            // Simple alert fallback
            alert(`${type.toUpperCase()}: ${message}`);
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.loginApp = new LoginApp();
});
