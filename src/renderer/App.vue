<template>
  <v-app id="inspire">
    <v-system-bar
      window
      height="42"
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
          <v-text class="mr-3 font-weight-medium">
            This system is developed by VerechoTJI | 
            <span 
              :class="['neon-text', isDark ? 'neon-text--dark' : 'neon-text--light']"
              @click="handleSecretClick"
            >
              阿端
              <v-tooltip activator="parent" location="bottom" open-delay="50">
                <span class="text-caption">{{ t('examSystem.secretLabel') }}</span>
              </v-tooltip>
            </span>
          </v-text>
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
      <v-app-bar-title
        class="font-weight-bold text-h6 d-flex align-center"
        style="min-width: 200px"
      >
        <v-icon class="mr-2" :color="isDark ? 'primary' : 'white'"> mdi-school-outline </v-icon>
        {{ t('examSystem.title') }}
      </v-app-bar-title>

      <v-spacer></v-spacer>

      <!-- Student info: 在小寬度下保持整潔 -->
      <div v-if="studentInfo" class="d-flex align-center mr-2 mr-sm-4 text-body-2 hidden-xs">
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
        <v-btn icon variant="text" size="small" id="language-activator">
          <v-icon>mdi-translate</v-icon>
          <v-tooltip activator="parent" location="bottom">{{
            t('examSystem.currentLanguage')
          }}</v-tooltip>
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

        <v-btn icon variant="text" size="small" @click="toggleTheme">
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
    <v-dialog v-model="showEasterEgg" width="auto" transition="dialog-bottom-transition">
  <v-card class="pa-8 text-center rounded-xl" elevation="24" min-width="320" style="overflow: visible;">
    
    <div 
      class="text-h3 font-weight-black mb-6"
      :class="['mega-neon-text', isDark ? 'mega-neon-text--dark' : 'mega-neon-text--light']"
    >
      You catch me !!
    </div>

    <div class="text-h5 font-weight-bold mb-1">
      阿端
    </div>
    
    <div class="text-subtitle-1 text-medium-emphasis mb-6 font-weight-medium">
      NTUT 資工一(CS1) <br>
      <span class="text-primary">Full Stack Developer</span>
    </div>
    
    <div class="mb-6">
      <v-btn
        prepend-icon="mdi-github"
        variant="tonal"
        size="large"
        :color="isDark ? 'white' : 'grey-darken-3'"
        href="https://github.com/Rduanchen"
        target="_blank"
        class="text-none px-6"
        rounded="pill"
      >
        github.com/Rduanchen
      </v-btn>
    </div>

    <v-divider class="mb-4"></v-divider>

    <v-btn 
      color="primary" 
      variant="flat" 
      block 
      size="large" 
      @click="showEasterEgg = false"
    >
      Close
    </v-btn>
  </v-card>
</v-dialog>
  </v-app>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue';
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
  { value: 'en', label: 'English' }
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
const pollTimer = ref(null);

const updateServerAvailability = async () => {
  if (!window.api?.store) return;
  const situation = await window.api.store.getServerAvailability();
  serverStatus.value = situation ? 'connected' : 'disconnected';
};

onMounted(async () => {
  if (window.api?.store) {
    // 即時更新一次
    await updateServerAvailability();

    // 註冊由主程序通知時的更新（若有）
    window.api.store.updateServerAvailability(async () => {
      await updateServerAvailability();
    });

    // 每 5 秒輪詢一次伺服器狀態
    pollTimer.value = setInterval(updateServerAvailability, 3000);
  }
});

onBeforeUnmount(() => {
  if (pollTimer.value) {
    clearInterval(pollTimer.value);
    pollTimer.value = null;
  }
});

watch(
  () => route.path,
  async (newPath) => {
    if (newPath === '/TestPage' && window.api?.store) {
      studentInfo.value = await window.api.store.readStudentInformation();
    }
  }
);


const showEasterEgg = ref(false);
const clickCount = ref(0);
const clickTimer = ref(null);

// 處理秘密點擊邏輯
const handleSecretClick = () => {
  clickCount.value++;
  
  // 如果已經啟動計時器，先清除它（重置時間窗口）
  if (clickTimer.value) clearTimeout(clickTimer.value);

  // 如果達到 3 次點擊
  if (clickCount.value === 3) {
    showEasterEgg.value = true;
    clickCount.value = 0; // 重置計數
  } else {
    // 設定一個短暫的時間 (500ms)，如果沒繼續點擊就會重置計數
    clickTimer.value = setTimeout(() => {
      clickCount.value = 0;
    }, 500);
  }
};
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
/* --- 基礎設定 --- */
.neon-text {
  font-family: 'Arial', sans-serif;
  font-weight: 700; /*稍微減細一點點，從 900 改 700，視覺上比較清爽 */
  font-size: 1.1em;
  display: inline-block;
  transition: transform 0.2s ease;
  cursor: pointer;
  padding: 0 2px;
}

