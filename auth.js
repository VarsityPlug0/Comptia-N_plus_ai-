/**
 * auth.js – Client-side authentication (credentials stored as SHA-256 hashes only)
 */

// Pre-computed SHA-256 hashes – no plaintext credentials in source
const VALID_USER_HASH = 'da6e1484e704bfd56dd16271a38e2323143b78148b058709bad45661a77af552';
const VALID_PASS_HASH = 'c150ae8a4184deb79af5cb2a8fd975a92524c4a83b4c9df9bf4fce27b09e12c3';

const SESSION_KEY = 'netquiz_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// SHA-256 hash using Web Crypto API
async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Check if user is logged in
function isLoggedIn() {
    const session = localStorage.getItem(SESSION_KEY);
    if (!session) return false;
    try {
        const data = JSON.parse(session);
        if (Date.now() - data.timestamp > SESSION_DURATION) {
            localStorage.removeItem(SESSION_KEY);
            return false;
        }
        return true;
    } catch (e) {
        return false;
    }
}

function getLoggedInUser() {
    const session = localStorage.getItem(SESSION_KEY);
    if (!session) return null;
    try {
        return JSON.parse(session).username;
    } catch (e) {
        return null;
    }
}

// Authenticate user – compares input hashes against stored hashes
async function authenticate(username, password) {
    const uHash = await sha256(username);
    const pHash = await sha256(password);

    if (uHash === VALID_USER_HASH && pHash === VALID_PASS_HASH) {
        const session = {
            username: username,
            timestamp: Date.now()
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return { success: true };
    }
    return { success: false, error: 'Invalid username or password' };
}

// Logout
function logout() {
    localStorage.removeItem(SESSION_KEY);
    showView('login');
    document.querySelector('.app-header').style.display = 'none';
}

// Handle login form
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
        initApp();
    } else {
        errorEl.textContent = result.error;
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

// Boot check – called before initApp
function checkAuth() {
    if (isLoggedIn()) {
        document.querySelector('.app-header').style.display = '';
        initApp();
    } else {
        document.querySelector('.app-header').style.display = 'none';
        showView('login');
        // Enter key support
        document.getElementById('login-password').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') handleLogin();
        });
        document.getElementById('login-username').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') document.getElementById('login-password').focus();
        });
    }
}
