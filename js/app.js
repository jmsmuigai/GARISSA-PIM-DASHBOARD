/* Garissa County PIM Projects Dashboard - application script (no build step, no framework). */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } } };

/* ---------------- language ---------------- */
let LANG = store.get('gsa_lang', 'en');
if (!I18N[LANG]) LANG = 'en';
const EN_DOM = {};
const t = (k, v) => { let s = (I18N[LANG] && I18N[LANG][k]) ?? I18N.en[k] ?? k; if (v) for (const x in v) s = s.replace('{' + x + '}', v[x]); return s; };
function applyLang() {
  document.documentElement.lang = LANG;
  $$('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n;
    if (!(k in EN_DOM)) EN_DOM[k] = el.innerHTML;
    el.innerHTML = LANG !== 'en' && I18N[LANG][k] ? esc(I18N[LANG][k]) : EN_DOM[k];
  });
  $('#lang').value = LANG;
}

/* ---------------- data ---------------- */
let P = [], META = {}, GEO = {}, LIB = null;
const STATUSES = ['Completed', 'Ongoing', 'Stalled', 'Proposed'];
const F = { q: '', status: '', sub: '', ward: '', dept: '', fy: '', fund: '', area: null };
const money = n => n == null ? t('tbc') : 'KES ' + Math.round(n).toLocaleString('en-KE');
const short = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(Math.round(n));
const fdate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString(LANG === 'en' ? 'en-GB' : LANG, { day: 'numeric', month: 'short', year: 'numeric' }) : t('not_recorded');
const uniq = k => [...new Set(P.map(p => p[k]).filter(Boolean))].sort();

function inPoly(lon, lat, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.some(poly => {
    const r = poly[0]; let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > lat) !== (r[j][1] > lat) && lon < (r[j][0] - r[i][0]) * (lat - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    }
    return c;
  });
}
function filtered() {
  const q = F.q.trim().toLowerCase();
  return P.filter(p =>
    (!F.status || p.status === F.status) && (!F.sub || p.sub_county === F.sub) && (!F.ward || p.ward === F.ward) &&
    (!F.dept || p.department === F.dept) && (!F.fy || p.fy === F.fy) && (!F.fund || p.funding === F.fund) &&
    (!F.area || inPoly(p.lon, p.lat, F.area.geom)) &&
    (!q || (p.title + ' ' + p.id + ' ' + (p.ward || '') + ' ' + p.sub_county + ' ' + p.department).toLowerCase().includes(q)));
}

/* ---------------- filters UI ---------------- */
function buildFilters(box) {
  const sel = (k, key, opts) => `<label>${esc(t(key))}<select data-f="${k}"><option value="">${esc(t('all'))}</option>${opts.map(o => `<option value="${esc(o)}">${esc(k === 'status' ? t('s_' + o) : o)}</option>`).join('')}</select></label>`;
  const wards = [...new Set(P.filter(p => !F.sub || p.sub_county === F.sub).map(p => p.ward).filter(Boolean))].sort();
  box.innerHTML = `<label class="wide">${esc(t('search'))}<input type="search" data-f="q" placeholder="${esc(t('search_ph'))}"></label>` +
    sel('status', 'status', STATUSES) + sel('sub', 'sub_county', uniq('sub_county')) + sel('ward', 'ward', wards) +
    sel('dept', 'department', uniq('department')) + sel('fy', 'fy', uniq('fy')) + sel('fund', 'funding', uniq('funding')) +
    `<button class="btn small" data-clear>${esc(t('clear'))}</button>`;
  $$('[data-f]', box).forEach(el => {
    el.value = F[el.dataset.f];
    el.addEventListener(el.type === 'search' ? 'input' : 'change', () => {
      F[el.dataset.f] = el.value;
      if (el.dataset.f === 'sub') F.ward = '';
      page = 1; refresh(el.type === 'search' ? box : null);
      if (el.type !== 'search') { const again = $(`[data-f=${el.dataset.f}]`, box); if (again) again.focus(); }
    });
  });
  $('[data-clear]', box).onclick = () => { Object.assign(F, { q: '', status: '', sub: '', ward: '', dept: '', fy: '', fund: '', area: null }); page = 1; refresh(); };
}
function refresh(skipBox) {
  ['#listFilters', '#mapFilters'].forEach(s => { const b = $(s); if (b !== skipBox) buildFilters(b); });
  renderChips(); renderList(); renderMap();
}

/* ---------------- home ---------------- */
function renderHome() {
  const c = s => P.filter(p => p.status === s).length;
  const total = P.reduce((a, p) => a + (p.cost || 0), 0);
  const cells = [[P.length, 'total_projects', ''], ...STATUSES.map(s => [c(s), 's_' + s, s]), ['KES ' + short(total), 'total_budget', '']];
  $('#stats').innerHTML = cells.map(([n, k, s]) => `<button class="stat" data-s="${s}"><b>${n}</b><span>${esc(t(k))}</span></button>`).join('');
  $$('#stats .stat').forEach(b => b.onclick = () => { F.status = b.dataset.s; page = 1; location.hash = '#projects'; refresh(); });
  // outline map
  const ring = GEO.county.features[0].geometry.coordinates[0];
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), k = 280 / Math.max(x1 - x0, y1 - y0);
  const pr = ([x, y]) => [(10 + (x - x0) * k).toFixed(1), (10 + (y1 - y) * k).toFixed(1)];
  const path = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(pl => 'M' + pl[0].map(pt => pr(pt).join(',')).join('L') + 'Z').join('');
  const col = { Completed: '#8fd6a8', Ongoing: '#9cc9f5', Stalled: '#ff9c8a', Proposed: '#f7d98b' };
  $('#heroMap').innerHTML = GEO.subs.features.map(f => `<path d="${path(f.geometry)}" fill="#ffffff14" stroke="#f7d98b" stroke-width=".7"/>`).join('') +
    P.map(p => { const [x, y] = pr([p.lon, p.lat]); return `<circle cx="${x}" cy="${y}" r="${p.flagship ? 5 : 2.2}" fill="${p.flagship ? '#e3a21a' : col[p.status]}" ${p.flagship ? 'stroke="#fff" stroke-width="1.5"' : ''}/>`; }).join('');
  $('#updated').textContent = t('updated_on', { d: fdate(META.generated) });
}

