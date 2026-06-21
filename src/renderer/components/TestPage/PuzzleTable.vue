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
            <td colspan="7" class="py-2">
              <div class="d-flex align-center w-100">
                <v-icon start size="small" class="text-primary mr-2">mdi-folder-outline</v-icon>
                <span class="font-weight-bold text-primary text-subtitle-1">{{
                  group[0].sectionTitle || sectionId || t('examSystem.puzzles.defaultSection')
                }}</span>
                <v-spacer></v-spacer>
                <div v-if="group[0].sectionMaxScore" class="mr-4 text-caption text-grey-darken-1">
                  {{ t('examSystem.puzzles.maxScoreLabel') }} {{ group[0].sectionMaxScore }}
                </div>
                <div class="font-weight-bold ml-4">
                  Current:
                  <span class="text-primary">{{ calculateSectionScore(group, false) }}</span>
                </div>
                <div class="font-weight-bold ml-4">
                  Highest:
                  <span class="text-success">{{ calculateSectionScore(group, true) }}</span>
                </div>
              </div>
              <div
                v-if="group[0].sectionDescription"
                class="mt-1 ml-6 text-caption text-grey-darken-1"
              >
                {{ group[0].sectionDescription }}
              </div>
            </td>
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
            :current-score="calculatePuzzleScore(item, false)"
            :highest-score="calculatePuzzleScore(item, true)"
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
          <td class="text-center">{{ totalCurrentScore }}</td>
          <td class="text-center">{{ totalHighestScore }}</td>
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
      if (!Array.isArray(subtaskCases) || subtaskCases.length === 0) return acc;
      return subtaskCases.every((c: any) => c?.statusCode === 'AC') ? acc + 1 : acc;
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
  let baseScore = 0;

  if (result && puzzle.subtasks && puzzle.subtasks.length > 0) {
    for (let i = 0; i < puzzle.subtasks.length; i++) {
      const subtaskResult = result.subtasks[i];
      const subtaskConfig = puzzle.subtasks[i];

      if (subtaskResult && Array.isArray(subtaskResult) && subtaskResult.length > 0) {
        if (subtaskResult.every((c: any) => c?.statusCode === 'AC')) {
          baseScore += subtaskConfig.score || 0;
        }
      }
    }
  } else {
    const passRatesSource = useHighest ? highestPuzzlePassRates.value : props.puzzlePassRates;
    const passRateInfo = passRatesSource[String(puzzle.id)];
    if (passRateInfo && passRateInfo.text !== 'N/A') {
      const rate = parseInt(passRateInfo.text.replace('%', ''), 10);
      if (!isNaN(rate)) {
        baseScore = Number(((puzzle.score || 0) * (rate / 100)).toFixed(1));
      }
    }
  }

  // Apply multiplier if special rules failed
  let multiplier = 1.0;
  const srrSource = useHighest ? props.highestSpecialRuleResults : props.specialRuleResults;
  const srr = srrSource?.[String(puzzle.id)];
  const esr = props.effectiveSpecialRules?.[String(puzzle.id)];

  if (srr && esr) {
    for (const res of srr) {
      if (!res.passed) {
        const rule = esr.find((r) => r.id === res.ruleId);
        if (rule && rule.multiplier !== undefined) {
          multiplier *= rule.multiplier;
        }
      }
    }
  }

  return Math.floor(baseScore * multiplier);
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
