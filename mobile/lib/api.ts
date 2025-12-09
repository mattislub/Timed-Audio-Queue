const API_BASE_URL = 'https://api.sr.70-60.com/api/sounds';

export type RemoteSound = {
  id: string;
  file_name: string;
  file_url: string;
  duration?: number;
  created_at: string;
};

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unexpected server response');
  }

  return response.json() as Promise<T>;
}

export async function fetchRemoteSounds(): Promise<RemoteSound[]> {
  const response = await fetch(API_BASE_URL);
  return handleResponse<RemoteSound[]>(response);
}

export async function deleteRemoteSound(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/${id}`, { method: 'DELETE' });
  await handleResponse(response);
}

export async function uploadBase64Recording(
  filename: string,
  fileContent: string,
  duration?: number
): Promise<{ publicUrl: string }> {
  const response = await fetch(`${API_BASE_URL}/upload/base64`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: filename, fileContent, duration }),
  });

  return handleResponse<{ publicUrl: string }>(response);
}

export async function createRemoteSound(payload: Partial<RemoteSound>): Promise<void> {
  const response = await fetch(API_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  await handleResponse(response);
}
