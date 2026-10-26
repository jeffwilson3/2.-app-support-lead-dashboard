/* ============================================================================
   dashboard_data.js  (shared by every page of the Application Support dashboard)

   1. BACKUP / RESTORE  - export everything to one JSON file, import it back,
                          automatic restore points before risky operations.
   2. STATUS HISTORY    - append-only log of status and flag changes, used by the
                          Portfolio, Mindy Sync, Daily pages and the weekly report.

   All data stays in this browser's localStorage. Nothing is sent anywhere.
   ============================================================================ */
(function (root) {
  "use strict";

  var PREFIX = "app_support_";
  var META_PREFIX = "app_support_meta_";            // never exported / never overwritten by import
  var HISTORY_KEY = "app_support_status_history_v1";
  var STARTED_KEY = "app_support_meta_history_started";
  var LAST_EXPORT_KEY = "app_support_meta_last_export";
  var RESTORE_KEY = "app_support_meta_restore_points";
  var EPOCH_KEY = "app_support_meta_epoch";          // bumped after import/restore so other open tabs reload
  var APP_ID = "app-support-lead-dashboard";
  var FORMAT = 1;
  var MAX_RESTORE_POINTS = 3;
  var STALE_DAYS = 7;

  var PORTFOLIO_KEYS = ["app_support_portfolio_v3", "app_support_portfolio_v2", "app_support_portfolio_v1"];
  var ARRAY_KEYS = PORTFOLIO_KEYS.concat(["app_support_accomplishment_records_v1", HISTORY_KEY, "app_support_weekly_reports_v1"]);
  var OBJECT_KEYS = ["app_support_accomplishments_v1", "app_support_mindy_notes_v1"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function stamp(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " at " +
           d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  /* ======================================================================
     STATUS HISTORY
     Event: { id, at, type: "record"|"activity"|"flag", entityId, appIds[],
              field: "status"|"followUp"|"discussWithMindy", from, to, label }
     from === null means "created with this value".
     ====================================================================== */
  function getEvents() {
    var a = readJson(HISTORY_KEY, []);
    return Array.isArray(a) ? a : [];
  }

  function logChange(ev) {
    if (!ev || ev.from === ev.to) return false;
    try {
      var list = getEvents();
      var at = ev.at && !isNaN(new Date(ev.at).getTime()) ? new Date(ev.at).toISOString() : new Date().toISOString();
      list.push({
        id: "chg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        at: at,
        type: ev.type,
        entityId: ev.entityId,
        appIds: Array.isArray(ev.appIds) ? ev.appIds.slice() : [],
        field: ev.field || "status",
        from: ev.from == null ? null : ev.from,
        to: ev.to,
        label: String(ev.label || "").slice(0, 160)
      });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
      if (!localStorage.getItem(STARTED_KEY)) localStorage.setItem(STARTED_KEY, at);
      return true;
    } catch (e) { return false; }
  }

  function eventsFor(type, id, field) {
    return getEvents()
      .map(function (e, i) { return { e: e, i: i }; })
      .filter(function (x) { return x.e.type === type && x.e.entityId === id && x.e.field === field; })
      .sort(function (a, b) { return a.e.at < b.e.at ? -1 : a.e.at > b.e.at ? 1 : a.i - b.i; })
      .map(function (x) { return x.e; });
  }

  function eventsForApp(appId) {
    return getEvents()
      .map(function (e, i) { return { e: e, i: i }; })
      .filter(function (x) { return Array.isArray(x.e.appIds) && x.e.appIds.indexOf(appId) !== -1; })
      .sort(function (a, b) { return a.e.at < b.e.at ? -1 : a.e.at > b.e.at ? 1 : a.i - b.i; })
      .map(function (x) { return x.e; });
  }

  function eventsForEntity(type, id) {
    return getEvents().filter(function (e) { return e.type === type && e.entityId === id; });
  }

  // Value of a tracked field at the END of the given local day (YYYY-MM-DD).
  // tracked=false means no history exists, so the caller must fall back to the current value.
  function statusAt(type, id, field, endYmd) {
    var evs = eventsFor(type, id, field);
    if (!evs.length) return { tracked: false, value: null };
    var upto = evs.filter(function (e) { return ymd(e.at) <= endYmd; });
    if (upto.length) return { tracked: true, value: upto[upto.length - 1].to };
    var first = evs[0];
    return { tracked: true, value: first.from != null ? first.from : first.to };
  }

  // When did a field last become `value` on or before `endYmd`?
  function lastToDate(type, id, field, value, endYmd) {
    var evs = eventsFor(type, id, field).filter(function (e) { return e.to === value && ymd(e.at) <= endYmd; });
    if (!evs.length) return null;
    var e = evs[evs.length - 1];
    return { date: ymd(e.at), creation: e.from == null };
  }

  function historyStartedAt() {
    var s = localStorage.getItem(STARTED_KEY);
    if (s) return s;
    var evs = getEvents();
    return evs.length ? evs[0].at : "";
  }

  var FIELD_LABEL = { status: "Status", followUp: "Follow Up", discussWithMindy: "Discuss with Mindy" };
  function formatEvent(ev) {
    var f = FIELD_LABEL[ev.field] || ev.field;
    var what = ev.from == null
      ? (ev.type === "flag" ? f + " set to " + ev.to : "Logged as " + ev.to)
      : f + ": " + ev.from + " → " + ev.to;
    return { when: stamp(ev.at), what: what, subject: ev.type === "flag" ? "" : (ev.label || "") };
  }

  /* ======================================================================
     BACKUP / RESTORE
     ====================================================================== */
  function dataKeys() {
    var ks = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(PREFIX) === 0 && k.indexOf(META_PREFIX) !== 0) ks.push(k);
    }
    return ks.sort();
  }

  function snapshotKeys() {
    var o = {};
    dataKeys().forEach(function (k) { o[k] = localStorage.getItem(k); });
    return o;
  }

  function describe(keys) {
    function parse(k) { try { return JSON.parse(keys[k]); } catch (e) { return null; } }
    var port = null;
    for (var i = 0; i < PORTFOLIO_KEYS.length && !Array.isArray(port); i++) port = parse(PORTFOLIO_KEYS[i]);
    port = Array.isArray(port) ? port : [];
    var native = 0, notes = 0;
    port.forEach(function (a) {
      native += Array.isArray(a.activityHistory) ? a.activityHistory.length : 0;
      if (a.activity && String(a.activity).trim()) notes++;
    });
    var recs = parse("app_support_accomplishment_records_v1");
    var acc = parse("app_support_accomplishments_v1");
    var rep = parse("app_support_weekly_reports_v1");
    var hist = parse(HISTORY_KEY);
    var days = 0;
    if (acc && typeof acc === "object") Object.keys(acc).forEach(function (d) { if (String(acc[d] || "").trim()) days++; });
    return {
      apps: port.length,
      notes: notes,
      entries: native + (Array.isArray(recs) ? recs.length : 0),
      days: days,
      reports: Array.isArray(rep) ? rep.length : 0,
      changes: Array.isArray(hist) ? hist.length : 0,
      keyCount: Object.keys(keys).length
    };
  }
  function describeText(d) {
    return d.apps + " applications · " + d.entries + " activity entries · " + d.days + " daily-log days · " +
           d.reports + " saved reports · " + d.changes + " status changes";
  }

  function buildBackup() {
    return { app: APP_ID, format: FORMAT, exportedAt: new Date().toISOString(), keys: snapshotKeys() };
  }

  function fileStamp() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes());
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function exportBackup() {
    var b = buildBackup();
    download("app_support_backup_" + fileStamp() + ".json", JSON.stringify(b, null, 2));
    try { localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString()); } catch (e) { /* ignore */ }
    refreshBadge();
    return describe(b.keys);
  }

  // Returns { ok:true, backup } or { ok:false, error }. Does NOT touch stored data.
  function validateBackup(text) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, error: "That file is not valid JSON." }; }
    if (!obj || obj.app !== APP_ID) return { ok: false, error: "This is not a backup from the Application Support dashboard." };
    if (typeof obj.format === "number" && obj.format > FORMAT) return { ok: false, error: "This backup was made by a newer version of the dashboard." };
    if (!obj.keys || typeof obj.keys !== "object" || Array.isArray(obj.keys)) return { ok: false, error: "The backup contains no data section." };
    var names = Object.keys(obj.keys);
    if (!names.length) return { ok: false, error: "The backup is empty." };
    for (var i = 0; i < names.length; i++) {
      var k = names[i], v = obj.keys[k];
      if (k.indexOf(PREFIX) !== 0 || k.indexOf(META_PREFIX) === 0) return { ok: false, error: "Unexpected data key in backup: " + k };
      if (typeof v !== "string") return { ok: false, error: "Corrupt value for " + k };
      var parsed;
      try { parsed = JSON.parse(v); } catch (e) { return { ok: false, error: "Corrupt data for " + k }; }
      if (ARRAY_KEYS.indexOf(k) !== -1 && !Array.isArray(parsed)) return { ok: false, error: k + " should be a list." };
      if (OBJECT_KEYS.indexOf(k) !== -1 && (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))) return { ok: false, error: k + " has the wrong shape." };
    }
    return { ok: true, backup: obj };
  }

  function getRestorePoints() {
    var a = readJson(RESTORE_KEY, []);
    return Array.isArray(a) ? a : [];
  }

  function createRestorePoint(reason) {
    var keys = snapshotKeys();
    if (!Object.keys(keys).length) return null;             // nothing worth protecting
    var point = { id: "rp_" + Date.now(), at: new Date().toISOString(), reason: reason || "Manual", keys: keys };
    var list = getRestorePoints();
    list.push(point);
    while (list.length > MAX_RESTORE_POINTS) list.shift();
    for (;;) {
      try { localStorage.setItem(RESTORE_KEY, JSON.stringify(list)); return point; }
      catch (e) {
        if (list.length <= 1) return null;                    // storage is full
        list.shift();
      }
    }
  }

  function applyKeys(keys) {
    var before = snapshotKeys();
    try {
      dataKeys().forEach(function (k) { localStorage.removeItem(k); });
      Object.keys(keys).forEach(function (k) { localStorage.setItem(k, keys[k]); });
      // Last step: tell every other open tab to reload, so a stale tab can never write old data back over this
      localStorage.setItem(EPOCH_KEY, String(Date.now()) + "_" + Math.random().toString(36).slice(2, 6));
      return { ok: true };
    } catch (e) {
      // roll back to exactly what was there before
      try {
        dataKeys().forEach(function (k) { localStorage.removeItem(k); });
        Object.keys(before).forEach(function (k) { localStorage.setItem(k, before[k]); });
      } catch (e2) { /* nothing more we can do */ }
      return { ok: false, error: "The browser ran out of storage space. Nothing was changed." };
    }
  }

  function importBackup(backup) {
    var rp = createRestorePoint("Before importing a backup");
    var r = applyKeys(backup.keys);
    if (!r.ok) return r;
    r.restorePoint = !!rp;
    return r;
  }

  function restorePoint(id) {
    var p = getRestorePoints().filter(function (x) { return x.id === id; })[0];
    if (!p) return { ok: false, error: "Restore point not found." };
    createRestorePoint("Before restoring an earlier version");
    return applyKeys(p.keys);
  }

  function deleteRestorePoint(id) {
    localStorage.setItem(RESTORE_KEY, JSON.stringify(getRestorePoints().filter(function (x) { return x.id !== id; })));
  }

  // Call before anything destructive. Creates a restore point AND downloads a backup file.
  function safeguard(reason, alsoDownload) {
    var p = createRestorePoint(reason);
    if (alsoDownload !== false) {
      try {
        var b = buildBackup();
        if (Object.keys(b.keys).length) {
          download("app_support_backup_before_reset_" + fileStamp() + ".json", JSON.stringify(b, null, 2));
          localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
        }
      } catch (e) { /* the restore point still protects the data */ }
    }
    return !!p || !Object.keys(snapshotKeys()).length;
  }

  function historyCsv() {
    var rows = [["Date/Time", "Type", "Field", "From", "To", "Item", "Application IDs"]];
    getEvents().forEach(function (e) {
      rows.push([e.at, e.type, e.field, e.from == null ? "(created)" : e.from, e.to, e.label || "", (e.appIds || []).join("; ")]);
    });
    return rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\n");
  }

  /* ======================================================================
     UI  (a "Data" button + dialog injected into every page)
     ====================================================================== */
  function lastExportInfo() {
    var iso = localStorage.getItem(LAST_EXPORT_KEY);
    if (!iso) return { text: "Never", stale: dataKeys().length > 0 };
    var days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return { text: stamp(iso) + (days >= 1 ? " (" + days + " day" + (days === 1 ? "" : "s") + " ago)" : " (today)"), stale: days >= STALE_DAYS };
  }

  function refreshBadge() {
    var btn = document.getElementById("dd-open-btn");
    if (!btn) return;
    var info = lastExportInfo();
    btn.innerHTML = "💾 Data" + (info.stale ? ' <span style="color:#f0883e;">●</span>' : "");
    btn.title = info.stale
      ? "Back up your data: " + (localStorage.getItem(LAST_EXPORT_KEY) ? "last backup is over " + STALE_DAYS + " days old" : "no backup has been made yet")
      : "Backup, restore and status history";
  }

  function injectStyles() {
    if (document.getElementById("dd-styles")) return;
    var s = document.createElement("style");
    s.id = "dd-styles";
    s.textContent =
      ".dd-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(3px);display:none;justify-content:center;align-items:center;z-index:1300;padding:20px}" +
      ".dd-box{background:var(--card-bg,#161b22);border:1px solid var(--card-border,#30363d);border-radius:12px;width:100%;max-width:720px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 12px 36px rgba(0,0,0,.5);color:var(--text,#e6edf3);font-family:var(--font-sans,-apple-system,BlinkMacSystemFont,sans-serif)}" +
      ".dd-head{padding:14px 20px;border-bottom:1px solid var(--card-border,#30363d);display:flex;justify-content:space-between;align-items:center}" +
      ".dd-body{padding:16px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;font-size:13px;line-height:1.5}" +
      ".dd-card{background:#0d1117;border:1px solid var(--card-border,#30363d);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}" +
      ".dd-h{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#8b949e)}" +
      ".dd-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}" +
      ".dd-muted{color:var(--text-muted,#8b949e);font-size:12px}" +
      ".dd-warn{background:rgba(240,136,62,.12);border:1px solid rgba(240,136,62,.4);color:#ffb07c;border-radius:8px;padding:8px 12px;font-size:12px}" +
      ".dd-rp{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid rgba(48,54,61,.6)}" +
      ".dd-link{background:transparent;border:none;color:var(--accent-hover,#58a6ff);font-size:12px;cursor:pointer;padding:2px 6px;border-radius:4px}" +
      ".dd-link:hover{background:var(--card-hover,#1c2128);color:#fff}.dd-link.danger{color:#ff7b72}" +
      ".dd-trail{margin-top:6px;border:1px solid rgba(48,54,61,.7);border-radius:6px;padding:4px 8px;background:rgba(13,17,23,.6);font-size:11px}" +
      ".dd-trail summary{cursor:pointer;color:var(--text-muted,#8b949e);font-weight:600}" +
      ".dd-trail-row{display:flex;gap:8px;flex-wrap:wrap;padding:3px 0;border-top:1px solid rgba(48,54,61,.4)}" +
      ".dd-trail-row:first-of-type{margin-top:4px}" +
      ".dd-trail-when{font-family:var(--font-mono,monospace);color:var(--text-muted,#8b949e)}" +
      ".dd-trail-subj{color:var(--text-muted,#8b949e);font-style:italic;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}";
    document.head.appendChild(s);
  }

  function toast(msg) {
    var t = document.getElementById("toastNotification");
    if (t) {
      t.textContent = msg; t.style.display = "block";
      setTimeout(function () { t.style.display = "none"; }, 3000);
    } else { alert(msg); }
  }

  function renderPanel() {
    var d = describe(snapshotKeys());
    var info = lastExportInfo();
    var started = historyStartedAt();
    var points = getRestorePoints().slice().reverse();
    var body = document.getElementById("dd-body");
    body.innerHTML =
      '<div class="dd-card"><div class="dd-h">Your data in this browser</div>' +
        "<div>" + esc(describeText(d)) + "</div>" +
        '<div class="dd-muted">Last backup file: <strong style="color:' + (info.stale ? "#ffb07c" : "#3fb950") + '">' + esc(info.text) + "</strong></div>" +
        (info.stale ? '<div class="dd-warn">Your data lives only in this browser. Export a backup so it can be recovered if browser data is cleared or you switch computers.</div>' : "") +
      "</div>" +

      '<div class="dd-card"><div class="dd-h">Backup &amp; restore</div>' +
        '<div class="dd-row">' +
          '<button class="btn btn-primary" onclick="DashData.ui.doExport()">⬇ Export backup (.json)</button>' +
          '<button class="btn" onclick="document.getElementById(\'dd-file\').click()">⬆ Import backup…</button>' +
          '<input type="file" id="dd-file" accept="application/json,.json" style="display:none" onchange="DashData.ui.doImport(this)" />' +
        "</div>" +
        '<div class="dd-muted">The backup contains everything: notes, activity history, daily logs, Mindy notes, saved reports and the status history. ' +
        "Importing <strong>replaces</strong> the data in this browser, and a restore point of the current data is saved first. " +
        "Use the same two steps (export, then import) to move your data to another computer.</div>" +
      "</div>" +

      '<div class="dd-card"><div class="dd-h">Restore points (automatic, last ' + MAX_RESTORE_POINTS + ")</div>" +
        (points.length ? points.map(function (p) {
          return '<div class="dd-rp"><div><div style="font-weight:600;">' + esc(p.reason) + '</div><div class="dd-muted">' + esc(stamp(p.at)) + " · " + esc(describeText(describe(p.keys))) + "</div></div>" +
            '<div class="dd-row" style="gap:2px;"><button class="dd-link" onclick="DashData.ui.doRestore(\'' + p.id + '\')">Restore</button>' +
            '<button class="dd-link" onclick="DashData.ui.doDownloadPoint(\'' + p.id + '\')">Download</button>' +
            '<button class="dd-link danger" onclick="DashData.ui.doDeletePoint(\'' + p.id + '\')">Delete</button></div></div>';
        }).join("") : '<div class="dd-muted">None yet. One is created automatically before Reset Portfolio, before an import, and before a restore.</div>') +
      "</div>" +

      '<div class="dd-card"><div class="dd-h">Status history</div>' +
        "<div>" + d.changes + " recorded change" + (d.changes === 1 ? "" : "s") + (started ? " since " + esc(stamp(started)) : "") + ".</div>" +
        '<div class="dd-muted">Every status change on a record and every Follow Up / Discuss with Mindy change is logged with its date and previous value. ' +
        "History is recorded from the day this feature was added; earlier changes cannot be recovered. " +
        "Weekly reports for past periods use it to show what an item's status was at the end of that period.</div>" +
        '<div class="dd-row"><button class="btn" onclick="DashData.ui.doHistoryCsv()">⬇ Export history (.csv)</button></div>' +
      "</div>";
  }

  var ui = {
    open: function () { renderPanel(); document.getElementById("dd-overlay").style.display = "flex"; },
    close: function () { document.getElementById("dd-overlay").style.display = "none"; },
    doExport: function () {
      var d = exportBackup();
      renderPanel();
      toast("Backup downloaded (" + d.apps + " applications, " + d.entries + " entries)");
    },
    doImport: function (input) {
      var file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var v = validateBackup(String(reader.result));
        if (!v.ok) { alert("Import cancelled. " + v.error + "\n\nYour current data was not changed."); return; }
        var incoming = describe(v.backup.keys), current = describe(snapshotKeys());
        var msg = "Replace the data in this browser with this backup?\n\n" +
          "Backup (" + (v.backup.exportedAt ? stamp(v.backup.exportedAt) : "unknown date") + "):\n  " + describeText(incoming) + "\n\n" +
          "Currently in this browser:\n  " + describeText(current) + "\n\n" +
          "A restore point of the current data is saved first, so you can undo this.";
        if (!confirm(msg)) return;
        var r = importBackup(v.backup);
        if (!r.ok) { alert(r.error); return; }
        alert("Backup imported. The page will now reload.");
        location.reload();
      };
      reader.onerror = function () { alert("Could not read that file. Your current data was not changed."); };
      reader.readAsText(file);
    },
    doRestore: function (id) {
      var p = getRestorePoints().filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      if (!confirm("Restore the data from \"" + p.reason + "\" (" + stamp(p.at) + ")?\n\n" + describeText(describe(p.keys)) +
                   "\n\nYour current data is saved as a new restore point first.")) return;
      var r = restorePoint(id);
      if (!r.ok) { alert(r.error); return; }
      alert("Restored. The page will now reload.");
      location.reload();
    },
    doDownloadPoint: function (id) {
      var p = getRestorePoints().filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      download("app_support_restore_point_" + ymd(p.at) + "_" + p.id.slice(3) + ".json",
        JSON.stringify({ app: APP_ID, format: FORMAT, exportedAt: p.at, keys: p.keys }, null, 2));
    },
    doDeletePoint: function (id) {
      if (!confirm("Delete this restore point?")) return;
      deleteRestorePoint(id);
      renderPanel();
    },
    doHistoryCsv: function () {
      if (!getEvents().length) { toast("No status changes have been recorded yet."); return; }
      download("app_support_status_history_" + fileStamp() + ".csv", historyCsv(), "text/csv");
    }
  };

  function mount() {
    if (typeof document === "undefined" || document.getElementById("dd-open-btn")) return;
    injectStyles();
    var nav = document.querySelector(".top-nav");
    var btn = document.createElement("button");
    btn.className = "btn"; btn.id = "dd-open-btn"; btn.type = "button";
    btn.onclick = ui.open;
    if (nav) {
      var host = nav.lastElementChild && nav.lastElementChild.tagName === "DIV" && !nav.lastElementChild.classList.contains("nav-tabs")
        ? nav.lastElementChild : nav;
      host.insertBefore(btn, host.firstChild);
      if (host !== nav) host.style.display = "flex", host.style.gap = "8px", host.style.alignItems = "center";
    } else {
      btn.style.cssText = "position:fixed;top:12px;right:12px;z-index:1200;";
      document.body.appendChild(btn);
    }
    var ov = document.createElement("div");
    ov.id = "dd-overlay"; ov.className = "dd-overlay";
    ov.innerHTML = '<div class="dd-box"><div class="dd-head"><h3 style="font-size:16px;">💾 Data, Backup &amp; History</h3>' +
      '<button class="btn" type="button" onclick="DashData.ui.close()">✕</button></div><div class="dd-body" id="dd-body"></div></div>';
    ov.addEventListener("click", function (e) { if (e.target === ov) ui.close(); });
    document.body.appendChild(ov);
    refreshBadge();
  }

  /* Collapsible "Status history" block. Returns "" unless something actually changed
     (a bare creation event is not worth showing). Open/closed state survives re-renders. */
  var trailOpen = {};
  function trailHtml(events, opts) {
    opts = opts || {};
    events = events || [];
    if (!events.some(function (e) { return e.from != null; })) return "";
    injectStyles();
    var id = opts.id || ("trail_" + Math.random().toString(36).slice(2, 7));
    var rows = events.slice().reverse().map(function (ev) {
      var f = formatEvent(ev);
      return '<div class="dd-trail-row"><span class="dd-trail-when">' + esc(f.when) + "</span><span>" + esc(f.what) + "</span>" +
        (f.subject ? '<span class="dd-trail-subj">' + esc(f.subject) + "</span>" : "") + "</div>";
    }).join("");
    return '<details class="dd-trail" id="' + esc(id) + '"' + (trailOpen[id] ? " open" : "") +
      ' ontoggle="DashData.trailToggled(this)"><summary>🕒 Status history (' + events.length + ")</summary>" + rows + "</details>";
  }
  function trailToggled(el) { if (el && el.id) trailOpen[el.id] = !!el.open; }

  // Another tab imported / restored a backup: reload so this tab never writes stale data back
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("storage", function (e) {
      if (e.key === EPOCH_KEY && e.newValue) { try { location.reload(); } catch (err) { /* ignore */ } }
    });
  }

  var api = {
    // status history
    logChange: logChange, getEvents: getEvents, eventsForApp: eventsForApp, eventsForEntity: eventsForEntity,
    statusAt: statusAt, lastToDate: lastToDate, historyStartedAt: historyStartedAt, formatEvent: formatEvent,
    trailHtml: trailHtml, trailToggled: trailToggled,
    HISTORY_KEY: HISTORY_KEY, EPOCH_KEY: EPOCH_KEY,
    // backup / restore
    exportBackup: exportBackup, buildBackup: buildBackup, validateBackup: validateBackup, importBackup: importBackup,
    createRestorePoint: createRestorePoint, getRestorePoints: getRestorePoints, restorePoint: restorePoint,
    safeguard: safeguard, describe: describe, describeText: describeText, historyCsv: historyCsv,
    ui: ui, mount: mount
  };
  root.DashData = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
