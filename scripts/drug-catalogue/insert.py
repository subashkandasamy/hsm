import json, os, urllib.request, time
SVC = os.environ['SVC']; URL = os.environ['URL']
H = {'apikey':SVC,'Authorization':f'Bearer {SVC}','Content-Type':'application/json','Prefer':'return=minimal'}

def get(path):
    return json.load(urllib.request.urlopen(urllib.request.Request(f"{URL}/rest/v1/{path}", headers={'apikey':SVC,'Authorization':f'Bearer {SVC}'})))

# idempotency guard
guard = urllib.request.urlopen(urllib.request.Request(
    f"{URL}/rest/v1/drug_master?select=id&source=eq.indiamed_mit&limit=1",
    headers={'apikey':SVC,'Authorization':f'Bearer {SVC}','Prefer':'count=exact','Range':'0-0'}))
cr = guard.headers.get('content-range','')
already = cr.split('/')[-1]
if already not in ('0','*',''):
    print(f"ABORT: {already} imported rows already present (source=indiamed_mit). Not re-inserting.")
    raise SystemExit(1)

def insert(table, rows, batch=1000):
    n = len(rows); done = 0
    for i in range(0, n, batch):
        chunk = rows[i:i+batch]
        data = json.dumps(chunk).encode()
        for attempt in (1,2,3):
            try:
                req = urllib.request.Request(f"{URL}/rest/v1/{table}", data=data, headers=H, method='POST')
                urllib.request.urlopen(req); break
            except urllib.error.HTTPError as e:
                body = e.read().decode()[:300]
                if attempt == 3:
                    print(f"  FAILED {table} batch@{i}: {e.code} {body}"); raise
                time.sleep(2)
        done += len(chunk)
        if (i//batch) % 20 == 0 or done == n:
            print(f"  {table}: {done}/{n}", flush=True)

mols = json.load(open('new_mols.json'))
brands = json.load(open('brands.json'))
print(f"inserting {len(mols)} molecules…", flush=True)
insert('drug_master', mols)
print(f"inserting {len(brands)} brands…", flush=True)
insert('drug_brands', brands)
print("DONE")
