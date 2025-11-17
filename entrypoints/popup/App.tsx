import { useState, useEffect } from "react";
import {
  signInWithTwitch,
  signOutTwitch,
  getStoredSession,
  type AuthSession,
} from "@/lib/twitch-auth";
import "./App.css";

interface ConfigState {
  rewardId: string;
  sseEnabled: boolean;
}

interface SSEStatus {
  connected: boolean;
  reconnectAttempts: number;
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Configuration state
  const [config, setConfig] = useState<ConfigState>({
    rewardId: "",
    sseEnabled: false,
  });
  const [configSaved, setConfigSaved] = useState(false);
  const [sseStatus, setSSEStatus] = useState<SSEStatus>({
    connected: false,
    reconnectAttempts: 0,
  });

  // Load session and config on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [storedSession, storedConfig] = await Promise.all([
          getStoredSession(),
          browser.storage.local.get(["configuredRewardId", "sseEnabled"]),
        ]);

        setSession(storedSession);
        setConfig({
          rewardId: (storedConfig.configuredRewardId as string) || "",
          sseEnabled: (storedConfig.sseEnabled as boolean) || false,
        });

        // Get SSE status
        const status = await browser.runtime.sendMessage({
          type: "GET_SSE_STATUS",
        });
        setSSEStatus(status);
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setIsPending(false);
      }
    };

    loadData();

    // Poll SSE status every 5 seconds
    const statusInterval = setInterval(async () => {
      try {
        const status = await browser.runtime.sendMessage({
          type: "GET_SSE_STATUS",
        });
        setSSEStatus(status);
      } catch {
        // Ignore errors during polling
      }
    }, 5000);

    return () => clearInterval(statusInterval);
  }, []);

  const handleTwitchLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const newSession = await signInWithTwitch();
      setSession(newSession);
    } catch (err) {
      console.error("Login failed:", err);
      if (err instanceof Error) {
        if (err.message.includes("user cancelled")) {
          setError("Connexion annulée");
        } else if (err.message.includes("CLIENT_ID")) {
          setError("Configuration manquante. Vérifiez VITE_TWITCH_CLIENT_ID");
        } else {
          setError(`Erreur: ${err.message}`);
        }
      } else {
        setError("Une erreur est survenue lors de la connexion");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signOutTwitch();
      setSession(null);
    } catch (err) {
      console.error("Logout failed:", err);
      setError("Erreur lors de la déconnexion");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      await browser.storage.local.set({
        configuredRewardId: config.rewardId,
        sseEnabled: config.sseEnabled,
      });

      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);

      // Trigger SSE reconnection
      if (config.sseEnabled && config.rewardId) {
        await browser.runtime.sendMessage({ type: "CONNECT_SSE" });
      }
    } catch (err) {
      console.error("Failed to save config:", err);
      setError("Erreur lors de la sauvegarde");
    }
  };

  const handleToggleSSE = async () => {
    const newEnabled = !config.sseEnabled;
    setConfig((prev) => ({ ...prev, sseEnabled: newEnabled }));

    await browser.storage.local.set({ sseEnabled: newEnabled });

    if (newEnabled && config.rewardId) {
      await browser.runtime.sendMessage({ type: "CONNECT_SSE" });
    } else {
      await browser.runtime.sendMessage({ type: "DISCONNECT_SSE" });
    }
  };

  if (isPending) {
    return (
      <div className="app-container">
        <div className="loading">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <h1>AMQ Autopause</h1>

      <div className="card">
        {session ? (
          <div className="user-info">
            <div className="user-avatar">
              {session.user.profile_image_url ? (
                <img src={session.user.profile_image_url} alt="Avatar" />
              ) : (
                <div className="avatar-placeholder">
                  {session.user.display_name?.charAt(0) || "U"}
                </div>
              )}
            </div>
            <p className="welcome-text">
              Connecté en tant que <strong>{session.user.display_name}</strong>
            </p>
            <button
              onClick={handleLogout}
              disabled={isLoading}
              className="logout-button"
            >
              {isLoading ? "Déconnexion..." : "Se déconnecter"}
            </button>
          </div>
        ) : (
          <div className="login-section">
            <p className="login-text">
              Connectez-vous avec Twitch pour gérer vos récompenses
            </p>
            {error && <p className="error-text">{error}</p>}
            <button
              onClick={handleTwitchLogin}
              disabled={isLoading}
              className="twitch-button"
            >
              <svg
                className="twitch-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
              </svg>
              {isLoading ? "Connexion..." : "Se connecter avec Twitch"}
            </button>
          </div>
        )}
      </div>

      {session && (
        <div className="card config-card">
          <h2>Configuration</h2>

          <div className="config-section">
            <label htmlFor="rewardId" className="config-label">
              Reward ID (Twitch)
            </label>
            <input
              id="rewardId"
              type="text"
              value={config.rewardId}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, rewardId: e.target.value }))
              }
              placeholder="Ex: abc123-def456-..."
              className="config-input"
            />
            <p className="config-hint">
              ID de la récompense qui déclenchera la pause sur AMQ
            </p>
          </div>

          <div className="config-section">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={config.sseEnabled}
                onChange={handleToggleSSE}
                className="toggle-checkbox"
              />
              <span className="toggle-text">
                Activer la connexion temps réel
              </span>
            </label>
          </div>

          <div className="status-section">
            <div
              className={`status-indicator ${sseStatus.connected ? "connected" : "disconnected"}`}
            >
              <span className="status-dot"></span>
              <span className="status-text">
                {sseStatus.connected ? "Connecté" : "Déconnecté"}
              </span>
            </div>
            {sseStatus.reconnectAttempts > 0 && (
              <p className="reconnect-info">
                Tentatives de reconnexion: {sseStatus.reconnectAttempts}
              </p>
            )}
          </div>

          <button
            onClick={handleSaveConfig}
            disabled={!config.rewardId}
            className="save-button"
          >
            {configSaved ? "Sauvegardé !" : "Sauvegarder"}
          </button>

          {error && <p className="error-text">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default App;
