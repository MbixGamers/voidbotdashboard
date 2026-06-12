const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getFirestoreInstance, convertFirestoreData } = require('../firebaseClient');
const { setThumbnailIfValid } = require('../utils/discordEmbeds');
const { buildPaginationRow, encodeExtra } = require('../utils/pagination');
const cache = require('../utils/cache');

const PER_PAGE = 10;

const CACHE_KEY_TEAMS = 'teamsAndAmbassadors';
const CACHE_KEY_ALL_PROPS = 'allPros';
const CACHE_KEY_ALL_OPS = 'allOps';

const teamsCommand = new SlashCommandBuilder()
  .setName('teams')
  .setDescription('Show eSports teams, pros, and operations statistics.');

const prosListCommand = new SlashCommandBuilder()
  .setName('pros_list')
  .setDescription('List all pros. Use arrows to scroll pages; select a pro for full profile.')
  .addStringOption(option =>
    option
      .setName('game')
      .setDescription('Filter by game (e.g. Fortnite, Valorant)')
      .setRequired(false)
  );

const proInfoCommand = new SlashCommandBuilder()
  .setName('pro_info')
  .setDescription('Get detailed pro info by username. Shows stats, social links, achievements.')
  .addStringOption(option =>
    option
      .setName('name')
      .setDescription('Username as per the pro list')
      .setRequired(true)
  );

const opsInfoCommand = new SlashCommandBuilder()
  .setName('ops_info')
  .setDescription('List operations/management team. Use arrows to scroll; select for full profile.');

async function debugFirebaseData(db) {
  console.log('\n🔍 === FIREBASE DEBUG START ===');
  try {
    const teamsSnap = await db.collection('teams').get();
    console.log(`📁 Collection "teams": ${teamsSnap.size} documents`);
    let totalPlayers = 0;
    const games = {};
    teamsSnap.docs.forEach(doc => {
      const data = doc.data();
      console.log(`   Team: ${data.name || 'Unnamed'}`);
      if (data.players && Array.isArray(data.players)) {
        console.log(`      Players: ${data.players.length}`);
        totalPlayers += data.players.length;
        data.players.forEach(player => {
          const game = player.game || 'Unknown';
          games[game] = (games[game] || 0) + 1;
        });
      }
    });
    console.log(`   Total players across all teams: ${totalPlayers}`);
    console.log(`   Players by game:`, games);

    const ambSnap = await db.collection('ambassadors').get();
    console.log(`📁 Collection "ambassadors": ${ambSnap.size} documents`);
    const ambGames = {};
    ambSnap.docs.forEach(doc => {
      const data = doc.data();
      const game = data.game || 'Unknown';
      ambGames[game] = (ambGames[game] || 0) + 1;
    });
    console.log(`   Ambassadors by game:`, ambGames);
  } catch (e) {
    console.log(`ℹ️ Debug error: ${e.message}`);
  }
  console.log('🔍 === FIREBASE DEBUG END ===\n');
}

async function getTeamsAndAmbassadors(db) {
  const cached = cache.get(CACHE_KEY_TEAMS);
  if (cached) return cached;

  console.log('📡 Cache miss: fetching teams and ambassadors from Firebase');
  try {
    let teams = [];
    try {
      const teamsSnap = await db.collection('teams').get();
      teams = teamsSnap.docs.map(doc => convertFirestoreData(doc));
    } catch (e) {
      console.error('❌ Error fetching teams:', e.message);
    }

    let ambassadors = [];
    try {
      const ambassadorsSnap = await db.collection('ambassadors').get();
      ambassadors = ambassadorsSnap.docs.map(doc => convertFirestoreData(doc));
    } catch (e) {
      console.log('ℹ️ No ambassadors collection');
    }

    const result = { teams, ambassadors };
    cache.set(CACHE_KEY_TEAMS, result);
    return result;
  } catch (error) {
    console.error('❌ Error fetching data:', error);
    return { teams: [], ambassadors: [] };
  }
}

function isPro(person) {
  if (!person) return false;
  const text = Object.values(person)
    .filter(v => typeof v === 'string')
    .join(' ')
    .toLowerCase();
  if (text.includes('management') || text.includes('operations') ||
      text.includes('ceo') || text.includes('founder') || text.includes('director') ||
      text.includes('manager') || text.includes('head of') || text.includes('admin')) {
    return false;
  }
  if (person.game) return true;
  if (person.role && (
      person.role.toLowerCase().includes('player') ||
      person.role.toLowerCase().includes('pro')
  )) {
    return true;
  }
  return false;
}

