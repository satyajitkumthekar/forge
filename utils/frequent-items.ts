/**
 * Frequent Items Algorithm
 * ABSTRACTION: Find most frequently logged foods with smart grouping
 */

import type { FoodEntry, FrequentItem } from '../types';

const COMMON_WORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'with',
  'and',
  'or',
  'in',
  'on',
  'at',
  'to',
  'for',
]);

const getWords = (text: string): Set<string> => {
  return new Set(
    text
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => !COMMON_WORDS.has(word) && word.length > 2),
  );
};

const calculateSimilarity = (name1: string, name2: string): number => {
  const words1 = getWords(name1);
  const words2 = getWords(name2);

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
};

const areNutritionallySimilar = (entry1: FoodEntry, entry2: FoodEntry): boolean => {
  const caloriesDiff =
    Math.abs(entry1.calories - entry2.calories) / Math.max(entry1.calories, entry2.calories);
  const proteinDiff = Math.abs(entry1.protein - entry2.protein) / Math.max(entry1.protein, 1);

  return caloriesDiff < 0.15 && proteinDiff < 0.15;
};

export const getFrequentItems = (
  allData: Record<string, FoodEntry[]>,
  minOccurrences: number = 2,
  maxItems: number = 8,
  similarityThreshold: number = 0.6,
): FrequentItem[] => {
  const allEntries: FoodEntry[] = Object.values(allData).flat();

  if (allEntries.length === 0) return [];

  // Group similar items
  const groups: FoodEntry[][] = [];

  for (const entry of allEntries) {
    let addedToGroup = false;

    for (const group of groups) {
      const representative = group[0];

      if (
        calculateSimilarity(entry.name, representative.name) >= similarityThreshold &&
        areNutritionallySimilar(entry, representative)
      ) {
        group.push(entry);
        addedToGroup = true;
        break;
      }
    }

    if (!addedToGroup) {
      groups.push([entry]);
    }
  }

  // Filter groups by minimum occurrences
  const frequentGroups = groups
    .filter((group) => group.length >= minOccurrences)
    .map((group) => {
      const representative = group[0];
      const avgCalories = Math.round(group.reduce((sum, e) => sum + e.calories, 0) / group.length);
      const avgProtein = Math.round(group.reduce((sum, e) => sum + e.protein, 0) / group.length);

      return {
        name: representative.name,
        calories: avgCalories,
        protein: avgProtein,
        image_data: representative.image_data,
        description: representative.description,
        count: group.length,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, maxItems);

  return frequentGroups;
};
