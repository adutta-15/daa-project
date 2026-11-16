"""
benchmark.py
------------------------------------------------------------
PURPOSE:
    Measures and compares the search algorithms in search.py.
    For each dataset size n we record:
      - number of comparisons (steps)  -> proves the theory
      - running time in seconds        -> shows real-world speed
      - time to sort the data          -> is sorting worth it?

THEORY BEHIND THE NUMBERS:
    Linear search        : O(n)          -> steps grow in proportion to n
    Jump search          : O(sqrt n)     -> steps grow like sqrt(n)
    Binary search        : O(log n)      -> steps grow like log2(n)
    Exponential search   : O(log i)      -> i = position of the key
    Interpolation search : O(log log n)  -> on uniformly spread data
    Binary recurrence: T(n) = T(n/2) + O(1)  (Master Method, Case 2)

CASES:
    "worst"   : search the LAST element (linear must check all n items)
    "average" : search random words that ARE in the list
    "miss"    : search random words that are NOT in the list

NOTE: No input() here. This file only calculates and returns
      results; main.py / server.py show them to the user.
"""
import math    # math.log2(n) gives the theoretical number of steps
import random
import string
import time    # time.perf_counter() = high-precision stopwatch

from data import DISTRIBUTIONS, generate_data       # builds a sorted dataset
from search import (binary_search, exponential_search, interpolation_search,
                    jump_search, linear_search)

CASES = ("worst", "average", "miss")

# name used in result keys -> (function, how many calls to average over)
# Fast algorithms are repeated many times so their tiny timings are measurable.
ALGORITHMS = {
    "linear": (linear_search, 3),
    "jump": (jump_search, 50),
    "binary": (binary_search, 2000),
    "exp": (exponential_search, 2000),
    "interp": (interpolation_search, 2000),
}


# Runs one search function and measures it.
# repeats = how many times to run it. Binary search is too fast to measure
# once, so we repeat it many times and take the average time.
# Returns (average time in seconds, number of comparisons).
def time_search(func, arr, key, repeats=1):
    """
    Returns (avg_time_in_seconds, comparisons).
    'repeats' averages tiny timings (binary search is very fast).
    """
    start = time.perf_counter()   # start the stopwatch
    for _ in range(repeats):
        _, comps = func(arr, key)
    end = time.perf_counter()      # end the stopwatch
    return (end - start) / repeats, comps     # divide by repeats to get the time of a single search


