export type Sound = {
  id: string;
  file_name: string;
  file_url: string;
  plays_completed: number;
  total_plays: number;
  is_playing: boolean;
  created_at: string;
  next_play_at: string;
  playback_speeds?: string[];
  duration?: number;
};

export type SoundShare = {
  id: string;
  sound_id: string;
  user_email: string;
  created_at: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unexpected server response');
  }
  return response.json() as Promise<T>;
}

export async function fetchSounds(): Promise<Sound[]> {
  const response = await fetch(`${API_BASE_URL}/sounds`);
  return handleResponse<Sound[]>(response);
}

export async function uploadSoundFile(file: File, fileName: string): Promise<{ publicUrl: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('fileName', fileName);

  const response = await fetch(`${API_BASE_URL}/sounds/upload`, {
    method: 'POST',
    body: formData,
  });

  return handleResponse<{ publicUrl: string }>(response);
}

export async function createSound(payload: Partial<Sound>): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/sounds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  await handleResponse(response);
}

export async function updateSound(id: string, payload: Partial<Sound>): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/sounds/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  await handleResponse(response);
}

export async function deleteSound(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/sounds/${id}`, {
    method: 'DELETE',
  });

  await handleResponse(response);
}

export async function fetchShares(): Promise<SoundShare[]> {
  const response = await fetch(`${API_BASE_URL}/sound-shares`);
  return handleResponse<SoundShare[]>(response);
}

export async function createShare(payload: { sound_id: string; user_email: string }): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/sound-shares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  await handleResponse(response);
}

export async function deleteShare(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/sound-shares/${id}`, {
    method: 'DELETE',
  });

  await handleResponse(response);
}

export async function uploadBase64Audio(
  fileName: string,
  base64Content: string,
  duration?: number
): Promise<{ publicUrl: string }> {
  const response = await fetch(`${API_BASE_URL}/sounds/upload/base64`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, fileContent: base64Content, duration }),
  });

  return handleResponse<{ publicUrl: string }>(response);
}
