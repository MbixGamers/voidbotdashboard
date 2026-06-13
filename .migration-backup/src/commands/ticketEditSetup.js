// src/commands/ticketEditSetup.js
const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, StringSelectMenuBuilder, ChannelType, MessageFlags } = require('discord.js');
const ticketConfig = require('../utils/ticketConfig');

const editState = new Map(); // Key: `${guildId}-${userId}`

// ==================== EMOJI EXTRACTION HELPER ====================
function extractEmojiAndLabel(input) {
  if (!input || input.trim() === '') return { emoji: null, label: 'Unnamed' };
  
  // First, try to match custom Discord emoji at the beginning
  // Format: <:name:id> or <a:name:id> for animated
  const customEmojiRegex = /^(<a?:\w+:\d+>)\s*(.*)$/s;
  const customMatch = input.match(customEmojiRegex);
  
  if (customMatch) {
    return {
      emoji: customMatch[1], // Keep the full custom emoji string
      label: customMatch[2].trim() || 'Unnamed'
    };
  }
  
  // Try to match Unicode emoji at the beginning
  // This regex matches most common emoji characters
  const unicodeEmojiRegex = /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji})\s*(.*)$/u;
  const unicodeMatch = input.match(unicodeEmojiRegex);
  
  if (unicodeMatch) {
    return {
      emoji: unicodeMatch[1],
      label: unicodeMatch[2].trim() || 'Unnamed'
    };
  }
  
  // No emoji found, return null emoji and the whole input as label
  return {
    emoji: null,
    label: input.trim() || 'Unnamed'
  };
}

function truncateForModal(text, maxLength = 45) {
  if (!text) return '';
  // Remove emoji markup for cleaner display
  const cleanText = text.replace(/<a?:\w+:\d+>/g, '').trim();
  if (cleanText.length <= maxLength) return cleanText;
  return cleanText.substring(0, maxLength - 3) + '...';
}

// ==================== BUTTON HELPERS ====================
function createYesNoButtonsWithData(customId, userId, data) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${customId}_${userId}_${data}_yes`).setLabel('Yes').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`${customId}_${userId}_${data}_no`).setLabel('No').setStyle(ButtonStyle.Danger).setEmoji('❌')
  );
}

function createYesNoButtons(customId, userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${customId}_${userId}_yes`).setLabel('Yes').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`${customId}_${userId}_no`).setLabel('No').setStyle(ButtonStyle.Danger).setEmoji('❌')
  );
}

