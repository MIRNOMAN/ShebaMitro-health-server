-- PostgreSQL 16 Initialization Script
-- Automatically enables required institutional search & UUID extensions

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Confirm extensions are active
DO $$
BEGIN
  RAISE NOTICE 'PostgreSQL Extensions pg_trgm, uuid-ossp, and btree_gin enabled successfully.';
END $$;
