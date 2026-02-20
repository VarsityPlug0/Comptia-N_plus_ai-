/**
 * quiz.js – Core quiz engine v3: multi-user, tiers, modes, AI, exam timer
 */

let allQuestions = [];
let currentSession = [];
let currentQuestionIndex = 0;
let userAnswers = {};
let sessionStartIndex = 0;
let sessionSubmitted = false;
let isRedoSession = false;
let currentMode = 'normal';
let examTimer = null;
let examTimeLeft = 0;
// ... (previous variables)
let currentSetIndex = 0; // Tracks which set (level) is currently being played
let questionStartTime = 0; // Tracks when the current question was displayed
let questionTimes = {}; // Stores time taken (in seconds) for each question index
const QUESTIONS_PER_SESSION = 10;

// Tracks which AI response panels are open + their HTML content (per question index)
// { [questionIndex]: { pre: { open: bool, html: string }, post: { open: bool, html: string } } }
let openPanels = {};

// ─── Initialization ───
async function initApp() {
    showView('loading');
    allQuestions = await loadQuestions();
    if (allQuestions.length === 0) {
        document.getElementById('loading').innerHTML =
            '<p class="error-msg">⚠ Failed to load questions. Make sure <code>questions.txt</code> is in the same folder.</p>';
        return;
    }
    document.getElementById('total-available').textContent = allQuestions.length;
    await loadRoadmap();
    refreshHomeStats();
    showView('home');
}

// ─── View Switching ───
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(viewId);
    if (el) el.classList.add('active');
    if (viewId !== 'quiz' && examTimer) { clearInterval(examTimer); examTimer = null; }
}

// ─── Home Screen ───
function refreshHomeStats() {
    const progress = getProgress();
    const streaks = getStreaks();
    const counts = getMasteryCounts(allQuestions);

    document.getElementById('stat-total-quizzes').textContent = progress.totalQuizzes;
    document.getElementById('stat-avg-score').textContent = getAverageScore() + '%';
    document.getElementById('stat-questions-seen').textContent = Math.min(progress.nextStartIndex, allQuestions.length);
    document.getElementById('stat-total-questions').textContent = allQuestions.length;
    document.getElementById('stat-streak').textContent = streaks.current + '🔥';

    // Mastery summary
    const masteryEl = document.getElementById('mastery-summary');
    if (masteryEl) {
        const total = allQuestions.length;
        masteryEl.innerHTML = `
            <div class="mastery-bar-lg">
                <div class="mastery-bar-fill mastery-green" style="width:${(counts.mastered / total) * 100}%" title="${counts.mastered} mastered"></div>
                <div class="mastery-bar-fill mastery-yellow" style="width:${(counts.review / total) * 100}%" title="${counts.review} review"></div>
                <div class="mastery-bar-fill mastery-red" style="width:${(counts.weak / total) * 100}%" title="${counts.weak} weak"></div>
            </div>
            <div class="mastery-labels">
                <span class="mastery-label"><span class="dot dot-green"></span>${counts.mastered} Mastered</span>
                <span class="mastery-label"><span class="dot dot-yellow"></span>${counts.review} Review</span>
                <span class="mastery-label"><span class="dot dot-red"></span>${counts.weak} Weak</span>
                <span class="mastery-label"><span class="dot dot-gray"></span>${counts.unseen} Unseen</span>
            </div>
        `;
    }

    // Free tier usage indicator
    const usageEl = document.getElementById('tier-usage-indicator');
    if (usageEl) {
        if (Subscription.isPro()) {
            usageEl.innerHTML = '<span class="tier-badge tier-pro">⚡ PRO</span> Unlimited access';
            usageEl.className = 'tier-usage pro';
        } else {
            const remaining = Subscription.getRemainingQuestions();
            const usage = Subscription.getUsage();
            const pct = Math.round((usage.questionsThisMonth / usage.limit) * 100);
            usageEl.innerHTML = `
                <span class="tier-badge tier-free">FREE</span>
                <span class="usage-text">${remaining} of ${usage.limit} questions remaining this month</span>
                <div class="usage-bar">
                    <div class="usage-bar-fill ${pct >= 80 ? 'usage-critical' : pct >= 50 ? 'usage-warning' : ''}" style="width:${pct}%"></div>
                </div>
            `;
            usageEl.className = 'tier-usage free';
        }
    }

    const nextStart = progress.nextStartIndex;
    document.getElementById('start-info').textContent =
        nextStart >= allQuestions.length
            ? 'You\'ve completed all questions! Starting over from Question 1.'
            : `Next session starts at Question ${nextStart + 1}`;

    // Update header tier badge
    if (typeof updateHeaderUser === 'function') updateHeaderUser();

    // Show/hide upgrade buttons based on tier
    updateUpgradeButtons();

    // Render Level Grid
    if (typeof renderLevelGrid === 'function') renderLevelGrid();
}

// ═══════════════════════════════════════════════════
// CHECKOUT FLOW
// ═══════════════════════════════════════════════════

const PLANS = {
    monthly: { name: 'Monthly Plan', price: 'R99', period: '/mo', amount: 99 },
    annual: { name: 'Annual Plan', price: 'R699', period: '/yr', amount: 699 },
    lifetime: { name: 'Lifetime Plan', price: 'R1,499', period: ' once', amount: 1499 }
};

let _selectedPlan = 'annual'; // default

/** Open checkout modal (called by all upgrade buttons) */
function handleOneClickUpgrade() {
    openCheckout();
}

function openCheckout() {
    _selectedPlan = 'annual';
    const modal = document.getElementById('checkout-modal');
    if (!modal) return;
    // Show plan step, hide others
    showCheckoutStep('plans');
    // Set usage text if available
    const usageText = document.getElementById('checkout-usage-text');
    if (usageText && !Subscription.isPro()) {
        const usage = Subscription.getUsage();
        usageText.textContent = `You've used ${usage.questionsThisMonth} of ${usage.limit} free questions. Unlock unlimited access!`;
    }
    // Highlight annual by default
    selectPlanCard('annual');
    modal.style.display = 'flex';
}

function closeCheckout() {
    const modal = document.getElementById('checkout-modal');
    if (modal) modal.style.display = 'none';
    // Reset form
    const form = document.getElementById('payment-form');
    if (form) form.reset();
    const errDiv = document.getElementById('payment-error');
    if (errDiv) errDiv.style.display = 'none';
}

function closeCheckoutSuccess() {
    closeCheckout();
    // Refresh entire UI for Pro
    if (typeof updateHeaderUser === 'function') updateHeaderUser();
    refreshHomeStats();
    updateUpgradeButtons();
}

/** Show a specific checkout step, hiding others */
function showCheckoutStep(step) {
    const steps = ['plans', 'payment', 'processing', 'success', 'failed'];
    steps.forEach(s => {
        const el = document.getElementById(`checkout-step-${s}`);
        if (el) el.style.display = (s === step) ? 'block' : 'none';
    });
}

