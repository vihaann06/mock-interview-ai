/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with `npm run questions:prep`.
 *
 * Maps question id → committed dossier JSON. Static imports (rather than fs)
 * so dossiers bundle cleanly and work in any runtime.
 */
import type { QuestionDossier } from "@/lib/questions/dossier";

import courseScheduleDossier from "./course-schedule.json";
import lruCacheDossier from "./lru-cache.json";
import medianTwoSortedDossier from "./median-two-sorted.json";
import mergeIntervalsDossier from "./merge-intervals.json";
import numberOfIslandsDossier from "./number-of-islands.json";
import serializeBinaryTreeDossier from "./serialize-binary-tree.json";
import trappingRainWaterDossier from "./trapping-rain-water.json";
import twoSumDossier from "./two-sum.json";
import validParenthesesDossier from "./valid-parentheses.json";
import wordLadderDossier from "./word-ladder.json";

export const dossiers: Record<string, QuestionDossier> = {
  "course-schedule": courseScheduleDossier as QuestionDossier,
  "lru-cache": lruCacheDossier as QuestionDossier,
  "median-two-sorted": medianTwoSortedDossier as QuestionDossier,
  "merge-intervals": mergeIntervalsDossier as QuestionDossier,
  "number-of-islands": numberOfIslandsDossier as QuestionDossier,
  "serialize-binary-tree": serializeBinaryTreeDossier as QuestionDossier,
  "trapping-rain-water": trappingRainWaterDossier as QuestionDossier,
  "two-sum": twoSumDossier as QuestionDossier,
  "valid-parentheses": validParenthesesDossier as QuestionDossier,
  "word-ladder": wordLadderDossier as QuestionDossier,
};
