/**
 * progress.js – Per-user progress tracking with streaks (via Storage abstraction)
 */

function getProgress() {
    const raw = Storage.get('progress');
    if (!raw) return createDefaultProgress();
    return raw;
}

function createDefaultProgress() {
    return {
        totalQuizzes: 0,
        nextStartIndex: 0, // Legacy support, can be repurposed or ignored
        unlockedSetIndex: 0, // New: Tracks the highest unlocked set (0-indexed)
        sessions: [],
        incorrectLog: []
    };
}

function saveProgress(progress) {
    Storage.set('progress', progress);
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
        mode: sessionData.mode || 'normal',
        results: sessionData.results || [] // Store full question details
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
    Storage.remove('progress');
    Storage.remove('questionTracking');
    Storage.remove('streaks');
    Storage.remove('roadmapAnalysis');
}
