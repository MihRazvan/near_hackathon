#!/usr/bin/env node
import { createAuthServer } from '../src/chatgpt-auth.mjs';
const server=await createAuthServer();
server.listen(4389,'127.0.0.1',()=>console.log('Connect ChatGPT locally: http://127.0.0.1:4389'));
server.on('error',()=>{console.error('Local ChatGPT connection could not start.');process.exitCode=1;});