function createSimpleYesNoButtons(customId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${customId}_yes`).setLabel('Yes').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`${customId}_no`).setLabel('No').setStyle(ButtonStyle.Danger).setEmoji('❌')
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
    console.error('safeReply error in ticketEditSetup:', error);
    return false;
  }
}

// ==================== MAIN COMMAND ====================
module.exports = {
  data: new SlashCommandBuilder()
    .setName('editsetup')
    .setDescription('Edit the existing ticket system configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    try {
      const config = await ticketConfig.get(interaction.guildId);
      if (!config) {
        await safeReply(interaction, 'No ticket setup found for this server. Use `/setup` first.');
        return;
      }

      // Verify that the stored panel channel actually exists in this guild
      const panelChannel = interaction.guild.channels.cache.get(config.panelChannelId);
      if (!panelChannel) {
        await safeReply(interaction, 'The saved panel channel does not exist in this server. Please run `/setup` to create a new ticket system.');
        return;
      }

      const stateKey = `${interaction.guildId}-${interaction.user.id}`;
      editState.set(stateKey, { ...config, step: 0, guildId: interaction.guildId });

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('edit_style').setLabel('Panel Style').setStyle(ButtonStyle.Primary).setEmoji('🎨'),
        new ButtonBuilder().setCustomId('edit_names').setLabel('Ticket Types').setStyle(ButtonStyle.Primary).setEmoji('📝'),
        new ButtonBuilder().setCustomId('edit_categories').setLabel('Categories').setStyle(ButtonStyle.Primary).setEmoji('📁'),
        new ButtonBuilder().setCustomId('edit_questions').setLabel('Questions').setStyle(ButtonStyle.Primary).setEmoji('❓'),
        new ButtonBuilder().setCustomId('edit_claim').setLabel('Claim Options').setStyle(ButtonStyle.Primary).setEmoji('🙋')
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('edit_ping').setLabel('Ping Roles').setStyle(ButtonStyle.Primary).setEmoji('🔔'),
        new ButtonBuilder().setCustomId('edit_messages').setLabel('Opening Messages').setStyle(ButtonStyle.Primary).setEmoji('💬'),
        new ButtonBuilder().setCustomId('edit_transcript').setLabel('Transcript Channel').setStyle(ButtonStyle.Primary).setEmoji('📄'),
        new ButtonBuilder().setCustomId('edit_content').setLabel('Main Content').setStyle(ButtonStyle.Primary).setEmoji('📋'),
        new ButtonBuilder().setCustomId('edit_logo').setLabel('Logo').setStyle(ButtonStyle.Primary).setEmoji('🖼️')
      );

      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('edit_banner').setLabel('Banner').setStyle(ButtonStyle.Primary).setEmoji('🎨')
      );

      await safeReply(interaction, '**What would you like to edit?**', {
        components: [row1, row2, row3]
      });
    } catch (error) {
      console.error('EditSetup execute error:', error);
      await safeReply(interaction, 'An error occurred. Please try again.');
    }
  },

  handlers: {
    async handleEditStyle(interaction) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired. Start again with `/editsetup`.');
          return;
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('edit_style_buttons').setLabel('Buttons').setStyle(state.style === 'buttons' ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji('🔘'),
          new ButtonBuilder().setCustomId('edit_style_dropdown').setLabel('Dropdown').setStyle(state.style === 'dropdown' ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji('📋')
        );
        await safeReply(interaction, '**Select new panel style:**', { components: [row] });
      } catch (error) {
        console.error('handleEditStyle error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditStyleChoice(interaction, style) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        state.style = style;
        editState.set(stateKey, state);
        await this.saveAndUpdatePanel(interaction, state);
        await safeReply(interaction, `Panel style updated to **${style}**.`);
      } catch (error) {
        console.error('handleEditStyleChoice error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditNames(interaction) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId('edit_names_modal')
          .setTitle('Edit Ticket Type Names');
        const namesInput = new TextInputBuilder()
          .setCustomId('names')
          .setLabel('Names (one per line - put emoji at start)')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(state.ticketTypes.map(t => t.name).join('\n'))
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(namesInput));
        await interaction.showModal(modal);
      } catch (error) {
        console.error('handleEditNames error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditNamesModal(interaction) {
      try {
        const namesRaw = interaction.fields.getTextInputValue('names');
        const names = namesRaw.split('\n').map(s => s.trim()).filter(s => s);
        if (names.length === 0 || names.length > 10) {
          await safeReply(interaction, 'Please provide 1‑10 names.');
          return;
        }

        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        const newTicketTypes = names.map(name => {
          const existing = state.ticketTypes.find(t => t.name === name);
          if (existing) return existing;
          return { 
            name, 
            categoryId: null, 
            questions: [], 
            claimEnabled: false, 
            pingRoles: [], 
            openingMessage: null 
          };
        });

        state.ticketTypes = newTicketTypes;
        editState.set(stateKey, state);
        await this.saveAndUpdatePanel(interaction, state);
        await safeReply(interaction, 'Ticket type names updated.');
      } catch (error) {
        console.error('handleEditNamesModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditCategories(interaction) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        const currentCats = state.ticketTypes.map(t => t.categoryId || '').join('\n');
        const modal = new ModalBuilder()
          .setCustomId('edit_categories_modal')
          .setTitle('Edit Category IDs');
        const catInput = new TextInputBuilder()
          .setCustomId('categories')
          .setLabel('Category IDs (one per line)')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(currentCats)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(catInput));
        await interaction.showModal(modal);
      } catch (error) {
        console.error('handleEditCategories error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditCategoriesModal(interaction) {
      try {
        const catsRaw = interaction.fields.getTextInputValue('categories');
        const catIds = catsRaw.split('\n').map(s => s.trim()).filter(s => s);
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        if (catIds.length !== state.ticketTypes.length) {
          await safeReply(interaction, `Please provide exactly ${state.ticketTypes.length} category IDs.`);
          return;
        }

        for (let i = 0; i < catIds.length; i++) {
          const cat = interaction.guild.channels.cache.get(catIds[i]);
          if (!cat || cat.type !== ChannelType.GuildCategory) {
            await safeReply(interaction, `Category ID ${catIds[i]} is invalid.`);
            return;
          }
          state.ticketTypes[i].categoryId = catIds[i];
        }

        editState.set(stateKey, state);
        await this.saveAndUpdatePanel(interaction, state);
        await safeReply(interaction, 'Category IDs updated.');
      } catch (error) {
        console.error('handleEditCategoriesModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditQuestions(interaction) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }
        await safeReply(interaction, '**Do you want to edit pre‑ticket questions?**', {
          components: [createYesNoButtons('edit_questions_overall', interaction.user.id)]
        });
      } catch (error) {
        console.error('handleEditQuestions error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditQuestionsOverall(interaction, choice) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        if (choice) {
          state.currentTypeIndex = 0;
          state.step = 'edit_questions';
          editState.set(stateKey, state);
          await this.askEditQuestionMenu(interaction, 0);
        } else {
          await safeReply(interaction, 'Questions unchanged.');
        }
      } catch (error) {
        console.error('handleEditQuestionsOverall error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async askEditQuestionMenu(interaction, index) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        const type = state.ticketTypes[index];
        const questionsSoFar = type.questions.length;

        const row = new ActionRowBuilder();
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`edit_question_add_${index}`)
            .setLabel('Add Question')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➕')
        );
        if (questionsSoFar > 0) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`edit_question_clear_${index}`)
              .setLabel('Clear All')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🗑️')
          );
        }
        if (index < state.ticketTypes.length - 1) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`edit_question_next_${index}`)
              .setLabel('Next Type')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('➡️')
          );
        } else {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId('edit_question_done')
              .setLabel('Done')
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅')
          );
        }

        const content = questionsSoFar === 0
          ? `**${type.name}** currently has no questions. Click "Add Question" to create one.`
          : `**${type.name}** has ${questionsSoFar} question(s). You can add more or clear all.`;

        await safeReply(interaction, content, { components: [row] });
      } catch (error) {
        console.error('askEditQuestionMenu error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditQuestionAdd(interaction, index) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId(`edit_question_modal_${index}`)
          .setTitle(`Add Q for ${truncateForModal(state.ticketTypes[index].name, 35)}`);

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
        console.error('handleEditQuestionAdd error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditQuestionModal(interaction, index) {
      try {
        const label = interaction.fields.getTextInputValue('label');
        const placeholder = interaction.fields.getTextInputValue('placeholder') || '';
        const typeRaw = interaction.fields.getTextInputValue('type').toLowerCase();
        const type = (typeRaw === 'file' || typeRaw === 'attachment') ? 'file' : 'text';

        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        state.ticketTypes[index].questions.push({ label, placeholder, type });
        editState.set(stateKey, state);
        await this.askEditQuestionMenu(interaction, index);
      } catch (error) {
        console.error('handleEditQuestionModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditQuestionClear(interaction, index) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        state.ticketTypes[index].questions = [];
        editState.set(stateKey, state);
        await this.askEditQuestionMenu(interaction, index);
      } catch (error) {
        console.error('handleEditQuestionClear error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditQuestionNext(interaction, index) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        await this.askEditQuestionMenu(interaction, index + 1);
      } catch (error) {
        console.error('handleEditQuestionNext error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditQuestionDone(interaction) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        delete state.step;
        editState.set(stateKey, state);
        await this.saveAndUpdatePanel(interaction, state);
        await safeReply(interaction, 'Questions updated.');
      } catch (error) {
        console.error('handleEditQuestionDone error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditClaim(interaction) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        await safeReply(interaction, '**Do you want to enable claim buttons overall?**', {
          components: [createYesNoButtons('edit_claim_overall', interaction.user.id)]
        });
      } catch (error) {
        console.error('handleEditClaim error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditClaimOverall(interaction, choice) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        if (choice) {
          state.currentTypeIndex = 0;
          state.step = 'edit_claim';
          editState.set(stateKey, state);
          await this.askEditClaim(interaction, 0);
        } else {
          state.ticketTypes.forEach(t => t.claimEnabled = false);
          editState.set(stateKey, state);
          await this.saveAndUpdatePanel(interaction, state);
          await safeReply(interaction, 'Claim buttons disabled.');
        }
      } catch (error) {
        console.error('handleEditClaimOverall error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async askEditClaim(interaction, index) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        const name = state.ticketTypes[index].name;
        const current = state.ticketTypes[index].claimEnabled ? 'Yes' : 'No';

        await safeReply(interaction, `Enable claim button for **${name}**? (Currently: ${current})`, {
          components: [createYesNoButtonsWithData('edit_claim_per_type', interaction.user.id, index)]
        });
      } catch (error) {
        console.error('askEditClaim error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditClaimPerType(interaction, index, enabled) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        state.ticketTypes[index].claimEnabled = enabled;
        state.currentTypeIndex = index + 1;

        if (state.currentTypeIndex < state.ticketTypes.length) {
          editState.set(stateKey, state);
          await this.askEditClaim(interaction, state.currentTypeIndex);
        } else {
          delete state.step;
          editState.set(stateKey, state);
          await this.saveAndUpdatePanel(interaction, state);
          await safeReply(interaction, 'Claim options updated.');
        }
      } catch (error) {
        console.error('handleEditClaimPerType error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditPing(interaction) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        await safeReply(interaction, '**Do you want to add ping roles?**', {
          components: [createYesNoButtons('edit_ping_overall', interaction.user.id)]
        });
      } catch (error) {
        console.error('handleEditPing error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditPingOverall(interaction, choice) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        if (choice) {
          state.currentTypeIndex = 0;
          state.step = 'edit_ping';
          editState.set(stateKey, state);
          await this.askEditPing(interaction, 0);
        } else {
          state.ticketTypes.forEach(t => t.pingRoles = []);
          editState.set(stateKey, state);
          await this.saveAndUpdatePanel(interaction, state);
          await safeReply(interaction, 'Ping roles cleared.');
        }
      } catch (error) {
        console.error('handleEditPingOverall error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async askEditPing(interaction, index) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        const name = state.ticketTypes[index].name;
        const current = state.ticketTypes[index].pingRoles?.length ? 
          state.ticketTypes[index].pingRoles.map(id => `<@&${id}>`).join(', ') : 'None';

        const modal = new ModalBuilder()
          .setCustomId(`edit_ping_modal_${index}`)
          .setTitle(`Ping: ${truncateForModal(name, 38)}`);
        const rolesInput = new TextInputBuilder()
          .setCustomId('roles')
          .setLabel('Role IDs (comma-separated)')
          .setStyle(TextInputStyle.Short)
          .setValue(current === 'None' ? '' : state.ticketTypes[index].pingRoles.join(', '))
          .setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(rolesInput));
        await interaction.showModal(modal);
      } catch (error) {
        console.error('askEditPing error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditPingModal(interaction, index) {
      try {
        const rolesRaw = interaction.fields.getTextInputValue('roles');
        const roleIds = rolesRaw ? rolesRaw.split(',').map(id => id.trim()).filter(id => id) : [];

        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        state.ticketTypes[index].pingRoles = roleIds;
        state.currentTypeIndex = index + 1;

        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        if (state.currentTypeIndex < state.ticketTypes.length) {
          await interaction.editReply({
            content: `✅ Ping roles saved for **${state.ticketTypes[index].name}**. Now configure ping roles for **${state.ticketTypes[state.currentTypeIndex].name}**.`,
            components: [createContinueButton('edit_ping_next', 'Configure Next Type', '➡️')]
          });
          editState.set(stateKey, state);
        } else {
          delete state.step;
          editState.set(stateKey, state);
          await this.saveAndUpdatePanel(interaction, state);
        }
      } catch (error) {
        console.error('handleEditPingModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditPingNext(interaction) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired. Start again with `/editsetup`.');
          return;
        }

        await this.askEditPing(interaction, state.currentTypeIndex);
      } catch (error) {
        console.error('handleEditPingNext error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditMessages(interaction) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        await safeReply(interaction, '**Do you want to edit opening messages?**', {
          components: [createYesNoButtons('edit_message_overall', interaction.user.id)]
        });
      } catch (error) {
        console.error('handleEditMessages error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditMessageOverall(interaction, choice) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        if (choice) {
          state.currentTypeIndex = 0;
          state.step = 'edit_message';
          editState.set(stateKey, state);
          await this.askEditMessage(interaction, 0);
        } else {
          state.ticketTypes.forEach(t => t.openingMessage = null);
          editState.set(stateKey, state);
          await this.saveAndUpdatePanel(interaction, state);
          await safeReply(interaction, 'Opening messages cleared.');
        }
      } catch (error) {
        console.error('handleEditMessageOverall error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async askEditMessage(interaction, index) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        const name = state.ticketTypes[index].name;
        const current = state.ticketTypes[index].openingMessage || '';

        const modal = new ModalBuilder()
          .setCustomId(`edit_message_modal_${index}`)
          .setTitle(`Msg: ${truncateForModal(name, 40)}`);
        const msgInput = new TextInputBuilder()
          .setCustomId('message')
          .setLabel('Custom opening message (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(current)
          .setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(msgInput));
        
        await interaction.showModal(modal);
      } catch (error) {
        console.error('askEditMessage error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditMessageModal(interaction, index) {
      try {
        const message = interaction.fields.getTextInputValue('message') || null;

        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        state.ticketTypes[index].openingMessage = message;
        state.currentTypeIndex = index + 1;

        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        if (state.currentTypeIndex < state.ticketTypes.length) {
          await interaction.editReply({
            content: `✅ Opening message saved for **${state.ticketTypes[index].name}**. Now configure opening message for **${state.ticketTypes[state.currentTypeIndex].name}**.`,
            components: [createContinueButton('edit_message_next', 'Configure Next Type', '➡️')]
          });
          editState.set(stateKey, state);
        } else {
          delete state.step;
          editState.set(stateKey, state);
          await this.saveAndUpdatePanel(interaction, state);
        }
      } catch (error) {
        console.error('handleEditMessageModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditMessageNext(interaction) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired. Start again with `/editsetup`.');
          return;
        }

        await this.askEditMessage(interaction, state.currentTypeIndex);
      } catch (error) {
        console.error('handleEditMessageNext error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditTranscript(interaction) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId('edit_transcript_modal')
          .setTitle('New Transcript Channel');
        const channelInput = new TextInputBuilder()
          .setCustomId('channelId')
          .setLabel('Channel ID')
          .setStyle(TextInputStyle.Short)
          .setValue(state.transcriptChannelId || '')
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
        await interaction.showModal(modal);
      } catch (error) {
        console.error('handleEditTranscript error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditTranscriptModal(interaction) {
      try {
        const channelId = interaction.fields.getTextInputValue('channelId');
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) {
          await safeReply(interaction, 'Invalid channel.');
          return;
        }

        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        state.transcriptChannelId = channelId;
        editState.set(stateKey, state);
        await this.saveAndUpdatePanel(interaction, state);
        await safeReply(interaction, `Transcript channel updated to ${channel}.`);
      } catch (error) {
        console.error('handleEditTranscriptModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditContent(interaction) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId('edit_content_modal')
          .setTitle('Main Panel Content');
        const contentInput = new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Main description')
          .setStyle(TextInputStyle.Paragraph)
          .setValue(state.mainContent || '')
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(contentInput));
        await interaction.showModal(modal);
      } catch (error) {
        console.error('handleEditContent error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditContentModal(interaction) {
      try {
        const content = interaction.fields.getTextInputValue('content');

        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        state.mainContent = content;
        editState.set(stateKey, state);
        await this.saveAndUpdatePanel(interaction, state);
        await safeReply(interaction, 'Main content updated.');
      } catch (error) {
        console.error('handleEditContentModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditLogo(interaction) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId('edit_logo_modal')
          .setTitle('Logo URL');
        const logoInput = new TextInputBuilder()
          .setCustomId('logo')
          .setLabel('Logo image URL (optional)')
          .setStyle(TextInputStyle.Short)
          .setValue(state.logoUrl || '')
          .setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(logoInput));
        await interaction.showModal(modal);
      } catch (error) {
        console.error('handleEditLogo error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditLogoModal(interaction) {
      try {
        const logoUrl = interaction.fields.getTextInputValue('logo') || null;

        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        state.logoUrl = logoUrl;
        editState.set(stateKey, state);
        await this.saveAndUpdatePanel(interaction, state);
        await safeReply(interaction, 'Logo updated.');
      } catch (error) {
        console.error('handleEditLogoModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditBanner(interaction) {
      try {
        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId('edit_banner_modal')
          .setTitle('Banner URL');
        const bannerInput = new TextInputBuilder()
          .setCustomId('banner')
          .setLabel('Banner image URL (optional)')
          .setStyle(TextInputStyle.Short)
          .setValue(state.bannerUrl || '')
          .setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(bannerInput));
        await interaction.showModal(modal);
      } catch (error) {
        console.error('handleEditBanner error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async handleEditBannerModal(interaction) {
      try {
        const bannerUrl = interaction.fields.getTextInputValue('banner') || null;

        const stateKey = `${interaction.guildId}-${interaction.user.id}`;
        const state = editState.get(stateKey);
        if (!state) {
          await safeReply(interaction, 'Edit session expired.');
          return;
        }

        state.bannerUrl = bannerUrl;
        editState.set(stateKey, state);
        await this.saveAndUpdatePanel(interaction, state);
        await safeReply(interaction, 'Banner updated.');
      } catch (error) {
        console.error('handleEditBannerModal error:', error);
        await safeReply(interaction, 'An error occurred. Please try again.');
      }
    },

    async saveAndUpdatePanel(interaction, state) {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      }

      try {
        await ticketConfig.set(interaction.guildId, {
          panelChannelId: state.panelChannelId,
          panelMessageId: state.panelMessageId,
          transcriptChannelId: state.transcriptChannelId,
          style: state.style,
          ticketTypes: state.ticketTypes,
          mainContent: state.mainContent,
          logoUrl: state.logoUrl,
          bannerUrl: state.bannerUrl
        });

        const channel = interaction.guild.channels.cache.get(state.panelChannelId);
        if (!channel) {
          if (interaction.deferred) await interaction.editReply({ content: 'Panel channel not found.' });
          else await safeReply(interaction, 'Panel channel not found.');
          return;
        }

        const message = await channel.messages.fetch(state.panelMessageId).catch(() => null);
        if (!message) {
          if (interaction.deferred) await interaction.editReply({ content: 'Panel message not found.' });
          else await safeReply(interaction, 'Panel message not found.');
          return;
        }

        const embed = EmbedBuilder.from(message.embeds[0])
          .setDescription(state.mainContent || message.embeds[0].description);
        if (state.logoUrl) embed.setThumbnail(state.logoUrl);
        if (state.bannerUrl) embed.setImage(state.bannerUrl);

        let components = [];
        
        if (state.style === 'buttons') {
          // Discord limits buttons to 5 per row, so we need to split into multiple rows if needed
          const rows = [];
          let currentRow = new ActionRowBuilder();
          let buttonCount = 0;
          
          state.ticketTypes.forEach((t, i) => {
            if (buttonCount === 5) {
              // Start a new row
              rows.push(currentRow);
              currentRow = new ActionRowBuilder();
              buttonCount = 0;
            }
            
            const { emoji, label } = extractEmojiAndLabel(t.name);
            const button = new ButtonBuilder()
              .setCustomId(`ticket_open_${i}`)
              .setLabel(label)
              .setStyle(ButtonStyle.Primary);
            
            // Only set emoji if one was found
            if (emoji) {
              button.setEmoji(emoji);
            }
            
            currentRow.addComponents(button);
            buttonCount++;
          });
          
          // Add the last row if it has buttons
          if (buttonCount > 0) {
            rows.push(currentRow);
          }
          
          components = rows;
        } else {
          const options = state.ticketTypes.map((t, i) => {
            const { emoji, label } = extractEmojiAndLabel(t.name);
            const option = {
              label: label,
              value: i.toString()
            };
            // Only add emoji if one was found
            if (emoji) {
              option.emoji = emoji;
            }
            return option;
          });
          
          const select = new StringSelectMenuBuilder()
            .setCustomId('ticket_open_select')
            .setPlaceholder('Choose a ticket type...')
            .addOptions(options);
          components = [new ActionRowBuilder().addComponents(select)];
        }

        await message.edit({ embeds: [embed], components });

        if (interaction.deferred) {
          await interaction.editReply({ content: 'Panel updated successfully!' });
        } else {
          await safeReply(interaction, 'Panel updated successfully!');
        }
      } catch (error) {
        console.error('saveAndUpdatePanel error:', error);
        const errorMsg = 'An error occurred while saving changes. Please try again.';
        if (interaction.deferred) {
          await interaction.editReply({ content: errorMsg });
        } else {
          await safeReply(interaction, errorMsg);
        }
      }
    }
  }
};