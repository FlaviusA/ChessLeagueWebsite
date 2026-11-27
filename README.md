# Chess League

A responsive chess tournament manager for a recurring club league. Built with React, Vite, Express, and SQLite. This checkout is connected to `https://github.com/FlaviusA/ChessLeagueWebsite.git`.

## Start locally

Requires **Node.js 22.13 or newer** (Node 24+ recommended).

```sh
cd "$HOME/Documents/my apps/ChessApp"
npm install
npm run build
npm start
```

Open **http://127.0.0.1:3000**. For development with hot reload, use `npm run dev` instead of `npm start`. Both commands watch `server/` and automatically restart the backend when its code changes, keeping API routes in sync with updates. Production frontend changes still require `npm run build`.

The app opens with an empty league and **admin access enabled by default**. Select **Create your league** and enter a league name. There are no sample players, sample events, accounts, passwords, or sign-in steps. Click the league name in the sidebar to rename it later. Existing league records are preserved when upgrading.

1. Add players in **Players**. Set a starting rating for each or use the league default.
2. Create a tournament with a date, venue, time control, rounds, and selected players.
3. Open the event and select **Start tournament** to generate round 1.
4. Enter white win, draw, or black win for every board. Correct or clear results while that round is current.
5. Select **Pair next round** once all results are in. Earlier results then lock.
6. Finish the event after its final round. An explicit **Finish event early** option is also available after a complete round.
7. Create the next event using the same roster. Ratings carry across tournaments.

Only one tournament can be active at a time. Multiple future events can be in registration. Registrations and settings freeze when an event starts. Players with event history cannot be deleted, and their original starting ratings cannot be changed.

## Features

- Live tournament standings and an all-event league rating leaderboard.
- Server-Sent Events update viewers without refreshing. Reconnection fetches current standings.
- Default admin controls with no credentials. The `?view=live` link provides a spectator layout with editing controls hidden.
- Shared player roster, player profiles, win/loss/draw records, and rating history.
- Multiple recurring tournaments with preserved results and ratings.
- Club Swiss pairings for 2–64 players, up to 15 rounds, limited to players minus one.
- Odd-player byes, result corrections, manual rating/points adjustments, event history, CSV standings export, and JSON data export.
- Responsive desktop/mobile layouts, keyboard focus indicators, labeled forms, and modal keyboard handling.
- SQLite persistence and revision checks that prevent stale browser windows from overwriting newer changes.

## Swiss pairings and standings

The first round splits the field sorted by starting rating into upper and lower halves. Subsequent rounds use a bounded search that forbids rematches and prioritizes similar scores, with preferences for balanced colors and avoiding three consecutive games of one color. The lowest-ranked eligible player receives a full-point bye when needed; no player can receive two allocated byes in one event. If the search cannot find legal pairings, it reports an error rather than silently assigning repeat opponents.

