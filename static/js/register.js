    // Register Page JavaScript

class RegisterApp {
    constructor() {
        this.initialize();
    }

    initialize() {
        console.log('Register App Initialized');
        this.setupEventListeners();
        this.checkExistingAuth();
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

            if (response.ok) {
                window.location.href = '/';
                return;
            }

            localStorage.removeItem('family_token');
        } catch (error) {
            console.warn('Unable to validate stored session on register page:', error);
            localStorage.removeItem('family_token');
        }
    }

    setupEventListeners() {
        // Password toggles
        document.getElementById('togglePassword')?.addEventListener('click', () => {
            this.togglePasswordVisibility('password');
        });

        document.getElementById('toggleConfirmPassword')?.addEventListener('click', () => {
            this.togglePasswordVisibility('confirmPassword');
        });

        // Form submission
        document.getElementById('registerForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });

        // Confirm password validation
        document.getElementById('confirmPassword')?.addEventListener('input', () => {
            this.checkPasswordMatch();
        });
    }

    togglePasswordVisibility(fieldId) {
        const input = document.getElementById(fieldId);
        const toggleButton = document.getElementById(`toggle${fieldId.charAt(0).toUpperCase() + fieldId.slice(1)}`);
        
        if (input.type === 'password') {
            input.type = 'text';
            toggleButton.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            input.type = 'password';
            toggleButton.innerHTML = '<i class="fas fa-eye"></i>';
        }
    }

    checkPasswordStrength() {
        const password = document.getElementById('password').value;
        const strengthMeter = document.getElementById('passwordStrength');
        const requirements = {
            length: document.getElementById('reqLength'),
            uppercase: document.getElementById('reqUppercase'),
            lowercase: document.getElementById('reqLowercase'),
            number: document.getElementById('reqNumber')
        };

        // Reset
        if (strengthMeter) {
            strengthMeter.className = 'password-strength-meter';
        }
        
        Object.values(requirements).forEach(req => {
            if (req) {
                req.classList.remove('met');
                const icon = req.querySelector('i');
                if (icon) icon.style.color = '';
            }
        });

        if (!password) return;

        let strength = 0;

        // Check length
        if (password.length >= 8) {
            strength++;
            if (requirements.length) {
                requirements.length.classList.add('met');
                const icon = requirements.length.querySelector('i');
                if (icon) icon.style.color = '#10b981';
            }
        }

        // Check uppercase
        if (/[A-Z]/.test(password)) {
            strength++;
            if (requirements.uppercase) {
                requirements.uppercase.classList.add('met');
                const icon = requirements.uppercase.querySelector('i');
                if (icon) icon.style.color = '#10b981';
            }
        }

        // Check lowercase
        if (/[a-z]/.test(password)) {
            strength++;
            if (requirements.lowercase) {
                requirements.lowercase.classList.add('met');
                const icon = requirements.lowercase.querySelector('i');
                if (icon) icon.style.color = '#10b981';
            }
        }

        // Check number
        if (/[0-9]/.test(password)) {
            strength++;
            if (requirements.number) {
                requirements.number.classList.add('met');
                const icon = requirements.number.querySelector('i');
                if (icon) icon.style.color = '#10b981';
            }
        }

        // Update strength meter
        if (strengthMeter) {
            if (strength === 1) {
                strengthMeter.className = 'password-strength-meter weak';
            } else if (strength === 2) {
                strengthMeter.className = 'password-strength-meter fair';
            } else if (strength === 3) {
                strengthMeter.className = 'password-strength-meter good';
            } else if (strength === 4) {
                strengthMeter.className = 'password-strength-meter strong';
            }
        }

        // Also check password match
        this.checkPasswordMatch();
    }

    checkPasswordMatch() {
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const matchElement = document.getElementById('passwordMatch');

        if (!confirmPassword || !matchElement) {
            if (matchElement) matchElement.style.display = 'none';
            return;
        }

        matchElement.style.display = 'block';

        if (password === confirmPassword) {
            matchElement.innerHTML = '<span style="color: #10b981;"><i class="fas fa-check-circle"></i> Passwords match</span>';
        } else {
            matchElement.innerHTML = '<span style="color: #ef4444;"><i class="fas fa-times-circle"></i> Passwords do not match</span>';
        }
    }

    async handleRegister() {
        const firstName = document.getElementById('firstName').value;
        const lastName = document.getElementById('lastName').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const familyRole = document.getElementById('familyRole').value;
        const termsAccepted = document.getElementById('terms').checked;

        // Validation
        if (!firstName || !lastName || !email || !password || !confirmPassword) {
            this.showError('Please fill in all required fields');
            return;
        }

        if (!termsAccepted) {
            this.showError('You must agree to the terms and conditions');
            return;
        }

        if (password !== confirmPassword) {
            this.showError('Passwords do not match');
            return;
        }

        // Password strength check
        const strength = this.getPasswordStrength(password);
        if (strength < 2) {
            this.showError('Please use a stronger password');
            return;
        }

        if (!familyRole) {
            this.showError('Please select your family relationship');
            return;
        }

        this.showLoading();

        try {
            const userData = {
                name: `${firstName} ${lastName}`,
                email: email,
                password: password,
                role: 'user' // Default role, admin can upgrade later
            };

            const response = await fetch('/api/v1/auth/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            if (response.ok) {
                await response.json();
                this.showNotification(
                    'Join request submitted. An admin must approve your account before you can sign in.',
                    'success'
                );
                setTimeout(() => {
                    window.location.href = '/login';
                }, 1700);
            } else {
                const error = await response.json();
                this.showError(error.detail || 'Registration failed. Please try again.');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showError('Network error. Please try again.');
        } finally {
            this.hideLoading();
        }
    }

    getPasswordStrength(password) {
        let strength = 0;
        if (password.length >= 8) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[a-z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        return strength;
    }

    showError(message) {
        const errorElement = document.getElementById('registerError');
        const messageElement = document.getElementById('errorMessage');
        
        if (errorElement && messageElement) {
            messageElement.textContent = message;
            errorElement.classList.add('active');
            
            // Scroll to error
            errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Auto-hide error after 5 seconds
            setTimeout(() => {
                this.hideError();
            }, 5000);
        }
    }

    hideError() {
        const errorElement = document.getElementById('registerError');
        if (errorElement) {
            errorElement.classList.remove('active');
        }
    }

    showLoading() {
        const submitButton = document.querySelector('#registerForm button[type="submit"]');
        if (submitButton) {
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending Request...';
            submitButton.disabled = true;
        }
    }

    hideLoading() {
        const submitButton = document.querySelector('#registerForm button[type="submit"]');
        if (submitButton) {
            submitButton.innerHTML = '<i class="fas fa-user-plus"></i> Send Join Request';
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
    window.registerApp = new RegisterApp();
});
