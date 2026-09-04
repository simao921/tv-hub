const dns = require('dns').promises;
const http = require('http');
const https = require('https');
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

function parseRequestBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body || '{}');
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8') || '{}');
    } catch {
      return {};
    }
  }
  if (typeof body === 'object') return body;
  return {};
}

async function isPublicUrl(value) {
  const target = new URL(value);
  if (!['http:', 'https:'].includes(target.protocol)) return false;
  const records = await dns.lookup(target.hostname, { all: true });
  return records.every(({ address }) => !/^(0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.)/.test(address) && address !== '::1' && !address.startsWith('fc') && !address.startsWith('fe80:'));
}

function fetchText(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === 'https:' ? https : http;
    const req = client.get(target, { headers: { 'User-Agent': 'TV-Hub/1.0' } }, (res) => {
      const statusCode = res.statusCode || 0;
      const location = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
        const redirectUrl = new URL(location, target).toString();
        resolve(fetchText(redirectUrl, timeoutMs));
        return;
      }

      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (statusCode >= 400) {
          reject(new Error(`A origem respondeu com HTTP ${statusCode}.`));
          return;
        }
        resolve(body);
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Tempo limite excedido ao abrir a playlist.'));
    });

    req.on('error', reject);
  });
}

module.exports = async function playlist(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não suportado.' });

  try {
    const { url } = parseRequestBody(request.body);
    if (typeof url !== 'string' || !await isPublicUrl(url)) {
      return response.status(400).json({ error: 'Indica um URL HTTP(S) público de uma playlist autorizada.' });
    }

    const text = await fetchText(url, 20000);
    if (text.length > 30 * 1024 * 1024) throw new Error('A playlist excede o limite de 30 MB.');

    return response.status(200).json({ channels: parseM3U(text) });
  } catch (error) {
    return response.status(400).json({ error: error.message || 'Não foi possível ler a playlist.' });
  }
};
