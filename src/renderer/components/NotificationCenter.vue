<template>
  <v-navigation-drawer
    v-model="isOpen"
    location="right"
    width="420"
    floating
    temporary
    class="notification-center"
  >
    <v-card flat class="h-100 d-flex flex-column">
      <!-- Header -->
      <v-sheet
        class="px-4 py-3"
        :class="isDark ? 'notification-center__header--dark' : 'notification-center__header--light'"
      >
        <div class="d-flex align-center justify-space-between">
          <div>
            <div class="text-subtitle-1 font-weight-bold text-white">
              {{ t('examSystem.notificationCenter.title') }}
            </div>
            <div class="text-caption text-white opacity-80">
              {{ t('examSystem.notificationCenter.subtitle') }}
            </div>
          </div>
          <v-btn icon variant="text" color="white" @click="close">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>
      </v-sheet>

      <v-divider></v-divider>

      <v-card-text class="flex-grow-0">
        <div class="d-flex flex-column" style="gap: 12px">
          <div class="d-flex align-center justify-space-between flex-wrap" style="gap: 12px">
            <div class="d-flex align-center">
              <v-chip
                density="comfortable"
                :color="socketStatusColor"
                class="text-uppercase font-weight-bold"
                variant="flat"
              >
                <v-icon start>{{ socketStatusIcon }}</v-icon>
                {{ socketStatusLabel }}
              </v-chip>
            </div>
            <v-btn
              size="small"
              prepend-icon="mdi-refresh"
              :loading="isRefreshing"
              color="primary"
              variant="tonal"
              @click="refresh"
            >
              {{ t('examSystem.notificationCenter.refreshFeed') }}
            </v-btn>
          </div>

          <v-sheet
            class="px-3 py-2 rounded-xl elevation-1 version-card"
            :class="isDark ? 'version-card--dark' : 'version-card--light'"
            border
          >
            <div class="d-flex justify-space-between text-caption text-medium-emphasis">
              <span>{{ t('examSystem.notificationCenter.messageVersion') }}</span>
              <span>{{ t('examSystem.notificationCenter.configVersion') }}</span>
            </div>
            <div class="d-flex justify-space-between mt-1 text-h6 font-weight-bold">
              <span>{{ versions.messageVersion }}</span>
              <span>{{ versions.configVersion }}</span>
            </div>
          </v-sheet>

          <div class="text-caption text-medium-emphasis">
            {{ t('examSystem.notificationCenter.autoSync', { time: formattedLastUpdate }) }}
          </div>
        </div>
      </v-card-text>

      <v-divider></v-divider>

      <v-card-text class="pt-0 flex-grow-1 overflow-y-auto">
        <template v-if="notifications.length">
          <v-timeline density="compact" side="end">
            <v-timeline-item
              v-for="item in reversedNotifications"
              :key="item.id"
              :dot-color="getMessageColor(item.type)"
              size="small"
            >
              <template #opposite>
                <span class="text-caption text-medium-emphasis">#{{ item.id }}</span>
              </template>
              <v-card class="mb-3" variant="outlined">
                <v-card-title class="text-subtitle-2 font-weight-bold d-flex align-center">
                  <v-chip :color="getMessageColor(item.type)" size="x-small" class="mr-2">
                    {{ formatType(item.type) }}
                  </v-chip>
                  {{ item.message || t('examSystem.notificationCenter.noMessage') }}
                </v-card-title>
                <v-card-subtitle class="text-caption font-mono">
                  {{ formatTimestamp(item.createdAt) }}
                </v-card-subtitle>
              </v-card>
            </v-timeline-item>
          </v-timeline>
        </template>
        <div v-else class="text-center text-body-2 text-medium-emphasis py-12">
          <v-icon size="48" color="grey">mdi-bell-off-outline</v-icon>
          <div class="mt-3 font-weight-medium">
            {{ t('examSystem.notificationCenter.noNotifications') }}
          </div>
          <div class="text-caption">
            {{ t('examSystem.notificationCenter.noNotificationsSubtext') }}
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTheme } from 'vuetify';
import type { ServerMessage, SocketConnectionStatus } from '../../common/types';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const { t } = useI18n();
const theme = useTheme();
const isDark = computed(() => theme.global.current.value.dark);

