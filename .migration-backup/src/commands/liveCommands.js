const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getFirestoreInstance, convertFirestoreData } = require('../firebaseClient');
const { setThumbnailIfValid } = require('../utils/discordEmbeds');
const { collectAllPros } = require('./pros');
const cache = require('../utils/cache');

const gamesCommand = new SlashCommandBuilder()
  .setName('games')
  .setDescription('List all games that have pros or placements (live from site).');

const latestCommand = new SlashCommandBuilder()
  .setName('latest')
  .setDescription('Show the single latest news article from the website.');

const randomProCommand = new SlashCommandBuilder()
  .setName('random_pro')
  .setDescription('Pick a random pro from the full roster (live from site).');

const GAMES_CACHE_KEY = 'games_list';
const LATEST_NEWS_CACHE_KEY = 'latest_news';
const CACHE_TTL = 300; // 5 minutes

async function getGames() {
  const cached = cache.get(GAMES_CACHE_KEY);
  if (cached) return cached;

  const db = getFirestoreInstance();
  const [placementsSnap, allPros] = await Promise.all([
    db.collection('placements').get().catch(() => ({ docs: [] })),
    collectAllPros(db, null)
  ]);
  
  const games = new Set();
  
  allPros.forEach(p => { 
    if (p.game) {
      let gameName = p.game.trim();
      if (gameName.toLowerCase() === 'fortnite') gameName = 'Fortnite';
      games.add(gameName);
    }
  });
  
  if (placementsSnap.docs) {
    (placementsSnap.docs || []).forEach(doc => {
      const p = convertFirestoreData(doc);
      if (p.game) {
        let gameName = p.game.trim();
        if (gameName.toLowerCase() === 'fortnite') gameName = 'Fortnite';
        games.add(gameName);
      }
    });
  }
  
  const list = [...games].sort((a, b) => a.localeCompare(b));
  cache.set(GAMES_CACHE_KEY, list, CACHE_TTL);
  return list;
}

async function getLatestNews() {
  const cached = cache.get(LATEST_NEWS_CACHE_KEY);
  if (cached) return cached;

  const db = getFirestoreInstance();
  const snap = await db.collection('newsArticles').orderBy('date', 'desc').limit(1).get();
  const articles = (snap.docs || []).map(doc => convertFirestoreData(doc));
  const latest = articles[0] || null;
  if (latest) cache.set(LATEST_NEWS_CACHE_KEY, latest, CACHE_TTL);
  return latest;
}

async function handleGames(interaction) {
  try {
    const list = await getGames();
    const embed = new EmbedBuilder()
      .setTitle('🎮 Games (live from website)')
      .setDescription(list.length ? list.map(g => `• **${g}**`).join('\n') : 'No games found.')
      .setColor(0x1e90ff)
      .setTimestamp()
      .setFooter({ text: `${list.length} game(s)` });
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('games error:', error);
    await interaction.editReply('❌ Failed to fetch games.');
  }
}

async function handleLatest(interaction) {
  try {
    const a = await getLatestNews();
    if (!a) {
      await interaction.editReply('❌ No news articles found.');
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle(a.title)
      .setDescription((a.description || 'No summary.').substring(0, 4096))
      .setColor(0x00ff7f)
      .setTimestamp(a.date ? new Date(a.date) : undefined)
      .setFooter({ text: 'Latest from eSports News' });
    setThumbnailIfValid(embed, a.image);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('latest error:', error);
    await interaction.editReply('❌ Failed to fetch latest news.');
  }
}

async function handleRandomPro(interaction) {
  try {
    const db = getFirestoreInstance();
    const allPros = await collectAllPros(db, 'fortnite'); // this already uses cache
    if (!allPros.length) {
      await interaction.editReply('❌ No pros (Fortnite players) in the database.');
      return;
    }
    const pro = allPros[Math.floor(Math.random() * allPros.length)];
    const embed = new EmbedBuilder()
      .setTitle(`🎲 Random Pro: ${pro.name}`)
      .addFields(
        { name: 'Game', value: pro.game || 'Fortnite', inline: true },
        { name: 'Role', value: pro.role || 'Pro Player', inline: true },
        { name: 'Team', value: pro.teamName || 'N/A', inline: true }
      )
      .setColor(0x8a2be2)
      .setTimestamp()
      .setFooter({ text: 'Live from website' });
    if (pro.achievements && pro.achievements.length) {
      embed.addFields({ name: 'Achievements', value: pro.achievements.slice(0, 5).join('\n') });
    }
    const links = pro.socialLinks || {};
    const socials = [links.twitter, links.twitch, links.youtube, links.instagram].filter(Boolean).map(u => `[Link](${u})`);
    if (socials.length) embed.addFields({ name: 'Socials', value: socials.join(' • ') });
    setThumbnailIfValid(embed, pro.image);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('random_pro error:', error);
    await interaction.editReply('❌ Failed to pick random pro.');
  }
}

module.exports = {
  gamesCommand,
  latestCommand,
  randomProCommand,
  handleGames,
  handleLatest,
  handleRandomPro
};