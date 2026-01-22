<template>
  <v-dialog v-model="values" max-width="500">
    <v-card rounded="lg" v-if="puzzle">
      <v-card-title class="px-4 pt-4 pb-2 text-h6 font-weight-bold">
        {{ t('examSystem.puzzles.upload.title', { name: puzzle.name }) }}
      </v-card-title>
      <v-card-text class="px-4 py-2">
        <p class="text-body-2 text-medium-emphasis mb-4">
          {{ t('examSystem.puzzles.upload.description') }}
        </p>
        <VFileUpload
          v-model="selectedFile"
          :multiple="false"
          density="default"
          variant="outlined"
          prepend-icon="mdi-file-code-outline"
          :label="t('examSystem.puzzles.upload.label')"
          clearable
          show-size
          accept=".py"
        />
      </v-card-text>
      <v-card-actions class="px-4 pb-4 pt-2">
        <v-spacer />
        <v-btn variant="text" @click="cancel">{{ t('examSystem.common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          :disabled="!selectedFile"
          @click="submit"
        >
          {{ t('examSystem.puzzles.upload.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { VFileUpload } from 'vuetify/labs/VFileUpload';

const props = defineProps<{ modelValue: boolean; puzzle: any | null }>();
const emit = defineEmits(['update:modelValue', 'submit']);
const { t } = useI18n();

const values = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const selectedFile = ref<File | undefined>();

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
        selectedFile.value = undefined;
    }
  }
);

const submit = () => {
  if (selectedFile.value && props.puzzle) {
    emit('submit', { file: selectedFile.value, puzzleId: props.puzzle.id });
    emit('update:modelValue', false);
    selectedFile.value = undefined;
  }
};

const cancel = () => {
  emit('update:modelValue', false);
  selectedFile.value = undefined;
};
</script>