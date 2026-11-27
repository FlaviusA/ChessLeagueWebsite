import test from 'node:test';
import assert from 'node:assert/strict';
import { sortLeaguePlayers } from '../src/leaderboards.js';
const players = [
 {id:'rating-leader',name:'Rating Leader',rating:1115,importedStanding:{rank:1,seasonPoints:23}},
 {id:'points-leader',name:'Points Leader',rating:1098,importedStanding:{rank:4,seasonPoints:24}},
 {id:'points-tie',name:'Points Tie',rating:1106,importedStanding:{rank:2,seasonPoints:23}},
 {id:'new',name:'New Player',rating:1000}
];
test('season and rating tables have independent orderings and preserve the roster',()=>{
 const before=structuredClone(players);
 assert.deepEqual(sortLeaguePlayers(players,'points').map(p=>p.id),['points-leader','rating-leader','points-tie','new']);
 assert.deepEqual(sortLeaguePlayers(players,'rating').map(p=>p.id),['rating-leader','points-tie','points-leader','new']);
 assert.deepEqual(players,before);
});
test('rating changes update the rating order and resolve season-point ties',()=>{
 const updated=structuredClone(players);updated[2].rating=1200;
 assert.equal(sortLeaguePlayers(updated,'rating')[0].id,'points-tie');
 assert.equal(sortLeaguePlayers(updated,'points')[0].id,'points-leader');
 assert.equal(sortLeaguePlayers(updated,'points')[1].id,'points-tie');
});
test('exact rating ties retain imported rank, then use player name',()=>{
 const tied=[
 {id:'late',name:'Aaron',rating:1000,importedStanding:{rank:3,seasonPoints:10}},
 {id:'early',name:'Zoe',rating:1000,importedStanding:{rank:1,seasonPoints:10}}
 ];
 for(const metric of ['rating','points'])assert.equal(sortLeaguePlayers(tied,metric)[0].id,'early');
 assert.deepEqual(sortLeaguePlayers([{name:'Zoe',rating:900},{name:'Alex',rating:900}],'rating').map(p=>p.name),['Alex','Zoe']);
 assert.deepEqual(sortLeaguePlayers([],'points'),[]);
});
