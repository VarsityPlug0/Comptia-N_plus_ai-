/**
 * tracking.js – Per-question stats, mastery levels, topic categorization
 */

const TRACKING_KEY = 'questionTracking';
const STREAKS_KEY = 'quizStreaks';

// ─── Topic Keywords ───
const TOPIC_KEYWORDS = {
    'Network Infrastructure': ['switch', 'router', 'hub', 'access point', 'firewall', 'load balancer', 'bridge', 'modem', 'transceiver', 'rack', 'patch panel', 'UPS', 'PDU', 'NIC', 'media converter'],
    'IP Addressing & Subnetting': ['subnet', 'IP address', 'CIDR', 'VLSM', 'APIPA', '169.254', 'IPv4', 'IPv6', 'NAT', 'PAT', 'DHCP', 'default gateway', '/28', '/30', '/24', 'broadcast address', 'network address', 'supernet'],
    'Routing & Switching Protocols': ['OSPF', 'EIGRP', 'BGP', 'RIP', 'routing', 'administrative distance', 'static route', 'dynamic route', 'STP', 'spanning tree', 'RSTP', 'VLAN', '802.1Q', 'trunking', 'trunk', 'LACP', 'link aggregation', 'EtherChannel'],
    'Wireless Networking': ['wireless', 'Wi-Fi', 'SSID', '2.4GHz', '5GHz', '802.11', 'antenna', 'omnidirectional', 'heat map', 'WPA', 'WPA2', 'WPA3', 'channel', 'interference', 'mesh network', 'ad hoc'],
    'Network Security': ['firewall', 'ACL', 'VPN', 'IPsec', 'IDS', 'IPS', 'SIEM', 'encryption', 'AES', 'ESP', 'AH', 'certificate', 'SSL', 'TLS', '802.1X', 'RADIUS', 'TACACS', 'port security', 'MAC filtering', 'NAC', 'MFA', 'SSO'],
    'Network Services & Protocols': ['DNS', 'DHCP', 'NTP', 'SNMP', 'SMTP', 'HTTP', 'HTTPS', 'FTP', 'TFTP', 'SSH', 'Telnet', 'LDAP', 'NFS', 'SMB', 'Syslog', 'MIB', 'IMAP', 'POP3', 'MX record', 'TTL', 'A record'],
    'Network Troubleshooting': ['troubleshoot', 'ping', 'tracert', 'traceroute', 'netstat', 'nslookup', 'dig', 'nmap', 'tcpdump', 'Wireshark', 'packet capture', 'cable tester', 'OTDR', 'loopback', 'baseline'],
    'Cabling & Physical Layer': ['fiber', 'Cat 5', 'Cat 6', 'Cat 8', 'RJ45', 'RJ11', 'coaxial', 'SFP', 'LC', 'SC', 'ST', 'MPO', 'patch cable', 'crossover', 'straight-through', 'TIA', 'punch down', 'keystone', 'crimping', 'multimode', 'single-mode', 'plenum', 'shielded', 'copper tape', 'jumbo frame'],
    'Cloud & Virtualization': ['cloud', 'SaaS', 'IaaS', 'PaaS', 'hybrid', 'private cloud', 'public cloud', 'virtual', 'VM', 'hypervisor', 'NFV', 'SDN', 'SD-WAN', 'VXLAN', 'container'],
    'Network Attacks & Threats': ['attack', 'spoofing', 'ARP spoofing', 'MAC flooding', 'evil twin', 'rogue', 'DNS poisoning', 'DDoS', 'DoS', 'phishing', 'man-in-the-middle', 'brute force', 'social engineering', 'ransomware', 'botnet', 'CAM table'],
    'Disaster Recovery & Documentation': ['backup', 'RPO', 'RTO', 'MTTR', 'MTBF', 'disaster recovery', 'redundancy', 'failover', 'SLA', 'change management', 'documentation', 'diagram', 'logical diagram', 'baseline', 'audit', 'compliance']
};

