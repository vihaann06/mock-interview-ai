import type { Question } from "@/lib/types/question";

const pythonStarter = (fnSignature: string) =>
  `def ${fnSignature}:\n    # Write your solution here\n    pass\n`;

/**
 * Starter bank (~10 Google-style DSA problems).
 * Metadata will be enriched on Day 2 / Day 6.
 */
export const questions: Question[] = [
  {
    id: "two-sum",
    title: "Two Sum",
    company: "Google",
    difficulty: "Easy",
    expectedTimeMinutes: 25,
    statement:
      "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume each input has exactly one solution, and you may not use the same element twice.",
    constraints: [
      "2 ≤ nums.length ≤ 10^4",
      "-10^9 ≤ nums[i] ≤ 10^9",
      "-10^9 ≤ target ≤ 10^9",
      "Exactly one valid answer exists",
    ],
    clarifications: [
      "Can the same index be used twice? No.",
      "Is the array sorted? Not necessarily.",
    ],
    solutions: ["Hash map one-pass O(n) time, O(n) space"],
    commonMistakes: [
      "Returning values instead of indices",
      "Using the same element twice",
    ],
    edgeCases: ["Negatives", "Duplicates that form the target"],
    hintLadder: [
      { level: 1, text: "Think about what information you're repeatedly searching for." },
      { level: 2, text: "Could storing information you've already seen help?" },
      { level: 3, text: "Consider using a hash map to store previously seen values." },
    ],
    followups: [
      "What if the input arrives as a stream?",
      "How would your solution change if you needed all pairs?",
    ],
    rubricNotes: ["Look for hash map intuition vs nested loops"],
    starterCode: pythonStarter("two_sum(nums: list[int], target: int) -> list[int]"),
    expectedComplexity: { time: "O(n)", space: "O(n)" },
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
    solutions: ["Stack matching"],
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
  },
  {
    id: "number-of-islands",
    title: "Number of Islands",
    company: "Google",
    difficulty: "Medium",
    expectedTimeMinutes: 30,
    statement:
      "Given an m x n 2D binary grid which represents a map of '1's (land) and '0's (water), return the number of islands. An island is surrounded by water and formed by connecting adjacent lands horizontally or vertically.",
    constraints: ["1 ≤ m, n ≤ 300", "grid[i][j] is '0' or '1'"],
    clarifications: ["Diagonal connections? No — only 4-directional."],
    solutions: ["DFS/BFS flood fill", "Union-Find"],
    commonMistakes: ["Revisiting cells", "Mutating grid without tracking visited"],
    edgeCases: ["All water", "Single cell island", "Thin corridors"],
    hintLadder: [
      { level: 1, text: "How do you mark an entire connected component once you find land?" },
      { level: 2, text: "What traversal lets you visit every reachable land cell?" },
      { level: 3, text: "DFS or BFS from each unvisited '1', counting starts." },
    ],
    followups: ["What if diagonal adjacency counted?"],
    rubricNotes: ["Graph modeling clarity"],
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
      "Design a data structure that follows the constraints of a Least Recently Used (LRU) cache. Implement get and put in O(1) average time.",
    constraints: ["1 ≤ capacity ≤ 3000", "At most 2·10^5 calls to get and put"],
    clarifications: ["Update refreshes recency.", "Evict least recently used on overflow."],
    solutions: ["Hash map + doubly linked list"],
    commonMistakes: ["Not updating recency on get", "Incorrect eviction order"],
    edgeCases: ["Capacity 1", "Repeated puts of same key"],
    hintLadder: [
      { level: 1, text: "Which operations must be O(1), and what that implies for structure choice?" },
      { level: 2, text: "How do you combine fast lookup with ordered recency?" },
      { level: 3, text: "Use a dict to nodes plus a doubly linked list for order." },
    ],
    followups: ["Support O(1) LFU instead."],
    rubricNotes: ["Data structure justification is critical"],
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
