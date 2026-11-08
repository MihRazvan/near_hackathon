import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({server:{host:'127.0.0.1',port:4173,strictPort:true,fs:{strict:true,allow:[fileURLToPath(new URL('.',import.meta.url))]}},preview:{host:'127.0.0.1',port:4173,strictPort:true}});
