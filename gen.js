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

const fs=require('fs');
(async()=>{ fs.mkdirSync('docs/feed',{recursive:true});
 for(const id of Object.keys(BIZ)){ const f=await feed(id); fs.writeFileSync('docs/feed/'+id+'.json',JSON.stringify(f,null,1)); console.log(id,f.radar.items.length,'items',f.radar.errors.length,'errors'); }
 fs.writeFileSync('docs/index.html','<!doctype html><title>NahaLabs Radar</title><p>NahaLabs Radar feeds: <a href="feed/baron.json">feed/baron.json</a>');
})();
