import { createApp } from 'vue'
import App from './App.vue'
import { createAppRouter } from './router'
import { initializeAppearance } from './composables/appearance'
import './styles.css'

initializeAppearance()
createApp(App).use(createAppRouter()).mount('#app')
