/**
 * auth.js – Simple client-side authentication
 */

// Hashed credentials (SHA-256) for basic obfuscation
const AUTH_USERS = [
    {
        usernameHash: '8a9bcfd64d1f64e1a13d6f29bfa5b18c0e7bca6df3e28cc41c5e2e5fcb063587', // BevanPass
        passwordHash: 'a1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1'  // placeholder
    }
];

const SESSION_KEY = 'netquiz_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// Simple hash function using Web Crypto API
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

// Authenticate user
async function authenticate(username, password) {
    const uHash = await sha256(username);
    const pHash = await sha256(password);

    // Check against known credentials
    const validUser = (uHash === await sha256('BevanPass'));
    const validPass = (pHash === await sha256('ShadowMan31@'));

    if (validUser && validPass) {
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
