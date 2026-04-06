<template>
  <v-progress-circular
    :model-value="numericRate"
    :color="rate?.color"
    size="32"
    width="3"
    class="mr-2 cursor-pointer hover-scale"
    bg-color="grey-lighten-2"
    @click.stop="$emit('open')"
  >
    <span class="text-caption font-weight-bold" style="font-size: 10px">{{ numericRate }}</span>
  </v-progress-circular>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { StatusInfo } from '../../constants/puzzle';

const props = defineProps<{ rate?: StatusInfo; result?: any }>();
defineEmits(['open']);

const numericRate = computed(() => {
  // Pass rate is subtask-based: a subtask passes only if all its cases are AC.
  const subtasks = props.result?.subtasks;
  if (!Array.isArray(subtasks) || subtasks.length === 0) return 0;

  const totalSubtasks = subtasks.length;
  const passedSubtasks = subtasks.reduce((acc: number, subtaskCases: any) => {
    if (!Array.isArray(subtaskCases) || subtaskCases.length === 0) return acc;
    return subtaskCases.every((c: any) => c?.statusCode === 'AC') ? acc + 1 : acc;
  }, 0);

  return Math.round((passedSubtasks / totalSubtasks) * 100);
});
</script>

<style scoped>
.hover-scale {
  transition: transform 0.2s;
}
.hover-scale:hover {
  transform: scale(1.1);
}
.cursor-pointer {
  cursor: pointer;
}
</style>
