const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const bwishCommand = new SlashCommandBuilder()
    .setName('bwish')
    .setDescription('Wish a happy birthday to someone')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('The user to wish')
            .setRequired(true));

function getRandomBirthdayMessage(userMention) {
    const messages = [
        `🎉 **HAPPY BIRTHDAY** 🎉\n\nA special shoutout to the amazing ${userMention} on their special day! 🥳\n\nMay your day be filled with cake, joy, and lots of love! 🎂❤️`,
        `🎈🎊 **BIRTHDAY CELEBRATION TIME!** 🎊🎈\n\nEveryone please wish a very happy birthday to the wonderful ${userMention}! 🎂\n\nHope you have an absolutely fantastic day! 🌟✨`,
        `🌟 **SPECIAL DAY ALERT!** 🌟\n\nToday we're celebrating the birthday of the incredible ${userMention}! 🎉\n\nWishing you endless happiness and amazing memories! 🎁💫`,
        `🥳 **IT'S BIRTHDAY TIME!** 🥳\n\nAll the confetti and cake belong to ${userMention} today! 🎂\n\nHope your day is as awesome as you are! 💖✨`,
        ` **HAPPY BIRTHDAY TO YOU!** \n\nA very special birthday wish for the one and only ${userMention}! 🎉\n\nMay your year ahead be filled with success and joy! 🌟💫`,
        `**HAPPY BDAY TWIN!** \n\nToday belongs to the wonderful ${userMention}! 🎉\n\nHope your birthday is as beautiful as you are! 💝✨`,
        ` **SPECIAL DAY AHEAD!** \n\nThe universe decided to make an extra amazing person on this day, and that person is ${userMention}! 🎂\n\nHave the most fantastic birthday ever! 🌟💫`,
        `🎨 **MASTERPIECE BIRTHDAY!** 🎨\n\n${userMention} woke up today and chose to be legendary! 🎉\n\nWishing you a day filled with joy, laughter, and all your favorite things! 🎁✨`
    ];

    return messages[Math.floor(Math.random() * messages.length)];
}

async function handleBwish(interaction) {
    try {
        const targetUser = interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!member) {
            await interaction.editReply('❌ That user is not in this server.');
            return;
        }

        const message = getRandomBirthdayMessage(`${member}`);

        const embed = new EmbedBuilder()
            .setTitle('🎂 **BIRTHDAY WISHES** 🎂')
            .setDescription(message)
            .setColor(0xff69b4)
            .setThumbnail('https://cdn.discordapp.com/emojis/1444539060004589669.webp?size=128')
            .setImage('https://media.tenor.com/ZtP8c9c4QoIAAAAi/happy-birthday-birthday.gif')
            .setFooter({
                text: `Wished by ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.editReply({
            content: `${member}`,
            embeds: [embed]
        });

    } catch (error) {
        console.error('❌ /bwish error:', error);
        await interaction.editReply('❌ An error occurred while sending birthday wishes.');
    }
}

module.exports = {
    bwishCommand,
    handleBwish
};