/** Select a plan card */
function selectPlan(planKey) {
    _selectedPlan = planKey;
    selectPlanCard(planKey);
    // Transition to payment
    const plan = PLANS[planKey];
    document.getElementById('payment-plan-label').textContent = plan.name;
    document.getElementById('payment-plan-price').textContent = plan.price + plan.period;
    document.getElementById('pay-btn-amount').textContent = plan.price;
    showCheckoutStep('payment');
}

function selectPlanCard(planKey) {
    document.querySelectorAll('.plan-card').forEach(card => card.classList.remove('selected'));
    const card = document.getElementById(`plan-${planKey}`);
    if (card) card.classList.add('selected');
}

// ─── Card Input Formatting ───
document.addEventListener('DOMContentLoaded', () => {
    // Card number: add spaces every 4 digits
    const cardInput = document.getElementById('pay-card');
    if (cardInput) {
        cardInput.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '').substring(0, 16);
            e.target.value = v.replace(/(.{4})/g, '$1 ').trim();
            // Detect card brand
            const brand = document.getElementById('card-brand-icon');
            if (brand) {
                if (v.startsWith('4')) brand.textContent = '💳 Visa';
                else if (v.startsWith('5')) brand.textContent = '💳 MC';
                else if (v.startsWith('3')) brand.textContent = '💳 Amex';
                else brand.textContent = '💳';
            }
        });
    }

    // Expiry: auto-add slash
    const expiryInput = document.getElementById('pay-expiry');
    if (expiryInput) {
        expiryInput.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '').substring(0, 4);
            if (v.length >= 2) v = v.substring(0, 2) + '/' + v.substring(2);
            e.target.value = v;
        });
    }

    // CVV: digits only
    const cvvInput = document.getElementById('pay-cvv');
    if (cvvInput) {
        cvvInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').substring(0, 4);
        });
    }
});

// ─── Payment Handling ───
function handlePayment(event) {
    event.preventDefault();

    const errDiv = document.getElementById('payment-error');
    errDiv.style.display = 'none';

    // Validate fields
    const name = document.getElementById('pay-name').value.trim();
    const card = document.getElementById('pay-card').value.replace(/\s/g, '');
    const expiry = document.getElementById('pay-expiry').value.trim();
    const cvv = document.getElementById('pay-cvv').value.trim();
    const email = document.getElementById('pay-email').value.trim();

    if (name.length < 2) {
        showPaymentError('Please enter the cardholder name.');
        return false;
    }
    if (card.length < 13 || card.length > 19) {
        showPaymentError('Please enter a valid card number.');
        return false;
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
        showPaymentError('Please enter a valid expiry date (MM/YY).');
        return false;
    }
    // Check expiry is not in the past
    const [mm, yy] = expiry.split('/').map(Number);
    const expDate = new Date(2000 + yy, mm);
    if (expDate < new Date()) {
        showPaymentError('This card has expired. Please use a valid card.');
        return false;
    }
    if (cvv.length < 3) {
        showPaymentError('Please enter a valid CVV.');
        return false;
    }
    if (!email.includes('@')) {
        showPaymentError('Please enter a valid email address.');
        return false;
    }

    // Disable submit button
    const submitBtn = document.getElementById('pay-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing…';

    // Start processing
    processPayment(email);
    return false;
}

function showPaymentError(msg) {
    const errDiv = document.getElementById('payment-error');
    errDiv.textContent = msg;
    errDiv.style.display = 'block';
}

async function processPayment(email) {
    showCheckoutStep('processing');

    const stages = [
        { id: 'proc-verify', text: 'Verifying card details…', delay: 1200 },
        { id: 'proc-charge', text: 'Processing payment…', delay: 1800 },
        { id: 'proc-activate', text: 'Activating Pro features…', delay: 1000 }
    ];

    for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        const el = document.getElementById(stage.id);

        // Set current stage as active
        el.classList.add('active');
        el.querySelector('.proc-icon').textContent = '⏳';
        document.getElementById('processing-status').textContent = stage.text;

        await new Promise(r => setTimeout(r, stage.delay));

        // Mark as done
        el.classList.remove('active');
        el.classList.add('done');
        el.querySelector('.proc-icon').textContent = '✅';
    }

    // Simulate: 95% success rate (card number ending in 0000 = failure for testing)
    const card = document.getElementById('pay-card').value.replace(/\s/g, '');
    const simulateFailure = card.endsWith('0000');

    if (simulateFailure) {
        // Reset stages for next attempt
        resetProcessingStages();
        document.getElementById('failure-reason').textContent =
            'Your card was declined. Please check your details and try again.';
        showCheckoutStep('failed');
        // Re-enable submit
        const submitBtn = document.getElementById('pay-submit-btn');
        submitBtn.disabled = false;
        submitBtn.textContent = `💳 Pay ${PLANS[_selectedPlan].price}`;
        return;
    }

    // SUCCESS — Activate Pro
    Subscription.upgradeNow();

    // Generate reference ID
    const refId = 'NQ-' + Date.now().toString(36).toUpperCase();
    const plan = PLANS[_selectedPlan];

    // Store receipt
    Storage.set('proReceipt', {
        plan: _selectedPlan,
        planName: plan.name,
        amount: plan.price + plan.period,
        email: email,
        refId: refId,
        date: new Date().toISOString()
    });

    // Show success
    document.getElementById('success-plan-name').textContent = `${plan.name} — ${plan.price}${plan.period}`;
    document.getElementById('success-email').textContent = email;
    document.getElementById('success-ref-id').textContent = refId;

    // Reset stages for potential future use
    resetProcessingStages();

    showCheckoutStep('success');

    // Re-enable submit for potential future use
    const submitBtn = document.getElementById('pay-submit-btn');
    submitBtn.disabled = false;
    submitBtn.textContent = `💳 Pay ${plan.price}`;
}

function resetProcessingStages() {
    ['proc-verify', 'proc-charge', 'proc-activate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('active', 'done');
            el.querySelector('.proc-icon').textContent = '⏳';
        }
    });
}

// Legacy compatibility aliases
function showUpgradePrompt() { openCheckout(); }
function closeUpgradeModal() { closeCheckout(); }

/** Show or hide all upgrade buttons based on current tier */
function updateUpgradeButtons() {
    document.querySelectorAll('.upgrade-btn-global').forEach(btn => {
        btn.style.display = Subscription.isPro() ? 'none' : 'flex';
    });
}