function isOperations(person, teamName = '') {
  if (!person) return false;
  const roleLower = (person.role || '').toLowerCase();
  const teamLower = (teamName || '').toLowerCase();
  const text = Object.values(person)
    .filter(v => typeof v === 'string')
    .join(' ')
    .toLowerCase();
  return (
    roleLower.includes('management') ||
    roleLower.includes('operations') ||
    roleLower.includes('admin') ||
    roleLower.includes('ceo') ||
    roleLower.includes('founder') ||
    roleLower.includes('director') ||
    roleLower.includes('manager') ||
    roleLower.includes('head of') ||
    teamLower.includes('management') ||
    teamLower.includes('operations') ||
    text.includes('management') ||
    text.includes('operations') ||
    text.includes('ceo') ||
    text.includes('founder')
  );
}

async function findProByName(db, searchName) {
  const { teams, ambassadors } = await getTeamsAndAmbassadors(db);
  const searchLower = searchName.toLowerCase().trim();

  for (const team of teams) {
    if (team.players && Array.isArray(team.players)) {
      for (const player of team.players) {
        if (player.name && player.name.toLowerCase() === searchLower) {
          return { pro: player, teamName: team.name, source: 'team' };
        }
      }
    }
  }
  for (const ambassador of ambassadors) {
    if (ambassador.name && ambassador.name.toLowerCase() === searchLower) {
      return { pro: ambassador, teamName: 'Ambassador', source: 'ambassador' };
    }
  }
  for (const team of teams) {
    if (team.players && Array.isArray(team.players)) {
      for (const player of team.players) {
        if (player.name && player.name.toLowerCase().includes(searchLower)) {
          return { pro: player, teamName: team.name, source: 'team' };
        }
      }
    }
  }
  for (const ambassador of ambassadors) {
    if (ambassador.name && ambassador.name.toLowerCase().includes(searchLower)) {
      return { pro: ambassador, teamName: 'Ambassador', source: 'ambassador' };
    }
  }
  return null;
}