This is a **club Swiss implementation, not a FIDE-certified Dutch pairing system**. Color constraints are preferences. There are no acceleration, withdrawal, late-entry, forfeit, or arbiter override rules. For an officially rated event, use certified pairing software and your federation’s requirements. Basic Swiss rules were consulted in the [FIDE Handbook](https://handbook.fide.com/chapter/C0401202507).

Scoring: win **1**, draw **0.5**, loss **0**, allocated bye **1**. Admin point adjustments also count toward standings, tie-breaks, and upcoming pairings. Standings are ordered by points, Buchholz, Sonneborn–Berger, wins, then starting rating. An internal stable player identifier resolves an otherwise exact tie. Buchholz here is the sum of actual opponents’ current scores for completed games. Sonneborn–Berger weights those scores by the result. Byes have no opponent, rating effect, or tie-break contribution. This simplified tie-break calculation does not use virtual opponents or FIDE adjustments for unplayed games.

## Imported season standings

`POST /api/import/standings` accepts a normalized standings baseline with player names, source ranks, ratings, season points, tournaments played, title eligibility, and season metadata. The import validates all rows before saving, rejects conflicting names or replacement baselines, and treats a repeated identical import as a no-op.

Imported ratings seed future tournaments. Historical tournament counts are included in player totals and the dashboard; match counts and results are not inferred. Imported season points and title eligibility remain the source snapshot, displayed in League ratings, Players, and player profiles. No season-points formula is assumed for future games. Source details are included in the JSON export.

`POST /api/import/games` imports historical game rows for the existing season roster. Completed wins, draws, and losses count for both players; blank results remain archived as pending and do not count as played. Source rating details are retained for reference without recalculating ratings already imported from standings. Imported events are not counted twice. Repeated identical imports do not duplicate statistics, and players referenced by archived games cannot be deleted. W/D/L appears in League ratings, Players, and player profiles.

## Player match history

Click any player in the leaderboard or Players roster to open their profile. **Match history** shows a head-to-head table with games played and wins, draws, and losses against each opponent, sorted by losses first. Click an opponent to filter their games, or use the opponent and result selectors to see only losses, wins, draws, unplayed games, or byes. Individual records show event, round, result, color where known, and the original rating change. Results are always from the selected player’s perspective.

History includes both imported games and events run in this app. Unplayed games and byes do not affect W/D/L. Imported dates and colors are left unknown when absent in the source. Profiles refresh their history when league results change. The **Rating journey** button retains access to rating adjustments and imported season information.

## Editing rankings as admin

Use the sliders icon in the leaderboard’s **Admin** column to select **Edit rankings** for a player:

- **League rating** sets their current rating. Adjustments appear in their rating journey and carry into later tournaments exactly once, without rewriting previous game results or event rating snapshots.
- **Tournament points** sets the player’s current total for the selected event, in half-point increments. This records a point adjustment; subsequent game points add to it. Adjustments are labeled beside the total in the leaderboard and are reflected in exported standings.
- **League ratings** mode edits the current rating only. The **Players** page and player profiles also provide rating controls.

You can adjust tournament points even after an event is completed. Result editing still follows the current-round rule. Tournament rating columns continue to show ratings earned under that event’s frozen rules; the league leaderboard shows the current rating including admin adjustments. Editing a historical event’s points does not regenerate previously paired rounds.

## Custom rating system

Use **Ratings & rules** to configure:

| Setting | Default | Purpose |
| --- | --- | --- |
| Starting rating | 1200 | Default for new players |
| K-factor | 32 | Rating sensitivity |
| Rating scale | 400 | Expected-score curve |
| Rating floor | 100 | Minimum resulting rating |

```text
Expected = 1 / (1 + 10 ^ ((opponentRating - playerRating) / scale))
NewRating = max(floor, playerRating + K × (score - Expected))
```

Here score is 1, 0.5, or 0. Each round uses its own frozen starting ratings, so result-entry order does not affect ratings. Full precision is kept internally; values are rounded only for display. Correcting the latest round recalculates its changes instead of applying a second update. Live event ratings are provisional until the event finishes. Rating settings are snapshotted when an event starts; edits apply to future events. Byes never affect ratings. This is custom Elo rather than an official FIDE rating calculation.

A calculator on the settings page previews wins, draws, and losses using your chosen parameters. The default formula can be replaced in `server/league.js` if you want a different custom model.

## Data and backups

Real data is stored in **`data/league.sqlite`**, created automatically on first launch. Keep the whole `data` directory when moving the app. It is excluded from Git, together with dependencies and build outputs.

- The leaderboard download icon exports the selected tournament’s standings as CSV.
- **Ratings & rules → Download league data (JSON)** exports player and tournament records. Legacy credential fields are excluded. This is a portable data export, not an automated restore feature.
- For a restorable full backup, stop the server and copy `data/league.sqlite` to a safe location. To restore, stop the server and replace it with the saved database. Never replace a database while the app is running.
- Admin mode is open by design: every visitor to the normal app has full editing access. The spectator URL hides controls; it is a viewing layout, not an authorization boundary. Legacy account records are ignored.

## Network access and deployment

The app binds to `127.0.0.1` by default. A spectator link hides editing controls, and a loopback address only works on the current computer.

To allow access on your local network:

```sh
HOST=0.0.0.0 PORT=3000 npm start
```

Players can then open `http://YOUR_COMPUTER_LAN_IP:3000/?view=live`. Keep the server running during events. Use the app’s **Public view** button from the address your viewers can reach to copy an event-specific link.

For internet hosting, deploy the Node server on a host with a **persistent disk**, preserve `data/`, and place it behind HTTPS. The frontend alone on GitHub Pages will not provide shared storage or live updates. Set `DATA_FILE` to an absolute SQLite path on a persistent volume if needed. This app is implemented locally; no public deployment or GitHub push has been performed.

## Checks

```sh
npm test
npm run build
```

Tests cover multi-round Swiss constraints, byes, first-round seeding, a 64-player field, Elo calculations and corrections, rating carry-over, rule snapshots, round guards, tie-breaks, default admin access without cookies, empty-state league creation, manual standings and rating updates, existing league compatibility, stale edits, live event broadcasts, persistence, and cross-origin request rejection.

Browser visual QA was unavailable in the implementation session; production HTML/API checks and the automated tests passed.
