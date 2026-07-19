CREATE TABLE sponsors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  name         text NOT NULL,
  tier         text NOT NULL DEFAULT 'gold' CHECK (tier IN ('platinum', 'gold', 'silver', 'partner')),
  brand_color  text NOT NULL DEFAULT '#7c6cff',
  tagline      text,
  url          text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sponsors_hackathon_idx ON sponsors(hackathon_id);

ALTER TABLE announcements ADD COLUMN category text NOT NULL DEFAULT 'general'
  CHECK (category IN ('general', 'deadline', 'schedule', 'food', 'workshop', 'prize', 'tech'));
ALTER TABLE announcements ADD COLUMN sponsor_id uuid REFERENCES sponsors(id) ON DELETE SET NULL;
