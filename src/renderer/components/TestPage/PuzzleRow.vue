<template>
  <tr class="transition-colors puzzle-row" @click="$emit('open-result')">
    <td class="font-weight-bold text-medium-emphasis">#{{ item.id }}</td>
    <td class="py-3">
      <span class="text-body-1 font-weight-medium text-high-emphasis">{{ item.name }}</span>
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
      <ResultTrigger :rate="passRate" :result="result" />
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
import ResultTrigger from './ResultTrigger.vue';
import type { Puzzle, StatusInfo } from '../../constants/puzzle';

defineProps<{
  item: Puzzle;
  status?: StatusInfo;
  passRate?: StatusInfo;
  result?: any;
  loading?: boolean;
}>();
defineEmits(['open-result', 'upload']);
const { t } = useI18n();
</script>

<style scoped>
.puzzle-row {
  cursor: pointer;
}
</style>