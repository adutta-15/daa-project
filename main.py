"""
main.py  (Member 4)
Menu-driven CLI. Run:  python main.py
(For the web interface, run:  python server.py)
"""
from benchmark import format_table, plot_results, run_benchmark, time_search
from data import (add_entry, clean_input, delete_entry, generate_data,
                  is_sorted, load_data)
from search import (binary_search, binary_search_recursive, first_occurrence,
                    linear_search, prefix_search)

MENU = """
========== SMART CONTACT / DICTIONARY SEARCH ==========
1. Load data from file
2. Generate random data (n)
3. Exact search (binary vs linear)
4. Prefix search (autocomplete)
5. Add entry
6. Delete entry
7. Run benchmark
8. Show theory (Master Method)
9. Exit
"""

THEORY = """
Binary search recurrence:  T(n) = T(n/2) + O(1)
Master Method: a=1, b=2, f(n)=Theta(1), n^(log_b a) = n^0 = 1
f(n) = Theta(n^(log_b a))  ->  Case 2  ->  T(n) = Theta(log n)

            Best    Average    Worst      Space
Binary      O(1)    O(log n)   O(log n)   O(1) iterative / O(log n) recursive
Linear      O(1)    O(n)       O(n)       O(1)
Prefix      O(log n + k) where k = number of matches
"""


def read_int(prompt, minimum=1):
    """Keep asking until a valid integer >= minimum is typed."""
    while True:
        try:
            value = int(input(prompt).strip().replace(",", ""))
            if value >= minimum:
                return value
            print(f"Enter a number >= {minimum}.")
        except ValueError:
            print("Invalid number, try again.")


def need_data(arr):
    if not arr:
        print("! No data loaded. Use option 1 or 2 first.")
        return False
    if not is_sorted(arr):
        arr.sort()
        print("(List was unsorted, sorted it first.)")
    return True


def do_exact_search(arr):
    key = clean_input(input("Enter word/name to search: "))
    if key is None:
        print("! Search text cannot be empty.")
        return
    bt, bc = time_search(binary_search, arr, key, repeats=100)
    lt, lc = time_search(linear_search, arr, key)
    idx, _ = binary_search(arr, key)
    ridx, rc = binary_search_recursive(arr, key)
    if idx == -1:
        print(f"'{key}' NOT FOUND.")
    else:
        first, _ = first_occurrence(arr, key)
        print(f"FOUND '{key}' at index {idx} (first occurrence: {first}).")
    print(f"Binary (iterative): {bc} steps, {bt*1000:.5f} ms")
    print(f"Binary (recursive): {rc} steps")
    print(f"Linear            : {lc} steps, {lt*1000:.5f} ms")


def do_prefix_search(arr):
    prefix = clean_input(input("Enter prefix: "))
    if prefix is None:
        print("! Prefix cannot be empty.")
        return
    matches, steps = prefix_search(arr, prefix)
    if not matches:
        print(f"No words start with '{prefix}'. ({steps} steps)")
        return
    print(f"{len(matches)} match(es) found in {steps} steps.")
    for word in matches[:20]:
        print("  ", word)
    if len(matches) > 20:
        print(f"   ... and {len(matches) - 20} more")


def main():
    arr = []
    while True:
        print(MENU)
        choice = input("Choose (1-9): ").strip()
        if choice == "1":
            path = input("File path: ").strip().strip('"')
            arr, msg = load_data(path)
            print(msg)
        elif choice == "2":
            n = read_int("How many entries? ")
            if n > 5_000_000:
                print("! Too large, capping at 5,000,000.")
                n = 5_000_000
            arr = generate_data(n)
            print(f"Generated {len(arr):,} sorted entries. Sample: {arr[:3]}")
        elif choice == "3":
            if need_data(arr):
                do_exact_search(arr)
        elif choice == "4":
            if need_data(arr):
                do_prefix_search(arr)
        elif choice == "5":
            ok, msg = add_entry(arr, input("Entry to add: "))
            print(msg)
        elif choice == "6":
            if need_data(arr):
                ok, msg = delete_entry(arr, input("Entry to delete: "))
                print(msg)
        elif choice == "7":
            print("Running benchmark (takes a few seconds)...")
            results = run_benchmark()
            print(format_table(results))
            if input("Show graph? (y/n): ").strip().lower() == "y":
                print(plot_results(results)[1])
        elif choice == "8":
            print(THEORY)
        elif choice == "9":
            print("Bye!")
            break
        else:
            print("! Invalid choice. Enter a number from 1 to 9.")


if __name__ == "__main__":
    main()
