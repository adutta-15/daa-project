"""
data.py  (Member 2)
Loading, generating, cleaning and editing the dataset.
NO printing here. Functions return values (and messages) to main.py.
The list is always: lowercase, no blanks, sorted.
"""
import bisect
import random
import string

from search import binary_search


def clean_input(text):
    """Strip + lowercase. Returns None if empty/invalid."""
    if not isinstance(text, str):
        return None
    text = text.strip().lower()
    return text if text else None


def is_sorted(arr):
    """True if arr is in non-decreasing order."""
    return all(arr[i] <= arr[i + 1] for i in range(len(arr) - 1))


def load_data(path):
    """
    Read a text file (one entry per line).
    Returns (sorted_list, message). On error returns ([], error_message).
    """
    try:
        with open(path, "r", encoding="utf-8-sig") as f:   # -sig strips a BOM
            items = [clean_input(line) for line in f]
        if any("\x00" in x for x in items if x):
            return [], "File is corrupt or not a text file."
        items = [x for x in items if x]          # drop empty lines
        if not items:
            return [], "File is empty."
        items.sort()
        return items, f"Loaded {len(items)} entries."
    except FileNotFoundError:
        return [], "File not found."
    except UnicodeDecodeError:
        return [], "File is corrupt or not a text file."
    except OSError as e:
        return [], f"Could not read file: {e}"


# How the random words are spread over the alphabet. Binary search does not
# care, but interpolation search (which guesses a position from the value)
# depends on it heavily, so these let us show its best and worst cases.
DISTRIBUTIONS = {
    "uniform": "Every letter equally likely (interpolation search's best case)",
    "skewed": "First letters follow a Zipf law, like real names: lots of a/b/c, few x/y/z",
    "clustered": "95% of words start with 's'",
    "exponential": "Words pile up near 'a' (a, aa, aaa...): interpolation search's worst case",
}
_LETTERS = string.ascii_lowercase
_ZIPF = [1 / (i + 1) ** 1.5 for i in range(26)]


def _word(rng, lo=5, hi=10):
    return "".join(rng.choices(_LETTERS, k=rng.randint(lo, hi)))


def generate_data(n, seed=None, distribution="uniform"):
    """n random lowercase words (length 5-10), returned sorted."""
    if distribution not in DISTRIBUTIONS:
        raise ValueError(f"distribution must be one of {list(DISTRIBUTIONS)}")
    if n <= 0:
        return []
    rng = random.Random(seed)
    if distribution == "uniform":
        data = [_word(rng) for _ in range(n)]
    elif distribution == "skewed":
        firsts = rng.choices(_LETTERS, weights=_ZIPF, k=n)
        data = [first + _word(rng, 4, 9) for first in firsts]
    elif distribution == "clustered":
        data = [("s" if rng.random() < 0.95 else rng.choice(_LETTERS)) + _word(rng, 4, 9)
                for _ in range(n)]
    else:  # exponential: k leading 'a's, k ~ exponential, so values crowd towards 0
        data = ["a" * min(int(rng.expovariate(0.35)), 12) + _word(rng) for _ in range(n)]
    data.sort()
    return data


def add_entry(arr, item):
    """Insert keeping order. Returns (success, message)."""
    item = clean_input(item)
    if item is None:
        return False, "Cannot add an empty entry."
    bisect.insort(arr, item)
    return True, f"Added '{item}'."


def delete_entry(arr, item):
    """Delete one copy using binary search. Returns (success, message)."""
    item = clean_input(item)
    if item is None:
        return False, "Cannot delete an empty entry."
    idx, _ = binary_search(arr, item)
    if idx == -1:
        return False, f"'{item}' not found."
    arr.pop(idx)
    return True, f"Deleted '{item}'."
