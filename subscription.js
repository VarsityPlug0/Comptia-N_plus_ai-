/**
 * subscription.js – Free/Pro tier management with usage tracking
 *
 * Free tier: 20 questions per calendar month, cached AI only, limited modes.
 * Pro tier: Unlimited questions, live AI, all modes.
 */

const Subscription = (function () {
    const USAGE_KEY = 'subscription_usage';
    const TIER_KEY = 'subscription_tier';
    const FREE_MONTHLY_LIMIT = 20;

    // SHA-256 hash of the Pro activation key
    const PRO_KEY_HASH = '2a5abf58caebb752ee2d12eaef3e7256a1dbc3cf59e3a7c0c3e8e3cc2f9a8c4b';

    // ─── Tier Detection ───

    function getTier() {
        const tier = Storage.get(TIER_KEY);
        return tier === 'pro' ? 'pro' : 'free';
    }

    function isPro() {
        return getTier() === 'pro';
    }

    // ─── Pro Activation ───

    async function activatePro(key) {
        const hash = await _sha256(key.trim());
        if (hash === PRO_KEY_HASH) {
            Storage.set(TIER_KEY, 'pro');
            return { success: true };
        }
        return { success: false, error: 'Invalid Pro Key' };
    }

    function deactivatePro() {
        Storage.set(TIER_KEY, 'free');
    }

    /** One-click upgrade – immediately enables Pro */
    function upgradeNow() {
        Storage.set(TIER_KEY, 'pro');
        return { success: true };
    }

    // ─── Usage Tracking ───

    function _getCurrentMonth() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    function getUsage() {
        const data = Storage.get(USAGE_KEY) || {};
        const currentMonth = _getCurrentMonth();

        // Auto-reset if month changed
        if (data.month !== currentMonth) {
            return { questionsThisMonth: 0, limit: FREE_MONTHLY_LIMIT, month: currentMonth };
        }
        return {
            questionsThisMonth: data.questionsThisMonth || 0,
            limit: FREE_MONTHLY_LIMIT,
            month: currentMonth
        };
    }

    function getRemainingQuestions() {
        if (isPro()) return Infinity;
        const usage = getUsage();
        return Math.max(0, usage.limit - usage.questionsThisMonth);
    }

    function canStartQuiz(count) {
        if (isPro()) return { allowed: true };
        const remaining = getRemainingQuestions();
        if (remaining <= 0) {
            return { allowed: false, remaining: 0 };
        }
        if (count > remaining) {
            return { allowed: false, remaining: remaining };
        }
        return { allowed: true, remaining: remaining - count };
    }

    function recordUsage(count) {
        if (isPro()) return; // Pro users don't track usage
        const usage = getUsage();
        usage.questionsThisMonth += count;
        Storage.set(USAGE_KEY, { month: usage.month, questionsThisMonth: usage.questionsThisMonth });
    }

    // ─── Mode Access ───

    const FREE_MODES = ['normal', 'weak'];

    function isModeAllowed(mode) {
        if (isPro()) return true;
        return FREE_MODES.includes(mode);
    }

    function getAllowedModes() {
        if (isPro()) return null; // null = all allowed
        return FREE_MODES;
    }

    // ─── Utility ───

    async function _sha256(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    return {
        getTier,
        isPro,
        activatePro,
        deactivatePro,
        upgradeNow,
        getUsage,
        getRemainingQuestions,
        canStartQuiz,
        recordUsage,
        isModeAllowed,
        getAllowedModes,
        FREE_MONTHLY_LIMIT
    };
})();
