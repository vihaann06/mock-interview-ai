import type { Question } from "@/lib/types/question";

const pythonStarter = (fnSignature: string) =>
  `def ${fnSignature}:\n    # Write your solution here\n    pass\n`;

/**
 * Question bank (~10 Google-style DSA problems).
 * Deeply enriched: two-sum, number-of-islands, lru-cache.
 * Remaining entries are light but schema-valid stubs.
 */
export const questions: Question[] = [
  {
    id: "two-sum",
    title: "Two Sum",
    company: "Google",
    difficulty: "Easy",
    expectedTimeMinutes: 25,
    statement:
      "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume each input has exactly one solution, and you may not use the same element twice. You can return the answer in any order.",
    constraints: [
      "2 ≤ nums.length ≤ 10^4",
      "-10^9 ≤ nums[i] ≤ 10^9",
      "-10^9 ≤ target ≤ 10^9",
      "Exactly one valid answer exists",
      "You may not use the same element (index) twice",
      "Return order does not matter",
    ],
    clarifications: [
      "Can the same index be used twice? No — each element at most once.",
      "Is the array sorted? Not necessarily; do not assume sorted order.",
      "Are there duplicate values? Yes, possible; indices still must differ.",
      "Should we return values or indices? Indices.",
      "Multiple pairs? Constraints guarantee exactly one solution.",
      "Can nums contain negatives or zeros? Yes.",
      "In-place mutation of nums allowed? Prefer not required; read-only is fine.",
    ],
    expectedApproaches: [
      "Brute force: check all pairs i < j — O(n²) time, O(1) space. Acceptable baseline; discuss why it may be too slow at n=10^4.",
      "Hash map one-pass: while scanning, look up target - nums[i] in a map of value→index seen so far; if found return [map[complement], i], else store nums[i]. O(n) time, O(n) space.",
      "Hash map two-pass: first build value→index map, then scan for complement (careful with same-index). Slightly more error-prone than one-pass.",
      "If sorted were allowed: two pointers after sorting with index tracking — but sorting changes indices unless you keep pairs; usually inferior here vs hash map given unsorted input.",
    ],
    solutions: [
      "Preferred (evaluator): one-pass hash map. For i, x in enumerate(nums): need = target - x; if need in seen: return [seen[need], i]; seen[x] = i. Returns indices in O(n)/O(n).",
      "Brute force reference: for i in range(n): for j in range(i+1, n): if nums[i]+nums[j]==target: return [i,j].",
      "Two-pass: build dict of all values (last index wins — must skip i when complement index == i), then scan; prefer one-pass to avoid same-index bugs.",
    ],
    commonMistakes: [
      "Returning the values nums[i], nums[j] instead of indices",
      "Using the same index twice when 2*nums[i] == target",
      "Assuming the array is sorted and applying two pointers incorrectly on unsorted data",
      "Building a map of all values first and forgetting to exclude the current index",
      "Using a set instead of a map and losing the index to return",
      "Off-by-one or early return before storing the current value when complement appears later",
      "Mutating the array (sort in place) and losing original indices",
    ],
    edgeCases: [
      "Minimum length: nums = [a, b] that sum to target",
      "Negatives and zeros: e.g. [-3, 1, 4], target = 1 → [-3, 4]",
      "Duplicate values that form the target: [3, 3], target = 6",
      "Complement is the same value at a different index vs same index",
      "Large magnitude values near ±10^9 (no overflow in Python; note in other languages)",
      "Target equals 2 * some value with only one occurrence — must not reuse index",
      "Answer pair at the ends of the array",
    ],
    hintLadder: [
      {
        level: 1,
        text: "For each number, what complementary value would complete the target — and how expensive is searching for it each time?",
      },
      {
        level: 2,
        text: "As you scan left to right, could you remember values you've already seen so each lookup is cheap?",
      },
      {
        level: 3,
        text: "Try a hash map from value → index of numbers seen so far; at index i, check whether target - nums[i] is already in the map.",
      },
    ],
    followups: [
      "What if the input arrives as a stream and you must answer online?",
      "How would the solution change if you needed all unique pairs (by value or by index)?",
      "What if the array were sorted — would you change your approach?",
      "What if there might be zero or many solutions instead of exactly one?",
      "Can you do it in O(1) extra space? Under what assumptions?",
    ],
    rubricNotes: [
      "Strong: independently reaches hash-map insight and correctly handles same-value/different-index",
      "Hire: correct O(n) with clear explanation; may start from brute force then optimize",
      "Lean no: only brute force with no path to better complexity, or persistent index/value confusion",
      "Watch communication: do they verify with a small example before coding?",
      "Complexity: expect O(n) time / O(n) space for the optimal map approach",
    ],
    starterCode: pythonStarter(
      "two_sum(nums: list[int], target: int) -> list[int]",
    ),
    expectedComplexity: { time: "O(n)", space: "O(n)" },
    interviewerConcerns: [
      {
        id: "nested-loop-complexity",
        topic: "complexity",
        incorrectPatterns: [
          "O(n)",
          "linear time",
          "for i in",
          "for j in",
          "nested loop",
          "brute force is O(n)",
        ],
        probeExamples: [
          "You said O(n) — how many pairs does the nested loop check?",
          "If the outer and inner loops both scan the array, what is the true time complexity?",
          "Walk through how many complement checks happen for n = 4.",
        ],
        counterexamples: ["nums = [1,2,3,4], target = 7"],
        invariant:
          "Claiming O(n) requires a single pass with O(1) lookups (e.g. hash map), not nested scans.",
      },
      {
        id: "same-index-reuse",
        topic: "edge_cases",
        incorrectPatterns: [
          "same index",
          "use the same element twice",
          "2 * nums[i]",
          "twice the same",
        ],
        probeExamples: [
          "If 2 * nums[i] equals the target, how do you ensure the two indices differ?",
          "Where in your map approach do you forbid reusing the current index?",
        ],
        counterexamples: ["nums = [3, 3], target = 6", "nums = [3, 2, 4], target = 6"],
        invariant:
          "Each element may be used at most once — complement at the same index is invalid.",
      },
    ],
  },
  {
    id: "valid-parentheses",
    title: "Valid Parentheses",
    company: "Google",
    difficulty: "Easy",
    expectedTimeMinutes: 20,
    statement:
      "Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid. Open brackets must be closed by the same type in the correct order.",
    constraints: ["1 ≤ s.length ≤ 10^4", "s consists of parentheses only"],
    clarifications: ["Empty string? Treat as valid if allowed by constraints."],
    expectedApproaches: [
      "Stack: push openers; on closer, pop and match type",
    ],
    solutions: ["Stack matching with map from closer → opener"],
    commonMistakes: ["Not handling early closing brackets", "Wrong pairing map"],
    edgeCases: ["Single bracket", "Nested mixed types"],
    hintLadder: [
      { level: 1, text: "What structure naturally tracks the most recent unmatched opener?" },
      { level: 2, text: "When you see a closer, what should be on top?" },
      { level: 3, text: "Use a stack and a map from closing to opening brackets." },
    ],
    followups: ["Support additional bracket types from a config map."],
    rubricNotes: ["Stack discipline and edge-case handling"],
    starterCode: pythonStarter("is_valid(s: str) -> bool"),
    expectedComplexity: { time: "O(n)", space: "O(n)" },
  },
  {
    id: "merge-intervals",
    title: "Merge Intervals",
    company: "Google",
    difficulty: "Medium",
    expectedTimeMinutes: 30,
    statement:
      "Given an array of intervals where intervals[i] = [start_i, end_i], merge all overlapping intervals and return an array of the non-overlapping intervals that cover all the intervals in the input.",
    constraints: ["1 ≤ intervals.length ≤ 10^4", "intervals[i].length == 2"],
    clarifications: ["Are intervals sorted? Not guaranteed."],
    expectedApproaches: [
      "Sort by start, then linear scan merging overlaps",
    ],
    solutions: ["Sort by start, then linear merge"],
    commonMistakes: ["Forgetting to sort", "Off-by-one on overlap"],
    edgeCases: ["Touching endpoints", "Fully nested intervals"],
    hintLadder: [
      { level: 1, text: "What ordering would make overlaps easier to detect?" },
      { level: 2, text: "After sorting, how do you decide whether to extend the current interval?" },
      { level: 3, text: "Sort by start; merge when next.start ≤ current.end." },
    ],
    followups: ["Insert a new interval into an already merged list."],
    rubricNotes: ["Sorting rationale and invariant while merging"],
    starterCode: pythonStarter(
      "merge(intervals: list[list[int]]) -> list[list[int]]",
    ),
    expectedComplexity: { time: "O(n log n)", space: "O(n)" },
    interviewerConcerns: [
      {
        id: "ordering-invariant",
        topic: "sorting invariant",
        incorrectPatterns: [
          "sort by end",
          "sorted by end",
          "end time",
          "end_time",
        ],
        probeExamples: [
          "Why does that ordering guarantee adjacent comparisons are enough?",
          "What property must the ordering preserve while you scan?",
        ],
        counterexamples: ["[[1,10],[2,3],[4,5]]"],
        invariant:
          "After sorting by start, each merge only needs to compare with the current open interval.",
      },
    ],
  },
  {
    id: "number-of-islands",
    title: "Number of Islands",
    company: "Google",
    difficulty: "Medium",
    expectedTimeMinutes: 30,
    statement:
      "Given an m x n 2D binary grid which represents a map of '1's (land) and '0's (water), return the number of islands. An island is surrounded by water and formed by connecting adjacent lands horizontally or vertically (not diagonally).",
    constraints: [
      "1 ≤ m, n ≤ 300",
      "grid[i][j] is '0' or '1' (characters, not integers)",
      "Grid is rectangular — every row has length n",
      "Time budget should be linear in the number of cells for an optimal solution",
    ],
    clarifications: [
      "Diagonal connections? No — only 4-directional (up/down/left/right).",
      "May I mutate the grid to mark visited land? Usually yes unless told otherwise.",
      "Are cells characters '1'/'0' or ints? Characters per typical prompt — compare carefully.",
      "Does a single land cell count as an island? Yes.",
      "Is the grid guaranteed non-empty? Constraints say m,n ≥ 1.",
      "Connected via wrapping edges (torus)? No — standard grid bounds.",
    ],
    expectedApproaches: [
      "DFS flood fill: scan grid; on unvisited '1', increment count and DFS/recursively mark all 4-directionally connected land as visited (mutate to '0' or use visited[][]).",
      "BFS flood fill: same counting strategy with a queue — often safer for deep recursion limits on large components.",
      "Union-Find (Disjoint Set): union each land with its right/down neighbors; count distinct roots among land cells. Good if they mention connectivity / components explicitly.",
      "Avoid recounting: every cell visited at most once → O(m·n) time.",
    ],
    solutions: [
      "DFS: for each cell, if grid[r][c]=='1': ans+=1; dfs mark all reachable '1' to '0'. Directions [(-1,0),(1,0),(0,-1),(0,1)].",
      "BFS: same trigger; queue neighbors; mark visited when enqueue to avoid duplicates.",
      "Union-Find: index = r*n+c; union land with 4-neighbors that are land; answer = number of land roots.",
    ],
    commonMistakes: [
      "Treating diagonal neighbors as connected (8-direction) when problem is 4-direction",
      "Comparing to integer 1 instead of character '1'",
      "Forgetting to mark visited → infinite recursion or recounting the same island",
      "Incrementing the island count inside the flood instead of once per new component",
      "Out-of-bounds access without boundary checks",
      "Using recursion DFS on a worst-case snake island and hitting recursion depth limits (prefer BFS or iterative DFS)",
      "Creating a full visited matrix but still not marking water correctly / double-counting",
    ],
    edgeCases: [
      "All water: answer 0",
      "All land: answer 1",
      "Single cell grid: [['1']] → 1, [['0']] → 0",
      "Checkerboard pattern: many size-1 islands",
      "Thin corridors / snake-shaped island spanning the grid",
      "Islands touching only at corners (should be separate)",
      "Large m=n=300 solid land — recursion depth / performance",
    ],
    hintLadder: [
      {
        level: 1,
        text: "If you think of each land cell as a graph node with edges to 4-neighbors, what are you counting?",
      },
      {
        level: 2,
        text: "When you find an unmarked land cell, how can you mark its entire connected component so you do not count it again?",
      },
      {
        level: 3,
        text: "Scan the grid; each time you see an unvisited '1', increment the answer and run DFS or BFS to mark all reachable land (e.g. flip to '0').",
      },
    ],
    followups: [
      "What if diagonal adjacency also counted?",
      "Return the size of the largest island instead of the count",
      "Number of distinct islands by shape (normalize rotations/reflections — harder)",
      "Grid is streaming row-by-row — can you count with limited memory?",
      "How would you parallelize this on a huge grid?",
    ],
    rubricNotes: [
      "Strong: clear graph/component framing, correct 4-direction, O(m·n), discusses mutation vs visited",
      "Hire: working DFS or BFS with minor boundary bugs they can fix when probed",
      "Lean no: conflates DFS with wrong counting; cannot explain visited marking",
      "Probe: why BFS vs DFS? recursion limits? character vs int?",
      "Complexity: O(m·n) time, O(m·n) worst-case stack/queue space",
    ],
    starterCode: pythonStarter("num_islands(grid: list[list[str]]) -> int"),
    expectedComplexity: { time: "O(m·n)", space: "O(m·n)" },
  },
  {
    id: "lru-cache",
    title: "LRU Cache",
    company: "Google",
    difficulty: "Medium",
    expectedTimeMinutes: 35,
    statement:
      "Design a data structure that follows the constraints of a Least Recently Used (LRU) cache. Implement the LRUCache class: LRUCache(capacity) constructs with positive capacity; get(key) returns the value if present else -1; put(key, value) updates or inserts the value, evicting the least recently used key when capacity would be exceeded. get and put must each run in O(1) average time.",
    constraints: [
      "1 ≤ capacity ≤ 3000",
      "0 ≤ key ≤ 10^4",
      "0 ≤ value ≤ 10^5",
      "At most 2·10^5 calls to get and put in total",
      "get and put must be O(1) average time complexity",
      "capacity is positive (at least 1)",
    ],
    clarifications: [
      "Does get count as a use (refresh recency)? Yes.",
      "Does put on an existing key refresh recency and update value? Yes.",
      "On overflow, evict the least recently used key before/while inserting the new one.",
      "What should get return on a miss? -1.",
      "Is capacity 0 possible? No — capacity ≥ 1.",
      "May we use library OrderedDict / LinkedHashMap? Discuss tradeoffs; interviewers often want the hash map + doubly linked list design explained even if a library is allowed.",
      "Thread safety required? Not for MVP — single-threaded.",
    ],
    expectedApproaches: [
      "Hash map + doubly linked list: map key → node; list maintains recency (e.g. head = most recent, tail = least). get/put move node to most-recent; put evicts tail when over capacity. O(1) ops with careful pointer updates.",
      "Language sugar: Python collections.OrderedDict (move_to_end / popitem(last=False)) — acceptable if they can explain the same invariants.",
      "Incorrect / too slow: list or deque alone for order with linear scan for key; dict alone without order — cannot find LRU in O(1).",
    ],
    solutions: [
      "Classic: Dict[key, Node] + doubly linked list with sentinel head/tail. Node has key, value, prev, next. _remove(node), _add_to_front(node). get: lookup, move front, return val. put: update existing or insert; if len > capacity, remove tail.prev.",
      "OrderedDict: on get/put move_to_end(key); on overflow popitem(last=False).",
    ],
    commonMistakes: [
      "Not updating recency on get",
      "Not updating recency on put-to-existing-key",
      "Evicting the most recently used instead of least",
      "Off-by-one on capacity (evict too early or too late)",
      "Broken doubly-linked-list pointer updates (forgetting both directions)",
      "Storing only values in the map and losing ability to unlink the LRU node in O(1)",
      "Using a timestamp + scan for min timestamp → O(n) get/put",
      "Forgetting to delete the key from the map on eviction",
    ],
    edgeCases: [
      "capacity == 1: every new key evicts the only resident",
      "Repeated put of the same key with new values — size unchanged, recency refreshed",
      "get miss returns -1 and must not crash or mutate order",
      "Alternating get/put patterns that thrash a size-1 or size-2 cache",
      "put when already at capacity with a brand-new key",
      "put when at capacity updating an existing key (should not evict)",
      "Many operations (2e5) — must stay amortized O(1)",
    ],
    hintLadder: [
      {
        level: 1,
        text: "Which operations must be O(1), and what does that imply about needing both fast lookup and an ordered recency structure?",
      },
      {
        level: 2,
        text: "If a hash map gives O(1) lookup, how do you also move an item to 'most recently used' and find the 'least recently used' in O(1)?",
      },
      {
        level: 3,
        text: "Combine a dict from key → node with a doubly linked list for recency order; on get/put splice the node to the most-recent end, and evict from the least-recent end when over capacity.",
      },
    ],
    followups: [
      "Implement LFU (least frequently used) with O(1) operations",
      "Make the cache thread-safe",
      "Add TTL / expiration on entries",
      "How would you persist LRU state across process restarts?",
      "Compare to using only OrderedDict — what are you trading?",
    ],
    rubricNotes: [
      "Strong: justifies map+DLL (or OrderedDict with clear invariants), correct eviction and recency on get/put, clean O(1) reasoning",
      "Hire: mostly correct structure with small pointer bugs they fix under probing",
      "Lean no: cannot achieve O(1) eviction or forgets recency updates",
      "Critical signal: can they explain why a single dict or single list is insufficient?",
      "Complexity: O(1) average per get/put, O(capacity) space",
    ],
    starterCode:
      "class LRUCache:\n    def __init__(self, capacity: int):\n        pass\n\n    def get(self, key: int) -> int:\n        pass\n\n    def put(self, key: int, value: int) -> None:\n        pass\n",
    expectedComplexity: { time: "O(1) avg per op", space: "O(capacity)" },
  },
  {
    id: "course-schedule",
    title: "Course Schedule",
    company: "Google",
    difficulty: "Medium",
    expectedTimeMinutes: 30,
    statement:
      "There are a total of numCourses courses labeled from 0 to numCourses - 1. You are given an array prerequisites where prerequisites[i] = [a_i, b_i] indicates you must take course b_i first if you want to take course a_i. Return true if you can finish all courses.",
    constraints: ["1 ≤ numCourses ≤ 2000", "0 ≤ prerequisites.length ≤ 5000"],
    clarifications: ["Detect cycles in the prerequisite graph."],
    expectedApproaches: [
      "Model as directed graph; topological sort (Kahn BFS or DFS cycle detect)",
    ],
    solutions: ["Topological sort (Kahn / DFS)"],
    commonMistakes: ["Wrong edge direction", "Missing cycle detection"],
    edgeCases: ["No prerequisites", "Self-loop", "Disjoint components"],
    hintLadder: [
      { level: 1, text: "How can you model prerequisites as a graph?" },
      { level: 2, text: "What graph property prevents finishing all courses?" },
      { level: 3, text: "Detect a cycle via DFS colors or Kahn's algorithm." },
    ],
    followups: ["Return one valid ordering if possible."],
    rubricNotes: ["Graph modeling + cycle reasoning"],
    starterCode: pythonStarter(
      "can_finish(num_courses: int, prerequisites: list[list[int]]) -> bool",
    ),
    expectedComplexity: { time: "O(V + E)", space: "O(V + E)" },
  },
  {
    id: "word-ladder",
    title: "Word Ladder",
    company: "Google",
    difficulty: "Hard",
    expectedTimeMinutes: 40,
    statement:
      "Given two words, beginWord and endWord, and a dictionary wordList, return the number of words in the shortest transformation sequence from beginWord to endWord, or 0 if no such sequence exists. Each transformed word must exist in the word list, and only one letter can be changed at a time.",
    constraints: ["1 ≤ wordList.length ≤ 5000", "All words same length"],
    clarifications: ["beginWord may not be in wordList.", "endWord must be reachable."],
    expectedApproaches: [
      "BFS on the implicit word graph (optionally bidirectional)",
    ],
    solutions: ["BFS on implicit word graph"],
    commonMistakes: ["DFS leading to non-shortest paths", "Inefficient neighbor generation"],
    edgeCases: ["beginWord == endWord", "endWord missing from list"],
    hintLadder: [
      { level: 1, text: "Shortest sequence suggests which traversal?" },
      { level: 2, text: "How do you efficiently generate one-edit neighbors?" },
      { level: 3, text: "BFS; wildcard pattern map for neighbors." },
    ],
    followups: ["Return all shortest transformation sequences."],
    rubricNotes: ["BFS justification over DFS"],
    starterCode: pythonStarter(
      "ladder_length(begin_word: str, end_word: str, word_list: list[str]) -> int",
    ),
    expectedComplexity: { time: "O(M²·N)", space: "O(M²·N)" },
  },
  {
    id: "serialize-binary-tree",
    title: "Serialize and Deserialize Binary Tree",
    company: "Google",
    difficulty: "Hard",
    expectedTimeMinutes: 40,
    statement:
      "Design an algorithm to serialize and deserialize a binary tree. There is no restriction on how your serialization works as long as a tree can be serialized to a string and deserialized to the same tree structure.",
    constraints: ["Number of nodes in [0, 10^4]", "Node values in [-1000, 1000]"],
    clarifications: ["Null children must be representable."],
    expectedApproaches: [
      "Preorder with null markers, or level-order with nulls",
    ],
    solutions: ["Preorder with null markers", "Level-order with nulls"],
    commonMistakes: ["Losing null positions", "Ambiguous delimiters"],
    edgeCases: ["Empty tree", "Skewed tree"],
    hintLadder: [
      { level: 1, text: "Which traversal preserves enough structure with null markers?" },
      { level: 2, text: "How will you tokenize the string on the way back?" },
      { level: 3, text: "Preorder serialize with '#' for nulls; recurse to rebuild." },
    ],
    followups: ["Optimize for sparse trees."],
    rubricNotes: ["Encoding clarity and round-trip correctness"],
    starterCode:
      "class Codec:\n    def serialize(self, root) -> str:\n        pass\n\n    def deserialize(self, data: str):\n        pass\n",
    expectedComplexity: { time: "O(n)", space: "O(n)" },
  },
  {
    id: "median-two-sorted",
    title: "Median of Two Sorted Arrays",
    company: "Google",
    difficulty: "Hard",
    expectedTimeMinutes: 40,
    statement:
      "Given two sorted arrays nums1 and nums2 of size m and n respectively, return the median of the two sorted arrays. The overall run time complexity should be O(log (m+n)).",
    constraints: ["nums1.length == m", "nums2.length == n", "0 ≤ m, n ≤ 1000", "1 ≤ m + n ≤ 2000"],
    clarifications: ["Arrays are already sorted ascending."],
    expectedApproaches: [
      "Binary search on partition of the smaller array",
    ],
    solutions: ["Binary search on partition"],
    commonMistakes: ["Merging into O(m+n)", "Off-by-one on partitions"],
    edgeCases: ["One array empty", "All of one array on one side of partition"],
    hintLadder: [
      { level: 1, text: "Why is a linear merge not enough here?" },
      { level: 2, text: "How can binary search find a correct partition?" },
      { level: 3, text: "Binary search the cut in the smaller array so left/right halves satisfy order." },
    ],
    followups: ["Find the k-th element instead of the median."],
    rubricNotes: ["Whether candidate reaches log-time insight"],
    starterCode: pythonStarter(
      "find_median_sorted_arrays(nums1: list[int], nums2: list[int]) -> float",
    ),
    expectedComplexity: { time: "O(log(m+n))", space: "O(1)" },
  },
  {
    id: "trapping-rain-water",
    title: "Trapping Rain Water",
    company: "Google",
    difficulty: "Hard",
    expectedTimeMinutes: 35,
    statement:
      "Given n non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.",
    constraints: ["n == height.length", "1 ≤ n ≤ 2·10^4", "0 ≤ height[i] ≤ 10^5"],
    clarifications: ["Water trapped above index i is limited by min(leftMax, rightMax) - height[i]."],
    expectedApproaches: [
      "Two pointers with leftMax/rightMax, or prefix/suffix max arrays",
    ],
    solutions: ["Two pointers", "Prefix/suffix max arrays"],
    commonMistakes: ["Double-counting", "Using local neighbors only"],
    edgeCases: ["Strictly increasing", "Flat elevations", "Single peak"],
    hintLadder: [
      { level: 1, text: "For each index, what bounds how much water can sit there?" },
      { level: 2, text: "Do you need both left and right maxima?" },
      { level: 3, text: "Two pointers maintaining leftMax/rightMax in O(n) time." },
    ],
    followups: ["2D trapping rain water."],
    rubricNotes: ["Invariant explanation for two pointers"],
    starterCode: pythonStarter("trap(height: list[int]) -> int"),
    expectedComplexity: { time: "O(n)", space: "O(1)" },
  },
];

export function getQuestionById(id: string): Question | undefined {
  return questions.find((q) => q.id === id);
}

export function getQuestionsByCompany(company: string): Question[] {
  return questions.filter(
    (q) => q.company.toLowerCase() === company.toLowerCase(),
  );
}

/**
 * Pick any question from the company's bank (uniform random).
 * Accepts company display name or id (case-insensitive match on `Question.company`).
 */
export function pickRandomQuestionForCompany(
  companyIdOrName: string,
): Question | undefined {
  const pool = getQuestionsByCompany(companyIdOrName);
  if (pool.length === 0) return undefined;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

export function pickRandomQuestionId(
  companyIdOrName: string,
): string | undefined {
  return pickRandomQuestionForCompany(companyIdOrName)?.id;
}