const isOpen = ref(props.modelValue);
const notifications = ref<ServerMessage[]>([]);
const socketStatus = ref<SocketConnectionStatus>('disconnected');
const versions = ref({ configVersion: 0, messageVersion: 0 });
const lastUpdated = ref<string>('—');
const isRefreshing = ref(false);

watch(
  () => props.modelValue,
  (value) => {
    isOpen.value = value;
  }
);

watch(isOpen, (value) => {
  if (!value) emit('update:modelValue', false);
});

const reversedNotifications = computed(() => [...notifications.value].reverse());

const socketStatusColor = computed(() => {
  switch (socketStatus.value) {
    case 'connected':
      return 'success';
    case 'reconnecting':
      return 'warning';
    case 'connecting':
      return 'info';
    default:
      return 'error';
  }
});

const socketStatusIcon = computed(() => {
  switch (socketStatus.value) {
    case 'connected':
      return 'mdi-access-point-check';
    case 'reconnecting':
      return 'mdi-access-point-network-off';
    case 'connecting':
      return 'mdi-access-point';
    default:
      return 'mdi-access-point-off';
  }
});

const socketStatusLabel = computed(() => {
  const key = socketStatus.value as string;
  const validKeys = ['connected', 'reconnecting', 'connecting', 'disconnected'];
  const safeKey = validKeys.includes(key) ? key : 'disconnected';
  return t(`examSystem.notificationCenter.socketStatus.${safeKey}`);
});

const formattedLastUpdate = computed(() => lastUpdated.value);

const updateLastSynced = () => {
  lastUpdated.value = new Date().toLocaleString();
};

const hydrate = async () => {
  if (!window.api?.notifications) return;
  notifications.value = await window.api.notifications.getAll();
  versions.value = await window.api.notifications.getVersions();
  socketStatus.value = await window.api.notifications.getSocketStatus();
  updateLastSynced();
};

const refresh = async () => {
  if (!window.api?.notifications) return;
  isRefreshing.value = true;
  try {
    await window.api.notifications.refresh();
    await hydrate();
  } finally {
    isRefreshing.value = false;
  }
};

const close = () => {
  isOpen.value = false;
  emit('update:modelValue', false);
};

const formatTimestamp = (timestamp: string) => {
  return new Date(timestamp).toLocaleString();
};

const getMessageColor = (type: string) => {
  if (type === 'config_update') return 'deep-orange-accent-3';
  if (type === 'notification') return 'primary';
  return 'secondary';
};

const formatType = (type: string) => type.replace(/_/g, ' ').toUpperCase();

onMounted(async () => {
  await hydrate();

  window.api?.notifications.onUpdated(async (items) => {
    notifications.value = items as ServerMessage[];
    versions.value = await window.api.notifications.getVersions();
    updateLastSynced();
  });

  window.api?.notifications.onSocketStatusChanged((status) => {
    socketStatus.value = status as SocketConnectionStatus;
  });
});
</script>

<style scoped>
.notification-center {
  border-top-left-radius: 24px;
  border-bottom-left-radius: 24px;
}

.notification-center__header--light {
  background: linear-gradient(120deg, #1a237e, #3949ab);
}

.notification-center__header--dark {
  background: linear-gradient(120deg, #0d1333, #1a237e);
}

.version-card--light {
  background-image: linear-gradient(135deg, rgba(63, 81, 181, 0.08), rgba(0, 188, 212, 0.08));
  background-color: #f5f5f5;
}

.version-card--dark {
  background-image: linear-gradient(135deg, rgba(63, 81, 181, 0.18), rgba(0, 188, 212, 0.18));
  background-color: #1e1e2e;
}

.font-mono {
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
}
</style>
