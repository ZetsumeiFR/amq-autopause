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

// Main sign in function using better-auth backend with Chrome extension support
export async function signInWithTwitch(): Promise<AuthSession> {
  console.log("Starting Chrome extension OAuth flow...");

  // Get the extension's redirect URL that Chrome will recognize
  const redirectURL = browser.identity.getRedirectURL("oauth");
  console.log("Extension redirect URL:", redirectURL);

  // Create the OAuth URL with proper redirect
  // We'll use a custom endpoint that handles the extension redirect
  const authURL = `${API_BASE_URL}/api/auth/extension/signin?redirect_uri=${encodeURIComponent(redirectURL)}`;
  console.log("Auth URL:", authURL);

  try {
    // Use launchWebAuthFlow to handle the OAuth process
    // This will open Twitch auth and wait for redirect back to our extension
    const responseURL = await browser.identity.launchWebAuthFlow({
      url: authURL,
      interactive: true,
    });

    if (!responseURL) {
      throw new Error("No response URL received from OAuth flow");
    }

    console.log("OAuth response received:", responseURL);

    // Parse the session token from the redirect URL
    const url = new URL(responseURL);
    const sessionToken = url.searchParams.get("session_token");

    if (!sessionToken) {
      throw new Error("No session token received from authentication");
    }

    // Exchange the session token for full session data
    const sessionData = await exchangeSessionToken(sessionToken);

    if (!sessionData) {
      throw new Error("Failed to exchange session token");
    }

    // Store session info in browser storage for UI display
    await browser.storage.local.set({ twitchSession: sessionData });

    console.log("Successfully signed in as:", sessionData.user.name);
    return sessionData;
  } catch (error) {
    console.error("OAuth flow error:", error);
    throw error;
  }
}

// Exchange session token for full session data
async function exchangeSessionToken(
  token: string,
): Promise<AuthSession | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/auth/extension/session`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session_token: token }),
        credentials: "include",
      },
    );

    if (!response.ok) {
      console.error("Failed to exchange session token:", response.statusText);
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
    console.error("Error exchanging session token:", error);
    return null;
  }
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
