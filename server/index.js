import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createStore } from './store.js';
import { createApp } from './app.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dev=process.argv.includes('--dev');
const store=createStore(process.env.DATA_FILE??resolve(root,'data/league.sqlite'));
const app=createApp(store);
let vite;
if(dev){const {createServer}=await import('vite');vite=await createServer({root,server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
else{app.use(express.static(resolve(root,'dist')));app.get('/{*path}',(req,res)=>res.sendFile(resolve(root,'dist/index.html')));}
const port=Number(process.env.PORT??3000);const host=process.env.HOST??'127.0.0.1';
const server=app.listen(port,host,()=>console.log(`Chess League is ready at http://${host==='0.0.0.0'?'localhost':host}:${port}${dev?' (development)':''}`));
server.on('error',error=>{console.error(error.message);process.exit(1);});
async function stop(){app.closeEvents();await vite?.close();server.close(()=>{store.close();process.exit(0);});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
