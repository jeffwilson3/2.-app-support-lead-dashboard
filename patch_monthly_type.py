import re

with open('monthly_stakeholder_sync.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. CSS grid update
content = content.replace(
    '.mn-meta-grid { display: grid; grid-template-columns: 170px minmax(0, 1fr) 210px; gap: 12px; }',
    '.mn-meta-grid { display: grid; grid-template-columns: 210px 150px minmax(0, 1fr) 210px; gap: 12px; }'
)

# 2. HTML template update
old_html = '''        <div class="mn-meta-grid">
          <label class="mn-field">
            <span class="mn-label">Meeting date</span>
            <input type="date" id="activeSyncDate" class="mn-input" oninput="onMetaInput('date', this.value)" />
          </label>
          <label class="mn-field">
            <span class="mn-label">Stakeholders / attendees</span>
            <input type="text" id="mnAttendees" class="mn-input" placeholder="e.g. Jane Doe (Legal Ops), Sam Lee (Product)" oninput="onMetaInput('attendees', this.value)" />
          </label>'''

new_html = '''        <div class="mn-meta-grid">
          <label class="mn-field">
            <span class="mn-label">Meeting type</span>
            <select id="mnMeetingType" class="mn-input" onchange="onMetaInput('type', this.value)">
              <option value="Monthly Stakeholder Sync">Monthly Stakeholder Sync</option>
              <option value="Ticket Cleanup Sync">Ticket Cleanup Sync</option>
            </select>
          </label>
          <label class="mn-field">
            <span class="mn-label">Meeting date</span>
            <input type="date" id="activeSyncDate" class="mn-input" oninput="onMetaInput('date', this.value)" />
          </label>
          <label class="mn-field">
            <span class="mn-label">Stakeholders / attendees</span>
            <input type="text" id="mnAttendees" class="mn-input" placeholder="e.g. Jane Doe (Legal Ops), Sam Lee (Product)" oninput="onMetaInput('attendees', this.value)" />
          </label>'''

content = content.replace(old_html, new_html)

# 3. emptyMeeting
old_empty = '''function emptyMeeting(date) {
      return { id: uid("m"), date: date || localYmd(new Date()), attendees: "",'''
new_empty = '''function emptyMeeting(date) {
      return { id: uid("m"), date: date || localYmd(new Date()), type: "Monthly Stakeholder Sync", attendees: "",'''
content = content.replace(old_empty, new_empty)

# 4. renderEditor
old_render = '''      renderMeetingSelect(rec);
      document.getElementById("activeSyncDate").value = m.date || "";
      document.getElementById("mnAttendees").value = m.attendees || "";
      updateSavedLabel();'''
new_render = '''      renderMeetingSelect(rec);
      document.getElementById("mnMeetingType").value = m.type || "Monthly Stakeholder Sync";
      document.getElementById("activeSyncDate").value = m.date || "";
      document.getElementById("mnAttendees").value = m.attendees || "";
      updateSavedLabel();'''
content = content.replace(old_render, new_render)

# 5. meetingToText
old_text = '''function meetingToText(m) {
      if (!meetingHasContent(m)) return "";
      const L = [];
      L.push("Monthly stakeholder sync — " + (m.date ? fmtDay(m.date) : "date not set"));'''
new_text = '''function meetingToText(m) {
      if (!meetingHasContent(m)) return "";
      const L = [];
      L.push((m.type || "Monthly Stakeholder Sync") + " — " + (m.date ? fmtDay(m.date) : "date not set"));'''
content = content.replace(old_text, new_text)

# 6. Email Recap Subject
old_subject = '''var subject = String(app.name == null ? "" : app.name).trim() +
    " | Monthly Stakeholder Sync Recap \u2013 " + (erLongDate(meeting.date) || "Date Not Set");'''
new_subject = '''var type = String(meeting.type || "Monthly Stakeholder Sync").trim();
  var subject = String(app.name == null ? "" : app.name).trim() +
    " | " + type + " Recap \u2013 " + (erLongDate(meeting.date) || "Date Not Set");'''
content = content.replace(old_subject, new_subject)

# 7. Intro paragraph logic depending on type
# Wait, the prompt says:
# "Thank you for joining our monthly stakeholder sync. Below is a summary of our discussion and agreed next steps."
# Let's parameterize the intro.
old_intro_var = '''var ER_INTRO = "Thank you for joining our monthly stakeholder sync. Below is a summary of our discussion and agreed next steps.";'''
new_intro_var = '''var getIntro = function(type) {
  var t = (type || "Monthly Stakeholder Sync").toLowerCase();
  return "Thank you for joining our " + t + ". Below is a summary of our discussion and agreed next steps.";
};'''
content = content.replace(old_intro_var, new_intro_var)

# And usage of ER_INTRO
old_intro_usage = '''p(erEsc(ER_GREETING)) + p(erEsc(ER_INTRO));
  var text = [ER_GREETING, ER_INTRO];'''
new_intro_usage = '''p(erEsc(ER_GREETING)) + p(erEsc(getIntro(meeting.type)));
  var text = [ER_GREETING, getIntro(meeting.type)];'''
content = content.replace(old_intro_usage, new_intro_usage)

# 8. Export All Sync Notes string
old_export_head = '''lines.push("Application Support — Monthly Stakeholder Sync Digest");'''
new_export_head = '''lines.push("Application Support — Stakeholder Sync Digest");'''
content = content.replace(old_export_head, new_export_head)

with open('monthly_stakeholder_sync.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied successfully.")
