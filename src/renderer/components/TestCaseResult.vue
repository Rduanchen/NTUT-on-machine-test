<template>
  <div class="result-container w-100">
    <!-- Summary Card -->
    <v-card variant="flat" class="mb-4 bg-primary-lighten-5 border border-primary-lighten-4">
      <v-card-text class="d-flex align-center py-3">
        <v-icon color="primary" class="mr-2">mdi-chart-box-outline</v-icon>
        <span class="text-subtitle-2 font-weight-bold text-primary-darken-1">
          {{ t('examSystem.judge.summaryTitle') }}
        </span>
        <v-spacer />
        <div class="d-flex align-center">
           <span class="text-caption text-medium-emphasis mr-2">Passed:</span>
           <span class="text-h6 font-weight-bold text-primary">
             {{ result?.correctCount ?? 0 }}
           </span>
           <span class="text-body-2 text-medium-emphasis mx-1">/</span>
           <span class="text-body-2 text-medium-emphasis">
             {{ result?.testCaseAmount ?? 0 }}
           </span>
        </div>
      </v-card-text>
    </v-card>

    <!-- Groups -->
    <template v-if="hasResult">
      <div v-for="group in safeGroupResults" :key="group.id" class="mb-6">
        <div class="d-flex align-center mb-2">
          <v-chip size="small" color="secondary" variant="flat" class="mr-2 font-weight-bold">
             Group {{ group.id }}
          </v-chip>
          <span class="text-subtitle-2 font-weight-bold">{{ group.title }}</span>
          <v-spacer />
          <v-progress-linear
             :model-value="(group.correctCount / group.testCaseAmount) * 100"
             color="success"
             height="6"
             rounded
             style="width: 100px"
          ></v-progress-linear>
          <span class="ml-2 text-caption text-medium-emphasis" style="width: 40px; text-align: right;">
            {{ group.correctCount }}/{{ group.testCaseAmount }}
          </span>
        </div>

        <v-card variant="outlined" class="overflow-hidden rounded-lg border-opacity-50">
           <v-table density="compact" class="result-table">
             <thead>
               <tr>
                 <th class="text-left bg-surface-light" style="width: 60px">#</th>
                 <th class="text-left bg-surface-light" style="width: 100px">Status</th>
                 <th class="text-left bg-surface-light">Output</th>
               </tr>
             </thead>
             <tbody>
               <tr v-for="item in group.testCasesResults" :key="item.id">
                 <td class="text-caption text-medium-emphasis">{{ item.id }}</td>
                 <td>
                   <v-chip
                     :color="item.correct ? 'success' : 'error'"
                     size="x-small"
                     variant="flat"
                     class="font-weight-bold"
                   >
                     {{ item.correct ? 'PASS' : 'FAIL' }}
                   </v-chip>
                 </td>
                 <td class="py-2">
                   <div class="code-block rounded pa-2 text-caption font-mono">
                     {{ item.userOutput || t('examSystem.judge.hiddenOutput') }}
                   </div>
                 </td>
               </tr>
             </tbody>
           </v-table>
        </v-card>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// Types... (Same as before)
type TestCaseResult = { id: string | number; correct: boolean; userOutput?: string; };
type GroupResult = { id: string | number; title: string; correctCount: number; testCaseAmount: number; testCasesResults: TestCaseResult[]; };
type JudgeResult = { correctCount: number; testCaseAmount: number; groupResults: GroupResult[]; };

const props = defineProps<{
  result: Partial<JudgeResult> | null | undefined;
}>();

const hasResult = computed(() => {
  const r = props.result;
  return !!(r && Array.isArray(r.groupResults) && r.groupResults.length > 0);
});

const safeGroupResults = computed<GroupResult[]>(() => {
  if (!props.result || !Array.isArray(props.result.groupResults)) return [];
  return props.result.groupResults as GroupResult[];
});
</script>

<style scoped>
.bg-primary-lighten-5 {
  background-color: rgba(var(--v-theme-primary), 0.05);
}
.text-primary-darken-1 {
  color: rgb(var(--v-theme-primary-darken-1));
}
.font-mono {
  font-family: 'Roboto Mono', 'Fira Code', monospace;
}
.code-block {
  background-color: rgba(0, 0, 0, 0.03);
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.4;
}

/* Dark mode adaptation */
@media (prefers-color-scheme: dark) {
  .code-block {
    background-color: rgba(255, 255, 255, 0.05);
  }
}
</style>