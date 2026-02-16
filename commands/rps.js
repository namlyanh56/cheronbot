/**
 * Rock Paper Scissors Command
 * Play rock paper scissors with the bot
 */

const CommandBase = require('./base');

class RPSCommand extends CommandBase {
    constructor() {
        super({
            name: 'rps',
            aliases: ['rockpaperscissors'],
            description: 'Play Rock Paper Scissors',
            usage: '.rps <rock/paper/scissors>',
            category: 'fun',
            cooldown: 2000
        });

        this.choices = ['rock', 'paper', 'scissors'];
        this.emojis = {
            rock: '🪨',
            paper: '📄',
            scissors: '✂️'
        };
    }

    async execute(sock, msg, args, context) {
        const { from } = context;

        if (!args[0]) {
            return await this.reply(sock, from, msg, 
                '✊✋✌️ *Gunting Batu Kertas*\n\n' +
                '📝 *Cara Pakai:*\n' +
                '`.rps <pilihan>`\n\n' +
                '💡 *Pilihan:*\n' +
                '• rock (batu)\n' +
                '• paper (kertas)\n' +
                '• scissors (gunting)');
        }

        await this.react(sock, msg, '✊');

        try {
            const userChoice = args[0].toLowerCase();
            
            if (!this.choices.includes(userChoice)) {
                return await this.reply(sock, from, msg, 
                    '❌ *Pilihan Tidak Valid*\n\n💡 Gunakan: rock, paper, atau scissors');
            }

            const botChoice = this.choices[Math.floor(Math.random() * 3)];
            const result = this.determineWinner(userChoice, botChoice);

            const resultEmoji = result === 'win' ? '🎉' : result === 'lose' ? '😔' : '🤝';
            const resultText = result === 'win' ? 'Kamu Menang!' : result === 'lose' ? 'Kamu Kalah!' : 'Seri!';

            const response = 
`✊✋✌️ *Gunting Batu Kertas*

Pilihan kamu: ${this.emojis[userChoice]} ${userChoice}
Pilihan bot: ${this.emojis[botChoice]} ${botChoice}

${resultEmoji} **${resultText}**`;

            await this.reply(sock, from, msg, response);
            await this.react(sock, msg, resultEmoji);

        } catch (error) {
            this.logError(error, context);
            await this.reply(sock, from, msg, '❌ *Gagal Bermain*\n\n😔 Maaf, terjadi kesalahan.\n💡 Silakan coba lagi!');
        }
    }

    determineWinner(user, bot) {
        if (user === bot) return 'tie';
        
        if (
            (user === 'rock' && bot === 'scissors') ||
            (user === 'paper' && bot === 'rock') ||
            (user === 'scissors' && bot === 'paper')
        ) {
            return 'win';
        }
        
        return 'lose';
    }
}

module.exports = RPSCommand;
