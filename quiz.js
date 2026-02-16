/**
 * quiz.js – Core quiz engine v2: modes, AI, reinforcement, exam timer
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
const QUESTIONS_PER_SESSION = 10;

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

    const nextStart = progress.nextStartIndex;
    document.getElementById('start-info').textContent =
        nextStart >= allQuestions.length
            ? 'You\'ve completed all questions! Starting over from Question 1.'
            : `Next session starts at Question ${nextStart + 1}`;
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

        html += `
            <button class="mode-card ${disabled ? 'mode-disabled' : ''}" onclick="${disabled ? '' : `startModeQuiz('${key}')`}"
                ${disabled ? 'disabled' : ''}>
                <span class="mode-icon">${mode.icon}</span>
                <div class="mode-info">
                    <strong>${mode.label}</strong> ${count}
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

    beginSession();
}

function startModeQuiz(mode) {
    currentMode = mode;
    isRedoSession = false;

    if (mode === 'normal') { startQuiz(); return; }

    const count = mode === 'exam' ? (getConfig().examQuestionCount || 60) : QUESTIONS_PER_SESSION;
    const questions = getQuestionsForMode(mode, allQuestions, count);

    if (!questions || questions.length === 0) {
        alert('Not enough questions available for this mode.');
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

function redoSet(startIdx) {
    currentMode = 'normal';
    isRedoSession = true;
    sessionStartIndex = startIdx;
    currentSession = allQuestions.slice(sessionStartIndex, sessionStartIndex + QUESTIONS_PER_SESSION);
    if (currentSession.length === 0) return;
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
    beginSession();
}

function startSingleQuestion(questionId) {
    const q = allQuestions.find(q => q.id === questionId);
    if (!q) return;
    currentMode = 'single';
    isRedoSession = false;
    currentSession = [q];
    sessionStartIndex = 0;
    beginSession();
}

function beginSession() {
    currentQuestionIndex = 0;
    userAnswers = {};
    sessionSubmitted = false;
    document.getElementById('exam-timer-bar').style.display = 'none';
    renderQuestion();
    showView('quiz');
}

function beginExamSession() {
    currentQuestionIndex = 0;
    userAnswers = {};
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

    // Topic badge
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

    container.innerHTML = html;
    updateNavButtons();
}

// ─── AI Handlers ───
async function handlePreExplain(idx) {
    const q = currentSession[idx];
    const responseDiv = document.getElementById(`ai-pre-response-${idx}`);
    responseDiv.style.display = 'block';
    responseDiv.innerHTML = '<span class="ai-loading">🔄 Thinking...</span>';

    const config = getConfig();
    const modeToggle = `<div class="mode-toggle" style="margin-bottom:8px">
        <small>Mode: <button class="btn-link ${config.explanationMode === 'beginner' ? 'active-mode' : ''}" onclick="setExplainMode('beginner', ${idx}, 'pre')">Beginner</button> |
        <button class="btn-link ${config.explanationMode === 'technical' ? 'active-mode' : ''}" onclick="setExplainMode('technical', ${idx}, 'pre')">Technical</button></small>
    </div>`;

    const result = await aiExplainQuestion(q.text, q.options);
    responseDiv.innerHTML = modeToggle + `<div class="ai-text">${formatAiText(result.text)}</div>`;
}

async function handlePostExplain(idx) {
    const q = currentSession[idx];
    const responseDiv = document.getElementById(`ai-post-response-${idx}`);
    responseDiv.style.display = 'block';
    responseDiv.innerHTML = '<span class="ai-loading">🔄 Simplifying...</span>';

    const config = getConfig();
    const modeToggle = `<div class="mode-toggle" style="margin-bottom:8px">
        <small>Mode: <button class="btn-link ${config.explanationMode === 'beginner' ? 'active-mode' : ''}" onclick="setExplainMode('beginner', ${idx}, 'post')">Beginner</button> |
        <button class="btn-link ${config.explanationMode === 'technical' ? 'active-mode' : ''}" onclick="setExplainMode('technical', ${idx}, 'post')">Technical</button></small>
    </div>`;

    const result = await aiExplainAnswer(q.text, q.correctAnswers.join(', '), q.explanation);
    responseDiv.innerHTML = modeToggle + `<div class="ai-text">${formatAiText(result.text)}</div>`;
}

function setExplainMode(mode, idx, type) {
    const config = getConfig();
    config.explanationMode = mode;
    saveConfig(config);
    // Clear cache for this question and re-explain
    const cacheKey = (type === 'pre' ? 'pre-' : 'post-') + currentSession[idx].text.substring(0, 80);
    delete explanationCache[cacheKey];
    if (type === 'pre') handlePreExplain(idx);
    else handlePostExplain(idx);
}

function formatAiText(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
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
function prevQuestion() { if (currentQuestionIndex > 0) { currentQuestionIndex--; renderQuestion(); } }
function nextQuestion() { if (currentQuestionIndex < currentSession.length - 1) { currentQuestionIndex++; renderQuestion(); } }

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

        resultsList.push({ questionId: q.id, isCorrect });

        if (isCorrect) {
            score++;
        } else {
            incorrectList.push({
                questionId: q.id,
                questionText: q.text,
                userAnswer: (userAnswers[i] || []).join(', ') || 'No answer',
                correctAnswer: q.correctAnswers.join(', ')
            });
        }
    }

    recordSession({
        startIndex: sessionStartIndex,
        endIndex: sessionStartIndex + currentSession.length,
        score, total: currentSession.length,
        incorrect: incorrectList,
        results: resultsList,
        isRedo: isRedoSession,
        isCustomMode: currentMode !== 'normal',
        mode: currentMode
    });

    renderQuestion();
    prepareResults(score, currentSession.length, incorrectList);
}

// ─── Results Screen ───
function prepareResults(score, total, incorrectList) {
    const pct = Math.round((score / total) * 100);
    document.getElementById('results-score').textContent = `${score} / ${total}`;
    document.getElementById('results-pct').textContent = `${pct}%`;
    document.getElementById('results-mode-badge').textContent =
        PRACTICE_MODES[currentMode] ? PRACTICE_MODES[currentMode].label : 'Normal';

    const ring = document.getElementById('score-ring-progress');
    const circumference = 2 * Math.PI * 54;
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference - (pct / 100) * circumference;

    let color = '#ef4444';
    if (pct >= 80) color = '#22c55e';
    else if (pct >= 60) color = '#f59e0b';
    ring.style.stroke = color;

    const streaks = getStreaks();
    document.getElementById('results-streak').textContent = `${streaks.current}🔥`;

    const incorrectContainer = document.getElementById('results-incorrect');
    if (incorrectList.length === 0) {
        incorrectContainer.innerHTML = '<p class="perfect-score">🎉 Perfect Score! Great job!</p>';
    } else {
        let html = '<h3>Questions to Review</h3>';
        for (const item of incorrectList) {
            html += `
                <div class="review-item">
                    <div class="review-q"><strong>Q${item.questionId}:</strong> ${escapeHtml(item.questionText)}</div>
                    <div class="review-answers">
                        <span class="your-answer">Your answer: ${item.userAnswer}</span>
                        <span class="correct-answer">Correct: ${item.correctAnswer}</span>
                    </div>
                </div>
            `;
        }
        incorrectContainer.innerHTML = html;
    }
}

function showResults() { showView('results'); }

function goHome() { refreshHomeStats(); showView('home'); }

// ─── Dashboard ───
function showDashboard() {
    const progress = getProgress();
    const streaks = getStreaks();
    refreshHomeStats();

    document.getElementById('dash-total').textContent = progress.totalQuizzes;
    document.getElementById('dash-avg').textContent = getAverageScore() + '%';
    document.getElementById('dash-streak-current').textContent = streaks.current;
    document.getElementById('dash-streak-best').textContent = streaks.best;

    const best = getBestSession();
    const worst = getWorstSession();
    document.getElementById('dash-best').textContent = best ? `${best.score}/${best.total} (#${best.id})` : '—';
    document.getElementById('dash-worst').textContent = worst ? `${worst.score}/${worst.total} (#${worst.id})` : '—';

    // Topic accuracy
    renderTopicStats();

    // Session history table
    const tbody = document.getElementById('session-history-body');
    if (progress.sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No sessions yet</td></tr>';
    } else {
        tbody.innerHTML = progress.sessions.slice().reverse().map(s => `
            <tr>
                <td>${s.id}</td>
                <td>${s.date}</td>
                <td>Q${s.startQ} – Q${s.endQ}</td>
                <td>${s.score} / ${s.total}</td>
                <td><span class="score-badge ${getScoreClass(s.score, s.total)}">${Math.round((s.score / s.total) * 100)}%</span></td>
                <td><span class="mode-badge-sm">${s.mode || 'normal'}</span></td>
                <td><button class="btn btn-secondary btn-sm" onclick="redoSet(${s.startQ - 1})">🔄</button></td>
            </tr>
        `).join('');
    }

    // Incorrect log
    const incorrectDiv = document.getElementById('dash-incorrect-list');
    if (progress.incorrectLog.length === 0) {
        incorrectDiv.innerHTML = '<p class="empty-msg">No incorrect answers recorded yet.</p>';
    } else {
        let html = '';
        for (const item of progress.incorrectLog) {
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

function renderTopicStats() {
    const topicStats = getTopicStats(allQuestions);
    const container = document.getElementById('topic-stats-container');
    if (!container) return;

    let html = '';
    const sorted = Object.entries(topicStats).sort((a, b) => b[1].total - a[1].total);

    for (const [topic, stats] of sorted) {
        const accuracy = stats.attempted > 0 ? Math.round((stats.correct / (stats.correct + (stats.attempted - stats.mastered - stats.review))) * 100) : 0;
        const pct = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;

        html += `
            <div class="topic-stat-row">
                <div class="topic-stat-header">
                    <span class="topic-name">${escapeHtml(topic)}</span>
                    <span class="topic-pct">${pct}% mastered</span>
                </div>
                <div class="mastery-bar">
                    <div class="mastery-bar-fill mastery-green" style="width:${(stats.mastered / stats.total) * 100}%"></div>
                    <div class="mastery-bar-fill mastery-yellow" style="width:${(stats.review / stats.total) * 100}%"></div>
                    <div class="mastery-bar-fill mastery-red" style="width:${(stats.weak / stats.total) * 100}%"></div>
                </div>
                <div class="topic-counts">
                    <small>${stats.mastered}🟢 ${stats.review}🟡 ${stats.weak}🔴 ${stats.total - stats.mastered - stats.review - stats.weak} unseen</small>
                </div>
            </div>
        `;
    }

    container.innerHTML = html || '<p class="empty-msg">No topic data yet.</p>';
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

// ─── Boot ───
document.addEventListener('DOMContentLoaded', checkAuth);
