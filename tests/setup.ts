// Set test environment variables BEFORE any module imports
process.env.ADMIN_SECRET = "test-admin-secret-123";
process.env.ADMIN_TOKEN_SECRET = "test-admin-token-secret-789";
process.env.OWNER_SECRET = "test-owner-secret-456";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.CENTRIFUGO_URL = "http://localhost:8000";
process.env.CENTRIFUGO_API_KEY = "test-centrifugo-key";
process.env.CENTRIFUGO_TOKEN_HMAC_SECRET_KEY = "test-centrifugo-secret";
process.env.RESEND_API_KEY = "re_test_key";
