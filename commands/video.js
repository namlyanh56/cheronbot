/**
 * Video Command
 * Download videos from various platforms (TikTok, Instagram, Facebook, YouTube, etc.)
 * Supports 30+ platforms including short URLs (vt.tiktok.com, youtu.be, fb.watch, etc.)
 */

const CommandBase = require('./base');
const { spawn } = require('child_process');
const { createTempFile, cleanupFiles, isValidUrl, checkCommand } = require('../utils/helpers');
const { identifyPlatform, isVideoSupported, getPlatformArgs, getSupportedPlatformsText } = require('../utils/url-parser');
const fsPromises = require('fs').promises;
const path = require('path');
const config = require('../config');

// Video format selector: prefer mp4, fallback to best available
const VIDEO_FORMAT_SELECTOR = 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best';
// Download timeout: 120 seconds
const DOWNLOAD_TIMEOUT = 120000;

class VideoCommand extends CommandBase {
    constructor() {
        super({
            name: 'video',
            aliases: ['vid', 'dl', 'download'],
            description: 'Download video dari berbagai platform',
            usage: '.video <url>',
            category: 'media',
            cooldown: 5000,
            isHeavy: true
        });
    }

    /**
     * Execute yt-dlp as binary CLI
     * Uses yt-dlp binary directly (not python3 -m yt_dlp)
     */
    spawnYtDlp(args) {
        return new Promise((resolve, reject) => {
            const proc = spawn('yt-dlp', args);
            let stdout = '';
            let stderr = '';
            
            // Set timeout
            const timeout = setTimeout(() => {
                proc.kill();
                reject(new Error('yt-dlp timeout after 120 seconds'));
            }, DOWNLOAD_TIMEOUT);
            
            proc.stdout.on('data', (data) => stdout += data);
            proc.stderr.on('data', (data) => stderr += data);
            
            proc.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 0) resolve(stdout);
                else reject(new Error(stderr || `yt-dlp failed with code ${code}`));
            });
            
