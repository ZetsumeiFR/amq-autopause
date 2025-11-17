export default defineContentScript({
  matches: ["*://animemusicquiz.com/*"],
  main() {
    console.log("[AMQ Autopause] Content script loaded on AnimeMusicQuiz");

    // Listen for pause commands from the background script
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "PAUSE_AMQ") {
        console.log("[AMQ Autopause] Received pause command:", message.data);
        const success = clickPauseButton();
        sendResponse({ success, timestamp: Date.now() });
      }
      return true; // Keep message channel open for async response
    });

    /**
     * Click the pause button on AMQ
     * XPath: //*[@id="qpPauseButton"]
     */
    function clickPauseButton(): boolean {
      try {
        // Try finding by ID first (most reliable)
        const pauseButton = document.getElementById("qpPauseButton");

        if (pauseButton) {
          // Check if the button is visible and clickable
          const style = window.getComputedStyle(pauseButton);
          if (style.display === "none" || style.visibility === "hidden") {
            console.warn("[AMQ Autopause] Pause button is hidden");
            return false;
          }

          // Click the button
          pauseButton.click();
          console.log("[AMQ Autopause] Successfully clicked pause button");

          // Visual feedback
          showNotification("Game paused by channel points redemption!");

          return true;
        }

        // Fallback: try XPath
        const result = document.evaluate(
          '//*[@id="qpPauseButton"]',
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );

        const xpathButton = result.singleNodeValue as HTMLElement | null;
        if (xpathButton) {
          xpathButton.click();
          console.log("[AMQ Autopause] Clicked pause button via XPath");
          showNotification("Game paused by channel points redemption!");
          return true;
        }

        console.warn("[AMQ Autopause] Pause button not found");
        return false;
      } catch (error) {
        console.error("[AMQ Autopause] Error clicking pause button:", error);
        return false;
      }
    }

    /**
     * Show a temporary notification on the page
     */
    function showNotification(message: string): void {
      const notification = document.createElement("div");
      notification.textContent = message;
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #9147ff 0%, #772ce8 100%);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(145, 71, 255, 0.4);
        z-index: 999999;
        animation: slideIn 0.3s ease-out;
        opacity: 1;
        transition: opacity 0.3s ease-out;
      `;

      // Add animation keyframes
      const style = document.createElement("style");
      style.textContent = `
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);

      document.body.appendChild(notification);

      // Remove after 3 seconds
      setTimeout(() => {
        notification.style.opacity = "0";
        setTimeout(() => {
          notification.remove();
          style.remove();
        }, 300);
      }, 3000);
    }

    // Verify the pause button exists on page load
    setTimeout(() => {
      const pauseButton = document.getElementById("qpPauseButton");
      if (pauseButton) {
        console.log("[AMQ Autopause] Pause button found and ready");
      } else {
        console.warn("[AMQ Autopause] Pause button not found on page");
      }
    }, 2000);
  },
});