/* ---------------- projects list ---------------- */
let page = 1, view = store.get('gsa_view', 'cards');
const badge = p => `<span class="st" style="--c:var(--c-${p.status})" data-l="${p.status[0]}">${esc(t('s_' + p.status))}</span>`;
const place = p => esc([p.ward, p.sub_county].filter(Boolean).join(', '));
function renderChips() {
  $('#chips').innerHTML = ['', ...STATUSES].map(s => `<button class="chip" aria-pressed="${F.status === s}" data-s="${s}">${s ? P.filter(p => p.status === s).length + ' ' + esc(t('s_' + s)) : esc(t('all')) + ' ' + P.length}</button>`).join('');
  $$('#chips .chip').forEach(b => b.onclick = () => { F.status = b.dataset.s; page = 1; refresh(); });
}
function renderList(all) {
  const rows = filtered(), per = view === 'cards' ? 12 : 25, pages = Math.max(1, Math.ceil(rows.length / per));
  page = Math.min(page, pages);
  const shown = all ? rows : rows.slice((page - 1) * per, page * per);
  $('#listCount').textContent = t('n_shown', { n: rows.length, t: P.length });
  $('#vCards').setAttribute('aria-pressed', view === 'cards'); $('#vTable').setAttribute('aria-pressed', view === 'table');
  if (!rows.length) { $('#list').innerHTML = `<p class="note">${esc(t('none_found'))}</p>`; $('#pager').innerHTML = ''; return; }
  if (view === 'cards' && !all) {
    $('#list').innerHTML = '<div class="cards">' + shown.map(p => `<article class="pcard" style="--c:var(--c-${p.status})">
      ${badge(p)}<h3>${p.flagship ? '★ ' : ''}${esc(p.title)}</h3>
      <p class="meta">📍 ${place(p)}<br>🗓 ${esc(p.fy)} · 🏛 ${esc(p.department)}<br>💰 ${esc(p.funding)}</p>
      ${p.pct != null && p.status !== 'Completed' ? `<div class="bar" title="${p.pct}%"><i style="width:${p.pct}%;--c:var(--c-${p.status})"></i></div>` : ''}
      <div class="foot"><b>${p.cost == null ? esc(t('tbc')) : 'KES ' + short(p.cost)}</b><button data-id="${esc(p.id)}">${esc(t('view'))} →</button></div></article>`).join('') + '</div>';
  } else {
    $('#list').innerHTML = `<div class="tablewrap"><table><caption class="sr">${esc(t('print_title'))}</caption><thead><tr><th>${esc(t('project_id'))}</th><th>${esc(t('name'))}</th><th>${esc(t('status'))}</th><th>${esc(t('fy'))}</th><th>${esc(t('location'))}</th><th>${esc(t('department'))}</th><th class="n">${esc(t('budget'))}</th></tr></thead><tbody>` +
      shown.map(p => `<tr class="click" data-id="${esc(p.id)}" tabindex="0"><td>${esc(p.id)}</td><td>${esc(p.title)}</td><td>${badge(p)}</td><td>${esc(p.fy)}</td><td>${place(p)}</td><td>${esc(p.department)}</td><td class="n">${p.cost == null ? esc(t('tbc')) : Math.round(p.cost).toLocaleString()}</td></tr>`).join('') + '</tbody></table></div>';
  }
  $$('#list [data-id]').forEach(el => { el.onclick = () => openProject(el.dataset.id); el.onkeydown = e => { if (e.key === 'Enter') openProject(el.dataset.id); }; });
  $('#pager').innerHTML = all || pages < 2 ? '' : `<button class="btn small" ${page < 2 ? 'disabled' : ''} data-p="-1">← ${esc(t('prev'))}</button><span>${esc(t('page', { p: page, t: pages }))}</span><button class="btn small" ${page >= pages ? 'disabled' : ''} data-p="1">${esc(t('next'))} →</button>`;
  $$('#pager [data-p]').forEach(b => b.onclick = () => { page += +b.dataset.p; renderList(); $('#listFilters').scrollIntoView(); });
}

/* ---------------- exports ---------------- */
const COLS = [['Project ID', 'id'], ['Project name', 'title'], ['Department', 'department'], ['Sector', 'sector'], ['Financial year', 'fy'], ['Funding source', 'funding'],
  ['Sub-county', 'sub_county'], ['Ward', 'ward'], ['Latitude', 'lat'], ['Longitude', 'lon'], ['Location basis', 'loc_precision'], ['Tender number', 'tender_no'],
  ['Estimated / contract cost (KES)', 'cost'], ['Approved cost (KES)', 'approved'], ['Disbursed (KES)', 'disbursed'], ['Expenditure to date (KES)', 'expenditure'],
  ['Start date', 'start'], ['Planned completion', 'planned_end'], ['Actual completion', 'actual_end'], ['% complete', 'pct'], ['Status', 'status'],
  ['Status remarks', 'status_note'], ['Stock-take band', 'band'], ['Data source', 'source']];
