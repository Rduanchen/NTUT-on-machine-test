<template>
  <v-card-text class="pa-0 flex-grow-1 overflow-auto">
    <v-table density="comfortable" hover fixed-header class="h-100 text-body-2">
      <thead>
        <tr>
          <th style="width: 80px">{{ t('examSystem.puzzles.headers.id') }}</th>
          <th>{{ t('examSystem.puzzles.headers.name') }}</th>
          <th style="width: 100px">{{ t('examSystem.puzzles.headers.language') }}</th>
          <th style="width: 140px">{{ t('examSystem.puzzles.headers.status') }}</th>
          <th style="width: 100px">{{ t('examSystem.puzzles.headers.passRate') }}</th>
          <th style="width: 120px">{{ t('examSystem.puzzles.headers.upload') }}</th>
        </tr>
      </thead>
      <template v-for="(group, sectionId) in groupedPuzzles" :key="sectionId">
        <tbody>
          <tr class="bg-grey-lighten-4">
            <td colspan="6" class="py-2">
              <div class="d-flex align-center w-100">
                <v-icon start size="small" class="text-primary mr-2">mdi-folder-outline</v-icon>
                <span class="font-weight-bold text-primary text-subtitle-1">{{ group[0].sectionTitle || sectionId || t('examSystem.puzzles.defaultSection') }}</span>
                <v-spacer></v-spacer>
                <div v-if="group[0].sectionMaxScore" class="mr-4 text-caption text-grey-darken-1">
                  {{ t('examSystem.puzzles.maxScoreLabel') }} {{ group[0].sectionMaxScore }}
                </div>
                <div class="font-weight-bold">
                  {{ t('examSystem.puzzles.estimatedScoreLabel') }} <span class="text-primary">{{ calculateSectionScore(group) }}</span>
                </div>
              </div>
              <div v-if="group[0].sectionDescription" class="mt-1 ml-6 text-caption text-grey-darken-1">
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
            :result="testResult[String(item.id)]"
            :effective-special-rules="effectiveSpecialRules?.[String(item.id)]"
            :special-rule-results="specialRuleResults?.[String(item.id)]"
            :loading="onSent[String(item.id)]"
            @open-result="$emit('open-result', item)"
            @upload="$emit('upload', item)"
          />
        </tbody>
      </template>
      <!-- Total Score Footer -->
      <tfoot>
        <tr class="bg-primary text-white font-weight-bold">
          <td colspan="5" class="text-right">{{ t('examSystem.puzzles.totalEstimatedScoreLabel') }}</td>
          <td class="text-center">{{ totalScore }}</td>
        </tr>
      </tfoot>
    </v-table>
  </v-card-text>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PuzzleRow from './PuzzleRow.vue';
import type { PuzzleInfo } from '../../../common/types';
import type { SpecialRule, SpecialRuleResultRecord } from '../../../common/types';

const props = defineProps<{
  puzzles: PuzzleInfo[];
  puzzleStatuses: Record<string, any>;
  puzzlePassRates: Record<string, any>;
  testResult: Record<string, any>;
  onSent: Record<string, boolean>;
  effectiveSpecialRules?: Record<string, SpecialRule[]>;
  specialRuleResults?: Record<string, SpecialRuleResultRecord[]>;
}>();
defineEmits(['open-result', 'upload']);
const { t } = useI18n();

const groupedPuzzles = computed(() => {
  const groups: Record<string, PuzzleInfo[]> = {};
  for (const p of props.puzzles) {
    const section = p.sectionId || 'default';
    if (!groups[section]) groups[section] = [];
    groups[section].push(p);
  }
  return groups;
});

function calculatePuzzleScore(puzzle: PuzzleInfo): number {
  const result = props.testResult[String(puzzle.id)];
  let baseScore = 0;

  if (result && puzzle.subtasks && puzzle.subtasks.length > 0) {
    for (let i = 0; i < puzzle.subtasks.length; i++) {
      const subtaskResult = result.subtasks[i];
      const subtaskConfig = puzzle.subtasks[i];
      
      if (subtaskResult && Array.isArray(subtaskResult) && subtaskResult.length > 0) {
        if (subtaskResult.every((c: any) => c?.statusCode === 'AC')) {
          baseScore += (subtaskConfig.score || 0);
        }
      }
    }
  } else {
    const passRateInfo = props.puzzlePassRates[String(puzzle.id)];
    if (passRateInfo && passRateInfo.text !== 'N/A') {
      const rate = parseInt(passRateInfo.text.replace('%', ''), 10);
      if (!isNaN(rate)) {
        baseScore = Number(((puzzle.score || 0) * (rate / 100)).toFixed(1));
      }
    }
  }
  
  // Apply multiplier if special rules failed
  let multiplier = 1.0;
  const srr = props.specialRuleResults?.[String(puzzle.id)];
  const esr = props.effectiveSpecialRules?.[String(puzzle.id)];
  
  if (srr && esr) {
    for (const res of srr) {
      if (!res.passed) {
        const rule = esr.find(r => r.id === res.ruleId);
        if (rule && rule.multiplier !== undefined) {
          multiplier *= rule.multiplier;
        }
      }
    }
  }

  return Number((baseScore * multiplier).toFixed(1));
}

function calculateSectionScore(group: PuzzleInfo[]): number {
  return group.reduce((sum, p) => sum + calculatePuzzleScore(p), 0);
}

const totalScore = computed(() => {
  return props.puzzles.reduce((sum, p) => sum + calculatePuzzleScore(p), 0);
});
</script>