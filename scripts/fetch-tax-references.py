"""Fetch pinned official evidence into an operator-selected local directory.
No scheduled refresh or publication: changed sources require parser/review checks.
"""
import concurrent.futures, datetime, hashlib, json, pathlib, shutil, subprocess, sys, urllib.request
if len(sys.argv)!=2: raise SystemExit('Usage: python3 scripts/fetch-tax-references.py <output-directory>')
P=pathlib.Path(sys.argv[1]).resolve();P.mkdir(parents=True,exist_ok=True)
S=pathlib.Path(__file__).resolve().parent
config=json.loads((S/'tax-reference-sources.json').read_text())
(P/'states.json').write_text(json.dumps(config['states'],indent=2)+'\n')
def get(url):
    record={'url':url,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; LocalTaxReferenceResearch/1.0)'})
        with urllib.request.urlopen(req,timeout=30) as response:
            data=response.read(25000001); record.update(resolvedUrl=response.url,contentType=response.headers.get('Content-Type',''))
        if len(data)>25000000:raise ValueError('Source exceeds size limit')
        digest=hashlib.sha256(data).hexdigest();(P/(digest+'.source')).write_bytes(data)
        record.update(sha256=digest,size=len(data),status='retained')
    except Exception as error:record.update(status='pending',error=str(error))
    return record
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:documents=list(pool.map(get,config['urls']))
(P/'downloads.json').write_text(json.dumps(documents,indent=2)+'\n')
pdfs=[str(P/(d['sha256']+'.source')) for d in documents if d['status']=='retained' and (P/(d['sha256']+'.source')).read_bytes().startswith(b'%PDF')]
if sys.platform=='darwin' and shutil.which('swiftc'):
    binary=P/'pdf-text';subprocess.run(['swiftc','-module-cache-path',str(P/'swift-cache'),str(S/'tax-reference-pdf-text.swift'),'-o',str(binary)],check=True)
    subprocess.run([str(binary),*pdfs],check=True)
elif shutil.which('pdftotext'):
    # Parsers require PDFKit extraction order. Alternate extraction needs review,
    # especially Florida's page boundary and multi-column table layout.
    raise SystemExit('Sources retained. Use the reviewed PDFKit extractor on macOS; other extraction layouts need parser review.')
else:raise SystemExit('Sources retained. macOS Swift/PDFKit is needed for the reviewed PDF table extraction.')
print(json.dumps({'retained':sum(d['status']=='retained' for d in documents),'pending':sum(d['status']=='pending' for d in documents)}))
