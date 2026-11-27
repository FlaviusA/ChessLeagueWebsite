import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { initialState, addPlayer, createTournament, nextRound, playerStats, tournamentRatings } from '../server/league.js';
import { playerHistory } from '../server/history.js';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';
function fixture(){
 const state=initialState();const alice=addPlayer(state,{name:'Alice Example',initialRating:1200});const bob=addPlayer(state,{name:'Bob Example',initialRating:1200});const carol=addPlayer(state,{name:'Carol Example',initialRating:1200});
 const game=(playerId,opponentId,result,round)=>({playerId,opponentId,result,round,tournament:1,ratings:{playerBefore:1000,opponentBefore:1000,playerChange:23,opponentChange:-17,playerAfter:1023,opponentAfter:983}});
 state.gameImport={sourceId:'test-source',games:[game(alice.id,bob.id,'win',1),game(bob.id,alice.id,'win',2),game(alice.id,bob.id,'draw',3),game(bob.id,alice.id,'win',4),game(alice.id,carol.id,null,5)]};
 return {state,alice,bob,carol};
}
test('opponent records count repeated losses and invert imported results and rating changes correctly',()=>{
 const {state,alice,bob,carol}=fixture();const history=playerHistory(state,alice.id);const rival=history.opponents.find(p=>p.opponentId===bob.id);
 assert.deepEqual(history.summary,{played:4,wins:1,draws:1,losses:2,pending:1,byes:0});
 assert.deepEqual(rival,{opponentId:bob.id,opponentName:bob.name,played:4,wins:1,draws:1,losses:2,pending:0});
 assert.equal(history.opponents[0].opponentId,bob.id);assert.equal(history.opponents.find(p=>p.opponentId===carol.id).played,0);
 assert.equal(history.games[0].result,'pending');assert.equal(history.games[0].ratingChange,null);
 assert.equal(history.games.find(g=>g.round===2).result,'loss');assert.equal(history.games.find(g=>g.round===2).ratingChange,-17);
 assert.equal(history.games.find(g=>g.round===1).ratingChange,23);assert(history.games.every(g=>g.date===null&&g.color===null));
 const reverse=playerHistory(state,bob.id);assert.equal(reverse.summary.wins,2);assert.equal(reverse.summary.losses,1);assert.equal(reverse.summary.draws,1);
});
test('local and imported history reconcile with player totals after corrections, pending results and byes',()=>{
 const {state,alice}=fixture();const t=createTournament(state,{name:'Live Open',date:'2026-12-01',totalRounds:2,playerIds:state.players.map(p=>p.id)});nextRound(state,t);const m=t.rounds[0].matches.find(m=>m.black);
 m.result='1-0';
 for(const p of state.players){const history=playerHistory(state,p.id);const stat=playerStats(state)[p.id];assert.equal(history.summary.played,stat.games);assert.equal(history.summary.wins,stat.wins);assert.equal(history.summary.draws,stat.draws);assert.equal(history.summary.losses,stat.losses);}
 const white=playerHistory(state,m.white).games.find(g=>g.id===m.id);const black=playerHistory(state,m.black).games.find(g=>g.id===m.id);
 assert.equal(white.color,'white');assert.equal(white.result,'win');assert.equal(black.color,'black');assert.equal(black.result,'loss');assert.equal(black.ratingChange,tournamentRatings(t).changes[m.id].black);
 m.result='draw';assert.equal(playerHistory(state,m.black).games.find(g=>g.id===m.id).result,'draw');
 m.result=null;assert.equal(playerHistory(state,m.white).games.find(g=>g.id===m.id).ratingChange,null);
 const bye=t.rounds[0].matches.find(m=>!m.black);const byeHistory=playerHistory(state,bye.white);assert.equal(byeHistory.summary.byes,1);assert(!byeHistory.opponents.some(o=>o.opponentId===null));
 const before=JSON.stringify(state);playerHistory(state,alice.id);assert.equal(JSON.stringify(state),before);
});
test('history uses current opponent names and returns a useful empty result',()=>{
 const {state,alice,bob}=fixture();bob.name='Renamed Opponent';assert.equal(playerHistory(state,alice.id).opponents[0].opponentName,'Renamed Opponent');
 const newcomer=addPlayer(state,{name:'New Player'});const empty=playerHistory(state,newcomer.id);assert.equal(empty.summary.played,0);assert.deepEqual(empty.games,[]);assert.deepEqual(empty.opponents,[]);
 assert.throws(()=>playerHistory(state,'missing'),{message:'Player not found.',status:404});
});
test('history endpoint returns player-relative results and 404 for a missing player',async()=>{
 const store=createStore(':memory:');const {state,alice}=fixture();store.write(state);const app=createApp(store);const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try{const base=`http://127.0.0.1:${server.address().port}/api/players`;const response=await fetch(`${base}/${alice.id}/history`);assert.equal(response.status,200);const body=await response.json();assert.equal(body.summary.losses,2);assert.equal(body.games.length,5);assert.equal((await fetch(`${base}/missing/history`)).status,404);assert.equal(store.read().revision,0);}finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
