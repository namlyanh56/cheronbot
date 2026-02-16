/**
 * Diagnose Command
 * System dependency checker - checks external dependencies and system status
 * Owner-only command for troubleshooting
 */

const CommandBase = require('./base');
const { spawn } = require('child_process');
const { checkCommand } = require('../utils/helpers');
const config = require('../config');
const browserManager = require('../utils/browser-manager');
const { lazyRequire } = require('../utils/helpers');

class DiagnoseCommand extends CommandBase {
    constructor() {
        super({
            name: 'diagnose',
            aliases: ['diag', 'check', 'status'],
            description: 'Check system dependencies and bot status',
            usage: '.diagnose',
            category: 'owner',
            cooldown: 3000,
            isHeavy: false,
            ownerOnly: true
        });
    }

    /**
     * Execute a command and get its version or status
     * @param {string} command - Command to execute
     * @param {string[]} args - Arguments for the command
     * @returns {Promise<string>} Output or error message
     */
    async executeCommand(command, args) {
        return new Promise((resolve) => {
            const proc = spawn(command, args);
            let stdout = '';
            let stderr = '';
            
            const timeout = setTimeout(() => {
                proc.kill();
                resolve('Timeout');
            }, 5000);
            
            proc.stdout.on('data', (data) => stdout += data);
            proc.stderr.on('data', (data) => stderr += data);
            
            proc.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 0) {
                    resolve(stdout.trim().split('\n')[0]); // First line only
                } else {
                    resolve('Not available');
                }
            });
            
            proc.on('error', () => {
                clearTimeout(timeout);
                resolve('Not found');
            });
        });
    }

    async execute(sock, msg, args, context) {
        const { from, sender } = context;

        // Owner-only check (already handled by base class, but double-check)
        if (!config.isOwner(sender)) {
            return await this.reply(sock, from, msg, 
                '🔒 *Akses Ditolak*\n\n' +
                '😔 Command ini hanya untuk owner bot.'
            );
        }

        await this.react(sock, msg, '🔍');

        try {
            // Build diagnostic report
            let report = '🔧 *System Diagnostic Report*\n\n';

            // 1. Check yt-dlp
            report += '📦 *Dependencies:*\n';
            const ytdlpAvailable = await checkCommand('yt-dlp');
            if (ytdlpAvailable) {
                const ytdlpVersion = await this.executeCommand('yt-dlp', ['--version']);
                report += `✅ yt-dlp: ${ytdlpVersion}\n`;
            } else {
                report += '❌ yt-dlp: Not installed\n';
            }

            // 2. Check ffmpeg
            const ffmpegAvailable = await checkCommand('ffmpeg');
            if (ffmpegAvailable) {
                const ffmpegVersion = await this.executeCommand('ffmpeg', ['-version']);
                report += `✅ ffmpeg: ${ffmpegVersion}\n`;
            } else {
                report += '❌ ffmpeg: Not installed\n';
            }

            // 3. Check Node.js version
            const nodeVersion = process.version;
            report += `✅ Node.js: ${nodeVersion}\n`;

            // 4. Check Puppeteer availability
            report += '\n🌐 *Browser Tools:*\n';
            const puppeteer = lazyRequire('puppeteer-extra', 'ENABLE_PUPPETEER');
            if (puppeteer) {
                const browserStats = browserManager.getStats();
                report += `✅ Puppeteer: Available\n`;
                report += `   Browser connected: ${browserStats.isConnected ? 'Yes' : 'No'}\n`;
                report += `   Open pages: ${browserStats.openPages}/${browserStats.maxPages}\n`;
            } else {
                report += '❌ Puppeteer: Disabled (ENABLE_PUPPETEER=false)\n';
            }

            // 5. Check Sharp availability
            report += '\n🖼️ *Image Processing:*\n';
            const sharp = lazyRequire('sharp', 'ENABLE_SHARP');
            if (sharp) {
                report += '✅ Sharp: Available\n';
            } else {
                report += '❌ Sharp: Disabled (ENABLE_SHARP=false)\n';
            }

            // 6. Check API keys (show status, not actual keys)
            report += '\n🔑 *API Keys:*\n';
            report += config.apis.elevenlabs.key ? '✅ ElevenLabs: Configured\n' : '❌ ElevenLabs: Not set\n';
            report += config.apis.omdb ? '✅ OMDB: Configured\n' : '❌ OMDB: Not set\n';
            report += config.apis.gemini ? '✅ Gemini: Configured\n' : '❌ Gemini: Not set\n';

            // 7. Check proxy status
            report += '\n🌐 *Network:*\n';
            if (config.proxy.enabled) {
                report += `✅ Proxy: Enabled\n`;
                report += `   Host: ${config.proxy.host}:${config.proxy.port}\n`;
                report += `   Auth: ${config.proxy.user ? 'Yes' : 'No'}\n`;
            } else {
                report += '❌ Proxy: Disabled\n';
            }

            // 8. Bot owner info
            report += '\n👤 *Bot Owner:*\n';
            const ownerIds = config.getOwnerIds();
            report += `   IDs: ${ownerIds.length} configured\n`;
            report += `   Your ID: ${sender}\n`;

            // 9. System resources
            report += '\n💻 *System:*\n';
            const uptime = process.uptime();
            const uptimeHours = Math.floor(uptime / 3600);
            const uptimeMinutes = Math.floor((uptime % 3600) / 60);
            report += `⏱️ Uptime: ${uptimeHours}h ${uptimeMinutes}m\n`;
            
            const memUsage = process.memoryUsage();
            const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
            report += `💾 Memory: ${memUsedMB}MB / ${memTotalMB}MB\n`;

            await this.reply(sock, from, msg, report);
            await this.react(sock, msg, '✅');

        } catch (error) {
            this.logError(error, context);
            await this.reply(sock, from, msg, 
                '❌ *Diagnostic Failed*\n\n' +
                '😔 Gagal menjalankan diagnostic.\n' +
                '💡 Cek log untuk detail error.'
            );
        }
    }
}

module.exports = DiagnoseCommand;
