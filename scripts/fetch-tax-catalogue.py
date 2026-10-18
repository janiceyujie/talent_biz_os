"""Download public tax reference data. No credentials or customer data are used."""
import csv, datetime as dt, hashlib, io, json, pathlib, re, sys, urllib.request, zipfile
import xml.etree.ElementTree as E
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
ROOT=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/private/tmp/taloox-tax-data').resolve(); ROOT.mkdir(parents=True,exist_ok=True)
FIPS=dict(zip('AR GA IA IN KS KY MI MN NC ND NE NJ NV OH OK RI SD TN UT VT WA WI WV WY'.split(),'05 13 19 18 20 21 26 27 37 38 31 34 32 39 40 44 46 47 49 50 53 55 54 56'.split()))
def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Taloox local tax reference importer/1.0'})
 with urllib.request.urlopen(req,timeout=45) as r:
  b=r.read(25_000_001)
 if len(b)>25_000_000: raise ValueError('Source exceeds size limit')
 return b

def date(s):
 if not re.fullmatch(r'\d{8}',s):raise ValueError('Invalid effective date '+s)
 return dt.datetime.strptime(s,'%Y%m%d').date().isoformat()
def percent(s):
 d=Decimal(s)*100
 if not d.is_finite() or not 0<=d<=100:raise ValueError('Invalid rate')
 return str(d.quantize(Decimal('.0001')))
def download_sst(path):
 state=path.split('/')[-1][:2]; url='https://www.streamlinedsalestax.org'+path
 b=fetch(url); hash=hashlib.sha256(b).hexdigest();(ROOT/(hash+'.source')).write_bytes(b)
 raw=b
 if path.lower().endswith('.zip'):
  with zipfile.ZipFile(io.BytesIO(b)) as z:
   files=[i for i in z.infolist() if i.filename.lower().endswith('.csv') and not i.filename.startswith('__MACOS')]
   if len(files)!=1 or files[0].file_size>50_000_000:raise ValueError('Unexpected ZIP layout')
   raw=z.read(files[0])
 rates=[]
 for i,row in enumerate(csv.reader(io.StringIO(raw.decode('utf-8-sig')))):
  row=[s.strip() for s in row]
  if not any(row):continue
  if len(row)==9: row[0]=row[0].zfill(2); row[1]=row[1].zfill(2)
  if len(row)!=9 or row[0]!=FIPS[state] or not re.fullmatch(r'\d{2}',row[1]) or not re.fullmatch(r'[A-Za-z0-9]{2,5}',row[2]):raise ValueError(f'Unexpected SST record {state}:{i+1}: {row}')
  start,end=date(row[7]),date(row[8])
  if end<start:raise ValueError('Inverted validity')
  rates.append(dict(code=f'{row[0]}:{row[1]}:{row[2]}',name=f'{state} / {row[1]} / {row[2]}',kind='component',county='',rate=percent(row[3]),interstateRate=percent(row[4]),foodRate=percent(row[5]) if row[5] else None,foodInterstateRate=percent(row[6]) if row[6] else None,validFrom=start,validThrough=end))
 if not rates:raise ValueError('Empty rate source')
 return dict(state=state,provider='sst',url=url,sha256=hash,retrievedAt=dt.datetime.now(dt.timezone.utc).isoformat(),rates=rates)
index=fetch('https://www.streamlinedsalestax.org/ratesandboundry/Rates/').decode()
paths=re.findall(r'HREF="([^"]+\.(?:zip|csv))"',index,re.I)
if len(paths)!=24 or set(p.split('/')[-1][:2] for p in paths)!=set(FIPS):raise ValueError('Unexpected SST state coverage')
with ThreadPoolExecutor(max_workers=4) as pool:batches=list(pool.map(download_sst,paths))
page=fetch('https://cdtfa.ca.gov/taxes-and-fees/sales-use-tax-rates.htm').decode()
links=re.findall(r'href="(/taxes-and-fees/SalesTaxRates(\d+)-(\d+)-(\d+)\.xlsx)"',page)
if len(links)!=1:raise ValueError('Unexpected California download index')
path,month,day,year=links[0];start=dt.date(2000+int(year),int(month),int(day)).isoformat();url='https://cdtfa.ca.gov'+path
b=fetch(url);hash=hashlib.sha256(b).hexdigest();(ROOT/(hash+'.source')).write_bytes(b)
n={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(io.BytesIO(b)) as z:
 strings=[''.join(x.itertext()) for x in E.fromstring(z.read('xl/sharedStrings.xml'))]
 rates=[]
 for row in E.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//m:row',n):
  if int(row.get('r'))<4:continue
  cells={}
  for c in row:
   col=re.sub(r'\d','',c.get('r'))
   if col not in ('A','B','C','D','E'):continue
   v=c.find('m:v',n)
   if v is not None:cells[col]=strings[int(v.text)] if c.get('t')=='s' else v.text
  if not cells.get('B'):continue
  if cells.get('D') not in ['City','County']:raise ValueError('Unexpected California locality type '+str(cells))
  rates.append(dict(code=hashlib.sha256((cells['A']+'|'+cells['C']+'|'+cells['D']).encode()).hexdigest()[:24],name=cells['A'],county=cells['C'],kind='combined',rate=percent(cells['B']),interstateRate=None,foodRate=None,foodInterstateRate=None,validFrom=start,validThrough=None,notes=cells.get('E','')))
 if len(rates)<400:raise ValueError('Incomplete California workbook')
batches.append(dict(state='CA',provider='cdtfa',url=url,sha256=hash,retrievedAt=dt.datetime.now(dt.timezone.utc).isoformat(),rates=rates))
(ROOT/'catalogue.json').write_text(json.dumps({'version':1,'batches':batches},indent=2))
print(json.dumps({'states':len(batches),'rates':sum(len(b['rates']) for b in batches),'byState':{b['state']:len(b['rates']) for b in batches},'output':str(ROOT/'catalogue.json')}))
