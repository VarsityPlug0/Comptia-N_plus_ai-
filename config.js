/**
 * config.js – Settings management (per-user via Storage abstraction)
 */

const DEFAULT_CONFIG = {
    apiKey: '',
    apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiModel: 'deepseek-chat',
    explanationMode: 'beginner',
    examDuration: 90,
    examQuestionCount: 60
};

function getConfig() {
    const raw = Storage.get('config');
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...raw };
}

function saveConfig(config) {
    Storage.set('config', config);
}

function hasApiKey() {
    const config = getConfig();
    return config.apiKey && config.apiKey.trim().length > 0;
}
