"""Build read-only tax references from retained official snapshots. No taxability decisions."""
import csv, datetime, hashlib, io, json, re, sys, zipfile
from pathlib import Path
from html.parser import HTMLParser
from xml.etree import ElementTree as ET

P = Path(sys.argv[1]) if len(sys.argv)>1 else Path('.tax-reference-import')
documents = {x['url']: x for x in json.loads((P/'downloads.json').read_text())}
states = json.loads((P/'states.json').read_text())
rows = []

def source(ending):
    return next(url for url,d in documents.items() if url.endswith(ending) and d['status']=='retained')
def raw(url):
    d=documents[url]; p=P/(d['sha256']+'.source')
    assert hashlib.sha256(p.read_bytes()).hexdigest()==d['sha256']
    return p

def add(state,name,level,rate,url,scope='General sales',start=None,end=None,basis='unknown',notes='',reasons=None,code=''):
    if rate is not None:
        rate=round(float(rate),4)
        assert 0<=rate<=100, (name,rate)
    if start: datetime.date.fromisoformat(start)
    if end: datetime.date.fromisoformat(end)
    assert not (start and end and start>end)
    reasons=list(reasons or ['applicability'])
    if not start: reasons.append('effectiveDate')
    if documents.get(url,{}).get('status')!='retained': reasons.append('sourceUnavailable')
    if basis=='snapshot': reasons.append('snapshotPeriod')
    rows.append(dict(state=state,code=code or f'{state}-{len(rows)}',name=name,level=level,rate=rate,sourceUrl=url,scope=scope,validFrom=start,validThrough=end,dateBasis=basis,status='pending',reasons=sorted(set(reasons)),notes=notes))

def date_us(value):
    value=value.split(' ')[0]
    if not value or '9999' in value:return None
    parts=value.split('/')
    if len(parts)==3:
        m,d,y=map(int,parts);y=y+2000 if y<100 else y
        return datetime.date(y,m,d).isoformat()
    return datetime.datetime.strptime(value,'%Y%m%d').date().isoformat()

