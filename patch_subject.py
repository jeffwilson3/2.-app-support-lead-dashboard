import re

with open('monthly_stakeholder_sync.html', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'var subject = String\(app\.name == null \? "" : app\.name\)\.trim\(\) \+\n\s*" \| Monthly Stakeholder Sync Recap (.*?) \+ \(erLongDate\(meeting\.date\) \|\| "Date Not Set"\);'

def repl(match):
    dash = match.group(1)
    return f'''var type = String(meeting.type || "Monthly Stakeholder Sync").trim();
  var subject = String(app.name == null ? "" : app.name).trim() +
    " | " + type + " Recap {dash} + (erLongDate(meeting.date) || "Date Not Set");'''

content = re.sub(pattern, repl, content)

with open('monthly_stakeholder_sync.html', 'w', encoding='utf-8') as f:
    f.write(content)
