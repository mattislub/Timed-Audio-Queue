const API_BASE_URL = 'https://api.sr.70-60.com/api';

export type RecorderUser = {
  id?: string;
  username: string;
  password: string;
};

export type AuthState = {
  adminPassword: string;
  recorderUsers: RecorderUser[];
};

export type RemoteSound = {
  id: string;
  file_name: string;
  file_url: string;
  duration?: number;
  created_at: string;
};

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || 'Unexpected server response');
  }

  if (!text) {
    return undefined as T;
  }

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text) as T;
    } catch {
      // Fall through to return the raw text when JSON parsing fails.
    }
  }

  return text as unknown as T;
}

export async function fetchRemoteSounds(): Promise<RemoteSound[]> {
  const response = await fetch(`${API_BASE_URL}/sounds`);
  return handleResponse<RemoteSound[]>(response);
}

export async function deleteRemoteSound(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/sounds/${id}`, { method: 'DELETE' });
  await handleResponse(response);
}

export async function uploadBase64Recording(
  filename: string,
  fileContent: string,
  duration?: number
): Promise<{ publicUrl: string }> {
  const response = await fetch(`${API_BASE_URL}/sounds/upload/base64`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: filename, fileContent, duration }),
  });

  return handleResponse<{ publicUrl: string }>(response);
}

export async function uploadRecordingMultipart(
  uri: string,
  name = 'recording.aac'
): Promise<{ publicUrl: string }> {
  const formData = new FormData();

  formData.append('file', {
    uri,
    name,
    type: 'audio/aac',
  } as any);

  const response = await fetch(`${API_BASE_URL}/sounds/upload`, {
    method: 'POST',
    body: formData,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || 'Upload failed');
  }

  return JSON.parse(text);
}

export async function createRemoteSound(payload: Partial<RemoteSound>): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/sounds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  await handleResponse(response);
}

export async function fetchAuthState(): Promise<AuthState> {
  const response = await fetch(`${API_BASE_URL}/auth`);
  return handleResponse<AuthState>(response);
}
