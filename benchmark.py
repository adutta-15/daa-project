"""
benchmark.py  (Member 3)
Times and counts comparisons for linear vs binary search.
"""
import math
import time

from data import generate_data
from search import binary_search, linear_search


def time_search(func, arr, key, repeats=1):
    """
    Returns (avg_time_in_seconds, comparisons).
    'repeats' averages tiny timings (binary search is very fast).
    """
    start = time.perf_counter()
    for _ in range(repeats):
        _, comps = func(arr, key)
    end = time.perf_counter()
    return (end - start) / repeats, comps


def run_benchmark(sizes=(1000, 10000, 100000, 1000000)):
    """
    For each n: generate data, search the LAST element
    (worst case for linear), return list of result dicts.
    """
    results = []
    for n in sizes:
        arr = generate_data(n, seed=42)
        key = arr[-1]
        lin_t, lin_c = time_search(linear_search, arr, key, repeats=3)
        bin_t, bin_c = time_search(binary_search, arr, key, repeats=2000)
        results.append({
            "n": n,
            "linear_steps": lin_c,
            "binary_steps": bin_c,
            "log2n": math.log2(n),
            "linear_time": lin_t,
            "binary_time": bin_t,
        })
    return results


def format_table(results):
    """Return the results as a printable string."""
    head = (f"{'n':>10} | {'Linear steps':>12} | {'Binary steps':>12} | "
            f"{'log2(n)':>8} | {'Linear ms':>10} | {'Binary ms':>10}")
    lines = [head, "-" * len(head)]
    for r in results:
        lines.append(
            f"{r['n']:>10,} | {r['linear_steps']:>12,} | {r['binary_steps']:>12} | "
            f"{r['log2n']:>8.2f} | {r['linear_time']*1000:>10.4f} | "
            f"{r['binary_time']*1000:>10.5f}")
    return "\n".join(lines)


def plot_results(results):
    """Optional graph. Returns (ok, message)."""
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        return False, "matplotlib not installed (pip install matplotlib)."
    ns = [r["n"] for r in results]
    plt.plot(ns, [r["linear_time"] * 1000 for r in results], "o-", label="Linear O(n)")
    plt.plot(ns, [r["binary_time"] * 1000 for r in results], "s-", label="Binary O(log n)")
    plt.xlabel("n (dataset size)")
    plt.ylabel("time (ms)")
    plt.title("Linear vs Binary Search")
    plt.xscale("log")
    plt.yscale("log")
    plt.legend()
    plt.grid(True)
    plt.show()
    return True, "Graph shown."
