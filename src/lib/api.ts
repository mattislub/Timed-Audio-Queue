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

const API_BASE_URL = 'https://api.sr.70-60.com/api/sounds';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unexpected server response');
  }
  return response.json() as Promise<T>;
}

async function performRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(input, init);
    return await handleResponse<T>(response);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Could not reach API at ${API_BASE_URL}. Please verify the server is running and accessible.`);
    }
    throw error instanceof Error ? error : new Error('Unexpected request error');
  }
}

export async function fetchSounds(): Promise<Sound[]> {
  return performRequest<Sound[]>(API_BASE_URL);
}

export async function uploadSoundFile(file: File, fileName: string): Promise<{ publicUrl: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('fileName', fileName);

  return performRequest<{ publicUrl: string }>(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });
}

export async function createSound(payload: Partial<Sound>): Promise<void> {
  await performRequest<void>(API_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateSound(id: string, payload: Partial<Sound>): Promise<void> {
  await performRequest<void>(`${API_BASE_URL}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteSound(id: string): Promise<void> {
  await performRequest<void>(`${API_BASE_URL}/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchShares(): Promise<SoundShare[]> {
  return performRequest<SoundShare[]>(`${API_BASE_URL}/sound-shares`);
}

export async function createShare(payload: { sound_id: string; user_email: string }): Promise<void> {
  await performRequest<void>(`${API_BASE_URL}/sound-shares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteShare(id: string): Promise<void> {
  await performRequest<void>(`${API_BASE_URL}/sound-shares/${id}`, {
    method: 'DELETE',
  });
}

export async function uploadBase64Audio(
  fileName: string,
  base64Content: string,
  duration?: number
): Promise<{ publicUrl: string }> {
  return performRequest<{ publicUrl: string }>(`${API_BASE_URL}/upload/base64`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, fileContent: base64Content, duration }),
  });
}
