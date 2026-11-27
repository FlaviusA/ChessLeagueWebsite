import React, { useEffect, useState } from 'react';
import { Search, RefreshCw, X } from 'lucide-react';

const outcomeLabels = { win: 'Win', draw: 'Draw', loss: 'Loss', pending: 'Unplayed', bye: 'Bye' };
export default function PlayerHistory({ playerId, revision }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [opponentId, setOpponentId] = useState('');
  const [result, setResult] = useState('completed');
  const [limit, setLimit] = useState(20);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetch(`/api/players/${encodeURIComponent(playerId)}/history`, { signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw Error(body.error || 'Could not load match history.'); return body; })
      .then(setData)
      .catch(error => { if (error.name !== 'AbortError') setError(error.message); });
    return () => controller.abort();
  }, [playerId, revision, retry]);
  useEffect(() => { setLimit(20); }, [query, opponentId, result]);
  if (error) return <div className="history-error" role="alert"><p>{error}</p><button className="secondary" onClick={() => setRetry(retry + 1)}><RefreshCw size={15}/>Retry history</button></div>;
  if (!data) return <p className="history-loading" role="status">Loading match history…</p>;
  const search = query.trim().toLocaleLowerCase();
  const opponents = data.opponents.filter(opponent => opponent.opponentName.toLocaleLowerCase().includes(search));
  const games = data.games.filter(game =>
    (!opponentId || game.opponentId === opponentId)
    && (game.opponentName ?? 'bye').toLocaleLowerCase().includes(search)
    && (result === 'all' || (result === 'completed' ? ['win', 'draw', 'loss'].includes(game.result) : game.result === result)));
  return <div className="player-history">
    <div className="history-heading"><h3>Head-to-head</h3><p>Results from this player’s perspective. Opponents with the most losses appear first.</p></div>
    <div className="search-row history-search"><Search size={16}/><input aria-label="Search match history by opponent" placeholder="Find an opponent…" value={query} onChange={event => setQuery(event.target.value)}/></div>
    <div className="table-wrap history-opponents"><table aria-label="Results by opponent"><thead><tr><th>Opponent</th><th>Played</th><th>Wins</th><th>Draws</th><th aria-sort="descending">Losses</th></tr></thead><tbody>
      {opponents.map(opponent => <tr key={opponent.opponentId} className={opponentId === opponent.opponentId ? 'selected-opponent' : ''}>
        <td><button className="opponent-button" aria-pressed={opponentId === opponent.opponentId} title={`Filter games against ${opponent.opponentName}`} onClick={() => setOpponentId(opponentId === opponent.opponentId ? '' : opponent.opponentId)}>{opponent.opponentName}</button></td>
        <td className="mono">{opponent.played}</td><td className="mono history-wins">{opponent.wins}</td><td className="mono">{opponent.draws}</td><td className={`mono ${opponent.losses ? 'history-losses' : ''}`}>{opponent.losses}</td>
      </tr>)}
    </tbody></table>{!opponents.length && <p className="no-results">{data.opponents.length ? 'No opponents match your search.' : 'No opponents recorded yet.'}</p>}</div>
    <div className="history-heading history-game-heading"><div><h3>Match history</h3><p>{data.summary.played} completed · {data.summary.pending} unplayed{data.summary.byes ? ` · ${data.summary.byes} byes` : ''}</p></div></div>
    <div className="history-filters">
      <label><span>Opponent</span><select aria-label="Filter history by opponent" value={opponentId} onChange={event => setOpponentId(event.target.value)}><option value="">All opponents</option>{data.opponents.map(opponent => <option key={opponent.opponentId} value={opponent.opponentId}>{opponent.opponentName}</option>)}</select></label>
      <label><span>Result</span><select aria-label="Filter match results" value={result} onChange={event => setResult(event.target.value)}><option value="completed">Completed games</option><option value="all">All games</option><option value="win">Wins</option><option value="draw">Draws</option><option value="loss">Losses</option><option value="pending">Unplayed</option><option value="bye">Byes</option></select></label>
      {(opponentId || query || result !== 'completed') && <button className="text-button" onClick={() => { setOpponentId(''); setQuery(''); setResult('completed'); }}><X size={14}/>Clear filters</button>}
    </div>
    <p className="history-result-count" role="status">{games.length} matching {games.length === 1 ? 'game' : 'games'}</p>
    <div className="table-wrap history-games"><table aria-label="Individual match history"><thead><tr><th>Opponent</th><th>Event / round</th><th>Result</th><th>Color</th><th>Rating Δ</th></tr></thead><tbody>
      {games.slice(0, limit).map(game => <tr key={game.id}>
        <td><strong>{game.opponentName || 'Allocated bye'}</strong></td>
        <td><span>{game.tournament}</span><small>Round {game.round}{game.date ? ` · ${new Date(`${game.date}T12:00:00`).toLocaleDateString()}` : ''}</small></td>
        <td><span className={`history-outcome outcome-${game.result}`}>{outcomeLabels[game.result]}</span></td>
        <td className="muted">{game.color ? game.color === 'white' ? 'White' : 'Black' : '—'}</td>
        <td className={`mono ${game.ratingChange < 0 ? 'history-losses' : game.ratingChange > 0 ? 'history-wins' : 'muted'}`}>{game.ratingChange === null ? '—' : `${Math.round(game.ratingChange) > 0 ? '+' : ''}${Math.round(game.ratingChange)}`}</td>
      </tr>)}
    </tbody></table>{!games.length && <p className="no-results">No games match these filters.</p>}</div>
    {games.length > limit && <button className="secondary history-more" onClick={() => setLimit(limit + 20)}>Show more games</button>}
    <p className="form-note">Unplayed games and byes do not count toward W/D/L. Imported games retain their original rating changes; their dates and colors weren’t provided.</p>
  </div>;
}
