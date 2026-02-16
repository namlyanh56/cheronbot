/**
 * Enhanced Message Handler with Security
 * Main message processing with security controls
 */

require('dotenv').config();
const config = require('./config');
const cache = require('./utils/cache');
const RateLimiter = require('./utils/rate-limiter');
const logger = require('./utils/logger');
const security = require('./utils/security');
const commandRegistry = require('./commands/registry');
const path = require('path');

// Initialize rate limiter
const rateLimiter = new RateLimiter(
    config.performance.rateLimitWindow,
    config.performance.rateLimitMax
);

// Queue management
let activeProcesses = 0;
const userCooldowns = new Map();

/**
 * Main message handler with security
 */
module.exports = async (sock, m) => {
    const startTime = Date.now();
    let isHeavyCommand = false;
    let command = null;

    try {
        const msg = m.messages[0];
        if (!msg.message) return;
        if (msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        const isGroup = from.endsWith('@g.us');

        // Private mode: ignore private messages if ONLY_GROUP_MODE is enabled
        if (config.bot.onlyGroupMode && !isGroup) {
            return; // Silently ignore private messages
        }

        // USER REGISTRATION: Register new users on first message
        const isNewUser = security.registerUserIfNew(sender);

        // GREETING: Send welcome message to new users (first message only)
        if (isNewUser && !security.wasGreetingSent(sender)) {
            const greetingMsg = `✨ *Halo! Selamat Datang di Cheron Bot Asisten* ✨\n\n` +
                `👋 Terima kasih telah menghubungi saya!\n` +
                `🎫 Akun Anda telah terdaftar, namun perlu persetujuan admin untuk menggunakan fitur bot.\n\n` +
                `⏳ Mohon tunggu konfirmasi dari administrator ya!`;
            
            await sock.sendMessage(from, { text: greetingMsg }, { quoted: msg });
            security.markGreetingSent(sender);
        }

        // SECURITY: Check if user is blocked
        if (security.isUserBlocked(sender)) {
            // Get block info with remaining time
            const blockInfo = security.getBlockInfo(sender);
            if (blockInfo) {
                const denialMsg = `🚫 *Akses Diblokir* 🚫\n\n` +
                    `😔 Maaf, akses Anda sedang diblokir.\n` +
                    `📌 Alasan: ${blockInfo.reason}\n` +
                    `⏰ Waktu tersisa: ${blockInfo.remainingMinutes} menit`;
                
                await sock.sendMessage(from, { text: denialMsg }, { quoted: msg });
            }
            logger.warn('Blocked user attempted command', { userId: sender.split('@')[0] });
            return;
        }

        // Extract text content
        const content = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        "";

        let textBody = content.trim();
        
        // Check for command prefix
        if (!textBody.startsWith(config.bot.prefix)) return;
        
        // SECURITY: Sanitize input
        textBody = security.sanitizeInput(textBody, 2000);
        
        // Clean up prefix
        if (textBody.startsWith(config.bot.prefix + ' ')) {
            textBody = config.bot.prefix + textBody.slice(2).trim();
        }

        const commandName = textBody.split(' ')[0].toLowerCase().slice(config.bot.prefix.length);
        const args = textBody.trim().split(/ +/).slice(1);

        // SECURITY: Detect malicious patterns (only if chat filter is enabled)
        if (config.security.chatFilterEnabled) {
            const maliciousCheck = security.detectMaliciousPatterns(textBody);
            if (maliciousCheck.isMalicious) {
                security.logSecurityEvent('malicious_pattern_detected', {
                    userId: sender,
                    command: commandName,
                    pattern: maliciousCheck.pattern
                });
                
                security.trackSuspiciousActivity(sender, 'malicious_pattern');
                
                return await sock.sendMessage(from, { 
                    text: '⚠️ *Peringatan Keamanan*\n\n❌ Pesan Anda mengandung pola mencurigakan dan telah diblokir untuk keamanan sistem.' 
                }, { quoted: msg });
            }
        }

        // Get command from registry
        command = commandRegistry.get(commandName);
        
        // ACCESS CONTROL: Check if user is allowed to use commands
        // Owner always has access, other users need explicit allowlist
        if (!security.isUserAllowed(sender)) {
            // Polite denial message for unallowed users (even for unknown commands)
            const denialMsg = `🔐 *Akses Terbatas* 🔐\n\n` +
                `😊 Maaf, Anda belum mendapat izin menggunakan bot ini.\n` +
                `📧 Silakan hubungi admin untuk mendapatkan akses.`;
            
            return await sock.sendMessage(from, { text: denialMsg }, { quoted: msg });
        }
        
        // If command not found, silently ignore (only for allowed users)
        if (!command) return;

        // Build context
        const context = {
            from,
            sender,
            isGroup,
            commandName,
            startTime
        };

        // Log command
        logger.command(logger.formatCommand(commandName, sender, from, isGroup));

        // SECURITY: Validate command arguments
        const argsValidation = security.validateCommandArgs(commandName, args);
        if (!argsValidation.valid) {
            security.logSecurityEvent('invalid_arguments', {
                userId: sender,
                command: commandName,
                reason: argsValidation.reason
            });
            
            return await sock.sendMessage(from, { 
                text: `⚠️ *Peringatan Keamanan*\n\n${argsValidation.reason}` 
            }, { quoted: msg });
        }

        // SECURITY: Check permissions
        const permission = security.checkPermission(sender, commandName, isGroup);
        if (!permission.allowed) {
            security.logSecurityEvent('permission_denied', {
                userId: sender,
                command: commandName,
                reason: permission.reason
            });
            
            return await sock.sendMessage(from, { 
                text: `🔒 *Akses Ditolak*\n\n${permission.reason}` 
            }, { quoted: msg });
        }

        // --- Rate Limiting ---
        const rateLimit = rateLimiter.check(sender);
        if (!rateLimit.allowed) {
            security.trackSuspiciousActivity(sender, 'rate_limit_exceeded');
            return sock.sendMessage(from, { 
                text: `⏳ *Mohon Tunggu Sebentar*\n\n🔄 Batas request tercapai.\n⏱️ Coba lagi dalam ${rateLimit.retryAfter} detik ya!` 
            }, { quoted: msg });
        }

        // --- Cooldown (Simple anti-spam) ---
        if (userCooldowns.has(sender)) {
            return;
        }
        userCooldowns.set(sender, true);
        setTimeout(() => userCooldowns.delete(sender), command.cooldown || config.performance.cooldownMs);

        // --- Queue Management for Heavy Commands ---
        isHeavyCommand = command.isHeavy;
        if (isHeavyCommand) {
            if (activeProcesses >= config.performance.maxProcesses) {
                return sock.sendMessage(from, { 
                    text: `⚙️ *Server Sedang Sibuk*\n\n🔄 Proses: ${activeProcesses}/${config.performance.maxProcesses}\n⏳ Mohon tunggu sebentar...` 
                }, { quoted: msg });
            }
            activeProcesses++;
        }

        // --- Validate Command ---
        const validation = await command.validate(msg, context);
        if (!validation.valid) {
            return sock.sendMessage(from, { text: validation.error }, { quoted: msg });
        }

        // --- Execute Command ---
        await command.execute(sock, msg, args, context);

        // Log performance
        const duration = Date.now() - startTime;
        command.log(context, duration, true);

    } catch (err) {
        logger.error(err, { 
            command: command?.name || 'unknown',
            sender: m.messages[0]?.key?.participant || 'unknown'
        });

        // SECURITY: Track errors as potential security events
        if (err.message.includes('injection') || err.message.includes('attack')) {
            const sender = m.messages[0]?.key?.participant || m.messages[0]?.key?.remoteJid;
            security.trackSuspiciousActivity(sender, 'error_based_attack');
        }

        // Send error message to user
        try {
            const from = m.messages[0]?.key?.remoteJid;
            if (from) {
                await sock.sendMessage(from, { 
                    text: '❌ *Ups! Terjadi Kesalahan*\n\n😔 Maaf, terjadi kesalahan saat memproses perintah Anda.\n💡 Silakan coba lagi atau hubungi admin.' 
                }, { quoted: m.messages[0] });
            }
        } catch (sendError) {
            logger.error(sendError, { context: 'error-message-send' });
        }

    } finally {
        if (isHeavyCommand && activeProcesses > 0) {
            activeProcesses--;
        }
    }
};

// Load all commands
try {
    const commandsPath = path.join(__dirname, 'commands');
    commandRegistry.loadFromDirectory(commandsPath);
    logger.info('Command system initialized');
} catch (error) {
    logger.error(error, { context: 'command-loading' });
}

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down handler...');
    cache.destroy();
    rateLimiter.destroy();
    process.exit(0);
});