const toRows = rows => [COLS.map(c => c[0]), ...rows.map(p => COLS.map(c => p[c[1]] ?? ''))];
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function exportCSV(rows, name) {
  const csv = toRows(rows).map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(',')).join('\r\n');
  download(name + '.csv', new Blob(['﻿' + csv], { type: 'text/csv' }));
}
function loadXLSX() { return window.XLSX ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'vendor/xlsx.mini.min.js'; s.onload = ok; s.onerror = no; document.head.append(s); }); }
async function exportXLSX(rows, name, sheet) {
  try {
    await loadXLSX();
    const ws = XLSX.utils.aoa_to_sheet(toRows(rows)); ws['!cols'] = COLS.map((c, i) => ({ wch: i === 1 ? 60 : 18 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, (sheet || 'Projects').slice(0, 31)); XLSX.writeFile(wb, name + '.xlsx');
  } catch (e) { exportCSV(rows, name); }
}
function printList() { const v = view; view = 'table'; renderList(true); $('#projects').classList.add('print'); window.print(); $('#projects').classList.remove('print'); view = v; renderList(); }
const stamp = () => new Date().toISOString().slice(0, 10);

/* ---------------- project dialog ---------------- */
let dlgMap;
function openProject(id) {
  const p = P.find(x => x.id === id); if (!p) return;
  const row = (k, v) => `<div><dt>${esc(t(k))}</dt><dd>${v}</dd></div>`;
  $('#dlgBody').innerHTML = `<button class="x" data-close aria-label="${esc(t('close'))}">×</button>
    ${badge(p)} ${p.flagship ? `<span class="tag gold">${esc(t('flag_tag'))}</span>` : ''}
    <h2 id="dlgTitle">${esc(p.title)}</h2>
    ${p.status_note ? `<p>${esc(p.status_note)}</p>` : ''}
    ${p.pct != null ? `<div class="bar" style="height:12px"><i style="width:${p.pct}%;--c:var(--c-${p.status})"></i></div><p class="hint">${esc(t('progress'))}: ${p.pct}%</p>` : ''}
    <dl class="dl">${row('project_id', esc(p.id))}${row('status', esc(t('s_' + p.status)))}${row('fy', esc(p.fy))}${row('department', esc(p.department))}
      ${row('sector', esc(p.sector))}${row('funding', esc(p.funding))}${row('sub_county', esc(p.sub_county))}${row('ward', esc(p.ward || t('tbc')))}
      ${row('contract_sum', money(p.cost))}${row('approved', money(p.approved))}${row('disbursed', p.disbursed == null ? esc(t('not_recorded')) : money(p.disbursed))}${row('spent', p.expenditure == null ? esc(t('not_recorded')) : money(p.expenditure))}
      ${row('start', esc(fdate(p.start)))}${row('planned_end', esc(fdate(p.planned_end)))}${row('actual_end', esc(fdate(p.actual_end)))}${row('band', esc(p.band))}
      ${p.tender_no ? row('tender_no', esc(p.tender_no)) : ''}${row('gps', p.lat.toFixed(5) + ', ' + p.lon.toFixed(5))}${row('loc_how', esc(p.loc_precision))}${row('source', p.source_url ? `<a href="${esc(p.source_url)}" rel="noopener" target="_blank">${esc(p.source)}</a>` : esc(p.source))}
    </dl>
    ${p.data_note ? `<p class="note"><b>${esc(t('note'))}:</b> ${esc(p.data_note)}</p>` : ''}
    <div id="dlgMap"></div>
    <p class="cta"><button class="btn" data-fb>${esc(t('feedback_on'))}</button>
      <button class="btn small" data-map>${esc(t('show_map'))}</button><button class="btn small" data-share>${esc(t('share'))}</button>
      ${p.tracker ? `<a class="btn small" href="#library" data-close>${esc(t('flag_more'))}</a>` : ''}</p>`;
  const d = $('#dlg'); if (!d.open) d.showModal();
  if (dlgMap) dlgMap.remove();
  dlgMap = L.map('dlgMap', { zoomControl: true, attributionControl: false, scrollWheelZoom: false }).setView([p.lat, p.lon], 12);
  base('layer_osm').addTo(dlgMap); L.geoJSON(GEO.wards, { style: { color: '#7a2408', weight: 1, fill: false } }).addTo(dlgMap);
  L.marker([p.lat, p.lon], { icon: icon(p) }).addTo(dlgMap); setTimeout(() => dlgMap.invalidateSize(), 60);
  $('[data-fb]', d).onclick = () => { d.close(); location.hash = '#feedback'; setFbProject(p); };
  $('[data-map]', d).onclick = () => { d.close(); location.hash = '#map'; setTimeout(() => flyTo(p), 350); };
  $('[data-share]', d).onclick = () => { const u = location.origin + location.pathname + '?p=' + encodeURIComponent(p.id); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast(t('copied')), () => prompt(t('share'), u)); };
}
document.addEventListener('click', e => { const c = e.target.closest('[data-close]'); if (c) c.closest('dialog').close(); });
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 3500); }

/* ---------------- map ---------------- */
let map, cluster, starLayer, subLayer, markers = {};
function base(key) {
  const b = CONFIG.BASEMAPS[key], o = { attribution: b.attr, maxZoom: 19, maxNativeZoom: b.max };
  const main = L.tileLayer(b.url, o);
  return b.labels ? L.layerGroup([main, L.tileLayer(b.roads, o), L.tileLayer(b.labels, o)]) : main;
}
const icon = p => L.divIcon({ className: '', iconSize: p.flagship ? [34, 34] : [26, 26], iconAnchor: p.flagship ? [17, 34] : [13, 26], popupAnchor: [0, -24],
  html: `<span class="mk ${p.flagship ? 'star' : ''}" style="--c:var(--c-${p.status})"><i>${p.flagship ? '★' : p.status[0]}</i></span>` });
const popup = p => `${badge(p)}<h3>${esc(p.title)}</h3><p>📍 ${place(p)}</p><p>🗓 ${esc(p.fy)} · ${esc(p.department)}</p><p>💰 ${money(p.cost)}</p>
  <button class="btn" onclick="GSA.open('${esc(p.id)}')">${esc(t('view'))}</button><button class="btn" onclick="GSA.fb('${esc(p.id)}')">${esc(t('nav_feedback'))}</button>`;
