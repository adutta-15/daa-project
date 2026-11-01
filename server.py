"""
server.py  (Web interface)
A zero-dependency local web server for the Smart Search project.

    python server.py            -> opens http://127.0.0.1:8000
    python server.py --port 9000 --no-browser

Every number shown in the browser comes from the team's own modules
(search.py, data.py, benchmark.py). This file only translates HTTP <-> Python.
The one extra function here, `binary_search_trace`, replays the exact same
loop as search.binary_search while recording each probe, so the UI can
animate low / mid / high. Its step count is asserted to match binary_search.
"""
import argparse
import base64
import binascii
import json
import math
import os
import statistics
import sys
import tempfile
import threading
import time
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from benchmark import run_benchmark, time_search
from data import (add_entry, clean_input, delete_entry, generate_data,
                  is_sorted, load_data)
from search import (binary_search, binary_search_recursive, first_occurrence,
                    linear_search, lower_bound, prefix_search)

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT, "web")

MAX_GENERATE = 5_000_000          # same cap as main.py
MAX_UPLOAD_BYTES = 60 * 1024 * 1024
MAX_PREFIX_RETURN = 200           # matches sent to the browser (total is still counted)
MAX_BENCH_N = 5_000_000


# --------------------------------------------------------------------------- #
#  Application state (single local user, guarded by a lock)
# --------------------------------------------------------------------------- #
class State:
    def __init__(self):
        self.arr = []
        self.source = None        # "generated" | "file" | None
        self.label = None         # file name or "n = …, seed = …"
        self.lock = threading.Lock()


STATE = State()


def ensure_sorted(arr):
    """Mirror of main.need_data(): sort silently if needed. Returns True if it sorted."""
    if not is_sorted(arr):
        arr.sort()
        return True
    return False


