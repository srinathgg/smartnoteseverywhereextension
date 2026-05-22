// popup.js
// ─────────────────────────────────────────────────────────────────────────────
// Runs inside the popup window.
// Its only job: when the user clicks "Add Note", tell the active tab's
// content.js to create a new note on that page.
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById("addNoteBtn").addEventListener("click", async () => {
  // Get the currently active browser tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) return;

  // Send a message to the content script running on that tab
  chrome.tabs.sendMessage(tab.id, { action: "addNote" });

  // Close the popup so the user can see the note appear
  window.close();
});