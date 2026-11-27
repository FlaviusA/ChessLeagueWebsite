import React, { useState } from 'react';
import { Search, Radio, SlidersHorizontal, Trophy, TrendingUp } from 'lucide-react';
import { seasonPoints, sortLeaguePlayers } from './leaderboards.js';

export default function LeagueLeaderboard({ players, canEdit, online, onProfile, onEdit }) {
  const [query, setQuery] = useState('');
  const [metric, setMetric] = useState('points');
  const byPoints = metric === 'points';
  const title = byPoints ? 'Season points' : 'Rating rankings';
  const Icon = byPoints ? Trophy : TrendingUp;
  const ranked = sortLeaguePlayers(players, metric).map((player, index) => ({ player, rank: index + 1 }));
  const filtered = ranked.filter(({ player }) => `${player.name} ${player.club}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section className="panel leaderboard league-leaderboard" aria-label={`${title} leaderboard`}>
    <div className="panel-heading">
      <div><h2><Icon size={18}/>{title}</h2><p>{byPoints ? 'Ranked by season points. Rating breaks ties.' : 'Ranked by current league rating.'}</p></div>
      <span className="badge">{players.length} players</span>
    </div>
    <div className="table-toolbar leaderboard-toolbar">
      <div className="tabs" role="group" aria-label="Rank players by">
        <button type="button" className={byPoints ? 'active' : ''} aria-pressed={byPoints} onClick={() => setMetric('points')}><Trophy size={15}/>Season points</button>
        <button type="button" className={!byPoints ? 'active' : ''} aria-pressed={!byPoints} onClick={() => setMetric('rating')}><TrendingUp size={15}/>Ratings</button>
      </div>
    </div>
    <div className="search-row"><Search size={16}/><input aria-label={`Search ${title.toLowerCase()}`} placeholder="Find a player…" value={query} onChange={event => setQuery(event.target.value)}/></div>
    <div className="table-wrap"><table aria-label={title}>
      <thead><tr><th className="rank-col">#</th><th>Player</th><th aria-sort="descending">{byPoints ? 'Season pts' : 'Rating'}</th><th>W / D / L</th><th>{byPoints ? 'Events' : 'Played'}</th>{canEdit && <th>Admin</th>}</tr></thead>
      <tbody>{filtered.map(({ player, rank }) => <tr key={player.id} tabIndex={0} aria-label={`View ${player.name}`} onClick={() => onProfile(player)} onKeyDown={event => { if (event.key === 'Enter' && event.target === event.currentTarget) onProfile(player); }}>
        <td><span className={`rank rank-${rank}`}>{rank}</span></td>
        <td><div className="person"><span className={`avatar tone-${(player.name.charCodeAt(0) ?? 0) % 5}`}>{player.name.split(' ').map(word => word[0]).slice(0, 2).join('')}</span><div><strong>{player.name}</strong><small>{player.club || 'Independent player'}</small></div></div></td>
        <td>{byPoints ? <span className="points">{seasonPoints(player).toLocaleString()}</span> : <span className="rating-cell">{Math.round(player.rating).toLocaleString()}</span>}</td>
        <td className="mono">{player.wins} / {player.draws} / {player.losses}</td>
        <td className="mono muted">{byPoints ? player.events : player.games}</td>
        {canEdit && <td><button className="icon-button" title="Edit league rating" aria-label={`Edit league rating for ${player.name}`} onClick={event => { event.stopPropagation(); onEdit(player); }}><SlidersHorizontal size={17}/></button></td>}
      </tr>)}</tbody>
    </table>{!filtered.length && <div className="no-results">{players.length ? 'No players found.' : 'Add players to start your leaderboard.'}</div>}</div>
    <div className="table-foot"><span><Radio size={14}/>{online ? 'Updates automatically' : 'Waiting to reconnect'}</span><span className="leaderboard-note" aria-live="polite">{byPoints ? 'Season totals' : 'Current ratings'}</span></div>
  </section>;
}
