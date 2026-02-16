/**
 * ai.js – DeepSeek API integration for explanations and analysis
 */

// Cache explanations to avoid repeat API calls
const explanationCache = {};

async function aiExplainQuestion(questionText, options) {
    if (!hasApiKey()) return { error: 'no-key', text: 'Configure your API key in Settings to use AI explanations.' };

    const cacheKey = 'pre-' + questionText.substring(0, 80);
    if (explanationCache[cacheKey]) return { text: explanationCache[cacheKey] };

    const config = getConfig();
    const modeInstruction = config.explanationMode === 'beginner'
        ? 'Explain like I\'m a complete beginner. Use simple analogies and everyday examples. Avoid technical jargon.'
        : 'Explain at a technical/certification-exam level with precise terminology.';

    const optionsText = options.map(o => `${o.letter}. ${o.text}`).join('\n');

    const prompt = `You are a networking study coach. A student is about to answer this question and needs help understanding it.\n\nQuestion: ${questionText}\n\nOptions:\n${optionsText}\n\n${modeInstruction}\n\nIMPORTANT: Do NOT reveal the correct answer. Only explain the key concepts, terms, and what the question is really asking. Help the student reason through it themselves. Keep it concise (3-5 sentences).`;

    try {
        const response = await callDeepSeek(prompt);
        explanationCache[cacheKey] = response;
        return { text: response };
    } catch (err) {
        return { error: 'api-error', text: 'AI explanation unavailable: ' + err.message };
    }
}

async function aiExplainAnswer(questionText, correctAnswer, explanation) {
    if (!hasApiKey()) return { error: 'no-key', text: 'Configure your API key in Settings to use AI explanations.' };

    const cacheKey = 'post-' + questionText.substring(0, 80);
    if (explanationCache[cacheKey]) return { text: explanationCache[cacheKey] };

    const config = getConfig();
    const modeInstruction = config.explanationMode === 'beginner'
        ? 'Explain like I\'m a complete beginner. Use simple analogies, real-world examples, and avoid jargon.'
        : 'Explain at a technical/certification-exam level with precise terminology.';

    const prompt = `You are a networking study coach. A student just answered this question and wants to deeply understand the answer.\n\nQuestion: ${questionText}\nCorrect Answer: ${correctAnswer}\nOriginal Explanation: ${explanation}\n\n${modeInstruction}\n\nRewrite the explanation to be clearer. Include a real-world analogy if possible. Keep it concise (4-6 sentences).`;

    try {
        const response = await callDeepSeek(prompt);
        explanationCache[cacheKey] = response;
        return { text: response };
    } catch (err) {
        return { error: 'api-error', text: 'AI explanation unavailable: ' + err.message };
    }
}

async function aiAnalyzeQuestions(questions) {
    if (!hasApiKey()) return { error: 'no-key' };

    // Check cache
    const cached = localStorage.getItem('roadmapAnalysis');
    if (cached) {
        try { return JSON.parse(cached); } catch (e) { }
    }

    const config = getConfig();

    // Batch questions into summary format to reduce token usage
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

Group questions into 8-12 topics. Identify 15-25 trick questions that require careful reasoning. Order topics from foundational to advanced.`;

    try {
        const response = await callDeepSeek(prompt, 4000);
        // Parse JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            localStorage.setItem('roadmapAnalysis', JSON.stringify(data));
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