// ─── Practice Mode Selection ───
function showModeSelector() {
    const counts = getMasteryCounts(allQuestions);
    const container = document.getElementById('mode-cards');
    let html = '';

    for (const [key, mode] of Object.entries(PRACTICE_MODES)) {
        let count = '';
        if (key === 'weak') count = `(${counts.weak + counts.unseen} questions)`;
        else if (key === 'review') count = `(${counts.review} questions)`;
        else if (key === 'mastered') count = `(${counts.mastered} questions)`;

        const disabled = (key === 'mastered' && counts.mastered === 0) ||
            (key === 'review' && counts.review === 0);

        const isLocked = !Subscription.isModeAllowed(key);

        html += `
            <button class="mode-card ${disabled || isLocked ? 'mode-disabled' : ''} ${isLocked ? 'mode-locked' : ''}"
                onclick="${disabled || isLocked ? (isLocked ? 'showUpgradePrompt()' : '') : `startModeQuiz('${key}')`}"
                ${disabled && !isLocked ? 'disabled' : ''}>
                <span class="mode-icon">${isLocked ? '🔒' : mode.icon}</span>
                <div class="mode-info">
                    <strong>${mode.label}</strong> ${count}
                    ${isLocked ? '<span class="pro-required">PRO</span>' : ''}
                    <p>${mode.description}</p>
                </div>
            </button>
        `;
    }
    container.innerHTML = html;
    showView('mode-select');
}

// ─── Start Quiz (various modes) ───
function startQuiz() {
    currentMode = 'normal';
    isRedoSession = false;
    const progress = getProgress();
    sessionStartIndex = progress.nextStartIndex;

    if (sessionStartIndex >= allQuestions.length) {
        sessionStartIndex = 0;
        progress.nextStartIndex = 0;
        saveProgress(progress);
    }

    currentSession = allQuestions.slice(sessionStartIndex, sessionStartIndex + QUESTIONS_PER_SESSION);
    if (currentSession.length === 0) {
        sessionStartIndex = 0;
        currentSession = allQuestions.slice(0, QUESTIONS_PER_SESSION);
    }

    // Check tier limit
    const check = Subscription.canStartQuiz(currentSession.length);
    if (!check.allowed) {
        showUpgradePrompt();
        return;
    }

    beginSession();
}

function startModeQuiz(mode) {
    // Check mode access
    if (!Subscription.isModeAllowed(mode)) {
        showUpgradePrompt();
        return;
    }

    currentMode = mode;
    isRedoSession = false;

    if (mode === 'normal') { startQuiz(); return; }

    const count = mode === 'exam' ? (getConfig().examQuestionCount || 60) : QUESTIONS_PER_SESSION;
    const questions = getQuestionsForMode(mode, allQuestions, count);

    if (!questions || questions.length === 0) {
        alert('Not enough questions available for this mode.');
        return;
    }

    // Check tier limit
    const check = Subscription.canStartQuiz(questions.length);
    if (!check.allowed) {
        showUpgradePrompt();
        return;
    }

    currentSession = questions;
    sessionStartIndex = 0;

    if (mode === 'exam') {
        beginExamSession();
    } else {
        beginSession();
    }
}

// ... (startModeQuiz logic above)

function startSet(setIndex) {
    const progress = getProgress();
    if (setIndex > progress.unlockedSetIndex) {
        alert("Level Locked! Complete previous levels first.");
        return;
    }
    currentMode = 'level';
    currentSetIndex = setIndex;
    isRedoSession = false;
    sessionStartIndex = setIndex * QUESTIONS_PER_SESSION;

    if (sessionStartIndex >= allQuestions.length) {
        alert("No questions in this set.");
        return;
    }

    currentSession = allQuestions.slice(sessionStartIndex, sessionStartIndex + QUESTIONS_PER_SESSION);

    // Check tier limit
    const check = Subscription.canStartQuiz(currentSession.length);
    if (!check.allowed) {
        showUpgradePrompt();
        return;
    }

    beginSession();
}

function redoSet(startIdx) {
    // ...
    currentMode = 'normal';
    isRedoSession = true;
    sessionStartIndex = startIdx;
    currentSession = allQuestions.slice(sessionStartIndex, sessionStartIndex + QUESTIONS_PER_SESSION);
    if (currentSession.length === 0) return;

    // Check tier limit
    const check = Subscription.canStartQuiz(currentSession.length);
    if (!check.allowed) {
        showUpgradePrompt();
        return;
    }

    beginSession();
}

function startTopicQuiz(topic, filter) {
    currentMode = 'topic';
    isRedoSession = false;
    let pool = allQuestions.filter(q => (q.topic || classifyTopic(q.text)) === topic);

    if (filter === 'weak') {
        const qs = getQuestionStats();
        pool = pool.filter(q => {
            const s = qs[q.id];
            return !s || s.mastery === 'weak';
        });
    }

    if (pool.length === 0) { alert('No questions available for this filter.'); return; }
    currentSession = pool.slice(0, QUESTIONS_PER_SESSION);
    sessionStartIndex = 0;

    // Check tier limit
    const check = Subscription.canStartQuiz(currentSession.length);
    if (!check.allowed) {
        showUpgradePrompt();
        return;
    }

    beginSession();
}

function startSingleQuestion(questionId) {
    const q = allQuestions.find(q => q.id === questionId);
    if (!q) return;
    currentMode = 'single';
    isRedoSession = false;
    currentSession = [q];
    sessionStartIndex = 0;

    // Check tier limit
    const check = Subscription.canStartQuiz(1);
    if (!check.allowed) {
        showUpgradePrompt();
        return;
    }

    beginSession();
}

function beginSession() {
    currentQuestionIndex = 0;
    userAnswers = {};
    questionTimes = {};
    openPanels = {};
    sessionSubmitted = false;
    document.getElementById('exam-timer-bar').style.display = 'none';
    renderQuestion();
    showView('quiz');
}

function beginExamSession() {
    currentQuestionIndex = 0;
    userAnswers = {};
    questionTimes = {};
    openPanels = {};
    sessionSubmitted = false;

    const config = getConfig();
    examTimeLeft = (config.examDuration || 90) * 60;
    document.getElementById('exam-timer-bar').style.display = 'flex';
    updateTimerDisplay();

    examTimer = setInterval(() => {
        examTimeLeft--;
        updateTimerDisplay();
        if (examTimeLeft <= 0) {
            clearInterval(examTimer);
            examTimer = null;
            submitQuiz();
        }
    }, 1000);

    renderQuestion();
    showView('quiz');
}

function updateTimerDisplay() {
    const mins = Math.floor(examTimeLeft / 60);
    const secs = examTimeLeft % 60;
    const el = document.getElementById('timer-display');
    el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    if (examTimeLeft <= 300) el.classList.add('timer-warning');
    else el.classList.remove('timer-warning');
}

