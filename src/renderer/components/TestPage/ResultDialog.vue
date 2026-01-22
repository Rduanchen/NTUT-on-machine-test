<template>
  <v-dialog v-model="dialogModel" scrollable max-width="900">
    <v-card v-if="item" rounded="lg" class="d-flex flex-column" style="max-height: 85vh">
      <v-card-title class="d-flex align-center py-3 px-4 border-b bg-surface">
        <span class="text-h6 font-weight-bold">{{ item.name }}</span>
        <v-spacer />
        <v-btn icon variant="text" @click="close"><v-icon>mdi-close</v-icon></v-btn>
      </v-card-title>
      <v-card-text class="pa-0 bg-background overflow-hidden d-flex flex-column">
        <div class="pa-4 overflow-y-auto custom-scrollbar">
          <ResultTableCard v-if="resultForItem" :result="resultForItem" />
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
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ResultTableCard from './TestCaseResult.vue';

const props = defineProps<{
  modelValue: boolean;
  item: any | null;
  testResult: Record<string, any>;
}>();
const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();
const resultForItem = computed(() =>
  props.item ? props.testResult[String(props.item.id)] : null
);
const dialogModel = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const close = () => emit('update:modelValue', false);
</script>