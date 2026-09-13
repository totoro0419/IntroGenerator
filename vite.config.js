import {defineConfig} from 'vite';
export default defineConfig({optimizeDeps:{exclude:['harfbuzzjs']},base:'/IntroGenerator/',build:{target:'es2022'},server:{host:'0.0.0.0'}});