def summary(arr):
    """Dataset summary for the header / dataset screen."""
    n = len(arr)
    if n == 0:
        return {"n": 0, "source": STATE.source, "label": STATE.label}
    sample_idx = sorted({0, 1, 2, n // 4, n // 2, (3 * n) // 4, n - 3, n - 2, n - 1})
    sample_idx = [i for i in sample_idx if 0 <= i < n]
    step = max(1, n // 5000)
    lengths = [len(arr[i]) for i in range(0, n, step)]
    letters = {}
    for i in range(0, n, step):
        c = arr[i][0]
        letters[c] = letters.get(c, 0) + step
    return {
        "n": n,
        "source": STATE.source,
        "label": STATE.label,
        "first": arr[0],
        "last": arr[-1],
        "sample": [{"i": i, "v": arr[i]} for i in sample_idx],
        "avg_len": round(statistics.mean(lengths), 2),
        "min_len": min(lengths),
        "max_len": max(lengths),
        "log2n": round(math.log2(n), 3),
        "max_binary_steps": math.floor(math.log2(n)) + 1,
        "letters": dict(sorted(letters.items())),
    }


def binary_search_trace(arr, key):
    """Same loop as search.binary_search, but records every probe."""
    low, high = 0, len(arr) - 1
    steps = []
    while low <= high:
        mid = (low + high) // 2
        val = arr[mid]
        if val == key:
            steps.append({"low": low, "mid": mid, "high": high, "value": val, "cmp": "eq"})
            return mid, steps
        if val < key:
            steps.append({"low": low, "mid": mid, "high": high, "value": val, "cmp": "lt"})
            low = mid + 1
        else:
            steps.append({"low": low, "mid": mid, "high": high, "value": val, "cmp": "gt"})
            high = mid - 1
    return -1, steps


def neighbourhood(arr, centre, radius=4):
    lo = max(0, centre - radius)
    hi = min(len(arr), centre + radius + 1)
    return [{"i": i, "v": arr[i]} for i in range(lo, hi)]


# --------------------------------------------------------------------------- #
#  API handlers — each returns (status, payload)
# --------------------------------------------------------------------------- #
def api_state(_body):
    with STATE.lock:
        return 200, summary(STATE.arr)


def api_generate(body):
    try:
        n = int(str(body.get("n", "")).replace(",", "").replace("_", "").strip())
    except ValueError:
        return 400, {"error": "Enter a whole number for n."}
    if n < 1:
        return 400, {"error": "n must be at least 1."}
    capped = n > MAX_GENERATE
    n = min(n, MAX_GENERATE)
    seed = body.get("seed")
    seed = None if seed in (None, "") else int(seed)
    t0 = time.perf_counter()
    arr = generate_data(n, seed=seed)
    elapsed = time.perf_counter() - t0
    with STATE.lock:
        STATE.arr = arr
        STATE.source = "generated"
        STATE.label = f"Random · n = {n:,}" + (f" · seed {seed}" if seed is not None else "")
        out = summary(arr)
    msg = f"Generated {n:,} sorted entries in {elapsed:.2f}s."
    if capped:
        msg = f"Too large — capped at {MAX_GENERATE:,}. " + msg
    out["message"] = msg
    out["capped"] = capped
    return 200, out


def api_load(body):
    name = os.path.basename(str(body.get("filename") or "upload.txt"))
    try:
        raw = base64.b64decode(body.get("content_b64") or "", validate=True)
    except (binascii.Error, ValueError):
        return 400, {"error": "Upload was corrupted in transit."}
    # Write the raw bytes to a temp file and hand it to the team's load_data(),
    # so its own validation / error messages are what the user sees.
    fd, path = tempfile.mkstemp(suffix=".txt")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
        arr, msg = load_data(path)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
    if not arr:
        return 422, {"error": msg}
    with STATE.lock:
        STATE.arr = arr
        STATE.source = "file"
        STATE.label = name
        out = summary(arr)
    out["message"] = msg
    return 200, out


def api_search(body):
    key = clean_input(body.get("key"))
    if key is None:
        return 400, {"error": "Search text cannot be empty."}
    with STATE.lock:
        arr = STATE.arr
        if not arr:
            return 409, {"error": "No data loaded. Generate or load a dataset first."}
        resorted = ensure_sorted(arr)
        bt, bc = time_search(binary_search, arr, key, repeats=100)
        lt, lc = time_search(linear_search, arr, key)
        idx, _ = binary_search(arr, key)
        ridx, rc = binary_search_recursive(arr, key)
        tidx, trace = binary_search_trace(arr, key)
        assert tidx == idx and len(trace) == bc, "trace diverged from binary_search"
        first = None
        if idx != -1:
            first, _ = first_occurrence(arr, key)
        ins, _ = lower_bound(arr, key)
        centre = idx if idx != -1 else min(ins, len(arr) - 1)
        return 200, {
            "key": key,
            "n": len(arr),
            "found": idx != -1,
            "index": idx,
            "first_occurrence": first,
            "insertion_point": ins,
            "binary": {"steps": bc, "ms": bt * 1000, "trace": trace},
            "recursive": {"steps": rc, "index": ridx},
            "linear": {"steps": lc, "ms": lt * 1000},
            "log2n": math.log2(len(arr)),
            "neighbours": neighbourhood(arr, centre),
            "resorted": resorted,
        }


def api_prefix(body):
    prefix = clean_input(body.get("prefix"))
    if prefix is None:
        return 400, {"error": "Prefix cannot be empty."}
    with STATE.lock:
        arr = STATE.arr
        if not arr:
            return 409, {"error": "No data loaded. Generate or load a dataset first."}
        ensure_sorted(arr)
        t0 = time.perf_counter()
        matches, steps = prefix_search(arr, prefix)
        ms = (time.perf_counter() - t0) * 1000
        start, lb_steps = lower_bound(arr, prefix)
        return 200, {
            "prefix": prefix,
            "n": len(arr),
            "total": len(matches),
            "matches": matches[:MAX_PREFIX_RETURN],
            "truncated": len(matches) > MAX_PREFIX_RETURN,
            "steps": steps,
            "lower_bound_steps": lb_steps,
            "walk_steps": steps - lb_steps,
            "start": start,
            "ms": ms,
        }


def api_add(body):
    with STATE.lock:
        arr = STATE.arr
        ok, msg = add_entry(arr, body.get("item"))
        if not ok:
            return 400, {"error": msg}
        if STATE.source is None:
            STATE.source, STATE.label = "manual", "Manual entries"
        item = clean_input(body.get("item"))
        idx, steps = lower_bound(arr, item)
        out = summary(arr)
        out.update({"message": msg, "index": idx, "steps": steps,
                    "neighbours": neighbourhood(arr, idx)})
        return 200, out


def api_delete(body):
    with STATE.lock:
        arr = STATE.arr
        if not arr:
            return 409, {"error": "No data loaded. Generate or load a dataset first."}
        ensure_sorted(arr)
        item = clean_input(body.get("item"))
        idx, steps = (binary_search(arr, item) if item else (-1, 0))
        ok, msg = delete_entry(arr, body.get("item"))
        if not ok:
            return 404 if item else 400, {"error": msg, "steps": steps}
        out = summary(arr)
        centre = min(idx, len(arr) - 1) if arr else 0
        out.update({"message": msg, "index": idx, "steps": steps,
                    "neighbours": neighbourhood(arr, centre) if arr else []})
        return 200, out


def api_browse(query):
    with STATE.lock:
        arr = STATE.arr
        n = len(arr)
        try:
            limit = max(1, min(200, int(query.get("limit", ["50"])[0])))
            offset = int(query.get("offset", ["0"])[0])
        except ValueError:
            return 400, {"error": "Bad offset/limit."}
        jump = clean_input(query.get("q", [""])[0])
        if jump and n:
            ensure_sorted(arr)
            pos, _ = lower_bound(arr, jump)
            offset = max(0, min(pos, n - 1))
        offset = max(0, min(offset, max(0, n - 1)))
        rows = [{"i": i, "v": arr[i]} for i in range(offset, min(n, offset + limit))]
        return 200, {"n": n, "offset": offset, "limit": limit, "rows": rows}


def api_benchmark(body):
    sizes = body.get("sizes") or [1000, 10000, 100000, 1000000]
    try:
        sizes = [int(s) for s in sizes]
    except (TypeError, ValueError):
        return 400, {"error": "Sizes must be whole numbers."}
    if any(s < 1 or s > MAX_BENCH_N for s in sizes):
        return 400, {"error": f"Each size must be between 1 and {MAX_BENCH_N:,}."}
    t0 = time.perf_counter()
    results = run_benchmark(sizes=tuple(sizes))
    return 200, {"results": results, "elapsed": time.perf_counter() - t0}


GET_ROUTES = {"/api/state": api_state}
POST_ROUTES = {
    "/api/generate": api_generate,
    "/api/load": api_load,
    "/api/search": api_search,
    "/api/prefix": api_prefix,
    "/api/add": api_add,
    "/api/delete": api_delete,
    "/api/benchmark": api_benchmark,
}


# --------------------------------------------------------------------------- #
#  HTTP plumbing
# --------------------------------------------------------------------------- #
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, fmt, *args):  # quieter console
        if "/api/" in (self.path or ""):
            sys.stderr.write("  %s  %s\n" % (self.command, self.path.split("?")[0]))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/browse":
            return self._json(*api_browse(parse_qs(url.query)))
        if url.path in GET_ROUTES:
            return self._json(*GET_ROUTES[url.path]({}))
        if url.path.startswith("/api/"):
            return self._json(404, {"error": "Unknown endpoint."})
        return super().do_GET()

    def do_POST(self):
        url = urlparse(self.path)
        handler = POST_ROUTES.get(url.path)
        if handler is None:
            return self._json(404, {"error": "Unknown endpoint."})
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_UPLOAD_BYTES:
            return self._json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                              {"error": "File is larger than 60 MB."})
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ValueError
        except ValueError:
            return self._json(400, {"error": "Malformed request."})
        try:
            return self._json(*handler(body))
        except Exception as exc:  # never leave the browser hanging
            return self._json(500, {"error": f"Server error: {exc}"})


def main():
    p = argparse.ArgumentParser(description="Smart Search web interface")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--no-browser", action="store_true")
    args = p.parse_args()

    port = args.port
    for attempt in range(10):
        try:
            httpd = ThreadingHTTPServer((args.host, port), Handler)
            break
        except OSError:
            port += 1
    else:
        sys.exit("Could not find a free port.")

    url = f"http://{args.host}:{port}"
    print(f"\n  Smart Search is running at  {url}\n  Press Ctrl+C to stop.\n")
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
