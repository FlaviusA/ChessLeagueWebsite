import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, adjustRankings, addPlayer, createTournament, nextRound, standings, tournamentRatings, playerStats, publicState } from '../server/league.js';
function fixture(count,rounds=Math.min(count-1,5)){
 const s=initialState();for(let i=0;i<count;i++)addPlayer(s,{name:`Player ${String(i+1).padStart(2,'0')}`,initialRating:1500-i*10});
 const t=createTournament(s,{name:'Test Open',date:'2026-11-28',totalRounds:rounds,playerIds:s.players.map(p=>p.id)});return {s,t};
}
test('Swiss events cover every player, prohibit rematches, and allocate at most one bye',()=>{
 for(const count of [4,5,7,12,16]){
  const {s,t}=fixture(count);const games=new Set(),byes=new Set();
  for(let r=0;r<t.totalRounds;r++){
   nextRound(s,t);const seen=new Set();
   for(const [i,m] of t.rounds.at(-1).matches.entries()){
    assert(!seen.has(m.white));seen.add(m.white);
    if(m.black){assert(!seen.has(m.black));seen.add(m.black);const pair=[m.white,m.black].sort().join(':');assert(!games.has(pair));games.add(pair);m.result=(i+r)%3===0?'draw':(i+r)%2===0?'1-0':'0-1';}
    else {assert(!byes.has(m.white));byes.add(m.white);assert.equal(m.result,'bye');}
   }
   assert.equal(seen.size,count);
  }
  assert.equal(standings(s,t).reduce((sum,row)=>sum+row.score,0),Math.ceil(count/2)*t.totalRounds);
 }
});
test('first round pairs the upper and lower halves of the starting rating list',()=>{
 const {s,t}=fixture(8);nextRound(s,t);
 for(const m of t.rounds[0].matches){const indexes=[m.white,m.black].map(id=>s.players.findIndex(p=>p.id===id)).sort((a,b)=>a-b);assert.equal(indexes[1]-indexes[0],4);}
});
test('equal-rating Elo is symmetric, draws unchanged, and corrections recalculate instead of stacking',()=>{
 const {s,t}=fixture(2,1);s.players[1].initialRating=1500;nextRound(s,t);const m=t.rounds[0].matches[0];m.result='1-0';
 let ratings=tournamentRatings(t).ratings;assert.equal(ratings[m.white],1516);assert.equal(ratings[m.black],1484);
 m.result='draw';ratings=tournamentRatings(t).ratings;assert.equal(ratings[m.white],1500);assert.equal(ratings[m.black],1500);
 m.result='0-1';ratings=tournamentRatings(t).ratings;assert.equal(ratings[m.white],1484);assert.equal(ratings[m.black],1516);
 m.result=null;assert.equal(tournamentRatings(t).ratings[m.white],1500);
});
test('bye earns a point but has no rating impact or played-game count',()=>{
 const {s,t}=fixture(3,2);nextRound(s,t);const m=t.rounds[0].matches.find(m=>!m.black);const row=standings(s,t).find(p=>p.playerId===m.white);
 assert.equal(row.score,1);assert.equal(row.played,0);assert.equal(row.ratingChange,0);assert.equal(playerStats(s)[m.white].games,0);
});
test('ratings carry to the next event, with rule settings frozen at event start',()=>{
 const {s,t}=fixture(4,1);nextRound(s,t);t.rounds[0].matches.forEach(m=>m.result='1-0');t.status='completed';const prior=playerStats(s);
 const next=createTournament(s,{name:'Next Open',date:'2026-12-01',totalRounds:1,playerIds:s.players.map(p=>p.id)});s.settings.kFactor=20;nextRound(s,next);
 next.entries.forEach(e=>assert.equal(e.startRating,prior[e.playerId].rating));assert.equal(next.ratingSettings.kFactor,20);assert.equal(t.ratingSettings.kFactor,32);
 s.settings.kFactor=80;assert.equal(next.ratingSettings.kFactor,20);
});
test('rounds cannot advance with missing results or while a different event is active',()=>{
 const {s,t}=fixture(6,3);nextRound(s,t);assert.throws(()=>nextRound(s,t),/Enter all results/);
 const other=createTournament(s,{name:'Another event',date:'2026-12-01',totalRounds:1,playerIds:s.players.map(p=>p.id)});assert.throws(()=>nextRound(s,other),/Finish the active tournament/);
});
test('tie-breaks use actual completed opponents and reject duplicate entries and impossible round counts',()=>{
 const {s,t}=fixture(4,2);nextRound(s,t);for(const m of t.rounds[0].matches)m.result='1-0';nextRound(s,t);for(const m of t.rounds[1].matches)m.result='draw';
 const rows=standings(s,t);for(const row of rows){assert.equal(row.buchholz,row.opponents.reduce((n,o)=>n+rows.find(r=>r.playerId===o.id).score,0));}
 assert.throws(()=>createTournament(s,{name:'Invalid',date:'2026-12-01',totalRounds:1,playerIds:[s.players[0].id,s.players[0].id]}),/registered players/);
 const {s:small,t:tooMany}=fixture(2,5);assert.throws(()=>nextRound(small,tooMany),/at most 1 rounds/);
 assert(!('credentials' in publicState(s)));
});
test('64-player pairing remains bounded and complete',()=>{
 const {s,t}=fixture(64,3);for(let r=0;r<3;r++){nextRound(s,t);assert.equal(t.rounds.at(-1).matches.length,32);t.rounds.at(-1).matches.forEach((m,i)=>m.result=i%3===0?'draw':'1-0');}
});


