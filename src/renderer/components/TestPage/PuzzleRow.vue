<template>
  <tr class="transition-colors puzzle-row" @click="$emit('open-result')">
    <td class="font-weight-bold text-medium-emphasis">#{{ item.id }}</td>
    <td class="py-3">
      <span class="text-body-1 font-weight-medium text-high-emphasis">{{ item.title }}</span>
    </td>
    <td>
      <v-chip size="x-small" label class="font-weight-bold text-uppercase">
        {{ item.language }}
      </v-chip>
    </td>
    <td>
      <v-chip size="small" :color="status?.color" variant="tonal" class="font-weight-bold">
        <v-icon start size="14" v-if="loading">mdi-loading mdi-spin</v-icon>
        {{ t(status?.i18nKey || 'examSystem.puzzles.status.unknown') }}
      </v-chip>
    </td>
    <td>
      <div class="d-flex align-center ga-2">
        <ResultTrigger :rate="passRate" :result="result" />

        <v-chip
          v-if="rulesChip"
          size="x-small"
          variant="tonal"
          :color="rulesChip.color"
          class="font-weight-bold"
          label
        >
          {{ rulesChip.text }}
        </v-chip>
      </div>
    </td>
    <td>
      <v-btn
        color="primary"
        variant="text"
        size="small"
        prepend-icon="mdi-upload"
        @click.stop="$emit('upload')"
      >
        {{ t('examSystem.puzzles.upload.button') }}
      </v-btn>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed } from 'vue';
import ResultTrigger from './ResultTrigger.vue';
import type { Puzzle, StatusInfo } from '../../constants/puzzle';
import type { SpecialRuleResultRecord, SpecialRule } from '../../../common/types';

const props = defineProps<{
  item: Puzzle;
  status?: StatusInfo;
  passRate?: StatusInfo;
  result?: any;
  loading?: boolean;
  effectiveSpecialRules?: SpecialRule[];
  specialRuleResults?: SpecialRuleResultRecord[];
}>();
defineEmits(['open-result', 'upload']);
const { t } = useI18n();

const rulesChip = computed<null | { text: string; color: string }>(() => {
  const effectiveRuleCount = props.effectiveSpecialRules?.length ?? 0;
  if (effectiveRuleCount === 0) {
    return { text: 'Rules N/A', color: 'grey' };
  }

  const results = props.specialRuleResults;
  if (!results || results.length === 0) {
    return { text: `Rules 0/${effectiveRuleCount}`, color: 'grey' };
  }

  const effectiveIds = new Set((props.effectiveSpecialRules ?? []).map((r) => r.id));
  const effectiveResults = results.filter((r) => effectiveIds.has(r.ruleId));
  const passed = effectiveResults.filter((r) => r.passed).length;
  const allPassed = effectiveResults.length === effectiveRuleCount && passed === effectiveRuleCount;
  return {
    text: `Rules ${passed}/${effectiveRuleCount}`,
    color: allPassed ? 'success' : 'error',
  };
});
</script>

<style scoped>
.puzzle-row {
  cursor: pointer;
}
</style>
