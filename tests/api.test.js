import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';

test('empty league, default admin, manual rankings, live updates, and persistence without credentials',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'chess-test-'));const file=join(dir,'league.sqlite');let store=createStore(file);const app=createApp(store);const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api`;let revision=0;const abort=new AbortController();
 async function request(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify({revision,...body})})});const data=await r.json();if(data.revision!==undefined&&r.ok)revision=data.revision;return {r,data};}
 try{
  let result=await request('/state');assert.equal(result.data.players.length,0);assert.equal(result.data.tournaments.length,0);assert.equal(result.data.leagueCreated,false);assert(!('demo' in result.data));assert(!('credentials' in result.data));
  assert.deepEqual((await request('/session')).data,{admin:true,authMode:'open'});
  result=await request('/league','POST',{leagueName:'My Chess Club'});assert.equal(result.r.status,200);assert.equal(result.data.settings.leagueName,'My Chess Club');assert.equal(result.data.leagueCreated,true);assert(!result.r.headers.get('set-cookie'));
  assert.equal((await request('/setup','POST',{})).r.status,404);assert.equal((await request('/login','POST',{})).r.status,404);
  const events=await fetch(base+'/events',{signal:abort.signal});const reader=events.body.getReader();await reader.read();
  for(const name of ['Alice Example','Bobby Example','Carol Example','David Example']){result=await request('/players','POST',{name,initialRating:1200});assert.equal(result.r.status,200);}
  const broadcast=new TextDecoder().decode((await reader.read()).value);assert(broadcast.includes('revision'));
  result=await request('/players','POST',{name:'Stale Player',revision:0});assert.equal(result.r.status,409);
  result=await request('/tournaments','POST',{name:'First Open',date:'2026-11-28',totalRounds:2,playerIds:(await request('/state')).data.players.map(p=>p.id)});assert.equal(result.r.status,200);const tid=result.data.tournaments[0].id;
  result=await request(`/tournaments/${tid}/pair`,'POST',{});assert.equal(result.r.status,200);
  assert.equal((await request(`/tournaments/${tid}/pair`,'POST',{})).r.status,400);
  for(let round=0;round<2;round++){
   const matches=result.data.tournaments[0].rounds[round].matches;
   for(const match of matches){result=await request(`/tournaments/${tid}/results/${match.id}`,'PATCH',{result:'1-0'});assert.equal(result.r.status,200);}
   if(round===0){const old=matches[0].id;result=await request(`/tournaments/${tid}/pair`,'POST',{});assert.equal(result.r.status,200);assert.equal((await request(`/tournaments/${tid}/results/${old}`,'PATCH',{result:'draw'})).r.status,400);}
  }
  result=await request(`/tournaments/${tid}/finish`,'POST',{});assert.equal(result.r.status,200);assert.equal(result.data.tournaments[0].status,'completed');
  const pid=result.data.players[0].id;const games=JSON.stringify(result.data.tournaments[0].rounds);
  result=await request(`/players/${pid}/ranking`,'PATCH',{rating:2000,tournamentId:tid,score:4.5});assert.equal(result.r.status,200);assert.equal(result.data.players.find(p=>p.id===pid).rating,2000);assert.equal(result.data.tournaments[0].standings[0].playerId,pid);assert.equal(result.data.tournaments[0].standings[0].score,4.5);assert.equal(JSON.stringify(result.data.tournaments[0].rounds),games);
  result=await request(`/players/${pid}/ranking`,'PATCH',{rating:NaN,tournamentId:tid,score:0});assert.equal(result.r.status,400);assert.equal((await request('/state')).data.tournaments[0].standings[0].score,4.5);
  assert.equal((await request(`/players/${pid}/ranking`,'PATCH',{rating:Infinity})).r.status,400);
  result=await request('/backup');assert(!('credentials' in result.data));assert.equal(result.data.players.length,4);
  assert.equal((await fetch(base+'/settings',{method:'PATCH',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:JSON.stringify({revision})})).status,403);
  store.close();store=createStore(file);assert.equal(store.read().players.length,4);assert.equal(store.read().tournaments[0].status,'completed');assert.equal(store.read().settings.leagueName,'My Chess Club');assert.equal(store.read().players[0].ratingAdjustments.length,1);assert.equal(store.read().tournaments[0].scoreAdjustments[pid],4.5-store.read().tournaments[0].rounds.flatMap(r=>r.matches).filter(m=>m.white===pid).length);
 }finally{abort.abort();app.closeEvents();await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true});}
});

test('existing leagues retain their data and receive default admin access',async()=>{
 const store=createStore(':memory:');const old=store.read();old.credentials={salt:'legacy',hash:'legacy'};old.settings.leagueName='Existing Club';store.write(old);const app=createApp(store);const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try{const base=`http://127.0.0.1:${server.address().port}/api`;assert.equal((await (await fetch(base+'/session')).json()).admin,true);const state=await (await fetch(base+'/state')).json();assert.equal(state.settings.leagueName,'Existing Club');assert(!('credentials' in state));const response=await fetch(base+'/players',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:state.revision,name:'New Player'})});assert.equal(response.status,200);}finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
