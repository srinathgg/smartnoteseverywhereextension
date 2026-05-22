// content.js
// ─────────────────────────────────────────────────────────────────────────────
// This script runs on EVERY webpage the user visits.
// It is responsible for:
//   1. Loading saved notes from chrome.storage.local on page load
//   2. Creating note DOM elements and injecting them into the page
//   3. Making notes draggable
//   4. Auto-saving notes when content/position changes
//   5. Deleting notes
// ─────────────────────────────────────────────────────────────────────────────

// A unique key per URL so notes are scoped to the page they were created on.
const PAGE_KEY = "notes_" + location.href;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Load all notes for this page from storage. Returns an array of note objects. */
function loadNotes(callback) {
  chrome.storage.local.get([PAGE_KEY], (result) => {
    callback(result[PAGE_KEY] || []);
  });
}

/** Save the full notes array for this page to storage. */
function saveNotes(notes) {
  chrome.storage.local.set({ [PAGE_KEY]: notes });
}

/** Generate a simple unique ID for each note. */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Note state ────────────────────────────────────────────────────────────────

// In-memory array that mirrors what's in storage. Each note looks like:
// { id, text, x, y, color }
let notes = [];

// ── Create a note DOM element ─────────────────────────────────────────────────

/**
 * Creates a floating note element, wires up all interactions,
 * and appends it to the document body.
 * @param {Object} noteData - { id, text, x, y, color }
 */
function createNoteElement(noteData) {
  const note = document.createElement("div");
  note.className = "sne-note";
  note.dataset.id = noteData.id;

  // Position from saved data (or centered if new)
  note.style.left = noteData.x + "px";
  note.style.top  = noteData.y + "px";
  note.style.setProperty("--note-color", noteData.color || "#fff9c4");

  // ── Inner HTML ────────────────────────────────────────────────────────────
  note.innerHTML = `
    <div class="sne-header">
      <div class="sne-dots">
        <span class="sne-dot red"   data-color="#ffcdd2"></span>
        <span class="sne-dot amber" data-color="#fff9c4"></span>
        <span class="sne-dot green" data-color="#c8e6c9"></span>
        <span class="sne-dot blue"  data-color="#bbdefb"></span>
      </div>
      <button class="sne-delete" title="Delete note">✕</button>
    </div>
    <textarea class="sne-textarea" placeholder="Type your note…">${escapeHtml(noteData.text)}</textarea>
  `;

  // ── Color picker dots ─────────────────────────────────────────────────────
  note.querySelectorAll(".sne-dot").forEach((dot) => {
    dot.addEventListener("click", () => {
      const color = dot.dataset.color;
      note.style.setProperty("--note-color", color);
      updateNoteData(noteData.id, { color });
    });
  });

  // ── Delete button ─────────────────────────────────────────────────────────
  note.querySelector(".sne-delete").addEventListener("click", () => {
    deleteNote(noteData.id, note);
  });

  // ── Auto-save textarea content ────────────────────────────────────────────
  const textarea = note.querySelector(".sne-textarea");
  let saveTimer = null;
  textarea.addEventListener("input", () => {
    // Debounce: wait 600ms after the user stops typing before saving.
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      updateNoteData(noteData.id, { text: textarea.value });
    }, 600);
  });

  // ── Dragging ──────────────────────────────────────────────────────────────
  makeDraggable(note, noteData.id);

  document.body.appendChild(note);
}

// ── Drag logic ────────────────────────────────────────────────────────────────

/**
 * Attaches mousedown → mousemove → mouseup drag behaviour to a note.
 * Only the header strip acts as the drag handle.
 */
function makeDraggable(noteEl, id) {
  const header = noteEl.querySelector(".sne-header");

  let isDragging = false;
  let startX, startY, origLeft, origTop;

  header.addEventListener("mousedown", (e) => {
    // Don't drag when clicking the delete button or color dots
    if (e.target.classList.contains("sne-delete") ||
        e.target.classList.contains("sne-dot")) return;

    isDragging = true;
    startX   = e.clientX;
    startY   = e.clientY;
    origLeft = parseInt(noteEl.style.left, 10) || 0;
    origTop  = parseInt(noteEl.style.top,  10) || 0;

    noteEl.style.zIndex = "2147483647"; // float on top while dragging
    e.preventDefault(); // prevent text selection during drag
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    noteEl.style.left = (origLeft + dx) + "px";
    noteEl.style.top  = (origTop  + dy) + "px";
  });

  document.addEventListener("mouseup", (e) => {
    if (!isDragging) return;
    isDragging = false;
    noteEl.style.zIndex = "";

    // Save the new position
    const x = parseInt(noteEl.style.left, 10);
    const y = parseInt(noteEl.style.top,  10);
    updateNoteData(id, { x, y });
  });
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────

/** Merge partial changes into a specific note and persist. */
function updateNoteData(id, changes) {
  notes = notes.map((n) => (n.id === id ? { ...n, ...changes } : n));
  saveNotes(notes);
}

/** Remove note from DOM and from storage. */
function deleteNote(id, noteEl) {
  noteEl.remove();
  notes = notes.filter((n) => n.id !== id);
  saveNotes(notes);
}

/** Create a brand-new note (called from popup via message). */
function addNewNote() {
  const newNote = {
    id:    uid(),
    text:  "",
    // Default position: top-left area with slight random offset
    x:     80 + Math.random() * 60,
    y:     80 + Math.random() * 60,
    color: "#fff9c4",
  };
  notes.push(newNote);
  saveNotes(notes);
  createNoteElement(newNote);
}

// ── Security helper ───────────────────────────────────────────────────────────

/** Prevent XSS: escape user content before inserting as HTML. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

// On page load: read saved notes and render them.
loadNotes((saved) => {
  notes = saved;
  notes.forEach(createNoteElement);
});

// Listen for "add note" message from the popup button.
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "addNote") {
    addNewNote();
  }
});