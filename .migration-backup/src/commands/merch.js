const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getFirestoreInstance, convertFirestoreData } = require('../firebaseClient');
const { setThumbnailIfValid } = require('../utils/discordEmbeds');
const { buildPaginationRow } = require('../utils/pagination');
const cache = require('../utils/cache');

const merchCommand = new SlashCommandBuilder()
  .setName('merch')
  .setDescription('Show store merch. Use arrows to scroll pages.')
  .addStringOption(option =>
    option
      .setName('category')
      .setDescription('Filter by category (e.g. apparel, mousepad)')
      .setRequired(false)
  );

const PER_PAGE = 6;
const CACHE_KEY = 'merch_products';
const CACHE_TTL = 300; // 5 minutes

async function getProducts() {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const db = getFirestoreInstance();
  const snap = await db.collection('products').orderBy('createdAt', 'desc').limit(100).get();
  const products = (snap.docs || []).map(doc => convertFirestoreData(doc));
  cache.set(CACHE_KEY, products, CACHE_TTL);
  return products;
}

async function buildMerchPage(interaction, page, category) {
  const allProducts = await getProducts();
  let products = allProducts;
  if (category) {
    products = products.filter(p =>
      p.category && p.category.toLowerCase().includes(category.toLowerCase())
    );
  }
  if (!products.length) {
    return { content: category ? `❌ No merch for **${category}**.` : '❌ No merch found.', embeds: [], components: [] };
  }
  const totalPages = Math.ceil(products.length / PER_PAGE);
  const p = Math.max(0, Math.min(page, totalPages - 1));
  const slice = products.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
  const embeds = slice.map(prod => {
    const name = (prod.name || 'Unnamed').substring(0, 256);
    const price = typeof prod.price === 'number'
      ? `$${prod.price.toFixed(2)}`
      : (prod.price != null ? `$${Number(prod.price).toFixed(2)}` : '—');
    const embed = new EmbedBuilder()
      .setTitle(`🛒 ${name}`)
      .setDescription(`${price}${prod.category ? ` · ${prod.category}` : ''}${prod.description ? `\n\n${(prod.description || '').substring(0, 500)}` : ''}`)
      .setColor(0xffa500)
      .setFooter({ text: `Page ${p + 1}/${totalPages} · eSports Store` })
      .setTimestamp();
    setThumbnailIfValid(embed, prod.image || prod.imageUrl);
    if (prod.product_url && (prod.product_url.startsWith('http://') || prod.product_url.startsWith('https://'))) {
      embed.setURL(prod.product_url);
    }
    return embed;
  });

  const components = [];
  const pagRow = buildPaginationRow('merch', p, totalPages, category || '');
  if (pagRow) components.push(pagRow);

  const buyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🛒 Buy Now')
      .setStyle(ButtonStyle.Link)
      .setURL('https://' + 'vo' + 'idwebsite-six.vercel.app/shop')
      .setEmoji('🛍️')
  );
  components.push(buyRow);

  return { embeds, components };
}

async function handleMerch(interaction, page = 0, extraCategory = null) {
  const category = extraCategory !== null ? extraCategory : (interaction.options?.getString?.('category') || null);
  try {
    const payload = await buildMerchPage(interaction, page, category);
    if (payload.content) {
      await interaction.editReply(payload).catch(() => {});
      return;
    }
    await interaction.editReply(payload).catch(() => {});
  } catch (error) {
    console.error('merch error:', error);
    await interaction.editReply({ content: '❌ Failed to fetch merch.', embeds: [], components: [] }).catch(() => {});
  }
}

async function handleMerchPaginated(interaction, page, extra) {
  try {
    const payload = await buildMerchPage(interaction, page, extra || null);
    await interaction.update(payload).catch(() => {});
  } catch (error) {
    console.error('merch pagination error:', error);
    await interaction.update({ content: '❌ Error.', embeds: [], components: [] }).catch(() => {});
  }
}

module.exports = {
  merchCommand,
  handleMerch,
  handleMerchPaginated
};