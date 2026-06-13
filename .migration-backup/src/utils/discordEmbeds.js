function isValidDiscordImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

function setThumbnailIfValid(embed, url) {
  if (isValidDiscordImageUrl(url)) {
    embed.setThumbnail(url);
  }
  return embed;
}

module.exports = { isValidDiscordImageUrl, setThumbnailIfValid };