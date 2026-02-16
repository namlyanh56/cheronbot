/**
 * Configuration Management System
 * Centralized configuration with validation and defaults
 */

require('dotenv').config();

class Config {
    constructor() {
        this.bot = {
            name: process.env.BOT_NAME || 'Cheron Bot Asisten',
            owner: process.env.BOT_OWNER || 'Ilham',
            prefix: process.env.BOT_PREFIX || '.',
            browser: ['Cheron Bot Asisten', 'Chrome', '1.0.0'],
            // Private mode: ignore private messages when true
            onlyGroupMode: process.env.ONLY_GROUP_MODE === 'true',
            // Owner IDs - supports both private (@s.whatsapp.net) and group (@lid) formats
            // Can be comma-separated for dual ID support: "id1@s.whatsapp.net,id2@lid"
            ownerIds: this._normalizeOwnerIds(process.env.BOT_OWNER_ID),
            // Legacy single ID for backward compatibility
            ownerId: this._normalizeOwnerId(process.env.BOT_OWNER_ID),
            // Owner-only commands list from env
            ownerOnlyCommands: (process.env.OWNER_ONLY_COMMANDS || 'security,spam')
                .split(',')
                .map(c => c.trim().toLowerCase())
                .filter(c => c)
        };

        this.performance = {
            maxProcesses: parseInt(process.env.MAX_PROCESSES) || 3,
            cooldownMs: parseInt(process.env.COOLDOWN_MS) || 3000, // Friendlier 3 second cooldown
            rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000, // 1 minute
            rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 15, // Allow more for friends
            cacheExpiration: parseInt(process.env.CACHE_EXPIRATION) || 300000 // 5 minutes
        };

        this.media = {
            maxDuration: parseInt(process.env.MAX_MUSIC_DURATION) || 600, // 10 minutes
            maxFileSize: process.env.MAX_FILE_SIZE || '200M', // 200MB limit for data saving
            proxyUrl: this._buildProxyUrl()
        };

        this.apis = {
            elevenlabs: {
                key: process.env.ELEVENLABS_API_KEY,
                voiceId: process.env.ELEVENLABS_VOICE_ID || 'plgKUYgnlZ1DCNh54DwJ'
            },
            omdb: {
                key: process.env.OMDB_API_KEY
            },
            gemini: {
                key: process.env.GEMINI_API_KEY
            }
        };

        this.logging = {
            level: process.env.LOG_LEVEL || 'info',
            silent: process.env.LOG_SILENT === 'true'
        };

        // Security settings
        // Chat security: filters user input for malicious patterns
        // Server security (rate limiting, blocking) is always active
        this.security = {
            // Enable/disable chat content filtering (malicious pattern detection)
            // When false, users can type anything without being flagged
            // Server-side protections (rate limiting, user blocking) remain active
            chatFilterEnabled: process.env.SECURITY_CHAT_FILTER !== 'false'
        };

        // Proxy configuration for yt-dlp, axios, puppeteer and other services
        // Supports HTTP, HTTPS, and SOCKS5 proxies (e.g., Tailscale + Every Proxy)
        this.proxy = {
            // Enable/disable proxy globally
            enabled: process.env.PROXY_ENABLED === 'true',
            // Proxy type: http, https, socks5
            type: process.env.PROXY_TYPE || 'http',
            // Proxy credentials
            user: process.env.PROXY_USER || null,
            pass: process.env.PROXY_PASS || null,
            host: process.env.PROXY_HOST || null,
            port: process.env.PROXY_PORT ? parseInt(process.env.PROXY_PORT) : null,
            // Full proxy URL (takes priority if set)
            url: this._buildProxyUrl()
        };
    }

    /**
     * Build proxy URL from credentials
     * Supports HTTP, HTTPS, and SOCKS5 protocols
     */
    _buildProxyUrl() {
        // First check legacy HB_PROXY_URL
        if (process.env.HB_PROXY_URL) {
            return process.env.HB_PROXY_URL;
        }

        // Build from individual components
        const type = process.env.PROXY_TYPE || 'http';
        const user = process.env.PROXY_USER;
        const pass = process.env.PROXY_PASS;
        const host = process.env.PROXY_HOST;
        const port = process.env.PROXY_PORT;

        if (host && port) {
            // Determine protocol
            let protocol = 'http';
            if (type === 'socks5' || type === 'socks') {
                protocol = 'socks5';
            } else if (type === 'https') {
                protocol = 'https';
            }

            if (user && pass) {
                return `${protocol}://${user}:${pass}@${host}:${port}`;
            }
            return `${protocol}://${host}:${port}`;
        }

        return null;
    }

