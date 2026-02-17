/**
 * auth.js – Multi-user authentication with registration
 * 
 * Users are stored in a global registry (localStorage).
 * Each user has a SHA-256 hashed username and password.
 * Sessions are stored per-user with 7-day expiry.
 */

const USERS_REGISTRY_KEY = 'users';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── SHA-256 Hashing ───
async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── User Registry ───
function getUserRegistry() {
    return Storage.global.get(USERS_REGISTRY_KEY) || [];
}

function saveUserRegistry(registry) {
    Storage.global.set(USERS_REGISTRY_KEY, registry);
}

// ─── Registration ───
async function registerUser(username, password) {
    const trimmed = username.trim();
    if (!trimmed || !password) {
        return { success: false, error: 'Username and password are required.' };
    }
    if (trimmed.length < 3) {
        return { success: false, error: 'Username must be at least 3 characters.' };
    }
    if (password.length < 4) {
        return { success: false, error: 'Password must be at least 4 characters.' };
    }

    const userId = trimmed.toLowerCase();
    const registry = getUserRegistry();

    // Check for duplicate username
    if (registry.some(u => u.userId === userId)) {
        return { success: false, error: 'Username already taken. Choose another.' };
    }

    const passHash = await sha256(password);

    registry.push({
        userId: userId,
        displayName: trimmed,
        passwordHash: passHash,
        createdAt: new Date().toISOString()
    });

    saveUserRegistry(registry);
    return { success: true, userId: userId };
}

// ─── Authentication ───
async function authenticate(username, password) {
    const userId = username.trim().toLowerCase();
    const registry = getUserRegistry();
    const user = registry.find(u => u.userId === userId);

    if (!user) {
        return { success: false, error: 'Invalid username or password.' };
    }

    const passHash = await sha256(password);
    if (passHash !== user.passwordHash) {
        return { success: false, error: 'Invalid username or password.' };
    }

    // Set up session
    Storage.setCurrentUser(userId);
    Storage.set('session', {
        userId: userId,
        displayName: user.displayName,
        timestamp: Date.now()
    });

    return { success: true, displayName: user.displayName };
}

// ─── Session Management ───
function isLoggedIn() {
    const userId = Storage.getCurrentUser();
    if (!userId) return false;

    const session = Storage.get('session');
    if (!session) {
        Storage.clearCurrentUser();
        return false;
    }

    if (Date.now() - session.timestamp > SESSION_DURATION) {
        Storage.remove('session');
        Storage.clearCurrentUser();
        return false;
    }

    return true;
}

function getLoggedInUser() {
    const session = Storage.get('session');
    return session ? session.displayName : null;
}

function getLoggedInUserId() {
    return Storage.getCurrentUser();
}

// ─── Logout ───
function logout() {
    Storage.remove('session');
    Storage.clearCurrentUser();
    showView('login');
    document.querySelector('.app-header').style.display = 'none';
    showLoginForm();
}

// ─── UI Handlers ───
function showLoginForm() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('register-error').style.display = 'none';
    // Clear fields
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
}

function showRegisterForm() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('register-error').style.display = 'none';
    // Clear fields
    document.getElementById('reg-username').value = '';
    document.getElementById('reg-password').value = '';
    document.getElementById('reg-confirm').value = '';
}

async function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    if (!username || !password) {
        errorEl.textContent = 'Please enter both username and password.';
        errorEl.style.display = 'block';
        return;
    }

    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    errorEl.style.display = 'none';

    const result = await authenticate(username, password);

    if (result.success) {
        document.querySelector('.app-header').style.display = '';
        updateHeaderUser();
        initApp();
    } else {
        errorEl.textContent = result.error;
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

async function handleRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const errorEl = document.getElementById('register-error');

    if (!username || !password || !confirm) {
        errorEl.textContent = 'Please fill in all fields.';
        errorEl.style.display = 'block';
        return;
    }

    if (password !== confirm) {
        errorEl.textContent = 'Passwords do not match.';
        errorEl.style.display = 'block';
        return;
    }

    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    btn.textContent = 'Creating account…';
    errorEl.style.display = 'none';

    const result = await registerUser(username, password);

    if (result.success) {
        // Auto-login after registration
        const loginResult = await authenticate(username, password);
        if (loginResult.success) {
            document.querySelector('.app-header').style.display = '';
            updateHeaderUser();
            initApp();
        }
    } else {
        errorEl.textContent = result.error;
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Create Account';
    }
}

function updateHeaderUser() {
    const displayName = getLoggedInUser();
    const tier = Subscription.getTier();
    const userEl = document.getElementById('header-user-info');
    if (userEl && displayName) {
        const tierBadge = tier === 'pro'
            ? '<span class="tier-badge tier-pro">⚡ PRO</span>'
            : '<span class="tier-badge tier-free">FREE</span>';
        userEl.innerHTML = `${escapeHtml(displayName)} ${tierBadge}`;
    }
}

// ─── Boot Check ───
function checkAuth() {
    if (isLoggedIn()) {
        document.querySelector('.app-header').style.display = '';
        updateHeaderUser();
        initApp();
    } else {
        document.querySelector('.app-header').style.display = 'none';
        showView('login');
        showLoginForm();

        // Enter key support for login
        document.getElementById('login-password').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') handleLogin();
        });
        document.getElementById('login-username').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') document.getElementById('login-password').focus();
        });

        // Enter key support for registration
        document.getElementById('reg-confirm').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') handleRegister();
        });
    }
}
