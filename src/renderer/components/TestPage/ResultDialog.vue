<template>
  <v-dialog v-model="dialogModel" scrollable max-width="900">
    <v-card v-if="item" rounded="lg" class="d-flex flex-column" style="max-height: 85vh">
      <v-card-title class="d-flex align-center py-3 px-4 border-b bg-surface">
        <span class="text-h6 font-weight-bold">{{ item.title }}</span>
        <v-spacer />
        <v-btn icon variant="text" @click="close"><v-icon>mdi-close</v-icon></v-btn>
      </v-card-title>
      
      <div class="px-4 py-3 border-b bg-surface d-flex justify-center">
        <v-btn-toggle
          v-model="selectedVersion"
          mandatory
          color="primary"
          density="compact"
          variant="outlined"
          divided
        >
          <v-btn value="current" min-width="120">{{ t('examSystem.puzzles.finisheTheExam.versionCurrentShort') || 'Current' }}</v-btn>
          <v-btn value="highest" min-width="120">{{ t('examSystem.puzzles.finisheTheExam.versionHighestShort') || 'Highest' }}</v-btn>
        </v-btn-toggle>
      </div>
      <v-card-text class="pa-0 bg-background overflow-hidden d-flex flex-column">
        <div class="pa-4 overflow-y-auto custom-scrollbar">
          <ResultTableCard
            v-if="resultForItem"
            :puzzle-id="String(item?.id)"
            :result="resultForItem"
            :effective-special-rules="effectiveSpecialRulesForItem"
            :special-rule-results="specialRuleResultsForItem"
          />
          <div v-else class="text-center py-8 text-medium-emphasis">
            <v-icon size="48" class="mb-2 opacity-50">mdi-clipboard-text-outline</v-icon>
            <div>{{ t('examSystem.judge.noResult') }}</div>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ResultTableCard from './TestCaseResult.vue';

import type { Puzzle } from '../../constants/puzzle';
import type { SpecialRule, SpecialRuleResultRecord } from '../../../common/types';

const props = defineProps<{
  modelValue: boolean;
  item: Puzzle | null;
  testResult: Record<string, any>;
  highestTestResult?: Record<string, any>;
  effectiveSpecialRules?: Record<string, SpecialRule[]>;
  specialRuleResults?: Record<string, SpecialRuleResultRecord[]>;
  highestSpecialRuleResults?: Record<string, SpecialRuleResultRecord[]>;
}>();
const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();
const selectedVersion = ref<'current' | 'highest'>('current');

watch(() => props.item, () => {
  selectedVersion.value = 'current';
});

const resultForItem = computed(() => {
  if (!props.item) return null;
  const id = String(props.item.id);
  if (selectedVersion.value === 'highest' && props.highestTestResult) {
    return props.highestTestResult[id];
  }
  return props.testResult[id];
});

const effectiveSpecialRulesForItem = computed(() =>
  props.item ? props.effectiveSpecialRules?.[String(props.item.id)] ?? [] : [],
);

const specialRuleResultsForItem = computed(() => {
  if (!props.item) return [];
  const id = String(props.item.id);
  if (selectedVersion.value === 'highest' && props.highestSpecialRuleResults) {
    return props.highestSpecialRuleResults[id] ?? [];
  }
  return props.specialRuleResults?.[id] ?? [];
});
const dialogModel = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const close = () => emit('update:modelValue', false);
</script>
