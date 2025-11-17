// Twitch OAuth configuration
// You need to create a Twitch application at https://dev.twitch.tv/console
// Set the OAuth Redirect URL to the value from browser.identity.getRedirectURL()

const TWITCH_CLIENT_ID = import.meta.env.VITE_TWITCH_CLIENT_ID || 'YOUR_TWITCH_CLIENT_ID';
const TWITCH_SCOPES = ['user:read:email'];

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  email?: string;
  profile_image_url: string;
}

export interface AuthSession {
  user: TwitchUser;
  accessToken: string;
  expiresAt: number;
}

// Get the redirect URL for Twitch OAuth
export function getRedirectURL(): string {
  const url = browser.identity.getRedirectURL('twitch');
  if (!url) {
    throw new Error('Failed to get redirect URL from browser.identity');
  }
  return url;
}

// Build Twitch OAuth authorization URL
function buildAuthURL(): string {
  const redirectURL = getRedirectURL();
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: redirectURL,
    response_type: 'token',
    scope: TWITCH_SCOPES.join(' '),
    force_verify: 'true',
  });

  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

// Parse access token from redirect URL
function parseAccessToken(responseURL: string): { token: string; expiresIn: number } {
  try {
    const url = new URL(responseURL);
    const hash = url.hash.substring(1);
    const params = new URLSearchParams(hash);

    // Check for error response first
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    if (error) {
      throw new Error(`Twitch OAuth error: ${error} - ${errorDescription || 'No description'}`);
    }

    const token = params.get('access_token');
    const expiresIn = params.get('expires_in');

    if (!token) {
      // Log the full URL for debugging (without exposing it in production)
      console.error('Response URL structure:', {
        hasHash: !!url.hash,
        hashLength: url.hash.length,
        searchParams: Object.fromEntries(url.searchParams),
        hashParams: Object.fromEntries(params),
      });
      throw new Error('No access_token found in OAuth response. Check your Twitch redirect URI configuration.');
    }

    // Use default expiration if not provided (Twitch tokens typically expire in 4 hours)
    const DEFAULT_EXPIRES_IN = 14400; // 4 hours in seconds
    const expiresInSeconds = expiresIn ? parseInt(expiresIn, 10) : DEFAULT_EXPIRES_IN;

    if (!expiresIn) {
      console.warn('No expires_in found in OAuth response, using default:', DEFAULT_EXPIRES_IN);
    }

    return {
      token,
      expiresIn: expiresInSeconds,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to parse OAuth response URL: ${error}`);
  }
}

// Fetch user info from Twitch API
async function fetchTwitchUser(accessToken: string): Promise<TwitchUser> {
  const response = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Client-Id': TWITCH_CLIENT_ID,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.statusText}`);
  }

  const data = await response.json();
  const user = data.data[0];

  return {
    id: user.id,
    login: user.login,
    display_name: user.display_name,
    email: user.email,
    profile_image_url: user.profile_image_url,
  };
}

// Main sign in function using browser.identity
export async function signInWithTwitch(): Promise<AuthSession> {
  const authURL = buildAuthURL();

  console.log('Starting Twitch OAuth flow...');
  console.log('Redirect URL:', getRedirectURL());

  // Launch the OAuth flow
  const responseURL = await browser.identity.launchWebAuthFlow({
    url: authURL,
    interactive: true,
  });

  if (!responseURL) {
    throw new Error('No response URL received from OAuth flow');
  }

  console.log('OAuth response received:', responseURL);

  // Parse the access token from the response
  const tokenData = parseAccessToken(responseURL);

  // Fetch user information
  const user = await fetchTwitchUser(tokenData.token);

  // Create session object
  const session: AuthSession = {
    user,
    accessToken: tokenData.token,
    expiresAt: Date.now() + tokenData.expiresIn * 1000,
  };

  // Store session in browser storage
  await browser.storage.local.set({ twitchSession: session });

  console.log('Successfully signed in as:', user.display_name);
  return session;
}

// Sign out and clear stored session
export async function signOutTwitch(): Promise<void> {
  await browser.storage.local.remove('twitchSession');
  console.log('Signed out successfully');
}

// Get current session from storage
export async function getStoredSession(): Promise<AuthSession | null> {
  const result = await browser.storage.local.get('twitchSession');
  const session = result.twitchSession as AuthSession | undefined;

  if (!session) {
    return null;
  }

  // Check if session is expired
  if (Date.now() >= session.expiresAt) {
    await signOutTwitch();
    return null;
  }

  return session;
}

// Validate that the token is still valid
export async function validateSession(session: AuthSession): Promise<boolean> {
  try {
    const response = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: {
        'Authorization': `OAuth ${session.accessToken}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