def xlsx(url,sheet):
    ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    z=zipfile.ZipFile(raw(url));shared=[''.join(v.itertext()) for v in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',ns)]
    for row in ET.fromstring(z.read(f'xl/worksheets/sheet{sheet}.xml')).findall('.//m:row',ns):
        result={}
        for c in row:
            v=c.find('m:v',ns)
            if v is not None:result[re.sub(r'\d','',c.get('r'))]=shared[int(v.text)] if c.get('t')=='s' else v.text
        yield result

def percent_cell(value):
    return float(value[:-1]) if value.endswith('%') else float(value)*100

for s in states:
    if s['state']=='MS':s['url']=source('/business/sales-use-tax/sales-tax-rates')
    if s['state']=='AZ':
        s['url']=source('TPT_RATETABLE_10012026.pdf');s['notes']='Retail TPT state component; business classification, sourcing and local components require confirmation.'
    if s['state']=='VA':s['url']=source('53-sales-tax-any.pdf')
    if s['state']=='MT':s['url']=source('/general-sales-tax')
    if s['state']=='CO':s['url']=source('Colorado_Jurisdiction_Codes_Rates_July-Dec2026.xlsx');s['validFrom']='2026-07-01';s['validThrough']='2026-12-31'
    reasons=['applicability']
    add(s['state'],s['state'], 'state',s['rate'],s['url'],scope=s['taxType'],start=s['validFrom'],end=s['validThrough'],basis='snapshot' if s['state'] in ['ME','CO'] else 'effective' if s['validFrom'] else 'unknown',notes=s['notes'],reasons=reasons,code=s['state']+'-state')
    # Every state has an explicit coverage/gap record; a missing local rate is never zero.
    add(s['state'],'Local coverage','localSummary',0 if s['localStatus']=='noGeneralLocal' else None,s['localUrl'],notes=s['notes'],scope=s['localStatus'],reasons=['specialTaxes'] if s['localStatus']=='noGeneralLocal' else ['localCoverage','applicability'],code=s['state']+'-coverage')

url=source('New_Mexico_gross_receipts_tax_July_2026_June_2027.derived.csv')
nmzip=zipfile.ZipFile(raw(url)); nmfile=next(n for n in nmzip.namelist() if n.endswith('.csv')); seen=set()
for i,r in enumerate(csv.DictReader(io.StringIO(nmzip.read(nmfile).decode('utf-8-sig')))):
    key=tuple(r[k] for k in ['name','county','locat_cdr','locat_cd1','locat_cd2','grt_rate','grt_rate2','note_key','bndry_ref'])
    if key in seen:continue
    seen.add(key)
    special=bool(r['locat_cd1'] or r['locat_cd2'] or float(r['grt_rate2']))
    add('NM',r['name']+' · '+r['county'],'combined',None if special else r['grt_rate'],url,scope='Gross receipts tax',start='2026-07-01',end='2027-06-30',basis='snapshot',notes=json.dumps(dict(zip(['name','county','locationCode','tribalCode1','tribalCode2','publishedRate','class2Rate','noteKey','boundaryReference'],key)))+' State-linked GIS reference; Lovington Industrial Park omission noted by the state. Tribal class/sourcing and boundary changes require separate confirmation.',reasons=['applicability','localCoverage','addressOverride' if special else 'jurisdiction'],code=f"NM-{r['locat_cdr']}-{i}")

url=source('Colorado_Jurisdiction_Codes_Rates_July-Dec2026.xlsx')
for i,r in enumerate(xlsx(url,1)):
    if not re.fullmatch(r'\d{6}',r.get('B','')):continue
    add('CO',r['A'].strip()+' · '+r['C'].strip(),'combined',r['H'],url,start='2026-07-01',end='2026-12-31',basis='snapshot',notes='Home rule: '+r.get('D','')+'. Exemption codes: city='+r.get('E','')+'; county='+r.get('F','')+'; district='+r.get('G','')+'. Alternate city rates and address boundaries require review. Service-fee columns are not sales-tax rates.',reasons=['applicability','jurisdiction'],code=f"CO-{r['B']}-{i}")

url=source('TPT_RATETABLE_ALL_10012026.csv')
for i,r in enumerate(csv.DictReader(raw(url).read_text(encoding='utf-8-sig').splitlines())):
    if r['TaxRateType']!='Percent': continue
    county=r['RegionCode'] in 'COH COC GLA GRA LAP MAR MOH NAV PMA PNL STC YAV YMA APA GRN'.split()
    if not county and len(r['RegionCode'])!=2: continue
    add('AZ',r['RegionName']+' · '+r['RegionCode'],'combined' if county else 'local',r['TaxRate'],url,scope=f"TPT {r['BusinessCode']} · {r['BusinessCodesName']}",start=date_us(r['RateStartDate']),end=date_us(r['RateEndDate']),basis='effective',notes=('State plus county; excludes city tax. Do not add the state component again. ' if county else 'City component; excludes state/county rates. ')+'October 2026 table; tribal/special-region coverage remains pending.',reasons=['applicability','jurisdiction'],code=f"AZ-{i}")
url=source('taxrates_current.csv')
for i,r in enumerate(csv.DictReader(raw(url).read_text(encoding='utf-8-sig').splitlines())):
    if r['TaxType']!='ST' or r['Rate Type'] in ('WDFEE','RMFEE'):continue
    add('AL',r['Locality Name'],'local',r['Rate'],url,scope=f"ST · {r['Rate Type']}",start=date_us(r['Active Date']),end=date_us(r['Inactive Date']),basis='administrative',notes=json.dumps({k:r[k] for k in ['Indicator','PJ','PJ_Rate','County Code','Administered']})+' Active date can represent an administrator change. Police-jurisdiction rate is not inferred.',reasons=['applicability','jurisdiction','administrativeDate'],code=f"AL-{r['Locality Code']}-{i}")
url=source('ordmache-current.txt')
for i,line in enumerate(raw(url).read_text().splitlines()):
    assert len(line)>=90
    high=int(line[69:74])/1000;low=int(line[79:84])/1000
    override=line[60]=='Y' or line[89]=='Y' or high!=low
    add('IL',line[10:35].strip()+' · '+line[35:60].strip(),'combined',None if override else high,url,start=date_us(line[61:69]),basis='effective',notes=f"Retailer receipts / general merchandise only. Address override={line[60]}, receipts override={line[89]}, published high={high}%, low={low}%. Purchaser/use/food fields are not substituted.",reasons=['applicability','addressOverride' if override else 'jurisdiction'],code=line[:10]+'-'+line[61:69])
url=source('october2026.xlsx')
for r in xlsx(url,1):
    if not re.fullmatch(r'\d{5}-\d{3}-\d{3}',r.get('C','')):continue
    add('MO',' '.join(r['B'].split()),'combined',percent_cell(r['D']),url,start='2026-10-01',end='2026-12-31',basis='snapshot',notes='October-December 2026 general sales column. Food, use tax and special categories are excluded.',reasons=['applicability','jurisdiction'],code=r['C'])
url=source('sales-and-use-tax-rates-by-locality-by-date.xlsx')
va=list(xlsx(url,12));assert 'January 1, 2026' in json.dumps(va[:4]) or 'Jan 1, 2026' in json.dumps(va[:4]),va[:4]
for r in va:
    if not re.fullmatch(r'51\d{3}',r.get('C','')):continue
    add('VA',r['B'],'combined',percent_cell(r['D']),url,start='2026-01-01',basis='snapshot',notes='January 2026–present worksheet; general sales column only. This is the table coverage period, not the original enactment date.',reasons=['applicability','jurisdiction'],code=r['C'])
url=source('pub718.pdf');fraction={'¼':.25,'½':.5,'¾':.75,'⅛':.125,'⅜':.375,'⅝':.625,'⅞':.875}
for line in Path(str(raw(url))+'.txt').read_text().splitlines():
    m=re.fullmatch(r'(.+?) (\d+)([¼½¾⅛⅜⅝⅞]?) (\d{4})',line)
    if not m or m[4]=='0021':continue
    add('NY',m[1],'combined',int(m[2])+fraction.get(m[3],0),url,start='2025-03-01',basis='snapshot',notes='Publication 718 table effective March 1, 2025. Asterisk includes MCTD; do not add it again. Reporting code is not a ZIP code.',reasons=['applicability','jurisdiction'],code=m[4])
url=source('dr15dss_26.pdf');text=Path(str(raw(url))+'.txt').read_text().split('--- PAGE 2 ---')[0]
for line in text.splitlines():
    m=re.match(r'^([A-Z][A-Za-z. -]+?) (None|(?:\d*\.)?\d+%)(?: |$)',line)
    if not m:continue
    add('FL',m[1],'local',0 if m[2]=='None' else float(m[2][:-1]),url,start='2026-01-01',end='2026-12-31',basis='snapshot',notes=line+' | Calendar-year total; individual surtax components can have different dates. Taxable base and first-$5000 rules require review.',reasons=['applicability','jurisdiction'],code=m[1])
url=source('ST575.pdf')
for i,line in enumerate(Path(str(raw(url))+'.txt').read_text().splitlines()):
    m=re.match(r'^(.+?) (\d+(?:\.\d+)?)% \d+(?:\.\d+)?% ',line)
    if not m:continue
    name=re.split(r' (?:CP|SD|ECI|TT|LO|TD) \(| No Local Tax Imposed',m[1])[0]
    add('SC',name,'combined',float(m[2]),url,notes=line+' | Form revised February 5, 2026; revision is not a confirmed effective date. Locally administered taxes are excluded.',reasons=['applicability','localCoverage','jurisdiction'],code=f'SC-{i}')

class Tables(HTMLParser):
    def __init__(self): super().__init__(); self.rows=[];self.row=None;self.cell=None
    def handle_starttag(self,tag,attrs):
        if tag=='tr':self.row=[]
        elif tag in ('td','th') and self.row is not None:self.cell=[]
    def handle_data(self,data):
        if self.cell is not None:self.cell.append(data)
    def handle_endtag(self,tag):
        if tag in ('td','th') and self.cell is not None:
            self.row.append(' '.join(''.join(self.cell).split()));self.cell=None
        if tag=='tr' and self.row is not None:self.rows.append(self.row);self.row=None
url=source('/city.php');parser=Tables();parser.feed(raw(url).read_text())
for i,r in enumerate(parser.rows):
    if len(r)!=4 or not re.fullmatch(r'\d{7}',r[1]) or not re.fullmatch(r'0?\.\d+',r[2]):continue
    add('TX',r[0],'local',float(r[2])*100,url,scope='Local sales component',notes='City table component; overlapping county/transit/district components must not be summed without address verification.',reasons=['applicability','jurisdiction'],code=f'city-{i}-{r[1]}')
    if re.fullmatch(r'0?\.\d+',r[3]):add('TX',r[0],'combined',float(r[3])*100,url,notes='Published city total; exact address and district overlays require review.',reasons=['applicability','jurisdiction'],code=f'total-{i}-{r[1]}')
url=source('/spd.php');parser=Tables();parser.feed(raw(url).read_text())
for i,r in enumerate(parser.rows):
    if len(r)!=6 or not re.fullmatch(r'\d{7}',r[2]) or not re.fullmatch(r'0?\.\d+',r[3]):continue
    add('TX',r[1]+' · '+r[0],'local',float(r[3])*100,url,scope='Special-purpose district',start=date_us(r[4]),basis='effective',notes='Boundary: '+r[5]+'. May overlap city/county/transit jurisdictions; do not automatically add.',reasons=['applicability','jurisdiction'],code=f'spd-{i}-{r[2]}')
url=source('/countysurcharge/')
for name,start in [('Honolulu','2007-01-01'),('Kauai','2019-01-01'),('Hawaii','2020-01-01'),('Maui','2024-01-01')]:
    add('HI',name,'local',.5,url,scope='GET county surcharge',start=start,end='2030-12-31',basis='effective',notes='Applies to activities subject to 4% GET, subject to sourcing and grandfathered-contract exceptions. Maximum pass-on is a different rate.',code=name)
url=source('/local-sales-tax')
for name,rate in [('Allegheny County',1),('Philadelphia',2)]:
    add('PA',name,'local',rate,url,notes='Act 21 of 2026 changes local sourcing, not the original rate enactment date. Local delivery enforcement begins October 1, 2026.',reasons=['applicability','jurisdiction'],code=name)
url=source('/node/238')
add('MS','Jackson','local',1,url,start='2014-03-01',end='2035-06-30',basis='effective',notes='Infrastructure levy on specified activities subject to the 7% state rate. Exemptions and special categories require review.',code='Jackson')

used={r['sourceUrl'] for r in rows}
# Retain supplemental official guides and failed retrieval evidence in the release manifest too.
manifest=dict(version=1,parserVersion='official-reference-2026-10-v1',states=states,documents=list(documents.values()),rows=rows)
assert all(url in documents for url in used)
assert len(states)==26 and len({s['state'] for s in states})==26
for state,count in [('FL',67),('VA',133),('HI',4)]:
    actual=sum(r['state']==state and r['level'] not in ['state','localSummary'] for r in rows)
    assert actual==count,(state,actual,count)
(P/'references.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
counts={s['state']:sum(r['state']==s['state'] and r['level'] not in ['state','localSummary'] for r in rows) for s in states}
print(json.dumps({'rows':len(rows),'localRows':counts},indent=2))
