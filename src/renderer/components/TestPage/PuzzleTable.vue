<template>
  <v-card-text class="pa-0 flex-grow-1 overflow-auto">
    <v-table density="comfortable" hover fixed-header class="h-100 text-body-2">
      <thead>
        <tr>
          <th style="width: 80px">{{ t('examSystem.puzzles.headers.id') }}</th>
          <th>{{ t('examSystem.puzzles.headers.name') }}</th>
          <th style="width: 100px">{{ t('examSystem.puzzles.headers.language') }}</th>
          <th style="width: 140px">{{ t('examSystem.puzzles.headers.status') }}</th>
          <th style="width: 120px">Current Rate / Score</th>
          <th style="width: 120px">Highest Rate / Score</th>
          <th style="width: 120px">{{ t('examSystem.puzzles.headers.upload') }}</th>
        </tr>
      </thead>
      <template v-for="(group, sectionId) in groupedPuzzles" :key="sectionId">
        <tbody>
          <tr :class="isDark ? 'bg-grey-darken-3' : 'bg-grey-lighten-4'">
            <td colspan="4" class="py-2">
              <div class="d-flex align-center ga-3">
                <v-icon start size="small" class="text-primary mr-2">mdi-folder-outline</v-icon>
                <span class="font-weight-bold text-primary text-subtitle-1">{{
                  group[0].sectionTitle || sectionId || t('examSystem.puzzles.defaultSection')
                }}</span>
                <v-chip
                  v-if="group[0].sectionMaxScore != null"
                  size="small"
                  color="secondary"
                  variant="tonal"
                  class="font-weight-bold"
                >
                  {{ t('examSystem.puzzles.maxScoreLabel') }}
                  {{ formatScore(group[0].sectionMaxScore) }}
                </v-chip>
              </div>
              <div
                v-if="group[0].sectionDescription"
                class="mt-1 ml-6 text-caption text-grey-darken-1"
              >
                {{ group[0].sectionDescription }}
              </div>
            </td>
            <td>
              <v-chip size="small" color="primary" variant="tonal" class="font-weight-bold">
                Current: {{ formatScore(calculateSectionScore(group, false)) }}/{{
                  formatScore(calculateSectionMaxScore(group))
                }}
              </v-chip>
            </td>
            <td>
              <v-chip size="small" color="success" variant="tonal" class="font-weight-bold">
                Highest: {{ formatScore(calculateSectionScore(group, true)) }}/{{
                  formatScore(calculateSectionMaxScore(group))
                }}
              </v-chip>
            </td>
            <td></td>
          </tr>
          <!-- Puzzle Rows -->
          <PuzzleRow
            v-for="item in group"
            :key="item.id"
            :item="item"
            :status="puzzleStatuses[String(item.id)]"
            :pass-rate="puzzlePassRates[String(item.id)]"
            :highest-pass-rate="highestPuzzlePassRates[String(item.id)]"
            :result="testResult[String(item.id)]"
            :highest-result="highestTestResult?.[String(item.id)]"
            :effective-special-rules="effectiveSpecialRules?.[String(item.id)]"
            :special-rule-results="specialRuleResults?.[String(item.id)]"
            :highest-special-rule-results="highestSpecialRuleResults?.[String(item.id)]"
            :loading="onSent[String(item.id)]"
            :current-score="formatScore(calculatePuzzleScore(item, false))"
            :highest-score="formatScore(calculatePuzzleScore(item, true))"
            @open-result="$emit('open-result', item)"
            @upload="$emit('upload', item)"
          />
        </tbody>
      </template>
      <!-- Total Score Footer -->
      <tfoot>
        <tr class="bg-primary text-white font-weight-bold">
          <td colspan="4" class="text-right">
            {{ t('examSystem.puzzles.totalEstimatedScoreLabel') }}
          </td>
          <td class="text-center">{{ formatScore(totalCurrentScore) }}</td>
          <td class="text-center">{{ formatScore(totalHighestScore) }}</td>
          <td></td>
        </tr>
      </tfoot>
    </v-table>
  </v-card-text>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTheme } from 'vuetify';