/* --- 深色模式 (Dark Mode) - 低調版 --- */
.neon-text--dark {
  color: #fff;
  /* 只有淡淡的一層光暈，時間稍微拉長讓呼吸更優雅 */
  animation: glow-cycle-dark 4s linear infinite;
}

/* --- 淺色模式 (Light Mode) - 極簡版 --- */
.neon-text--light {
  color: #444; /* 深灰字體 */
  animation: glow-cycle-light 4s linear infinite;
}

/* --- Hover 特效: 精緻全彩 (Subtle Rainbow) --- */
.neon-text:hover {
  transform: scale(1.1); /* 放大倍率也縮小一點 */
  animation: none;
  
  /* 四色疊加，但範圍控制在 10px 以內 */
  text-shadow: 
    0 0 2px #ff005e,   /* 內層粉 */
    0 0 4px #ffe600,   /* 中層黃 */
    0 0 6px #39ff14,   /* 外層綠 */
    0 0 8px #00d4ff;   /* 最外層青 */
}


/* --- 4色輪播動畫 (低調版) --- */

/* 深色模式：光暈僅擴散 6~8px */
@keyframes glow-cycle-dark {
  0%, 100% {
    text-shadow: 0 0 2px #ff005e, 0 0 6px #ff005e;
  }
  25% {
    text-shadow: 0 0 2px #ffe600, 0 0 6px #ffe600;
  }
  50% {
    text-shadow: 0 0 2px #39ff14, 0 0 6px #39ff14;
  }
  75% {
    text-shadow: 0 0 2px #00d4ff, 0 0 6px #00d4ff;
  }
}

/* 淺色模式：光暈僅擴散 3~4px，像是在紙上暈開的水彩 */
@keyframes glow-cycle-light {
  0%, 100% {
    text-shadow: 0 0 1px #ff005e, 0 0 3px #ff005e;
  }
  25% {
    text-shadow: 0 0 1px #dbc60b, 0 0 3px #dbc60b; /* 黃色在白底太亮，稍微調深一點 */
  }
  50% {
    text-shadow: 0 0 1px #39ff14, 0 0 3px #39ff14;
  }
  75% {
    text-shadow: 0 0 1px #00d4ff, 0 0 3px #00d4ff;
  }
}


/* --- Mega Neon: 呼吸放大版 --- */
.mega-neon-text {
  font-family: 'Arial', sans-serif;
  display: inline-block;
  /* 初始狀態 */
  transform: rotate(-3deg) scale(1);
  /* 確保動畫結束後不會跑版，雖然這邊是 infinite */
  transform-origin: center center;
}

/* 深色模式：強烈光暈 + 呼吸放大 */
.mega-neon-text--dark {
  color: #fff;
  /* ease-in-out 讓呼吸感更自然 */
  animation: mega-pulse-dark 1.5s ease-in-out infinite alternate;
}

/* 淺色模式：深色字體 + 呼吸放大 */
.mega-neon-text--light {
  color: #2c3e50;
  animation: mega-pulse-light 1.5s ease-in-out infinite alternate;
}

/* --- 動畫關鍵影格 (加入 scale) --- */

@keyframes mega-pulse-dark {
  0% {
    /* 縮小狀態 */
    transform: rotate(-3deg) scale(1);
    text-shadow: 
      0 0 10px #ff005e,
      0 0 20px #ff005e,
      0 0 40px #ff005e;
  }
  100% {
    /* 放大狀態：配合顏色變化，像心臟跳動一樣 */
    transform: rotate(-3deg) scale(1.15); 
    text-shadow: 
      0 0 10px #00d4ff,
      0 0 20px #00d4ff,
      0 0 40px #00d4ff,
      0 0 80px #00d4ff; /* 光暈炸開 */
  }
}

@keyframes mega-pulse-light {
  0% {
    transform: rotate(-3deg) scale(1);
    text-shadow: 
      0 0 5px rgba(255, 0, 94, 0.5),
      0 0 15px rgba(255, 0, 94, 0.5);
  }
  100% {
    transform: rotate(-3deg) scale(1.15);
    text-shadow: 
      0 0 5px rgba(0, 212, 255, 0.8),
      0 0 20px rgba(0, 212, 255, 0.6),
      0 0 40px rgba(0, 212, 255, 0.4);
  }
}
</style>
