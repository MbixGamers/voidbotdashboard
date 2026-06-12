// src/commands/ticketSetup.js
const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, StringSelectMenuBuilder, ChannelType, MessageFlags } = require('discord.js');
const ticketConfig = require('../utils/ticketConfig');

const setupState = new Map();

// ==================== EMOJI EXTRACTION HELPER ====================
function extractEmojiAndLabel(input) {
  if (!input) return { emoji: '🎫', label: 'Unnamed' };
  
  // Custom emoji: <:name:id> or <a:name:id>
  const customEmojiRegex = /^(<a?:\w+:\d+>)\s*(.*)$/;
  const match = input.match(customEmojiRegex);
  if (match) {
    return { 
      emoji: match[1], 
      label: match[2].trim() || input.replace(match[1], '').trim() || 'Unnamed' 
    };
  }
  
  // Unicode emoji: first character if it's an emoji
  const unicodeEmojiRegex = /^(\p{Emoji}|[\uD800-\uDBFF][\uDC00-\uDFFF])/u;
  const uniMatch = input.match(unicodeEmojiRegex);
  if (uniMatch) {
    return { 
      emoji: uniMatch[0], 
      label: input.substring(uniMatch[0].length).trim() || 'Unnamed' 
    };
  }
  
  // Default
  return { emoji: '🎫', label: input.trim() || 'Unnamed' };
}

function truncateForModal(text, maxLength = 45) {
  if (!text) return '';
  // Remove emoji markup for cleaner display
  const cleanText = text.replace(/<a?:\w+:\d+>/g, '').trim();
  if (cleanText.length <= maxLength) return cleanText;
  return cleanText.substring(0, maxLength - 3) + '...';
}

function createYesNoButtons(customId, userId, data = null) {
  const base = data !== null ? `${customId}_${userId}_${data}` : `${customId}_${userId}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${base}_yes`).setLabel('Yes').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`${base}_no`).setLabel('No').setStyle(ButtonStyle.Danger).setEmoji('❌')
  );
}