function initMap() {
  if (map) return;
  map = L.map('leaflet', { zoomControl: true }).setView([-0.45, 40.1], 8);
  const bases = {}; Object.keys(CONFIG.BASEMAPS).forEach(k => bases[t(k)] = base(k));
  bases[t(store.get('gsa_base', CONFIG.DEFAULT_BASEMAP))].addTo(map);
  map.on('baselayerchange', e => { const k = Object.keys(CONFIG.BASEMAPS).find(x => t(x) === e.name); if (k) store.set('gsa_base', k); });
  const county = L.geoJSON(GEO.county, { style: { color: '#4d1503', weight: 3.5, fill: false }, interactive: false }).addTo(map);
  const areaClick = (f, name) => () => { F.area = { name, geom: f.geometry }; page = 1; refresh(); };
  subLayer = L.geoJSON(GEO.subs, { style: subStyle, onEachFeature: (f, l) => { l.bindTooltip(f.properties.sub_county, { permanent: true, direction: 'center', className: 'lbl' }); l.on('click', areaClick(f, f.properties.sub_county)); } }).addTo(map);
  const wards = L.geoJSON(GEO.wards, { style: { color: '#1e6b3c', weight: 1, dashArray: '4 3', fillOpacity: 0 }, onEachFeature: (f, l) => { l.bindTooltip(f.properties.ward + ' · ' + f.properties.sub_county, { sticky: true }); l.on('click', areaClick(f, f.properties.ward)); l.on('mouseover', () => l.setStyle({ fillOpacity: .15, fillColor: '#e3a21a' })); l.on('mouseout', () => l.setStyle({ fillOpacity: 0 })); } }).addTo(map);
  cluster = L.markerClusterGroup({ maxClusterRadius: 38, showCoverageOnHover: false }).addTo(map);
  starLayer = L.layerGroup().addTo(map);
  L.control.layers(bases, { [t('ov_county')]: county, [t('ov_sub')]: subLayer, [t('ov_ward')]: wards, [t('ov_proj')]: cluster }, { collapsed: window.innerWidth < 900 }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  map.fitBounds(county.getBounds(), { padding: [10, 10] });
  $('#legend').innerHTML = STATUSES.map(s => `<span><span class="mk" style="--c:var(--c-${s})"><i>${s[0]}</i></span>${esc(t('s_' + s))}</span>`).join('') + `<span><span class="mk star"><i>★</i></span>${esc(t('flag_tag'))}</span>`;
  $('#shade').onchange = () => subLayer.setStyle(subStyle);
  $('#libFly').onclick = () => flyTo(P.find(p => p.flagship));
  renderMap();
}
const subKey = s => s.replace(' Township', '');
function subStyle(f) {
  if (!$('#shade').checked) return { color: '#7a2408', weight: 2, fillOpacity: 0 };
  const rows = filtered(), n = rows.filter(p => subKey(p.sub_county) === f.properties.sub_county).length;
  const max = Math.max(1, ...GEO.subs.features.map(g => rows.filter(p => subKey(p.sub_county) === g.properties.sub_county).length));
  return { color: '#7a2408', weight: 2, fillColor: '#7a2408', fillOpacity: .08 + .55 * n / max };
}
function renderMap() {
  const rows = filtered();
  $('#mapCount').innerHTML = esc(t('n_shown', { n: rows.length, t: P.length })) + (F.area ? `<span class="areapill">${esc(t('shown_in', { w: F.area.name }))}<button class="btn small" id="areaReset">${esc(t('reset'))}</button></span>` : '');
  if (F.area) $('#areaReset').onclick = () => { F.area = null; refresh(); };
  if (!map) return;
  cluster.clearLayers(); starLayer.clearLayers(); markers = {};
  rows.forEach(p => { const m = L.marker([p.lat, p.lon], { icon: icon(p), title: p.title, alt: p.title + ' (' + p.status + ')', zIndexOffset: p.flagship ? 1000 : 0 }).bindPopup(popup(p)); markers[p.id] = m; (p.flagship ? starLayer : cluster).addLayer(m); });
  subLayer.setStyle(subStyle);
  if (F.area) map.fitBounds(L.geoJSON(F.area.geom).getBounds(), { padding: [20, 20] });
}
function flyTo(p) {
  initMap(); if (!markers[p.id]) { Object.assign(F, { q: '', status: '', sub: '', ward: '', dept: '', fy: '', fund: '', area: null }); refresh(); }
  map.setView([p.lat, p.lon], 15); const m = markers[p.id];
  if (p.flagship) m.openPopup(); else cluster.zoomToShowLayer(m, () => m.openPopup());
}
window.GSA = { open: openProject, fb: id => { map && map.closePopup(); location.hash = '#feedback'; setFbProject(P.find(p => p.id === id)); } };

/* ---------------- analytics ---------------- */
function bars(title, pairs, fmt, colour) {
  const max = Math.max(1, ...pairs.map(p => p[1]));
  return `<div class="chart"><h3>${esc(title)}</h3>${pairs.map(([k, v, c]) => `<div class="hb"><span class="t" title="${esc(k)}">${esc(k)}</span><div class="bar"><i style="width:${(100 * v / max).toFixed(1)}%;--c:${c || colour || 'var(--maroon)'}"></i></div><span class="v">${fmt ? fmt(v) : v}</span></div>`).join('')}</div>`;
}
const group = (k, val) => { const m = {}; P.forEach(p => m[p[k]] = (m[p[k]] || 0) + (val ? p[val] || 0 : 1)); return Object.entries(m); };
function renderAnalytics() {
  const desc = a => a.sort((x, y) => y[1] - x[1]);
  $('#charts').innerHTML =
    bars(t('by_status'), STATUSES.map(s => [t('s_' + s), P.filter(p => p.status === s).length, `var(--c-${s})`])) +
    bars(t('by_fund'), desc(group('funding')), null, 'var(--green)') +
    bars(t('by_sub'), desc(group('sub_county'))) + bars(t('cost_sub'), desc(group('sub_county', 'cost')), short, 'var(--gold)') +
    bars(t('by_dept'), desc(group('department'))) + bars(t('cost_dept'), desc(group('department', 'cost')), short, 'var(--gold)') +
    bars(t('by_fy'), group('fy').sort(), null, 'var(--green)');
  const bandsOrder = ['10 financial years and above', '5 to 10 financial years', '1 to 4 financial years'];
  $('#bands').innerHTML = `<table><thead><tr><th>${esc(t('band'))}</th>${STATUSES.map(s => `<th class="n">${esc(t('s_' + s))}</th>`).join('')}<th class="n">${esc(t('projects'))}</th><th class="n">${esc(t('budget'))} (KES)</th><th></th></tr></thead><tbody>` +
    bandsOrder.map(b => { const r = P.filter(p => p.band === b); return `<tr><td>${esc(b)}</td>${STATUSES.map(s => `<td class="n">${r.filter(p => p.status === s).length}</td>`).join('')}<td class="n"><b>${r.length}</b></td><td class="n">${Math.round(r.reduce((a, p) => a + (p.cost || 0), 0)).toLocaleString()}</td><td><button class="btn small" data-band="${esc(b)}">⬇ Excel</button></td></tr>`; }).join('') + '</tbody></table>';
  $$('#bands [data-band]').forEach(b => b.onclick = () => exportXLSX(P.filter(p => p.band === b.dataset.band), 'Garissa_stocktake_' + b.dataset.band.replace(/\W+/g, '_') + '_' + stamp(), 'Stock-take'));
  const st = P.filter(p => p.status === 'Stalled');
  $('#stalled').innerHTML = `<table><thead><tr><th>${esc(t('name'))}</th><th>${esc(t('fy'))}</th><th>${esc(t('location'))}</th><th class="n">${esc(t('contract_sum'))}</th><th class="n">${esc(t('disbursed'))}</th><th class="n">${esc(t('progress'))}</th><th>${esc(t('note'))}</th></tr></thead><tbody>` +
    st.map(p => `<tr class="click" data-id="${esc(p.id)}" tabindex="0"><td>${esc(p.title)}</td><td>${esc(p.fy)}</td><td>${place(p)}</td><td class="n">${Math.round(p.cost).toLocaleString()}</td><td class="n">${p.disbursed == null ? '–' : Math.round(p.disbursed).toLocaleString()}</td><td class="n">${p.pct == null ? '–' : p.pct + '%'}</td><td>${esc(p.status_note)}</td></tr>`).join('') + '</tbody></table>';
  $$('#stalled [data-id]').forEach(el => el.onclick = () => openProject(el.dataset.id));
}

/* ---------------- library tracker ---------------- */
let libMap;
function renderLibrary() {
  const p = P.find(x => x.flagship); if (!p || !LIB) return;
  $('#libTitle').textContent = p.title;
  $('#libSteps').innerHTML = LIB.phases.map((ph, i) => { const n = i + 1, c = n < LIB.current_phase ? 'done' : n === LIB.current_phase ? 'now' : ''; return `<li class="${c}" ${c === 'now' ? 'aria-current="step"' : ''}><b>${n}. ${esc(c === 'done' ? t('lib_done') : c === 'now' ? t('lib_current') : t('lib_next'))}</b>${esc(ph[LANG] || ph.en)}</li>`; }).join('');
  const lab = { ready: ['✓', 'ready', ''], progress: ['…', 'in_progress', 'progress'], pending: ['○', 'pending_s', 'pending'] };
  const done = LIB.requirements.filter(r => r.status === 'ready').length;
  $('#libReqs').innerHTML = LIB.requirements.map(r => { const [ic, k, c] = lab[r.status] || lab.pending; return `<li class="${c}"><span class="ic" aria-hidden="true">${ic}</span><span>${esc(r[LANG] || r.en)}<small>${esc(t(k))}</small></span></li>`; }).join('');
  $('#libPct').textContent = t('lib_pct', { d: done, t: LIB.requirements.length });
  setTimeout(() => $('#libBar').style.width = (100 * done / LIB.requirements.length) + '%', 50);
  $('#libUpdated').textContent = t('updated') + ': ' + fdate(LIB.updated);
  $('#libCoord').textContent = p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) + ' · ' + t('approx');
  if (!$('#library').hidden && !libMap) {
    libMap = L.map('libMap', { scrollWheelZoom: false }).setView([p.lat, p.lon], 16);
    const b = { [t('layer_hyb')]: base('layer_hyb'), [t('layer_osm')]: base('layer_osm') };
    b[t('layer_hyb')].addTo(libMap); L.control.layers(b).addTo(libMap);
    L.marker([p.lat, p.lon], { icon: icon(p) }).addTo(libMap).bindPopup(esc(p.title));
  }
  if (libMap) setTimeout(() => libMap.invalidateSize(), 80);
}

