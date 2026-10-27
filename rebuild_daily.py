import re

with open('daily_standup_log.html', 'r', encoding='utf-8') as f:
    s = f.read()

# Replace the HTML structure between <!-- Main Editor --> and <!-- Standup Email Recap (Generated) -->
old_ui_regex = r'<!-- Main Editor -->.*?<!-- Standup Email Recap \(Generated\) -->'
new_ui = '''<!-- Compact Daily Activity Dashboard -->
    <div class="editor-card" id="activityDashboard">
      
      <!-- Top Summary & Navigation -->
      <div class="date-control-bar" style="margin-bottom: 0;">
        <div class="date-nav-group">
          <button class="btn" onclick="stepDate(-1)">← Previous Day</button>
          <input type="date" id="datePicker" class="date-input" onchange="onDateChange()" />
          <button class="btn" onclick="stepDate(1)">Next Day →</button>
          <button class="btn" onclick="jumpToToday()">Today</button>
        </div>
        <div id="formattedDateLabel" style="font-size:13px; font-weight:600; color:var(--text-muted);">
          Tuesday, Oct 20, 2026
        </div>
      </div>
      
      <!-- Metrics -->
      <div style="display: flex; gap: 16px; margin: 20px 0; padding: 16px; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 8px;">
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #fff;" id="metricLogged">0</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Activities Logged</div>
        </div>
        <div style="width: 1px; background: var(--card-border);"></div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #fff;" id="metricCompleted">0</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Completed</div>
        </div>
        <div style="width: 1px; background: var(--card-border);"></div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #fff;" id="metricApps">0</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Apps Linked</div>
        </div>
      </div>

      <!-- Header & Add Button -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="font-size: 16px; font-weight: 600; margin: 0; color: #fff;">Activity Timeline</h2>
        <button class="btn btn-primary" onclick="openRecForm()">+ Add Activity</button>
      </div>

      <!-- Add/Edit Form (Hidden by default) -->
      <div class="rec-form" id="recForm" style="display: none; background: #0d1117; margin-bottom: 20px;">
        <div class="rec-col">
          <label class="rec-label" id="recFormTitle">New activity</label>
          <textarea class="rec-textarea" id="recDesc" placeholder="Activity description..."></textarea>
        </div>
        <div class="rec-grid">
          <div class="rec-col">
            <label class="rec-label">Category</label>
            <select class="rec-select" id="recCategory">
              <option>Accomplishment</option>
              <option>Update</option>
              <option>Issue</option>
              <option>Enhancement</option>
              <option>Follow-Up</option>
              <option>Blocker</option>
              <option>Decision</option>
            </select>
          </div>
          <div class="rec-col">
            <label class="rec-label">Status</label>
            <select class="rec-select" id="recStatus">
              <option>Completed</option>
              <option>In Progress</option>
              <option>Pending</option>
              <option>Blocked</option>
            </select>
          </div>
        </div>
        <div class="rec-col">
          <label class="rec-label">Next Steps (Optional)</label>
          <input type="text" class="rec-textarea" id="recNext" placeholder="What needs to happen next?" style="height:34px;">
        </div>
        <div class="rec-col">
          <label class="rec-label">Linked Applications</label>
          <div class="rec-app-picker" id="recAppPicker"></div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
          <button class="btn" onclick="closeRecForm()">Cancel</button>
          <button class="btn btn-primary" onclick="saveRecord()">Save Activity</button>
        </div>
      </div>

      <!-- List -->
      <div id="recList" class="rec-list" style="display: flex; flex-direction: column; gap: 12px;"></div>

    </div>

    <!-- Standup Email Recap (Generated) -->'''
s = re.sub(old_ui_regex, new_ui, s, flags=re.S)

# Now we need to update JS logic.
# loadDateEntry currently populates mnSections and calls renderRecords().
# we just need to populate the metrics and call renderRecords.
old_loadDateEntry = r'function loadDateEntry\(dateStr\).*?if \(typeof renderRecords === "function"\) renderRecords\(\);\n    \}'
new_loadDateEntry = '''function loadDateEntry(dateStr) {
      const [y, m, d] = dateStr.split("-").map(Number);
      if (typeof erOnContextChange === "function") erOnContextChange();
      const dateObj = new Date(y, m - 1, d);
      document.getElementById("formattedDateLabel").textContent = dateObj.toLocaleDateString(undefined, {
        weekday: "long", year: "numeric", month: "short", day: "numeric"
      });

      renderRecords();
      highlightActiveHistoryItem();
    }'''
