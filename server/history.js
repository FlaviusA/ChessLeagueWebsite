import { playedTournaments, requireThat, tournamentRatings } from './league.js';

export function playerHistory(state, playerId) {
  const player = state.players.find(p => p.id === playerId);
  requireThat(player, 'Player not found.', 404);
  const players = new Map(state.players.map(p => [p.id, p]));
  const games = [];
  for (const [index, game] of (state.gameImport?.games ?? []).entries()) {
    if (game.playerId !== playerId && game.opponentId !== playerId) continue;
    const first = game.playerId === playerId;
    const opponentId = first ? game.opponentId : game.playerId;
    const result = game.result === null ? 'pending' : first || game.result === 'draw' ? game.result : game.result === 'win' ? 'loss' : 'win';
    games.push({
      id: `import:${state.gameImport.sourceId}:${index}`, source: 'imported',
      opponentId, opponentName: players.get(opponentId)?.name ?? 'Unknown player',
      tournament: `Imported tournament #${game.tournament}`, tournamentId: null,
      round: game.round, date: null, color: null, result,
      ratingChange: result === 'pending' ? null : first ? game.ratings.playerChange : game.ratings.opponentChange
    });
  }
  for (const tournament of playedTournaments(state)) {
    if (!tournament.entries.some(entry => entry.playerId === playerId)) continue;
    const { changes } = tournamentRatings(tournament);
    for (const round of tournament.rounds) for (const match of round.matches) {
      if (match.white !== playerId && match.black !== playerId) continue;
      const white = match.white === playerId;
      const opponentId = white ? match.black : match.white;
      const result = !match.black ? 'bye' : match.result === null ? 'pending' : match.result === 'draw' ? 'draw' : (match.result === '1-0') === white ? 'win' : 'loss';
      games.push({
        id: match.id, source: 'tournament', opponentId,
        opponentName: opponentId ? players.get(opponentId)?.name ?? 'Unknown player' : null,
        tournament: tournament.name, tournamentId: tournament.id,
        round: round.number, date: tournament.date, color: opponentId ? white ? 'white' : 'black' : null,
        result, ratingChange: result === 'pending' ? null : result === 'bye' ? 0 : changes[match.id]?.[white ? 'white' : 'black'] ?? null
      });
    }
  }
  const summary = { played: 0, wins: 0, draws: 0, losses: 0, pending: 0, byes: 0 };
  const opponents = new Map();
  for (const game of games) {
    if (game.result === 'bye') { summary.byes++; continue; }
    if (!opponents.has(game.opponentId)) opponents.set(game.opponentId, { opponentId: game.opponentId, opponentName: game.opponentName, played: 0, wins: 0, draws: 0, losses: 0, pending: 0 });
    const opponent = opponents.get(game.opponentId);
    if (game.result === 'pending') { summary.pending++; opponent.pending++; continue; }
    const outcome = { win: 'wins', draw: 'draws', loss: 'losses' }[game.result];
    summary.played++; summary[outcome]++; opponent.played++; opponent[outcome]++;
  }
  return {
    playerId, playerName: player.name, revision: state.revision, summary,
    opponents: [...opponents.values()].sort((a, b) => b.losses - a.losses || b.played - a.played || a.opponentName.localeCompare(b.opponentName)),
    games: games.reverse()
  };
}
