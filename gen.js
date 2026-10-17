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

const GOOD = /restaurant|dining|diner|eatery|bistro|steakhouse|braai|chef|menu|food price|food inflation|grocer|bookings?|reservation|festive|christmas|function|events?|what.s on|opening|launch|special|load.?shedding|electricity|tariff|eskom|cafe|coffee|pub|bar\b|lunch|dinner|breakfast|takeaway|delivery|tourism|consumer spending/i;
const BAD = /committee|appropriations|nersa|communities|hearing|parliament|battery|solar panel|crime|murder|killed|bail|intimidat|assault|shooting|hijack|arrest|court|police|rape|abduct|quiz|map of|war\b|hormuz|fuel|petrol|diesel|oil price|election|politic|scandal|racis|insult|rank(ing|ed)\b.*(country|world|universit)|clarens|cape town|durban|pretoria|bloemfontein/i;
function score(it, b){ const t=it.title; const bad = b && b.bad ? new RegExp(b.bad, 'i') : BAD; const good = b && b.good ? new RegExp(b.good, 'i') : GOOD; if(bad.test(t)) return -1; let n=0; if(good.test(t)) n+=2; if(/johannesburg|joburg|sandton|woodmead|fourways|gauteng|south africa|\bsa\b/i.test(t)) n+=1; const age=(Date.now()-new Date(it.date).getTime())/86400e3; if(age<=14) n+=1; return n; }

function makePosts(items, eng, b) {
  if (b && b.posts) {
    const out = b.posts.map((p, i) => { const src = items[i]; return { theme: p.theme, hook: p.hook, body: p.body, based_on: src ? src.link : 'preset', channels: ['facebook', 'instagram'] }; });
    return out.map(p => ({ ...p, status: 'draft_for_owner_approval' }));
  }
  const by = g => items.find(i => i.group === g);
  const out = [];
  const cost = by('Costs'); if (cost) out.push({ theme: 'Costs', hook: 'Prices are moving, here is how we keep your plate fair.', body: 'You have seen the headlines: "' + cost.title.replace(/ - [^-]*$/, '') + '". We are keeping our menu honest and our portions generous. Come in this week and taste the difference.', based_on: cost.link, channels: ['facebook', 'instagram'] });
  const ev = by('Events and seasons'); if (ev) out.push({ theme: 'Events', hook: 'Plan your next get-together with us.', body: 'The festive season is close and Joburg is busy. Book your table or your office function early, we will hold the best seats for you. Message us on WhatsApp to reserve.', based_on: ev.link, channels: ['facebook', 'instagram'] });
  const dm = by('Dining and demand'); if (dm) out.push({ theme: 'Demand', hook: 'Fresh on the Joburg dining scene.', body: 'Joburg is eating out again: "' + dm.title.replace(/ - [^-]*$/, '') + '". Here is what we are serving this week. Ask us on WhatsApp for today\'s specials.', based_on: dm.link, channels: ['facebook', 'instagram'] });
  if (eng && eng.real && eng.top_topics && eng.top_topics.length) out.push({ theme: 'Customers ask', hook: 'You asked, we answered.', body: 'Our most asked question this week is about ' + eng.top_topics[0].topic.replace(/_/g, ' ') + '. Message us on WhatsApp and we will sort it in minutes.', based_on: 'whatsapp', channels: ['facebook', 'instagram'] });
  return out.map(p => ({ ...p, status: 'draft_for_owner_approval' }));
}
async function feed(id) {
  const b = BIZ[id]; const radar = [], errors = [], seen = new Set();
  for (const [group, q] of b.topics) {
    try { for (const it of await rss(q)) { if (seen.has(it.title)) continue; seen.add(it.title); radar.push({ group, query: q, ...it }); } }
    catch (e) { errors.push({ query: q, error: String(e.message || e) }); }
  }
  for (const it of radar) it.score = score(it, b);
  const kept = radar.filter(i => i.score >= 3);
  kept.sort((a, b2) => b2.score - a.score || (b2.date || '').localeCompare(a.date || ''));
  radar.length = 0; radar.push(...kept.slice(0, 8));
  const eng = await engagement(b);
  const posts = makePosts(radar, eng, b);
  return { business: id, business_name: b.name, area: b.area, generated_at: new Date().toISOString(),
    radar: { real: true, source: 'Google News RSS (public), last 30 days', items: radar, errors },
    whatsapp_engagement: eng, post_suggestions: posts,
    post_ideas_inputs: { use: 'Combine radar.items with whatsapp_engagement.top_topics to draft posts. Only treat engagement as fact when real is true, and mention it is test data when data_label says so.' } };
}

