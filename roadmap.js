/**
 * roadmap.js – Interactive Knowledge Map + DeepSeek Learning Roadmap
 *             (per-user via Storage abstraction)
 */

let roadmapData = null;

async function loadRoadmap() {
    const cached = Storage.get('roadmapAnalysis');
    if (cached) {
        roadmapData = cached;
        return roadmapData;
    }
    return null;
}

async function generateRoadmap(questions) {
    if (!Subscription.isPro()) {
        return { error: 'tier-locked', text: 'AI Roadmap Analysis is a Pro feature. Upgrade to unlock.' };
    }
    const result = await aiAnalyzeQuestions(questions);
    if (result.error) return result;
    roadmapData = result;
    return result;
}

function clearRoadmapCache() {
    Storage.remove('roadmapAnalysis');
    roadmapData = null;
}

// ─────────────────────────────────────────────
// Interactive Knowledge Map (works without AI)
// ─────────────────────────────────────────────

function renderKnowledgeMap(container, questions) {
    const topicStats = getTopicStats(questions);
    const stats = getQuestionStats();
    const trickMap = {};
    if (roadmapData && roadmapData.trickQuestions) {
        for (const t of roadmapData.trickQuestions) trickMap[t.questionId] = t.reason;
    }

    // Group questions by topic
    const topicGroups = {};
    for (const q of questions) {
        const t = q.topic || classifyTopic(q.text);
        if (!topicGroups[t]) topicGroups[t] = [];
        topicGroups[t].push(q);
    }

    // Prerequisites from DeepSeek (if available)
    const prereqMap = {};
    if (roadmapData && roadmapData.topics) {
        for (const t of roadmapData.topics) {
            if (t.prerequisites && t.prerequisites.length > 0) prereqMap[t.name] = t.prerequisites;
        }
    }

    // Study order from DeepSeek or sort by mastery (worst first)
    let topicOrder;
    if (roadmapData && roadmapData.studyOrder) {
        topicOrder = [...roadmapData.studyOrder];
        for (const t of Object.keys(topicGroups)) {
            if (!topicOrder.includes(t)) topicOrder.push(t);
        }
    } else {
        topicOrder = Object.entries(topicStats)
            .sort((a, b) => {
                const aPct = a[1].total > 0 ? a[1].mastered / a[1].total : 0;
                const bPct = b[1].total > 0 ? b[1].mastered / b[1].total : 0;
                return aPct - bPct;
            })
            .map(([name]) => name);
    }

    // Overall summary
    const counts = getMasteryCounts(questions);
    const totalQ = questions.length;
    const isPro = Subscription.isPro();

    let html = `
        <div class="km-header">
            <h2 class="section-title">📚 Knowledge Map</h2>
            <div class="km-summary">
                <span class="km-sum-item"><span class="dot dot-green"></span>${counts.mastered} Mastered</span>
                <span class="km-sum-item"><span class="dot dot-yellow"></span>${counts.review} Review</span>
                <span class="km-sum-item"><span class="dot dot-red"></span>${counts.weak} Weak</span>
                <span class="km-sum-item"><span class="dot dot-gray"></span>${counts.unseen} Unseen</span>
                <span class="km-sum-item km-total">${totalQ} total</span>
            </div>
            <div class="mastery-bar-lg">
                <div class="mastery-bar-fill mastery-green" style="width:${(counts.mastered / totalQ) * 100}%"></div>
                <div class="mastery-bar-fill mastery-yellow" style="width:${(counts.review / totalQ) * 100}%"></div>
                <div class="mastery-bar-fill mastery-red" style="width:${(counts.weak / totalQ) * 100}%"></div>
            </div>
        </div>

        <div class="km-actions">
            <button class="btn btn-ai btn-sm ${!isPro ? 'btn-locked' : ''}" onclick="${isPro ? 'handleGenerateRoadmap();' : 'showUpgradePrompt();'}" id="btn-generate-roadmap">
                ${isPro ? '🧠' : '🔒'} ${roadmapData ? 'Regenerate AI Analysis' : 'Generate AI Analysis'}
                ${!isPro ? '<span class="pro-required">PRO</span>' : ''}
            </button>
            ${roadmapData ? '<button class="btn btn-secondary btn-sm" onclick="clearRoadmapCache(); showRoadmapView();">🗑 Clear AI Cache</button>' : ''}
        </div>
    `;

    // Render each topic domain
    for (let i = 0; i < topicOrder.length; i++) {
        const topicName = topicOrder[i];
        const qs = topicGroups[topicName];
        if (!qs || qs.length === 0) continue;

        const ts = topicStats[topicName] || { total: 0, mastered: 0, review: 0, weak: 0 };
        const total = qs.length;
        const masteredCount = ts.mastered || 0;
        const reviewCount = ts.review || 0;
        const weakCount = ts.weak || 0;
        const unseenCount = total - masteredCount - reviewCount - weakCount;
        const masteryPct = total > 0 ? Math.round((masteredCount / total) * 100) : 0;

        let statusIcon, statusColor;
        if (masteryPct >= 70) { statusIcon = '🟢'; statusColor = '#22c55e'; }
        else if (masteryPct >= 30) { statusIcon = '🟡'; statusColor = '#f59e0b'; }
        else if (masteredCount + reviewCount + weakCount > 0) { statusIcon = '🔴'; statusColor = '#ef4444'; }
        else { statusIcon = '⚪'; statusColor = '#6b7280'; }

        const trickyInTopic = qs.filter(q => trickMap[q.id]);
        const prereqs = prereqMap[topicName] || [];

        let diffLabel = '';
        if (roadmapData && roadmapData.topics) {
            const rdTopic = roadmapData.topics.find(t => t.name === topicName);
            if (rdTopic && rdTopic.difficulty) {
                const d = rdTopic.difficulty;
                diffLabel = d === 'foundational' ? '🟢 Foundational'
                    : d === 'intermediate' ? '🟡 Intermediate' : '🔴 Advanced';
            }
        }

        const domainId = `domain-${i}`;

        html += `
            <div class="km-domain" style="border-left-color:${statusColor}" id="${domainId}-wrapper">
                <div class="km-domain-header" onclick="toggleDomain('${domainId}')">
                    <div class="km-domain-left">
                        <span class="km-status">${statusIcon}</span>
                        <div class="km-domain-info">
                            <strong class="km-domain-name">${escapeHtml(topicName)}</strong>
                            <span class="km-domain-meta">${total} questions · ${masteredCount}/${total} mastered${trickyInTopic.length > 0 ? ` · ⚠️ ${trickyInTopic.length} tricky` : ''}</span>
                        </div>
                    </div>
                    <div class="km-domain-right">
                        ${diffLabel ? `<span class="difficulty-badge">${diffLabel}</span>` : ''}
                        <span class="km-expand-icon" id="${domainId}-icon">▸</span>
                    </div>
                </div>
                <div class="km-domain-bar">
                    <div class="mastery-bar">
                        <div class="mastery-bar-fill mastery-green" style="width:${(masteredCount / total) * 100}%"></div>
                        <div class="mastery-bar-fill mastery-yellow" style="width:${(reviewCount / total) * 100}%"></div>
                        <div class="mastery-bar-fill mastery-red" style="width:${(weakCount / total) * 100}%"></div>
                    </div>
                </div>
                ${prereqs.length > 0 ? `<div class="km-prereqs">↳ Requires: ${prereqs.map(p => `<span class="prereq-tag">${escapeHtml(p)}</span>`).join('')}</div>` : ''}
                <div class="km-domain-body" id="${domainId}" style="display:none">
                    <div class="km-domain-actions">
                        <button class="btn btn-primary btn-sm" onclick="startTopicQuiz('${escapeAttr(topicName)}')">
                            ▶ Practice This Topic (10)
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="startTopicQuiz('${escapeAttr(topicName)}', 'weak')">
                            🔴 Weak Only
                        </button>
                    </div>
                    <div class="km-question-list">
                        ${qs.map(q => {
            const qs2 = stats[q.id];
            let qIcon, qClass;
            if (!qs2) { qIcon = '⚪'; qClass = 'km-q-unseen'; }
            else if (qs2.mastery === 'mastered') { qIcon = '🟢'; qClass = 'km-q-mastered'; }
            else if (qs2.mastery === 'review') { qIcon = '🟡'; qClass = 'km-q-review'; }
            else { qIcon = '🔴'; qClass = 'km-q-weak'; }

            const isTricky = trickMap[q.id];
            const trickBadge = isTricky ? `<span class="km-trick-badge" title="${escapeAttr(isTricky)}">⚠️</span>` : '';
            const statsText = qs2 ? `${qs2.correct}✓ ${qs2.incorrect}✗` : '';

            return `
                                <div class="km-question ${qClass}" onclick="startSingleQuestion(${q.id})">
                                    <span class="km-q-status">${qIcon}</span>
                                    <div class="km-q-content">
                                        <span class="km-q-id">Q${q.id}</span>
                                        <span class="km-q-text">${escapeHtml(q.text.substring(0, 100))}${q.text.length > 100 ? '…' : ''}</span>
                                    </div>
                                    <div class="km-q-right">
                                        ${trickBadge}
                                        <span class="km-q-stats">${statsText}</span>
                                    </div>
                                </div>
                            `;
        }).join('')}
                    </div>
                </div>
            </div>
        `;

        if (i < topicOrder.length - 1) {
            html += '<div class="roadmap-connector"><div class="connector-line"></div><div class="connector-arrow">▼</div></div>';
        }
    }

    container.innerHTML = html;
}

