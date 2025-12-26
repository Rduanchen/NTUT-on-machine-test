<template>
  <div class="result-container w-100">
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

    <template v-if="hasResult">
      <div v-for="group in safeGroupResults" :key="group.id" class="mb-6">
        <div class="d-flex align-center mb-2">
          <v-chip size="small" color="secondary" variant="flat" class="mr-2 font-weight-bold">
             Group {{ group.id }}
          </v-chip>
          <span class="text-subtitle-2 font-weight-bold">{{ group.title }}</span>
          <v-spacer />
          <v-progress-linear
             :model-value="group.testCaseAmount > 0 ? (group.correctCount / group.testCaseAmount) * 100 : 0"
             :color="getGroupProgressColor(group.correctCount, group.testCaseAmount)"
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
                 <th class="text-left bg-surface-light" style="width: 140px">Status</th>
                 <th class="text-left bg-surface-light" style="width: 100px">Time</th>
                 <th class="text-left bg-surface-light">Output</th>
               </tr>
             </thead>
             <tbody>
               <tr v-for="item in group.testCasesResults" :key="item.id">
                 <td class="text-caption text-medium-emphasis font-mono">{{ item.id }}</td>
                 
                 <td>
                   <v-chip
                     :color="getStatusConfig(item.statusCode).color"
                     size="small"
                     variant="flat"
                     class="font-weight-bold px-2"
                     label
                   >
                     {{ getStatusConfig(item.statusCode).text }}
                   </v-chip>
                 </td>

                 <td>
                   <span class="text-caption font-mono text-medium-emphasis">
                     {{ item.execution_time || '-' }}
                   </span>
                 </td>

                 <td class="py-2">
                   <div 
                    class="code-block rounded pa-2 text-caption font-mono"
                    :class="{'text-medium-emphasis': !item.userOutput}"
                   >
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

// --- Types Definition (Updated based on new JSON) ---
interface TestCaseResult {
  id: string | number;
  statusCode: string;     // e.g., "Accepted (AC)", "Wrong Answer (WA)"
  correct: boolean;
  userOutput?: string;
  execution_time?: string; // e.g., "17.01ms"
}

interface GroupResult {
  id: string | number;
  title: string;
  correctCount: number;
  testCaseAmount: number;
  testCasesResults: TestCaseResult[];
}

interface JudgeResult {
  correctCount: number;
  testCaseAmount: number;
  groupResults: GroupResult[];
}

// --- Props ---
const props = defineProps<{
  result: Partial<JudgeResult> | null | undefined;
}>();

// --- Computed ---
const hasResult = computed(() => {
  const r = props.result;
  return !!(r && Array.isArray(r.groupResults) && r.groupResults.length > 0);
});

const safeGroupResults = computed<GroupResult[]>(() => {
  if (!props.result || !Array.isArray(props.result.groupResults)) return [];
  return props.result.groupResults as GroupResult[];
});

// --- Helpers for Status Display ---

const STATUS_AC = "Accepted (AC)";
const STATUS_WA = "Wrong Answer (WA)";
const STATUS_TLE = "Time Limit Exceeded (TLE)";
const STATUS_RE = "Runtime Error (RE)";
const STATUS_CE = "Compile Error (CE)";

/**
 * Returns color and display text based on status code string.
 * Parses strings like "Accepted (AC)" to return simplified "AC" if desired,
 * or handles specific colors for different error types.
 */
function getStatusConfig(status: string) {
  // Normalize string just in case
  const s = status || '';

  if (s === STATUS_AC || s.includes('(AC)')) {
    return { color: 'success', text: 'AC' };
  }
  if (s === STATUS_WA || s.includes('(WA)')) {
    return { color: 'error', text: 'WA' };
  }
  if (s === STATUS_TLE || s.includes('(TLE)')) {
    return { color: 'warning', text: 'TLE' }; // Warning implies orange/amber
  }
  if (s === STATUS_RE || s.includes('(RE)')) {
    return { color: 'deep-orange', text: 'RE' };
  }
  if (s === STATUS_CE || s.includes('(CE)')) {
    return { color: 'blue-grey', text: 'CE' };
  }
  
  // Fallback for unknown statuses
  return { color: 'grey', text: s };
}

function getGroupProgressColor(correct: number, total: number): string {
  if (total === 0) return 'grey';
  const percentage = correct / total;
  if (percentage === 1) return 'success';
  if (percentage >= 0.5) return 'warning';
  return 'error';
}
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
  min-height: 24px; /* Ensure empty blocks have height */
}

.result-table th {
  white-space: nowrap;
}

/* Dark mode adaptation */
@media (prefers-color-scheme: dark) {
  .code-block {
    background-color: rgba(255, 255, 255, 0.05);
  }
}
</style>