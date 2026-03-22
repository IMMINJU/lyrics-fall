import https from 'https';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const id = searchParams.get('id');

  // Fetch by LRCLIB ID (for shared links)
  if (id) {
    try {
      const body = await httpsGet(`https://lrclib.net/api/get/${id}`);
      const result = JSON.parse(body);
      return Response.json({ ok: true, result });
    } catch (err) {
      return Response.json({ ok: false, error: err.message });
    }
  }

  // Search by query
  if (!q) {
    return Response.json({ ok: false, error: 'Missing query', results: [] });
  }

  try {
    const encoded = encodeURIComponent(q);
    const body = await httpsGet(`https://lrclib.net/api/search?q=${encoded}`);
    const results = JSON.parse(body);

    const synced = results.filter(r => r.syncedLyrics);
    if (synced.length > 0) {
      return Response.json({ ok: true, results: synced.slice(0, 10) });
    }
    return Response.json({ ok: true, results: results.slice(0, 10) });
  } catch (err) {
    return Response.json({ ok: false, error: err.message, results: [] });
  }
}