// ─── Render Current Question ───
function renderQuestion() {
    const q = currentSession[currentQuestionIndex];
    const container = document.getElementById('question-container');

    const progressPercent = ((currentQuestionIndex + 1) / currentSession.length) * 100;
    document.getElementById('progress-fill').style.width = progressPercent + '%';
    document.getElementById('progress-text').textContent =
        `Question ${currentQuestionIndex + 1} of ${currentSession.length}`;

    const multiHint = q.isMultiSelect
        ? `<span class="multi-hint">Select all that apply (${q.correctAnswers.length} answers)</span>`
        : '';

    const topicBadge = q.topic ? `<span class="topic-badge">${escapeHtml(q.topic)}</span>` : '';

    let html = `
        <div class="question-header">
            <span class="question-number">Q${q.id}</span>
            ${multiHint}
            ${topicBadge}
        </div>
        <p class="question-text">${escapeHtml(q.text)}</p>
    `;

    // AI Explain button (before answering)
    if (!sessionSubmitted) {
        html += `
            <div class="ai-explain-section" id="ai-pre-${currentQuestionIndex}">
                <button class="btn btn-ai btn-sm" onclick="handlePreExplain(${currentQuestionIndex})">
                    💡 Explain to Beginner
                </button>
                <div class="ai-response" id="ai-pre-response-${currentQuestionIndex}" style="display:none"></div>
            </div>
        `;
    }

    html += '<div class="options-list">';

    const selected = userAnswers[currentQuestionIndex] || [];

    for (const opt of q.options) {
        const isSelected = selected.includes(opt.letter);
        let optionClass = 'option';
        let icon = '';

        if (isSelected) optionClass += ' selected';

        if (sessionSubmitted && currentMode !== 'exam') {
            const isCorrect = q.correctAnswers.includes(opt.letter);
            if (isCorrect) { optionClass += ' correct'; icon = '<span class="opt-icon">✓</span>'; }
            else if (isSelected && !isCorrect) { optionClass += ' incorrect'; icon = '<span class="opt-icon">✗</span>'; }
        }

        html += `
            <button class="${optionClass}" onclick="selectOption('${opt.letter}')"
                ${sessionSubmitted ? 'disabled' : ''}>
                <span class="opt-letter">${opt.letter}</span>
                <span class="opt-text">${escapeHtml(opt.text)}</span>
                ${icon}
            </button>
        `;
    }

    html += '</div>';

    // Show explanation after submission (not in exam mode until results)
    if (sessionSubmitted && currentMode !== 'exam' && q.explanation) {
        const wasCorrect = arraysEqual(selected.sort(), [...q.correctAnswers].sort());
        html += `
            <div class="explanation ${wasCorrect ? 'explanation-correct' : 'explanation-wrong'}">
                <strong>${wasCorrect ? '✓ Correct!' : '✗ Incorrect – Answer: ' + q.correctAnswers.join(', ')}</strong>
                <p>${escapeHtml(q.explanation)}</p>
                <button class="btn btn-ai btn-sm" onclick="handlePostExplain(${currentQuestionIndex})" style="margin-top:10px">
                    💡 Simplify Explanation
                </button>
                <div class="ai-response" id="ai-post-response-${currentQuestionIndex}" style="display:none"></div>
            </div>
        `;
    }

    // Save state of whichever ai-response divs are currently in the DOM.
    // We MUST scan by class (not by currentQuestionIndex) because next/prevQuestion()
    // increments the index BEFORE calling renderQuestion(), so currentQuestionIndex
    // already points to the NEW question — the old elements are still in the DOM.
    document.querySelectorAll('.ai-response').forEach(div => {
        const preMatch = div.id.match(/^ai-pre-response-(\d+)$/);
        const postMatch = div.id.match(/^ai-post-response-(\d+)$/);
        if (preMatch) {
            const i = parseInt(preMatch[1]);
            if (!openPanels[i]) openPanels[i] = {};
            openPanels[i].pre = { open: div.style.display !== 'none', html: div.innerHTML };
        }
        if (postMatch) {
            const i = parseInt(postMatch[1]);
            if (!openPanels[i]) openPanels[i] = {};
            openPanels[i].post = { open: div.style.display !== 'none', html: div.innerHTML };
        }
    });

    container.innerHTML = html;

    // Restore panel state for the newly rendered question
    const _saved = openPanels[currentQuestionIndex];
    if (_saved) {
        const _preDiv = document.getElementById(`ai-pre-response-${currentQuestionIndex}`);
        const _postDiv = document.getElementById(`ai-post-response-${currentQuestionIndex}`);
        if (_preDiv && _saved.pre && _saved.pre.open) { _preDiv.style.display = 'block'; _preDiv.innerHTML = _saved.pre.html; }
        if (_postDiv && _saved.post && _saved.post.open) { _postDiv.style.display = 'block'; _postDiv.innerHTML = _saved.post.html; }
    }

    updateNavButtons();
    questionStartTime = Date.now(); // Start timer for this question
}

// ─── AI Handlers ───
async function handlePreExplain(idx) {
    const q = currentSession[idx];
    const responseDiv = document.getElementById(`ai-pre-response-${idx}`);
    responseDiv.style.display = 'block';
    responseDiv.innerHTML = '<div class="ai-thinking"><span class="ai-thinking-dots"><span></span><span></span><span></span></span> Thinking…</div>';

    const config = getConfig();
    const modeToggle = `<div class="mode-toggle" style="margin-bottom:8px">
        <small>Mode: <button class="btn-link ${config.explanationMode === 'beginner' ? 'active-mode' : ''}" onclick="setExplainMode('beginner', ${idx}, 'pre')">Beginner</button> |
        <button class="btn-link ${config.explanationMode === 'technical' ? 'active-mode' : ''}" onclick="setExplainMode('technical', ${idx}, 'pre')">Technical</button></small>
    </div>`;

    const result = await aiExplainQuestion(q.text, q.options, q.explanation, q.correctAnswers);
    responseDiv.innerHTML = modeToggle + `<div class="ai-text">${formatAiText(result.text)}</div>`;
    // Persist content so it survives navigation
    if (!openPanels[idx]) openPanels[idx] = {};
    openPanels[idx].pre = { open: true, html: responseDiv.innerHTML };
}

async function handlePostExplain(idx) {
    const q = currentSession[idx];
    const responseDiv = document.getElementById(`ai-post-response-${idx}`);
    responseDiv.style.display = 'block';
    responseDiv.innerHTML = '<div class="ai-thinking"><span class="ai-thinking-dots"><span></span><span></span><span></span></span> Analyzing…</div>';

    const config = getConfig();
    const modeToggle = `<div class="mode-toggle" style="margin-bottom:8px">
        <small>Mode: <button class="btn-link ${config.explanationMode === 'beginner' ? 'active-mode' : ''}" onclick="setExplainMode('beginner', ${idx}, 'post')">Beginner</button> |
        <button class="btn-link ${config.explanationMode === 'technical' ? 'active-mode' : ''}" onclick="setExplainMode('technical', ${idx}, 'post')">Technical</button></small>
    </div>`;

    const result = await aiExplainAnswer(q.text, q.correctAnswers.join(', '), q.explanation);
    responseDiv.innerHTML = modeToggle + `<div class="ai-text">${formatAiText(result.text)}</div>`;
    // Persist content so it survives navigation
    if (!openPanels[idx]) openPanels[idx] = {};
    openPanels[idx].post = { open: true, html: responseDiv.innerHTML };
}

function setExplainMode(mode, idx, type) {
    const config = getConfig();
    config.explanationMode = mode;
    saveConfig(config);
    // Clear session cache for this question and re-explain
    const q = currentSession[idx];
    const cacheKey = (type === 'pre' ? 'pre-' : 'post-') + config.explanationMode + '-' + q.text.substring(0, 80);
    delete _sessionCache[cacheKey];
    if (type === 'pre') handlePreExplain(idx);
    else handlePostExplain(idx);
}