/* ---------------- feedback ---------------- */
const AUTO = {
  en: 'Dear Sir/Madam,\n\nThank you for contacting the County Government of Garissa. Your feedback has been received under reference {ref}.\n\nThe responsible department is reviewing it and you will receive a response within {d} days. Please quote the reference number in any further correspondence.\n\nCounty Government of Garissa\nPublic Investment Management Projects Dashboard\nfeedback@garissa.go.ke | www.garissa.go.ke',
  sw: 'Ndugu Mwananchi,\n\nAsante kwa kuwasiliana na Serikali ya Kaunti ya Garissa. Maoni yako yamepokelewa kwa namba ya kumbukumbu {ref}.\n\nIdara husika inayashughulikia na utapokea jibu ndani ya siku {d}. Tafadhali taja namba ya kumbukumbu katika mawasiliano yoyote zaidi.\n\nSerikali ya Kaunti ya Garissa\nfeedback@garissa.go.ke | www.garissa.go.ke',
  so: 'Mudane/Marwo,\n\nWaad ku mahadsan tahay la xiriirka Dowladda Ismaamulka Garissa. Ra\'yigaaga waa la helay, lambarka tixraacuna waa {ref}.\n\nWaaxda ku shaqada leh ayaa eegaysa, waxaadna jawaab heli doontaa {d} maalmood gudahood. Fadlan sheeg lambarka tixraaca haddii aad mar kale nala soo xiriirto.\n\nDowladda Ismaamulka Garissa\nfeedback@garissa.go.ke | www.garissa.go.ke'
};
const newRef = kind => 'GSA-' + kind + '-' + stamp().replace(/-/g, '') + '-' + Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
function transmit(m) {
  if (CONFIG.FEEDBACK_MODE === 'mailto') return Promise.reject(new Error('mailto'));
  const url = CONFIG.FEEDBACK_MODE === 'php' ? CONFIG.PHP_ENDPOINT : 'https://formsubmit.co/ajax/' + CONFIG.FEEDBACK_EMAIL;
  const body = CONFIG.FEEDBACK_MODE === 'php' ? m : Object.assign({
    _subject: `[${m.Reference}] ${m.Type} | ${m.Department || 'General'}${m.Project ? ' | ' + m.Project.slice(0, 70) : ''}`,
    _template: 'table', _captcha: 'false', _autoresponse: (AUTO[m.Language] || AUTO.en).replace('{ref}', m.Reference).replace('{d}', CONFIG.RESPONSE_DAYS)
  }, m);
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
    .then(r => r.json().then(j => { if (!r.ok || String(j.success) === 'false') throw new Error(j.message || 'failed'); return j; }));
}
const queue = () => store.get('gsa_queue', []);
function showQueue() { const q = queue(), el = $('#queued'); el.hidden = !q.length; el.textContent = t('queued_n', { n: q.length }); }
function flushQueue() {
  const q = queue(); if (!q.length || !navigator.onLine) return;
  Promise.allSettled(q.map(transmit)).then(rs => { const left = q.filter((m, i) => rs[i].status === 'rejected'); store.set('gsa_queue', left); showQueue(); if (left.length < q.length) toast(t('queue_sent')); });
}
window.addEventListener('online', flushQueue);
function mailto(m) {
  const body = Object.entries(m).filter(([k, v]) => v && k !== 'Language').map(([k, v]) => k + ': ' + v).join('\n');
  return 'mailto:' + CONFIG.FEEDBACK_EMAIL + '?subject=' + encodeURIComponent('[' + m.Reference + '] ' + m.Type) + '&body=' + encodeURIComponent(body);
}
function handleForm(form, build) {
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form), out = $('.result', form), btn = $('button[type=submit]', form);
    out.className = 'result';
    if (fd.get('_honey')) return;
    const msg = (fd.get('message') || '').trim(), email = (fd.get('email') || '').trim();
    if (msg.length < 10) { out.className = 'result err'; out.textContent = t('fb_short'); form.message.focus(); return; }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { out.className = 'result err'; out.textContent = t('fb_bad_email'); form.email.focus(); return; }
    const m = build(fd); const anon = fd.get('anonymous');
    if (anon) { delete m.Name; delete m.email; delete m.Phone; delete m.Contact; m.Anonymous = 'Yes'; }
    Object.keys(m).forEach(k => { if (!m[k]) delete m[k]; });
    m.Language = LANG; m.Submitted = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' }) + ' EAT';
    const ok = extra => { out.innerHTML = `<h3>${esc(t('fb_ok_t'))}</h3><p>${esc(t('fb_ok_p', { ref: '§' })).replace('§', `<span class="ref">${esc(m.Reference)}</span>`)}</p>${extra || ''}`; form.reset(); syncAnon(form); out.focus && out.scrollIntoView({ block: 'nearest' }); };
    if (!navigator.onLine) { store.set('gsa_queue', [...queue(), m]); showQueue(); out.innerHTML = `<p>${esc(t('fb_queued', { ref: m.Reference }))}</p>`; form.reset(); return; }
    btn.disabled = true; const label = btn.textContent; btn.textContent = t('fb_sending');
    transmit(m).then(() => ok(m.email ? `<p>${esc(t('fb_ok_mail', { email: m.email }))}</p>` : ''))
      .catch(() => { out.className = 'result err'; out.innerHTML = `<p>${esc(t('fb_fail'))}</p><p><a class="btn" href="${esc(mailto(m))}">${esc(t('fb_mailto'))}</a> <span class="ref">${esc(m.Reference)}</span></p>`; })
      .finally(() => { btn.disabled = false; btn.textContent = label; });
  });
  const a = form.elements.anonymous; if (a) a.addEventListener('change', () => syncAnon(form)); out_tab(form);
}
function out_tab(form) { $('.result', form).tabIndex = -1; }
function syncAnon(form) { const w = $('.who', form); if (w) w.hidden = form.elements.anonymous.checked; }
function findProject(text) { const s = (text || '').trim(); return P.find(p => s && (s === p.title || s.endsWith('[' + p.id + ']'))); }
function setFbProject(p) { if (!p) return; $('#fbProject').value = p.title + ' [' + p.id + ']'; routeHint(); setTimeout(() => $('#fbForm textarea').focus(), 200); }
function routeHint() { const p = findProject($('#fbProject').value); $('#fbRoute').textContent = p ? t('fb_routed', { d: p.department }) : ''; }
function initFeedback() {
  $('#projList').innerHTML = P.map(p => `<option value="${esc(p.title + ' [' + p.id + ']')}">`).join('');
  $('#fbWard').innerHTML = '<option value=""></option>' + GEO.wards.features.map(f => f.properties.ward + ', ' + f.properties.sub_county).sort().map(w => `<option>${esc(w)}</option>`).join('');
  $('#fbProject').addEventListener('input', routeHint);
  handleForm($('#fbForm'), fd => { const p = findProject(fd.get('project')); return { Reference: newRef('FB'), Type: fd.get('type'), Project: p ? p.title : fd.get('project'), 'Project ID': p && p.id, Department: p && p.department, Ward: fd.get('ward') || (p && [p.ward, p.sub_county].filter(Boolean).join(', ')), Message: fd.get('message').trim(), Name: fd.get('name'), email: fd.get('email').trim(), Phone: fd.get('phone') }; });
  handleForm($('#grmForm'), fd => { const p = P.find(x => x.flagship), c = (fd.get('contact') || '').trim(); return { Reference: newRef('GRM'), Type: 'Grievance (GRM)', Category: fd.get('category'), Project: p.title, 'Project ID': p.id, Department: 'KDSP II County Program Coordination Unit', Message: fd.get('message').trim(), Name: fd.get('name'), email: c.includes('@') ? c : '', Contact: c.includes('@') ? '' : c }; });
  showQueue(); flushQueue();
}

