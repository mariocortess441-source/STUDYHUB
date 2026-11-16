(() => {
  "use strict";
  const DB_NAME = "aulivra-file-vault";
  const DB_VERSION = 1;
  const STORE = "files";
  const MAX_FILE_BYTES = 50 * 1024 * 1024;
  let dbPromise;

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
  const sizeLabel = bytes => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };
  const notify = message => {
    const toast = document.querySelector("#toast");
    if (toast) {
      toast.textContent = message;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2800);
    } else {
      console.info("[AULIVRA]", message);
    }
  };
  async function ownerId() {
    try {
      const response = await fetch("/api/auth/me", { credentials:"same-origin", cache:"no-store" });
      const data = response.ok ? await response.json() : null;
      return data?.user?.id || "guest";
    } catch { return "guest"; }
  }
  function openDb() {
    if (!("indexedDB" in window)) return Promise.reject(new Error("Este navegador no permite guardar archivos localmente."));
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath:"id" });
          store.createIndex("owner", "owner", { unique:false });
          store.createIndex("subjectId", "subjectId", { unique:false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacén de archivos."));
      request.onblocked = () => reject(new Error("Cierra otras pestañas de AULIVRA y vuelve a intentarlo."));
    });
    return dbPromise;
  }
  async function allFiles(owner, subjectId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result || [])
        .filter(file => file.owner === owner && (subjectId ? file.subjectId === subjectId : !file.subjectId))
        .sort((a,b) => b.createdAt - a.createdAt));
      request.onerror = () => reject(request.error);
    });
  }
  async function saveFiles(files, subjectId) {
    const owner = await ownerId();
    const valid = Array.from(files || []);
    if (!valid.length) return;
    const tooLarge = valid.filter(file => file.size > MAX_FILE_BYTES);
    if (tooLarge.length) {
      notify("Cada archivo debe pesar como máximo 50 MB.");
      return;
    }
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      valid.forEach(file => store.put({
        id: crypto.randomUUID(),
        owner,
        subjectId: subjectId || null,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        createdAt: Date.now(),
        blob: file
      }));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("No se pudieron guardar los archivos."));
    });
    notify(valid.length === 1 ? "Archivo guardado en este dispositivo." : valid.length + " archivos guardados en este dispositivo.");
  }
  async function removeFile(id) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function downloadFile(id) {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!record?.blob) throw new Error("No se encuentra el archivo guardado.");
    const url = URL.createObjectURL(record.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = record.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function fileRows(files, emptyText) {
    if (!files.length) return '<div class="empty">' + escapeHtml(emptyText) + '</div>';
    return files.map(file => '<div class="file-line" style="gap:10px;align-items:center"><span aria-hidden="true">📄</span><span style="flex:1;min-width:0;overflow-wrap:anywhere"><b>' +
      escapeHtml(file.name) + '</b><small class="muted"> · ' + sizeLabel(file.size) + ' · ' +
      new Date(file.createdAt).toLocaleDateString("es-ES") + '</small></span><button class="btn secondary" type="button" data-vault-download="' +
      escapeHtml(file.id) + '">Descargar</button><button class="remove" type="button" aria-label="Eliminar ' +
      escapeHtml(file.name) + '" data-vault-delete="' + escapeHtml(file.id) + '">×</button></div>').join("");
  }
  async function renderContainer(container) {
    if (!container?.isConnected) return;
    const subjectId = container.dataset.subjectId;
    const list = container.querySelector("[data-vault-list]");
    if (!list) return;
    try {
      const owner = await ownerId();
      const files = await allFiles(owner, subjectId);
      if (!container.isConnected) return;
      list.innerHTML = fileRows(files, "Todavía no hay archivos. Añade tus apuntes o ejercicios.");
    } catch (error) {
      list.innerHTML = '<div class="empty">No se pudieron cargar los archivos: ' + escapeHtml(error.message) + '</div>';
    }
  }
  async function renderPersonal() {
    const list = document.querySelector("#personalNotesList");
    if (!list) return;
    try {
      const owner = await ownerId();
      const files = await allFiles(owner, null);
      list.innerHTML = fileRows(files, "Todavía no hay documentos guardados. Selecciona tus apuntes para añadirlos.");
    } catch (error) {
      list.textContent = "No se pudo abrir la biblioteca: " + error.message;
    }
  }
  async function refreshAll() {
    document.querySelectorAll("[data-subject-file-vault]").forEach(renderContainer);
    renderPersonal();
  }
  document.addEventListener("change", async event => {
    const input = event.target;
    if (input.matches("[data-vault-input]")) {
      const container = input.closest("[data-subject-file-vault]");
      try {
        await saveFiles(input.files, container?.dataset.subjectId);
        input.value = "";
        await renderContainer(container);
      } catch (error) { notify(error.message || "No se pudieron guardar los archivos."); }
    } else if (input.matches("#personalNotes")) {
      try {
        await saveFiles(input.files, null);
        input.value = "";
        await renderPersonal();
      } catch (error) { notify(error.message || "No se pudieron guardar los archivos."); }
    }
  });
  document.addEventListener("click", async event => {
    const download = event.target.closest("[data-vault-download]");
    const remove = event.target.closest("[data-vault-delete]");
    if (download) {
      try { await downloadFile(download.dataset.vaultDownload); }
      catch (error) { notify(error.message || "No se pudo descargar el archivo."); }
    }
    if (remove) {
      if (!confirm("¿Eliminar este archivo guardado?")) return;
      try {
        await removeFile(remove.dataset.vaultDelete);
        notify("Archivo eliminado.");
        await refreshAll();
      } catch (error) { notify(error.message || "No se pudo eliminar el archivo."); }
    }
  });
  const observer = new MutationObserver(() => {
    document.querySelectorAll("[data-subject-file-vault]").forEach(container => {
      if (container.dataset.vaultReady !== "1") {
        container.dataset.vaultReady = "1";
        renderContainer(container);
      }
    });
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });
  document.addEventListener("DOMContentLoaded", refreshAll);
  if (document.readyState !== "loading") refreshAll();
  window.aulivraFileVault = { refresh:refreshAll };
})();