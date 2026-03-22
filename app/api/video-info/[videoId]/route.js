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

export async function GET(request, { params }) {
  const { videoId } = await params;

  try {
    const body = await httpsGet(`https://www.youtube.com/watch?v=${videoId}`);
    let title = '';

    const ogMatch = body.match(/property="og:title"\s+content="([^"]+)"/);
    if (ogMatch) {
      title = ogMatch[1];
    } else {
      const titleMatch = body.match(/<title>(.+?)<\/title>/);
      if (titleMatch) title = titleMatch[1].replace(' - YouTube', '').trim();
    }

    return Response.json({ ok: true, title });
  } catch (err) {
    return Response.json({ ok: false, error: err.message });
  }
}
