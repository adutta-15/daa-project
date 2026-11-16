# Bisect — Smart Contact / Dictionary Search

> A Design & Analysis of Algorithms (DAA) project that shows, with real numbers, why **binary search** beats **linear search** (with **jump search** and **exponential search** as two more points of comparison) — plus autocomplete in **O(log n + k)**, order-preserving insert/delete, a benchmark, and a Master Method proof.

The project ships with two front-ends over the **same** Python code:

| Interface | Run | Best for |
|---|---|---|
| **Web app** (Bisect) | `python server.py` | Demos, viva, visualising probes and growth curves |
| **CLI menu** | `python main.py` | Quick terminal use, the original assignment format |

No third-party packages are needed. (`matplotlib` is optional, only for the CLI graph.)

Run the tests with:

```bash
python -m unittest discover -s tests -v
```

---

## Table of contents

1. [Quick start](#quick-start)
2. [Features](#features)
3. [Project structure](#project-structure)
4. [How the modules fit together](#how-the-modules-fit-together)
5. [Algorithms](#algorithms)
6. [Complexity analysis](#complexity-analysis)
7. [Master Method proof](#master-method-proof)
8. [Sample benchmark results](#sample-benchmark-results)
9. [Web interface guide](#web-interface-guide)
10. [CLI guide](#cli-guide)
11. [Input rules & error handling](#input-rules--error-handling)
12. [Team](#team)

---

## Quick start

**Requirements:** Python 3.8 or newer. Nothing to install.

```bash
git clone https://github.com/adutta-15/daa-project.git
cd daa-project

# Web interface (opens your browser at http://127.0.0.1:8000)
python server.py

# …or the original menu-driven CLI
python main.py
```

Server options:

```bash
python server.py --port 9000        # use another port (it also auto-skips busy ports)
python server.py --no-browser       # don't open a browser tab automatically
```

To try it with real names, load **`sample_contacts.txt`** (50 contacts) from the *Dataset* screen or CLI option 1.

---

## Features

- **Dataset builder** — generate *n* random words (up to 5,000,000, optional seed for repeatability) or load a `.txt` file of names. Input is stripped, lower-cased, blank lines dropped, and the list sorted.
- **Exact search, head to head** — every query runs through
  - iterative binary search,
  - recursive binary search,
  - exponential search,
  - jump search,
  - linear search,

  and reports comparisons and time for each. Duplicates are handled with `first_occurrence`.
- **Probe trace** — the web UI animates each binary-search probe: the shrinking `[low, high]` window, the `mid` element, and the direction taken.
- **Autocomplete** — `lower_bound` finds where a prefix would start, then walks forward while words still match: **O(log n + k)**.
- **Add / delete in order** — `bisect.insort` for inserts; deletes locate the target with binary search first, so the list is always sorted.
- **Benchmark** — searches the *last* element (linear search's worst case) at n = 1K … 5M and plots linear, jump, exponential and binary search on a log–log chart (comparisons or time).
- **Tests** — 24 stdlib `unittest` cases cover every algorithm (including a fuzz test against Python's own `in`), the data layer, the benchmark and the HTTP API.
- **Theory** — Master Method walkthrough and an interactive "halve it yourself" slider.

---

## Project structure

```
daa-project/
├── search.py            # Member 1 — searching algorithms (pure functions, no printing)
├── data.py              # Member 2 — load / generate / clean / add / delete
├── benchmark.py         # Member 3 — timing, comparison counts, table, optional plot
├── main.py              # Member 4 — menu-driven CLI
├── server.py            # Web layer — stdlib HTTP server + JSON API over the modules above
├── web/
│   ├── index.html       # App shell and all six screens
│   ├── styles.css       # Design tokens, components, light/dark, responsive
│   └── app.js           # Routing, API calls, visualisations, keyboard shortcuts
├── tests/
│   └── test_project.py  # unittest suite: algorithms, data, benchmark, HTTP API
├── sample_contacts.txt  # 50 sample names for demos
└── README.md
```

### Design rule shared by every module

`search.py` and `data.py` **never print**. They return values (`(index, comparisons)`, `(list, message)`, `(success, message)`), and only the interface layers (`main.py`, `server.py` + `web/`) talk to the user. That is what lets one set of algorithms drive two completely different interfaces.

---

## How the modules fit together

```
            ┌───────────────┐        ┌─────────────────────────┐
            │   main.py     │        │  web/ (HTML, CSS, JS)   │
            │   CLI menu    │        │  browser UI             │
            └──────┬────────┘        └───────────┬─────────────┘
                   │                             │ fetch() JSON
                   │                    ┌────────▼─────────┐
                   │                    │    server.py     │
                   │                    │ http.server API  │
                   │                    └────────┬─────────┘
       ┌───────────┼─────────────────────────────┤
       ▼           ▼                             ▼
┌─────────────┐ ┌─────────────┐          ┌──────────────┐
│ benchmark.py│ │   data.py   │─────────▶│  search.py   │
│ time/compare│ │ load, clean │          │ binary,linear│
└──────┬──────┘ │ add, delete │          │ lower_bound, │
       │        └─────────────┘          │ prefix, first│
       └────────────────────────────────▶└──────────────┘
```

### API endpoints (`server.py`)

| Method | Path | Calls |
|---|---|---|
| `GET`  | `/api/state` | dataset summary |
| `POST` | `/api/generate` | `data.generate_data` |
| `POST` | `/api/load` | `data.load_data` (upload is written to a temp file first, so the team's own error messages are shown) |
| `POST` | `/api/search` | `binary_search`, `binary_search_recursive`, `exponential_search`, `jump_search`, `linear_search`, `first_occurrence`, `benchmark.time_search` |
| `POST` | `/api/prefix` | `search.prefix_search`, `search.lower_bound` |
| `POST` | `/api/add` | `data.add_entry` |
| `POST` | `/api/delete` | `data.delete_entry` |
| `GET`  | `/api/browse` | paged view of the list; `?q=` jumps via `lower_bound` |
| `POST` | `/api/benchmark` | `benchmark.run_benchmark` |

The only algorithm code in `server.py` is `binary_search_trace`, which replays the *exact* loop of `binary_search` while recording each probe so the UI can draw it. Every request asserts that its step count equals `binary_search`'s, so the visual can never drift from the real algorithm.

---

## Algorithms

### Iterative binary search — `binary_search(arr, key)`
Keep a window `[low, high]`. Compare the key with `arr[mid]`; if smaller, discard the right half, if larger, discard the left half. Stop on a match or when the window is empty. Returns `(index, comparisons)` with `-1` for not found.

### Recursive binary search — `binary_search_recursive(arr, key)`
Same logic expressed as `T(n) = T(n/2) + O(1)`. Uses O(log n) stack space; the comparison count matches the iterative version exactly.

### Linear search — `linear_search(arr, key)`
Checks every element from left to right. Needs no sorting but costs O(n).

### Jump search — `jump_search(arr, key)`
Hop forward in blocks of `⌊√n⌋` until the block's last element is `>= key`, then scan that one block. At most about `n/√n + √n = 2√n` comparisons, so **O(√n)**. It sits between linear and binary search, which is why it's useful in the benchmark: you can see a third growth rate on the chart.

### Exponential search — `exponential_search(arr, key)`
Check index 0, then 1, 2, 4, 8, … until `arr[bound] >= key`, then binary search inside `[bound/2, bound]`. If the key is at position *i* this costs **O(log i)**, so it beats plain binary search for keys near the front and is never worse than O(log n) (about 2·log₂ n in the worst case). It's the standard choice for unbounded or very large lists.

### Lower bound — `lower_bound(arr, prefix)`
Binary search for the **first index `i` with `arr[i] >= prefix`**. Returns `len(arr)` if every element is smaller. It's the building block for both prefix search and duplicate handling.

### Prefix search / autocomplete — `prefix_search(arr, prefix, limit=None)`
`lower_bound` jumps to where the prefix would begin (O(log n)); a forward walk collects the k words that start with it (O(k)). Total **O(log n + k)**. An optional `limit` stops after that many matches.

### First occurrence — `first_occurrence(arr, key)`
With duplicates, plain binary search may land on any copy. `lower_bound` always returns the left-most one.

### Data handling (`data.py`)
| Function | Behaviour |
|---|---|
| `clean_input(text)` | strip + lower-case; `None` if empty |
| `is_sorted(arr)` | True if non-decreasing |
| `load_data(path)` | one entry per line → cleaned, sorted; handles missing, empty and non-text files |
| `generate_data(n, seed)` | n random words of 5–10 letters, sorted |
| `add_entry(arr, item)` | `bisect.insort` keeps the list sorted |
| `delete_entry(arr, item)` | finds via binary search, then `pop` |

---

## Complexity analysis

| Algorithm | Best | Average | Worst | Space |
|---|---|---|---|---|
| Binary search (iterative) | O(1) | O(log n) | O(log n) | O(1) |
| Binary search (recursive) | O(1) | O(log n) | O(log n) | O(log n) call stack |
| Exponential search | O(1) | O(log i) | O(log n) | O(1) |
| Jump search (block √n) | O(1) | O(√n) | O(√n) | O(1) |
| Linear search | O(1) | O(n) | O(n) | O(1) |
| Lower bound | Θ(log n) | Θ(log n) | Θ(log n) | O(1) |
| Prefix search | O(log n) | O(log n + k) | O(log n + k) | O(k) for results |
| `add_entry` (insort) | O(log n) search + O(n) shift | | | O(1) |
| `delete_entry` | O(log n) search + O(n) shift | | | O(1) |
| Sorting on load / generate | O(n log n) (Timsort) | | | O(n) |

Worst-case binary search comparisons = **⌊log₂ n⌋ + 1**. For 1,000,000 entries that's just **20**.

---

## Master Method proof

Binary search recurrence:

```
T(n) = a·T(n/b) + f(n)   with   a = 1,  b = 2,  f(n) = Θ(1)
```

1. Compute `n^(log_b a) = n^(log₂ 1) = n⁰ = 1`.
2. Compare: `f(n) = Θ(1) = Θ(n^(log_b a))`.
3. That is **Case 2**, so `T(n) = Θ(n^(log_b a) · log n) = Θ(log n)`.

Intuition: each comparison halves the remaining range, so after *k* comparisons at most `n / 2^k` elements remain. The search ends when that reaches 1, i.e. `k = log₂ n`.

---

## Sample benchmark results

Searching the last element (worst case for linear search), seed 42. Times vary by machine; comparison counts don't.

| n | Linear steps | Jump steps | Exp steps | Binary steps | log₂ n | Linear ÷ binary |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 1,000 | 41 | 20 | 10 | 9.97 | 100× |
| 10,000 | 10,000 | 200 | 26 | 14 | 13.29 | 714× |
| 100,000 | 100,000 | 461 | 34 | 17 | 16.61 | 5,882× |
| 1,000,000 | 1,000,000 | 2,000 | 40 | 20 | 19.93 | 50,000× |

Linear steps grow 10× each time n grows 10×; jump steps grow about 3.2× (= √10); binary steps grow by about **3.3** (= log₂ 10) — added, not multiplied. Exponential search pays roughly double binary search here because the last element is its worst case.

---

## Web interface guide

Run `python server.py` and use the left sidebar (or the bottom tab bar on phones).

| Screen | What you can do |
|---|---|
| **1 · Dataset** | Generate n words (presets 1K → 5M, optional seed) or drag-and-drop a `.txt` file. See entry count, average length, first/last word, a first-letter distribution (click a bar to jump there) and a paged browser with *jump to*. |
| **2 · Exact search** | Search a word or press **Random hit**. See found/not-found, index, first occurrence or insertion point, comparisons for all five algorithms drawn to scale, the animated probe trace and the sorted neighbourhood. |
| **3 · Autocomplete** | Type a prefix; matches update live. Shows lower-bound probes vs forward-walk steps. Use ↑ ↓ and Enter to send a match to Exact search. |
| **4 · Add & delete** | Insert or delete an entry and see exactly where it lands or where it was removed. A session log keeps track of changes. |
| **5 · Benchmark** | Choose sizes, run, and watch the log–log chart fill in one size at a time. Hover for exact values; switch between *Comparisons* and *Time*. |
| **6 · Theory** | Step-by-step Master Method proof, complexity table and a slider that halves n until it reaches 1. |

**Keyboard shortcuts**

| Key | Action |
|---|---|
| `1`–`6` | Switch screen |
| `/` | Focus the search box |
| `R` | Search a random existing word |
| `T` | Toggle light / dark theme |
| `↑` `↓` `Enter` | Pick an autocomplete match |
| `?` | Show shortcuts |
| `Esc` | Leave a text field / close dialog |

**Design notes.** Warm paper background with deep ink text; one signal colour (vermilion) for binary search and steel blue for linear search, checked for colour-blind contrast in both light and dark themes. Serif headings (Fraunces), sans-serif body (IBM Plex Sans) and monospace numbers (IBM Plex Mono); fonts fall back to system fonts when offline. The layout works on desktop, tablet and phone, respects *reduce motion*, and every control can be reached by keyboard.

---

## CLI guide

```
========== SMART CONTACT / DICTIONARY SEARCH ==========
1. Load data from file
2. Generate random data (n)
3. Exact search (binary vs jump vs exponential vs linear)
4. Prefix search (autocomplete)
5. Add entry
6. Delete entry
7. Run benchmark
8. Show theory (Master Method)
9. Exit
```

Example session:

```
Choose (1-9): 2
How many entries? 100000
Generated 100,000 sorted entries. Sample: ['aaaakkm', 'aaagyw', 'aaakomkkpv']

Choose (1-9): 3
Enter word/name to search: gofip
FOUND 'gofip' at index 25000 (first occurrence: 25000).
Binary (iterative): 16 steps, 0.00190 ms
Binary (recursive): 16 steps
Exponential       : 28 steps, 0.00410 ms
Jump (block 316)  : 117 steps, 0.03100 ms
Linear            : 25001 steps, 1.94000 ms
```

*(Option 2 asks for an optional seed; use 42 to get the same list as the web app's examples. Timings vary by machine.)*

Option 7 prints the benchmark table and can show a matplotlib graph if it's installed (`pip install matplotlib`).

---

## Input rules & error handling

| Situation | Behaviour |
|---|---|
| Empty search / prefix / add / delete | Rejected with a message; nothing changes |
| Mixed case or extra spaces | Cleaned: `"  Karen "` → `"karen"` |
| Searching before data exists | Prompted to load or generate first (buttons are disabled in the web UI) |
| Unsorted list | Sorted automatically before searching |
| File not found / empty / not text (binary, NUL bytes or wrong encoding) | Clear error, previous dataset kept |
| File saved with a UTF-8 BOM (e.g. from Notepad) | BOM stripped, first name loads correctly |
| Bad seed or malformed request in the web API | `400` with a message, never a `500` |
| n larger than 5,000,000 | Capped at 5,000,000 |
| Non-numeric n in the CLI | Asked again (`1,000` and `1000` both work; the web UI also accepts `10k`, `1m`) |
| Deleting a word that isn't there | `'word' not found.` |
| Duplicates | `first_occurrence` reports the left-most copy |

---

## Team

| Member | Module | Responsibility |
|---|---|---|
| Member 1 | `search.py` | Binary (iterative + recursive), jump, exponential, linear, lower bound, prefix search, first occurrence |
| Member 2 | `data.py` | Loading, generating, cleaning, add / delete |
| Member 3 | `benchmark.py` | Timing, comparison counts, results table, plot |
| Member 4 | `main.py` | Menu-driven CLI and input validation |
| — | `server.py`, `web/` | Web interface over the same modules |
| — | `tests/` | Unit and API tests |

Course: Design & Analysis of Algorithms — Don Bosco College of Engineering, Fatorda, Goa.
