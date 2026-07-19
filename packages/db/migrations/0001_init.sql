CREATE EXTENSION IF NOT EXISTS vector;

-- ============ accounts ============

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text,                          -- null for OAuth-only accounts
  name          text NOT NULL,
  avatar_url    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens(user_id);

-- ============ events ============

CREATE TABLE organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hackathons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  description     text,
  venue           text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_by      uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hackathon_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('organizer', 'mentor', 'participant')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hackathon_id, user_id)
);
CREATE INDEX hackathon_members_user_idx ON hackathon_members(user_id);

CREATE TABLE invite_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  code         text NOT NULL UNIQUE,
  role         text NOT NULL DEFAULT 'participant' CHECK (role IN ('organizer', 'mentor', 'participant')),
  max_uses     integer,
  uses         integer NOT NULL DEFAULT 0,
  expires_at   timestamptz,
  revoked      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============ content ============

CREATE TABLE resources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN (
                 'problem_statement', 'doc', 'link', 'sponsor_api',
                 'faq', 'judging_criteria', 'submission_guidelines'
               )),
  title        text NOT NULL,
  content      text,
  url          text,
  version      integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resources_hackathon_idx ON resources(hackathon_id);

CREATE TABLE resource_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id  uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  section      text,
  content      text NOT NULL,
  embedding    vector(1536),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resource_chunks_hackathon_idx ON resource_chunks(hackathon_id);
CREATE INDEX resource_chunks_embedding_idx ON resource_chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE announcements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  title        text NOT NULL,
  body         text NOT NULL,
  priority     text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high')),
  created_by   uuid NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX announcements_hackathon_idx ON announcements(hackathon_id, created_at DESC);

CREATE TABLE timeline_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============ teams & submissions ============

CREATE TABLE teams (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hackathon_id, name)
);

CREATE TABLE team_members (
  team_id   uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE submissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  team_id      uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  repo_url     text NOT NULL,
  description  text,
  demo_url     text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hackathon_id, team_id)
);

-- ============ AI ============

CREATE TABLE qa_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  question     text NOT NULL,
  answer       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qa_logs_hackathon_idx ON qa_logs(hackathon_id, created_at DESC);

-- ============ external channel integrations ============

CREATE TABLE integrations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('discord', 'telegram')),
  config       jsonb NOT NULL DEFAULT '{}',      -- channel ids, filters
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'broken')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE integration_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id  uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  status          text NOT NULL CHECK (status IN ('sent', 'failed')),
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
