import {defineConfig} from 'vite';
export default defineConfig({build:{target:'es2022'},server:{strictPort:true,proxy:process.env.VITE_INK_FIXTURE==='1'?{'/fixture-runtime':{target:'http://127.0.0.1:4353',changeOrigin:true,headers:{Authorization:'Bearer spreadsheet-fixture-only'},rewrite:path=>path.replace('/fixture-runtime','/api/modules')}}:{}}});