function buildProEmbed(foundPro, teamName, source) {
  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${foundPro.name || 'Unknown'}`)
    .setDescription((foundPro.description || foundPro.bio || 'No bio available.').substring(0, 4096))
    .addFields(
      { name: '🏢 Team', value: teamName || 'N/A', inline: true },
      { name: '🎯 Game', value: foundPro.game || 'Fortnite', inline: true },
      { name: '📋 Role', value: foundPro.role || 'Pro Player', inline: true }
    )
    .setColor(0x8a2be2)
    .setTimestamp()
    .setFooter({ text: 'Live from Website' });

  if (foundPro.achievements && Array.isArray(foundPro.achievements) && foundPro.achievements.length) {
    embed.addFields({
      name: '🏆 Achievements',
      value: foundPro.achievements.slice(0, 10).join('\n').substring(0, 1024)
    });
  }

  const socials = [];
  const socialLinks = foundPro.socialLinks || {};
  if (socialLinks.twitter) socials.push(`[Twitter](${socialLinks.twitter})`);
  if (socialLinks.twitch) socials.push(`[Twitch](${socialLinks.twitch})`);
  if (socialLinks.youtube) socials.push(`[YouTube](${socialLinks.youtube})`);
  if (socialLinks.instagram) socials.push(`[Instagram](${socialLinks.instagram})`);
  if (socialLinks.tiktok) socials.push(`[TikTok](${socialLinks.tiktok})`);
  if (socials.length) embed.addFields({ name: '🔗 Socials', value: socials.join(' • ') });

  setThumbnailIfValid(embed, foundPro.image || foundPro.imageUrl);
  return embed;
}

async function handleTeams(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply().catch(() => {});
  }

  try {
    const db = getFirestoreInstance();
    await debugFirebaseData(db);

    const { teams, ambassadors } = await getTeamsAndAmbassadors(db);

    const prosByGame = {};
    let totalOps = 0;
    const allPros = [];

    teams.forEach(team => {
      if (team.players && Array.isArray(team.players)) {
        team.players.forEach(player => {
          if (isOperations(player, team.name)) {
            totalOps++;
          } else if (isPro(player)) {
            const game = player.game || 'Fortnite';
            const normalizedGame = game.trim();
            prosByGame[normalizedGame] = (prosByGame[normalizedGame] || 0) + 1;
            allPros.push({ ...player, teamName: team.name, game: normalizedGame });
          }
        });
      }
    });

    ambassadors.forEach(ambassador => {
      if (isOperations(ambassador)) {
        totalOps++;
      } else if (isPro(ambassador)) {
        const game = ambassador.game || 'Fortnite';
        const normalizedGame = game.trim();
        prosByGame[normalizedGame] = (prosByGame[normalizedGame] || 0) + 1;
        allPros.push({ ...ambassador, teamName: 'Ambassador', game: normalizedGame });
      }
    });

    const totalPros = allPros.length;

    let breakdownText = '';
    const games = Object.keys(prosByGame).sort((a, b) => a.localeCompare(b));
    games.forEach(game => {
      const count = prosByGame[game];
      breakdownText += `• **${game}** — ${count} ${game} pro${count !== 1 ? 's' : ''}\n`;
    });
    if (totalOps > 0) {
      breakdownText += `• **Management** — ${totalOps} operation${totalOps !== 1 ? 's' : ''}`;
    }

    const embed = new EmbedBuilder()
      .setTitle('📊 eSports — Team Statistics')
      .setDescription('Live counts from the website')
      .addFields(
        { name: '📈 Overview', value: `Total Teams: ${teams.length}\nTotal Pros: ${totalPros}\nTotal Operations: ${totalOps}`, inline: false },
        { name: '📋 Team Breakdown', value: breakdownText || 'No teams with players found', inline: false }
      )
      .setColor(0x8a2be2)
      .setTimestamp()
      .setFooter({ text: 'Live from Website · /pros_list to see all pros' });

    await interaction.editReply({ content: null, embeds: [embed] });
  } catch (error) {
    console.error('❌ teams error:', error);
    await interaction.editReply('❌ Failed to fetch teams data. Check Firebase connection.');
  }
}

async function collectAllPros(db, gameFilter = null) {
  const cacheKey = CACHE_KEY_ALL_PROPS;
  let allPros = cache.get(cacheKey);

  if (!allPros) {
    console.log('📡 Cache miss: fetching all pros from Firebase');
    const { teams, ambassadors } = await getTeamsAndAmbassadors(db);
    allPros = [];
    const seenNames = new Map();

    teams.forEach(team => {
      if (team.players && Array.isArray(team.players)) {
        team.players.forEach(player => {
          if (!isPro(player) || isOperations(player, team.name) || !player.name) return;
          const key = `${player.name.toLowerCase()}-${team.name}`;
          if (seenNames.has(key)) return;
          seenNames.set(key, true);
          const playerGame = player.game || 'Fortnite';
          allPros.push({
            ...player,
            teamName: team.name,
            source: 'team',
            game: playerGame.trim()
          });
        });
      }
    });

    ambassadors.forEach(ambassador => {
      if (!isPro(ambassador) || isOperations(ambassador) || !ambassador.name) return;
      const key = `${ambassador.name.toLowerCase()}-ambassador`;
      if (seenNames.has(key)) return;
      seenNames.set(key, true);
      const playerGame = ambassador.game || 'Fortnite';
      allPros.push({
        ...ambassador,
        teamName: 'Ambassador',
        source: 'ambassador',
        game: playerGame.trim()
      });
    });

    allPros.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    cache.set(cacheKey, allPros);
    console.log(`✅ Cached ${allPros.length} pros`);
  }

  if (gameFilter) {
    const filtered = allPros.filter(p =>
      p.game && p.game.toLowerCase().includes(gameFilter.toLowerCase())
    );
    return filtered;
  }
  return allPros;
}

async function collectAllOps(db) {
  const cacheKey = CACHE_KEY_ALL_OPS;
  let allOps = cache.get(cacheKey);

  if (!allOps) {
    console.log('📡 Cache miss: fetching all ops from Firebase');
    const { teams, ambassadors } = await getTeamsAndAmbassadors(db);
    allOps = [];
    const seenNames = new Map();

    teams.forEach(team => {
      if (team.players && Array.isArray(team.players)) {
        team.players.forEach(player => {
          if (!isOperations(player, team.name) || !player.name) return;
          const key = `${player.name.toLowerCase()}-${team.name}`;
          if (seenNames.has(key)) return;
          seenNames.set(key, true);
          allOps.push({ ...player, teamName: team.name, source: 'team' });
        });
      }
    });

    ambassadors.forEach(ambassador => {
      if (!isOperations(ambassador) || !ambassador.name) return;
      const key = `${ambassador.name.toLowerCase()}-ambassador`;
      if (seenNames.has(key)) return;
      seenNames.set(key, true);
      allOps.push({ ...ambassador, teamName: 'Ambassador', source: 'ambassador' });
    });

    allOps.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    cache.set(cacheKey, allOps);
    console.log(`✅ Cached ${allOps.length} ops`);
  }
  return allOps;
}

async function handleProsList(interaction, page = 0, extraGame = null) {
  const isButton = interaction.isButton?.() || interaction.isStringSelectMenu?.();

  if (!interaction.deferred && !interaction.replied) {
    if (isButton) {
      await interaction.deferUpdate().catch(() => {});
    } else {
      await interaction.deferReply().catch(() => {});
    }
  }

  page = parseInt(page) || 0;
  if (page < 0) page = 0;

  const gameFilter = extraGame !== null ? extraGame : (interaction.options?.getString?.('game') || null);

  try {
    const db = getFirestoreInstance();
    const allPros = await collectAllPros(db, gameFilter);

    if (allPros.length === 0) {
      const msg = gameFilter ? `No pros found for **${gameFilter}**.` : 'No pros found.';
      await interaction.editReply({ content: `❌ ${msg}`, embeds: [], components: [] });
      return;
    }

    const totalPages = Math.ceil(allPros.length / PER_PAGE);
    const p = Math.max(0, Math.min(page, totalPages - 1));
    const start = p * PER_PAGE;
    const end = Math.min(start + PER_PAGE, allPros.length);
    const slice = allPros.slice(start, end);

    const embed = new EmbedBuilder()
      .setTitle(gameFilter ? `👥 ${gameFilter} Pros` : '👥 All Pros')
      .setDescription(`**Total Pros:** ${allPros.length}\n**Showing:** ${start + 1}-${end} of ${allPros.length}`)
      .setColor(0x8a2be2)
      .setFooter({
        text: `Page ${p + 1}/${totalPages} · Select a pro below for full profile`,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

    slice.forEach((pro, index) => {
      embed.addFields({
        name: `${start + index + 1}. ${pro.name}`,
        value: `**Team:** ${pro.teamName || '—'} • **Game:** ${pro.game || 'Fortnite'} • **Role:** ${pro.role || 'Pro Player'}`,
        inline: true
      });
    });

    const components = [];
    const pagRow = buildPaginationRow('pros_list', p, totalPages, gameFilter || '');
    if (pagRow) components.push(pagRow);

    if (slice.length > 0) {
      const selectOptions = [];
      for (let i = 0; i < Math.min(slice.length, 25); i++) {
        const pro = slice[i];
        const proName = pro.name || 'Unknown';
        const optionValue = `${i}:${proName}`;
        selectOptions.push({
          label: proName.substring(0, 100),
          value: optionValue,
          description: `${pro.game || 'Fortnite'} · ${pro.teamName || '—'}`.substring(0, 100)
        });
      }

      if (selectOptions.length) {
        const selectRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`pro_sel:pros_list:${p}:${encodeExtra(gameFilter || '')}`)
            .setPlaceholder('🔍 View full profile...')
            .addOptions(selectOptions)
        );
        components.push(selectRow);
      }
    }

    await interaction.editReply({ content: null, embeds: [embed], components });
  } catch (error) {
    console.error('❌ pros_list error:', error);
    await interaction.editReply({ content: '❌ Failed to fetch pros list.', embeds: [], components: [] });
  }
}

async function handleProInfo(interaction) {
  const name = interaction.options.getString('name');
  await interaction.deferReply().catch(() => {});

  try {
    const db = getFirestoreInstance();
    const result = await findProByName(db, name);

    if (!result) {
      await interaction.editReply(`❌ No pro matching **${name}**. Try \`/pros_list\` to see all pros.`);
      return;
    }

    const embed = buildProEmbed(result.pro, result.teamName, result.source);
    await interaction.editReply({ content: null, embeds: [embed] });
  } catch (error) {
    console.error('❌ pro_info error:', error);
    await interaction.editReply('❌ Failed to fetch pro info.');
  }
}