# Like time_search, but over a list of keys.
# Repeats up to `calls` searches, but stops early once `budget` seconds have
# passed (interpolation search on skewed data can be very slow).
# Returns (average time per search in seconds, average comparisons per search).
def time_search_many(func, arr, keys, calls, budget=0.3):
    repeats = max(1, calls // len(keys))
    total_steps = 0
    searches = 0
    start = time.perf_counter()
    for _ in range(repeats):
        for key in keys:
            _, comps = func(arr, key)
            total_steps += comps
        searches += len(keys)
        if time.perf_counter() - start > budget:
            break
    elapsed = time.perf_counter() - start
    return elapsed / searches, total_steps / searches


# Picks the words to search for, depending on the case.
def pick_keys(arr, case, rng):
    n = len(arr)
    if case == "worst":
        return [arr[-1]]                       # last element = worst case for linear search
    count = 30 if n <= 100_000 else 8          # fewer keys for big n: linear search is slow
    if case == "average":
        return [arr[rng.randrange(n)] for _ in range(count)]
    # "miss": data only uses a-z, so a word ending in '{' can never be in the list
    return ["".join(rng.choices(string.ascii_lowercase, k=rng.randint(5, 10))) + "{"
            for _ in range(count)]


# Times how long Python's sort (Timsort, O(n log n)) takes on a shuffled copy.
# Binary search needs sorted data, so this is the one-off price we pay for it.
def time_sort(arr, rng):
    shuffled = arr[:]
    rng.shuffle(shuffled)
    start = time.perf_counter()
    shuffled.sort()
    return time.perf_counter() - start


# Runs the benchmark for each dataset size.
def run_benchmark(sizes=(1000, 10000, 100000, 1000000), case="worst", with_sort=True,
                  distribution="uniform"):
    """
    For each n: generate data (seed 42) with the given distribution, search
    keys for the chosen case, return a list of result dicts.
    """
    if case not in CASES:
        raise ValueError(f"case must be one of {CASES}")
    if distribution not in DISTRIBUTIONS:
        raise ValueError(f"distribution must be one of {list(DISTRIBUTIONS)}")
    results = []
    for n in sizes:
        arr = generate_data(n, seed=42, distribution=distribution)   # same seed = same data every run, so results are repeatable
        rng = random.Random(n)
        keys = pick_keys(arr, case, rng)
        row = {"n": n, "case": case, "distribution": distribution,
               "keys": len(keys), "log2n": math.log2(n)}
        for name, (func, calls) in ALGORITHMS.items():
            t, steps = time_search_many(func, arr, keys, calls)
            row[f"{name}_time"] = t
            row[f"{name}_steps"] = int(steps) if case == "worst" else round(steps, 1)
        if with_sort:
            row["sort_time"] = time_sort(arr, rng)
            row.update(break_even(row))
        results.append(row)
    return results


# How many searches before "sort once, then binary search" beats
# "don't sort, just linear search every time"?
#   sort_cost + k * binary_cost  <  k * linear_cost
#   k > sort_cost / (linear_cost - binary_cost)
def break_even(row):
    n = row["n"]
    saved_steps = row["linear_steps"] - row["binary_steps"]
    saved_time = row["linear_time"] - row["binary_time"]
    sort_steps = n * math.log2(n) if n > 1 else 0   # comparison model of sorting
    return {
        "break_even_steps": math.ceil(sort_steps / saved_steps) if saved_steps > 0 else None,
        "break_even_time": math.ceil(row["sort_time"] / saved_time) if saved_time > 0 else None,
    }


# Turns the results into a neat table (a string).
def format_table(results):
    """Return the results as a printable string."""
    head = (f"{'n':>10} | {'Linear':>12} | {'Jump':>9} | {'Exp':>6} | "
            f"{'Binary':>6} | {'Interp':>6} | {'log2(n)':>7} | "
            f"{'Linear ms':>10} | {'Binary ms':>9} | {'Sort ms':>8} | {'Sort pays off after':>19}")
    title = (f"{results[0]['case']} case, {results[0]['distribution']} data"
             if results else "")
    lines = [f"Comparisons per search ({title})",
             head, "-" * len(head)]
    for r in results:
        be = r.get("break_even_time")
        lines.append(
            f"{r['n']:>10,} | {r['linear_steps']:>12,} | {r['jump_steps']:>9,} | "
            f"{r['exp_steps']:>6} | {r['binary_steps']:>6} | {r['interp_steps']:>6} | "
            f"{r['log2n']:>7.2f} | {r['linear_time']*1000:>10.4f} | "
            f"{r['binary_time']*1000:>9.5f} | {r.get('sort_time', 0)*1000:>8.2f} | "
            f"{(f'{be:,} searches' if be else '-'):>19}")
    return "\n".join(lines)


# Optional: draws a graph of time vs n for all searches.
# Needs matplotlib. Log-scale axes are used because the times are very different.
def plot_results(results):
    """Optional graph. Returns (ok, message)."""
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        return False, "matplotlib not installed (pip install matplotlib)."
    ns = [r["n"] for r in results]
    plt.plot(ns, [r["linear_time"] * 1000 for r in results], "o-", label="Linear O(n)")
    plt.plot(ns, [r["jump_time"] * 1000 for r in results], "^-", label="Jump O(sqrt n)")
    plt.plot(ns, [r["exp_time"] * 1000 for r in results], "d--", label="Exponential O(log n)")
    plt.plot(ns, [r["binary_time"] * 1000 for r in results], "s-", label="Binary O(log n)")
    plt.plot(ns, [r["interp_time"] * 1000 for r in results], "v:", label="Interpolation O(log log n)")
    plt.xlabel("n (dataset size)")
    plt.ylabel("time per search (ms)")
    plt.title(f"Search algorithms: time vs n ({results[0]['case']} case, "
              f"{results[0]['distribution']} data)")
    plt.xscale("log")
    plt.yscale("log")
    plt.legend()
    plt.grid(True)
    plt.show()
    return True, "Graph shown."
