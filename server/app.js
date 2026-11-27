import express from 'express';
import { playerHistory } from './history.js';
import { importStandings, importGames } from './import.js';
import { initialState, publicState, adjustRankings, LeagueError, requireThat, cleanName, number, addPlayer, createTournament, nextRound, tournamentById } from './league.js';
export function createApp(store) {
  const app=express(); const clients=new Set();
  app.disable('x-powered-by');
  app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');next();});
  app.use('/api',express.json({limit:'100kb'}));
  app.use('/api',(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)){
      const origin=req.get('origin');
      if(origin){try {requireThat(new URL(origin).host===req.get('host'),'Request origin is not allowed.',403);}catch(e){return next(e);}}
      if(req.get('sec-fetch-site')==='cross-site')return next(new LeagueError('Request origin is not allowed.',403));
    }
    next();
  });
  const notify=()=>{for(const client of clients)client.write(`data: ${JSON.stringify({revision:store.read().revision})}\n\n`);};
  const mutate=(fn)=>(req,res,next)=>{try{const state=store.read();requireThat(req.body?.revision===state.revision,'The league changed in another window. Your view has been refreshed; please try again.',409);fn(state,req);state.revision++;store.write(state);notify();res.json(publicState(state));}catch(e){next(e);}};
  app.get('/api/state',(req,res)=>res.json(publicState(store.read())));
  app.get('/api/players/:id/history',(req,res,next)=>{try{res.json(playerHistory(store.read(),req.params.id));}catch(error){next(error);}});
  app.get('/api/session',(req,res)=>res.json({admin:true,authMode:'open'}));
  app.get('/api/events',(req,res)=>{
    res.setHeader('Content-Type','text/event-stream');res.setHeader('Connection','keep-alive');res.setHeader('X-Accel-Buffering','no');res.flushHeaders();res.write('event: connected\ndata: {}\n\n');clients.add(res);
    const timer=setInterval(()=>res.write(': heartbeat\n\n'),20000);req.on('close',()=>{clients.delete(res);clearInterval(timer);});
  });
  // Open admin mode is intentional: no account, password, or session is required.
  app.post('/api/import/games',mutate((s,req)=>importGames(s,req.body)));
  app.post('/api/import/standings',mutate((s,req)=>importStandings(s,req.body)));
  app.post('/api/league',mutate((s,req)=>{s.settings.leagueName=cleanName(req.body.leagueName,'League name');s.leagueCreated=true;}));
  app.patch('/api/players/:id/ranking',mutate((s,req)=>adjustRankings(s,req.params.id,req.body)));
  app.post('/api/players',mutate((s,req)=>addPlayer(s,req.body)));
  app.patch('/api/players/:id',mutate((s,req)=>{
    const p=s.players.find(p=>p.id===req.params.id);requireThat(p,'Player not found.',404);
    const name=cleanName(req.body.name,'Player name');requireThat(!s.players.some(x=>x.id!==p.id&&x.name.toLowerCase()===name.toLowerCase()),'A player with that name already exists.');
    if(req.body.initialRating!==p.initialRating)requireThat(!s.tournaments.some(t=>t.rounds.length&&t.entries.some(e=>e.playerId===p.id)),'Starting ratings are locked after a player has competed.');
    p.name=name;p.club=typeof req.body.club==='string'?req.body.club.trim().slice(0,80):'';p.initialRating=number(req.body.initialRating,100,4000,'Starting rating');
  }));
  app.delete('/api/players/:id',mutate((s,req)=>{
    requireThat(s.players.some(p=>p.id===req.params.id),'Player not found.',404);requireThat(!s.tournaments.some(t=>t.entries.some(e=>e.playerId===req.params.id))&&!(s.gameImport?.games??[]).some(g=>g.playerId===req.params.id||g.opponentId===req.params.id),'Remove this player from event registration first. Players with tournament history cannot be deleted.');s.players=s.players.filter(p=>p.id!==req.params.id);
  }));
  app.post('/api/tournaments',mutate((s,req)=>createTournament(s,req.body)));
  app.patch('/api/tournaments/:id',mutate((s,req)=>{
    const t=tournamentById(s,req.params.id);requireThat(t.status==='registration','Registration is locked once an event starts.');
    const temp=initialState();temp.players=s.players;temp.tournaments=s.tournaments;temp.settings=s.settings;
    const updated=createTournament({...temp,tournaments:[...s.tournaments]},req.body);
    Object.assign(t,{name:updated.name,date:updated.date,location:updated.location,timeControl:updated.timeControl,totalRounds:updated.totalRounds,entries:updated.entries});
  }));
  app.delete('/api/tournaments/:id',mutate((s,req)=>{const t=tournamentById(s,req.params.id);requireThat(t.status==='registration','Only unstarted events can be deleted.');s.tournaments=s.tournaments.filter(x=>x!==t);}));
  app.post('/api/tournaments/:id/pair',mutate((s,req)=>nextRound(s,tournamentById(s,req.params.id))));
  app.patch('/api/tournaments/:id/results/:matchId',mutate((s,req)=>{
    const t=tournamentById(s,req.params.id);requireThat(t.status==='active','Results can only be entered for an active event.');const m=t.rounds.at(-1)?.matches.find(m=>m.id===req.params.matchId);requireThat(m&&m.black,'Only games in the latest round can be edited.');requireThat(['1-0','draw','0-1',null].includes(req.body.result),'Choose a valid result.');m.result=req.body.result;
  }));
  app.post('/api/tournaments/:id/finish',mutate((s,req)=>{
    const t=tournamentById(s,req.params.id);requireThat(t.status==='active'&&t.rounds.length,'Start the event before finishing.');requireThat(t.rounds.at(-1).matches.every(m=>m.result!==null),'Enter every result before finishing.');requireThat(t.rounds.length===t.totalRounds||req.body.early===true,'Confirm that you want to finish this event early.');t.status='completed';t.finishedAt=new Date().toISOString();
  }));
  app.patch('/api/settings',mutate((s,req)=>{
    const b=req.body;s.leagueCreated=true;s.settings={leagueName:cleanName(b.leagueName,'League name'),startingRating:number(b.startingRating,100,4000,'Starting rating'),kFactor:number(b.kFactor,1,100,'K-factor'),ratingScale:number(b.ratingScale,100,1000,'Rating scale'),ratingFloor:number(b.ratingFloor,0,1000,'Rating floor')};requireThat(s.settings.startingRating>=s.settings.ratingFloor,'Starting rating must be at least the rating floor.');
  }));
  app.get('/api/backup',(req,res)=>{const s=store.read();const {credentials,...backup}=s;res.attachment('chess-league-backup.json').json({version:1,exportedAt:new Date().toISOString(),...backup});});
  app.use('/api',(req,res)=>res.status(404).json({error:'API route not found.'}));
  app.use((error,req,res,next)=>{if(res.headersSent)return next(error);const status=error.status??500;if(status>=500)console.error(error);res.status(status).json({error:status>=500?'Something went wrong. Please try again.':error.message});});
  app.closeEvents=()=>{for(const client of clients)client.end();};return app;
}