s = re.sub(old_loadDateEntry, new_loadDateEntry, s, flags=re.S)

# We should also update renderRecords to fill out the metrics.
# And we want to sort by entry time or createdAt? Let's sort by createdAt ascending.
old_renderRecords = r'function renderRecords\(\) \{.*?\}\).join\(""\);\n    \}'
new_renderRecords = '''function renderRecords() {
      const list = document.getElementById("recList");
      if (!list) return;
      
      const items = recordsForDate(selectedDate).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      // Update Metrics
      document.getElementById("metricLogged").textContent = items.length;
      document.getElementById("metricCompleted").textContent = items.filter(r => r.status === "Completed").length;
      
      const appSet = new Set();
      items.forEach(r => (r.appIds || []).forEach(id => appSet.add(id)));
      document.getElementById("metricApps").textContent = appSet.size;

      if (!items.length) {
        list.innerHTML = `<div class="rec-empty" style="text-align:center; padding:30px; color:var(--text-muted); font-style:italic;">No activities logged for this day.</div>`;
        return;
      }
      
      const statuses = ["Completed", "In Progress", "Pending", "Blocked"];
      list.innerHTML = items.map(r => {
        const general = !(r.appIds && r.appIds.length);
        const appPills = general
          ? `<span class="pill general" style="background:rgba(255,255,255,0.05); color:#fff;">General</span>`
          : r.appIds.map(id => `<span class="pill app" style="background:rgba(47,129,247,0.15); color:var(--accent-hover);">🔗 ${esc(appName(id))}</span>`).join("");
        
        let statusColor = "var(--text-muted)";
        if (r.status === "Completed") statusColor = "var(--green)";
        if (r.status === "In Progress") statusColor = "var(--accent-hover)";
        if (r.status === "Blocked") statusColor = "var(--orange)";

        const opts = statuses.map(s => `<option ${r.status === s ? "selected" : ""}>${s}</option>`).join("");
        
        const time = fmtStamp(r.createdAt).split(" at ")[1] || "";
        
        return `
          <div class="rec-card ${general ? "general" : ""}" style="background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 14px; position:relative;">
            <div style="display:flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px;">${time}</span>
                <span style="width: 4px; height: 4px; background: var(--text-muted); border-radius: 50%; opacity: 0.5;"></span>
                <span style="font-size: 12px; font-weight: 500; color: ${statusColor};">${esc(r.category)}</span>
                <span style="width: 4px; height: 4px; background: var(--text-muted); border-radius: 50%; opacity: 0.5;"></span>
                <select style="background:transparent; border:none; color:inherit; font-size:12px; cursor:pointer; outline:none;" onchange="changeRecStatus('${r.id}', this.value)">${opts}</select>
              </div>
              <div style="display:flex; gap:12px;">
                <button style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:13px;" onclick="editRecord('${r.id}')">Edit</button>
                <button style="background:none; border:none; color:var(--orange); cursor:pointer; font-size:13px;" onclick="deleteRecord('${r.id}')">Delete</button>
              </div>
            </div>
            
            <div style="font-size: 14px; line-height: 1.5; color: #fff; margin-bottom: 8px;">${esc(r.description)}</div>
            ${r.nextSteps ? `<div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;"><strong>↳ Next Steps:</strong> ${esc(r.nextSteps)}</div>` : ""}
            
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
              ${appPills}
            </div>
          </div>`;
      }).join("");
    }'''
s = re.sub(old_renderRecords, new_renderRecords, s, flags=re.S)

# And update emptyStandup, serializeDaily, etc.? 
# They are no longer used by the UI but the email recap might expect accomplishmentsByDate?
# The email recap (erGenerate) uses WR-ENGINE-BEGIN to pull both free-text (daily log) AND accomplishments.
# It specifically calls wrParseDailyLog which uses accomplishmentsByDate.
# We don't want to break the email generator for past legacy data.
# BUT we should hide the email generator if it's confusing, or leave it. The prompt doesn't say remove it.
# Let's leave accomplishmentsByDate intact so historical emails still work.

with open('daily_standup_log.html', 'w', encoding='utf-8') as f:
    f.write(s)

print("Rewrite done.")