import PuzzleRow from './PuzzleRow.vue';
import type { PuzzleInfo } from '../../../common/types';
import type { SpecialRule, SpecialRuleResultRecord } from '../../../common/types';
import {
  calculatePuzzleScore as scorePuzzle,
  formatScore,
  isPassedSubtask
} from '../../../common/exam-score';

const props = defineProps<{
  puzzles: PuzzleInfo[];
  puzzleStatuses: Record<string, any>;
  puzzlePassRates: Record<string, any>;
  testResult: Record<string, any>;
  highestTestResult?: Record<string, any>;
  onSent: Record<string, boolean>;
  effectiveSpecialRules?: Record<string, SpecialRule[]>;
  specialRuleResults?: Record<string, SpecialRuleResultRecord[]>;
  highestSpecialRuleResults?: Record<string, SpecialRuleResultRecord[]>;
}>();
defineEmits(['open-result', 'upload']);
const { t } = useI18n();
const theme = useTheme();
const isDark = computed(() => theme.global.current.value.dark);

const groupedPuzzles = computed(() => {
  const groups: Record<string, PuzzleInfo[]> = {};
  for (const p of props.puzzles) {
    const section = p.sectionId || 'default';
    if (!groups[section]) groups[section] = [];
    groups[section].push(p);
  }
  return groups;
});

const highestPuzzlePassRates = computed<Record<string, { text: string; color: string }>>(() => {
  const rates: Record<string, { text: string; color: string }> = {};
  for (const puzzle of props.puzzles) {
    const id = String(puzzle.id);
    const result = props.highestTestResult?.[id];
    if (!result || !Array.isArray(result.subtasks) || result.subtasks.length === 0) {
      rates[id] = { text: 'N/A', color: 'grey-lighten-1' };
      continue;
    }

    const totalSubtasks = result.subtasks.length;
    const passedSubtasks = result.subtasks.reduce((acc: number, subtaskCases: any) => {
      return isPassedSubtask(subtaskCases) ? acc + 1 : acc;
    }, 0);

    const rate = Math.round((passedSubtasks / totalSubtasks) * 100);
    let color = 'error';
    if (rate === 100) color = 'success';
    else if (rate > 0) color = 'warning';
    rates[id] = { text: `${rate}%`, color };
  }
  return rates;
});

function calculatePuzzleScore(puzzle: PuzzleInfo, useHighest: boolean = false): number {
  const resultSource = useHighest ? props.highestTestResult : props.testResult;
  const result = resultSource?.[String(puzzle.id)];
  const srrSource = useHighest ? props.highestSpecialRuleResults : props.specialRuleResults;
  const srr = srrSource?.[String(puzzle.id)];
  return scorePuzzle(puzzle, result, srr ?? []);
}

function calculateSectionMaxScore(group: PuzzleInfo[]): number {
  return (
    group[0]?.sectionMaxScore ??
    group.reduce(
      (sum, puzzle) =>
        sum + (puzzle.subtasks ?? []).reduce((points, subtask) => points + (subtask.score ?? 0), 0),
      0
    )
  );
}

function calculateSectionScore(group: PuzzleInfo[], useHighest: boolean = false): number {
  const rawSum = group.reduce((sum, p) => sum + calculatePuzzleScore(p, useHighest), 0);
  const maxScore = group[0]?.sectionMaxScore;
  if (maxScore !== undefined && maxScore !== null && maxScore >= 0) {
    return Math.min(rawSum, maxScore);
  }
  return rawSum;
}

const totalCurrentScore = computed(() => {
  let sum = 0;
  for (const group of Object.values(groupedPuzzles.value)) {
    sum += calculateSectionScore(group, false);
  }
  return sum;
});

const totalHighestScore = computed(() => {
  let sum = 0;
  for (const group of Object.values(groupedPuzzles.value)) {
    sum += calculateSectionScore(group, true);
  }
  return sum;
});
</script>
