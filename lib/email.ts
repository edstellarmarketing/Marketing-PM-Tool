const GAS_URL = process.env.GOOGLE_APPS_SCRIPT_EMAIL_URL

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!GAS_URL) {
    console.warn('GOOGLE_APPS_SCRIPT_EMAIL_URL not set — skipping email')
    return
  }
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, html }),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error('Email send failed:', text)
  }
}

export function inviteEmailHtml(fullName: string, setPasswordUrl: string) {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;background:#f9fafb;border-radius:8px">
      <h2 style="color:#111827;margin-top:0">You're invited to Marketing PM Tool</h2>
      <p style="color:#374151">Hi ${fullName},</p>
      <p style="color:#374151">You've been added to the Edstellar Marketing team workspace. Click the button below to set your password and get started.</p>
      <a href="${setPasswordUrl}" style="display:inline-block;margin:24px 0;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        Set Your Password
      </a>
      <p style="color:#6b7280;font-size:13px">Button not working? Copy and paste this link into your browser:</p>
      <p style="word-break:break-all;font-size:12px;color:#4f46e5;margin:0">${setPasswordUrl}</p>
      <p style="color:#6b7280;font-size:13px;margin-top:16px">This link expires in 24 hours. If you didn't expect this invitation, you can ignore this email.</p>
    </div>
  `
}

export function passwordResetEmailHtml(resetUrl: string) {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;background:#f9fafb;border-radius:8px">
      <h2 style="color:#111827;margin-top:0">Reset your password</h2>
      <p style="color:#374151">Click the button below to set a new password for your Marketing PM Tool account. This link expires in 1 hour.</p>
      <a href="${resetUrl}" style="display:inline-block;margin:24px 0;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        Set New Password
      </a>
      <p style="color:#6b7280;font-size:13px">Button not working? Copy and paste this link into your browser:</p>
      <p style="word-break:break-all;font-size:12px;color:#4f46e5;margin:0">${resetUrl}</p>
      <p style="color:#6b7280;font-size:13px;margin-top:16px">If you didn't request a password reset, you can ignore this email.</p>
    </div>
  `
}

interface TaskRow {
  id: string
  title: string
  priority: string
  category: string | null
  status: string
  score_weight: number
}

interface MemberGroup {
  full_name: string
  designation: string | null
  department: string | null
  completed: TaskRow[]
  incomplete: TaskRow[]
}

function priorityBadge(p: string) {
  const map: Record<string, string> = {
    critical: 'background:#fef2f2;color:#dc2626;border:1px solid #fecaca',
    high:     'background:#fff7ed;color:#ea580c;border:1px solid #fed7aa',
    medium:   'background:#fefce8;color:#ca8a04;border:1px solid #fef08a',
    low:      'background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0',
  }
  return `<span style="font-size:11px;padding:2px 8px;border-radius:99px;font-weight:600;${map[p] ?? 'background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb'}">${p}</span>`
}

