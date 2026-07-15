// Test setup — runs BEFORE any module imports.
// Set env vars at top level so loadConfig() (called at import time) sees them.

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-32-bytes-base64-abc';
process.env.DATABASE_URL = 'file:./test.db';
process.env.HOST = '127.0.0.1';
process.env.PORT = '0';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_MAX = '10000';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.UPLOAD_DIR = './data/uploads-test';
process.env.UPLOAD_MAX_BYTES = String(2 * 1024 * 1024);
