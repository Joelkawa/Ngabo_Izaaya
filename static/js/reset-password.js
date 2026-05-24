class ResetPasswordApp {
    constructor() {
        this.token = new URLSearchParams(window.location.search).get('token') || '';
        this.isTokenValid = false;
        this.initialize();
    }

    initialize() {
        this.setupEventListeners();
        this.validateResetToken();
    }

    setupEventListeners() {
        document.getElementById('toggleNewPassword')?.addEventListener('click', () => {
            this.togglePasswordVisibility('newPassword', 'toggleNewPassword');
        });

        document.getElementById('toggleConfirmNewPassword')?.addEventListener('click', () => {
            this.togglePasswordVisibility('confirmNewPassword', 'toggleConfirmNewPassword');
        });

        document.getElementById('resetPasswordForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            await this.handleResetPassword();
        });
    }

    togglePasswordVisibility(inputId, toggleId) {
        const input = document.getElementById(inputId);
        const toggleButton = document.getElementById(toggleId);
        if (!input || !toggleButton) {
            return;
        }

        if (input.type === 'password') {
            input.type = 'text';
            toggleButton.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            input.type = 'password';
            toggleButton.innerHTML = '<i class="fas fa-eye"></i>';
        }
    }

    async validateResetToken() {
        const statusElement = document.getElementById('resetPasswordStatus');
        const submitButton = document.getElementById('resetSubmitButton');

        if (!this.token) {
            if (statusElement) {
                statusElement.textContent = 'This reset link is missing or incomplete.';
            }
            this.showError('This password reset link is invalid. Please request a new one.');
            if (submitButton) {
                submitButton.disabled = true;
            }
            return;
        }

        try {
            const response = await fetch(
                `/api/v1/auth/password-reset/validate?token=${encodeURIComponent(this.token)}`,
                { headers: { Accept: 'application/json' } }
            );

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.detail || 'This reset link is invalid or has expired.');
            }

            this.isTokenValid = true;
            if (statusElement) {
                statusElement.textContent = 'Your reset link is valid. Enter your new password below.';
            }
            if (submitButton) {
                submitButton.disabled = false;
            }
        } catch (error) {
            if (statusElement) {
                statusElement.textContent = 'This reset link is no longer valid.';
            }
            this.showError(error.message || 'This reset link is invalid or has expired.');
            if (submitButton) {
                submitButton.disabled = true;
            }
        }
    }

    async handleResetPassword() {
        if (!this.isTokenValid) {
            this.showError('This reset link is invalid or has expired. Please request a new one.');
            return;
        }

        const newPassword = document.getElementById('newPassword')?.value || '';
        const confirmPassword = document.getElementById('confirmNewPassword')?.value || '';

        if (!newPassword || !confirmPassword) {
            this.showError('Please fill in both password fields.');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showError('The two passwords do not match.');
            return;
        }

        this.setSubmitting(true);
        this.hideMessages();

        try {
            const response = await fetch('/api/v1/auth/password-reset/confirm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    token: this.token,
                    new_password: newPassword,
                }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.detail || 'Unable to reset your password.');
            }

            this.showSuccess(payload.message || 'Password updated successfully.');
            this.showNotification('Password updated. Redirecting to login...', 'success');
            document.getElementById('resetPasswordForm')?.reset();
            this.isTokenValid = false;
            document.getElementById('resetSubmitButton')?.setAttribute('disabled', 'true');

            window.setTimeout(() => {
                window.location.href = '/login';
            }, 1800);
        } catch (error) {
            console.error('Password reset error:', error);
            this.showError(error.message || 'Unable to reset your password.');
        } finally {
            this.setSubmitting(false);
        }
    }

    setSubmitting(isSubmitting) {
        const submitButton = document.getElementById('resetSubmitButton');
        if (!submitButton) {
            return;
        }

        submitButton.disabled = isSubmitting || !this.isTokenValid;
        submitButton.innerHTML = isSubmitting
            ? '<i class="fas fa-spinner fa-spin"></i> Updating Password...'
            : '<i class="fas fa-key"></i> Update Password';
    }

    hideMessages() {
        document.getElementById('resetPasswordError')?.classList.remove('active');
        document.getElementById('resetPasswordSuccess')?.classList.remove('active');
    }

    showError(message) {
        this.hideMessages();
        const container = document.getElementById('resetPasswordError');
        const messageElement = document.getElementById('resetPasswordErrorMessage');
        if (container && messageElement) {
            messageElement.textContent = message;
            container.classList.add('active');
        }
    }

    showSuccess(message) {
        this.hideMessages();
        const container = document.getElementById('resetPasswordSuccess');
        const messageElement = document.getElementById('resetPasswordSuccessMessage');
        if (container && messageElement) {
            messageElement.textContent = message;
            container.classList.add('active');
        }
    }

    showNotification(message, type = 'info') {
        if (window.familyApp && typeof window.familyApp.showNotification === 'function') {
            window.familyApp.showNotification(message, type);
        } else {
            alert(`${type.toUpperCase()}: ${message}`);
        }
    }
}


document.addEventListener('DOMContentLoaded', () => {
    window.resetPasswordApp = new ResetPasswordApp();
});