async function handleOpsInfo(interaction, page = 0) {
  const isButton = interaction.isButton?.() || interaction.isStringSelectMenu?.();

  if (!interaction.deferred && !interaction.replied) {
    if (isButton) {
      await interaction.deferUpdate().catch(() => {});
    } else {
      await interaction.deferReply().catch(() => {});
    }
  }

  page = parseInt(page) || 0;
  if (page < 0) page = 0;

  try {
    const db = getFirestoreInstance();
    const allOps = await collectAllOps(db);

    if (allOps.length === 0) {
      await interaction.editReply({ content: '❌ No operations/management team members found.', embeds: [], components: [] });
      return;
    }

    const totalPages = Math.ceil(allOps.length / PER_PAGE);
    const p = Math.max(0, Math.min(page, totalPages - 1));
    const start = p * PER_PAGE;
    const end = Math.min(start + PER_PAGE, allOps.length);
    const slice = allOps.slice(start, end);

    const embed = new EmbedBuilder()
      .setTitle('👥 Operations & Management')
      .setDescription(`**Total Members:** ${allOps.length}\n**Showing:** ${start + 1}-${end} of ${allOps.length}`)
      .setColor(0x8a2be2)
      .setFooter({
        text: `Page ${p + 1}/${totalPages} · Select below for full profile`,
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();

    slice.forEach((op, index) => {
      embed.addFields({
        name: `${start + index + 1}. ${op.name}`,
        value: `**Team:** ${op.teamName || '—'} • **Role:** ${op.role || '—'}`,
        inline: true
      });
    });

    const components = [];
    const pagRow = buildPaginationRow('ops_info', p, totalPages, '');
    if (pagRow) components.push(pagRow);

    if (slice.length > 0) {
      const selectOptions = [];
      for (let i = 0; i < Math.min(slice.length, 25); i++) {
        const op = slice[i];
        const opName = op.name || 'Unknown';
        const optionValue = `${i}:${opName}`;
        selectOptions.push({
          label: opName.substring(0, 100),
          value: optionValue,
          description: `${op.role || '—'} · ${op.teamName || '—'}`.substring(0, 100)
        });
      }

      if (selectOptions.length) {
        const selectRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`ops_sel:ops_info:${p}:`)
            .setPlaceholder('🔍 View full profile...')
            .addOptions(selectOptions)
        );
        components.push(selectRow);
      }
    }

    await interaction.editReply({ content: null, embeds: [embed], components });
  } catch (error) {
    console.error('❌ ops_info error:', error);
    await interaction.editReply({ content: '❌ Failed to fetch ops list.', embeds: [], components: [] });
  }
}

