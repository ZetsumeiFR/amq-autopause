// Better-Auth OAuth configuration for Chrome extension
// This uses the backend's better-auth OAuth flow instead of custom implementation

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface TwitchUser {
  id: string;
  name: string;
  email?: string;
  image?: string;
}

export interface AuthSession {
  user: TwitchUser;
  session: {
    token: string;
    expiresAt: number;
  };
}

// Main sign in function using better-auth backend
export async function signInWithTwitch(): Promise<AuthSession> {
  // Open backend's OAuth flow in a new window
  const authURL = `${API_BASE_URL}/api/auth/signin/twitch`;
  const callbackURL = `${API_BASE_URL}/api/auth/callback/twitch`;

  console.log("Starting better-auth OAuth flow...");
  console.log("Auth URL:", authURL);

  // Use launchWebAuthFlow to handle the OAuth process
  // The backend will handle Twitch OAuth and set session cookies
  const responseURL = await browser.identity.launchWebAuthFlow({
    url: authURL,
    interactive: true,
  });

  if (!responseURL) {
    throw new Error("No response URL received from OAuth flow");
  }

  console.log("OAuth response received:", responseURL);

  // After successful OAuth, better-auth has set cookies
  // Now fetch the session from the backend
  const sessionData = await fetchSession();

  if (!sessionData) {
    throw new Error("Failed to retrieve session after authentication");
  }

  // Store session info in browser storage for UI display
  await browser.storage.local.set({ twitchSession: sessionData });

  console.log("Successfully signed in as:", sessionData.user.name);
  return sessionData;
}

// Fetch current session from backend
async function fetchSession(): Promise<AuthSession | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/get-session`, {
      credentials: "include", // Include cookies
    });

    if (!response.ok) {
      console.error("Failed to fetch session:", response.statusText);
      return null;
    }

    const data = await response.json();

    if (!data.user || !data.session) {
      return null;
    }

    return {
      user: {
        id: data.user.id,
        name: data.user.name || data.user.email,
        email: data.user.email,
        image: data.user.image,
      },
      session: {
        token: data.session.token,
        expiresAt: data.session.expiresAt,
      },
    };
  } catch (error) {
    console.error("Error fetching session:", error);
    return null;
  }
}

// Sign out and clear stored session
export async function signOutTwitch(): Promise<void> {
  try {
    // Call backend to invalidate session
    await fetch(`${API_BASE_URL}/api/auth/sign-out`, {
      method: "POST",
      credentials: "include",
    });
  } catch (error) {
    console.error("Error signing out from backend:", error);
  }

  // Clear local storage
  await browser.storage.local.remove("twitchSession");
  console.log("Signed out successfully");
}

// Get current session from storage or fetch from backend
export async function getStoredSession(): Promise<AuthSession | null> {
  // First check local storage
  const result = await browser.storage.local.get("twitchSession");
  const localSession = result.twitchSession as AuthSession | undefined;

  if (localSession && Date.now() < localSession.session.expiresAt) {
    // Local session is still valid
    return localSession;
  }

  // Local session expired or doesn't exist, fetch from backend
  const backendSession = await fetchSession();

  if (backendSession) {
    // Update local storage with fresh session
    await browser.storage.local.set({ twitchSession: backendSession });
  } else {
    // No valid session, clear local storage
    await browser.storage.local.remove("twitchSession");
  }

  return backendSession;
}

// Validate session with backend
export async function validateSession(
  session: AuthSession,
): Promise<boolean> {
  try {
    const currentSession = await fetchSession();
    return currentSession !== null;
  } catch {
    return false;
  }
}