    /**
     * Get proxy configuration for axios
     * Returns null if proxy is not enabled or not configured
     */
    getAxiosProxyConfig() {
        if (!this.proxy.enabled || !this.proxy.host || !this.proxy.port) {
            return null;
        }

        const config = {
            host: this.proxy.host,
            port: this.proxy.port,
            protocol: this.proxy.type === 'socks5' ? 'socks5' : (this.proxy.type || 'http')
        };

        if (this.proxy.user && this.proxy.pass) {
            config.auth = {
                username: this.proxy.user,
                password: this.proxy.pass
            };
        }

        return config;
    }

    /**
     * Get proxy URL for yt-dlp and other CLI tools
     * Priority: proxy.url (from PROXY_* env vars) > media.proxyUrl (from HB_PROXY_URL legacy)
     */
    getProxyUrl() {
        if (!this.proxy.enabled) {
            return null;
        }
        // Primary: Use proxy.url built from PROXY_* env vars
        // Fallback: Use media.proxyUrl from legacy HB_PROXY_URL for backward compatibility
        return this.proxy.url || this.media.proxyUrl;
    }

    /**
     * Get proxy arguments for yt-dlp
     */
    getYtDlpProxyArgs() {
        const proxyUrl = this.getProxyUrl();
        return proxyUrl ? ['--proxy', proxyUrl] : [];
    }

    /**
     * Get proxy configuration for Puppeteer
     */
    getPuppeteerProxyArgs() {
        if (!this.proxy.enabled || !this.proxy.host || !this.proxy.port) {
            return [];
        }

        const proxyUrl = this.proxy.url || `${this.proxy.type || 'http'}://${this.proxy.host}:${this.proxy.port}`;
        return [`--proxy-server=${proxyUrl}`];
    }

    /**
     * Normalize single owner ID to accept both @s.whatsapp.net and @lid formats
     * @param {string} ownerId - Raw owner ID from env
     * @returns {string|null} Normalized owner ID (first ID if comma-separated)
     */
    _normalizeOwnerId(ownerId) {
        if (!ownerId) return null;
        
        // If comma-separated, return the first one
        const firstId = ownerId.split(',')[0];
        return this._normalizeSingleOwnerId(firstId);
    }

    /**
     * Normalize multiple owner IDs (comma-separated)
     * Supports both @s.whatsapp.net (private chat) and @lid (group chat) formats
     * @param {string} ownerIdStr - Comma-separated owner IDs from env
     * @returns {string[]} Array of normalized owner IDs
     */
    _normalizeOwnerIds(ownerIdStr) {
        if (!ownerIdStr) return [];
        
        return ownerIdStr
            .split(',')
            .map(id => this._normalizeSingleOwnerId(id.trim()))
            .filter(id => id !== null);
    }

    /**
     * Normalize a single owner ID
     * @param {string} ownerId - Single owner ID
     * @returns {string|null} Normalized owner ID
     */
    _normalizeSingleOwnerId(ownerId) {
        if (!ownerId) return null;
        
        // Remove any whitespace
        let normalized = ownerId.trim();
        
        // Accept both @s.whatsapp.net and @lid formats directly
        if (normalized.endsWith('@s.whatsapp.net') || normalized.endsWith('@lid')) {
            return normalized;
        }
        
        // Otherwise, assume it's a phone number - normalize and add @s.whatsapp.net suffix
        const number = normalized.replace(/\D/g, '');
        if (!number) return null;
        
        return `${number}@s.whatsapp.net`;
    }

