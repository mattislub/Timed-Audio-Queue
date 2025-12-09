-- MySQL schema for Timed Audio Queue frontend
-- Creates core tables expected by the web and mobile clients
-- Tables:
--   sounds       - uploaded audio metadata and playback schedule
--   sound_shares - sharing records that tie a sound to a recipient email

CREATE TABLE IF NOT EXISTS sounds (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  plays_completed INT NOT NULL DEFAULT 0,
  total_plays INT NOT NULL DEFAULT 6,
  is_playing TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_play_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  playback_speeds JSON DEFAULT (JSON_ARRAY('1.0','1.0','1.0','1.0','1.0','1.0')),
  duration INT NULL,
  INDEX idx_sounds_next_play (next_play_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sound_shares (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  sound_id CHAR(36) NOT NULL,
  user_email VARCHAR(320) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sound_shares_sound
    FOREIGN KEY (sound_id) REFERENCES sounds(id)
    ON DELETE CASCADE,
  INDEX idx_sound_shares_sound (sound_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
