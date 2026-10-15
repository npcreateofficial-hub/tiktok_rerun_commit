// Deliberately omit URLs, query strings, headers, cookies and response bodies.
function recordNetworkIssue(history, rawUrl, status, failure) {
  let host;
  try { host = new URL(rawUrl).hostname; } catch { return; }
  const code = failure ? (String(failure).match(/net::ERR_[A-Z_]+/)?.[0] || 'NETWORK_ERROR') : `HTTP_${Number(status)}`;
  if (code === 'net::ERR_ABORTED') return;
  const now = Date.now(), previous = history.at(-1);
  if (previous?.host === host && previous.code === code && now - previous.at < 10000) { previous.count++; previous.at = now; return; }
  history.push({ host, code, at: now, count: 1 });
  if (history.length > 12) history.shift();
}
module.exports = { recordNetworkIssue };
