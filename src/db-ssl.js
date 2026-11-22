const LEGACY_SSL_MODES = new Set(['require', 'prefer', 'verify-ca']);

function rewriteSslMode(databaseUrl) {
  if (typeof databaseUrl !== 'string' || !databaseUrl.includes('sslmode=')) return databaseUrl;
  try {
    const parsed = new URL(databaseUrl);
    const sslMode = parsed.searchParams.get('sslmode');
    if (LEGACY_SSL_MODES.has(sslMode)) parsed.searchParams.set('sslmode', 'verify-full');
    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

module.exports = { rewriteSslMode };