function toggleDomain(domainId) {
    const body = document.getElementById(domainId);
    const icon = document.getElementById(domainId + '-icon');
    if (!body) return;
    const isVisible = body.style.display !== 'none';
    body.style.display = isVisible ? 'none' : 'block';
    if (icon) icon.textContent = isVisible ? '▸' : '▾';
}

function escapeAttr(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────
// DeepSeek Roadmap Analysis
// ─────────────────────────────────────────────

async function handleGenerateRoadmap() {
    if (!Subscription.isPro()) {
        showUpgradePrompt();
        return;
    }

    const btn = document.getElementById('btn-generate-roadmap');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Analyzing all questions…'; }

    const result = await generateRoadmap(allQuestions);

    if (result.error) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '🧠 Generate AI Analysis';
        }
        const msg = result.error === 'no-key'
            ? '⚠️ Configure your DeepSeek API key in Settings first.'
            : '⚠️ ' + (result.text || 'Analysis failed. Try again.');
        alert(msg);
        return;
    }

    showRoadmapView();
}

// ─── Roadmap View Entry Point ───
function showRoadmapView() {
    if (!allQuestions || allQuestions.length === 0) {
        alert('Questions are still loading. Please wait.');
        return;
    }
    const container = document.getElementById('roadmap-content');
    try {
        renderKnowledgeMap(container, allQuestions);
    } catch (e) {
        console.error('Roadmap render error:', e);
        container.innerHTML = '<p class="error-msg">⚠ Error rendering Knowledge Map. Check console for details.</p>';
    }
    showView('roadmap');
}