const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const BB = 'https://nahalabs-growth.onrender.com/';
function dashboard(f, cfg) {
  const e = f.whatsapp_engagement || {};
  const eng = e.real && e.counts && e.counts.messages_pending > 0
    ? '<p>' + e.counts.messages_pending + ' customer messages waiting.</p><ul>' + e.top_topics.map(t => '<li>' + esc(t.topic.replace(/_/g, ' ')) + ': ' + t.count + '</li>').join('') + '</ul><p class="note">' + esc(e.data_label || '') + '</p>'
    : '<p class="empty">No customer questions to show yet. Once your WhatsApp line is connected, the questions your customers ask most will appear here.</p><p class="note">' + esc(e.data_label || '') + '</p>';
  const trend = f.radar.items.length ? f.radar.items.map(i => '<a class="card" href="' + esc(i.link) + '" target="_blank" rel="noopener"><span class="tag">' + esc(i.group) + '</span><span class="t">' + esc(i.title.replace(/ - [^-]*$/, '')) + '</span><span class="m">' + esc(i.source || '') + ' &middot; ' + esc((i.date || '').slice(0, 10)) + '</span></a>').join('') : '<p class="empty">Nothing relevant this week.</p>';
  const posts = f.post_suggestions.map(p => '<div class="post"><span class="tag">' + esc(p.theme) + '</span><h3>' + esc(p.hook) + '</h3><p>' + esc(p.body) + '</p><p class="m">For: ' + p.channels.join(', ') + ' &middot; Draft, needs your approval</p><a class="btn" href="' + BB + '" target="_blank" rel="noopener">Schedule in RevUp</a></div>').join('') || '<p class="empty">No suggestions yet.</p>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(cfg.dashboard_title) + '</title><style>' +
  'body{margin:0;font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f4f6fb;color:#1b2a4a}header{background:#1b2a4a;color:#fff;padding:18px 22px}header b{font-size:18px}header span{display:block;opacity:.75;font-size:13px;margin-top:4px}main{max-width:980px;margin:0 auto;padding:18px}h2{margin:26px 0 10px;font-size:19px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}.card,.post,.box{background:#fff;border-radius:12px;padding:14px;box-shadow:0 1px 3px #0001;text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:6px}.tag{align-self:flex-start;background:#e3ecff;color:#1565c0;border-radius:99px;padding:2px 10px;font-size:12px;font-weight:600}.t{font-weight:600;line-height:1.3}.m,.note{color:#667;font-size:12px}.empty{color:#556}.post h3{margin:2px 0}.post p{margin:4px 0}.btn{margin-top:6px;align-self:flex-start;background:#1565c0;color:#fff;border-radius:8px;padding:9px 14px;text-decoration:none;font-weight:600;font-size:14px}footer{padding:24px;text-align:center;color:#778;font-size:12px}' +
  '</style></head><body><header><b>RevUp</b><span>' + esc(cfg.dashboard_title) + ' &middot; updated ' + esc(f.generated_at.slice(0, 16).replace('T', ' ')) + ' UTC</span></header><main>' +
  '<h2>What your customers ask on WhatsApp</h2><div class="box">' + eng + '</div>' +
  '<h2>Trending in your market</h2><div class="grid">' + trend + '</div>' +
  '<h2>Post ideas, ready to schedule</h2><div class="grid">' + posts + '</div></main><footer>RevUp &middot; nahalabs.co.za</footer></body></html>';
}
(async () => {
  fs.mkdirSync('docs/feed', { recursive: true });
  for (const id of Object.keys(BIZ)) { const f = await feed(id); fs.writeFileSync('docs/feed/' + id + '.json', JSON.stringify(f, null, 1)); fs.mkdirSync('docs/d/' + id, { recursive: true }); fs.writeFileSync('docs/d/' + id + '/index.html', dashboard(f, BIZ[id])); console.log(id, f.radar.items.length, 'items', f.radar.errors.length, 'errors', 'engagement real=' + (f.whatsapp_engagement && f.whatsapp_engagement.real)); }
  fs.writeFileSync('docs/index.html', '<!doctype html><meta name="robots" content="noindex"><title>RevUp</title><p>RevUp');
})();
