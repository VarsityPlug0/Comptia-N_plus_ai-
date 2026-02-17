/**
 * ai.js – DeepSeek API integration with persistent IndexedDB cache
 * 
 * Free tier: Simulates AI with accurate, question-specific explanations + thinking animation.
 * Pro tier: Cache-first, then live API call on miss, caches result.
 */

// ─── IndexedDB Persistent Cache ───

const AI_CACHE_DB = 'netquiz_ai_cache';
const AI_CACHE_STORE = 'explanations';
const AI_CACHE_VERSION = 1;

let _aiCacheDB = null;

function openAICacheDB() {
    return new Promise((resolve, reject) => {
        if (_aiCacheDB) { resolve(_aiCacheDB); return; }
        const request = indexedDB.open(AI_CACHE_DB, AI_CACHE_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(AI_CACHE_STORE)) {
                db.createObjectStore(AI_CACHE_STORE, { keyPath: 'key' });
            }
        };
        request.onsuccess = (e) => {
            _aiCacheDB = e.target.result;
            resolve(_aiCacheDB);
        };
        request.onerror = (e) => {
            console.error('IndexedDB error:', e);
            reject(e);
        };
    });
}

async function getCachedExplanation(key) {
    try {
        const db = await openAICacheDB();
        return new Promise((resolve) => {
            const tx = db.transaction(AI_CACHE_STORE, 'readonly');
            const store = tx.objectStore(AI_CACHE_STORE);
            const request = store.get(key);
            request.onsuccess = () => {
                resolve(request.result ? request.result.text : null);
            };
            request.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

async function setCachedExplanation(key, text) {
    try {
        const db = await openAICacheDB();
        return new Promise((resolve) => {
            const tx = db.transaction(AI_CACHE_STORE, 'readwrite');
            const store = tx.objectStore(AI_CACHE_STORE);
            store.put({ key, text, cachedAt: new Date().toISOString() });
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch (e) {
        // Silently fail cache write
    }
}

/**
 * Bulk-seed cached explanations.
 * @param {Array<{key: string, text: string}>} entries
 */
async function seedAICache(entries) {
    try {
        const db = await openAICacheDB();
        return new Promise((resolve) => {
            const tx = db.transaction(AI_CACHE_STORE, 'readwrite');
            const store = tx.objectStore(AI_CACHE_STORE);
            for (const entry of entries) {
                store.put({ key: entry.key, text: entry.text, cachedAt: new Date().toISOString() });
            }
            tx.oncomplete = () => resolve(entries.length);
            tx.onerror = () => resolve(0);
        });
    } catch (e) {
        return 0;
    }
}

// ─── In-memory session cache ───
const _sessionCache = {};

// ─── Simulated "thinking" delay ───
function simulateThinkingDelay() {
    const delay = 800 + Math.random() * 1200; // 0.8–2s
    return new Promise(resolve => setTimeout(resolve, delay));
}

// ═══════════════════════════════════════════════
// Accurate Simulated Explanations (Free Tier)
// Uses actual question data for accuracy
// ═══════════════════════════════════════════════

/**
 * PRE-ANSWER simulated explanation.
 * Provides accurate study hints from the real explanation WITHOUT revealing the correct answer.
 * Helps the student reason through the question.
 */
function generateSimulatedPreExplanation(questionText, options, explanation, correctAnswers, mode) {
    const config = getConfig();
    const isBeginner = (mode || config.explanationMode) === 'beginner';

    // Extract key concepts from the real explanation
    const explanationSentences = explanation
        ? explanation.split(/[.!]\s+/).filter(s => s.trim().length > 15)
        : [];

    // Pick concept hints from the explanation without mentioning the answer letter
    const conceptHints = explanationSentences
        .filter(s => {
            // Exclude sentences that directly state the answer
            const lower = s.toLowerCase();
            return !lower.startsWith('the correct answer') &&
                !lower.startsWith('the answer is') &&
                !lower.includes('is the correct');
        })
        .slice(0, 3)
        .map(s => s.trim().replace(/\.$/, ''));

    // Analyze what each option represents to give accurate breakdown
    const optionAnalysis = options.map(opt => {
        const optText = opt.text.toLowerCase();
        const isCorrect = correctAnswers.includes(opt.letter);
        return { letter: opt.letter, text: opt.text, isCorrect };
    });

    let text = '';

    if (isBeginner) {
        text += '💡 **Let me help you think through this!**\n\n';

        if (conceptHints.length > 0) {
            text += '**Key concepts to consider:**\n';
            for (const hint of conceptHints) {
                text += `• ${hint}.\n`;
            }
            text += '\n';
        }

        // Give analysis of the options without revealing answer
        text += '**Think about each option:**\n';
        for (const opt of optionAnalysis) {
            if (opt.isCorrect) {
                text += `• **${opt.letter}. ${opt.text}** — Think carefully about what this means in context.\n`;
            } else {
                // Give a subtle reason why wrong options don't fit
                text += `• ${opt.letter}. ${opt.text} — Consider whether this directly addresses the scenario.\n`;
            }
        }

        text += '\n🧠 Focus on which option most directly solves the specific problem described in the question.';

        if (correctAnswers.length > 1) {
            text += `\n\n⚠️ **Hint:** This question asks you to select ${correctAnswers.length} answers. Look for the options that work together.`;
        }
    } else {
        text += '🔍 **Technical Analysis:**\n\n';

        if (conceptHints.length > 0) {
            text += '**Relevant technical concepts:**\n';
            for (const hint of conceptHints) {
                text += `• ${hint}.\n`;
            }
            text += '\n';
        }

        text += '**Option breakdown:**\n';
        for (const opt of optionAnalysis) {
            if (opt.isCorrect) {
                text += `• **${opt.letter}. ${opt.text}** — Evaluate this option carefully against the technical requirements.\n`;
            } else {
                text += `• ${opt.letter}. ${opt.text} — Consider the specific use case and limitations of this technology.\n`;
            }
        }

        text += '\nAnalyze the scenario requirements, identify the OSI layer or protocol category involved, and match it to the most technically precise option.';

        if (correctAnswers.length > 1) {
            text += `\n\n📌 **Note:** Select ${correctAnswers.length} answers. Consider which options are complementary solutions.`;
        }
    }

    return text;
}

/**
 * POST-ANSWER simulated explanation.
 * Uses the ACTUAL explanation from the question bank to provide accurate, detailed reasoning.
 */
function generateSimulatedPostExplanation(questionText, correctAnswer, explanation, mode) {
    const config = getConfig();
    const isBeginner = (mode || config.explanationMode) === 'beginner';

    let text = '';

    if (isBeginner) {
        text += '✅ **Here\'s a clear breakdown:**\n\n';
        text += `**Correct Answer: ${correctAnswer}**\n\n`;

        if (explanation && explanation.length > 10) {
            // Reformat the existing explanation in a friendlier way
            const sentences = explanation.split(/[.!]\s+/).filter(s => s.trim().length > 10);

            text += '**Why this is correct:**\n';
            for (const sentence of sentences.slice(0, 5)) {
                text += `• ${sentence.trim().replace(/\.$/, '')}.\n`;
            }

            if (sentences.length > 5) {
                text += `• ${sentences.slice(5).join('. ').trim()}\n`;
            }

            text += '\n💡 **Simple way to remember:** The question is testing whether you know the right tool for this specific networking scenario. On the real exam, look for keywords in the question that map directly to a protocol or technology.';
        } else {
            text += 'This concept is an important part of the CompTIA Network+ exam. Review your study materials on this topic to build a stronger understanding.\n';
            text += '\n💡 **Tip:** Try to connect this concept to a real-world networking scenario to help it stick.';
        }
    } else {
        text += '📖 **Detailed Technical Explanation:**\n\n';
        text += `**Correct Answer: ${correctAnswer}**\n\n`;

        if (explanation && explanation.length > 10) {
            // Present the real explanation with technical formatting
            const sentences = explanation.split(/[.!]\s+/).filter(s => s.trim().length > 10);

            for (const sentence of sentences) {
                text += `${sentence.trim().replace(/\.$/, '')}.\n\n`;
            }

            text += '📌 **Exam tip:** This type of question tests practical application of networking concepts. Understand not just what each technology does, but when and why you would choose it over alternatives.';
        } else {
            text += 'Refer to the relevant RFC or vendor documentation for a deeper understanding of the protocol behavior and configuration requirements.\n\n';
            text += '📌 **Exam tip:** Focus on understanding protocol functions, layer interactions, and real-world troubleshooting scenarios.';
        }
    }

    return text;
}

// ═══════════════════════════════════════════════
// AI Explanation Functions
// ═══════════════════════════════════════════════

/**
 * Pre-answer explanation: helps student understand the question before answering.
 * @param {string} questionText
 * @param {Array} options - [{letter, text}]
 * @param {string} explanation - The actual question explanation from question bank
 * @param {Array} correctAnswers - e.g. ['C'] or ['B','D']
 */
async function aiExplainQuestion(questionText, options, explanation, correctAnswers) {
    const config = getConfig();
    const cacheKey = 'pre-' + config.explanationMode + '-' + questionText.substring(0, 80);

    // Check in-memory session cache first
    if (_sessionCache[cacheKey]) return { text: _sessionCache[cacheKey] };

    // Check persistent IndexedDB cache
    const persistentCached = await getCachedExplanation(cacheKey);
    if (persistentCached) {
        _sessionCache[cacheKey] = persistentCached;
        if (!Subscription.isPro()) {
            await simulateThinkingDelay();
        }
        return { text: persistentCached };
    }

    // ─── Free tier: accurate simulated explanation ───
    if (!Subscription.isPro()) {
        await simulateThinkingDelay();
        const simulated = generateSimulatedPreExplanation(
            questionText, options, explanation || '', correctAnswers || []
        );
        _sessionCache[cacheKey] = simulated;
        await setCachedExplanation(cacheKey, simulated);
        return { text: simulated, simulated: true };
    }

    // ─── Pro tier: live API call ───
    if (!hasApiKey()) {
        return { error: 'no-key', text: 'Configure your API key in Settings to use live AI explanations.' };
    }

    const modeInstruction = config.explanationMode === 'beginner'
        ? 'Explain like I\'m a complete beginner. Use simple analogies and everyday examples. Avoid technical jargon.'
        : 'Explain at a technical/certification-exam level with precise terminology.';

    const optionsText = options.map(o => `${o.letter}. ${o.text}`).join('\n');

    const prompt = `You are a networking study coach. A student is about to answer this question and needs help understanding it.\n\nQuestion: ${questionText}\n\nOptions:\n${optionsText}\n\n${modeInstruction}\n\nIMPORTANT: Do NOT reveal the correct answer. Only explain the key concepts, terms, and what the question is really asking. Help the student reason through it themselves. Keep it concise (3-5 sentences).`;

    try {
        const response = await callDeepSeek(prompt);
        _sessionCache[cacheKey] = response;
        await setCachedExplanation(cacheKey, response);
        return { text: response };
    } catch (err) {
        // Fallback to simulated on API failure
        const simulated = generateSimulatedPreExplanation(
            questionText, options, explanation || '', correctAnswers || []
        );
        _sessionCache[cacheKey] = simulated;
        return { text: simulated, simulated: true };
    }
}

/**
 * Post-answer explanation: detailed breakdown after the student has answered.
 * @param {string} questionText
 * @param {string} correctAnswer - e.g. 'C' or 'B, D'
 * @param {string} explanation - The actual question explanation
 */
async function aiExplainAnswer(questionText, correctAnswer, explanation) {
    const config = getConfig();
    const cacheKey = 'post-' + config.explanationMode + '-' + questionText.substring(0, 80);

    // Check in-memory session cache
    if (_sessionCache[cacheKey]) return { text: _sessionCache[cacheKey] };

    // Check persistent IndexedDB cache
    const persistentCached = await getCachedExplanation(cacheKey);
    if (persistentCached) {
        _sessionCache[cacheKey] = persistentCached;
        if (!Subscription.isPro()) {
            await simulateThinkingDelay();
        }
        return { text: persistentCached };
    }

    // ─── Free tier: accurate simulated explanation using real data ───
    if (!Subscription.isPro()) {
        await simulateThinkingDelay();
        const simulated = generateSimulatedPostExplanation(
            questionText, correctAnswer, explanation || ''
        );
        _sessionCache[cacheKey] = simulated;
        await setCachedExplanation(cacheKey, simulated);
        return { text: simulated, simulated: true };
    }

    // ─── Pro tier: live API ───
    if (!hasApiKey()) {
        return { error: 'no-key', text: 'Configure your API key in Settings to use live AI explanations.' };
    }

    const modeInstruction = config.explanationMode === 'beginner'
        ? 'Explain like I\'m a complete beginner. Use simple analogies, real-world examples, and avoid jargon.'
        : 'Explain at a technical/certification-exam level with precise terminology.';

    const prompt = `You are a networking study coach. A student just answered this question and wants to deeply understand the answer.\n\nQuestion: ${questionText}\nCorrect Answer: ${correctAnswer}\nOriginal Explanation: ${explanation}\n\n${modeInstruction}\n\nRewrite the explanation to be clearer. Include a real-world analogy if possible. Keep it concise (4-6 sentences).`;

    try {
        const response = await callDeepSeek(prompt);
        _sessionCache[cacheKey] = response;
        await setCachedExplanation(cacheKey, response);
        return { text: response };
    } catch (err) {
        // Fallback to simulated on API failure
        const simulated = generateSimulatedPostExplanation(
            questionText, correctAnswer, explanation || ''
        );
        _sessionCache[cacheKey] = simulated;
        return { text: simulated, simulated: true };
    }
}

async function aiAnalyzeQuestions(questions) {
    if (!Subscription.isPro()) {
        return { error: 'tier-locked', text: 'AI Analysis is a Pro feature. Upgrade to unlock!' };
    }
    if (!hasApiKey()) return { error: 'no-key' };

    // Check user-scoped cache
    const cached = Storage.get('roadmapAnalysis');
    if (cached) return cached;

    const config = getConfig();

    const questionSummaries = questions.map(q =>
        `Q${q.id}: ${q.text.substring(0, 120)}${q.text.length > 120 ? '...' : ''}`
    ).join('\n');

    const prompt = `You are a networking certification expert. Analyze these ${questions.length} exam questions and return a JSON object.

Questions:
${questionSummaries}

Return ONLY valid JSON with this structure:
{
  "topics": [
    {
      "name": "Topic Name",
      "description": "Brief description",
      "difficulty": "foundational|intermediate|advanced",
      "questionIds": [1, 2, 3],
      "prerequisites": ["Other Topic Name"]
    }
  ],
  "trickQuestions": [
    {
      "questionId": 1,
      "reason": "Why this is tricky"
    }
  ],
  "studyOrder": ["Topic Name 1", "Topic Name 2"]
}

Group questions into 8-12 topics. Identify 15-25 trick questions. Order topics from foundational to advanced.`;

    try {
        const response = await callDeepSeek(prompt, 4000);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            Storage.set('roadmapAnalysis', data);
            return data;
        }
        return { error: 'parse-error', text: 'Could not parse analysis response.' };
    } catch (err) {
        return { error: 'api-error', text: 'Analysis failed: ' + err.message };
    }
}

async function callDeepSeek(prompt, maxTokens = 1000) {
    const config = getConfig();
    const response = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.apiModel,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`API ${response.status}: ${errBody.substring(0, 200)}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}
