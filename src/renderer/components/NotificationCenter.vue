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
      <v-sheet class="px-4 py-3 notification-center__header" color="primary" dark>
        <div class="d-flex align-center justify-space-between">
          <div>
            <div class="text-subtitle-1 font-weight-bold">Realtime Alerts</div>
            <div class="text-caption opacity-80">Stay synced with backend messages & config</div>
          </div>
          <v-btn icon variant="text" @click="close">
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
              Refresh feed
            </v-btn>
          </div>

          <v-sheet class="px-3 py-2 rounded-xl bg-grey-lighten-4 elevation-1 version-card" border>
            <div class="d-flex justify-space-between text-caption text-medium-emphasis">
              <span>Message Version</span>
              <span>Config Version</span>
            </div>
            <div class="d-flex justify-space-between mt-1 text-h6 font-weight-bold">
              <span>{{ versions.messageVersion }}</span>
              <span>{{ versions.configVersion }}</span>
            </div>
          </v-sheet>

          <div class="text-caption text-medium-emphasis">
            Auto sync runs every 60 seconds. Latest sync: {{ formattedLastUpdate }}
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
                  <v-chip :color="getMessageColor(item.type)" size="x-small" class="mr-2" dark>
                    {{ formatType(item.type) }}
                  </v-chip>
                  {{ item.message || 'No message provided' }}
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
          <div class="mt-3 font-weight-medium">No notifications yet</div>
          <div class="text-caption">Stay online to receive live socket messages.</div>
        </div>
      </v-card-text>
    </v-card>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { ServerMessage, SocketConnectionStatus } from '../../common/types';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

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
  switch (socketStatus.value) {
    case 'connected':
      return 'socket online';
    case 'reconnecting':
      return 'socket retrying';
    case 'connecting':
      return 'socket dialing';
    default:
      return 'socket offline';
  }
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

.notification-center__header {
  background: linear-gradient(120deg, #1a237e, #3949ab);
}

.version-card {
  background-image: linear-gradient(135deg, rgba(63, 81, 181, 0.08), rgba(0, 188, 212, 0.08));
}

.font-mono {
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
}
</style>
