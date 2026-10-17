// NahaLabs Radar generator. Per-business config in businesses.json (add a business = add an entry).
const fs = require('fs');
const BIZ = JSON.parse(fs.readFileSync('businesses.json', 'utf8'));
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
const TOPICS = { bookings: /book|table|reserv|seat|tonight|saturday|sunday|people|guests/i, opening_hours: /open|close|hours|time/i, menu: /menu|burger|steak|vegetarian|vegan|halal|gluten|allerg|special/i, prices: /price|cost|how much|R\d+|deal|discount/i, delivery_or_takeaway: /deliver|takeaway|collect|order/i };
async function engagement(cfg) {
  const e = cfg.engagement; if (!e) return null;
  const key = process.env[e.keyEnv];
  if (!key) return { real: false, sample: true, note: 'Engagement source not connected in this build. Sample only, do not post as fact.', top_topics: [], counts: { messages: 0 } };
  try {
    const r = await fetch(e.url + '/v1/inbox?branchId=' + encodeURIComponent(e.branchId) + '&status=pending&limit=500', { headers: { 'x-api-key': key, Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error('inbox ' + r.status);
    const d = await r.json(); const msgs = d.messages || [];
    const tally = {};
    for (const m of msgs) { const t = String(m.text || m.body || m.content || ''); for (const [k, re] of Object.entries(TOPICS)) if (re.test(t)) tally[k] = (tally[k] || 0) + 1; }
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, count }));
    return { real: true, sample: false, data_label: e.label, source: 'Restaurant concierge /v1/inbox (pending messages)', counts: { messages_pending: msgs.length }, top_topics: top, note: 'Aggregates only. No customer numbers or message text are published.' };
  } catch (err) { return { real: false, sample: true, error: String(err.message || err), note: 'Engagement fetch failed; sample only.', top_topics: [], counts: { messages: 0 } }; }
}
async function feed(id) {
  const b = BIZ[id]; const radar = [], errors = [], seen = new Set();
  for (const [group, q] of b.topics) {
    try { for (const it of await rss(q)) { if (seen.has(it.title)) continue; seen.add(it.title); radar.push({ group, query: q, ...it }); } }
    catch (e) { errors.push({ query: q, error: String(e.message || e) }); }
  }
  radar.sort((a, b2) => (b2.date || '').localeCompare(a.date || ''));
  return { business: id, business_name: b.name, area: b.area, generated_at: new Date().toISOString(),
    radar: { real: true, source: 'Google News RSS (public), last 30 days', items: radar, errors },
    whatsapp_engagement: await engagement(b),
    post_ideas_inputs: { use: 'Combine radar.items with whatsapp_engagement.top_topics to draft posts. Only treat engagement as fact when real is true, and mention it is test data when data_label says so.' } };
}
(async () => {
  fs.mkdirSync('docs/feed', { recursive: true });
  for (const id of Object.keys(BIZ)) { const f = await feed(id); fs.writeFileSync('docs/feed/' + id + '.json', JSON.stringify(f, null, 1)); console.log(id, f.radar.items.length, 'items', f.radar.errors.length, 'errors', 'engagement real=' + (f.whatsapp_engagement && f.whatsapp_engagement.real)); }
  fs.writeFileSync('docs/index.html', '<!doctype html><title>NahaLabs Radar</title><p>NahaLabs Radar feeds: ' + Object.keys(BIZ).map(k => '<a href="feed/' + k + '.json">' + k + '</a>').join(' | '));
})();
