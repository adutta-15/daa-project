"""FindFast: practical recursive binary search over sorted business records."""
import argparse, base64, binascii, csv, io, json, math, os, sys, threading, time, webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT=os.path.dirname(os.path.abspath(__file__)); WEB_DIR=os.path.join(ROOT,"web")
MAX_UPLOAD_BYTES=60*1024*1024; MAX_RECORDS=5_000_000
class State:
 def __init__(self): self.records=[]; self.field="value"; self.label=None; self.scenario="directory"; self.lock=threading.Lock()
STATE=State()
def norm(v): return str(v or "").strip().casefold()
def ordered(records): return all(records[i]["key"]<=records[i+1]["key"] for i in range(len(records)-1))
def recursive_binary_search(records,target,low,high,trace):
 """The only searching algorithm used by this application."""
 if low>high: return -1
 mid=(low+high)//2; value=records[mid]["key"]
 frame={"low":low,"mid":mid,"high":high,"value":value,"low_value":records[low]["key"],"high_value":records[high]["key"]}
 if value==target: frame["comparison"]="match"; trace.append(frame); return mid
 if value<target: frame["comparison"]="less"; trace.append(frame); return recursive_binary_search(records,target,mid+1,high,trace)
 frame["comparison"]="greater"; trace.append(frame); return recursive_binary_search(records,target,low,mid-1,trace)
def summary():
 r=STATE.records
 if not r:return {"n":0}
 return {"n":len(r),"label":STATE.label,"scenario":STATE.scenario,"field":STATE.field,"first":r[0]["key"],"last":r[-1]["key"],"max_depth":math.ceil(math.log2(len(r)+1)),"columns":list(r[0]["data"].keys())}
def parse(raw,name,field):
 try:text=raw.decode("utf-8-sig")
 except UnicodeDecodeError:
  try:text=raw.decode("utf-16")
  except UnicodeDecodeError: raise ValueError("The CSV must be saved as UTF-8 or UTF-16 text.")
 if "\x00" in text: raise ValueError("The file is not valid text.")
 if name.lower().endswith(".csv"):
  try: dialect=csv.Sniffer().sniff(text[:8192], delimiters=",;\t|")
  except csv.Error: dialect=csv.excel
  rows=list(csv.DictReader(io.StringIO(text),dialect=dialect))
  if not rows or not rows[0]:raise ValueError("CSV needs a header row and records.")
  cols=list(rows[0])
  if field and field not in cols:raise ValueError(f"Search column '{field}' was not found. Available columns: {', '.join(cols)}.")
  field=field or cols[0]
  r=[{"key":norm(x.get(field)),"data":{k:str(v or "").strip() for k,v in x.items()}} for x in rows]
 else:
  field="value"; r=[{"key":norm(x),"data":{"value":x.strip()}} for x in text.splitlines() if x.strip()]
 r=[x for x in r if x["key"]]
 if not r:raise ValueError("No searchable records found.")
 if len(r)>MAX_RECORDS:raise ValueError(f"Dataset limit: {MAX_RECORDS:,} records.")
 return r,field
def samples(s,n):
 spec={"inventory":("product_id","SKU"),"employees":("employee_id","EMP"),"students":("roll_number","ROLL"),"database":("record_id","REC"),"directory":("contact_name","CONTACT")}
 field,prefix=spec.get(s,spec["directory"])
 return ([{"key":norm(f"{prefix}-{i:06d}"),"data":{field:f"{prefix}-{i:06d}","name":f"{s.title()} record {i:06d}","status":"Active"}} for i in range(1,n+1)],field)
def api_state(_):
 with STATE.lock:return 200,summary()
def api_generate(b):
 try:n=int(b.get("n",1000))
 except (ValueError,TypeError):return 400,{"error":"Dataset size must be a whole number."}
 if not 1<=n<=MAX_RECORDS:return 400,{"error":f"Choose 1–{MAX_RECORDS:,} records."}
 s=b.get("scenario","directory"); records,field=samples(s,n)
 with STATE.lock:
  STATE.records,STATE.field,STATE.scenario,STATE.label=records,field,s,f"{s.title()} sample dataset"; out=summary()
 out["message"]=f"Created {n:,} sorted {s} records.";return 200,out
