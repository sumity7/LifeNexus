const KEY = 'lifeos:recent-searches';
const MAX = 8;

export function readRecentSearches() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(q) {
  const next = [q, ...readRecentSearches().filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}
