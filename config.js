/**
 * config.js – Settings management and API key storage
 */

const CONFIG_KEY = 'quizAppConfig';

const DEFAULT_CONFIG = {
    apiKey: '',  // User sets this in Settings → stored in localStorage only
    apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiModel: 'deepseek-chat',
    explanationMode: 'beginner', // 'beginner' or 'technical'
    examDuration: 90,            // minutes
    examQuestionCount: 60
};

function getConfig() {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch (e) {
        return { ...DEFAULT_CONFIG };
    }
}

function saveConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function hasApiKey() {
    const config = getConfig();
    return config.apiKey && config.apiKey.trim().length > 0;
}
