#!/usr/bin/env python3
"""Garissa County PIM Dashboard - data builder.

Reads the KDSP II stock-take workbook and the stalled-projects register, cleans the
records, assigns map coordinates and writes data/projects.json.

Usage:
  python3 tools/build_data.py <stocktake.xlsx> <stalled.xlsx> <wards.geojson> <subcounties.geojson> <health_facilities.geojson>

Manually maintained records (KDSP II investment project, published FY 2026/27 tenders)
live in data/manual_projects.json and are appended as they are.
"""
import sys, json, re, random, warnings, datetime, os
import openpyxl
warnings.simplefilter('ignore')
STOCK, STALLED, WARDS, SUBS, HF = sys.argv[1:6]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')


# ---------- geometry helpers (no external libraries) ----------
def rings(geom):
    if geom['type'] == 'Polygon':
        return [geom['coordinates'][0]]
    return [p[0] for p in geom['coordinates']]


def in_ring(x, y, r):
    c = False
    j = len(r) - 1
    for i in range(len(r)):
        xi, yi = r[i][0], r[i][1]
        xj, yj = r[j][0], r[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def inside(x, y, geom):
    return any(in_ring(x, y, r) for r in rings(geom))


def bbox(geom):
    xs = [p[0] for r in rings(geom) for p in r]
    ys = [p[1] for r in rings(geom) for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def point_in(geom, seed, shrink=0.55):
    """Deterministic pseudo-random point inside a polygon, biased toward its centre."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = bbox(geom)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    for _ in range(400):
        x = cx + (rnd.random() - .5) * (x1 - x0) * shrink
        y = cy + (rnd.random() - .5) * (y1 - y0) * shrink
        if inside(x, y, geom):
            return x, y
    for _ in range(3000):
        x = x0 + rnd.random() * (x1 - x0)
        y = y0 + rnd.random() * (y1 - y0)
        if inside(x, y, geom):
            return x, y
    return cx, cy


wards = json.load(open(WARDS))['features']
subs = json.load(open(SUBS))['features']


def norm(s):
    return re.sub(r'[^a-z]', '', (s or '').lower().replace('sub county', '').replace('ward', ''))


WARD = {norm(f['properties']['ward']): f for f in wards
        if f['geometry']['coordinates'] and f['geometry']['coordinates'][0]}
SUB = {norm(f['properties']['sub_county']): f for f in subs}
SUB_NAME = {'garissatownship': ('Garissa Township', 'garissa'), 'fafi': ('Fafi', 'fafi'), 'balambala': ('Balambala', 'balambala'),
            'ijara': ('Ijara', 'ijara'), 'dadaab': ('Dadaab', 'dadaab'), 'lagdera': ('Lagdera', 'lagdera'), 'hulugho': ('Hulugho', 'hulugho')}
# stock-take ward spelling -> (display name, boundary key or None when the ward has no polygon in the county layer)
WARD_FIX = {'labasigale': ('Labasigale', 'labasigale'), 'dekaharja': ('Dekaharia', 'dekaharia'), 'banane': ('Benane', 'benane'),
            'waberi': ('Waberi', None), 'abakaile': ('Abakaile', None), 'baraki': ('Baraki', None), 'liboi': ('Liboi', None),
            'sankuri': ('Sankuri', 'sankuri'), 'goreale': ('Goreale', 'goreale'), 'jarajara': ('Jarajara', 'jarajara'),
            'jarajila': ('Jarajila', 'jarajilla')}

# ---------- landmark gazetteer (approximate, from county GIS layers) ----------
hf = {f['properties']['name'].lower(): f['geometry']['coordinates'] for f in json.load(open(HF))['features']}


def H(name):
    return tuple(hf[name.lower()][:2])


GAZ = [  # (regex on lower-case title, (lon, lat), label)
    (r'referral hospital|provincial|outpatient unit at garissa', H('Garissa Provincial General Hospi'), 'Garissa County Referral Hospital'),
    (r'bura sub.?county hospital|maternity ward in bura', H('Bura Sub County Hospital'), 'Bura Sub-County Hospital'),
    (r'hadley', H('Hadley Dispensary'), 'Hadley Dispensary'),
    (r'welmar', H('Welmerer Dispensary'), 'Welmerer Dispensary'),
    (r'utawala', H('Utawala Dispensery'), 'Utawala Health Centre'),
    (r'liboi', H('Liboi Health Centre'), 'Liboi'),
    (r'banane.*(health|dispensary)|upgrading of banan', H('Banane Health Center'), 'Benane Health Centre'),
    (r'furqan', H('Al Furqan Dispensary'), 'Al Furqan Dispensary'),
    (r'korissa|korisa', H('Korisa Dispensary'), 'Korisa'),
    (r'saretho', H('Saretho Health Centers'), 'Saretho'),
    (r'alkune|alikune', H('Alikune Dispensary'), 'Alikune'),
    (r'afwein', H('Afwein Dispensary'), 'Afwein'),
    (r'gurufa', H('Gurufa Dispensary'), 'Gurufa'),
    (r'\braya\b', H('Raya Health Center'), 'Raya'),
    (r'masalani level 4|masalani.*hosp', H('Ijara Sub County Hospital'), 'Masalani Hospital'),
    (r'shanta.?aba[qk]', (39.74, 0.46), 'Shanta Abaq'),
    (r'modogashe', (39.633, 0.469), 'Modogashe town'),
    (r'\bsaka\b', (39.327, -0.145), 'Saka'),
    (r'masalani', (40.117, -1.70), 'Masalani town'),
    (r'hulugho town|hulugho municipal', (41.048, -1.148), 'Hulugho town'),
    (r'dagah?a?ley', (40.29, 0.19), 'Dagahaley'),
    (r'dadaab town', (40.3107, 0.0585), 'Dadaab town'),
    (r'nanighi', (39.864, -0.851), 'Nanighi'),
    (r'market stalls at balambala', (39.089, -0.078), 'Balambala town'),
    (r'garissa stadium', (39.6445, -0.4585), 'Garissa Stadium'),
    (r'kismayu road', (39.6480, -0.4560), 'Kismayu Road, Garissa town'),
    (r'round ?about|soko mugdi|town beautification|ring road|storm water', (39.6461, -0.4532), 'Garissa town centre'),
]
ABSENT_WARD_PT = {'waberi': (39.6527, -0.4520), 'abakaile': H('Abakaile Dispensary'), 'baraki': H('Baraki Dispensary'),
                  'liboi': H('Liboi Health Centre'), 'masalani': (40.117, -1.70)}
TOWN = (39.6461, -0.4532)
# main settlement of each ward: projects with only a ward are placed near it, inside the ward boundary
ANCHOR = {'township': TOWN, 'iftin': TOWN, 'galbet': TOWN, 'sankuri': H('Sankuri Health Centre'),
          'bura': H('Bura Sub County Hospital'), 'danyere': H('Danyere Health Centre'), 'saka': H('Saka Health Centre'),
          'nanighi': H('Nanighi Health Centre'), 'dertu': H('Dertu Health Centre'), 'sangailu': H('Sangailu Health Centre'),
          'hulugho': H('Hulugho Sub Health Centre'), 'ijara': H('Ijara Health Center'),
          'labasigale': H('Labasigale Health Centre'), 'jarajara': H('Jarajara Dispensary'), 'fafi': H('Fafi Dispensary'),
          'balambala': H('Balambala Sub-District Hospital'), 'dadaab': H('Dadaab Sub-District Hospital'),
          'modogashe': H('Modogashe Sub-County Hospital'), 'benane': H('Benane Health Centre'),
          'jarajilla': H('Alijugur Disp'), 'sankurinorth': H('Sankuri Health Centre'), 'garissa': TOWN}


def near_anchor(geom, anchor, seed, spread):
    rnd = random.Random(seed)
    ax, ay = anchor
    for _ in range(60):
        x = ax + (rnd.random() - .5) * spread
        y = ay + (rnd.random() - .5) * spread
        if inside(x, y, geom):
            return x, y
    pts = [point_in(geom, '%s-%d' % (seed, i), 1.0) for i in range(60)]
    pts.sort(key=lambda p: (p[0] - ax) ** 2 + (p[1] - ay) ** 2)
    return pts[rnd.randrange(4)]


def locate(pid, title, sub_key, ward_key):
    """Returns lon, lat, precision label."""
    t = title.lower()
    rnd = random.Random(pid)
    for rx, (lon, lat), label in GAZ:
        if re.search(rx, t):
            g = SUB.get(sub_key)
            if g is None or sub_key == 'garissa' or inside(lon, lat, g['geometry']):
                return lon + (rnd.random() - .5) * .006, lat + (rnd.random() - .5) * .006, 'Landmark (approximate): ' + label
    if ward_key in ABSENT_WARD_PT:
        lon, lat = ABSENT_WARD_PT[ward_key]
        return lon + (rnd.random() - .5) * .02, lat + (rnd.random() - .5) * .02, 'Ward (approximate)'
    if ward_key in WARD and norm(WARD[ward_key]['properties']['sub_county']) == sub_key:
        g = WARD[ward_key]['geometry']
        if ward_key in ANCHOR:
            lon, lat = near_anchor(g, ANCHOR[ward_key], pid, .05)
        else:
            lon, lat = point_in(g, pid)
        return lon, lat, 'Ward (approximate)'
    if sub_key in SUB:
        g = SUB[sub_key]['geometry']
        if sub_key in ANCHOR:
            lon, lat = near_anchor(g, ANCHOR[sub_key], pid, .04)
        else:
            lon, lat = point_in(g, pid, .35)
        return lon, lat, 'Sub-county (approximate)'
    return 39.6461, -0.4532, 'County headquarters (location to be confirmed)'


# ---------- text cleaning ----------
TYPO = {'RROPOSED': 'PROPOSED', 'MERTANITY': 'MATERNITY', 'HEADQUATER': 'HEADQUARTERS', 'EXTENTION': 'EXTENSION',
        'RENEVATION': 'RENOVATION', 'VETENARY': 'VETERINARY', 'AUGUMENTATION': 'AUGMENTATION',
        'INFRASREUCTURE': 'INFRASTRUCTURE', 'MAINTAINANCE': 'MAINTENANCE', 'OFSHALLOW': 'OF SHALLOW', 'SUPPY': 'SUPPLY',
        'EQUIPING': 'EQUIPPING', 'BALAMBAKLA': 'BALAMBALA', 'GARISSATOWNSHIP': 'GARISSA TOWNSHIP', 'BURAWARD': 'BURA WARD',
        'LABASIGALEWARD-': 'LABASIGALE WARD -', 'MASALANIWATER': 'MASALANI WATER', 'TERRAZO': 'TERRAZZO',
        'PLOTNO.51': 'PLOT NO. 51', '2ECD': '2 ECD', 'SUBCOUNTY': 'SUB-COUNTY', 'FAFI-SUBCOUNTY': 'FAFI SUB-COUNTY',
        'SUBCOUNTY,': 'SUB-COUNTY,'}
KEEP = {'ICT', 'ECD', 'ATC', 'II', 'LOT1', 'LOT2', 'COVID-19'}
SMALL = {'of', 'and', 'at', 'in', 'to', 'for', 'the', 'a', 'on'}


def clean_title(s):
    s = re.sub(r'\s+', ' ', str(s).replace('\xa0', ' ')).strip(' -,')
    s = re.sub(r'\bOF OF\b', 'OF', s, flags=re.I)
    s = re.sub(r'\s*/\s*', ' / ', s)
    s = re.sub(r',(?=\S)', ', ', s)
    out = []
    for w in s.split(' '):
        u = TYPO.get(w.upper(), w.upper())
        for part in u.split(' '):
            core = part.strip(',.()')
            if core in KEEP:
                out.append(part)
            elif core == '300M3':
                out.append('300 m³')
            elif part.lower() in SMALL and out:
                out.append(part.lower())
            else:
                out.append('-'.join(p[:1].upper() + p[1:].lower() for p in part.split('-')))
    return re.sub(r'\s+,', ',', ' '.join(out)).replace(' / ', '/')


def num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r'[^\d.]', '', str(v))
    return float(s) if s else None


MONTHS = {m: i + 1 for i, m in enumerate(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
                                          'september', 'october', 'november', 'december'])}


def date(v):
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    m = re.match(r'(\d+)\s*(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})', str(v or '').strip())
    if m and m.group(2).lower() in MONTHS:
        return '%s-%02d-%02d' % (m.group(3), MONTHS[m.group(2).lower()], int(m.group(1)))
    return None


DEPT = {'water services': 'Water Services', 'public works': 'Public Works', 'health services': 'Health Services',
        'roads': 'Roads & Transport', 'agriculture': 'Agriculture',
        'urban planning and municipalities': 'Urban Planning & Municipalities', 'county affairs': 'County Affairs',
        'county affaurs': 'County Affairs', 'livestock': 'Livestock', 'education': 'Education',
        'environment': 'Environment', 'economic planning': 'Economic Planning', 'trade': 'Trade & Tourism',
        'lands and physical planning': 'Lands & Physical Planning'}
SECTOR = {'lands, physical pplanning & urban development': 'Lands, Physical Planning & Urban Development',
          'finance and economic planning': 'Finance & Economic Planning',
          'health services': 'Health Services',
          'water, environment, natural resource & climate change': 'Water, Environment, Natural Resources & Climate Change'}

projects = []
notes = []

# ---------- 1. KDSP II stock-take template ----------
ws = openpyxl.load_workbook(STOCK, data_only=True)['Project Stocktaking Template']
for r in ws.iter_rows(min_row=3, values_only=True):
    if not r[1]:
        continue
    sn = int(r[0])
    start = date(r[14])
    y = int(start[:4])
    fy = '%d/%02d' % (y, (y + 1) % 100)
    pid = 'CGG/%s/%03d' % (fy.replace('/', '-'), sn)
    subk = norm(r[7])
    sub_disp, sub_key = SUB_NAME[subk]
    wk = norm(str(r[8])) if r[8] not in (None, 0, '0') else ''
    wdisp, wkey = WARD_FIX.get(wk, (str(r[8]).strip().title() if wk else None, wk if wk in WARD else None))
    if subk == 'fafi' and wk == 'jarajara':
        wdisp, wkey = 'Jarajila', 'jarajilla'
    if subk == 'balambala' and wk == 'jarajila':
        wdisp, wkey = 'Jarajara', 'jarajara'
    if subk == 'balambala' and wk == 'sankuri':
        wkey = 'sankurinorth'
    title = clean_title(r[1])
    lon, lat, prec = locate(pid, title, sub_key, wkey if wkey else wk)
    wf = WARD.get(wkey)
    mismatch = bool(wf) and norm(wf['properties']['sub_county']) != sub_key
    dept = DEPT.get(str(r[11]).strip().lower(), str(r[11]).strip().title())
    sector = SECTOR.get(str(r[10]).strip().lower(), str(r[10]).strip())
    projects.append(dict(
        id=pid, sn=sn, title=title, title_source=str(r[1]).strip(), sector=sector, department=dept,
        sub_county=sub_disp, ward=wdisp, fy=fy, start=start, planned_end=date(r[15]), actual_end=date(r[16]),
        cost=num(r[17]), approved=num(r[18]), disbursed=num(r[24]), expenditure=num(r[26]), pending_bill=num(r[27]) or 0,
        funding='County Government of Garissa', status='Completed', pct=100, lat=round(lat, 5), lon=round(lon, 5),
        loc_precision=prec, source='KDSP II Project Stock-taking Template (FY 2017/18 - 2021/22)'))
    if mismatch:
        projects[-1]['data_note'] = ('The stock-take lists %s Ward under %s Sub-County; the ward lies in another '
                                     'sub-county. Mapped by sub-county pending confirmation.' % (wdisp, sub_disp))
        notes.append('Stock-take S/No. %d "%s": ward %s does not belong to %s Sub-County.' % (sn, title, wdisp, sub_disp))

# ---------- 2. Stalled projects register ----------
# row -> (sub-county, ward, sub key, ward key, department, sector, matching stock-take S/No.)
ST = {
    1: ('Garissa Township', 'Township', 'garissa', 'township', 'Health Services', 'Health Services', None),
    2: ('Garissa Township', 'Waberi', 'garissa', 'waberi', 'Health Services', 'Health Services', None),
    3: ('Balambala', None, 'balambala', '', 'Gender & Social Services', 'Gender, Social Services & Sports', None),
    4: ('Garissa Township', None, 'garissa', '', 'Trade & Tourism', 'Trade, Investment & Tourism', None),
    5: ('Garissa Township', 'Waberi', 'garissa', 'waberi', 'Health Services', 'Health Services', None),
    6: ('Fafi', 'Bura', 'fafi', 'bura', 'Health Services', 'Health Services', 47),
    7: ('Balambala', 'Balambala', 'balambala', 'balambala', 'Health Services', 'Health Services', 49),
    8: ('Garissa Township', None, 'garissa', '', 'Health Services', 'Health Services', None),
    9: ('Fafi', 'Jarajila', 'fafi', 'jarajilla', 'Health Services', 'Health Services', 48),
    10: ('Balambala', 'Sankuri', 'balambala', 'sankurinorth', 'Health Services', 'Health Services', 54),
    11: ('Garissa Township', None, 'garissa', '', 'Education', 'Education, Information & Libraries', None),
    12: ('Balambala', 'Balambala', 'balambala', 'balambala', 'Trade & Tourism', 'Trade, Investment & Tourism', None),
    13: ('Lagdera', 'Modogashe', 'lagdera', 'modogashe', 'Trade & Tourism', 'Trade, Investment & Tourism', None),
    14: ('Balambala', 'Saka', 'balambala', 'saka', 'Trade & Tourism', 'Trade, Investment & Tourism', None),
    15: ('Lagdera', 'Shant Abak', 'lagdera', 'shantabak', 'Trade & Tourism', 'Trade, Investment & Tourism', None),
    16: ('Lagdera', 'Shant Abak', 'lagdera', 'shantabak', 'Health Services', 'Health Services', None),
    17: ('Lagdera', 'Shant Abak', 'lagdera', 'shantabak', 'Health Services', 'Health Services', None)}
ws = openpyxl.load_workbook(STALLED, data_only=True)['Sheet1']
n = 0
for r in ws.iter_rows(min_row=2, values_only=True):
    if not r[1]:
        continue
    n += 1
    sub, ward, sk, wk, dept, sector, dup = ST[n]
    a, b = str(r[2]).strip().split('/')
    fy = '20%s/%s' % (a, b)
    pid = 'CGG/%s/S%02d' % (fy.replace('/', '-'), n)
    title = clean_title(r[1])
    status_note = re.sub(r'\s+', ' ', str(r[5])).strip()
    m = re.search(r'(\d+)\s*%', status_note)
    pct = int(m.group(1)) if m else None
    if isinstance(r[4], (int, float)):
        paid = float(r[4])
    elif r[4] and 'no pay' in str(r[4]).lower():
        paid = 0.0
    else:
        paid = None
    lon, lat, prec = locate(pid, title, sk, wk)
    rec = dict(
        id=pid, sn=n, title=title, title_source=str(r[1]).strip(), sector=sector, department=dept, sub_county=sub,
        ward=ward, fy=fy, start=None, planned_end=None, actual_end=None, cost=num(r[3]), approved=num(r[3]),
        disbursed=paid, expenditure=paid, pending_bill=None, funding='County Government of Garissa', status='Stalled',
        pct=pct, status_note=status_note, lat=round(lat, 5), lon=round(lon, 5), loc_precision=prec,
        source='Stalled Projects Register', dept_inferred=True)
    if n == 14:
        rec['data_note'] = 'The source register lists this project under Lagdera; Saka is in Balambala Sub-County.'
    if dup:
        old = next(p for p in projects if p['sn'] == dup and p['source'].startswith('KDSP'))
        notes.append('Stalled register #%d "%s" (KES %s) matches stock-take S/No. %d "%s" (KES %s, recorded Completed). '
                     'Published once, as Stalled.' % (n, title, '{:,.0f}'.format(rec['cost']), dup, old['title'],
                                                      '{:,.0f}'.format(old['cost'])))
        rec.update(start=old['start'], planned_end=old['planned_end'])
        rec['data_note'] = ('Also listed in the stock-take template as S/No. %d (KES %s). The status shown follows the '
                            'stalled projects register.' % (dup, '{:,.0f}'.format(old['cost'])))
        projects.remove(old)
    projects.append(rec)

# ---------- 3. KDSP II investment project + published FY 2026/27 tenders ----------
for e in json.load(open(os.path.join(OUT, 'manual_projects.json'))):
    sk, wk = e.pop('_sub', ''), e.pop('_ward', '')
    if e.get('lat') is None:
        lon, lat, prec = locate(e['id'], e['title'], sk, wk)
        e.update(lat=round(lat, 5), lon=round(lon, 5), loc_precision=prec)
    projects.append(e)

for p in projects:
    age = 2026 - int(p['fy'][:4]) + 1
    p['band'] = ('10 financial years and above' if age >= 10 else '5 to 10 financial years' if age >= 5
                 else '1 to 4 financial years')
    p.pop('sn', None)

json.dump(dict(generated=datetime.date.today().isoformat(), count=len(projects), data_quality_notes=notes,
               projects=projects), open(os.path.join(OUT, 'projects.json'), 'w'), indent=1, ensure_ascii=False)
print(len(projects), 'projects written')
for x in notes:
    print(' -', x)