/* ---------------- KDSP II compliance ---------------- */
const RECO = [
  ['Documentation not standardised across departments; inconsistent use of KDSP II formats', 'One data template for every project (tools/ and the Excel download use the same DLI 7 fields); the data builder cleans names, dates, departments and wards on import.', 1],
  ['Heavy reliance on manual records; retrospective documentation', 'Project records are published from a single dataset that is rebuilt whenever a department updates its workbook; no re-typing.', 1],
  ['Difficulty extracting system-generated reports in required formats', 'One-click Excel, CSV and PDF downloads; stock-take reports in the three KDSP II bands; stalled-projects report.', 1],
  ['Delays retrieving documents from decentralised units', 'Role-based departmental accounts with maker-checker approval and an audit trail.', 0],
  ['Capacity gaps on KDSP II requirements', 'Guided tour, help page and this readiness page explain each DLI 7 requirement in plain language.', 1],
  ['Need for pre-verification internal reviews (mock assessments)', 'Live DLI 7 checklist and data-completeness score on this page show the gaps before the verification team arrives.', 1],
  ['Pending issues after verification need tracking', 'Data-quality notes below list each record that needs correction; requirements tracker for the KDSP II investment project.', 1],
  ['Need for better interdepartmental coordination', 'One shared public view for all departments, the CPCU, Planning, Finance and Supply Chain, filterable by department.', 1],
  ['ASAL context: infrastructure and access constraints', 'Lightweight site that works offline after the first visit; feedback written offline is sent when the connection returns; three languages.', 1],
  ['System-generated citizen feedback report (code 007_DL7_1.4.1)', 'Every message carries a reference number and reaches feedback@garissa.go.ke. The database-backed report (api/feedback.php, api/report.php) switches on when the dashboard moves to the County server.', 0]
];
function renderCompliance() {
  const n = P.length, pc = f => Math.round(100 * P.filter(f).length / n);
  const core = [['Project name', pc(p => p.title)], ['Status', pc(p => p.status)], ['Timeframe (financial year)', pc(p => p.fy)], ['Budget', pc(p => p.cost != null)], ['Location (sub-county and map point)', pc(p => p.sub_county && p.sub_county !== 'To be confirmed' && p.lat)]];
  const extra = [['Ward', pc(p => p.ward)], ['Start and completion dates', pc(p => p.start && p.planned_end)], ['Expenditure to date', pc(p => p.expenditure != null)], ['Tender number', pc(p => p.tender_no)], ['Surveyed GPS coordinates', pc(p => !/approx|confirm/i.test(p.loc_precision))], ['Contractor', pc(p => p.contractor)], ['PMC members', pc(p => p.pmc)], ['Progress photographs', pc(p => p.photos)]];
  const score = Math.round(core.reduce((a, c) => a + c[1], 0) / core.length);
  $('#score').innerHTML = `<b>${score}%</b><span>Average completeness of the five fields the DLI 7 protocol requires for every project: name, status, timeframe, budget and location. ${n} projects published.</span>`;
  const live = CONFIG.FEEDBACK_MODE !== 'mailto';
  const checks = [
    [1, 'Public portal with county projects uploaded', n + ' projects, FY ' + uniq('fy')[0] + ' to ' + uniq('fy').pop()],
    [score === 100 ? 1 : 2, 'Each project shows name, status, timeframe, budget and location', score + '% complete; see the field table below'],
    [1, 'Downloadable project list (Excel, CSV, PDF)', 'Generated from the published data on request'],
    [1, 'Working URL to the public portal', location.origin + location.pathname],
    [live ? 1 : 2, 'Citizen feedback form with automatic acknowledgement', 'Reference number on screen; acknowledgement email; response standard ' + CONFIG.RESPONSE_DAYS + ' days'],
    [1, 'Feedback received at the designated County email', CONFIG.FEEDBACK_EMAIL],
    [CONFIG.FEEDBACK_MODE === 'php' ? 1 : 0, 'System-generated report of feedback received and responses', CONFIG.FEEDBACK_MODE === 'php' ? 'Database report enabled' : 'Enabled when hosted on the County server (database)']
  ];
  $('#dliList').innerHTML = checks.map(([s, a, b]) => `<li class="${s === 1 ? '' : s === 2 ? 'progress' : 'pending'}"><span class="ic" aria-hidden="true">${s === 1 ? '✓' : s === 2 ? '!' : '○'}</span><span>${esc(a)}<small>${esc(b)}</small></span></li>`).join('');
  $('#fieldBars').innerHTML = bars('Required by the DLI 7 protocol', core, v => v + '%', 'var(--green)') + bars('Further fields in the County data standard', extra, v => v + '%', 'var(--gold)');
  $('#recoTable').innerHTML = '<table><thead><tr><th>APA 3 finding or recommendation</th><th>How the dashboard answers it</th><th>Status</th></tr></thead><tbody>' + RECO.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${r[2] ? '<span class="pill">Live</span>' : '<span class="pill host">On County server</span>'}</td></tr>`).join('') + '</tbody></table>';
  $('#dqNotes').innerHTML = (META.data_quality_notes || []).map(x => `<li>${esc(x)}</li>`).join('') + P.filter(p => p.cost == null).map(p => `<li>Budget not yet recorded: ${esc(p.title)} [${esc(p.id)}]</li>`).join('');
  const reps = [['Full project list (DLI 7 fields)', () => P, 'Garissa_projects_DLI7_'], ['Stock-take: 10 FYs and above', () => P.filter(p => p.band.startsWith('10')), 'Garissa_stocktake_10yrs_plus_'], ['Stock-take: 5 to 10 FYs', () => P.filter(p => p.band.startsWith('5')), 'Garissa_stocktake_5_10yrs_'], ['Stock-take: 1 to 4 FYs', () => P.filter(p => p.band.startsWith('1 ')), 'Garissa_stocktake_1_4yrs_'], ['Stalled projects', () => P.filter(p => p.status === 'Stalled'), 'Garissa_stalled_projects_']];
  $('#reportBtns').innerHTML = reps.map((r, i) => `<button class="btn small" data-r="${i}">⬇ ${esc(r[0])}</button>`).join('');
  $$('#reportBtns [data-r]').forEach(b => b.onclick = () => { const r = reps[+b.dataset.r]; exportXLSX(r[1](), r[2] + stamp(), r[0]); });
}
function renderHelp() { $('#faq').innerHTML = (FAQ[LANG] || FAQ.en).map(([q, a], i) => `<details ${i ? '' : 'open'}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join(''); }

