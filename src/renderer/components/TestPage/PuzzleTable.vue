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
      <tbody>
        <PuzzleRow
          v-for="item in puzzles"
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
    </v-table>
  </v-card-text>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import PuzzleRow from './PuzzleRow.vue';
import type { Puzzle, StatusInfo } from '../../constants/puzzle';
import type { SpecialRule, SpecialRuleResultRecord } from '../../../common/types';

defineProps<{
  puzzles: Puzzle[];
  puzzleStatuses: Record<string, StatusInfo>;
  puzzlePassRates: Record<string, StatusInfo>;
  testResult: Record<string, any>;
  onSent: Record<string, boolean>;
  effectiveSpecialRules?: Record<string, SpecialRule[]>;
  specialRuleResults?: Record<string, SpecialRuleResultRecord[]>;
}>();
defineEmits(['open-result', 'upload']);
const { t } = useI18n();
</script>