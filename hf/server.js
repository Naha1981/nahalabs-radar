// NahaLabs Radar - demand radar feed per business. Free hosting; sleeps when idle.
const http = require('http');
const BIZ = {
  baron: {
    name: 'The Baron (pilot)', area: 'Johannesburg / Sandton / Woodmead', lang: 'en-ZA',
    topics: [
      ['Local dining demand', 'Sandton restaurants new opening OR trending'],
      ['Local dining demand', 'Woodmead restaurant OR Johannesburg restaurant bookings'],
      ['Costs and disruptions', 'load shedding restaurants South Africa'],
      ['Costs and disruptions', 'restaurant food prices South Africa'],
      ['Events and seasons', 'Johannesburg events this month OR December festive season restaurants'],
      ['Competitors', 'Sandton steakhouse OR pub restaurant competitor Johannesburg']
    ]
  }
};
const cache = new Map();
const unesc = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
async function rss(q) {
  const u = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:30d') + '&hl=en-ZA&gl=ZA&ceid=ZA:en';
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 NahaLabsRadar' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('rss ' + r.status);
  const x = await r.text(); const out = [];
  for (const m of x.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const g = t => { const k = m[1].match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>')); return k ? unesc(k[1]) : ''; };
    const title = g('title'), link = g('link'), date = g('pubDate'), source = g('source');
    if (title && link) out.push({ title, link, date: date ? new Date(date).toISOString() : null, source });
    if (out.length >= 5) break;
  }
  return out;
}
async function feed(id) {
  const b = BIZ[id]; if (!b) return null;
  const ck = 'f:' + id, c = cache.get(ck); if (c && Date.now() - c.t < 3600e3) return c.v;
  const radar = [], errors = [], seen = new Set();
  for (const [group, q] of b.topics) {
    try { for (const it of await rss(q)) { if (seen.has(it.title)) continue; seen.add(it.title); radar.push({ group, query: q, ...it }); } }
    catch (e) { errors.push({ query: q, error: String(e.message || e) }); }
  }
  radar.sort((a, b2) => (b2.date || '').localeCompare(a.date || ''));
  const v = {
    business: id, business_name: b.name, area: b.area, generated_at: new Date().toISOString(),
    radar: { real: true, source: 'Google News RSS (public), last 30 days', items: radar, errors },
    whatsapp_engagement: {
      real: false, sample: true,
      note: 'SAMPLE DATA - not real customer data. Real engagement will replace this once the Baron concierge database is connected.',
      questions_this_week: ['Do you have a table for 6 on Saturday?', 'What time does the Woodmead branch close?', 'Do you do a vegetarian option?'],
      top_topics: ['bookings', 'opening hours', 'menu'],
      counts: { conversations: 0, messages: 0 }
    },
    post_ideas_inputs: { use: 'Combine radar.items headlines with whatsapp_engagement.top_topics to draft posts. Do not post sample engagement as fact.' }
  };
  cache.set(ck, { t: Date.now(), v }); return v;
}
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const send = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o, null, 1)); };
  try {
    if (u.pathname === '/' ) return send(200, { service: 'NahaLabs Radar', feeds: Object.keys(BIZ).map(k => '/feed/' + k + '.json'), health: '/health' });
    if (u.pathname === '/health') return send(200, { ok: true });
    const m = u.pathname.match(/^\/feed\/([a-z0-9-]+)\.json$/);
    if (m) { const f = await feed(m[1]); return f ? send(200, f) : send(404, { error: 'unknown business' }); }
    send(404, { error: 'not found' });
  } catch (e) { send(500, { error: String(e.message || e) }); }
}).listen(process.env.PORT || 8080, () => console.log('radar up'));
