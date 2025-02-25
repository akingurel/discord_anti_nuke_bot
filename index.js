require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Whitelist JSON dosyasını yükle
let whitelist = JSON.parse(fs.readFileSync('whitelist.json')).whitelist;

// Whitelist'i dosyaya kaydetme fonksiyonu
function saveWhitelist() {
    fs.writeFileSync('whitelist.json', JSON.stringify({ whitelist }, null, 4));
}

// 📢 Bot hazır olduğunda
client.on('ready', () => {
    console.log(`${client.user.tag} is online!`);
});

// 📌 **Whitelist Komutları**
client.on('messageCreate', async (message) => {
    if (!message.content.startsWith('!whitelist') || message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[1]; // "add", "remove", "list"
    const mentionedUser = message.mentions.users.first();

    // Sadece adminler kullanabilsin
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply("⛔ Bu komutu kullanma iznin yok.");
    }

    if (command === "add") {
        if (!mentionedUser) return message.reply("⚠ Lütfen bir kullanıcı etiketleyin!");
        if (whitelist.includes(mentionedUser.id)) return message.reply("⚠ Bu kullanıcı zaten whitelist'te!");

        whitelist.push(mentionedUser.id);
        saveWhitelist();
        message.reply(`✅ ${mentionedUser.tag} whitelist'e eklendi!`);
    } 
    else if (command === "remove") {
        if (!mentionedUser) return message.reply("⚠ Lütfen bir kullanıcı etiketleyin!");
        if (!whitelist.includes(mentionedUser.id)) return message.reply("⚠ Bu kullanıcı whitelist'te değil!");

        whitelist = whitelist.filter(id => id !== mentionedUser.id);
        saveWhitelist();
        message.reply(`✅ ${mentionedUser.tag} whitelist'ten çıkarıldı!`);
    } 
    else if (command === "list") {
        const whitelistNames = whitelist.map(id => `<@${id}>`).join('\n') || "Boş!";
        message.reply(`📃 **Whitelist Listesi:**\n${whitelistNames}`);
    } 
    else {
        message.reply("⚠ Geçersiz komut! Kullanım:\n- `!whitelist add @kullanıcı`\n- `!whitelist remove @kullanıcı`\n- `!whitelist list`");
    }
});

// 🚨 **Anti-Nuke Koruma (Toplu Üye Atma ve Kanal Silme Önleme)**
client.on('guildMemberRemove', async (member) => {
    const auditLogs = await member.guild.fetchAuditLogs({ type: 22 });
    const log = auditLogs.entries.first();
    if (!log) return;

    const { executor } = log;
    if (!executor || whitelist.includes(executor.id)) return;

    if (log.extra.count >= 3) {
        const guildMember = await member.guild.members.fetch(executor.id);
        await guildMember.roles.set([]).catch(console.error);
        await member.guild.bans.create(executor.id, { reason: "Mass kicking detected!" }).catch(console.error);
        console.log(`${executor.tag} sunucudan yasaklandı!`);
    }
});

// 📌 **Süreli Mute (Timeout) Komutu**
client.on('messageCreate', async (message) => {
    if (!message.content.startsWith('-mute') || message.author.bot) return;

    const args = message.content.split(' ');
    const mentionedUser = message.mentions.members.first();
    const muteTime = args[2]; // Süre (örneğin: 10s, 5m, 2h)

    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply("⛔ **Bu komutu kullanmak için yetkin yok!**");
    }

    if (!mentionedUser) {
        return message.reply("⚠ **Lütfen mute atmak için bir kullanıcı etiketleyin!**");
    }

    if (!muteTime) {
        return message.reply("⚠ **Lütfen bir süre girin! Örnek:** `!mute @kullanıcı 10s`");
    }

    if (mentionedUser.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply("❌ **Yöneticilere mute atamazsın!**");
    }

    // Süreyi milisaniyeye çeviren fonksiyon
    function parseTime(timeString) {
        const timeValue = parseInt(timeString);
        if (timeString.endsWith("s")) return timeValue * 1000; // Saniye
        if (timeString.endsWith("m")) return timeValue * 60000; // Dakika
        if (timeString.endsWith("h")) return timeValue * 3600000; // Saat
        return null;
    }

    const muteDuration = parseTime(muteTime);
    if (!muteDuration) {
        return message.reply("⚠ **Geçersiz süre formatı!** Örnek: `10s`, `5m`, `2h`");
    }

    // Kullanıcıyı timeout (mute) yap
    try {
        await mentionedUser.timeout(muteDuration, "Süreli mute atıldı.");
        message.channel.send(`✅ **${mentionedUser.user.tag} ${muteTime} boyunca mute edildi!**`);

        // Süre dolunca mute'u kaldır
        setTimeout(async () => {
            await mentionedUser.timeout(null); // Timeout'u kaldır
            message.channel.send(`🔊 **${mentionedUser.user.tag} artık mute değil!**`);
        }, muteDuration);

    } catch (error) {
        console.error("Mute işlemi sırasında hata oluştu:", error);
        message.reply("❌ **Mute işlemi başarısız oldu! Botun yetkilerini kontrol et.**");
    }
});
// 📌 **Yanlışlıkla Mute Atılan Kullanıcıyı Unmute Etme Komutu (!unmute)**
client.on('messageCreate', async (message) => {
    if (!message.content.startsWith('-unmute') || message.author.bot) return;

    const args = message.content.split(' ');
    const mentionedUser = message.mentions.members.first();

    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply("⛔ **Bu komutu kullanmak için yetkin yok!**");
    }

    if (!mentionedUser) {
        return message.reply("⚠ **Lütfen mute kaldırmak için bir kullanıcı etiketleyin!**");
    }

    try {
        // Kullanıcının timeout'unu kaldır
        await mentionedUser.timeout(null);
        message.channel.send(`🔊 **${mentionedUser.user.tag} artık mute değil!**`);

    } catch (error) {
        console.error("Mute kaldırma işlemi sırasında hata oluştu:", error);
        message.reply("❌ **Mute kaldırma işlemi başarısız oldu! Botun yetkilerini kontrol et.**");
    }
});


client.login(process.env.TOKEN);