def api_load(b):
 try: records,field=parse(base64.b64decode(b.get("content_b64") or "",validate=True),os.path.basename(str(b.get("filename") or "dataset.txt")),b.get("field"))
 except (binascii.Error,ValueError) as e:return 400,{"error":str(e) if isinstance(e,ValueError) else "Upload was corrupted."}
 sorted_now=ordered(records)
 if not sorted_now and not b.get("sort_unsorted"):return 409,{"error":"Dataset is not sorted by this field. Enable sorting and upload again.","needs_sort":True,"count":len(records),"field":field}
 if not sorted_now:records.sort(key=lambda x:x["key"])
 with STATE.lock:
  STATE.records,STATE.field,STATE.scenario,STATE.label=records,field,b.get("scenario","custom"),os.path.basename(str(b.get("filename") or "dataset.txt"));out=summary()
 out["message"]=f"Loaded {len(records):,} records"+(f" and sorted by {field}." if not sorted_now else f" from {field}.");return 200,out
def api_search(b):
 if not isinstance(b.get("target"),str):return 400,{"error":"Search value must be text."}
 target=norm(b.get("target"))
 if not target:return 400,{"error":"Enter an exact value to search."}
 with STATE.lock:
  if not STATE.records:return 409,{"error":"Load or create a dataset first."}
  trace=[];t=time.perf_counter_ns(); index=recursive_binary_search(STATE.records,target,0,len(STATE.records)-1,trace); ms=(time.perf_counter_ns()-t)/1e6
  return 200,{"target":target,"found":index!=-1,"index":index,"record":STATE.records[index]["data"] if index!=-1 else None,"trace":trace,"recursive_calls":len(trace),"comparisons":len(trace),"recursion_depth":len(trace),"execution_ms":ms,"n":len(STATE.records),"field":STATE.field,"theoretical":"Θ(log n)"}
def api_select_field(b):
 field=str(b.get("field") or "")
 with STATE.lock:
  if not STATE.records:return 409,{"error":"Load a dataset first."}
  columns=list(STATE.records[0]["data"])
  if field not in columns:return 400,{"error":f"Unknown field. Available fields: {', '.join(columns)}."}
  STATE.field=field
  for record in STATE.records:record["key"]=norm(record["data"].get(field))
  STATE.records.sort(key=lambda record:record["key"])
  out=summary();out["message"]=f"Dataset is now sorted by {field}.";return 200,out
GET={"/api/state":api_state};POST={"/api/generate":api_generate,"/api/load":api_load,"/api/search":api_search,"/api/select-field":api_select_field}
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k):super().__init__(*a,directory=WEB_DIR,**k)
 def _json(self,status,payload):
  raw=json.dumps(payload).encode();self.send_response(status);self.send_header("Content-Type","application/json; charset=utf-8");self.send_header("Content-Length",str(len(raw)));self.send_header("Cache-Control","no-store");self.end_headers();self.wfile.write(raw)
 def do_GET(self):
  path=urlparse(self.path).path
  if path in GET:return self._json(*GET[path]({}))
  if path.startswith("/api/"):return self._json(404,{"error":"Unknown endpoint."})
  return super().do_GET()
 def do_POST(self):
  fun=POST.get(urlparse(self.path).path)
  if not fun:return self._json(404,{"error":"Unknown endpoint."})
  try:length=int(self.headers.get("Content-Length") or 0);body=json.loads(self.rfile.read(length) or b"{}")
  except ValueError:return self._json(400,{"error":"Malformed request."})
  if length>MAX_UPLOAD_BYTES:return self._json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE,{"error":"File is larger than 60 MB."})
  try:return self._json(*fun(body))
  except Exception as e:return self._json(500,{"error":f"Server error: {e}"})
def main():
 p=argparse.ArgumentParser();p.add_argument("--port",type=int,default=8000);p.add_argument("--host",default="127.0.0.1");p.add_argument("--no-browser",action="store_true");a=p.parse_args();httpd=ThreadingHTTPServer((a.host,a.port),Handler);url=f"http://{a.host}:{a.port}";print(f"FindFast running at {url}");
 if not a.no_browser:webbrowser.open(url)
 try:httpd.serve_forever()
 except KeyboardInterrupt:pass
 finally:httpd.server_close()
if __name__=="__main__":main()
