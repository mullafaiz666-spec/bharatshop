-- BharatShop native agent runtime foundation.
-- ADDITIVE ONLY: no DROP, TRUNCATE, DELETE, destructive ALTER, or seed data.
--
-- This file mirrors the tables created lazily by:
--   src/lib/agents/company-state.ts
--   src/lib/agents/runtime.ts
--
-- Apply only after the source -> Supabase migration workflow has established
-- which objects are missing. CREATE IF NOT EXISTS makes this safe to review
-- alongside a restored source schema, but it is NOT a substitute for data parity.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_company_goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  priority INTEGER NOT NULL DEFAULT 50,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_work_items (
  id TEXT PRIMARY KEY,
  goal_id TEXT,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  priority INTEGER NOT NULL DEFAULT 50,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_id TEXT,
  created_by INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_shared_events (
  id BIGSERIAL PRIMARY KEY,
  goal_id TEXT,
  work_item_id TEXT,
  agent_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INFO',
  summary TEXT NOT NULL DEFAULT '',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_company_goals_status
  ON public.agent_company_goals(status, priority DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_work_queue
  ON public.agent_work_items(status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_work_goal
  ON public.agent_work_items(goal_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_work_agent
  ON public.agent_work_items(agent_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_shared_goal
  ON public.agent_shared_events(goal_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_agent_shared_agent
  ON public.agent_shared_events(agent_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_agent_chat_session
  ON public.agent_chat_messages(session_id, agent_id, id DESC);

-- These tables are internal agent state, not public client data. If public is an
-- exposed Supabase schema, RLS plus explicit privilege revocation prevents anon
-- and authenticated Data API roles from reading or mutating internal agent state.
ALTER TABLE public.agent_company_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_shared_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_chat_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.agent_company_goals FROM anon, authenticated;
REVOKE ALL ON TABLE public.agent_work_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.agent_shared_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.agent_chat_messages FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.agent_shared_events_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.agent_chat_messages_id_seq FROM anon, authenticated;

COMMIT;