test('admin rating overrides carry into future events exactly once, including events created earlier',()=>{
 const {s,t}=fixture(4,1);const pid=s.players[0].id;
 const future=createTournament(s,{name:'Scheduled first, played later',date:'2026-12-01',totalRounds:1,playerIds:s.players.map(p=>p.id)});
 adjustRankings(s,pid,{rating:1800});assert.equal(playerStats(s)[pid].rating,1800);
 nextRound(s,t);assert.equal(t.entries.find(e=>e.playerId===pid).startRating,1800);assert.equal(playerStats(s)[pid].rating,1800);
 t.rounds[0].matches.forEach(m=>m.result='1-0');t.status='completed';
 adjustRankings(s,pid,{rating:2000});assert.equal(playerStats(s)[pid].rating,2000);
 adjustRankings(s,pid,{rating:2000});assert.equal(s.players[0].ratingAdjustments.length,2);
 const later=createTournament(s,{name:'Played before the scheduled event',date:'2026-11-29',totalRounds:1,playerIds:s.players.map(p=>p.id)});
 nextRound(s,later);assert.equal(later.entries.find(e=>e.playerId===pid).startRating,2000);assert.equal(playerStats(s)[pid].rating,2000);
 later.rounds[0].matches.forEach(m=>m.result='draw');later.status='completed';
 const after=playerStats(s)[pid].rating;assert.equal(after,tournamentRatings(later).ratings[pid]);
 nextRound(s,future);assert.equal(future.entries.find(e=>e.playerId===pid).startRating,after);assert.equal(playerStats(s)[pid].rating,after);
});

test('manual points reorder standings, update tie-breaks, and do not rewrite match results',()=>{
 const {s,t}=fixture(4,2);nextRound(s,t);t.rounds[0].matches.forEach(m=>m.result='1-0');
 const loser=t.rounds[0].matches[0].black;const winner=t.rounds[0].matches[0].white;const original=JSON.stringify(t.rounds);
 adjustRankings(s,loser,{tournamentId:t.id,score:3.5});let rows=standings(s,t);assert.equal(rows[0].playerId,loser);assert.equal(rows[0].score,3.5);assert.equal(rows.find(p=>p.playerId===winner).buchholz,3.5);assert.equal(JSON.stringify(t.rounds),original);
 adjustRankings(s,loser,{tournamentId:t.id,score:3.5});assert.equal(standings(s,t)[0].score,3.5);
 nextRound(s,t);t.rounds[1].matches.forEach(m=>m.result='draw');assert.equal(standings(s,t).find(p=>p.playerId===loser).score,4);
 assert.throws(()=>adjustRankings(s,loser,{tournamentId:t.id,score:1.25}),/half-point/);
 assert.throws(()=>adjustRankings(s,'missing',{rating:1000}),/not found/);
});