function classifyTopic(questionText) {
    const text = questionText.toLowerCase();
    let bestTopic = 'General Networking';
    let bestScore = 0;

    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
        let score = 0;
        for (const kw of keywords) {
            if (text.includes(kw.toLowerCase())) score++;
        }
        if (score > bestScore) {
            bestScore = score;
            bestTopic = topic;
        }
    }
    return bestTopic;
}

// ─── Question Stats ───
function getQuestionStats() {
    const raw = localStorage.getItem(TRACKING_KEY);
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
}

function saveQuestionStats(stats) {
    localStorage.setItem(TRACKING_KEY, JSON.stringify(stats));
}

function recordQuestionResult(questionId, isCorrect) {
    const stats = getQuestionStats();
    if (!stats[questionId]) {
        stats[questionId] = { attempts: 0, correct: 0, incorrect: 0, streak: 0, mastery: 'weak' };
    }
    const qs = stats[questionId];
    qs.attempts++;
    if (isCorrect) {
        qs.correct++;
        qs.streak = Math.max(0, qs.streak) + 1;
    } else {
        qs.incorrect++;
        qs.streak = Math.min(0, qs.streak) - 1;
    }
    qs.lastAttempted = new Date().toISOString();
    qs.mastery = computeMastery(qs);
    stats[questionId] = qs;
    saveQuestionStats(stats);
    return qs;
}

function computeMastery(qs) {
    if (qs.streak >= 3) return 'mastered';
    if (qs.streak >= 1 || (qs.correct > qs.incorrect && qs.attempts >= 2)) return 'review';
    return 'weak';
}

function getMasteryColor(mastery) {
    switch (mastery) {
        case 'mastered': return '#22c55e';
        case 'review': return '#f59e0b';
        case 'weak': return '#ef4444';
        default: return '#6b7280';
    }
}

function getMasteryCounts(questions) {
    const stats = getQuestionStats();
    const counts = { mastered: 0, review: 0, weak: 0, unseen: 0 };
    for (const q of questions) {
        const qs = stats[q.id];
        if (!qs) { counts.unseen++; continue; }
        counts[qs.mastery]++;
    }
    return counts;
}

function getTopicStats(questions) {
    const stats = getQuestionStats();
    const topics = {};

    for (const q of questions) {
        const topic = q.topic || classifyTopic(q.text);
        if (!topics[topic]) {
            topics[topic] = { total: 0, attempted: 0, correct: 0, mastered: 0, review: 0, weak: 0 };
        }
        topics[topic].total++;
        const qs = stats[q.id];
        if (qs) {
            topics[topic].attempted++;
            topics[topic].correct += qs.correct;
            topics[topic][qs.mastery]++;
        }
    }
    return topics;
}

function getQuestionsByMastery(questions, mastery) {
    const stats = getQuestionStats();
    return questions.filter(q => {
        const qs = stats[q.id];
        if (mastery === 'unseen') return !qs;
        if (!qs) return mastery === 'weak'; // unseen counts as weak
        return qs.mastery === mastery;
    });
}

// ─── Streaks ───
function getStreaks() {
    const raw = localStorage.getItem(STREAKS_KEY);
    if (!raw) return { current: 0, best: 0, lastDate: null };
    try { return JSON.parse(raw); } catch (e) { return { current: 0, best: 0, lastDate: null }; }
}

function updateStreak(score, total) {
    const streaks = getStreaks();
    const today = new Date().toDateString();
    const passed = (score / total) >= 0.7; // 70% threshold for streak

    if (passed) {
        if (streaks.lastDate === today) {
            // Already quizzed today, just keep current streak
        } else {
            const yesterday = new Date(Date.now() - 86400000).toDateString();
            if (streaks.lastDate === yesterday || !streaks.lastDate) {
                streaks.current++;
            } else {
                streaks.current = 1;
            }
        }
        streaks.best = Math.max(streaks.best, streaks.current);
        streaks.lastDate = today;
    } else {
        if (streaks.lastDate !== today) {
            streaks.current = 0;
        }
        streaks.lastDate = today;
    }

    localStorage.setItem(STREAKS_KEY, JSON.stringify(streaks));
    return streaks;
}
