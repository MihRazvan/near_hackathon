import { build } from 'esbuild';
await build({entryPoints:[new URL('../lab/wallets.entry.js',import.meta.url).pathname],outfile:new URL('../lab/dist/wallets.js',import.meta.url).pathname,
 bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'none'});
console.log('Integration lab wallet adapter built');
