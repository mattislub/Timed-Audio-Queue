/*
  # Create sounds table for audio system

  1. New Tables
    - `sounds`
      - `id` (uuid, primary key) - unique identifier
      - `file_name` (text) - original file name
      - `file_url` (text) - storage URL for the audio file
      - `plays_completed` (integer) - number of times played so far
      - `total_plays` (integer) - total times to play (6)
      - `is_playing` (boolean) - currently playing
      - `created_at` (timestamp) - when file was uploaded
      - `next_play_at` (timestamp) - when next play should happen

  2. Security
    - Enable RLS on `sounds` table
    - Add policy for authenticated users to view all sounds
    - Add policy for authenticated users to create sounds
    - Add policy for authenticated users to update sounds
*/

CREATE TABLE IF NOT EXISTS sounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_url text NOT NULL,
  plays_completed integer DEFAULT 0,
  total_plays integer DEFAULT 6,
  is_playing boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  next_play_at timestamptz DEFAULT now()
);

ALTER TABLE sounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view sounds"
  ON sounds
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can create sounds"
  ON sounds
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update sounds"
  ON sounds
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete sounds"
  ON sounds
  FOR DELETE
  TO authenticated
  USING (true);