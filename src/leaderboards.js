export const seasonPoints = player => player.importedStanding?.seasonPoints ?? 0;

export function sortLeaguePlayers(players, metric) {
  const ratingTie = (a, b) => b.rating - a.rating
    || (a.importedStanding?.rank ?? Infinity) - (b.importedStanding?.rank ?? Infinity)
    || a.name.localeCompare(b.name);
  return [...players].sort((a, b) =>
    (metric === 'points' ? seasonPoints(b) - seasonPoints(a) : 0) || ratingTie(a, b));
}
