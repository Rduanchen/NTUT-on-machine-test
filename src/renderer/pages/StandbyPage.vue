<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { goToDerivedPage } from '../router/navigate';

/**
 * The INITIALIZED phase, seen from a machine in an empty room.
 *
 * Machines register and check their toolchain here, before students arrive.
 * The page deliberately offers no way to log in: this is the phase where the
 * seat gets itself ready, and a login box would invite someone to sit down and
 * start before registration has closed.
 */
const router = useRouter();

const registration = ref<'pending' | 'ok' | 'failed'>('pending');
const registrationMessage = ref('');
const environment = ref<{ status: string; message?: string; failed: string[] }>({
  status: 'IDLE',
  failed: []
});

let poll: ReturnType<typeof setInterval> | null = null;

const environmentLabel = computed(() => {
  switch (environment.value.status) {
    case 'RUNNING':
      return '檢查中…';
    case 'PASSED':
      return '通過';
    case 'FAILED':
      return '失敗';
    default:
      return '尚未開始';
  }
});

const environmentColor = computed(() => {
  switch (environment.value.status) {
    case 'PASSED':
      return 'success';
    case 'FAILED':
      return 'error';
    case 'RUNNING':
      return 'info';
    default:
      return 'grey';
  }
});

async function ensureRegistered(): Promise<void> {
  if (await window.api?.auth?.isRegistered?.()) {
    registration.value = 'ok';
    return;
  }

  const res = await window.api?.auth?.register?.();
  if (res?.success) {
    registration.value = 'ok';
    registrationMessage.value = '';
  } else {
    registration.value = 'failed';
    registrationMessage.value = res?.error?.message ?? '無法與伺服器完成註冊';
  }
}

async function refreshEnvironment(): Promise<void> {
  const report = await window.api?.environmentCheck?.getReport?.();
  const data = report?.data;
  if (!data) return;
  environment.value = {
    status: data.status,
    message: data.message,
    failed: (data.languageResults ?? [])
      .filter((r: any) => r.status === 'failed')
      .map((r: any) => r.language)
  };
}

async function retryEnvironment(): Promise<void> {
  await window.api?.environmentCheck?.retry?.();
  await refreshEnvironment();
}

async function tick(): Promise<void> {
  await ensureRegistered();
  await refreshEnvironment();
  await goToDerivedPage(router);
}

onMounted(async () => {
  await tick();
  poll = setInterval(tick, 5000);
  /* The phase is watched once, in App.vue. */
});

onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
});
</script>

<template>
  <v-container class="fill-height d-flex justify-center align-center pa-4" fluid>
    <v-card class="w-100" max-width="640" elevation="2" rounded="lg">
      <div class="px-6 py-5 border-b">
        <div class="d-flex align-center">
          <v-avatar color="primary" variant="tonal" class="mr-4" rounded>
            <v-icon>mdi-desktop-classic</v-icon>
          </v-avatar>
          <div>
            <h2 class="text-h6 font-weight-bold">考試機器準備中</h2>
            <div class="text-caption text-medium-emphasis">
              考試尚未開放登入，本機正在完成註冊與環境檢查
            </div>
          </div>
        </div>
      </div>

      <v-card-text class="px-6 py-6">
        <div class="d-flex align-center mb-4" data-test="registration-status">
          <v-icon
            :color="registration === 'ok' ? 'success' : registration === 'failed' ? 'error' : 'grey'"
            class="mr-3"
          >
            {{
              registration === 'ok'
                ? 'mdi-check-circle'
                : registration === 'failed'
                  ? 'mdi-alert-circle'
                  : 'mdi-progress-clock'
            }}
          </v-icon>
          <div>
            <div class="font-weight-medium">裝置註冊</div>
            <div class="text-caption text-medium-emphasis">
              {{
                registration === 'ok'
                  ? '已完成'
                  : registration === 'failed'
                    ? registrationMessage
                    : '進行中…'
              }}
            </div>
          </div>
        </div>

        <div class="d-flex align-center" data-test="environment-status">
          <v-icon :color="environmentColor" class="mr-3">mdi-cog-outline</v-icon>
          <div class="flex-grow-1">
            <div class="font-weight-medium">執行環境檢查</div>
            <div class="text-caption text-medium-emphasis">
              {{ environmentLabel }}
              <span v-if="environment.failed.length">
                （{{ environment.failed.join('、') }}）
              </span>
            </div>
          </div>
          <v-btn
            v-if="environment.status === 'FAILED'"
            size="small"
            variant="tonal"
            data-test="retry-environment"
            @click="retryEnvironment"
          >
            重新檢查
          </v-btn>
        </div>

        <v-divider class="my-6" />

        <v-alert type="info" variant="tonal" density="comfortable">
          請等待監考人員宣布開始入場，屆時本畫面會自動切換到登入頁。
        </v-alert>
      </v-card-text>
    </v-card>
  </v-container>
</template>
