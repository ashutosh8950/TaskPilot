const isProduction = process.env.NODE_ENV === 'production';

function parseList(value) {
  return (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parsePositiveInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function validateConfig() {
  const errors = [];

  const allowRegistration = String(process.env.ALLOW_REGISTRATION ?? 'true').toLowerCase();
  if (!['true', 'false'].includes(allowRegistration)) {
    errors.push('ALLOW_REGISTRATION must be either true or false');
  }

  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  }

  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET is required');
  } else if (process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  } else if (isProduction && process.env.JWT_SECRET.includes('change_this')) {
    errors.push('JWT_SECRET still looks like the example placeholder');
  }

  if (errors.length) {
    throw new Error(`Configuration error:\n- ${errors.join('\n- ')}`);
  }
}

validateConfig();

const corsOrigins = [
  ...parseList(process.env.FRONTEND_URL),
  ...parseList(process.env.ALLOWED_ORIGINS)
].filter((origin, index, origins) => origins.indexOf(origin) === index);

module.exports = {
  config: Object.freeze({
    isProduction,
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parsePositiveInt('PORT', 3000),
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    allowRegistration: String(process.env.ALLOW_REGISTRATION ?? 'true').toLowerCase() === 'true',
    dbPoolMax: parsePositiveInt('DB_POOL_MAX', 5),
    dbRejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED !== 'false',
    corsOrigins
  }),
  parseList
};
