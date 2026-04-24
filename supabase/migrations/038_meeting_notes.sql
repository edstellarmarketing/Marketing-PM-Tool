CREATE TABLE "Marketing-PM-Tool".meeting_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  title        text NOT NULL,
  meeting_date date NOT NULL,
  goal         text NOT NULL,
  body         text,
  timelines    jsonb NOT NULL DEFAULT '[]',
  met_with     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "Marketing-PM-Tool".meeting_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_notes_own" ON "Marketing-PM-Tool".meeting_notes
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX ON "Marketing-PM-Tool".meeting_notes (user_id, meeting_date DESC);
