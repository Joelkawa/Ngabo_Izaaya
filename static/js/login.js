// Login Page JavaScript

class LoginApp {
    constructor() {
        this.initialize();
    }

    initialize() {
        console.log('Login App Initialized');
        this.setupEventListeners();
        this.checkExistingAuth();
    }

    checkExistingAuth() {
        const token = localStorage.getItem('family_token');
        if (token) {
            // User already logged in, redirect to home
            window.location.href = '/';
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
        document.querySelector('.forgot-password')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleForgotPassword();
        });
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

    handleForgotPassword() {
        const email = document.getElementById('email').value;
        
        if (!email) {
            this.showError('Please enter your email address first');
            return;
        }
        
        this.showNotification('Password reset feature coming soon!', 'info');
        // TODO: Implement password reset
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