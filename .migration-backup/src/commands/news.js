const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getFirestoreInstance, convertFirestoreData } = require('../firebaseClient');
const { setThumbnailIfValid } = require('../utils/discordEmbeds');
const { buildPaginationRow } = require('../utils/pagination');
const cache = require('../utils/cache');

const newsCommand = new SlashCommandBuilder()
  .setName('news')
  .setDescription('Show latest news. Use arrows to scroll pages.')
  .addIntegerOption(option =>
    option
      .setName('limit')
      .setDescription('How many articles to load (1–30)')
      .setMinValue(1)
      .setMaxValue(30)
      .setRequired(false)
  );

const PER_PAGE = 5;
const CACHE_KEY = 'news_articles';
const CACHE_TTL = 300; // 5 minutes

async function getNewsArticles() {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const db = getFirestoreInstance();
  const snap = await db.collection('newsArticles').orderBy('date', 'desc').limit(30).get();
  const articles = (snap.docs || []).map(doc => convertFirestoreData(doc));
  cache.set(CACHE_KEY, articles, CACHE_TTL);
  return articles;
}

async function buildNewsPage(interaction, page, limit = 15) {
  const allArticles = await getNewsArticles();
  const articles = allArticles.slice(0, limit);
  if (!articles.length) {
    return { content: '❌ No news articles found.', embeds: [], components: [] };
  }
  const totalPages = Math.ceil(articles.length / PER_PAGE);
  const p = Math.max(0, Math.min(page, totalPages - 1));
  const slice = articles.slice(p * PER_PAGE, (p + 1) * PER_PAGE);

  const embeds = slice.map(a => {
    const embed = new EmbedBuilder()
      .setTitle(a.title)
      .setDescription((a.description || 'No summary.').substring(0, 4096))
      .setColor(0x00ff7f)
      .setTimestamp(a.date ? new Date(a.date) : undefined)
      .setFooter({ text: 'eSports News · Live from website' });
    const videoUrl = a.youtubeUrl || a.videoUrl || a.videoLink || a.link || a.url;
    if (videoUrl && (videoUrl.includes('youtube') || videoUrl.includes('youtu.be') || videoUrl.startsWith('http'))) {
      embed.addFields({ name: '▶ Watch', value: `[YouTube / Video](${videoUrl})`, inline: false });
      embed.setURL(videoUrl);
    }
    if (a.category) embed.addFields({ name: 'Category', value: a.category, inline: true });
    if (a.isEvent && a.eventDate) embed.addFields({ name: 'Event', value: new Date(a.eventDate).toLocaleDateString(), inline: true });
    setThumbnailIfValid(embed, a.image);
    return embed;
  });

  const components = [];
  const pagRow = buildPaginationRow('news', p, totalPages, String(limit));
  if (pagRow) components.push(pagRow);
  return { embeds, components };
}

async function handleNews(interaction, page = 0, extraLimit = null) {
  const limit = extraLimit != null ? Math.min(Math.max(parseInt(extraLimit, 10) || 15, 1), 30) : Math.min(Math.max(interaction.options?.getInteger?.('limit') || 15, 1), 30);
  try {
    const payload = await buildNewsPage(interaction, page, limit);
    if (payload.content) {
      await interaction.editReply(payload).catch(() => {});
      return;
    }
    await interaction.editReply(payload).catch(() => {});
  } catch (error) {
    console.error('news error:', error);
    await interaction.editReply('❌ Failed to fetch news.').catch(() => {});
  }
}

async function handleNewsPaginated(interaction, page, extra) {
  try {
    const limit = Math.min(Math.max(parseInt(extra, 10) || 15, 1), 30);
    const payload = await buildNewsPage(interaction, page, limit);
    await interaction.update(payload).catch(() => {});
  } catch (error) {
    await interaction.update({ content: '❌ Error.', embeds: [], components: [] }).catch(() => {});
  }
}

module.exports = {
  newsCommand,
  handleNews,
  handleNewsPaginated
};