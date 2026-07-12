CREATE TABLE IF NOT EXISTS support_tickets (
  ticket_id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL,
  category VARCHAR(40) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  public_note TEXT NOT NULL DEFAULT '',
  ip_hash VARCHAR(64) NOT NULL,
  email_sent BOOLEAN NOT NULL DEFAULT FALSE,
  email_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx
  ON support_tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_ip_hash_idx
  ON support_tickets (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx
  ON support_tickets (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_auth_limits (
  limiter_key VARCHAR(80) PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ
);