/* ---------------- accessibility ---------------- */
const A = store.get('gsa_a11y', { size: 16 });
function applyA11y() {
  document.documentElement.style.setProperty('--fs', A.size + 'px');
  ['contrast', 'spacing', 'links', 'motion'].forEach(k => { document.body.classList.toggle(k, !!A[k]); const c = $(`[data-t=${k}]`); if (c) c.checked = !!A[k]; });
  store.set('gsa_a11y', A);
}
function speak() {
  if (!('speechSynthesis' in window)) return toast('Read-aloud is not supported by this browser.');
  speechSynthesis.cancel();
  const pg = $('.page:not([hidden])'), txt = pg.innerText.replace(/\s+/g, ' ').slice(0, 6000);
  const u = new SpeechSynthesisUtterance(txt); u.lang = { en: 'en-GB', sw: 'sw-KE', so: 'so-SO' }[LANG]; u.rate = .95; speechSynthesis.speak(u);
}
function initA11y() {
  $('#a11yBtn').onclick = () => $('#a11yPanel').showModal();
  $$('#a11yPanel [data-t]').forEach(c => c.onchange = () => { A[c.dataset.t] = c.checked; applyA11y(); });
  $$('#a11yPanel [data-a]').forEach(b => b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'larger') A.size = Math.min(24, A.size + 2); else if (a === 'smaller') A.size = Math.max(14, A.size - 2); else if (a === 'reset') A.size = 16;
    else if (a === 'read') return speak(); else if (a === 'stop') return window.speechSynthesis && speechSynthesis.cancel();
    applyA11y();
  });
  document.addEventListener('keydown', e => { if (e.altKey && '1234'.includes(e.key)) { e.preventDefault(); location.hash = ['#home', '#map', '#projects', '#feedback'][+e.key - 1]; } });
  applyA11y();
}