function formatAiText(text) {
    let formatted = escapeHtml(text);
    // Convert **bold** to <strong>
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Convert newlines to <br>
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
}

// ─── Option Selection ───
function selectOption(letter) {
    if (sessionSubmitted) return;
    const q = currentSession[currentQuestionIndex];

    if (!userAnswers[currentQuestionIndex]) userAnswers[currentQuestionIndex] = [];

    if (q.isMultiSelect) {
        const idx = userAnswers[currentQuestionIndex].indexOf(letter);
        if (idx === -1) userAnswers[currentQuestionIndex].push(letter);
        else userAnswers[currentQuestionIndex].splice(idx, 1);
    } else {
        userAnswers[currentQuestionIndex] = [letter];
    }
    renderQuestion();
}

// ─── Navigation ───
function prevQuestion() {
    recordTime();
    if (currentQuestionIndex > 0) { currentQuestionIndex--; renderQuestion(); }
}
function nextQuestion() {
    recordTime();
    if (currentQuestionIndex < currentSession.length - 1) { currentQuestionIndex++; renderQuestion(); }
}

function recordTime() {
    if (!questionStartTime) return;
    const elapsed = (Date.now() - questionStartTime) / 1000;
    if (!questionTimes[currentQuestionIndex]) questionTimes[currentQuestionIndex] = 0;
    questionTimes[currentQuestionIndex] += elapsed;
    questionStartTime = 0; // Reset
}

function updateNavButtons() {
    document.getElementById('btn-prev').disabled = currentQuestionIndex === 0;
    document.getElementById('btn-next').disabled = currentQuestionIndex >= currentSession.length - 1;

    const submitBtn = document.getElementById('btn-submit');
    if (sessionSubmitted) {
        submitBtn.style.display = 'none';
        document.getElementById('btn-results').style.display = 'inline-flex';
    } else {
        submitBtn.style.display = 'inline-flex';
        document.getElementById('btn-results').style.display = 'none';
        const allAnswered = currentSession.every((_, i) => userAnswers[i] && userAnswers[i].length > 0);
        submitBtn.disabled = !allAnswered;
    }
}

// ─── Submit Quiz ───
function submitQuiz() {
    if (sessionSubmitted) return;
    recordTime(); // Record time for the last question
    if (examTimer) { clearInterval(examTimer); examTimer = null; }

    const allAnswered = currentSession.every((_, i) => userAnswers[i] && userAnswers[i].length > 0);
    if (!allAnswered && currentMode !== 'exam') {
        alert('Please answer all questions before submitting.');
        return;
    }

    sessionSubmitted = true;

    let score = 0;
    const incorrectList = [];
    const resultsList = [];

    for (let i = 0; i < currentSession.length; i++) {
        const q = currentSession[i];
        const selected = (userAnswers[i] || []).sort();
        const correct = [...q.correctAnswers].sort();
        const isCorrect = arraysEqual(selected, correct);
        const userAnswer = selected.join(', ') || 'No answer';

        resultsList.push({
            questionId: q.id,
            isCorrect,
            userAnswer: userAnswer,
            correctAnswer: q.correctAnswers.join(', '),
            selectedOptions: [...(userAnswers[i] || [])],
            correctOptions: [...q.correctAnswers],
            timeTaken: questionTimes[i] || 0
        });

        if (isCorrect) {
            score++;
        } else {
            incorrectList.push({
                questionId: q.id,
                questionText: q.text,
                userAnswer: userAnswer,
                correctAnswer: q.correctAnswers.join(', ')
            });
        }
    }

    // Record usage for free tier tracking
    Subscription.recordUsage(currentSession.length);

    recordSession({
        startIndex: sessionStartIndex,
        endIndex: sessionStartIndex + currentSession.length,
        score,
        total: currentSession.length,
        results: resultsList,
        incorrect: incorrectList,
        mode: currentMode,
        isRedo: isRedoSession,
        setIndex: currentSetIndex
    });

    // Level Progression Logic
    let levelUnlocked = false;
    if (currentMode === 'level' && !isRedoSession) {
        const pct = (score / currentSession.length) * 100;
        if (pct >= 70) { // Pass threshold
            const progress = getProgress();
            if (currentSetIndex === progress.unlockedSetIndex) {
                progress.unlockedSetIndex++;
                saveProgress(progress);
                levelUnlocked = true;
            }
        }
    }

    showResults(score, currentSession.length, incorrectList, levelUnlocked);
}

// ─── Results Screen ───
function showResults(score, total, incorrectList, levelUnlocked) {
    prepareResults(score, total, incorrectList, levelUnlocked);
    showView('results');
}

function prepareResults(score, total, incorrectList, levelUnlocked) {
    const pct = Math.round((score / total) * 100);
    document.getElementById('results-score').textContent = `${score} / ${total}`;
    document.getElementById('results-pct').textContent = `${pct}%`;
    document.getElementById('results-mode-badge').textContent =
        currentMode === 'level' ? `Level ${currentSetIndex + 1}` :
            (PRACTICE_MODES[currentMode] ? PRACTICE_MODES[currentMode].label : 'Normal');

    // Show Level Up Message
    const resultsContainer = document.querySelector('#results .card');
    // Remove old unlock message if exists
    const existingMsg = document.getElementById('level-unlock-msg');
    if (existingMsg) existingMsg.remove();

    if (levelUnlocked) {
        const msg = document.createElement('div');
        msg.id = 'level-unlock-msg';
        msg.className = 'level-unlock-banner';
        msg.innerHTML = `<h3>🎉 Level Unlocked!</h3><p>You've passed Level ${currentSetIndex + 1}. Level ${currentSetIndex + 2} is now available.</p>`;
        resultsContainer.prepend(msg);
    }

    // ... (rest of prepareResults logic)
    const ring = document.getElementById('score-ring-progress');
    const circumference = 2 * Math.PI * 54;
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference - (pct / 100) * circumference;

    let color = '#ef4444';
    if (pct >= 80) color = '#22c55e';
    else if (pct >= 60) color = '#f59e0b';
    ring.style.stroke = color;

    // ... streaks ...
    const streaks = getStreaks();
    document.getElementById('results-streak').textContent = `${streaks.current}🔥`;

    // ... usage ...
    const usageNote = document.getElementById('results-usage-note');
    if (usageNote) {
        if (!Subscription.isPro()) {
            const remaining = Subscription.getRemainingQuestions();
            if (remaining <= 0) {
                usageNote.innerHTML = '<span class="usage-exhausted">⚠️ Free tier limit reached. <a href="#" onclick="showUpgradePrompt(); return false;">Upgrade to Pro</a> for unlimited access.</span>';
            } else {
                usageNote.innerHTML = `<span class="usage-note">${remaining} free questions remaining this month</span>`;
            }
            usageNote.style.display = 'block';
        } else {
            usageNote.style.display = 'none';
        }
    }

    // ... incorrect list → Full Accordion Review ...
    const incorrectContainer = document.getElementById('results-incorrect');
    const resultsList = [];
    for (let i = 0; i < currentSession.length; i++) {
        const q = currentSession[i];
        const selected = (userAnswers[i] || []).sort();
        const correct = [...q.correctAnswers].sort();
        const isCorrect = arraysEqual(selected, correct);
        resultsList.push({
            questionId: q.id,
            isCorrect,
            userAnswer: selected.join(', ') || 'No answer',
            correctAnswer: q.correctAnswers.join(', '),
            selectedOptions: [...(userAnswers[i] || [])],
            correctOptions: [...q.correctAnswers],
            timeTaken: questionTimes[i] || 0
        });
    }

    incorrectContainer.innerHTML = renderAccordionReview(resultsList, 'results');
}

