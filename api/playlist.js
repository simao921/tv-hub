const dns = require('dns').promises;
const { URL } = require('url');

const blockedGroups = /adult|adulto|18\+|porn|sex/i;

function parseAttributes(raw) {
  const attrs = {};
  const pattern = /([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
  let match;
  while ((match = pattern.exec(raw))) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

function parseM3U(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const channels = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].toUpperCase().startsWith('#EXTINF')) continue;
    const comma = lines[index].indexOf(',');
    const metadata = comma >= 0 ? lines[index].slice(0, comma) : lines[index];
    const attrs = parseAttributes(metadata);
    const name = (comma >= 0 ? lines[index].slice(comma + 1) : attrs['tvg-name'] || 'Sem nome').trim() || 'Sem nome';
    const category = (attrs['group-title'] || 'Outros').trim() || 'Outros';
    let url = '';
    for (let next = index + 1; next < lines.length; next += 1) {
      if (!lines[next].startsWith('#')) {
        url = lines[next];
        index = next;
        break;
      }
    }
    if (!url || blockedGroups.test(category) || blockedGroups.test(name)) continue;
    channels.push({
      id: `channel-${channels.length}-${Buffer.from(name + url).toString('base64').replace(/[^a-z0-9]/gi, '').slice(0, 12)}`,
      name,
      logo: attrs['tvg-logo'] || '',
      category,
      url
    });
  }
  return channels;
}

async function isPublicUrl(value) {
  const target = new URL(value);
  if (!['http:', 'https:'].includes(target.protocol)) return false;
  const records = await dns.lookup(target.hostname, { all: true });
  return records.every(({ address }) => !/^(0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.)/.test(address) && address !== '::1' && !address.startsWith('fc') && !address.startsWith('fe80:'));
}

module.exports = async function playlist(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não suportado.' });
  try {
    const { url } = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body || {};
    if (typeof url !== 'string' || !await isPublicUrl(url)) {
      return response.status(400).json({ error: 'Indica um URL HTTP(S) público de uma playlist autorizada.' });
    }
    const upstream = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!upstream.ok) throw new Error(`A origem respondeu com HTTP ${upstream.status}.`);
    const text = await upstream.text();
    if (text.length > 30 * 1024 * 1024) throw new Error('A playlist excede o limite de 30 MB.');
    return response.status(200).json({ channels: parseM3U(text) });
  } catch (error) {
    return response.status(400).json({ error: error.message || 'Não foi possível ler a playlist.' });
  }
};
