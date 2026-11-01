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
    if text is None:
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
        with open(path, "r", encoding="utf-8") as f:
            items = [clean_input(line) for line in f]
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


def generate_data(n, seed=None):
    """n random lowercase words (length 5-10), returned sorted."""
    if n <= 0:
        return []
    rng = random.Random(seed)
    letters = string.ascii_lowercase
    data = ["".join(rng.choices(letters, k=rng.randint(5, 10))) for _ in range(n)]
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