function createSimpleYesNoButtons(customId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${customId}_yes`).setLabel('Yes').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`${customId}_no`).setLabel('No').setStyle(ButtonStyle.Danger).setEmoji('❌')
  );
}

function createStyleButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('setup_style_buttons').setLabel('Buttons').setStyle(ButtonStyle.Primary).setEmoji('🔘'),
    new ButtonBuilder().setCustomId('setup_style_dropdown').setLabel('Dropdown').setStyle(ButtonStyle.Secondary).setEmoji('📋')
  );
}

function createContinueButton(customId, label, emoji) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Primary).setEmoji(emoji)
  );
}

async function safeReply(interaction, content, options = {}) {
  try {
    if (interaction.replied) {
      await interaction.followUp({ content, ...options, flags: MessageFlags.Ephemeral });
    } else if (interaction.deferred) {
      await interaction.editReply({ content, ...options });
    } else {
      await interaction.reply({ content, ...options, flags: MessageFlags.Ephemeral });
    }
    return true;
  } catch (error) {
    console.error('safeReply error in ticketSetup:', error);
    return false;
  }
}

// ==================== MAIN COMMAND ====================
module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the ticket system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
    
  async execute(interaction) {
    try {
      setupState.set(interaction.user.id, { 
        step: 0, 
        guildId: interaction.guildId,
        ticketTypes: [],
        names: []
      });
      
      await safeReply(interaction, '**Ticket Setup Wizard**\n\nChoose how users will open tickets:', {
        components: [createStyleButtons()]
      });
    } catch (error) {
      console.error('Setup execute error:', error);
      await safeReply(interaction, 'An error occurred. Please try again.');
    }
  },
  
  handlers: {
    async handleSetupStyle(interaction, style) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired. Start again with /setup.');
          return;
        }
        
        state.style = style;
        state.step = 1;
        setupState.set(interaction.user.id, state);

        const modal = new ModalBuilder()
          .setCustomId('setup_names_modal')
          .setTitle('Ticket Type Names');
        const namesInput = new TextInputBuilder()
          .setCustomId('names')
          .setLabel('Names (one per line - put emoji at start)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('🎮 Roster\n<:staff:123456789> Staff\n💼 Business')
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(namesInput));
        
        await interaction.showModal(modal);
      } catch (error) {
        console.error('handleSetupStyle error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleSetupNamesModal(interaction) {
      try {
        const namesRaw = interaction.fields.getTextInputValue('names');
        const names = namesRaw.split('\n').map(s => s.trim()).filter(s => s);
        
        if (names.length === 0 || names.length > 10) {
          await safeReply(interaction, 'Please provide 1‑10 names.');
          return;
        }
        
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        state.names = names;
        state.ticketTypes = names.map(name => ({ 
          name, 
          categoryId: null, 
          questions: [], 
          claimEnabled: false, 
          pingRoles: [], 
          openingMessage: null 
        }));
        state.currentTypeIndex = 0;
        state.step = 2;
        setupState.set(interaction.user.id, state);

        await safeReply(interaction, 'Names saved. Click below to start entering category IDs.', {
          components: [createContinueButton('setup_next_category', 'Start Categories', '📁')]
        });
      } catch (error) {
        console.error('handleSetupNamesModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleNextCategory(interaction) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired. Please start over with /setup.');
          return;
        }
        await this.askCategory(interaction, state.currentTypeIndex);
      } catch (error) {
        console.error('handleNextCategory error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async askCategory(interaction, index) {
      try {
        const state = setupState.get(interaction.user.id);
        const fullName = state.names[index];
        const displayName = truncateForModal(fullName, 30);
        
        const modal = new ModalBuilder()
          .setCustomId(`setup_category_${index}`)
          .setTitle(`Category: ${displayName}`);
        const catInput = new TextInputBuilder()
          .setCustomId('categoryId')
          .setLabel('Category ID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(catInput));
        await interaction.showModal(modal);
      } catch (error) {
        console.error('askCategory error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleSetupCategoryModal(interaction, index) {
      try {
        const categoryId = interaction.fields.getTextInputValue('categoryId');
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }

        const category = interaction.guild.channels.cache.get(categoryId);
        if (!category || category.type !== ChannelType.GuildCategory) {
          await safeReply(interaction, 'Invalid category ID. Please try again.');
          return;
        }

        state.ticketTypes[index].categoryId = categoryId;
        state.currentTypeIndex++;

        if (state.currentTypeIndex < state.names.length) {
          await safeReply(interaction, `Category saved for **${state.names[index]}**. Click below to enter category for **${state.names[state.currentTypeIndex]}**.`, {
            components: [createContinueButton('setup_next_category', 'Next Category', '➡️')]
          });
        } else {
          state.currentTypeIndex = 0;
          state.step = 3;
          setupState.set(interaction.user.id, state);
          await safeReply(interaction, 'All categories saved. Do you want to add pre‑ticket questions?', {
            components: [createSimpleYesNoButtons('setup_force_overall')]
          });
        }
      } catch (error) {
        console.error('handleSetupCategoryModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleForceOverall(interaction, choice) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        if (choice) {
          state.step = 4;
          setupState.set(interaction.user.id, state);
          await this.askQuestionMenu(interaction, 0);
        } else {
          state.ticketTypes.forEach(t => t.questions = []);
          state.step = 5;
          setupState.set(interaction.user.id, state);
          await safeReply(interaction, 'Skipped questions. Do you want to enable claim buttons?', {
            components: [createSimpleYesNoButtons('setup_claim_overall')]
          });
        }
      } catch (error) {
        console.error('handleForceOverall error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async askQuestionMenu(interaction, index) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired. Please start over with /setup.');
          return;
        }
        
        const name = state.names[index];
        const questionsSoFar = state.ticketTypes[index].questions.length;

        const row = new ActionRowBuilder();
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`setup_add_question_${index}`)
            .setLabel('Add Question')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➕')
        );
        
        if (index < state.names.length - 1) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`setup_next_type_${index}`)
              .setLabel('Next Type')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('➡️')
          );
        } else {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId('setup_finish_questions')
              .setLabel('Finish Questions')
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅')
          );
        }

        const content = questionsSoFar === 0
          ? `**${name}** currently has no questions. Click "Add Question" to create one.`
          : `**${name}** has ${questionsSoFar} question(s). You can add more or move to next type.`;

        await safeReply(interaction, content, { components: [row] });
      } catch (error) {
        console.error('askQuestionMenu error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleAddQuestion(interaction, index) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired. Please start over with /setup.');
          return;
        }
        await this.askQuestion(interaction, index);
      } catch (error) {
        console.error('handleAddQuestion error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async askQuestion(interaction, typeIndex) {
      try {
        const state = setupState.get(interaction.user.id);
        const fullName = state.names[typeIndex];
        const displayName = truncateForModal(fullName, 30);

        const modal = new ModalBuilder()
          .setCustomId(`setup_question_${typeIndex}`)
          .setTitle(`Add Q for ${displayName}`);

        const labelInput = new TextInputBuilder()
          .setCustomId('label')
          .setLabel('Question text')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true);

        const placeholderInput = new TextInputBuilder()
          .setCustomId('placeholder')
          .setLabel('Placeholder (optional)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(false);

        const typeInput = new TextInputBuilder()
          .setCustomId('type')
          .setLabel('Type (text or file)')
          .setStyle(TextInputStyle.Short)
          .setValue('text')
          .setPlaceholder('text or file')
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(labelInput),
          new ActionRowBuilder().addComponents(placeholderInput),
          new ActionRowBuilder().addComponents(typeInput)
        );

        await interaction.showModal(modal);
      } catch (error) {
        console.error('askQuestion error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleQuestionModal(interaction, typeIndex) {
      try {
        const label = interaction.fields.getTextInputValue('label');
        const placeholder = interaction.fields.getTextInputValue('placeholder') || '';
        const typeRaw = interaction.fields.getTextInputValue('type').toLowerCase();
        const type = (typeRaw === 'file' || typeRaw === 'attachment') ? 'file' : 'text';

        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        state.ticketTypes[typeIndex].questions.push({ label, placeholder, type });
        setupState.set(interaction.user.id, state);
        await this.askQuestionMenu(interaction, typeIndex);
      } catch (error) {
        console.error('handleQuestionModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleNextType(interaction, index) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired. Please start over with /setup.');
          return;
        }
        
        state.currentTypeIndex = index + 1;
        setupState.set(interaction.user.id, state);
        await this.askQuestionMenu(interaction, state.currentTypeIndex);
      } catch (error) {
        console.error('handleNextType error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleFinishQuestions(interaction) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired. Please start over with /setup.');
          return;
        }
        
        state.step = 5;
        setupState.set(interaction.user.id, state);
        
        await safeReply(interaction, 'Questions saved. Do you want to enable claim buttons?', {
          components: [createSimpleYesNoButtons('setup_claim_overall')]
        });
      } catch (error) {
        console.error('handleFinishQuestions error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleClaimOverall(interaction, choice) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        if (choice) {
          state.currentTypeIndex = 0;
          state.step = 6;
          setupState.set(interaction.user.id, state);
          await this.askClaim(interaction, 0);
        } else {
          state.ticketTypes.forEach(t => t.claimEnabled = false);
          state.step = 7;
          setupState.set(interaction.user.id, state);
          await safeReply(interaction, 'Claim buttons disabled. Do you want to add ping roles?', {
            components: [createSimpleYesNoButtons('setup_ping_overall')]
          });
        }
      } catch (error) {
        console.error('handleClaimOverall error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async askClaim(interaction, index) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        const name = state.names[index];
        await safeReply(interaction, `Enable claim button for **${name}**?`, {
          components: [createYesNoButtons('setup_claim_per_type', interaction.user.id, index)]
        });
      } catch (error) {
        console.error('askClaim error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async askClaimFollowUp(interaction, index) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        const name = state.names[index];
        await safeReply(interaction, `Enable claim button for **${name}**?`, {
          components: [createYesNoButtons('setup_claim_per_type', interaction.user.id, index)]
        });
      } catch (error) {
        console.error('askClaimFollowUp error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleClaimPerType(interaction, index, enabled) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired. Please start over with /setup.');
          return;
        }

        if (isNaN(index) || index < 0 || index >= state.ticketTypes.length) {
          await safeReply(interaction, 'Invalid ticket type index. Please start over with /setup.');
          return;
        }

        if (!state.ticketTypes[index]) {
          await safeReply(interaction, 'Ticket type not found. Please start over with /setup.');
          return;
        }

        state.ticketTypes[index].claimEnabled = enabled;
        state.currentTypeIndex = index + 1;

        if (state.currentTypeIndex < state.names.length) {
          await this.askClaimFollowUp(interaction, state.currentTypeIndex);
        } else {
          state.currentTypeIndex = 0;
          state.step = 7;
          setupState.set(interaction.user.id, state);
          
          await safeReply(interaction, 'Claim options saved. Do you want to add ping roles?', {
            components: [createSimpleYesNoButtons('setup_ping_overall')]
          });
        }
      } catch (error) {
        console.error('handleClaimPerType error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handlePingOverall(interaction, choice) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        if (choice) {
          state.currentTypeIndex = 0;
          state.step = 8;
          setupState.set(interaction.user.id, state);
          await this.askPingRoles(interaction, 0);
        } else {
          state.ticketTypes.forEach(t => t.pingRoles = []);
          state.step = 9;
          setupState.set(interaction.user.id, state);
          await safeReply(interaction, 'Ping roles skipped. Do you want to add custom opening messages?', {
            components: [createSimpleYesNoButtons('setup_message_overall')]
          });
        }
      } catch (error) {
        console.error('handlePingOverall error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async askPingRoles(interaction, index) {
      try {
        const state = setupState.get(interaction.user.id);
        const fullName = state.names[index];
        const displayName = truncateForModal(fullName, 30);
        
        const modal = new ModalBuilder()
          .setCustomId(`setup_ping_${index}`)
          .setTitle(`Ping: ${displayName}`);
        const rolesInput = new TextInputBuilder()
          .setCustomId('roles')
          .setLabel('Role IDs (comma-separated, optional)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('123456789,987654321')
          .setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(rolesInput));
        await interaction.showModal(modal);
      } catch (error) {
        console.error('askPingRoles error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handlePingRolesModal(interaction, index) {
      try {
        const rolesRaw = interaction.fields.getTextInputValue('roles');
        const roleIds = rolesRaw ? rolesRaw.split(',').map(id => id.trim()).filter(id => id) : [];
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        state.ticketTypes[index].pingRoles = roleIds;
        state.currentTypeIndex++;

        if (state.currentTypeIndex < state.names.length) {
          await safeReply(interaction, `Ping roles saved for **${state.names[index]}**. Click below for next type.`, {
            components: [createContinueButton('setup_next_ping', 'Next Type', '➡️')]
          });
        } else {
          state.currentTypeIndex = 0;
          state.step = 9;
          setupState.set(interaction.user.id, state);
          await safeReply(interaction, 'All ping roles saved. Do you want to add custom opening messages?', {
            components: [createSimpleYesNoButtons('setup_message_overall')]
          });
        }
      } catch (error) {
        console.error('handlePingRolesModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleNextPing(interaction) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired. Please start over with /setup.');
          return;
        }
        await this.askPingRoles(interaction, state.currentTypeIndex);
      } catch (error) {
        console.error('handleNextPing error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleMessageOverall(interaction, choice) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        if (choice) {
          state.currentTypeIndex = 0;
          state.step = 10;
          setupState.set(interaction.user.id, state);
          await this.askOpeningMessage(interaction, 0);
        } else {
          state.ticketTypes.forEach(t => t.openingMessage = null);
          state.step = 11;
          setupState.set(interaction.user.id, state);
          await this.askTranscriptChannel(interaction);
        }
      } catch (error) {
        console.error('handleMessageOverall error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async askOpeningMessage(interaction, index) {
      try {
        const state = setupState.get(interaction.user.id);
        const fullName = state.names[index];
        const displayName = truncateForModal(fullName, 25);
        
        const modal = new ModalBuilder()
          .setCustomId(`setup_message_${index}`)
          .setTitle(`Open Msg: ${displayName}`);
        const msgInput = new TextInputBuilder()
          .setCustomId('message')
          .setLabel('Custom opening message (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Welcome! Please provide your details...')
          .setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(msgInput));
        await interaction.showModal(modal);
      } catch (error) {
        console.error('askOpeningMessage error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleOpeningMessageModal(interaction, index) {
      try {
        const message = interaction.fields.getTextInputValue('message') || null;
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        state.ticketTypes[index].openingMessage = message;
        state.currentTypeIndex++;

        if (state.currentTypeIndex < state.names.length) {
          await safeReply(interaction, `Opening message saved for **${state.names[index]}**. Click below for next type.`, {
            components: [createContinueButton('setup_next_message', 'Next Type', '➡️')]
          });
        } else {
          state.currentTypeIndex = 0;
          state.step = 11;
          setupState.set(interaction.user.id, state);
          await safeReply(interaction, 'All opening messages saved. Click below to set the transcript channel.', {
            components: [createContinueButton('setup_next_transcript', 'Next: Transcript Channel', '📝')]
          });
        }
      } catch (error) {
        console.error('handleOpeningMessageModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleNextMessage(interaction) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired. Please start over with /setup.');
          return;
        }
        await this.askOpeningMessage(interaction, state.currentTypeIndex);
      } catch (error) {
        console.error('handleNextMessage error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleNextTranscript(interaction) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state || state.step !== 11) {
          await safeReply(interaction, 'Setup step mismatch. Please start over with /setup.');
          return;
        }
        await this.askTranscriptChannel(interaction);
      } catch (error) {
        console.error('handleNextTranscript error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async askTranscriptChannel(interaction) {
      try {
        const modal = new ModalBuilder()
          .setCustomId('setup_transcript_modal')
          .setTitle('Transcript Channel');
        const channelInput = new TextInputBuilder()
          .setCustomId('channelId')
          .setLabel('Channel ID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
        await interaction.showModal(modal);
      } catch (error) {
        console.error('askTranscriptChannel error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleTranscriptModal(interaction) {
      try {
        const channelId = interaction.fields.getTextInputValue('channelId');
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) {
          await safeReply(interaction, 'Invalid channel ID.');
          return;
        }

        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        state.transcriptChannelId = channelId;
        state.step = 12;
        setupState.set(interaction.user.id, state);

        await safeReply(interaction, 'Transcript channel saved. Do you want to add a custom main content?', {
          components: [createSimpleYesNoButtons('setup_content_overall')]
        });
      } catch (error) {
        console.error('handleTranscriptModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleContentOverall(interaction, choice) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        if (choice) {
          const modal = new ModalBuilder()
            .setCustomId('setup_main_content_modal')
            .setTitle('Main Panel Content');
          const contentInput = new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Main description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Welcome to our support system...')
            .setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(contentInput));
          await interaction.showModal(modal);
        } else {
          state.mainContent = null;
          state.step = 13;
          setupState.set(interaction.user.id, state);
          await safeReply(interaction, 'Main content skipped. Do you want to add a logo?', {
            components: [createSimpleYesNoButtons('setup_logo_overall')]
          });
        }
      } catch (error) {
        console.error('handleContentOverall error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleMainContentModal(interaction) {
      try {
        const content = interaction.fields.getTextInputValue('content');
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        state.mainContent = content;
        state.step = 13;
        setupState.set(interaction.user.id, state);
        
        await safeReply(interaction, 'Main content saved. Do you want to add a logo?', {
          components: [createSimpleYesNoButtons('setup_logo_overall')]
        });
      } catch (error) {
        console.error('handleMainContentModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleLogoOverall(interaction, choice) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        if (choice) {
          const modal = new ModalBuilder()
            .setCustomId('setup_logo_modal')
            .setTitle('Logo URL');
          const logoInput = new TextInputBuilder()
            .setCustomId('logo')
            .setLabel('Logo image URL (optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(logoInput));
          await interaction.showModal(modal);
        } else {
          state.logoUrl = null;
          state.step = 14;
          setupState.set(interaction.user.id, state);
          await safeReply(interaction, 'Logo skipped. Do you want to add a banner?', {
            components: [createSimpleYesNoButtons('setup_banner_overall')]
          });
        }
      } catch (error) {
        console.error('handleLogoOverall error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleLogoModal(interaction) {
      try {
        const logoUrl = interaction.fields.getTextInputValue('logo') || null;
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        state.logoUrl = logoUrl;
        state.step = 14;
        setupState.set(interaction.user.id, state);
        
        await safeReply(interaction, 'Logo saved. Do you want to add a banner?', {
          components: [createSimpleYesNoButtons('setup_banner_overall')]
        });
      } catch (error) {
        console.error('handleLogoModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleBannerOverall(interaction, choice) {
      try {
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        if (choice) {
          const modal = new ModalBuilder()
            .setCustomId('setup_banner_modal')
            .setTitle('Banner URL');
          const bannerInput = new TextInputBuilder()
            .setCustomId('banner')
            .setLabel('Banner image URL (optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(bannerInput));
          await interaction.showModal(modal);
        } else {
          state.bannerUrl = null;
          await this.finalizeSetup(interaction, state);
        }
      } catch (error) {
        console.error('handleBannerOverall error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleBannerModal(interaction) {
      try {
        const bannerUrl = interaction.fields.getTextInputValue('banner') || null;
        const state = setupState.get(interaction.user.id);
        if (!state) {
          await safeReply(interaction, 'Setup expired.');
          return;
        }
        
        state.bannerUrl = bannerUrl;
        await this.finalizeSetup(interaction, state);
      } catch (error) {
        console.error('handleBannerModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async finalizeSetup(interaction, state) {
      // Defer if not already (this operation takes time)
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      }

      try {
        const config = {
          panelChannelId: interaction.channelId,
          panelMessageId: null,
          transcriptChannelId: state.transcriptChannelId,
          style: state.style,
          ticketTypes: state.ticketTypes,
          mainContent: state.mainContent,
          logoUrl: state.logoUrl,
          bannerUrl: state.bannerUrl
        };

        await ticketConfig.set(interaction.guildId, config);

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('Official Support')
          .setDescription(state.mainContent || 'Welcome to our support system! Please select a ticket type below.')
          .setFooter({ text: 'Esports Ticket System' });
        if (state.logoUrl) embed.setThumbnail(state.logoUrl);
        if (state.bannerUrl) embed.setImage(state.bannerUrl);

        let panelMessage;
        if (state.style === 'buttons') {
          const row = new ActionRowBuilder();
          state.ticketTypes.forEach((t, i) => {
            const { emoji, label } = extractEmojiAndLabel(t.name);
            const button = new ButtonBuilder()
              .setCustomId(`ticket_open_${i}`)
              .setLabel(label)
              .setStyle(ButtonStyle.Primary);
            
            // Set emoji - works with both custom and unicode emojis
            if (emoji) {
              button.setEmoji(emoji);
            }
            
            row.addComponents(button);
          });
          panelMessage = await interaction.channel.send({ embeds: [embed], components: [row] });
        } else {
          const options = state.ticketTypes.map((t, i) => {
            const { emoji, label } = extractEmojiAndLabel(t.name);
            const option = {
              label: label,
              value: i.toString()
            };
            // Add emoji if present
            if (emoji) {
              option.emoji = emoji;
            }
            return option;
          });
          
          const select = new StringSelectMenuBuilder()
            .setCustomId('ticket_open_select')
            .setPlaceholder('Choose a ticket type...')
            .addOptions(options);
          const row = new ActionRowBuilder().addComponents(select);
          panelMessage = await interaction.channel.send({ embeds: [embed], components: [row] });
        }

        config.panelMessageId = panelMessage.id;
        await ticketConfig.set(interaction.guildId, config);
        setupState.delete(interaction.user.id);

        if (interaction.deferred) {
          await interaction.editReply({ content: 'Ticket system setup complete!' });
        } else {
          await safeReply(interaction, 'Ticket system setup complete!');
        }
      } catch (error) {
        console.error('finalizeSetup error:', error);
        const errorMsg = 'An error occurred while finalizing setup. Please try again.';
        if (interaction.deferred) {
          await interaction.editReply({ content: errorMsg });
        } else {
          await safeReply(interaction, errorMsg);
        }
      }
    }
  },
  setupState: setupState
};