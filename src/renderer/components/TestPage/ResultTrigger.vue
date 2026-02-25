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
  if (!props.result || !props.result.totalCases) return 0;
  return Math.round((props.result.correctCount / props.result.totalCases) * 100);
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
