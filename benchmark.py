"""
benchmark.py 
------------------------------------------------------------
PURPOSE:
    Measures and compares Linear Search vs Binary Search.
    For each dataset size n we record:
      - number of comparisons (steps)  -> proves the theory
      - running time in seconds        -> shows real-world speed

THEORY BEHIND THE NUMBERS:
    Linear search : O(n)      -> steps grow in proportion to n
    Binary search : O(log n)  -> steps grow like log2(n)
    Binary recurrence: T(n) = T(n/2) + O(1)  (Master Method, Case 2)

NOTE: No input() here. This file only calculates and returns
      results; main.py / server.py show them to the user.
"""
import math  # math.log2(n) gives the theoretical number of steps
import time    # time.perf_counter() = high-precision stopwatch

from data import generate_data                      # builds a sorted dataset
from search import binary_search, linear_search     # the two algorithms

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

# Runs the benchmark for each dataset size (1,000 to 1,000,000).
# We search for the LAST element because that is the worst case for
# linear search (it must check all n items), while binary search
# still needs only about log2(n) steps.
def run_benchmark(sizes=(1000, 10000, 100000, 1000000)):
     # same seed = same random data every run, so results are repeatable
    """
    For each n: generate data, search the LAST element
    (worst case for linear), return list of result dicts.
    """
    results = []
    for n in sizes:
        arr = generate_data(n, seed=42)
        key = arr[-1]     # last element = worst case for linear search
        lin_t, lin_c = time_search(linear_search, arr, key, repeats=3)         # linear search is slow, so 3 repeats are enough
        bin_t, bin_c = time_search(binary_search, arr, key, repeats=2000)       # binary search is very fast, so repeat 2000 times and average
        results.append({
            "n": n,
            "linear_steps": lin_c,
            "binary_steps": bin_c,
            "log2n": math.log2(n),      # theoretical step count: should be close to binary_steps
            "linear_time": lin_t,
            "binary_time": bin_t,
        })
    return results

# Turns the results into a neat table (a string) with columns:
# n, linear steps, binary steps, log2(n), linear time, binary time.
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

# Optional: draws a graph of time vs n for both searches.
# Needs matplotlib. Log-scale axes are used because linear and
# binary times are very different.
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
