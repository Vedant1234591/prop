// Main JavaScript file for Propload

// DOM Ready
document.addEventListener('DOMContentLoaded', function() {
    initializeComponents();
    setupEventListeners();
    setupFormValidations();
});

// Initialize all components
function initializeComponents() {
    // Initialize tooltips
    initTooltips();
    
    // Initialize file upload previews
    initFileUploadPreviews();
    
    // Initialize real-time updates on dashboard pages
    if (window.location.pathname.includes('/dashboard')) {
        initRealTimeUpdates();
    }
    
    // Initialize charts if they exist
    initCharts();
}

// Setup global event listeners
function setupEventListeners() {
    // Flash message auto-dismiss
    setupFlashMessages();
    
    // Form submissions
    setupFormHandlers();
    
    // Mobile menu toggle
    setupMobileMenu();
}

// Tooltip functionality
function initTooltips() {
    const tooltipElements = document.querySelectorAll('[data-tooltip]');
    
    tooltipElements.forEach(element => {
        element.addEventListener('mouseenter', showTooltip);
        element.addEventListener('mouseleave', hideTooltip);
    });
}

function showTooltip(event) {
    const tooltipText = this.getAttribute('data-tooltip');
    const tooltip = document.createElement('div');
    
    tooltip.className = 'absolute z-50 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg max-w-xs';
    tooltip.textContent = tooltipText;
    tooltip.id = 'current-tooltip';
    
    document.body.appendChild(tooltip);
    
    const rect = this.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // Position tooltip above element
    tooltip.style.top = `${rect.top - tooltipRect.height - 10}px`;
    tooltip.style.left = `${rect.left + (rect.width - tooltipRect.width) / 2}px`;
}

function hideTooltip() {
    const tooltip = document.getElementById('current-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// File upload preview functionality
function initFileUploadPreviews() {
    const fileInputs = document.querySelectorAll('input[type="file"][data-preview]');
    
    fileInputs.forEach(input => {
        input.addEventListener('change', function(e) {
            const previewContainer = document.getElementById(this.getAttribute('data-preview'));
            if (!previewContainer) return;
            
            previewContainer.innerHTML = '';
            
            if (this.files && this.files.length > 0) {
                Array.from(this.files).forEach(file => {
                    if (file.type.startsWith('image/')) {
                        previewImageFile(file, previewContainer);
                    } else {
                        previewDocumentFile(file, previewContainer);
                    }
                });
            }
        });
    });
}

function previewImageFile(file, container) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const preview = document.createElement('div');
        preview.className = 'relative inline-block m-2';
        
        preview.innerHTML = `
            <img src="${e.target.result}" class="w-20 h-20 object-cover rounded border">
            <span class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs cursor-pointer" onclick="this.parentElement.remove()">×</span>
        `;
        
        container.appendChild(preview);
    };
    
    reader.readAsDataURL(file);
}

function previewDocumentFile(file, container) {
    const preview = document.createElement('div');
    preview.className = 'flex items-center space-x-2 bg-gray-100 p-3 rounded m-2';
    
    preview.innerHTML = `
        <i class="fas fa-file-pdf text-red-500"></i>
        <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-700 truncate">${file.name}</p>
            <p class="text-xs text-gray-500">${(file.size / 1024).toFixed(1)} KB</p>
        </div>
        <button type="button" class="text-red-500 hover:text-red-700" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(preview);
}

// Flash message handling
function setupFlashMessages() {
    const flashMessages = document.querySelectorAll('.alert');
    
    flashMessages.forEach(message => {
        // Auto-dismiss success messages after 5 seconds
        if (message.classList.contains('alert-success')) {
            setTimeout(() => {
                message.style.opacity = '0';
                setTimeout(() => message.remove(), 300);
            }, 5000);
        }
        
        // Add close button functionality
        const closeButton = message.querySelector('button');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                message.style.opacity = '0';
                setTimeout(() => message.remove(), 300);
            });
        }
    });
}

// Form validation and handling
function setupFormValidations() {
    const forms = document.querySelectorAll('form[data-validate]');
    
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            if (!validateForm(this)) {
                e.preventDefault();
            }
        });
    });
}

function validateForm(form) {
    let isValid = true;
    const requiredFields = form.querySelectorAll('[required]');
    
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            markFieldInvalid(field, 'This field is required');
            isValid = false;
        } else {
            markFieldValid(field);
        }
    });
    
    // Email validation
    const emailFields = form.querySelectorAll('input[type="email"]');
    emailFields.forEach(field => {
        if (field.value && !isValidEmail(field.value)) {
            markFieldInvalid(field, 'Please enter a valid email address');
            isValid = false;
        }
    });
    
    // Password confirmation validation
    const password = form.querySelector('input[name="password"]');
    const confirmPassword = form.querySelector('input[name="confirmPassword"]');
    
    if (password && confirmPassword && password.value !== confirmPassword.value) {
        markFieldInvalid(confirmPassword, 'Passwords do not match');
        isValid = false;
    }
    
    return isValid;
}

function markFieldInvalid(field, message) {
    field.classList.add('border-red-500');
    field.classList.remove('border-gray-300');
    
    // Remove existing error message
    const existingError = field.parentNode.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
    
    // Add error message
    const errorElement = document.createElement('p');
    errorElement.className = 'field-error text-red-500 text-xs mt-1';
    errorElement.textContent = message;
    
    field.parentNode.appendChild(errorElement);
}

function markFieldValid(field) {
    field.classList.remove('border-red-500');
    field.classList.add('border-gray-300');
    
    // Remove error message
    const existingError = field.parentNode.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Mobile menu functionality
function setupMobileMenu() {
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', (e) => {
        if (mobileMenu && !mobileMenu.contains(e.target) && !mobileMenuButton.contains(e.target)) {
            mobileMenu.classList.add('hidden');
        }
    });
}

// Form submission handlers
function setupFormHandlers() {
    // Loading states for forms
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
        form.addEventListener('submit', function() {
            const submitButton = this.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Processing...';
            }
        });
    });
}

// Chart initialization
function initCharts() {
    // This would initialize any charts on the page
    // Implementation depends on specific chart requirements
}

// Real-time updates initialization
function initRealTimeUpdates() {
    // Check if real-time updates script is loaded
    if (typeof RealTimeUpdates !== 'undefined') {
        const realTimeUpdates = new RealTimeUpdates();
        realTimeUpdates.start();
    }
}

// Utility functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function formatDate(dateString) {
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

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

// Export for use in other scripts
window.Propload = {
    utils: {
        formatCurrency,
        formatDate,
        debounce
    }
};