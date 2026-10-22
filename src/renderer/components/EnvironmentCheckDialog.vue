<template>
  <v-dialog
    :model-value="modelValue"
    :persistent="isEnvironmentDialogPersistent(report.status)"
    max-width="760"
    scrollable
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card class="environment-card" rounded="xl">
      <div
        class="environment-header pa-6"
        :class="`environment-header--${report.status.toLowerCase()}`"
      >
        <div class="d-flex align-start ga-4">
          <v-avatar :color="presentation.color" variant="tonal" size="52">
            <v-icon size="28">{{ presentation.icon }}</v-icon>
          </v-avatar>
          <div class="flex-grow-1">
            <div class="text-overline font-weight-bold">
              {{ t('examSystem.environmentCheck.eyebrow') }}
            </div>
            <div class="text-h5 font-weight-bold">{{ t('examSystem.environmentCheck.title') }}</div>
            <div class="text-body-2 text-medium-emphasis mt-1">
              {{
                report.status === 'IDLE'
                  ? t('examSystem.environmentCheck.awaitingConfigDetail')
                  : report.message
              }}
            </div>
          </div>
          <v-chip :color="presentation.color" variant="flat" size="small">
            {{ t(presentation.labelKey) }}
          </v-chip>
        </div>
      </div>

      <v-divider />
      <v-card-text class="pa-6">
        <v-alert
          v-if="report.status === 'FAILED'"
          color="warning"
          variant="tonal"
          icon="mdi-alert-outline"
          class="mb-5"
        >
          <div class="font-weight-bold">{{ t('examSystem.environmentCheck.failureWarning') }}</div>
          <div class="text-body-2">{{ t('examSystem.environmentCheck.fixHint') }}</div>
          <div class="text-body-2 mt-2">{{ t('examSystem.environmentCheck.ignoreRisk') }}</div>
        </v-alert>

        <div class="d-flex flex-wrap ga-2 mb-5 text-caption text-medium-emphasis">
          <v-chip size="small" variant="outlined" prepend-icon="mdi-laptop"
            >{{ report.platform }} / {{ report.architecture }}</v-chip
          >
          <v-chip size="small" variant="outlined" prepend-icon="mdi-code-tags">{{
            t('examSystem.environmentCheck.languageCount', {
              count: report.requiredLanguages.length
            })
          }}</v-chip>
        </div>

        <div v-if="report.languageResults.length" class="diagnostic-list">
          <v-expansion-panels variant="accordion" multiple>
            <v-expansion-panel
              v-for="item in report.languageResults"
              :key="item.language"
              elevation="0"
              class="diagnostic-panel mb-2"
            >
              <v-expansion-panel-title>
                <div class="d-flex align-center w-100 pr-3">
                  <span class="language-mark mr-3">{{
                    item.language.slice(0, 2).toUpperCase()
                  }}</span>
                  <span class="font-weight-bold flex-grow-1">{{ item.language }}</span>
                  <v-chip
                    size="x-small"
                    :color="
                      item.status === 'passed'
                        ? 'success'
                        : item.status === 'failed'
                          ? 'error'
                          : 'info'
                    "
                    variant="tonal"
                  >
                    {{ t(`examSystem.environmentCheck.itemStatus.${item.status}`) }}
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <div class="text-caption font-weight-bold text-medium-emphasis mb-2">
                  {{ t('examSystem.environmentCheck.tools') }}
                </div>
                <v-list density="compact" bg-color="transparent" class="pa-0 mb-3">
                  <v-list-item v-for="tool in item.tools" :key="tool.tool" class="px-0">
                    <template #prepend
                      ><v-icon :color="tool.status === 'passed' ? 'success' : 'error'" size="18">{{
                        tool.status === 'passed' ? 'mdi-check-circle' : 'mdi-close-circle'
                      }}</v-icon></template
                    >
                    <v-list-item-title class="font-weight-medium">{{
                      tool.tool
                    }}</v-list-item-title>
                    <v-list-item-subtitle class="text-wrap">{{
                      tool.version || tool.summary
                    }}</v-list-item-subtitle>
                  </v-list-item>
                </v-list>

                <div class="text-caption font-weight-bold text-medium-emphasis mb-2">
                  {{ t('examSystem.environmentCheck.diagnostics') }}
                </div>
                <div class="d-flex flex-column ga-2">
                  <div
                    v-for="check in item.checks"
                    :key="check.kind"
                    class="check-row d-flex align-start ga-3 pa-3 rounded-lg"
                  >
                    <v-icon :color="check.status === 'passed' ? 'success' : 'error'" size="20">{{
                      check.status === 'passed' ? 'mdi-check-decagram' : 'mdi-alert-circle'
                    }}</v-icon>
                    <div class="flex-grow-1">
                      <div class="font-weight-bold text-body-2">
                        {{
                          t(
                            check.kind === 'smoke'
                              ? `examSystem.environmentCheck.check.smoke.${check.status}`
                              : `examSystem.environmentCheck.check.${check.kind}`
                          )
                        }}
                      </div>
                      <div class="text-caption text-medium-emphasis">
                        <span v-if="check.kind !== 'smoke' || check.status !== 'passed'"
                          >{{ check.summary }} · </span
                        >{{ check.durationMs }}ms
                      </div>
                      <div
                        v-if="check.technicalDetails && (check.kind !== 'smoke' || check.status !== 'passed')"
                        class="technical-detail mt-2"
                      >
                        {{ check.technicalDetails }}
                      </div>
                    </div>
                  </div>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>
        <v-empty-state v-else :icon="emptyState.icon" :title="t(emptyState.titleKey)" />
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-4 px-6">
        <v-btn
          v-if="report.status === 'FAILED'"
          color="warning"
          variant="outlined"
          prepend-icon="mdi-alert-circle-check-outline"
          @click="$emit('ignore')"
        >
          {{ t('examSystem.environmentCheck.ignoreAndContinue') }}
        </v-btn>
        <v-btn
          v-if="report.status !== 'FAILED'"
          variant="text"
          @click="$emit('update:modelValue', false)"
          >{{ t('examSystem.common.close') }}</v-btn
        >
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-refresh"
          :loading="report.status === 'RUNNING'"
          :disabled="report.status === 'RUNNING'"
          @click="$emit('retry')"
        >
          {{ t('examSystem.environmentCheck.retry') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { EnvironmentCheckReport } from '../../common/types';
import {
  getEnvironmentEmptyState,
  getEnvironmentPresentation,
  isEnvironmentDialogPersistent
} from './environment-check.presentation';

const props = defineProps<{ modelValue: boolean; report: EnvironmentCheckReport }>();
defineEmits<{ 'update:modelValue': [value: boolean]; retry: []; ignore: [] }>();
const { t } = useI18n();
const presentation = computed(() => getEnvironmentPresentation(props.report.status));
const emptyState = computed(() => getEnvironmentEmptyState(props.report.status));
</script>

<style scoped>
.environment-card {
  border: 1px solid rgba(var(--v-border-color), 0.16);
}
.environment-header {
  border-left: 5px solid rgb(var(--v-theme-grey));
}
.environment-header--running {
  border-left-color: rgb(var(--v-theme-info));
}
.environment-header--passed {
  border-left-color: rgb(var(--v-theme-success));
}
.environment-header--failed {
  border-left-color: rgb(var(--v-theme-error));
}
.diagnostic-panel {
  border: 1px solid rgba(var(--v-border-color), 0.14);
}
.language-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font: 700 11px/1 monospace;
  letter-spacing: 0.04em;
}
.check-row {
  background: rgba(var(--v-border-color), 0.06);
}
.technical-detail {
  max-height: 110px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.08);
  font: 11px/1.45 monospace;
}
</style>