/**
 * Renders a full accordion review from a resultsList array.
 * @param {Array} results - Array of {questionId, isCorrect, userAnswer, correctAnswer, selectedOptions, correctOptions, timeTaken}
 * @param {string} prefix - Unique prefix for IDs (e.g. 'results' or 'hist-3')
 * @returns {string} HTML string
 */
function renderAccordionReview(results, prefix) {
    if (!results || results.length === 0) return '<p class="empty-msg">No questions to review.</p>';

    const totalCorrect = results.filter(r => r.isCorrect).length;
    const totalQuestions = results.length;
    const pctScore = Math.round((totalCorrect / totalQuestions) * 100);

    let html = `
        <div class="review-summary-bar">
            <span><strong>${totalCorrect}</strong> / ${totalQuestions} correct (${pctScore}%)</span>
            <div class="review-controls">
                <button class="btn btn-secondary btn-sm" onclick="expandAllAccordion('${prefix}'); event.stopPropagation();">Expand All</button>
                <button class="btn btn-secondary btn-sm" onclick="collapseAllAccordion('${prefix}'); event.stopPropagation();">Collapse All</button>
            </div>
        </div>
    `;

    for (let idx = 0; idx < results.length; idx++) {
        const r = results[idx];
        const q = allQuestions.find(item => item.id === r.questionId);
        if (!q) continue;

        const statusIcon = r.isCorrect ? '✓' : '✗';
        const statusClass = r.isCorrect ? 'correct' : 'incorrect';
        const timeStr = r.timeTaken ? `⏱ ${r.timeTaken.toFixed(1)}s` : '';

        // Build options HTML
        let optionsHtml = '';
        if (q.options && q.options.length > 0) {
            for (const opt of q.options) {
                const wasSelected = (r.selectedOptions || []).includes(opt.letter);
                const isCorrectOpt = (r.correctOptions || q.correctAnswers).includes(opt.letter);

                let optClass = 'review-option';
                let badge = '';
                if (wasSelected && isCorrectOpt) {
                    optClass += ' review-opt-correct-selected';
                    badge = '<span class="review-opt-badge correct-badge">✓ Your Answer (Correct)</span>';
                } else if (wasSelected && !isCorrectOpt) {
                    optClass += ' review-opt-incorrect-selected';
                    badge = '<span class="review-opt-badge incorrect-badge">✗ Your Answer</span>';
                } else if (isCorrectOpt) {
                    optClass += ' review-opt-correct';
                    badge = '<span class="review-opt-badge correct-badge">✓ Correct Answer</span>';
                }

                optionsHtml += `
                    <div class="${optClass}">
                        <span class="review-opt-letter">${opt.letter}</span>
                        <span class="review-opt-text">${escapeHtml(opt.text)}</span>
                        ${badge}
                    </div>
                `;
            }
        }

        html += `
            <div class="review-accordion-item" data-prefix="${prefix}">
                <div class="review-accordion-header" onclick="toggleAccordionItem(this); event.stopPropagation();">
                    <div class="review-accordion-left">
                        <span class="review-status-icon ${statusClass}">${statusIcon}</span>
                        <span class="review-q-num">Q${idx + 1}</span>
                    </div>
                    <div class="review-accordion-mid">
                        <span class="review-summary-selected">You: <strong>${escapeHtml(r.userAnswer)}</strong></span>
                        <span class="review-summary-correct">Correct: <strong>${escapeHtml(r.correctAnswer)}</strong></span>
                    </div>
                    <div class="review-accordion-right">
                        <span class="review-result-label ${statusClass}">${r.isCorrect ? 'Correct' : 'Incorrect'}</span>
                        ${timeStr ? `<span class="review-time">${timeStr}</span>` : ''}
                        <span class="accordion-chevron">▼</span>
                    </div>
                </div>
                <div class="review-accordion-body" style="display:none">
                    <div class="review-q-text">${escapeHtml(q.text)}</div>
                    <div class="review-options-list">
                        ${optionsHtml}
                    </div>
                    <div class="review-meta">
                        <span>Selected Answer: <strong>${escapeHtml(r.userAnswer)}</strong></span>
                        <span>Correct Answer: <strong>${escapeHtml(r.correctAnswer)}</strong></span>
                        <span>Result: <strong class="${statusClass}">${r.isCorrect ? 'Correct' : 'Incorrect'}</strong></span>
                    </div>
                    <div class="review-actions">
                        <button class="btn btn-ai btn-sm" onclick="handlePostExplainInHistory(${r.questionId}, '${prefix}'); event.stopPropagation();">💡 Explain</button>
                        <div id="ai-hist-${prefix}-${r.questionId}" style="display:none; margin-top:8px" class="ai-response"></div>
                    </div>
                </div>
            </div>
        `;
    }

    return html;
}

function toggleAccordionItem(headerEl) {
    const body = headerEl.nextElementSibling;
    const chevron = headerEl.querySelector('.accordion-chevron');
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.textContent = isOpen ? '▼' : '▲';
    headerEl.classList.toggle('open', !isOpen);
}

function expandAllAccordion(prefix) {
    document.querySelectorAll(`.review-accordion-item[data-prefix="${prefix}"] .review-accordion-body`).forEach(body => {
        body.style.display = 'block';
    });
    document.querySelectorAll(`.review-accordion-item[data-prefix="${prefix}"] .accordion-chevron`).forEach(ch => {
        ch.textContent = '▲';
    });
    document.querySelectorAll(`.review-accordion-item[data-prefix="${prefix}"] .review-accordion-header`).forEach(h => {
        h.classList.add('open');
    });
}

function collapseAllAccordion(prefix) {
    document.querySelectorAll(`.review-accordion-item[data-prefix="${prefix}"] .review-accordion-body`).forEach(body => {
        body.style.display = 'none';
    });
    document.querySelectorAll(`.review-accordion-item[data-prefix="${prefix}"] .accordion-chevron`).forEach(ch => {
        ch.textContent = '▼';
    });
    document.querySelectorAll(`.review-accordion-item[data-prefix="${prefix}"] .review-accordion-header`).forEach(h => {
        h.classList.remove('open');
    });
}

