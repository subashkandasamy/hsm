import os, re, json, urllib.request, urllib.parse
SVC=os.environ['SVC']; URL=os.environ['URL']
HGET={'apikey':SVC,'Authorization':f'Bearer {SVC}'}
def get(path):
    return json.load(urllib.request.urlopen(urllib.request.Request(f"{URL}/rest/v1/{path}", headers=HGET)))

ALIAS={'amoxycillin':'amoxicillin','frusemide':'furosemide','salbutamol':'salbutamol',
       'cephalexin':'cefalexin','paracetamol':'paracetamol','acetaminophen':'paracetamol'}
def norm(n):
    n=re.sub(r'\([^)]*\)','',n or '').strip().lower()
    n=re.sub(r'\s+',' ',n)
    return ALIAS.get(n,n)
PRI={'X':5,'H1':4,'G':3,'H':2,'OTC':1}
INV={v:k for k,v in PRI.items()}

# 1. ingredient -> schedule from curated catalogue.ts + original (non-imported) rows
ing2sched={}
def add(ing,sched):
    ing=norm(ing)
    if not ing or sched not in PRI: return
    if ing not in ing2sched or PRI[sched]>PRI[ing2sched[ing]]:
        ing2sched[ing]=sched
cat=open('/Users/subashkandasamy/Desktop/HMS/hms/src/lib/drugs/catalogue.ts').read()
for g,s in re.findall(r"\[\s*'([^']+)'\s*,\s*\[[^\]]*\]\s*,\s*'(H1|X|G|H|OTC)'\s*\]", cat):
    if '+' in g: continue
    add(g,s)
orig=get("drug_master?select=name,generic_name,schedule&source=is.null&schedule=not.is.null&limit=2000")
for r in orig:
    g=r.get('generic_name') or r['name']
    if '+' in g: continue
    add(g, r['schedule'])
print("ingredient->schedule map size:", len(ing2sched))

# 2. imported molecules with NULL schedule (paginate)
mols=[]; off=0
while True:
    page=get(f"drug_master?select=id,generic_name&source=eq.indiamed_mit&schedule=is.null&limit=1000&offset={off}")
    mols+=page
    if len(page)<1000: break
    off+=1000
print("imported NULL-schedule molecules:", len(mols))

# 3. assign
from collections import defaultdict
by=defaultdict(list)
for m in mols:
    ings=[norm(i) for i in re.split(r'\+', m.get('generic_name') or '')]
    best=None
    for i in ings:
        s=ing2sched.get(i)
        if s and (best is None or PRI[s]>PRI[best]): best=s
    if best: by[best].append(m['id'])
print("assignments:", {k:len(v) for k,v in by.items()})

# 4. batch PATCH
def patch(ids,sched):
    for i in range(0,len(ids),400):
        chunk=ids[i:i+400]
        inlist='('+','.join(f'"{x}"' for x in chunk)+')'
        q=urllib.parse.urlencode({'id':f'in.{inlist}'})
        req=urllib.request.Request(f"{URL}/rest/v1/drug_master?{q}",data=json.dumps({'schedule':sched}).encode(),
            headers={**HGET,'Content-Type':'application/json','Prefer':'return=minimal'},method='PATCH')
        urllib.request.urlopen(req)
for sched,ids in by.items():
    patch(ids,sched); print(f"  set {sched}: {len(ids)}")
print("DONE")