function taskRow(task: TaskRow, appUrl: string) {
  return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6">
        <a href="${appUrl}/tasks/${task.id}" style="color:#1d4ed8;text-decoration:none;font-size:13px;font-weight:500">${task.title}</a>
        ${task.category ? `<span style="margin-left:6px;font-size:11px;color:#9ca3af">${task.category}</span>` : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap">${priorityBadge(task.priority)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap">${task.score_weight} pts</td>
    </tr>
  `
}

function memberSection(member: MemberGroup, appUrl: string) {
  const hasCompleted = member.completed.length > 0
  const hasIncomplete = member.incomplete.length > 0
  if (!hasCompleted && !hasIncomplete) return ''

  return `
    <div style="margin-bottom:16px;padding:16px;background:#fff;border:1px solid #e5e7eb;border-radius:10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <strong style="font-size:14px;color:#111827">${member.full_name}</strong>
        ${member.designation ? `<span style="font-size:12px;color:#6b7280">· ${member.designation}</span>` : ''}
      </div>
      ${hasCompleted ? `
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#16a34a;margin:0 0 6px">✅ Completed (${member.completed.length})</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:${hasIncomplete ? '12px' : '0'}">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Task</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Priority</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Score</th>
            </tr>
          </thead>
          <tbody>${member.completed.map(t => taskRow(t, appUrl)).join('')}</tbody>
        </table>
      ` : ''}
      ${hasIncomplete ? `
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#dc2626;margin:0 0 6px">⚠️ Not Completed (${member.incomplete.length})</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <thead>
            <tr style="background:#fef2f2">
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;border-bottom:1px solid #fecaca">Task</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;border-bottom:1px solid #fecaca">Priority</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;border-bottom:1px solid #fecaca">Score</th>
            </tr>
          </thead>
          <tbody>${member.incomplete.map(t => taskRow(t, appUrl)).join('')}</tbody>
        </table>
      ` : ''}
    </div>
  `
}

export function dailyTaskSummaryEmailHtml(
  dateLabel: string,
  memberGroups: Record<string, MemberGroup[]>,
  totalCompleted: number,
  totalIncomplete: number,
  appUrl: string,
) {
  const departments = Object.keys(memberGroups).sort()
  const hasAnyData = totalCompleted + totalIncomplete > 0

  const body = departments.map(dept => `
    <div style="margin-bottom:24px">
      <div style="background:#f3f4f6;border-radius:6px;padding:8px 14px;margin-bottom:12px">
        <strong style="font-size:13px;color:#374151;text-transform:uppercase;letter-spacing:.06em">${dept || 'No Department'}</strong>
      </div>
      ${memberGroups[dept].map(m => memberSection(m, appUrl)).join('')}
    </div>
  `).join('')

  return `
    <div style="font-family:sans-serif;max-width:680px;margin:auto;background:#f9fafb;padding:0 0 32px">
      <!-- Header -->
      <div style="background:#1e293b;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8">Edstellar · Marketing PM</p>
        <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff">Daily Task Summary</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#94a3b8">${dateLabel}</p>
      </div>

      <!-- Stats bar -->
      <div style="display:flex;gap:0;background:#fff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
        <div style="flex:1;padding:16px 24px;border-right:1px solid #f3f4f6;text-align:center">
          <p style="margin:0;font-size:28px;font-weight:800;color:#16a34a">${totalCompleted}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280;font-weight:500">Completed Today</p>
        </div>
        <div style="flex:1;padding:16px 24px;text-align:center">
          <p style="margin:0;font-size:28px;font-weight:800;color:#dc2626">${totalIncomplete}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280;font-weight:500">Due Today — Not Done</p>
        </div>
      </div>

      <!-- Body -->
      <div style="padding:24px 32px;background:#f9fafb;border:1px solid #e5e7eb;border-top:0">
        ${hasAnyData ? body : `
          <div style="text-align:center;padding:40px 0">
            <p style="color:#6b7280;font-size:14px">No tasks were due today across the team.</p>
          </div>
        `}

        <div style="margin-top:24px;text-align:center">
          <a href="${appUrl}/admin" style="display:inline-block;padding:11px 28px;background:#4f46e5;color:#fff;border-radius:7px;text-decoration:none;font-size:13px;font-weight:600">
            Open Admin Dashboard →
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:16px 32px;text-align:center">
        <p style="margin:0;font-size:11px;color:#9ca3af">You're receiving this because Daily Task Summary is enabled in Email Settings.</p>
      </div>
    </div>
  `
}

// ── Member Daily Digest ──────────────────────────────────────────────────────

interface DigestTask {
  id: string
  title: string
  priority: string
  category?: string | null
  score_weight: number
  status: string
  due_date?: string | null
}

interface PendingApprovalTask {
  id: string
  title: string
  priority: string
  score_weight: number
  assignee?: { full_name: string; designation: string | null } | null
}

interface ApprovedTask {
  id: string
  title: string
  priority: string
  score_earned: number
  approved_at: string
  approval_note?: string | null
  approver?: { full_name: string } | null
}

interface MemberDailyDigestOptions {
  memberName: string
  dateLabel: string
  dueTodayTasks: DigestTask[]
  overdueTasks: DigestTask[]
  pendingApprovals: PendingApprovalTask[]
  approvedByPeer: ApprovedTask[]
  approvedByAdmin: ApprovedTask[]
  appUrl: string
}

function digestPriorityBadge(p: string) {
  const map: Record<string, string> = {
    critical: 'background:#fef2f2;color:#dc2626;border:1px solid #fecaca',
    high:     'background:#fff7ed;color:#ea580c;border:1px solid #fed7aa',
    medium:   'background:#fefce8;color:#ca8a04;border:1px solid #fef08a',
    low:      'background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0',
  }
  return `<span style="font-size:10px;padding:2px 7px;border-radius:99px;font-weight:600;${map[p] ?? 'background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb'}">${p}</span>`
}

function daysOverdue(dueDate: string): string {
  const due = new Date(dueDate)
  const now = new Date()
  const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
  return diff === 1 ? '1 day overdue' : `${diff} days overdue`
}

function digestTaskRow(task: DigestTask, appUrl: string, showDue = false) {
  return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top">
        <a href="${appUrl}/tasks/${task.id}" style="color:#1d4ed8;text-decoration:none;font-size:13px;font-weight:500">${task.title}</a>
        ${task.category ? `<span style="margin-left:6px;font-size:11px;color:#9ca3af">${task.category}</span>` : ''}
        ${showDue && task.due_date ? `<div style="margin-top:3px;font-size:11px;color:#dc2626;font-weight:500">${daysOverdue(task.due_date)}</div>` : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap;vertical-align:top">${digestPriorityBadge(task.priority)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;vertical-align:top">${task.score_weight} pts</td>
    </tr>
  `
}

function digestSection(title: string, accentColor: string, rows: string, header: string) {
  return `
    <div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
      <div style="background:${accentColor};padding:10px 16px">
        <strong style="font-size:12px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.06em">${title}</strong>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <thead>
          <tr style="background:#f9fafb">
            ${header}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function th(label: string) {
  return `<th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">${label}</th>`
}

export function memberDailyDigestEmailHtml(opts: MemberDailyDigestOptions): string {
  const { memberName, dateLabel, dueTodayTasks, overdueTasks, pendingApprovals, approvedByPeer, approvedByAdmin, appUrl } = opts

  const sections: string[] = []

  if (dueTodayTasks.length > 0) {
    const rows = dueTodayTasks.map(t => digestTaskRow(t, appUrl)).join('')
    sections.push(digestSection(
      `📋 Due Today (${dueTodayTasks.length})`,
      '#2563eb',
      rows,
      `${th('Task')}${th('Priority')}${th('Score')}`
    ))
  }

  if (overdueTasks.length > 0) {
    const rows = overdueTasks.map(t => digestTaskRow(t, appUrl, true)).join('')
    sections.push(digestSection(
      `⚠️ Overdue — Score at Risk (${overdueTasks.length})`,
      '#dc2626',
      rows,
      `${th('Task')}${th('Priority')}${th('Score')}`
    ))
  }

  if (pendingApprovals.length > 0) {
    const rows = pendingApprovals.map(t => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top">
          <a href="${appUrl}/tasks/${t.id}" style="color:#1d4ed8;text-decoration:none;font-size:13px;font-weight:500">${t.title}</a>
          ${t.assignee ? `<div style="margin-top:3px;font-size:11px;color:#6b7280">Completed by ${t.assignee.full_name}${t.assignee.designation ? ` · ${t.assignee.designation}` : ''}</div>` : ''}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap;vertical-align:top">${digestPriorityBadge(t.priority)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;vertical-align:top">${t.score_weight} pts</td>
      </tr>
    `).join('')
    sections.push(digestSection(
      `🔔 Pending Your Approval (${pendingApprovals.length})`,
      '#7c3aed',
      rows,
      `${th('Task')}${th('Priority')}${th('Score')}`
    ))
  }

  if (approvedByPeer.length > 0) {
    const rows = approvedByPeer.map(t => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top">
          <a href="${appUrl}/tasks/${t.id}" style="color:#1d4ed8;text-decoration:none;font-size:13px;font-weight:500">${t.title}</a>
          ${t.approver ? `<div style="margin-top:3px;font-size:11px;color:#6b7280">Approved by ${t.approver.full_name}</div>` : ''}
          ${t.approval_note ? `<div style="margin-top:2px;font-size:11px;color:#9ca3af;font-style:italic">"${t.approval_note}"</div>` : ''}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap;vertical-align:top">${digestPriorityBadge(t.priority)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#16a34a;font-weight:600;white-space:nowrap;vertical-align:top">+${t.score_earned} pts</td>
      </tr>
    `).join('')
    sections.push(digestSection(
      `✅ Task Approvals Received Yesterday (${approvedByPeer.length})`,
      '#059669',
      rows,
      `${th('Task')}${th('Priority')}${th('Score Earned')}`
    ))
  }

  if (approvedByAdmin.length > 0) {
    const rows = approvedByAdmin.map(t => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top">
          <a href="${appUrl}/tasks/${t.id}" style="color:#1d4ed8;text-decoration:none;font-size:13px;font-weight:500">${t.title}</a>
          ${t.approver ? `<div style="margin-top:3px;font-size:11px;color:#6b7280">Approved by ${t.approver.full_name} (Admin)</div>` : ''}
          ${t.approval_note ? `<div style="margin-top:2px;font-size:11px;color:#9ca3af;font-style:italic">"${t.approval_note}"</div>` : ''}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap;vertical-align:top">${digestPriorityBadge(t.priority)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#16a34a;font-weight:600;white-space:nowrap;vertical-align:top">+${t.score_earned} pts</td>
      </tr>
    `).join('')
    sections.push(digestSection(
      `🏆 Score Approvals from Admin Yesterday (${approvedByAdmin.length})`,
      '#d97706',
      rows,
      `${th('Task')}${th('Priority')}${th('Score Confirmed')}`
    ))
  }

  const totalAtRisk = overdueTasks.reduce((s, t) => s + t.score_weight, 0)
  const totalConfirmed = [...approvedByPeer, ...approvedByAdmin].reduce((s, t) => s + t.score_earned, 0)

  return `
    <div style="font-family:sans-serif;max-width:680px;margin:auto;background:#f9fafb;padding:0 0 32px">
      <!-- Header -->
      <div style="background:#1e293b;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8">Edstellar · Marketing PM</p>
        <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff">Your Daily Task Digest</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#94a3b8">${dateLabel}</p>
      </div>

      <!-- Greeting + stats bar -->
      <div style="background:#fff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:16px 32px 0">
        <p style="margin:0 0 16px;font-size:14px;color:#374151">Hi <strong>${memberName}</strong>, here's your task summary for today.</p>
        <div style="display:flex;gap:0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:16px">
          <div style="flex:1;padding:12px 16px;border-right:1px solid #f3f4f6;text-align:center">
            <p style="margin:0;font-size:22px;font-weight:800;color:#2563eb">${dueTodayTasks.length}</p>
            <p style="margin:3px 0 0;font-size:11px;color:#6b7280;font-weight:500">Due Today</p>
          </div>
          <div style="flex:1;padding:12px 16px;border-right:1px solid #f3f4f6;text-align:center">
            <p style="margin:0;font-size:22px;font-weight:800;color:#dc2626">${overdueTasks.length}</p>
            <p style="margin:3px 0 0;font-size:11px;color:#6b7280;font-weight:500">Overdue</p>
          </div>
          <div style="flex:1;padding:12px 16px;border-right:1px solid #f3f4f6;text-align:center">
            <p style="margin:0;font-size:22px;font-weight:800;color:#7c3aed">${pendingApprovals.length}</p>
            <p style="margin:3px 0 0;font-size:11px;color:#6b7280;font-weight:500">Need Your Approval</p>
          </div>
          <div style="flex:1;padding:12px 16px;text-align:center">
            <p style="margin:0;font-size:22px;font-weight:800;color:#16a34a">+${totalConfirmed}</p>
            <p style="margin:3px 0 0;font-size:11px;color:#6b7280;font-weight:500">Score Confirmed</p>
          </div>
        </div>
        ${totalAtRisk > 0 ? `
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin-bottom:16px">
            <p style="margin:0;font-size:12px;color:#dc2626;font-weight:600">⚠️ ${totalAtRisk} points at risk — complete overdue tasks to avoid score loss.</p>
          </div>
        ` : ''}
      </div>

      <!-- Body -->
      <div style="padding:20px 32px;background:#f9fafb;border:1px solid #e5e7eb;border-top:0">
        ${sections.length > 0 ? sections.join('') : `
          <div style="text-align:center;padding:40px 0">
            <p style="color:#6b7280;font-size:14px">No tasks require your attention today. Great job staying on top of things! 🎉</p>
          </div>
        `}

        <div style="margin-top:8px;text-align:center">
          <a href="${appUrl}/dashboard" style="display:inline-block;padding:11px 28px;background:#2563eb;color:#fff;border-radius:7px;text-decoration:none;font-size:13px;font-weight:600">
            Open My Dashboard →
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:16px 32px;text-align:center">
        <p style="margin:0;font-size:11px;color:#9ca3af">You're receiving this because Member Daily Digest is enabled in Email Settings.</p>
      </div>
    </div>
  `
}

export function appraisalPublishedEmailHtml(fullName: string, appUrl: string) {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;background:#f9fafb;border-radius:8px">
      <h2 style="color:#111827;margin-top:0">Your appraisal is ready</h2>
      <p style="color:#374151">Hi ${fullName},</p>
      <p style="color:#374151">Your performance appraisal has been published. Log in to view your evaluation.</p>
      <a href="${appUrl}/performance" style="display:inline-block;margin:24px 0;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        View Appraisal
      </a>
    </div>
  `
}