function showResults() { showView('results'); }

function goHome() { refreshHomeStats(); showView('home'); }

// ─── Dashboard ───
function showDashboard() {
    const progress = getProgress();
    const streaks = getStreaks();
    refreshHomeStats();

    // Overall Progress: Sets completed vs total
    const totalSets = Math.ceil(allQuestions.length / QUESTIONS_PER_SESSION);
    const completedSets = progress.unlockedSetIndex || 0;
    const setPct = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;
    document.getElementById('dash-set-progress').textContent = `Set ${completedSets} / ${totalSets}`;
    document.getElementById('dash-set-bar').style.width = setPct + '%';

    // Compact stats
    document.getElementById('dash-total').textContent = progress.totalQuizzes;
    document.getElementById('dash-avg').textContent = getAverageScore() + '%';
    document.getElementById('dash-streak-current').textContent = streaks.current;
    document.getElementById('dash-streak-best').textContent = streaks.best;

    const best = getBestSession();
    const worst = getWorstSession();
    document.getElementById('dash-best').textContent = best ? `${best.score}/${best.total}` : '—';
    document.getElementById('dash-worst').textContent = worst ? `${worst.score}/${worst.total}` : '—';

    // Latest Session Summary
    const latestCard = document.getElementById('dash-latest-session');
    const latestContent = document.getElementById('dash-latest-content');
    if (progress.sessions.length > 0) {
        const latest = progress.sessions[progress.sessions.length - 1];
        const latestPct = Math.round((latest.score / latest.total) * 100);
        const latestClass = getScoreClass(latest.score, latest.total);
        // Calculate avg time if available
        let avgTimeStr = '';
        if (latest.results && latest.results.length > 0) {
            const timesArr = latest.results.filter(r => r.timeTaken > 0).map(r => r.timeTaken);
            if (timesArr.length > 0) {
                const avgTime = timesArr.reduce((a, b) => a + b, 0) / timesArr.length;
                avgTimeStr = `<div class="dash-latest-stat"><span class="dash-latest-stat-label">Avg Time</span><span class="dash-latest-stat-val">${avgTime.toFixed(1)}s</span></div>`;
            }
        }
        latestContent.innerHTML = `
            <div class="dash-latest-grid">
                <div class="dash-latest-stat">
                    <span class="dash-latest-stat-label">Score</span>
                    <span class="dash-latest-stat-val ${latestClass}">${latest.score}/${latest.total}</span>
                </div>
                <div class="dash-latest-stat">
                    <span class="dash-latest-stat-label">Accuracy</span>
                    <span class="dash-latest-stat-val"><span class="score-badge ${latestClass}">${latestPct}%</span></span>
                </div>
                <div class="dash-latest-stat">
                    <span class="dash-latest-stat-label">Questions</span>
                    <span class="dash-latest-stat-val">Q${latest.startQ}–Q${latest.endQ}</span>
                </div>
                <div class="dash-latest-stat">
                    <span class="dash-latest-stat-label">Mode</span>
                    <span class="dash-latest-stat-val"><span class="mode-badge-sm">${latest.mode || 'normal'}</span></span>
                </div>
                ${avgTimeStr}
            </div>
        `;
        latestCard.style.display = 'block';
    } else {
        latestCard.style.display = 'none';
    }

    // Topic Mastery
    renderTopicStats();

    // Session History Cards
    const historyContainer = document.getElementById('session-history-cards');
    if (progress.sessions.length === 0) {
        historyContainer.innerHTML = '<p class="empty-msg">No sessions yet</p>';
    } else {
        historyContainer.innerHTML = progress.sessions.slice().reverse().map(s => {
            const pct = Math.round((s.score / s.total) * 100);
            const scoreClass = getScoreClass(s.score, s.total);
            const hasDetails = s.results && s.results.length > 0;

            return `
                <div class="session-card">
                    <div class="session-card-header" onclick="toggleSessionCardDetails(this.closest('.session-card'))" style="cursor:pointer">
                        <div class="session-card-left">
                            <span class="session-card-id">#${s.id}</span>
                            <span class="session-card-date">${s.date}</span>
                        </div>
                        <div class="session-card-right">
                            <span class="score-badge ${scoreClass}">${pct}%</span>
                            <span class="session-card-score">${s.score}/${s.total}</span>
                        </div>
                    </div>
                    <div class="session-card-meta" onclick="toggleSessionCardDetails(this.closest('.session-card'))" style="cursor:pointer">
                        <span>Q${s.startQ}–Q${s.endQ}</span>
                        <span class="mode-badge-sm">${s.mode || 'normal'}</span>
                        <button class="btn btn-secondary btn-sm" onclick="redoSet(${s.startQ - 1}); event.stopPropagation();">🔄</button>
                        ${hasDetails ? '<span class="session-card-expand">▼</span>' : ''}
                    </div>
                    ${hasDetails ? `<div class="session-card-details" style="display:none">${renderAccordionReview(s.results, 'hist-' + s.id)}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    // Incorrect log
    const incorrectDiv = document.getElementById('dash-incorrect-list');
    if (progress.incorrectLog.length === 0) {
        incorrectDiv.innerHTML = '<p class="empty-msg">No incorrect answers recorded yet.</p>';
    } else {
        let html = '';
        const recent = progress.incorrectLog.slice().reverse().slice(0, 20);
        for (const item of recent) {
            html += `
                <div class="review-item">
                    <div class="review-q"><strong>Q${item.questionId}:</strong> ${escapeHtml(item.questionText)}</div>
                    <div class="review-answers">
                        <span class="your-answer">You: ${item.userAnswer}</span>
                        <span class="correct-answer">Correct: ${item.correctAnswer}</span>
                    </div>
                </div>
            `;
        }
        incorrectDiv.innerHTML = html;
    }

    showView('dashboard');
}

// ─── Dashboard Section Toggle ───
function toggleDashSection(sectionId) {
    const section = document.getElementById(sectionId);
    const chevron = document.getElementById('chevron-' + sectionId);
    if (!section) return;
    const isOpen = section.style.display !== 'none';
    section.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.textContent = isOpen ? '▼' : '▲';
}

function toggleSessionCardDetails(cardEl) {
    const details = cardEl.querySelector('.session-card-details');
    const chevron = cardEl.querySelector('.session-card-expand');
    if (!details) return;
    const isOpen = details.style.display !== 'none';
    details.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.textContent = isOpen ? '▼' : '▲';
}

function renderTopicStats() {
    const topicStats = getTopicStats(allQuestions);
    const container = document.getElementById('topic-stats-container');
    if (!container) return;

    let html = '';
    const sorted = Object.entries(topicStats).sort((a, b) => b[1].total - a[1].total);

    for (const [topic, stats] of sorted) {
        const pct = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
        const unseen = stats.total - stats.mastered - stats.review - stats.weak;
        const greenW = stats.total > 0 ? (stats.mastered / stats.total) * 100 : 0;
        const yellowW = stats.total > 0 ? (stats.review / stats.total) * 100 : 0;
        const redW = stats.total > 0 ? (stats.weak / stats.total) * 100 : 0;

        html += `
            <div class="topic-card" onclick="toggleTopicCard(this)">
                <div class="topic-card-header">
                    <div class="topic-card-left">
                        <span class="topic-name">${escapeHtml(topic)}</span>
                        <span class="topic-frac">${stats.mastered}/${stats.total}</span>
                    </div>
                    <div class="topic-card-right">
                        <span class="topic-pct-badge" style="color:${pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'}">${pct}%</span>
                        <span class="topic-chevron">▼</span>
                    </div>
                </div>
                <div class="topic-bar-mini">
                    <div class="topic-bar-seg mastery-green" style="width:${greenW}%"></div>
                    <div class="topic-bar-seg mastery-yellow" style="width:${yellowW}%"></div>
                    <div class="topic-bar-seg mastery-red" style="width:${redW}%"></div>
                </div>
                <div class="topic-card-body" style="display:none">
                    <div class="topic-detail-grid">
                        <div class="topic-detail-item green"><span class="topic-detail-count">${stats.mastered}</span><span class="topic-detail-label">🟢 Mastered</span></div>
                        <div class="topic-detail-item yellow"><span class="topic-detail-count">${stats.review}</span><span class="topic-detail-label">🟡 Review</span></div>
                        <div class="topic-detail-item red"><span class="topic-detail-count">${stats.weak}</span><span class="topic-detail-label">🔴 Weak</span></div>
                        <div class="topic-detail-item gray"><span class="topic-detail-count">${unseen}</span><span class="topic-detail-label">⬜ Unseen</span></div>
                    </div>
                </div>
            </div>
        `;
    }

    container.innerHTML = html || '<p class="empty-msg">No topic data yet.</p>';
}

function toggleTopicCard(cardEl) {
    const body = cardEl.querySelector('.topic-card-body');
    const chevron = cardEl.querySelector('.topic-chevron');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.textContent = isOpen ? '▼' : '▲';
}

function getScoreClass(score, total) {
    const pct = (score / total) * 100;
    if (pct >= 80) return 'score-high';
    if (pct >= 60) return 'score-mid';
    return 'score-low';
}

// ─── Settings ───
function showSettings() {
    const config = getConfig();
    document.getElementById('input-api-key').value = config.apiKey || '';
    document.getElementById('input-api-endpoint').value = config.apiEndpoint || '';
    document.getElementById('input-api-model').value = config.apiModel || '';
    document.getElementById('input-exam-duration').value = config.examDuration || 90;
    document.getElementById('input-exam-count').value = config.examQuestionCount || 60;
    document.getElementById(`mode-${config.explanationMode}`).checked = true;

    // Show current tier and Pro Key field
    const tierDisplay = document.getElementById('settings-tier-display');
    if (tierDisplay) {
        if (Subscription.isPro()) {
            tierDisplay.innerHTML = '<span class="tier-badge tier-pro">⚡ PRO</span> Full access enabled';
        } else {
            tierDisplay.innerHTML = '<span class="tier-badge tier-free">FREE</span> Limited access';
        }
    }

    const proKeyInput = document.getElementById('input-pro-key');
    if (proKeyInput) proKeyInput.value = '';

    showView('settings');
}

function saveSettings() {
    const config = {
        apiKey: document.getElementById('input-api-key').value.trim(),
        apiEndpoint: document.getElementById('input-api-endpoint').value.trim(),
        apiModel: document.getElementById('input-api-model').value.trim(),
        explanationMode: document.querySelector('input[name="explainMode"]:checked').value,
        examDuration: parseInt(document.getElementById('input-exam-duration').value) || 90,
        examQuestionCount: parseInt(document.getElementById('input-exam-count').value) || 60
    };
    saveConfig(config);
    goHome();
}

async function handleActivatePro() {
    const proKeyInput = document.getElementById('input-pro-key');
    const proKeyError = document.getElementById('pro-key-error');

    if (!proKeyInput || !proKeyInput.value.trim()) {
        if (proKeyError) {
            proKeyError.textContent = 'Please enter a Pro Key.';
            proKeyError.style.display = 'block';
        }
        return;
    }

    const result = await Subscription.activatePro(proKeyInput.value);
    if (result.success) {
        proKeyInput.value = '';
        if (proKeyError) proKeyError.style.display = 'none';
        showSettings(); // Re-render to show Pro badge
        if (typeof updateHeaderUser === 'function') updateHeaderUser();
        alert('🎉 Pro activated! You now have unlimited access.');
    } else {
        if (proKeyError) {
            proKeyError.textContent = result.error;
            proKeyError.style.display = 'block';
        }
    }
}


function confirmResetProgress() {
    if (confirm('Are you sure you want to reset ALL progress? This cannot be undone.')) {
        resetProgress();
        refreshHomeStats();
        showDashboard();
    }
}

// ─── Utilities ───
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; }
    return true;
}

// ... (previous code)

function renderLevelGrid() {
    const container = document.getElementById('level-grid');
    if (!container) return;

    const progress = getProgress();
    const totalSets = Math.ceil(allQuestions.length / QUESTIONS_PER_SESSION);
    let html = '';

    for (let i = 0; i < totalSets; i++) {
        let statusClass = '';
        let statusIcon = '';
        let onClick = `startSet(${i})`;
        let title = `Level ${i + 1}`;

        if (i < progress.unlockedSetIndex) {
            statusClass = 'completed';
            statusIcon = '✅';
            title += ' (Completed)';
        } else if (i === progress.unlockedSetIndex) {
            statusClass = 'current';
            statusIcon = '▶';
            title += ' (Current)';
        } else {
            statusClass = 'locked';
            statusIcon = '🔒';
            onClick = '';
            title += ' (Locked)';
        }

        html += `
            <div class="level-card ${statusClass}" onclick="${onClick}" title="${title}">
                <span class="level-number">${i + 1}</span>
                <span class="level-status">${statusIcon}</span>
            </div>
        `;
    }
    container.innerHTML = html;
}

// ... (previous code)

async function handlePostExplainInHistory(qId, sessionId) {
    const q = allQuestions.find(i => i.id === qId);
    if (!q) return;

    const responseDiv = document.getElementById(`ai-hist-${sessionId}-${qId}`);
    responseDiv.style.display = 'block';

    if (responseDiv.innerHTML.trim() !== '') {
        // Already loaded, just toggle
        // responseDiv.style.display = responseDiv.style.display === 'none' ? 'block' : 'none'; 
        return;
    }

    responseDiv.innerHTML = '<div class="ai-thinking"><span class="ai-thinking-dots"><span></span><span></span><span></span></span> Analyzing...</div>';

    const result = await aiExplainAnswer(q.text, q.correctAnswers.join(', '), q.explanation);
    responseDiv.innerHTML = `<div class="ai-text">${formatAiText(result.text)}</div>`;

}


// ─── Boot ───
document.addEventListener('DOMContentLoaded', checkAuth);
