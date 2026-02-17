/**
 * storage.js – Per-user namespaced storage abstraction
 * 
 * All user data keys are prefixed with `nq_<userId>_`.
 * Global keys (user registry, etc.) use `nq_global_` prefix.
 * Designed to be swappable with a server-backed implementation later.
 */

const Storage = (function () {
    const PREFIX = 'nq_';
    const GLOBAL_PREFIX = 'nq_global_';
    const CURRENT_USER_KEY = 'nq_currentUser';

    let _currentUserId = null;

    function init() {
        const raw = localStorage.getItem(CURRENT_USER_KEY);
        if (raw) {
            try { _currentUserId = JSON.parse(raw); } catch (e) { _currentUserId = null; }
        }
    }

    function _userPrefix() {
        if (!_currentUserId) throw new Error('Storage: No user set. Call Storage.setCurrentUser() first.');
        return PREFIX + _currentUserId + '_';
    }

    // ─── User-Scoped API ───

    function get(key) {
        const raw = localStorage.getItem(_userPrefix() + key);
        if (raw === null) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    }

    function set(key, value) {
        localStorage.setItem(_userPrefix() + key, JSON.stringify(value));
    }

    function remove(key) {
        localStorage.removeItem(_userPrefix() + key);
    }

    function clearAllUserData() {
        const prefix = _userPrefix();
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(prefix)) toRemove.push(k);
        }
        toRemove.forEach(k => localStorage.removeItem(k));
    }

    // ─── Current User Management ───

    function setCurrentUser(userId) {
        _currentUserId = userId;
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userId));
    }

    function getCurrentUser() {
        return _currentUserId;
    }

    function clearCurrentUser() {
        _currentUserId = null;
        localStorage.removeItem(CURRENT_USER_KEY);
    }

    // ─── Global (non-user-scoped) API ───

    const global = {
        get(key) {
            const raw = localStorage.getItem(GLOBAL_PREFIX + key);
            if (raw === null) return null;
            try { return JSON.parse(raw); } catch (e) { return null; }
        },
        set(key, value) {
            localStorage.setItem(GLOBAL_PREFIX + key, JSON.stringify(value));
        },
        remove(key) {
            localStorage.removeItem(GLOBAL_PREFIX + key);
        }
    };

    // Initialize on load
    init();

    return {
        get,
        set,
        remove,
        clearAllUserData,
        setCurrentUser,
        getCurrentUser,
        clearCurrentUser,
        global
    };
})();
