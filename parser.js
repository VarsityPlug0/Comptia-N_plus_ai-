/**
 * parser.js – Parses questions.txt into structured question objects
 */

async function loadQuestions() {
    try {
        const response = await fetch('questions.txt');
        if (!response.ok) throw new Error('Failed to load questions.txt');
        const text = await response.text();
        return parseQuestions(text);
    } catch (error) {
        console.error('Error loading questions:', error);
        return [];
    }
}

function parseQuestions(rawText) {
    const questions = [];
    const cleaned = rawText
        .replace(/\*\*/g, '')
        .replace(/<\/?[0-9]+>/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

    const blocks = cleaned.split(/\n(?=QUESTION\s+\d+)/i);

    for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;

        const numMatch = trimmed.match(/^QUESTION\s+(\d+)/i);
        if (!numMatch) continue;

        const id = parseInt(numMatch[1], 10);
        const lines = trimmed.split('\n');

        let questionText = '';
        let optionStartIndex = -1;
        let answerLineIndex = -1;
        let explanationStartIndex = -1;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (/^Answer:\s*/i.test(line)) answerLineIndex = i;
            if (/^Explanation:\s*/i.test(line) || /^Explanation\s*$/i.test(line)) explanationStartIndex = i;
        }

        const optionPattern = /^([A-F])\.\s+(.+)/;
        const options = [];
        for (let i = 1; i < lines.length; i++) {
            if (answerLineIndex !== -1 && i >= answerLineIndex) break;
            const line = lines[i].trim();
            const optMatch = line.match(optionPattern);
            if (optMatch) {
                if (optionStartIndex === -1) optionStartIndex = i;
                options.push({ letter: optMatch[1], text: optMatch[2].trim() });
            }
        }

        if (optionStartIndex > 1) {
            questionText = lines.slice(1, optionStartIndex).map(l => l.trim()).filter(l => l.length > 0).join(' ');
        } else if (optionStartIndex === -1) {
            continue;
        }

        let correctAnswers = [];
        if (answerLineIndex !== -1) {
            const answerMatch = lines[answerLineIndex].trim().match(/^Answer:\s*([A-F]+)/i);
            if (answerMatch) correctAnswers = answerMatch[1].split('');
        }

        let explanation = '';
        if (explanationStartIndex !== -1) {
            explanation = lines.slice(explanationStartIndex + 1).map(l => l.trim()).filter(l => l.length > 0).join(' ');
        }

        if (options.length >= 2 && correctAnswers.length > 0) {
            const topic = classifyTopic(questionText);
            questions.push({
                id, text: questionText, options, correctAnswers, explanation,
                isMultiSelect: correctAnswers.length > 1,
                topic
            });
        }
    }

    questions.sort((a, b) => a.id - b.id);
    return questions;
}