async function replyWithProDetail(interaction, optionValue, backPayload) {
  try {
    let proName;
    if (optionValue.includes(':')) {
      const parts = optionValue.split(':');
      proName = parts.slice(1).join(':');
    } else {
      proName = optionValue;
    }

    const db = getFirestoreInstance();
    const result = await findProByName(db, proName);

    if (!result) {
      await interaction.editReply({ content: `❌ Pro **${proName}** not found.`, embeds: [], components: [] });
      return;
    }

    const embed = buildProEmbed(result.pro, result.teamName, result.source);

    const cmd = backPayload.cmd || 'pros_list';
    const page = parseInt(backPayload.page) || 0;
    const extra = backPayload.extra || '';

    const backId = `back:${cmd}:${page}:${encodeExtra(extra)}`;
    const finalBackId = backId.length > 100 ? backId.substring(0, 100) : backId;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(finalBackId)
        .setLabel('◀ Back to list')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
    );

    await interaction.editReply({ content: null, embeds: [embed], components: [row] });
  } catch (error) {
    console.error('❌ replyWithProDetail error:', error);
    await interaction.editReply({ content: '❌ Failed to load profile.', embeds: [], components: [] });
  }
}

async function replyWithOpsDetail(interaction, optionValue, backPayload) {
  try {
    let opName;
    if (optionValue.includes(':')) {
      const parts = optionValue.split(':');
      opName = parts.slice(1).join(':');
    } else {
      opName = optionValue;
    }

    const db = getFirestoreInstance();
    const result = await findProByName(db, opName);

    if (!result) {
      await interaction.editReply({ content: `❌ **${opName}** not found.`, embeds: [], components: [] });
      return;
    }

    const embed = buildProEmbed(result.pro, result.teamName, result.source);

    const cmd = backPayload.cmd || 'ops_info';
    const page = parseInt(backPayload.page) || 0;
    const extra = backPayload.extra || '';

    const backId = `back:${cmd}:${page}:${encodeExtra(extra)}`;
    const finalBackId = backId.length > 100 ? backId.substring(0, 100) : backId;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(finalBackId)
        .setLabel('◀ Back to list')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
    );

    await interaction.editReply({ content: null, embeds: [embed], components: [row] });
  } catch (error) {
    console.error('❌ replyWithOpsDetail error:', error);
    await interaction.editReply({ content: '❌ Failed to load profile.', embeds: [], components: [] });
  }
}

module.exports = {
  isPro,
  isOperations,
  collectAllPros,
  collectAllOps,
  teamsCommand,
  prosListCommand,
  proInfoCommand,
  opsInfoCommand,
  handleTeams,
  handleProsList,
  handleProInfo,
  handleOpsInfo,
  replyWithProDetail,
  replyWithOpsDetail,
  handleProsListPaginated: (i, page, extra) => handleProsList(i, page, extra),
  handleOpsInfoPaginated: (i, page) => handleOpsInfo(i, page)
};