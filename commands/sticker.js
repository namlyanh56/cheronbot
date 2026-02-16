/**
 * Sticker Command
 * Convert images to WhatsApp stickers
 */

const CommandBase = require('./base');
const { lazyRequire } = require('../utils/helpers');
const { downloadMedia } = require('../utils/helpers');

class StickerCommand extends CommandBase {
    constructor() {
        super({
            name: 'sticker',
            aliases: ['s', 'stiker', 'stik'],
            description: 'Ubah gambar menjadi stiker',
            usage: '.sticker (kirim dengan gambar atau reply gambar)',
            category: 'tools',
            cooldown: 3000,
            isHeavy: false,
            requiresMedia: true
        });
        
        // Lazy load sharp
        this.sharp = null;
        this._initDependencies();
    }
    
    /**
     * Initialize dependencies with lazy loading
     */
    _initDependencies() {
        this.sharp = lazyRequire('sharp', 'ENABLE_SHARP');
    }

    async execute(sock, msg, args, context) {
        const { from } = context;
        
        // Check if sharp is available
        if (!this.sharp) {
            return await this.reply(sock, from, msg,
                '❌ *Fitur Tidak Tersedia*\n\n' +
                '😔 Perintah sticker memerlukan Sharp.\n' +
                'Dependensi ini sedang dinonaktifkan.\n\n' +
                '💡 Hubungi admin untuk mengaktifkan: ENABLE_SHARP=true'
            );
        }

        await this.react(sock, msg, '⏳');

        try {
            // Get image from message or quoted message
            const isImg = msg.message.imageMessage;
            const isQuoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

            const imageMessage = isImg || isQuoted;
            if (!imageMessage) {
                return await this.reply(sock, from, msg, '❌ *Gambar Diperlukan*\n\n📝 Kirim atau reply gambar terlebih dahulu!\n\n💡 *Cara Pakai:*\nKirim gambar dengan caption `.sticker` atau reply gambar dengan `.sticker`');
            }

            // Download image
            const buffer = await downloadMedia(imageMessage, 'image');

            // Convert to sticker format
            const stickerBuffer = await this.sharp(buffer)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .webp({ quality: 90 })
                .toBuffer();

            // Send sticker
            await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
            await this.react(sock, msg, '✅');

        } catch (error) {
            this.logError(error, context);
            await this.reply(sock, from, msg, '❌ *Gagal Membuat Stiker*\n\n😔 Maaf, gagal membuat stiker.\n💡 Pastikan gambarnya valid.');
        }
    }
}

module.exports = StickerCommand;
