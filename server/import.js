import { createHash } from 'node:crypto';
import { addPlayer, cleanName, number, requireThat } from './league.js';

// Import a season baseline, without inventing past matches or tournament scores.
export function importStandings(state, body) {
  requireThat(Array.isArray(body.players) && body.players.length > 0 && body.players.length <= 1000, 'Provide 1–1000 standings rows.');
  const integer = (value, min, max, label) => {
    number(value, min, max, label);
    requireThat(Number.isInteger(value), `${label} must be a whole number.`);
    return value;
  };
  const rows = body.players.map(row => {
    requireThat(row && typeof row === 'object', 'Invalid standings row.');
    requireThat(typeof row.eligibleForTitle === 'boolean', 'Title eligibility must be Yes or No.');
    return {
      rank: integer(row.rank, 1, 10000, 'Rank'),
      name: cleanName(row.name, 'Player name').normalize('NFC'),
      rating: number(row.rating, 100, 4000, 'Rating'),
      seasonPoints: number(row.seasonPoints, 0, 100000, 'Season points'),
      tournaments: integer(row.tournaments, 0, 10000, 'Tournaments played'),
      eligibleForTitle: row.eligibleForTitle
    };
  }).sort((a,b) => a.rank-b.rank);
  const tournamentCount = integer(body.tournamentCount, 0, 10000, 'Season tournament count');
  const titleRequirement = integer(body.titleRequirement, 1, 10000, 'Title requirement');
  requireThat(rows.every(row => row.tournaments <= tournamentCount), 'A player cannot have more tournaments than the season total.');
  requireThat(new Set(rows.map(row => row.rank)).size === rows.length, 'The file contains duplicate ranks.');
  requireThat(new Set(rows.map(row => row.name.toLocaleLowerCase())).size === rows.length, 'The file contains duplicate players.');
  const sourceId = createHash('sha256').update(JSON.stringify({rows,tournamentCount,titleRequirement})).digest('hex');
  if(state.seasonImport?.sourceId === sourceId) return; // Repeating an import must never duplicate players or history.
  requireThat(!state.seasonImport, 'Season standings have already been imported. Edit existing players instead.');
  requireThat(rows.every(row => !state.players.some(p => p.name.normalize('NFC').toLocaleLowerCase() === row.name.toLocaleLowerCase())), 'An imported player already exists. Import cancelled without changing any players.');
  const importedAt = new Date().toISOString();
  const sourceName = typeof body.sourceName === 'string' ? body.sourceName.slice(0,200) : 'Imported standings';
  for(const row of rows) {
    const p = addPlayer(state, {name:row.name, initialRating:row.rating});
    p.importedStanding = {...row,sourceId,importedAt};
  }
  state.seasonImport = {sourceId,sourceName,importedAt,tournamentCount,titleRequirement,playerCount:rows.length};
}

export function importGames(state, body) {
  requireThat(state.seasonImport, 'Import season standings before importing historical games.');
  requireThat(Array.isArray(body.games) && body.games.length > 0 && body.games.length <= 1000, 'Provide 1–1000 game rows.');
  const byName = new Map(state.players.map(p => [p.name.normalize('NFC').toLocaleLowerCase(), p.id]));
  const findPlayer = name => {
    const normalized = cleanName(name, 'Player name').normalize('NFC').toLocaleLowerCase();
    const playerId = byName.get(normalized);
    requireThat(playerId, `Player not found: ${name}. Import cancelled.`);
    return playerId;
  };
  const seen = new Set();
  const games = body.games.map(row => {
    requireThat(row && typeof row === 'object', 'Invalid game row.');
    const tournament = number(row.tournament, 1, state.seasonImport.tournamentCount, 'Tournament number');
    const round = number(row.round, 1, 1000, 'Round');
    requireThat(Number.isInteger(tournament) && Number.isInteger(round), 'Tournament and round numbers must be whole numbers.');
    const playerId = findPlayer(row.player), opponentId = findPlayer(row.opponent);
    requireThat(playerId !== opponentId, 'A player cannot play themselves.');
    requireThat(['win', 'draw', 'loss', null].includes(row.result), 'Game result must be Win, Draw, Loss, or blank.');
    const key = JSON.stringify([tournament,round,[playerId,opponentId].sort()]);
    requireThat(!seen.has(key), 'Duplicate game in the same tournament and round. Import cancelled.');
    seen.add(key);
    requireThat(row.ratings && typeof row.ratings === 'object', 'Source rating details are required.');
    const ratings = {};
    for(const key of ['playerBefore','opponentBefore','playerChange','opponentChange','playerAfter','opponentAfter']) {
      ratings[key] = number(row.ratings[key], key.endsWith('Change') ? -10000 : 0, 10000, key);
    }
    return {tournament,round,playerId,opponentId,result:row.result,ratings};
  });
  const sourceId = createHash('sha256').update(JSON.stringify(games)).digest('hex');
  if(state.gameImport?.sourceId === sourceId) return;
  requireThat(!state.gameImport, 'Historical games have already been imported. A different file cannot be added on top of them.');
  state.gameImport = {
    sourceId,sourceName:typeof body.sourceName === 'string' ? body.sourceName.slice(0,200) : 'Imported games',
    importedAt:new Date().toISOString(),completedCount:games.filter(g=>g.result!==null).length,
    pendingCount:games.filter(g=>g.result===null).length,games
  };
}
