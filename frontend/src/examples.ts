export interface Example {
  name: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    name: "Fibonacci (recursion)",
    code: `def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

print(fib(5))
`,
  },
  {
    name: "Bubble sort",
    code: `def bubble_sort(xs):
    n = len(xs)
    for i in range(n):
        for j in range(n - 1 - i):
            if xs[j] > xs[j + 1]:
                xs[j], xs[j + 1] = xs[j + 1], xs[j]
    return xs

print(bubble_sort([5, 2, 4, 1, 3]))
`,
  },
  {
    name: "Word count (dict)",
    code: `from collections import Counter

text = "the cat and the hat"
counts = {}
for word in text.split():
    counts[word] = counts.get(word, 0) + 1

print(counts)
print(Counter(text.split()).most_common(1))
`,
  },
  {
    name: "Exception",
    code: `def average(xs):
    return sum(xs) / len(xs)

print(average([2, 4, 6]))
print(average([]))
`,
  },
  {
    name: "Infinite loop",
    code: `count = 0
while True:
    count += 1
`,
  },
];
