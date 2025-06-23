// ===== DOM ELEMENTS =====
const loginForm = document.getElementById('loginForm');
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const logoutBtn = document.getElementById('logoutBtn');
const paymentForm = document.getElementById('paymentForm');
const customerPhoneInput = document.getElementById('customerPhone');
const filterNameInput = document.getElementById('filterName');
const filterStatusSelect = document.getElementById('filterStatus');

// ===== LOGIN FUNCTIONALITY =====
loginForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    const loginBtn = loginForm.querySelector('.btn-login');
    const originalText = loginBtn.textContent;
    loginBtn.textContent = 'Logging in...';
    loginBtn.disabled = true;

    fetch("http://127.0.0.1:8000/api/token/", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email: username, password })
    })
    .then(res => {
        if (!res.ok) throw new Error("Invalid credentials");
        return res.json();
    })
    .then(data => {
        localStorage.setItem("access_token", data.access);
        localStorage.setItem("username", username);

        loginSection.style.display = 'none';
        dashboardSection.style.display = 'flex';
        updateUserInfo(username);
        showNotification('Login successful! Welcome to your dashboard.', 'success');
        fetchAndRenderPayments();
    })
    .catch(err => {
        showNotification("Login failed: " + err.message, "error");
    })
    .finally(() => {
        loginBtn.textContent = originalText;
        loginBtn.disabled = false;
    });
});

// ===== LOGOUT FUNCTIONALITY =====
logoutBtn.addEventListener('click', function() {
    if (confirm('Are you sure you want to logout?')) {
        dashboardSection.style.display = 'none';
        loginSection.style.display = 'flex';
        loginForm.reset();
        clearNotifications();
        localStorage.removeItem("access_token");
        localStorage.removeItem("username");
        showNotification('You have been logged out successfully.', 'info');
    }
});

// ===== PAYMENT FORM FUNCTIONALITY =====
paymentForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const customerName = document.getElementById('customerName').value.trim();
    const customerPhone = document.getElementById('customerPhone').value.trim();
    const paymentAmount = document.getElementById('paymentAmount').value.trim();
    const paymentReference = document.getElementById('paymentReference').value.trim();

    if (!validatePaymentForm(customerName, customerPhone, paymentAmount, paymentReference)) {
        return;
    }

    const submitBtn = paymentForm.querySelector('.btn-primary');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    submitBtn.disabled = true;

    fetch("http://127.0.0.1:8000/api/mpesa/stk-push/", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("access_token")}`
        },
        body: JSON.stringify({
            customer_name: customerName, 
            phone_number: customerPhone,
            amount: paymentAmount,
            reference: paymentReference
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.message.includes("success")) {
            showNotification(`Payment request sent successfully to ${customerPhone} for KES ${formatAmount(paymentAmount)}.`, 'success');
            paymentForm.reset();
            fetchAndRenderPayments();
        } else {
            throw new Error(data.message);
        }
    })
    .catch(err => {
        showNotification("Payment failed: " + err.message, "error");
    })
    .finally(() => {
        submitBtn.innerHTML = originalHTML;
        submitBtn.disabled = false;
    });
});

// ===== FETCH TRANSACTIONS FROM BACKEND =====
function fetchAndRenderPayments() {
    const token = localStorage.getItem('access_token');
    if (!token) return showNotification("No token found. Please log in again.", "error");

    fetch("http://127.0.0.1:8000/api/mpesa/payments/", {
        headers: {
            "Authorization": `Bearer ${token}`
        }
    })
    .then(res => {
        if (!res.ok) throw new Error("Failed to fetch payments.");
        return res.json();
    })
    .then(data => {
        const tableBody = document.querySelector('.payments-table tbody');
        tableBody.innerHTML = '';

        data.forEach(txn => {
            const row = document.createElement('tr');
            const date = new Date(txn.created_at).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric'
            });
            const customerName = txn.customer_name || 'Unknown';

            row.innerHTML = `
                <td>${customerName}</td>
                <td>${txn.phone_number}</td>
                <td>KES ${formatAmount(txn.amount)}</td>
                <td>${txn.reference}</td>
                <td>${date}</td>
                <td><span class="payment-status status-${txn.status.toLowerCase()}">${txn.status}</span></td>
            `;
            tableBody.appendChild(row);
        });

        filterTransactions();
    })
    .catch(err => {
        showNotification("Error loading transactions: " + err.message, "error");
    });
}

setInterval(() => {
    fetchAndRenderPayments();
}, 30000);

// ===== FILTER FUNCTIONALITY =====
filterNameInput.addEventListener('input', filterTransactions);
filterStatusSelect.addEventListener('change', filterTransactions);

function filterTransactions() {
    const nameFilter = filterNameInput.value.toLowerCase();
    const statusFilter = filterStatusSelect.value;

    const rows = document.querySelectorAll('.payments-table tbody tr');
    rows.forEach(row => {
        const name = row.children[0].textContent.toLowerCase();
        const status = row.children[5].textContent.trim();

        const matchesName = name.includes(nameFilter);
        const matchesStatus = !statusFilter || status === statusFilter;

        row.style.display = (matchesName && matchesStatus) ? '' : 'none';
    });
}

// ===== PHONE NUMBER FORMATTING =====
customerPhoneInput.addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');

    if (value.length > 0 && !value.startsWith('254')) {
        if (value.startsWith('0')) {
            value = '254' + value.substring(1);
        } else if (value.startsWith('7') || value.startsWith('1')) {
            value = '254' + value;
        }
    }

    if (value.length > 12) {
        value = value.substring(0, 12);
    }

    e.target.value = value;
    e.target.style.borderColor = value.match(/^254[0-9]{9}$/) ? 'var(--success)' : '#ddd';
});

// ===== UTILITY FUNCTIONS =====
function validatePaymentForm(name, phone, amount, reference) {
    if (!name || name.length < 2) {
        showNotification('Please enter a valid customer name (at least 2 characters)', 'error');
        return false;
    }
    if (!phone || !phone.match(/^254[0-9]{9}$/)) {
        showNotification('Please enter a valid Kenyan phone number (254XXXXXXXXX)', 'error');
        return false;
    }
    if (!amount || isNaN(amount) || parseFloat(amount) < 1 || parseFloat(amount) > 150000) {
        showNotification('Please enter a valid amount (1 - 150,000)', 'error');
        return false;
    }
    if (!reference || reference.length < 3) {
        showNotification('Please enter a valid reference (at least 3 characters)', 'error');
        return false;
    }
    return true;
}

function updateUserInfo(username) {
    const userDetails = document.querySelector('.user-details');
    const userAvatar = document.querySelector('.user-avatar');
    const initials = username.substring(0, 2).toUpperCase();
    userAvatar.textContent = initials;
    userDetails.querySelector('h2').textContent = username;
    userDetails.querySelector('p').textContent = `${username.toLowerCase()}@business.com`;
}

function formatAmount(amount) {
    return parseFloat(amount).toLocaleString('en-KE');
}

function showNotification(message, type = 'info') {
    clearNotifications();
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">
                ${type === 'success' ? '<i class="fas fa-check-circle"></i>' :
                  type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' :
                  '<i class="fas fa-info-circle"></i>'}
            </span>
            <span class="notification-message">${message}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    document.body.appendChild(notification);
}

function clearNotifications() {
    document.querySelectorAll('.notification').forEach(el => el.remove());
}

