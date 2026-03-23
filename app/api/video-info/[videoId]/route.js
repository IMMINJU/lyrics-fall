export async function GET(request, { params }) {
  const { videoId } = await params;

  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (!res.ok) {
      return Response.json({ ok: false, error: `oEmbed returned ${res.status}` });
    }
    const data = await res.json();
    return Response.json({ ok: true, title: data.title });
  } catch (err) {
    return Response.json({ ok: false, error: err.message });
  }
}
