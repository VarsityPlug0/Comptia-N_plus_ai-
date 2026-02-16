/**
 * progress.js – Local storage progress tracking with streaks
 */

const STORAGE_KEY = 'quizProgress';

function getProgress() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProgress();
    try { return JSON.parse(raw); } catch (e) { return createDefaultProgress(); }
}

function createDefaultProgress() {
    return { totalQuizzes: 0, nextStartIndex: 0, sessions: [], incorrectLog: [] };
}

function saveProgress(progress) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function recordSession(sessionData) {
    const progress = getProgress();
    progress.totalQuizzes += 1;
    if (!sessionData.isRedo && !sessionData.isCustomMode) {
        progress.nextStartIndex = sessionData.endIndex;
    }

    progress.sessions.push({
        id: progress.totalQuizzes,
        date: new Date().toLocaleString(),
        startQ: sessionData.startIndex + 1,
        endQ: sessionData.endIndex,
        score: sessionData.score,
        total: sessionData.total,
        mode: sessionData.mode || 'normal'
    });

    for (const wrong of sessionData.incorrect) {
        const existing = progress.incorrectLog.findIndex(e => e.questionId === wrong.questionId);
        if (existing !== -1) {
            progress.incorrectLog[existing] = wrong;
        } else {
            progress.incorrectLog.push(wrong);
        }
    }

    // Update per-question stats
    if (sessionData.results) {
        for (const r of sessionData.results) {
            recordQuestionResult(r.questionId, r.isCorrect);
        }
    }

    // Update streaks
    updateStreak(sessionData.score, sessionData.total);

    saveProgress(progress);
    return progress;
}

function getAverageScore() {
    const progress = getProgress();
    if (progress.sessions.length === 0) return 0;
    const totalPct = progress.sessions.reduce((sum, s) => sum + (s.score / s.total) * 100, 0);
    return Math.round(totalPct / progress.sessions.length);
}

function getBestSession() {
    const progress = getProgress();
    if (progress.sessions.length === 0) return null;
    return progress.sessions.reduce((best, s) => (s.score / s.total) > (best.score / best.total) ? s : best);
}

function getWorstSession() {
    const progress = getProgress();
    if (progress.sessions.length === 0) return null;
    return progress.sessions.reduce((worst, s) => (s.score / s.total) < (worst.score / worst.total) ? s : worst);
}

function resetProgress() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('questionTracking');
    localStorage.removeItem('quizStreaks');
    localStorage.removeItem('roadmapAnalysis');
}
