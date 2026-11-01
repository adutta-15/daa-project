"""
search.py  (Member 1)
Searching algorithms. NO printing here, only return values.
Every exact search returns (index, comparisons).
"""


def binary_search(arr, key):
    """Iterative binary search. Time O(log n), Space O(1)."""
    low, high = 0, len(arr) - 1
    count = 0
    while low <= high:
        mid = (low + high) // 2
        count += 1
        if arr[mid] == key:
            return mid, count
        elif arr[mid] < key:
            low = mid + 1          # discard left half
        else:
            high = mid - 1         # discard right half
    return -1, count


def binary_search_recursive(arr, key, low=0, high=None, count=0):
    """
    Recursive binary search.
    Recurrence: T(n) = T(n/2) + O(1)  ->  Master Method Case 2  ->  Theta(log n)
    Space O(log n) because of the call stack.
    """
    if high is None:
        high = len(arr) - 1
    if low > high:
        return -1, count
    mid = (low + high) // 2
    count += 1
    if arr[mid] == key:
        return mid, count
    if arr[mid] < key:
        return binary_search_recursive(arr, key, mid + 1, high, count)
    return binary_search_recursive(arr, key, low, mid - 1, count)


def linear_search(arr, key):
    """Plain scan. Best O(1), Worst/Average O(n)."""
    count = 0
    for i in range(len(arr)):
        count += 1
        if arr[i] == key:
            return i, count
    return -1, count


def lower_bound(arr, prefix):
    """
    First index i such that arr[i] >= prefix.
    Returns (index, comparisons). Index == len(arr) if none.
    """
    low, high = 0, len(arr)
    count = 0
    while low < high:
        mid = (low + high) // 2
        count += 1
        if arr[mid] < prefix:
            low = mid + 1
        else:
            high = mid
    return low, count


def prefix_search(arr, prefix, limit=None):
    """
    Autocomplete: all words starting with prefix.
    Uses lower_bound then walks forward. Time O(log n + k), k = matches.
    Returns (list_of_matches, comparisons).
    """
    start, count = lower_bound(arr, prefix)
    matches = []
    i = start
    while i < len(arr) and arr[i].startswith(prefix):
        matches.append(arr[i])
        count += 1
        i += 1
        if limit is not None and len(matches) >= limit:
            break
    return matches, count


def first_occurrence(arr, key):
    """For duplicates: index of the FIRST copy of key, or -1."""
    idx, count = lower_bound(arr, key)
    if idx < len(arr) and arr[idx] == key:
        return idx, count
    return -1, count
