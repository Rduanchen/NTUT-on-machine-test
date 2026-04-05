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
            {{ result?.totalCases ?? 0 }}
          </span>
        </div>
      </v-card-text>
    </v-card>

    <v-card
      v-if="hasAnyRules"
      variant="outlined"
      class="mb-4 rounded-lg border-opacity-50"
    >
      <v-card-text class="py-3">
        <div class="d-flex align-center mb-2">
          <v-icon class="mr-2" color="primary">mdi-shield-check-outline</v-icon>
          <span class="text-subtitle-2 font-weight-bold">
            Special Rules
          </span>
          <v-spacer />
          <v-chip
            size="x-small"
            variant="tonal"
            :color="rulesSummaryChip.color"
            class="font-weight-bold"
            label
          >
            {{ rulesSummaryChip.text }}
          </v-chip>
        </div>

        <v-table density="compact" class="result-table">
          <thead>
            <tr>
              <th class="text-left bg-surface-light" style="width: 110px">Status</th>
              <th class="text-left bg-surface-light">Rule</th>
              <th class="text-left bg-surface-light" style="width: 260px">Reason</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in ruleRows" :key="row.ruleId">
              <td>
                <v-chip
                  :color="row.status.color"
                  size="x-small"
                  variant="flat"
                  class="font-weight-bold px-2"
                  label
                >
                  {{ row.status.text }}
                </v-chip>
              </td>
              <td class="text-body-2">
                {{ row.message }}
              </td>
              <td class="text-caption text-medium-emphasis">
                {{ row.reason || '-' }}
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>

    <template v-if="hasResult">
      <div v-for="group in groupedSubtasks" :key="group.id" class="mb-6">
        <div class="d-flex align-center mb-2">
          <v-chip size="small" color="secondary" variant="flat" class="mr-2 font-weight-bold">
            Subtask {{ group.id }}
          </v-chip>
          <v-spacer />
          <v-progress-linear
            :model-value="group.totalCases > 0 ? (group.correctCount / group.totalCases) * 100 : 0"
            :color="getGroupProgressColor(group.correctCount, group.totalCases)"
            height="6"
            rounded
            style="width: 100px"
          ></v-progress-linear>
          <span
            class="ml-2 text-caption text-medium-emphasis"
            style="width: 40px; text-align: right"
          >
            {{ group.correctCount }}/{{ group.totalCases }}
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
                    {{ item.time || '-' }}
                  </span>
                </td>

                <td class="py-2">
                  <div
                    class="code-block rounded pa-2 text-caption font-mono"
                    :class="{ 'text-medium-emphasis': !item.userOutput }"
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
import type {
  JudgeRunResult,
  JudgeStatusCode,
  JudgeTestCaseResult,
  SpecialRule,
  SpecialRuleResultRecord,
} from '../../../common/types';

const { t } = useI18n();

interface DisplayTestCaseResult extends JudgeTestCaseResult {
  id: string;
}

interface DisplaySubtask {
  id: string;
  totalCases: number;
  correctCount: number;
  testCasesResults: DisplayTestCaseResult[];
}

// --- Props ---
const props = defineProps<{
  result: JudgeRunResult | null | undefined;
  effectiveSpecialRules?: SpecialRule[];
  specialRuleResults?: SpecialRuleResultRecord[];
}>();

// --- Computed ---
const hasResult = computed(() => {
  const r = props.result;
  return !!(r && Array.isArray(r.subtasks) && r.subtasks.length > 0);
});

const groupedSubtasks = computed<DisplaySubtask[]>(() => {
  if (!props.result || !Array.isArray(props.result.subtasks)) return [];
  return props.result.subtasks.map((subtaskResults, subtaskIdx) => {
    const testCasesResults = subtaskResults.map((result, caseIdx) => ({
      ...result,
      id: `${subtaskIdx + 1}-${caseIdx + 1}`
    }));

    const correctCount = subtaskResults.filter((item) => item.statusCode === 'AC').length;

    return {
      id: String(subtaskIdx + 1),
      totalCases: subtaskResults.length,
      correctCount,
      testCasesResults
    };
  });
});

const hasAnyRules = computed(() => (props.effectiveSpecialRules?.length ?? 0) > 0);

const ruleRows = computed<
  Array<{
    ruleId: string;
    message: string;
    reason?: string;
    status: { text: string; color: string };
  }>
>(() => {
  const effective = props.effectiveSpecialRules ?? [];
  const results = props.specialRuleResults ?? [];
  const resultMap = new Map(results.map((r) => [r.ruleId, r]));

  return effective.map((rule) => {
    const r = resultMap.get(rule.id);
    if (!r) {
      return {
        ruleId: rule.id,
        message: rule.message,
        reason: 'Not evaluated',
        status: { text: 'N/A', color: 'grey' },
      };
    }

    return {
      ruleId: rule.id,
      message: r.message ?? rule.message,
      reason: r.reason,
      status: r.passed
        ? { text: 'PASS', color: 'success' }
        : { text: 'FAIL', color: 'error' },
    };
  });
});

const rulesSummaryChip = computed(() => {
  const total = props.effectiveSpecialRules?.length ?? 0;
  if (total === 0) return { text: 'Rules N/A', color: 'grey' };

  const results = props.specialRuleResults ?? [];
  if (results.length === 0) return { text: `Rules 0/${total}`, color: 'grey' };

  const passed = results.filter((r) => r.passed).length;
  return {
    text: `Rules ${passed}/${total}`,
    color: passed === total ? 'success' : 'error',
  };
});

function getStatusConfig(status: JudgeStatusCode) {
  const statusMap: Record<JudgeStatusCode, { color: string; text: string }> = {
    AC: { color: 'success', text: 'AC' },
    WA: { color: 'error', text: 'WA' },
    TLE: { color: 'warning', text: 'TLE' },
    MLE: { color: 'warning', text: 'MLE' },
    RE: { color: 'deep-orange', text: 'RE' },
    CE: { color: 'blue-grey', text: 'CE' },
    SE: { color: 'grey-darken-1', text: 'SE' },
    ABORTED: { color: 'grey', text: 'ABORTED' }
  };

  return statusMap[status] || { color: 'grey', text: status };
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
