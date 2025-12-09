/*
  # Add playback speeds and user management to sounds

  1. Modified Tables
    - `sounds` table
      - Added `playback_speeds` (text array) - speeds for each of 6 plays (1.0 = normal)
      - Added `shared_with_users` (text array) - user IDs or emails to share with
      - Added `created_by` (uuid) - user who created/uploaded the sound

  2. New Tables
    - `sound_shares`
      - `id` (uuid, primary key)
      - `sound_id` (uuid, foreign key)
      - `user_email` (text) - recipient email
      - `created_at` (timestamp)
      - `sent_at` (timestamp)

  3. Security
    - Add policy for users to share sounds
    - Add policy for users to view shared sounds
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sounds' AND column_name = 'playback_speeds'
  ) THEN
    ALTER TABLE sounds ADD COLUMN playback_speeds text[] DEFAULT ARRAY['1.0', '1.0', '1.0', '1.0', '1.0', '1.0'];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sounds' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE sounds ADD COLUMN created_by uuid DEFAULT auth.uid();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sounds' AND column_name = 'shared_with_users'
  ) THEN
    ALTER TABLE sounds ADD COLUMN shared_with_users text[] DEFAULT ARRAY[]::text[];
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sound_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sound_id uuid NOT NULL REFERENCES sounds(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
);

ALTER TABLE sound_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shares of their sounds"
  ON sound_shares
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sounds
      WHERE sounds.id = sound_shares.sound_id
      AND sounds.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can create shares"
  ON sound_shares
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sounds
      WHERE sounds.id = sound_shares.sound_id
      AND sounds.created_by = auth.uid()
    )
  );
