import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { initialState, playerStats, publicState, createTournament, nextRound, adjustRankings } from '../server/league.js';
import { importStandings, importGames } from '../server/import.js';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';
const payload=()=>({sourceName:'League standings.csv',tournamentCount:1,titleRequirement:1,players:[
 {rank:1,name:'Test Leader',rating:1115,seasonPoints:23,tournaments:1,eligibleForTitle:true},
 {rank:2,name:'Test Runner Up',rating:1106,seasonPoints:24,tournaments:1,eligibleForTitle:true}
]});
test('season import preserves every supplied field without fabricating matches',()=>{
 const state=initialState();const input=payload();importStandings(state,input);const data=publicState(state);
 assert.equal(data.players.length,2);assert.equal(data.tournaments.length,0);assert.equal(data.seasonImport.tournamentCount,1);assert.equal(data.seasonImport.titleRequirement,1);
 input.players.forEach(row=>{const p=data.players.find(p=>p.name===row.name);assert.equal(p.rating,row.rating);assert.equal(p.events,row.tournaments);assert.equal(p.games,0);assert.equal(p.importedStanding.seasonPoints,row.seasonPoints);assert.equal(p.importedStanding.rank,row.rank);assert.equal(p.importedStanding.eligibleForTitle,row.eligibleForTitle);});
 const before=JSON.stringify(state);importStandings(state,input);assert.equal(JSON.stringify(state),before);
 const t=createTournament(state,{name:'Next Open',date:'2026-12-01',totalRounds:1,playerIds:state.players.map(p=>p.id)});nextRound(state,t);
 for(const entry of t.entries)assert.equal(entry.startRating,input.players.find(p=>p.name===state.players.find(p=>p.id===entry.playerId).name).rating);
 assert.equal(playerStats(state)[state.players[0].id].events,2);
 adjustRankings(state,state.players[0].id,{rating:1500});assert.equal(playerStats(state)[state.players[0].id].rating,1500);assert.equal(state.players[0].importedStanding.rating,1115);
});
test('invalid imports reject duplicate players, bad values and conflicting historical baselines',()=>{
 const state=initialState();let input=payload();input.players[1].rating=NaN;assert.throws(()=>importStandings(state,input),/Rating/);assert.equal(state.players.length,0);
 input=payload();input.players[1].name=input.players[0].name;assert.throws(()=>importStandings(state,input),/duplicate players/);assert.equal(state.players.length,0);
 input=payload();input.players[1].eligibleForTitle='Yes';assert.throws(()=>importStandings(state,input),/eligibility/);assert.equal(state.players.length,0);
 importStandings(state,payload());input=payload();input.players[0].seasonPoints=99;assert.throws(()=>importStandings(state,input),/already been imported/);assert.equal(state.players.length,2);
});
test('standings import API is atomic, revision guarded and repeat safe',async()=>{
 const store=createStore(':memory:');const app=createApp(store);const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}/api/import/standings`;
 const send=async body=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 try{
  const bad=payload();bad.players[1].tournaments=-1;assert.equal((await send({...bad,revision:0})).status,400);assert.equal(store.read().players.length,0);
  const imported=await send({...payload(),revision:0});assert.equal(imported.status,200);assert.equal(imported.data.players.length,2);assert.equal(imported.data.players[1].events,1);
  assert.equal((await send({...payload(),revision:0})).status,409);const repeated=await send({...payload(),revision:1});assert.equal(repeated.status,200);assert.equal(repeated.data.players.length,2);assert.equal(repeated.data.seasonImport.tournamentCount,1);
 }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});


const gamePayload=()=>({sourceName:'Games.csv',games:['win','loss','draw',null].map((result,index)=>({tournament:1,round:index+1,player:'Test Leader',opponent:'Test Runner Up',result,ratings:{playerBefore:1000,opponentBefore:1000,playerChange:0,opponentChange:0,playerAfter:1000,opponentAfter:1000}}))});
test('historical W/D/L counts both sides, excludes blank results, and never reapplies rating changes',()=>{
 const state=initialState();importStandings(state,payload());const ratings=state.players.map(p=>p.initialRating);
 importGames(state,gamePayload());assert.equal(state.gameImport.completedCount,3);assert.equal(state.gameImport.pendingCount,1);
 for(const [index,p] of state.players.entries()){
  const stat=playerStats(state)[p.id];assert.equal(stat.games,3);assert.equal(stat.wins,1);assert.equal(stat.draws,1);assert.equal(stat.losses,1);assert.equal(stat.events,1);assert.equal(stat.rating,ratings[index]);assert.equal(stat.importedGames,3);assert.equal(stat.importedPendingGames,1);
 }
 const before=JSON.stringify(state);importGames(state,gamePayload());assert.equal(JSON.stringify(state),before);
 const t=createTournament(state,{name:'New Event',date:'2026-12-01',totalRounds:1,playerIds:state.players.map(p=>p.id)});nextRound(state,t);t.rounds[0].matches[0].result='draw';
 for(const p of state.players){const stat=playerStats(state)[p.id];assert.equal(stat.games,4);assert.equal(stat.draws,2);assert.equal(stat.events,2);}
});
test('game validation rejects unknown players, duplicates, self-play, invalid results and replacement files',()=>{
 const state=initialState();importStandings(state,payload());
 const bad=gamePayload();bad.games[3].opponent='Unknown Player';assert.throws(()=>importGames(state,bad),/not found/);assert(!state.gameImport);
 const duplicate=gamePayload();duplicate.games.push({...duplicate.games[0],player:'Test Runner Up',opponent:'Test Leader'});assert.throws(()=>importGames(state,duplicate),/Duplicate/);
 const self=gamePayload();self.games[0].opponent='Test Leader';assert.throws(()=>importGames(state,self),/themselves/);
 const invalid=gamePayload();invalid.games[0].result='abandoned';assert.throws(()=>importGames(state,invalid),/result/);
 importGames(state,gamePayload());const changed=gamePayload();changed.games[0].result='draw';assert.throws(()=>importGames(state,changed),/already been imported/);
});
test('game import endpoint preserves standings, resists duplicates, and protects players with game history',async()=>{
 const store=createStore(':memory:');const state=store.read();importStandings(state,payload());store.write(state);const app=createApp(store);const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api`;
 const send=async(path,method,body)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 try{
  const bad=gamePayload();bad.games[3].player='Not in league';assert.equal((await send('/import/games','POST',{...bad,revision:0})).status,400);assert(!store.read().gameImport);
  const first=await send('/import/games','POST',{...gamePayload(),revision:0});assert.equal(first.status,200);assert.equal(first.data.players[0].wins,1);assert.equal(first.data.players[0].rating,1115);assert.equal(first.data.players[0].events,1);
  const repeated=await send('/import/games','POST',{...gamePayload(),revision:1});assert.equal(repeated.status,200);assert.equal(repeated.data.players[0].games,3);
  assert.equal((await send(`/players/${first.data.players[0].id}`,'DELETE',{revision:2})).status,400);assert.equal(store.read().players.length,2);
 }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
