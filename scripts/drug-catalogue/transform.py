import csv, re, json, os, urllib.request

CSV = 'meds.csv'
SVC = os.environ['SVC']; URL = os.environ['URL']

def norm(s):
    s = (s or '').lower()
    s = re.sub(r'\s+', ' ', s).strip()
    return s

# small spelling alias map to dedup against existing rows
ALIAS = {'amoxycillin': 'amoxicillin', 'cephalexin': 'cefalexin', 'paracetamol': 'paracetamol'}
def ing_alias(n):
    n = norm(n)
    return ALIAS.get(n, n)

FORMS = ['tablet','capsule','syrup','injection','suspension','cream','ointment','gel','drops',
         'solution','powder','sachet','lotion','spray','inhaler','respule','soap','shampoo',
         'patch','suppository','granule','infusion','kit']
def detect_form(pack, name):
    t = (pack + ' ' + name).lower()
    for f in FORMS:
        if f in t: return f
    return 'other'

def parse_comp(c):
    # "Amoxycillin  (500mg) " -> ("Amoxycillin", "500mg")
    c = (c or '').strip()
    if not c: return None
    m = re.match(r'^(.*?)\s*\(([^)]*)\)\s*$', c)
    if m: return (m.group(1).strip(), m.group(2).strip())
    return (c, '')

def parse_pack(label):
    lbl = (label or '').lower()
    size = 1
    m = re.search(r'(\d+)', lbl)
    if m: size = int(m.group(1))
    unit = 'strip'
    for u in ['strip','bottle','vial','ampoule','tube','sachet','box','jar','packet','kit','pen','cartridge','respule','tin']:
        if u in lbl: unit = u; break
    return size, unit

def title(s):
    return ' '.join(w.capitalize() if w.islower() else w for w in s.split())

# 1. existing molecules -> key map
print("fetching existing drug_master…")
existing = json.load(urllib.request.urlopen(urllib.request.Request(
    f"{URL}/rest/v1/drug_master?select=id,name,generic_name,form,strength&limit=5000",
    headers={'apikey':SVC,'Authorization':f'Bearer {SVC}'})))
def mol_key(ings, strength, form):
    ingkey = ' + '.join(sorted(ing_alias(i) for i in ings))
    return f"{ingkey}|{re.sub(r'\\s','',norm(strength))}|{norm(form)}"
key2id = {}
for r in existing:
    ings = [p.strip() for p in re.split(r'\+', r.get('generic_name') or r['name']) if p.strip()]
    ings = [re.sub(r'\s*\([^)]*\)','',i) for i in ings]
    k = mol_key(ings, r.get('strength') or '', r.get('form') or '')
    key2id.setdefault(k, r['id'])
print(f"existing molecules: {len(existing)}, keys: {len(key2id)}")

# 2. transform CSV
import uuid
new_mols = {}   # key -> molecule dict
brands = []     # brand dicts
brand_seen = set()
rows = 0
for r in csv.DictReader(open(CSV, encoding='utf-8')):
    if r['type'] != 'allopathy': continue
    if r['Is_discontinued'].strip().upper() == 'TRUE': continue
    c1 = parse_comp(r['short_composition1']); c2 = parse_comp(r['short_composition2'])
    comps = [c for c in [c1, c2] if c]
    if not comps: continue
    ings = [c[0] for c in comps]
    strengths = [c[1] for c in comps if c[1]]
    form = detect_form(r['pack_size_label'], r['name'])
    k = mol_key(ings, ' + '.join(strengths), form)
    if k in key2id:
        mid = key2id[k]
    elif k in new_mols:
        mid = new_mols[k]['id']
    else:
        mid = str(uuid.uuid4())
        gen = ' + '.join(title(i) for i in ings)
        new_mols[k] = {'id': mid, 'name': gen, 'generic_name': gen,
                       'form': form, 'strength': ' + '.join(strengths) or None,
                       'category': None, 'unit': None, 'is_active': True,
                       'schedule': None, 'source': 'indiamed_mit'}
        key2id[k] = mid
    bname = r['name'].strip()
    bkey = (mid, bname.lower())
    if bkey in brand_seen: continue
    brand_seen.add(bkey)
    size, unit = parse_pack(r['pack_size_label'])
    try: mrp = round(float(r['price(₹)']), 2)
    except: mrp = None
    brands.append({'id': str(uuid.uuid4()), 'drug_master_id': mid, 'brand_name': bname,
                   'manufacturer': (r['manufacturer_name'].strip() or 'Unknown'),
                   'hsn_code': '30049099', 'gst_rate': 12, 'pack_size': size, 'pack_unit': unit,
                   'mrp_per_pack': mrp, 'is_active': True, 'source': 'indiamed_mit'})
    rows += 1

json.dump(list(new_mols.values()), open('new_mols.json','w'))
json.dump(brands, open('brands.json','w'))
print(f"processed brand rows: {rows}")
print(f"NEW molecules to insert: {len(new_mols)}")
print(f"brands to insert: {len(brands)}")
print("sample molecule:", json.dumps(list(new_mols.values())[0], ensure_ascii=False))
print("sample brand:", json.dumps(brands[0], ensure_ascii=False))
