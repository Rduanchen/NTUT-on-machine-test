<template>
  <v-app id="inspire">
    <!-- Top status bar: 緊湊模式，適合桌面應用程式 -->
    <v-system-bar
      window
      height="32"
      :color="isDark ? 'grey-darken-4' : 'grey-lighten-4'"
      class="px-4 drag-region"
    >
      <div class="d-flex align-center w-100 justify-space-between">
        <div class="d-flex align-center no-drag">
          <v-icon
            :color="serverStatus === 'connected' ? 'success' : 'error'"
            size="16"
            class="mr-2"
          >
            {{ serverStatus === 'connected' ? 'mdi-wifi-check' : 'mdi-wifi-off' }}
          </v-icon>
          <span class="text-caption font-weight-medium mr-2">
            {{ t('examSystem.serverStatusLabel') }}
          </span>
          <v-chip
            size="x-small"
            :color="serverStatus === 'connected' ? 'success' : 'error'"
            variant="flat"
            class="px-2 font-weight-bold"
          >
            {{ t(`examSystem.serverStatus.${serverStatus}`) }}
          </v-chip>
        </div>

        <div class="d-flex align-center no-drag">
          <v-icon size="16" class="mr-1 text-medium-emphasis">mdi-web</v-icon>
          <span class="text-caption text-medium-emphasis">
            {{ currentLocaleLabel }}
          </span>
        </div>
      </div>
    </v-system-bar>

    <!-- Main app bar -->
    <v-app-bar
      :elevation="isDark ? 0 : 2"
      :color="isDark ? 'surface' : 'primary'"
      density="comfortable"
      class="border-b"
    >
      <v-app-bar-title class="font-weight-bold text-h6 d-flex align-center" style="min-width: 200px">
        <v-icon
          class="mr-2"
          :color="isDark ? 'primary' : 'white'"
        >
          mdi-school-outline
        </v-icon>
        {{ t('examSystem.title') }}
      </v-app-bar-title>

      <v-spacer></v-spacer>

      <!-- Student info: 在小寬度下保持整潔 -->
      <div
        v-if="studentInfo"
        class="d-flex align-center mr-2 mr-sm-4 text-body-2 hidden-xs"
      >
        <v-sheet
          class="d-flex align-center px-3 py-1 rounded-pill"
          :color="isDark ? 'grey-darken-3' : 'primary-darken-1'"
        >
          <v-icon size="16" class="mr-2">mdi-account-school</v-icon>
          <span class="font-weight-medium mr-3">{{ studentInfo.name }}</span>
          <span class="text-caption opacity-80 font-mono">{{ studentInfo.id }}</span>
        </v-sheet>
      </div>

      <v-divider vertical inset class="mx-2 my-auto opactity-50"></v-divider>

      <!-- Actions -->
      <div class="d-flex align-center">
        <v-btn
          icon
          variant="text"
          size="small"
          id="language-activator"
        >
          <v-icon>mdi-translate</v-icon>
          <v-tooltip activator="parent" location="bottom">{{ t('examSystem.currentLanguage') }}</v-tooltip>
        </v-btn>

        <v-menu activator="#language-activator" location="bottom end">
          <v-list density="compact" nav>
            <v-list-item
              v-for="item in localeOptions"
              :key="item.value"
              :active="locale === item.value"
              @click="changeLocale(item.value)"
              :color="isDark ? 'primary' : 'primary'"
            >
              <v-list-item-title>{{ item.label }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>

        <v-btn
          icon
          variant="text"
          size="small"
          @click="toggleTheme"
        >
          <v-icon>{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
          <v-tooltip activator="parent" location="bottom">
            {{ isDark ? t('examSystem.switchToLight') : t('examSystem.switchToDark') }}
          </v-tooltip>
        </v-btn>
      </div>
    </v-app-bar>

    <!-- Main content -->
    <v-main :class="['app-main', isDark ? 'app-main--dark' : 'app-main--light']">
      <v-container fluid class="fill-height pa-0">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useTheme } from 'vuetify';

const route = useRoute();
const studentInfo = ref(null);
const serverStatus = ref('disconnected');

// i18n
const { t, locale } = useI18n();

const localeOptions = [
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
];

const currentLocaleLabel = computed(() => {
  const found = localeOptions.find((i) => i.value === locale.value);
  return found ? found.label : locale.value;
});

const changeLocale = (newLocale) => {
  locale.value = newLocale;
};

// Theme
const theme = useTheme();
const isDark = computed(() => theme.global.current.value.dark);

const toggleTheme = () => {
  theme.global.name.value = isDark.value ? 'light' : 'dark';
};

// server status
onMounted(async () => {
  if (window.api?.store) {
    window.api.store.updateServerAvailability(async () => {
      await updateServerAvailability();
    });
    const initialStatus = await window.api.store.getServerAvailability();
    await updateServerAvailability(initialStatus);
  }
});

const updateServerAvailability = async () => {
  if (!window.api?.store) return;
  const situation = await window.api.store.getServerAvailability();
  serverStatus.value = situation ? 'connected' : 'disconnected';
};

watch(
  () => route.path,
  async (newPath) => {
    if (newPath === '/TestPage' && window.api?.store) {
      studentInfo.value = await window.api.store.readStudentInformation();
    }
  }
);
</script>

<style scoped>
.drag-region {
  -webkit-app-region: drag;
}
.no-drag {
  -webkit-app-region: no-drag;
}

.app-main {
  transition: background-color 0.3s ease;
  /* 確保內容區域能正確滾動 */
  height: 100vh;
  overflow-y: auto;
}

.app-main--light {
  background-color: #f5f7fa;
}

.app-main--dark {
  background-color: #0f1219;
}

.font-mono {
  font-family: 'Roboto Mono', monospace;
}

/* 頁面切換動畫 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>