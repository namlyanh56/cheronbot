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
                '❌ Feature not available!\n\n' +
                'The sticker command requires Sharp library.\n' +
                'This dependency is currently disabled via environment configuration.\n\n' +
                'Contact admin to enable: ENABLE_SHARP=true'
            );
        }

        await this.react(sock, msg, '⏳');

        try {
            // Get image from message or quoted message
            const isImg = msg.message.imageMessage;
            const isQuoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

            const imageMessage = isImg || isQuoted;
            if (!imageMessage) {
                return await this.reply(sock, from, msg, '❌ Kirim atau reply gambar dulu!');
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
            await this.reply(sock, from, msg, '❌ Gagal membuat stiker. Pastikan gambarnya valid.');
        }
    }
}

module.exports = StickerCommand;
