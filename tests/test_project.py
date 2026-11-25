"""
Unit tests for the Bisect DAA project (stdlib unittest only).

    python -m unittest discover -s tests -v
"""
import json
import math
import os
import random
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import benchmark  # noqa: E402
import data  # noqa: E402
import server  # noqa: E402
from search import (binary_search, binary_search_recursive,  # noqa: E402
                    exponential_search, first_occurrence,
                    interpolation_search, jump_search, linear_search,
                    lower_bound, prefix_search)

EXACT = [binary_search, binary_search_recursive, linear_search,
         jump_search, exponential_search, interpolation_search]


class ExactSearchTests(unittest.TestCase):
    def test_empty_list(self):
        for f in EXACT:
            self.assertEqual(f([], "a"), (-1, 0), f.__name__)

    def test_single_element(self):
        for f in EXACT:
            self.assertEqual(f(["m"], "m")[0], 0, f.__name__)
            self.assertEqual(f(["m"], "a")[0], -1, f.__name__)
            self.assertEqual(f(["m"], "z")[0], -1, f.__name__)

    def test_every_element_is_found(self):
        arr = data.generate_data(500, seed=1)
        arr = sorted(set(arr))
        for f in EXACT:
            for i, v in enumerate(arr):
                self.assertEqual(f(arr, v)[0], i, f"{f.__name__} {v}")

    def test_random_against_python(self):
        rng = random.Random(7)
        for _ in range(2000):
            arr = sorted(rng.choice("abcdefgh") for _ in range(rng.randint(0, 80)))
            key = rng.choice("0abcdefghz")
            for f in EXACT:
                idx, steps = f(arr, key)
                if key in arr:
                    self.assertEqual(arr[idx], key, f.__name__)
                else:
                    self.assertEqual(idx, -1, f.__name__)
                self.assertGreaterEqual(steps, 0)

    def test_binary_worst_case_bound(self):
        for n in (1, 2, 3, 7, 8, 1000, 4096, 100_000):
            arr = [f"{i:07d}" for i in range(n)]
            bound = math.floor(math.log2(n)) + 1
            for key in (arr[0], arr[-1], arr[n // 3], "x", ""):
                self.assertLessEqual(binary_search(arr, key)[1], bound)

    def test_recursive_matches_iterative(self):
        arr = data.generate_data(10_000, seed=3)
        for key in arr[::97] + ["zzzz", "a"]:
            self.assertEqual(binary_search(arr, key), binary_search_recursive(arr, key))

    def test_jump_search_bound(self):
        for n in (10, 100, 10_000, 99_999):
            arr = [f"{i:07d}" for i in range(n)]
            step = math.isqrt(n)
            bound = math.ceil(n / step) + step
            for key in (arr[-1], arr[0], arr[n // 2], "x"):
                self.assertLessEqual(jump_search(arr, key)[1], bound)

    def test_exponential_fast_near_front(self):
        arr = [f"{i:07d}" for i in range(1_000_000)]
        _, front = exponential_search(arr, arr[3])
        _, back = exponential_search(arr, arr[-1])
        self.assertLess(front, 10)
        self.assertLessEqual(back, 2 * (math.floor(math.log2(len(arr))) + 2))

    def test_interpolation_fast_on_uniform_data(self):
        arr = data.generate_data(200_000, seed=5)
        rng = random.Random(2)
        keys = [arr[rng.randrange(len(arr))] for _ in range(300)]
        avg = sum(interpolation_search(arr, k)[1] for k in keys) / len(keys)
        self.assertLess(avg, 10)   # binary search needs about 17 here

    def test_interpolation_handles_odd_characters(self):
        arr = sorted(["", " ", "a b", "a", "zz{", "~x", "z", "émile", "0"])
        for i, v in enumerate(arr):
            self.assertEqual(arr[interpolation_search(arr, v)[0]], v)
        self.assertEqual(interpolation_search(arr, "q")[0], -1)

    def test_linear_counts_every_element(self):
        arr = ["a", "b", "c", "d"]
        self.assertEqual(linear_search(arr, "d"), (3, 4))
        self.assertEqual(linear_search(arr, "x"), (-1, 4))


class BoundAndPrefixTests(unittest.TestCase):
    def test_lower_bound(self):
        arr = ["b", "d", "d", "f"]
        self.assertEqual(lower_bound(arr, "a")[0], 0)
        self.assertEqual(lower_bound(arr, "d")[0], 1)
        self.assertEqual(lower_bound(arr, "e")[0], 3)
        self.assertEqual(lower_bound(arr, "z")[0], 4)
        self.assertEqual(lower_bound([], "z")[0], 0)

    def test_first_occurrence_with_duplicates(self):
        arr = ["a"] + ["k"] * 50 + ["z"]
        self.assertEqual(first_occurrence(arr, "k")[0], 1)
        self.assertEqual(first_occurrence(arr, "m")[0], -1)

    def test_prefix_search(self):
        arr = sorted(["karen", "kartik", "kavya", "arjun", "kar", "zara"])
        matches, _ = prefix_search(arr, "kar")
        self.assertEqual(matches, ["kar", "karen", "kartik"])
        self.assertEqual(prefix_search(arr, "q")[0], [])
        self.assertEqual(prefix_search(arr, "kar", limit=2)[0], ["kar", "karen"])

    def test_prefix_matches_brute_force(self):
        arr = data.generate_data(20_000, seed=9)
        for p in ("a", "ab", "zz", "qxq", "m"):
            expected = [w for w in arr if w.startswith(p)]
            self.assertEqual(prefix_search(arr, p)[0], expected)


class DataTests(unittest.TestCase):
    def test_clean_input(self):
        self.assertEqual(data.clean_input("  Karen \n"), "karen")
        self.assertIsNone(data.clean_input("   "))
        self.assertIsNone(data.clean_input(None))
        self.assertIsNone(data.clean_input(42))

    def test_generate_is_sorted_and_repeatable(self):
        a = data.generate_data(1000, seed=42)
        self.assertEqual(len(a), 1000)
        self.assertTrue(data.is_sorted(a))
        self.assertEqual(a, data.generate_data(1000, seed=42))
        self.assertEqual(data.generate_data(0), [])

    def test_add_and_delete_keep_order(self):
        arr = ["b", "d"]
        self.assertTrue(data.add_entry(arr, "  C ")[0])
        self.assertEqual(arr, ["b", "c", "d"])
        self.assertFalse(data.add_entry(arr, " ")[0])
        self.assertTrue(data.delete_entry(arr, "c")[0])
        self.assertEqual(arr, ["b", "d"])
        ok, msg = data.delete_entry(arr, "x")
        self.assertFalse(ok)
        self.assertIn("not found", msg)

    def test_uniform_data_unchanged(self):
        # README examples rely on seed 42 giving this exact list.
        arr = data.generate_data(100_000, seed=42)
        self.assertEqual(arr[25_000], "gofip")
        self.assertEqual(arr, data.generate_data(100_000, seed=42, distribution="uniform"))

    def test_distributions(self):
        n = 20_000
        for dist in data.DISTRIBUTIONS:
            arr = data.generate_data(n, seed=1, distribution=dist)
            self.assertEqual(len(arr), n)
            self.assertTrue(data.is_sorted(arr), dist)
            self.assertTrue(all(w.isalpha() and w.islower() for w in arr), dist)
        clustered = data.generate_data(n, seed=1, distribution="clustered")
        self.assertGreater(sum(w[0] == "s" for w in clustered) / n, 0.9)
        skewed = data.generate_data(n, seed=1, distribution="skewed")
        self.assertGreater(sum(w[0] == "a" for w in skewed), 10 * sum(w[0] == "z" for w in skewed))
        with self.assertRaises(ValueError):
            data.generate_data(10, distribution="normal")

    def test_exponential_data_is_interpolation_worst_case(self):
        arr = data.generate_data(100_000, seed=3, distribution="exponential")
        rng = random.Random(4)
        keys = [arr[rng.randrange(len(arr))] for _ in range(40)]
        interp = sum(interpolation_search(arr, k)[1] for k in keys) / len(keys)
        binary = sum(binary_search(arr, k)[1] for k in keys) / len(keys)
        self.assertGreater(interp, 20 * binary)
        for k in keys:   # slow, but still correct
            self.assertEqual(arr[interpolation_search(arr, k)[0]], k)

    def _write(self, raw):
        fd, path = tempfile.mkstemp(suffix=".txt")
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
        self.addCleanup(os.remove, path)
        return path

    def test_load_data(self):
        arr, msg = data.load_data(self._write(b"Zoe\n\n  arjun \nBianca\n"))
        self.assertEqual(arr, ["arjun", "bianca", "zoe"])
        self.assertIn("3", msg)

    def test_load_strips_bom(self):
        arr, _ = data.load_data(self._write("﻿Aarav\nBob\n".encode("utf-8")))
        self.assertEqual(arr, ["aarav", "bob"])

    def test_load_errors(self):
        self.assertEqual(data.load_data(os.path.join(ROOT, "missing.txt"))[1], "File not found.")
        self.assertEqual(data.load_data(self._write(b"\n \n"))[1], "File is empty.")
        self.assertEqual(data.load_data(self._write(b"\x89PNG\r\n\x1a\n\xff\xfe"))[0], [])
        self.assertEqual(data.load_data(self._write(b"abc\x00def\n"))[0], [])

    def test_sample_file_loads(self):
        arr, _ = data.load_data(os.path.join(ROOT, "sample_contacts.txt"))
        self.assertEqual(len(arr), 50)
        self.assertTrue(data.is_sorted(arr))


class BenchmarkTests(unittest.TestCase):
    def test_cases(self):
        for case in benchmark.CASES:
            (r,) = benchmark.run_benchmark(sizes=(5000,), case=case)
            self.assertEqual(r["case"], case)
            self.assertLess(r["binary_steps"], r["jump_steps"])
            self.assertLess(r["interp_steps"], r["binary_steps"])
            self.assertGreater(r["break_even_time"], 0)
            self.assertGreater(r["break_even_steps"], 0)
        (miss,) = benchmark.run_benchmark(sizes=(5000,), case="miss", with_sort=False)
        self.assertEqual(miss["linear_steps"], 5000)       # a miss scans everything
        self.assertNotIn("sort_time", miss)
        with self.assertRaises(ValueError):
            benchmark.run_benchmark(sizes=(10,), case="best")

    def test_run_benchmark(self):
        rows = benchmark.run_benchmark(sizes=(1000, 10_000))
        self.assertEqual([r["n"] for r in rows], [1000, 10_000])
        for r in rows:
            self.assertEqual(r["linear_steps"], r["n"])  # last element = worst case
            self.assertLessEqual(r["binary_steps"], math.floor(math.log2(r["n"])) + 1)
            self.assertLess(r["binary_steps"], r["jump_steps"])
            self.assertLess(r["jump_steps"], r["linear_steps"])
        self.assertIn("Sort pays off after", benchmark.format_table(rows))


class ServerApiTests(unittest.TestCase):
    """Starts the real HTTP server on a free port and calls the JSON API."""

    @classmethod
    def setUpClass(cls):
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def call(self, path, body=None):
        req = urllib.request.Request(
            self.base + path,
            data=None if body is None else json.dumps(body).encode(),
            headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as res:
                return res.status, json.loads(res.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_flow(self):
        status, s = self.call("/api/generate", {"n": 2000, "scenario": "inventory"})
        self.assertEqual(status, 200)
        self.assertEqual(s["n"], 2000)
        self.assertEqual(s["field"], "product_id")

        status, r = self.call("/api/search", {"target": "SKU-000125"})
        self.assertEqual(status, 200)
        self.assertTrue(r["found"])
        self.assertEqual(r["record"]["product_id"], "SKU-000125")
        self.assertEqual(r["recursive_calls"], len(r["trace"]))
        self.assertEqual(r["theoretical"], "Θ(log n)")
        for probe in r["trace"]:
            self.assertLessEqual(probe["low_value"], probe["value"])
            self.assertLessEqual(probe["value"], probe["high_value"])

        status, r = self.call("/api/search", {"target": "SKU-009999"})
        self.assertFalse(r["found"])

    def test_bad_input_is_rejected_not_500(self):
        self.assertEqual(self.call("/api/generate", {"n": "abc"})[0], 400)
        self.assertEqual(self.call("/api/generate", {"n": 0})[0], 400)
        self.assertEqual(self.call("/api/search", {"target": "   "})[0], 400)
        self.assertEqual(self.call("/api/search", {"target": 123})[0], 400)
        self.assertEqual(self.call("/api/nope", {})[0], 404)

    def test_load_rejects_binary_upload(self):
        import base64
        status, r = self.call("/api/load", {
            "filename": "x.png",
            "content_b64": base64.b64encode(b"\x89PNG\x00\xff\xfe").decode()})
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()
