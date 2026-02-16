/**
 * config.js – Settings management and API key storage
 */

const CONFIG_KEY = 'quizAppConfig';

const DEFAULT_CONFIG = {
    apiKey: 'sk-67a4f452917b4432b5720861745296f9',
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