            proc.on('error', (err) => {
                clearTimeout(timeout);
                if (err.code === 'ENOENT') {
                    reject(new Error('yt-dlp not found. Please install yt-dlp binary.'));
                } else {
                    reject(err);
                }
            });
        });
    }

    async execute(sock, msg, args, context) {
        const { from } = context;

        // Get supported platforms for help message
        const supportedPlatforms = getSupportedPlatformsText();

        if (!args[0]) {
            return await this.reply(sock, from, msg, 
                '📹 *Video Downloader*\n\n' +
                '📝 *Cara Pakai:*\n' +
                '.video <url>\n\n' +
                '🔗 *Contoh URL yang didukung:*\n' +
                '• TikTok: https://vt.tiktok.com/xxx\n' +
                '• YouTube: https://youtu.be/xxx\n' +
                '• Instagram: https://instagram.com/reel/xxx\n' +
                '• Facebook: https://fb.watch/xxx\n' +
                '• Twitter/X: https://x.com/user/status/xxx\n\n' +
                `🌐 *Platform Didukung:*\n${supportedPlatforms.video}`
            );
        }

        // Check if yt-dlp is available
        const ytdlpAvailable = await checkCommand('yt-dlp');
        if (!ytdlpAvailable) {
            return await this.reply(sock, from, msg, 
                '❌ *Dependency Tidak Tersedia*\n\n' +
                '😔 yt-dlp belum terinstal di sistem.\n' +
                '📧 Hubungi admin untuk menginstal yt-dlp.\n\n' +
                '💡 Instalasi: `pip install yt-dlp` atau `brew install yt-dlp`'
            );
        }

        // Validate URL
        const url = args[0];
        if (!isValidUrl(url)) {
            return await this.reply(sock, from, msg, '❌ URL tidak valid! Harus dimulai dengan http:// atau https://');
        }

        // Additional URL structure validation
        try {
            new URL(url);
        } catch (e) {
            return await this.reply(sock, from, msg, '❌ Format URL tidak valid! Pastikan URL lengkap dan benar.');
        }

        // Identify platform using comprehensive URL parser
        const platformInfo = identifyPlatform(url);
        
        // Check if URL is from a supported video platform
        if (!isVideoSupported(url)) {
            // Even if not recognized, let yt-dlp try - it supports many more sites
            // Just warn the user
        }

        await this.react(sock, msg, '⏳');

        const tempFile = createTempFile('video', 'mp4');
        const tempDir = path.dirname(tempFile);
        const tempBase = path.basename(tempFile, '.mp4');
        const filePrefix = path.join(tempDir, tempBase);
        
        // Build proxy args from config - uses getYtDlpProxyArgs method
        const proxyArgs = config.getYtDlpProxyArgs();

        // Get platform-specific arguments
        const platformArgs = getPlatformArgs(url);

        try {
            // Show platform name if identified
            if (platformInfo) {
                await this.react(sock, msg, '📹');
            } else {
                await this.react(sock, msg, '🔍');
            }
            
            // Build info args with platform-specific settings
            const infoArgs = [
                url,
                '--dump-json',
                '--no-playlist',
                '--force-ipv4',
                ...platformArgs,
                ...proxyArgs
            ];

            let videoTitle = 'Video';
            let videoDuration = 0;

            try {
                const infoResult = await this.spawnYtDlp(infoArgs);
                const videoInfo = JSON.parse(infoResult.trim().split('\n')[0]);
                
                videoTitle = videoInfo.title || 'Video';
                videoDuration = videoInfo.duration || 0;
                
                // Check duration limit
                if (videoDuration > config.media.maxDuration) {
                    return await this.reply(sock, from, msg, '❌ Video terlalu panjang. Coba video yang lebih pendek ya!');
                }
            } catch (infoError) {
                // If info extraction fails, continue with download anyway
                this.logError(infoError, context);
            }

            // Download video with highest quality available
            // yt-dlp will automatically select the best format
            const outputPath = `${filePrefix}.%(ext)s`;
            const downloadArgs = [
                url,
                '-f', VIDEO_FORMAT_SELECTOR,
                '--merge-output-format', 'mp4',  // Ensure output is mp4
                '-o', outputPath,
                '--max-filesize', '200M',        // Safety cap for 3GB data limit
                '--force-ipv4',
                '--no-warnings',
                ...platformArgs,
                ...proxyArgs
            ];

            await this.spawnYtDlp(downloadArgs);

            // Find downloaded file in temp directory
            const files = await fsPromises.readdir(tempDir);
            const videoFile = files.find(x => 
                x.startsWith(tempBase) && (x.endsWith('.mp4') || x.endsWith('.mkv') || x.endsWith('.webm'))
            );

            if (!videoFile) {
                // Check if file was too large
                const anyFile = files.find(x => x.startsWith(tempBase));
                if (!anyFile) {
                    throw new Error('File too large or download failed');
                }
                throw new Error('Video download failed');
            }

            // Check file size before sending
            const videoPath = path.join(tempDir, videoFile);
            const stats = await fsPromises.stat(videoPath);
            if (stats.size > 200 * 1024 * 1024) { // 200MB
                await cleanupFiles(tempBase);
                return await this.reply(sock, from, msg, '📦 Waduh, filenya kegedean bro (>200MB)! Coba video yang lebih pendek ya 😅');
            }

            // Send video
            const videoBuffer = await fsPromises.readFile(videoPath);
            await sock.sendMessage(from, {
                video: videoBuffer,
                mimetype: 'video/mp4',
                caption: `📹 ${videoTitle}`
            }, { quoted: msg });

            await this.react(sock, msg, '✅');

        } catch (error) {
            this.logError(error, context);
            
            // Friendly error messages
            let errorMsg = '❌ Gagal download video.';
            if (error.message.includes('yt-dlp not found') || error.message.includes('ENOENT')) {
                errorMsg = '❌ *Dependency Tidak Tersedia*\n\n😔 yt-dlp belum terinstal.\n📧 Hubungi admin.';
            } else if (error.message.includes('timeout')) {
                errorMsg = '⏱️ Proses download timeout (>120 detik). Video terlalu besar atau koneksi lambat.';
            } else if (error.message.includes('too large') || error.message.includes('>200MB')) {
                errorMsg = '📦 Waduh, filenya kegedean bro (>200MB)! Coba video yang lebih pendek ya 😅';
            } else if (error.message.includes('Unsupported URL') || error.message.includes('not supported')) {
                errorMsg = '❌ URL tidak didukung. Coba platform lain.';
            } else if (error.message.includes('Private') || error.message.includes('restricted')) {
                errorMsg = '🔒 Video ini private atau restricted.';
            } else if (error.message.includes('Not available') || error.message.includes('removed')) {
                errorMsg = '❌ Video tidak tersedia atau sudah dihapus.';
            } else if (error.message.includes('TransportError')) {
                errorMsg = '⏱️ Koneksi timeout. Coba lagi nanti!';
            } else if (error.message.includes('Unable to download') || error.message.includes('Connection refused')) {
                errorMsg = '🌐 Koneksi gagal. Coba lagi nanti!';
            }
            
            await this.reply(sock, from, msg, errorMsg);
        } finally {
            // Cleanup temporary files immediately
            await cleanupFiles(tempBase);
        }
    }
}

module.exports = VideoCommand;