/* ---------------- guided tour ---------------- */
function tour() {
  const steps = [[null, 'tour1'], ['#nav a[href="#map"]', 'tour2'], ['#nav a[href="#projects"]', 'tour3'], ['#nav a[href="#feedback"]', 'tour4'], ['.govbar-r', 'tour5']];
  let i = 0; const box = $('#tour');
  const clear = () => $$('.tourhl').forEach(e => e.classList.remove('tourhl'));
  const end = () => { clear(); box.hidden = true; store.set('gsa_tour', 1); };
  const show = () => {
    clear(); const [sel, k] = steps[i]; if (sel) { $('#nav').classList.add('open'); $(sel).classList.add('tourhl'); }
    box.innerHTML = `<p><b>${i + 1}/${steps.length}</b> ${esc(t(k))}</p><button class="btn" data-n>${esc(t(i === steps.length - 1 ? 'tour_done' : 'tour_next'))}</button><button class="btn small" data-s>${esc(t('tour_skip'))}</button>`;
    box.hidden = false; $('[data-n]', box).focus();
    $('[data-n]', box).onclick = () => { if (++i >= steps.length) end(); else show(); };
    $('[data-s]', box).onclick = end;
  };
  show();
}

/* ---------------- routing ---------------- */
const PAGES = ['home', 'map', 'projects', 'analytics', 'library', 'feedback', 'compliance', 'help'];
function route() {
  let h = location.hash.slice(1) || 'home'; const anchor = h === 'grm' ? 'grm' : null; if (anchor) h = 'library';
  if (!PAGES.includes(h)) h = 'home';
  PAGES.forEach(p => $('#' + p).hidden = p !== h);
  $$('#nav a').forEach(a => a.getAttribute('href') === '#' + h ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  $('#nav').classList.remove('open'); $('#menuBtn').setAttribute('aria-expanded', 'false');
  $('footer.site').hidden = h === 'map';
  if (h === 'map') { initMap(); setTimeout(() => map.invalidateSize(), 60); }
  if (h === 'library') renderLibrary();
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (anchor) setTimeout(() => $('#grm').scrollIntoView(), 100); else window.scrollTo(0, 0);
  const h1 = $('#' + h + ' h1'); document.title = (h1 ? h1.textContent + ' | ' : '') + 'Garissa County Projects Dashboard';
}
function renderAll() { applyLang(); renderHome(); refresh(); renderAnalytics(); renderLibrary(); renderCompliance(); renderHelp(); showQueue(); routeHint(); }

/* ---------------- start ---------------- */
const j = u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); });
Promise.all([j('data/projects.json'), j('data/county.geojson'), j('data/subcounties.geojson'), j('data/wards.geojson'), j('data/library_tracker.json')]).then(([d, county, subs, wards, lib]) => {
  META = d; P = d.projects; GEO = { county, subs, wards }; LIB = lib;
  initA11y(); renderAll(); initFeedback(); route();
  window.addEventListener('hashchange', route);
  $('#lang').onchange = e => { LANG = e.target.value; store.set('gsa_lang', LANG); if (map) { map.remove(); map = null; } if (libMap) { libMap.remove(); libMap = null; } renderAll(); route(); };
  $('#menuBtn').onclick = () => { const o = $('#nav').classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', o); };
  $('#vCards').onclick = () => { view = 'cards'; store.set('gsa_view', view); page = 1; renderList(); };
  $('#vTable').onclick = () => { view = 'table'; store.set('gsa_view', view); page = 1; renderList(); };
  $('#xlsBtn').onclick = () => exportXLSX(filtered(), 'Garissa_county_projects_' + stamp());
  $('#csvBtn').onclick = () => exportCSV(filtered(), 'Garissa_county_projects_' + stamp());
  $('#pdfBtn').onclick = printList;
  $('#tourBtn').onclick = tour;
  const q = new URLSearchParams(location.search).get('p'); if (q) openProject(q);
  else if (!store.get('gsa_tour', 0) && !location.hash) setTimeout(tour, 900);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}).catch(e => { $('#main').insertAdjacentHTML('afterbegin', '<p class="note" style="margin:1rem">The project data could not be loaded. Please check your connection and reload the page.</p>'); console.error(e); });
})();
