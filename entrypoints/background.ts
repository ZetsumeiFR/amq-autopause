export default defineBackground(() => {
  console.log("[AMQ Autopause] Background script started", {
    id: browser.runtime.id,
  });

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  let eventSource: EventSource | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const RECONNECT_DELAY = 5000;

  interface PauseEventData {
    rewardId: string;
    rewardTitle: string;
    viewerName: string;
    cost: number;
    timestamp: string;
  }

  interface StorageData {
    configuredRewardId?: string;
    sseEnabled?: boolean;
  }

  /**
   * Connect to SSE stream for real-time events
   */
  async function connectSSE(): Promise<void> {
    // Check if SSE is enabled in settings
    const storage = (await browser.storage.local.get([
      "configuredRewardId",
      "sseEnabled",
      "twitchSession",
    ])) as StorageData & { twitchSession?: { user: { id: string } } };

    if (!storage.sseEnabled) {
      console.log("[AMQ Autopause] SSE is disabled in settings");
      return;
    }

    if (!storage.configuredRewardId) {
      console.log("[AMQ Autopause] No reward ID configured, SSE not starting");
      return;
    }

    // Check if user is authenticated
    if (!storage.twitchSession?.user?.id) {
      console.warn("[AMQ Autopause] No active session found, SSE not starting");
      console.warn("[AMQ Autopause] Please sign in with Twitch first");
      return;
    }

    // Close existing connection if any
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    try {
      console.log("[AMQ Autopause] Attempting to connect SSE with credentials...");

      // Create SSE connection
      // Note: EventSource doesn't support custom headers, so we rely on cookies
      eventSource = new EventSource(`${API_BASE_URL}/api/events/stream`, {
        withCredentials: true,
      });

      eventSource.onopen = () => {
        console.log("[AMQ Autopause] SSE connection established");
        reconnectAttempts = 0;
      };

      eventSource.addEventListener("connected", (event) => {
        const data = JSON.parse(event.data);
        console.log("[AMQ Autopause] Connected to event stream:", data);
      });

      eventSource.addEventListener("pause", async (event) => {
        const data: PauseEventData = JSON.parse(event.data);
        console.log("[AMQ Autopause] Received pause event:", data);

        // Check if this reward matches the configured one
        const currentStorage = (await browser.storage.local.get([
          "configuredRewardId",
        ])) as StorageData;

        if (currentStorage.configuredRewardId !== data.rewardId) {
          console.log(
            "[AMQ Autopause] Reward ID does not match configured ID:",
            {
              received: data.rewardId,
              configured: currentStorage.configuredRewardId,
            },
          );
          return;
        }

        console.log("[AMQ Autopause] Reward ID matches! Sending pause command");

        // Send pause command to AMQ content script
        await sendPauseToAMQ(data);
      });

      eventSource.onerror = (error) => {
        console.error("[AMQ Autopause] SSE error:", error);

        // Check readyState to provide better error messages
        if (eventSource?.readyState === EventSource.CLOSED) {
          console.error("[AMQ Autopause] SSE connection closed by server");
          console.error("[AMQ Autopause] This may indicate authentication failure or server unavailability");
          console.error("[AMQ Autopause] Please ensure you are signed in with Twitch");
        }

        eventSource?.close();
        eventSource = null;

        // Attempt to reconnect
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          console.log(
            `[AMQ Autopause] Reconnecting in ${RECONNECT_DELAY / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
          );
          setTimeout(connectSSE, RECONNECT_DELAY);
        } else {
          console.error(
            "[AMQ Autopause] Max reconnection attempts reached, giving up",
          );
          console.error("[AMQ Autopause] Please check your authentication status and try signing in again");
        }
      };
    } catch (error) {
      console.error("[AMQ Autopause] Failed to connect SSE:", error);
    }
  }

  /**
   * Send pause command to AMQ content script
   */
  async function sendPauseToAMQ(data: PauseEventData): Promise<void> {
    try {
      // Find AMQ tabs
      const tabs = await browser.tabs.query({
        url: "*://animemusicquiz.com/*",
      });

      if (tabs.length === 0) {
        console.warn("[AMQ Autopause] No AMQ tabs found");
        return;
      }

      // Send message to all AMQ tabs
      for (const tab of tabs) {
        if (tab.id) {
          try {
            const response = await browser.tabs.sendMessage(tab.id, {
              type: "PAUSE_AMQ",
              data,
            });
            console.log(
              `[AMQ Autopause] Pause command sent to tab ${tab.id}:`,
              response,
            );
          } catch (error) {
            console.error(
              `[AMQ Autopause] Failed to send to tab ${tab.id}:`,
              error,
            );
          }
        }
      }
    } catch (error) {
      console.error("[AMQ Autopause] Error sending pause command:", error);
    }
  }

  /**
   * Handle messages from popup or content scripts
   */
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "CONNECT_SSE") {
      connectSSE().then(() => sendResponse({ success: true }));
      return true;
    }

    if (message.type === "DISCONNECT_SSE") {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
        console.log("[AMQ Autopause] SSE disconnected by user");
      }
      sendResponse({ success: true });
      return true;
    }

    if (message.type === "GET_SSE_STATUS") {
      sendResponse({
        connected:
          eventSource !== null && eventSource.readyState === EventSource.OPEN,
        reconnectAttempts,
      });
      return true;
    }

    return false;
  });

  // Listen for storage changes (when user updates reward ID)
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      if (changes.sseEnabled || changes.configuredRewardId) {
        console.log("[AMQ Autopause] Configuration changed, reconnecting SSE");
        connectSSE();
      }
    }
  });

  // Start SSE connection on extension load
  connectSSE();
});
