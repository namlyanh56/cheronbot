/**
 * Shared Helper Functions
 * Common utilities used across the application
 */

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { spawn } = require('child_process');
const fsPromises = require('fs').promises;
const os = require('os');
const path = require('path');
const httpClient = require('./http-client');
const security = require('./security');

// --- LAZY REQUIRE CACHE FOR HEAVY DEPENDENCIES ---
const lazyRequireCache = {};

/**
 * Lazy require for heavy dependencies with env toggle
 * @param {string} moduleName - Name of module (puppeteer, sharp, canvas)
 * @param {string} envVar - Environment variable to check (ENABLE_PUPPETEER, ENABLE_SHARP, ENABLE_CANVAS)
 * @returns {Object|null} Module or null if disabled
 */
function lazyRequire(moduleName, envVar) {
    // Check if disabled via env
    if (process.env[envVar] === 'false') {
        return null;
    }
    
    // Return cached module if already loaded
    if (lazyRequireCache[moduleName]) {
        return lazyRequireCache[moduleName];
    }
    
    // Try to load the module
    try {
        const module = require(moduleName);
        lazyRequireCache[moduleName] = module;
        return module;
    } catch (error) {
        console.warn(`[LazyRequire] Failed to load ${moduleName}: ${error.message}`);
        return null;
    }
}

// --- HELPER FUNCTIONS ---

/**
 * Spawn Promise (Safe async process execution)
 */
function spawnPromise(command, args) {
    return new Promise((resolve, reject) => {
        // Validate command to prevent injection
        const allowedCommands = ['yt-dlp', 'ffmpeg', 'ping', 'node', 'python3'];
        if (!allowedCommands.includes(command)) {
            return reject(new Error('Command not allowed'));
        }

        const proc = spawn(command, args);
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (data) => stdout += data);
        proc.stderr.on('data', (data) => stderr += data);
        proc.on('close', (code) => {
            if (code === 0) resolve(stdout);
            else reject(new Error(stderr || `Command failed with code ${code}`));
        });
        proc.on('error', (err) => reject(err));
    });
}

/**
 * Sleep utility
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Format bytes to human readable string
 */
const formatSize = (bytes) => {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + " GB";
    else if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + " MB";
    else if (bytes >= 1024) return (bytes / 1024).toFixed(2) + " KB";
    else return bytes + " bytes";
};

/**
 * Random User Agent selector
 */
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];
const getRandomUA = () => userAgents[Math.floor(Math.random() * userAgents.length)];

/**
 * Download media from WhatsApp message
 */
async function downloadMedia(message, type) {
    const stream = await downloadContentFromMessage(message, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) { 
        buffer = Buffer.concat([buffer, chunk]); 
    }
    return buffer;
}

/**
 * Translate text using Google Translate
 * Uses HTTP client with proxy support
 */
async function fungsiTranslate(text, targetLang = 'id') {
    try {
        // Sanitize input
        const sanitizedText = security.sanitizeInput(text, 5000);
        
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(sanitizedText)}`;
        const { data } = await httpClient.get(url, { timeout: 5000 });
        return data[0].map(x => x[0]).join(''); 
    } catch (e) { 
        return text; 
    }
}

/**
 * Smart IMDb search via DuckDuckGo
 * Uses HTTP client with proxy support
 */
async function smartSearchIMDb(query) {
    try {
        // Sanitize query
        const sanitizedQuery = security.sanitizeInput(query, 100);
        
        const url = `https://html.duckduckgo.com/html/?q=site:imdb.com/title ${encodeURIComponent(sanitizedQuery)}`;
        const { data } = await httpClient.get(url, { 
            headers: { 'User-Agent': getRandomUA() },
            timeout: 5000
        });
        const idMatch = data.match(/\/title\/(tt\d{6,10})\/?/);
        return (idMatch && idMatch[1]) ? idMatch[1] : null;
    } catch (e) { 
        return null; 
    }
}

/**
 * Get valid high-resolution poster URL
 * Uses HTTP client with proxy support
 * Tries multiple HD resolutions, falls back to original if none available
 */
