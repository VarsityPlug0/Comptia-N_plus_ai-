/**
 * modes.js – Custom practice mode logic and exam simulation
 */

const PRACTICE_MODES = {
    normal: { label: 'Normal (Sequential)', icon: '▶', description: 'Questions in order, 10 per session' },
    weak: { label: 'Weak Areas', icon: '🔴', description: 'Focus on questions you get wrong' },
    review: { label: 'Review', icon: '🟡', description: 'Questions you sometimes get right' },
    mastered: { label: 'Mastered', icon: '🟢', description: 'Confidence check on strong areas' },
    mixed: { label: 'Mixed Practice', icon: '🔀', description: 'Blend of all mastery levels' },
    reinforcement: { label: 'Reinforcement', icon: '🔁', description: 'Weighted toward frequently wrong questions' },
    exam: { label: 'Exam Simulation', icon: '🎯', description: 'Timed, 60 questions, no peeking' }
};

function getQuestionsForMode(mode, allQuestions, count = 10) {
    switch (mode) {
        case 'normal':
            return null; // handled by existing sequential logic

        case 'weak': {
            const weak = getQuestionsByMastery(allQuestions, 'weak');
            const unseen = getQuestionsByMastery(allQuestions, 'unseen');
            const pool = [...weak, ...unseen];
            return shuffleArray(pool).slice(0, count);
        }

        case 'review': {
            const review = getQuestionsByMastery(allQuestions, 'review');
            if (review.length < count) {
                const weak = getQuestionsByMastery(allQuestions, 'weak');
                return shuffleArray([...review, ...weak]).slice(0, count);
            }
            return shuffleArray(review).slice(0, count);
        }

        case 'mastered': {
            const mastered = getQuestionsByMastery(allQuestions, 'mastered');
            return shuffleArray(mastered).slice(0, count);
        }

        case 'mixed': {
            const stats = getQuestionStats();
            const weak = allQuestions.filter(q => { const s = stats[q.id]; return !s || s.mastery === 'weak'; });
            const review = allQuestions.filter(q => { const s = stats[q.id]; return s && s.mastery === 'review'; });
            const mastered = allQuestions.filter(q => { const s = stats[q.id]; return s && s.mastery === 'mastered'; });

            // Weighted: 50% weak, 30% review, 20% mastered
            const result = [];
            const weakCount = Math.ceil(count * 0.5);
            const reviewCount = Math.ceil(count * 0.3);
            const masteredCount = count - weakCount - reviewCount;

            result.push(...shuffleArray(weak).slice(0, weakCount));
            result.push(...shuffleArray(review).slice(0, reviewCount));
            result.push(...shuffleArray(mastered).slice(0, masteredCount));

            return shuffleArray(result).slice(0, count);
        }

        case 'reinforcement': {
            // Weight questions by how often they're wrong
            const stats = getQuestionStats();
            const weighted = allQuestions.map(q => {
                const s = stats[q.id];
                let weight = 1;
                if (s) {
                    weight = Math.max(1, s.incorrect * 3 - s.correct);
                    if (s.mastery === 'weak') weight *= 2;
                } else {
                    weight = 2; // unseen gets moderate weight
                }
                return { question: q, weight };
            });

            return weightedSample(weighted, count);
        }

        case 'exam': {
            const config = getConfig();
            const examCount = config.examQuestionCount || 60;
            // Take sequential blocks to simulate real exam ordering
            const progress = getProgress();
            let start = progress.nextStartIndex || 0;
            if (start + examCount > allQuestions.length) start = 0;
            return allQuestions.slice(start, start + examCount);
        }

        default:
            return null;
    }
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function weightedSample(weightedItems, count) {
    const result = [];
    const pool = [...weightedItems];

    while (result.length < count && pool.length > 0) {
        const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
        let random = Math.random() * totalWeight;

        for (let i = 0; i < pool.length; i++) {
            random -= pool[i].weight;
            if (random <= 0) {
                result.push(pool[i].question);
                pool.splice(i, 1);
                break;
            }
        }
    }
    return result;
}
