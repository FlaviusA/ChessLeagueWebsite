import { randomUUID } from 'node:crypto';

export class LeagueError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export const id = () => randomUUID();
export const defaults = { leagueName: 'Chess League', startingRating: 1200, kFactor: 32, ratingScale: 400, ratingFloor: 100 };
export const initialState = () => ({ revision: 0, settings: { ...defaults }, players: [], tournaments: [], leagueCreated: false });
export function requireThat(condition, message, status = 400) { if (!condition) throw new LeagueError(message, status); }
export function cleanName(value, label = 'Name') { requireThat(typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 80, `${label} must contain 2–80 characters.`); return value.trim(); }
export function number(value, min, max, label) { requireThat(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, `${label} must be between ${min} and ${max}.`); return value; }
export function tournamentById(state, tid) { const t = state.tournaments.find(t => t.id === tid); requireThat(t, 'Tournament not found.', 404); return t; }
export function tournamentRatings(t) {
  const ratings = Object.fromEntries(t.entries.map(e => [e.playerId, e.startRating]));
  const changes = {};
  for (const round of t.rounds) {
    const before = { ...ratings };
    for (const match of round.matches) {
      if (!match.black || match.result === null) continue;
      const score = { '1-0': 1, '0-1': 0, 'draw': 0.5 }[match.result];
      const expected = 1 / (1 + 10 ** ((before[match.black] - before[match.white]) / t.ratingSettings.ratingScale));
      const delta = t.ratingSettings.kFactor * (score - expected);
      const w = Math.max(t.ratingSettings.ratingFloor, before[match.white] + delta);
      const b = Math.max(t.ratingSettings.ratingFloor, before[match.black] - delta);
      ratings[match.white] = w; ratings[match.black] = b;
      changes[match.id] = { white: w - before[match.white], black: b - before[match.black] };
    }
  }
  return { ratings, changes };
}
export function playedTournaments(state) {
  return state.tournaments.filter(t=>t.rounds.length).sort((a,b)=>(a.startedOrder??0)-(b.startedOrder??0) || (a.rounds[0].createdAt??a.createdAt).localeCompare(b.rounds[0].createdAt??b.createdAt));
}
export function adjustRankings(state, playerId, body) {
  const player=state.players.find(p=>p.id===playerId);requireThat(player,'Player not found.',404);
  requireThat(body.rating!==undefined || body.score!==undefined,'Provide a rating or tournament points.');
  if(body.score!==undefined){
    const t=tournamentById(state,body.tournamentId);
    const row=standings(state,t).find(row=>row.playerId===playerId);requireThat(row,'Player is not registered in this tournament.');
    const score=number(body.score,0,100,'Tournament points');requireThat(Number.isInteger(score*2),'Points must be in half-point increments.');
    t.scoreAdjustments??={};t.scoreAdjustments[playerId]=score-(row.score-row.scoreAdjustment);
  }
  if(body.rating!==undefined){
    const rating=number(body.rating,0,4000,'League rating');const current=playerStats(state)[playerId].rating;
    const last=playedTournaments(state).filter(t=>t.entries.some(e=>e.playerId===playerId)).at(-1);
    if(rating!==current){player.ratingAdjustments??=[];player.ratingAdjustments.push({id:id(),amount:rating-current,afterTournamentId:last?.id??null,createdAt:new Date().toISOString()});}
  }
}
export function playerStats(state) {
  const stats = Object.fromEntries(state.players.map(p => [p.id, { rating: p.initialRating, games: 0, importedGames: 0, importedPendingGames: 0, wins: 0, draws: 0, losses: 0, events: p.importedStanding?.tournaments??0, points: 0, ratingHistory: [{ label: p.importedStanding?'Imported rating':'Starting rating', rating: p.initialRating }] }]));
  // Standings ratings already include these historical games: count outcomes only.
  for(const game of state.gameImport?.games??[]) {
    const player=stats[game.playerId], opponent=stats[game.opponentId];
    if(game.result===null){player.importedPendingGames++;opponent.importedPendingGames++;continue;}
    player.games++;opponent.games++;player.importedGames++;opponent.importedGames++;
    if(game.result==='draw'){player.draws++;opponent.draws++;player.points+=0.5;opponent.points+=0.5;}
    else {const winner=game.result==='win'?player:opponent;const loser=game.result==='win'?opponent:player;winner.wins++;winner.points++;loser.losses++;}
  }
  const applyAdjustments = (p, afterTournamentId) => {
    const stat=stats[p.id];
    for(const adjustment of p.ratingAdjustments??[]) if(adjustment.afterTournamentId===afterTournamentId){
      stat.rating+=adjustment.amount;
      stat.ratingHistory.push({label:'Admin adjustment',rating:stat.rating});
    }
  };
  state.players.forEach(p=>applyAdjustments(p,null));
  for (const t of playedTournaments(state)) {
    const { ratings } = tournamentRatings(t);
    for (const e of t.entries) { const s = stats[e.playerId]; if (t.rounds.length) { s.events++; s.rating = ratings[e.playerId]; s.ratingHistory.push({label: t.name, rating: ratings[e.playerId]}); applyAdjustments(state.players.find(p=>p.id===e.playerId),t.id); } }
    for (const r of t.rounds) for (const m of r.matches) {
      if (m.result === null) continue;
      if (!m.black) { stats[m.white].points++; continue; }
      for (const pid of [m.white, m.black]) stats[pid].games++;
      if (m.result === 'draw') { for (const pid of [m.white, m.black]) { stats[pid].draws++; stats[pid].points += 0.5; } }
      else { const winner = m.result === '1-0' ? m.white : m.black; const loser = m.result === '1-0' ? m.black : m.white; stats[winner].wins++; stats[winner].points++; stats[loser].losses++; }
    }
  }
  return stats;
}
export function standings(state, t) {
  const stats = new Map(t.entries.map(e => [e.playerId, { playerId: e.playerId, score: 0, wins: 0, draws: 0, losses: 0, played: 0, opponents: [], colors: [], bye: false, buchholz: 0, sonneborn: 0, startRating: e.startRating }]));
  for (const round of t.rounds) for (const m of round.matches) {
    const white = stats.get(m.white); const black = stats.get(m.black);
    if (!black) { white.bye = true; if (m.result === 'bye') white.score += 1; continue; }
    white.opponents.push({ id: m.black, result: m.result === null ? null : m.result === '1-0' ? 1 : m.result === 'draw' ? 0.5 : 0 });
    black.opponents.push({ id: m.white, result: m.result === null ? null : m.result === '0-1' ? 1 : m.result === 'draw' ? 0.5 : 0 });
    white.colors.push('white'); black.colors.push('black');
    if (m.result === null) continue;
    white.played++; black.played++;
    if (m.result === 'draw') { white.draws++; black.draws++; white.score += .5; black.score += .5; }
    else { const w = m.result === '1-0' ? white : black; const l = m.result === '1-0' ? black : white; w.wins++; w.score++; l.losses++; }
  }
  for(const s of stats.values()){s.scoreAdjustment=t.scoreAdjustments?.[s.playerId]??0;s.score+=s.scoreAdjustment;}
  const { ratings } = tournamentRatings(t);
  for (const s of stats.values()) {
    for (const o of s.opponents) if (o.result !== null) { s.buchholz += stats.get(o.id).score; s.sonneborn += stats.get(o.id).score * o.result; }
    s.rating = ratings[s.playerId]; s.ratingChange = s.rating - s.startRating;
  }
  return [...stats.values()].sort((a,b) => b.score-a.score || b.buchholz-a.buchholz || b.sonneborn-a.sonneborn || b.wins-a.wins || b.startRating-a.startRating || a.playerId.localeCompare(b.playerId)).map((s,i) => ({...s, rank:i+1}));
}
function colorCost(player, color) {
  const balance = player.colors.reduce((n,c) => n + (c === 'white' ? 1 : -1), 0) + (color === 'white' ? 1 : -1);
  const last = player.colors.at(-1), previous = player.colors.at(-2);
  return Math.abs(balance) * 5 + (last === color ? 2 : 0) + (last === color && previous === color ? 60 : 0) + (Math.abs(balance) > 2 ? 60 : 0);
}
function orient(a, b, round) {
  const ab = colorCost(a,'white') + colorCost(b,'black');
  const ba = colorCost(a,'black') + colorCost(b,'white');
  if (ab < ba || (ab === ba && round % 2 === 1)) return {white:a.playerId, black:b.playerId, cost:ab};
  return {white:b.playerId, black:a.playerId, cost:ba};
}
// Club Swiss: hard no-rematch / one-bye rules, weighted score groups and color preferences.
// Bounded branch-and-bound keeps large fields responsive; this is not FIDE Dutch certification.
export function swissPairings(state, t) {
  const ranked = standings(state,t); const round = t.rounds.length + 1;
  requireThat(ranked.length >= 2, 'Add at least two players before starting.');
  const byeCandidates = ranked.length % 2 ? [...ranked].reverse().filter(p => !p.bye) : [null];
  requireThat(byeCandidates.length, 'No player is eligible for another bye.');
  for (const bye of byeCandidates) {
    const field = ranked.filter(p => p !== bye);
    if (round === 1) {
      const half = field.length / 2;
      return [...field.slice(0,half).map((a,i) => orient(a,field[i+half],round+i)), ...(bye ? [{white:bye.playerId,black:null}] : [])].map((p,i) => ({id:id(),board:i+1,white:p.white,black:p.black,result:p.black ? null : 'bye'}));
    }
    const legal = (a,b) => !a.opponents.some(o=>o.id === b.playerId);
    const cost = (a,b) => Math.abs(a.score-b.score)*1000 + orient(a,b,round).cost + Math.abs(a.rank-b.rank)*0.01;
    let best = null, bestCost = Infinity, visited = 0;
    const search = (remaining, pairs, total) => {
      if (++visited > 180000 || total >= bestCost) return;
      if (!remaining.length) { best = [...pairs]; bestCost = total; return; }
      let a, candidates;
      for (const p of remaining) {
        const options = remaining.filter(q=>q!==p && legal(p,q));
        if (!options.length) return;
        if (!candidates || options.length < candidates.length) { a=p; candidates=options; }
      }
      candidates.sort((b,c)=>cost(a,b)-cost(a,c));
      for (const b of candidates) search(remaining.filter(p=>p!==a&&p!==b), [...pairs,orient(a,b,round)], total+cost(a,b));
    };
    search(field,[],0);
    if (best) return [...best, ...(bye?[{white:bye.playerId,black:null}]:[])].map((p,i)=>({id:id(),board:i+1,white:p.white,black:p.black,result:p.black?null:'bye'}));
  }
  throw new LeagueError('No valid pairing found without repeat opponents. Finish this event or use fewer rounds.');
}
export function addPlayer(state, body) {
  const name=cleanName(body.name,'Player name');
  requireThat(!state.players.some(p=>p.name.toLowerCase()===name.toLowerCase()),'A player with that name already exists.');
  const initialRating = number(body.initialRating ?? state.settings.startingRating, 100, 4000, 'Starting rating');
  const club=typeof body.club==='string'?body.club.trim().slice(0,80):'';
  state.leagueCreated=true;
  const player={id:id(),name,club,initialRating,createdAt:new Date().toISOString()}; state.players.push(player); return player;
}
export function createTournament(state, body) {
  const name=cleanName(body.name,'Tournament name');
  const rounds=number(body.totalRounds,1,15,'Rounds'); requireThat(Number.isInteger(rounds),'Rounds must be a whole number.');
  requireThat(typeof body.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) && !Number.isNaN(Date.parse(body.date)), 'Choose a valid event date.');
  const playerIds = body.playerIds ?? [];
  requireThat(Array.isArray(playerIds) && playerIds.length <= 64 && new Set(playerIds).size===playerIds.length && playerIds.every(pid=>state.players.some(p=>p.id===pid)),'Choose up to 64 registered players.');
  const stats=playerStats(state);
  const t={id:id(),name,date:body.date,location:typeof body.location==='string'?body.location.trim().slice(0,100):'',timeControl:typeof body.timeControl==='string'?body.timeControl.trim().slice(0,40):'10 + 5',totalRounds:rounds,status:'registration',entries:playerIds.map(pid=>({playerId:pid,startRating:stats[pid].rating})),ratingSettings:{...state.settings},rounds:[],createdAt:new Date().toISOString()};
  state.leagueCreated=true;state.tournaments.push(t); return t;
}
export function nextRound(state,t) {
  requireThat(t.status!=='completed','This event is completed.');
  requireThat(!state.tournaments.some(x=>x.id!==t.id&&x.status==='active'),'Finish the active tournament before starting another.');
  requireThat(t.rounds.length<t.totalRounds,'All scheduled rounds have been paired.');
  requireThat(!t.rounds.length || t.rounds.at(-1).matches.every(m=>m.result!==null),'Enter all results before pairing the next round.');
  requireThat(t.entries.length>=2,'Register at least two players.');
  requireThat(t.totalRounds<=t.entries.length-1,`With ${t.entries.length} players, choose at most ${t.entries.length-1} rounds.`);
  if (!t.rounds.length) { const stats=playerStats(state); t.entries.forEach(e=>{e.startRating=stats[e.playerId].rating;}); t.ratingSettings={...state.settings}; }
  const matches=swissPairings(state,t);
  if(!t.rounds.length)t.startedOrder=Math.max(0,...state.tournaments.map(event=>event.startedOrder??0))+1;
  t.rounds.push({number:t.rounds.length+1,matches,createdAt:new Date().toISOString()}); t.status='active';
}
export function publicState(state) {
  const stats=playerStats(state);
  return {revision:state.revision,settings:state.settings,seasonImport:state.seasonImport??null,gameImport:state.gameImport?{sourceName:state.gameImport.sourceName,completedCount:state.gameImport.completedCount,pendingCount:state.gameImport.pendingCount,importedAt:state.gameImport.importedAt}:null,leagueCreated:!!(state.leagueCreated||state.players.length||state.tournaments.length||state.credentials),players:state.players.map(p=>({...p,...stats[p.id]})),tournaments:state.tournaments.map(t=>({...t,standings:standings(state,t),rounds:t.rounds.map(r=>({...r,matches:r.matches.map(m=>({...m,ratingChange:tournamentRatings(t).changes[m.id]??null}))}))}))};
}