async function getValidPosterUrl(originalUrl) {
    if (!originalUrl || originalUrl === 'N/A') {
        return 'https://via.placeholder.com/600x900?text=No+Poster';
    }
    
    // HD resolutions to try (from highest to lowest)
    const hdResolutions = ['SX2000', 'SX1500', 'SX1200', 'SX1000', 'SX800'];
    
    for (const resolution of hdResolutions) {
        const hdUrl = originalUrl.replace(/\._V1_.*\.jpg$/i, `._V1_${resolution}.jpg`);
        
        try {
            await httpClient.head(hdUrl, { timeout: 2000 });
            return hdUrl;
        } catch {
            // Try next resolution
        }
    }
    
    // All HD attempts failed, return original URL
    return originalUrl;
}

/**
 * Validate and sanitize input (wrapper for security manager)
 */
function sanitizeInput(input, maxLength = 500) {
    return security.sanitizeInput(input, maxLength);
}

/**
 * Generate unique filename (without path)
 */
function generateFilename(prefix = 'file', extension = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}${extension ? '.' + extension : ''}`;
}

/**
 * Create temporary file path in OS temp directory
 * @param {string} prefix - File prefix
 * @param {string} extension - File extension (without dot)
 * @returns {string} Full path to temp file
 */
function createTempFile(prefix = 'file', extension = '') {
    const filename = generateFilename(prefix, extension);
    return path.join(os.tmpdir(), filename);
}

/**
 * Clean up temporary files by prefix (searches in current dir and OS temp dir)
 */
async function cleanupFiles(prefix) {
    try {
        let count = 0;
        
        // Clean from current directory (legacy support)
        try {
            const files = await fsPromises.readdir('./');
            const junk = files.filter(x => x.startsWith(prefix));
            await Promise.all(junk.map(j => fsPromises.unlink(j).catch(() => {})));
            count += junk.length;
        } catch (e) {
            // Ignore errors
        }
        
        // Clean from OS temp directory
        try {
            const tempFiles = await fsPromises.readdir(os.tmpdir());
            const tempJunk = tempFiles.filter(x => x.startsWith(prefix));
            await Promise.all(tempJunk.map(j => 
                fsPromises.unlink(path.join(os.tmpdir(), j)).catch(() => {})
            ));
            count += tempJunk.length;
        } catch (e) {
            // Ignore errors
        }
        
        return count;
    } catch (e) {
        return 0;
    }
}

/**
 * Safe file cleanup - delete a single file
 * @param {string} filePath - Path to file to delete
 * @returns {Promise<boolean>} True if deleted, false otherwise
 */
async function cleanupFile(filePath) {
    try {
        if (!filePath) return false;
        await fsPromises.unlink(filePath);
        return true;
    } catch (e) {
        // File might not exist or permission denied, ignore
        return false;
    }
}

/**
 * Periodic cleanup of old temp files (30+ minutes old)
 * @param {string[]} prefixes - Array of prefixes to clean (e.g., ['music_', 'video_', 'sticker_'])
 */
async function periodicTempCleanup(prefixes = []) {
    try {
        const tempDir = os.tmpdir();
        const files = await fsPromises.readdir(tempDir);
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes
        
        let cleaned = 0;
        
        for (const file of files) {
            // Check if file matches any prefix
            const matchesPrefix = prefixes.length === 0 || prefixes.some(prefix => file.startsWith(prefix));
            if (!matchesPrefix) continue;
            
            try {
                const filePath = path.join(tempDir, file);
                const stats = await fsPromises.stat(filePath);
                const age = now - stats.mtimeMs;
                
                if (age > maxAge) {
                    await fsPromises.unlink(filePath);
                    cleaned++;
                }
            } catch (e) {
                // Skip files we can't access
            }
        }
        
        if (cleaned > 0) {
            console.log(`[TempCleanup] Cleaned ${cleaned} old temp files`);
        }
        
        return cleaned;
    } catch (e) {
        // Ignore errors in cleanup
        return 0;
    }
}

/**
 * Check if string is a valid URL
 */
function isValidUrl(string) {
    return /^https?:\/\//i.test(string);
}

module.exports = {
    spawnPromise,
    sleep,
    formatSize,
    getRandomUA,
    downloadMedia,
    fungsiTranslate,
    smartSearchIMDb,
    getValidPosterUrl,
    sanitizeInput,
    generateFilename,
    createTempFile,
    cleanupFiles,
    cleanupFile,
    periodicTempCleanup,
    isValidUrl,
    lazyRequire
};
