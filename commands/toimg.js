/**
 * ToImg Command
 * Convert WhatsApp stickers to images
 */

const CommandBase = require('./base');
const { downloadMedia, createTempFile, cleanupFile } = require('../utils/helpers');
const { spawnPromise } = require('../utils/helpers');
const fsPromises = require('fs').promises;

class ToImgCommand extends CommandBase {
    constructor() {
        super({
            name: 'toimg',
            aliases: ['toimage', 'stickertoimg'],
            description: 'Convert sticker to image',
            usage: '.toimg (reply to a sticker)',
            category: 'tools',
            cooldown: 3000
        });
    }

    async execute(sock, msg, args, context) {
        const { from } = context;

        // Check if replying to a sticker
        const quotedSticker = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;

        if (!quotedSticker) {
            return await this.reply(sock, from, msg, '❌ *Stiker Diperlukan*\n\n📝 Reply ke stiker dan ketik `.toimg`\n\n💡 *Cara Pakai:*\nReply stiker dengan perintah `.toimg`');
        }

        await this.react(sock, msg, '🖼️');

        const webpFile = createTempFile('sticker', 'webp');
        const pngFile = createTempFile('sticker', 'png');

        try {
            // Download sticker
            const stickerBuffer = await downloadMedia(quotedSticker, 'sticker');

            // Save as webp
            await fsPromises.writeFile(webpFile, stickerBuffer);

            // Convert to PNG using ffmpeg
            await spawnPromise('ffmpeg', [
                '-i', webpFile,
                pngFile,
                '-y'
            ]);

            // Read and send PNG
            const imageBuffer = await fsPromises.readFile(pngFile);
            await sock.sendMessage(from, {
                image: imageBuffer,
                caption: '✅ Sticker converted to image'
            }, { quoted: msg });

            await this.react(sock, msg, '✅');

        } catch (error) {
            this.logError(error, context);
            await this.reply(sock, from, msg, '❌ *Gagal Konversi Stiker*\n\n😔 Maaf, gagal mengonversi stiker.\n💡 Pastikan FFmpeg terinstal.');
        } finally {
            // Cleanup
            await cleanupFile(webpFile);
            await cleanupFile(pngFile);
        }
    }
}

module.exports = ToImgCommand;