    /**
     * Check if a sender is the bot owner
     * Supports multiple owner IDs (for private and group chat formats)
     * @param {string} senderId - Sender JID
     * @returns {boolean}
     */
    isOwner(senderId) {
        if (!senderId) return false;
        
        // Check against all owner IDs
        const ownerIds = this.bot.ownerIds;
        if (!ownerIds || ownerIds.length === 0) return false;
        
        for (const ownerId of ownerIds) {
            if (this._matchesOwnerId(senderId, ownerId)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Check if sender matches a specific owner ID
     * Robust: exact match, device-suffix stripping, digit-only fallback, and normalized forms.
     *
     * FIX: Perbaikan utama dibanding versi sebelumnya:
     *   - Langkah 2: Strip device suffix (:0, :1, dll.) secara eksplisit SEBELUM
     *     digit comparison, sehingga "6288238502311:1@s.whatsapp.net" → "6288238502311@s.whatsapp.net"
     *     dan "LID_VALUE:0@lid" → "LID_VALUE@lid" bisa match langsung.
     *   - Langkah 3: Digit-only comparison hanya mengambil bagian SEBELUM '@' dan SEBELUM ':'
     *     untuk menghindari kontaminasi digit dari device suffix.
     *   - Langkah 3: Minimum 10 digit untuk mencegah false-positive dari digit pendek.
     *
     * @param {string} senderId - Sender JID (dari WhatsApp)
     * @param {string} ownerId - Owner ID (dari .env / config)
     * @returns {boolean}
     */
    _matchesOwnerId(senderId, ownerId) {
        if (!ownerId || !senderId) return false;
        
        // 1) Direct exact match (fastest path)
        if (senderId === ownerId) {
            return true;
        }

        // 2) Strip device suffix (:0, :1, etc.) then compare
        //    WhatsApp multi-device sering mengirim JID seperti:
        //      "6288238502311:1@s.whatsapp.net"  (device 1, private)
        //      "LID_VALUE:0@lid"                 (device 0, group LID)
        //    Stripping menghasilkan:
        //      "6288238502311@s.whatsapp.net"
        //      "LID_VALUE@lid"
        let strippedSender = senderId;
        if (senderId.includes(':') && senderId.includes('@')) {
            const atIndex = senderId.indexOf('@');
            const beforeAt = senderId.substring(0, atIndex);
            const afterAt = senderId.substring(atIndex); // termasuk '@'
            const numberPart = beforeAt.split(':')[0];
            strippedSender = numberPart + afterAt;
        }
        if (strippedSender === ownerId) {
            return true;
        }

        // 3) Digit-only fallback: bandingkan hanya digit dari bagian nomor (sebelum @ dan :)
        //    Ini menangani kasus:
        //      sender "6288238502311@s.whatsapp.net" vs owner "6288238502311@lid" (beda suffix)
        //      sender "6288238502311" (plain) vs owner "6288238502311@s.whatsapp.net"
        //    CATATAN: Hanya efektif jika kedua sisi berbasis nomor telepon.
        //    Untuk LID opaque (bukan nomor telepon), hanya langkah 1 & 2 yang bisa match.
        const senderNumberPart = (senderId.includes('@') ? senderId.split('@')[0] : senderId).split(':')[0];
        const ownerNumberPart  = (ownerId.includes('@') ? ownerId.split('@')[0] : ownerId).split(':')[0];
        
        const senderDigits = senderNumberPart.replace(/\D/g, '');
        const ownerDigits  = ownerNumberPart.replace(/\D/g, '');
        
        if (senderDigits && ownerDigits && senderDigits.length >= 10 && senderDigits === ownerDigits) {
            return true;
        }
        
        // 4) Normalisasi khusus untuk owner @s.whatsapp.net
        //    Menangani sender tanpa suffix atau dengan suffix berbeda
        if (ownerId.endsWith('@s.whatsapp.net')) {
            let normalizedSender = senderId;
            
            // Participant/device format: ambil bagian sebelum ':'
            if (senderId.includes(':')) {
                normalizedSender = senderId.split(':')[0] + '@s.whatsapp.net';
            }
            
            // Jika masih belum @s.whatsapp.net, normalisasi dari digit
            if (!normalizedSender.endsWith('@s.whatsapp.net')) {
                const number = normalizedSender.replace(/\D/g, '');
                if (number) {
                    normalizedSender = `${number}@s.whatsapp.net`;
                }
            }
            
            return normalizedSender === ownerId;
        }
        
        // 5) Untuk owner @lid: stripped comparison sudah ditangani di langkah 2.
        //    Jika LID adalah identifier opaque (bukan nomor telepon),
        //    user HARUS menambahkan LID aktual ke BOT_OWNER_ID di .env
        //    Gunakan debug log di handler.js untuk mengetahui LID aktual.
        return false;
    }

    /**
     * Get all owner IDs (for protection checks)
     * @returns {string[]}
     */
    getOwnerIds() {
        return this.bot.ownerIds || [];
    }

    /**
     * Check if a command is owner-only
     * @param {string} commandName - Command name
     * @returns {boolean}
     */
    isOwnerOnlyCommand(commandName) {
        return this.bot.ownerOnlyCommands.includes(commandName.toLowerCase());
    }

    validate() {
        const errors = [];

        if (this.performance.maxProcesses < 1) {
            errors.push('MAX_PROCESSES harus minimal 1');
        }

        if (this.performance.cooldownMs < 0) {
            errors.push('COOLDOWN_MS harus non-negatif');
        }

        if (!this.bot.ownerIds || this.bot.ownerIds.length === 0) {
            // Note: Using console.warn here instead of logger to avoid circular dependency
            console.warn('⚠️ PERINGATAN: BOT_OWNER_ID tidak dikonfigurasi. Perintah owner-only tidak akan berfungsi.');
        }

        if (errors.length > 0) {
            throw new Error(`Validasi konfigurasi gagal:\n${errors.join('\n')}`);
        }

        return true;
    }
}

module.exports = new Config();
