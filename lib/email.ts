export interface EmailResult {
  ok: boolean
  /** 'unconfigured' = no transport URL; 'transport' = the send was refused. */
  reason?: 'unconfigured' | 'transport'
  detail?: string
}

/**
 * Send and report the outcome. Use this wherever the caller needs to know
 * whether the message actually went out — scheduled digests especially, since
 * nobody reads their logs.
 *
 * The Apps Script answers `200 {"success":false}` when it refuses a message, so
 * `res.ok` on its own is not proof of delivery; the body has to be read too.
 */
export async function sendEmailChecked(to: string, subject: string, html: string): Promise<EmailResult> {
  // Read at call time, not module load, so a dev-server env reload takes effect.
  const gasUrl = process.env.GOOGLE_APPS_SCRIPT_EMAIL_URL
  if (!gasUrl) return { ok: false, reason: 'unconfigured', detail: 'GOOGLE_APPS_SCRIPT_EMAIL_URL not set' }

  let res: Response
  try {
    res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html }),
    })
  } catch (e) {
    return { ok: false, reason: 'transport', detail: e instanceof Error ? e.message : 'network error' }
  }

  const text = await res.text().catch(() => '')
  if (!res.ok) return { ok: false, reason: 'transport', detail: `HTTP ${res.status} ${text.slice(0, 200)}` }

  try {
    const body = JSON.parse(text) as { success?: boolean; error?: string }
    if (body?.success === false) {
      return { ok: false, reason: 'transport', detail: String(body.error ?? text).slice(0, 200) }
    }
  } catch {
    // A non-JSON 200 means an older deployment; treat as sent, as before.
  }
  return { ok: true }
}

/** Fire-and-forget send: logs problems, never throws. */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const result = await sendEmailChecked(to, subject, html)
  if (result.ok) return
  if (result.reason === 'unconfigured') console.warn('GOOGLE_APPS_SCRIPT_EMAIL_URL not set — skipping email')
  else console.error('Email send failed:', result.detail)
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

// ── Admin Daily Task Summary ─────────────────────────────────────────────────

export interface AdminTaskWithOwner {
  id: string
  title: string
  priority: string
  category?: string | null
  score_weight: number
  owner?: { full_name: string; designation: string | null; department: string | null } | null
}

export interface DeptMonthlyStats {
  department: string
  total: number
  done: number
  pending: number
}

export interface AdminPendingApproval {
  id: string
  title: string
  priority: string
  score_weight: number
  submitted_at?: string | null
  owner?: { full_name: string; designation: string | null; department: string | null } | null
}

export interface DailyTaskSummaryOptions {
  dateLabel: string
  monthLabel: string
  appUrl: string
  dueTodayTasks: AdminTaskWithOwner[]
  overdueYesterdayTasks: AdminTaskWithOwner[]
  monthlyByDept: DeptMonthlyStats[]
  pendingApprovals: AdminPendingApproval[]
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

function sectionHeader(title: string, accent: string) {
  return `<div style="background:${accent};padding:10px 16px"><strong style="font-size:12px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.06em">${title}</strong></div>`
}

const TH = 'padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb'
const TD = 'padding:10px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top'

function ownerCell(owner: AdminTaskWithOwner['owner']) {
  if (!owner) return `<td style="${TD}"><span style="font-size:12px;color:#9ca3af">—</span></td>`
  return `<td style="${TD}">
    <span style="font-size:13px;color:#111827;font-weight:500">${owner.full_name}</span>
    ${owner.designation ? `<br><span style="font-size:11px;color:#6b7280">${owner.designation}</span>` : ''}
    ${owner.department ? `<span style="font-size:11px;color:#9ca3af"> · ${owner.department}</span>` : ''}
  </td>`
}

function taskOwnerRow(t: AdminTaskWithOwner, appUrl: string) {
  return `<tr>
    <td style="${TD}">
      <a href="${appUrl}/tasks/${t.id}" style="color:#1d4ed8;text-decoration:none;font-size:13px;font-weight:500">${t.title}</a>
      ${t.category ? `<span style="margin-left:6px;font-size:11px;color:#9ca3af">${t.category}</span>` : ''}
    </td>
    <td style="${TD};white-space:nowrap">${priorityBadge(t.priority)}</td>
    ${ownerCell(t.owner)}
    <td style="${TD};font-size:12px;color:#6b7280;white-space:nowrap">${t.score_weight} pts</td>
  </tr>`
}

function taskSection(title: string, accent: string, tasks: AdminTaskWithOwner[], appUrl: string, emptyMsg: string) {
  return `
    <div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      ${sectionHeader(title, accent)}
      ${tasks.length > 0 ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <thead><tr style="background:#f9fafb">
            <th style="${TH}">Task</th>
            <th style="${TH}">Priority</th>
            <th style="${TH}">Owner</th>
            <th style="${TH}">Score</th>
          </tr></thead>
          <tbody>${tasks.map(t => taskOwnerRow(t, appUrl)).join('')}</tbody>
        </table>
      ` : `<p style="padding:16px;font-size:13px;color:#6b7280;margin:0">${emptyMsg}</p>`}
    </div>
  `
}

export function dailyTaskSummaryEmailHtml(opts: DailyTaskSummaryOptions): string {
  const { dateLabel, monthLabel, appUrl, dueTodayTasks, overdueYesterdayTasks, monthlyByDept, pendingApprovals } = opts

  const section1 = taskSection(
    `Active Tasks Due Today (${dueTodayTasks.length})`,
    '#2563eb', dueTodayTasks, appUrl, 'No active tasks due today — great start!',
  )

  const section2 = taskSection(
    `Missed Yesterday — Not Completed (${overdueYesterdayTasks.length})`,
    '#dc2626', overdueYesterdayTasks, appUrl, 'No tasks were missed yesterday.',
  )

  const deptRows = monthlyByDept.map(d => `<tr>
    <td style="${TD};font-size:13px;color:#374151;font-weight:500">${d.department}</td>
    <td style="${TD};font-size:13px;font-weight:700;color:#1e293b;text-align:center">${d.total}</td>
    <td style="${TD};font-size:13px;font-weight:600;color:#16a34a;text-align:center">${d.done}</td>
    <td style="${TD};font-size:13px;font-weight:600;color:#dc2626;text-align:center">${d.pending}</td>
  </tr>`).join('')

  const section3 = `
    <div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      ${sectionHeader(`Monthly Task Load — ${monthLabel} (by Department)`, '#475569')}
      ${monthlyByDept.length > 0 ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <thead><tr style="background:#f9fafb">
            <th style="${TH}">Department</th>
            <th style="${TH};text-align:center">Total</th>
            <th style="${TH};text-align:center">Completed</th>
            <th style="${TH};text-align:center">Pending</th>
          </tr></thead>
          <tbody>${deptRows}</tbody>
        </table>
      ` : `<p style="padding:16px;font-size:13px;color:#6b7280;margin:0">No tasks scheduled this month.</p>`}
    </div>
  `

  const approvalRows = pendingApprovals.map(t => {
    const submitted = t.submitted_at
      ? new Date(t.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—'
    return `<tr>
      <td style="${TD}">
        <a href="${appUrl}/tasks/${t.id}" style="color:#1d4ed8;text-decoration:none;font-size:13px;font-weight:500">${t.title}</a>
      </td>
      <td style="${TD};white-space:nowrap">${priorityBadge(t.priority)}</td>
      ${ownerCell(t.owner)}
      <td style="${TD};font-size:12px;color:#6b7280;white-space:nowrap">${t.score_weight} pts</td>
      <td style="${TD};font-size:12px;color:#6b7280;white-space:nowrap">${submitted}</td>
    </tr>`
  }).join('')

  const section4 = `
    <div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      ${sectionHeader(`Pending Admin Score Approvals (${pendingApprovals.length})`, '#d97706')}
      ${pendingApprovals.length > 0 ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <thead><tr style="background:#f9fafb">
            <th style="${TH}">Task</th>
            <th style="${TH}">Priority</th>
            <th style="${TH}">Owner</th>
            <th style="${TH}">Score</th>
            <th style="${TH}">Submitted</th>
          </tr></thead>
          <tbody>${approvalRows}</tbody>
        </table>
      ` : `<p style="padding:16px;font-size:13px;color:#16a34a;margin:0;font-weight:500">No pending approvals — all caught up!</p>`}
    </div>
  `

  const monthTotal = monthlyByDept.reduce((s, d) => s + d.total, 0)

  return `
    <div style="font-family:sans-serif;max-width:720px;margin:auto;background:#f9fafb;padding:0 0 32px">
      <div style="background:#1e293b;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8">Edstellar · Marketing PM</p>
        <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff">Daily Task Summary</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#94a3b8">${dateLabel}</p>
      </div>

      <div style="background:#fff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr>
            <td style="padding:14px 20px;border-right:1px solid #f3f4f6;text-align:center">
              <p style="margin:0;font-size:26px;font-weight:800;color:#2563eb">${dueTodayTasks.length}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#6b7280;font-weight:500">Due Today</p>
            </td>
            <td style="padding:14px 20px;border-right:1px solid #f3f4f6;text-align:center">
              <p style="margin:0;font-size:26px;font-weight:800;color:#dc2626">${overdueYesterdayTasks.length}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#6b7280;font-weight:500">Missed Yesterday</p>
            </td>
            <td style="padding:14px 20px;border-right:1px solid #f3f4f6;text-align:center">
              <p style="margin:0;font-size:26px;font-weight:800;color:#475569">${monthTotal}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#6b7280;font-weight:500">This Month Total</p>
            </td>
            <td style="padding:14px 20px;text-align:center">
              <p style="margin:0;font-size:26px;font-weight:800;color:#d97706">${pendingApprovals.length}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#6b7280;font-weight:500">Pending Approvals</p>
            </td>
          </tr>
        </table>
      </div>

      <div style="padding:24px 32px;background:#f9fafb;border:1px solid #e5e7eb;border-top:0">
        ${section1}
        ${section2}
        ${section3}
        ${section4}
        <div style="margin-top:8px;text-align:center">
          <a href="${appUrl}/admin" style="display:inline-block;padding:11px 28px;background:#4f46e5;color:#fff;border-radius:7px;text-decoration:none;font-size:13px;font-weight:600">
            Open Admin Dashboard →
          </a>
        </div>
      </div>

      <div style="padding:16px 32px;text-align:center">
        <p style="margin:0;font-size:11px;color:#9ca3af">You're receiving this because Daily Task Summary is enabled in Email Settings.</p>
      </div>
    </div>
  `
}

// ── Member Daily Digest ──────────────────────────────────────────────────────

export interface MemberDigestTask {
  id: string
  title: string
  priority: string
  category?: string | null
  score_weight: number
  status?: string
  due_date?: string | null
}

export interface MemberPendingApproval {
  id: string
  title: string
  priority: string
  score_weight: number
  assignee?: { full_name: string; designation: string | null } | null
}

export interface MemberMonthlyProgress {
  monthLabel: string
  total: number
  done: number
  pending: number
}

export interface MemberDailyDigestOptions {
  memberName: string
  dateLabel: string
  dueTodayTasks: MemberDigestTask[]
  missedYesterdayTasks: MemberDigestTask[]
  monthlyProgress: MemberMonthlyProgress
  pendingApprovals: MemberPendingApproval[]
  appUrl: string
}

function memberTaskRow(task: MemberDigestTask, appUrl: string, atRisk = false) {
  return `<tr>
    <td style="${TD}">
      <a href="${appUrl}/tasks/${task.id}" style="color:#1d4ed8;text-decoration:none;font-size:13px;font-weight:500">${task.title}</a>
      ${task.category ? `<span style="margin-left:6px;font-size:11px;color:#9ca3af">${task.category}</span>` : ''}
    </td>
    <td style="${TD};white-space:nowrap">${priorityBadge(task.priority)}</td>
    <td style="${TD};font-size:12px;${atRisk ? 'color:#dc2626;font-weight:600' : 'color:#6b7280'};white-space:nowrap">${task.score_weight} pts${atRisk ? ' at risk' : ''}</td>
  </tr>`
}

function memberTaskSection(title: string, accent: string, tasks: MemberDigestTask[], appUrl: string, emptyMsg: string, atRisk = false) {
  return `
    <div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      ${sectionHeader(title, accent)}
      ${tasks.length > 0 ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <thead><tr style="background:#f9fafb">
            <th style="${TH}">Task</th>
            <th style="${TH}">Priority</th>
            <th style="${TH}">Score</th>
          </tr></thead>
          <tbody>${tasks.map(t => memberTaskRow(t, appUrl, atRisk)).join('')}</tbody>
        </table>
      ` : `<p style="padding:16px;font-size:13px;color:#6b7280;margin:0">${emptyMsg}</p>`}
    </div>
  `
}

export function memberDailyDigestEmailHtml(opts: MemberDailyDigestOptions): string {
  const { memberName, dateLabel, dueTodayTasks, missedYesterdayTasks, monthlyProgress, pendingApprovals, appUrl } = opts

  // Section 1 — Due today
  const section1 = memberTaskSection(
    `My Active Tasks Due Today (${dueTodayTasks.length})`,
    '#2563eb', dueTodayTasks, appUrl, 'You have no tasks due today — great start!',
  )

  // Section 2 — Missed yesterday
  const section2 = memberTaskSection(
    `Missed Yesterday — Still Not Done (${missedYesterdayTasks.length})`,
    '#dc2626', missedYesterdayTasks, appUrl, 'Nothing missed yesterday — keep it up!',
    true,
  )

  // Section 3 — Monthly progress
  const mp = monthlyProgress
  const section3 = `
    <div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      ${sectionHeader(`My Monthly Progress — ${mp.monthLabel}`, '#475569')}
      ${mp.total > 0 ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <thead><tr style="background:#f9fafb">
            <th style="${TH};text-align:center">Total Tasks</th>
            <th style="${TH};text-align:center">Completed</th>
            <th style="${TH};text-align:center">Pending</th>
          </tr></thead>
          <tbody><tr>
            <td style="${TD};font-size:18px;font-weight:800;color:#1e293b;text-align:center">${mp.total}</td>
            <td style="${TD};font-size:18px;font-weight:800;color:#16a34a;text-align:center">${mp.done}</td>
            <td style="${TD};font-size:18px;font-weight:800;color:#dc2626;text-align:center">${mp.pending}</td>
          </tr></tbody>
        </table>
      ` : `<p style="padding:16px;font-size:13px;color:#6b7280;margin:0">No tasks scheduled for you this month.</p>`}
    </div>
  `

  // Section 4 — Pending approvals I need to give
  const approvalRows = pendingApprovals.map(t => `<tr>
    <td style="${TD}">
      <a href="${appUrl}/tasks/${t.id}" style="color:#1d4ed8;text-decoration:none;font-size:13px;font-weight:500">${t.title}</a>
      ${t.assignee ? `<div style="margin-top:3px;font-size:11px;color:#6b7280">Completed by ${t.assignee.full_name}${t.assignee.designation ? ` · ${t.assignee.designation}` : ''}</div>` : ''}
    </td>
    <td style="${TD};white-space:nowrap">${priorityBadge(t.priority)}</td>
    <td style="${TD};font-size:12px;color:#6b7280;white-space:nowrap">${t.score_weight} pts</td>
  </tr>`).join('')

  const section4 = `
    <div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      ${sectionHeader(`Pending Approvals I Need to Give (${pendingApprovals.length})`, '#d97706')}
      ${pendingApprovals.length > 0 ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <thead><tr style="background:#f9fafb">
            <th style="${TH}">Task</th>
            <th style="${TH}">Priority</th>
            <th style="${TH}">Score</th>
          </tr></thead>
          <tbody>${approvalRows}</tbody>
        </table>
      ` : `<p style="padding:16px;font-size:13px;color:#16a34a;margin:0;font-weight:500">No approvals waiting for you.</p>`}
    </div>
  `

  return `
    <div style="font-family:sans-serif;max-width:720px;margin:auto;background:#f9fafb;padding:0 0 32px">
      <div style="background:#1e293b;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8">Edstellar · Marketing PM</p>
        <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff">Your Daily Task Summary</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#94a3b8">${dateLabel}</p>
      </div>

      <div style="background:#fff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:16px 32px 0">
        <p style="margin:0 0 16px;font-size:14px;color:#374151">Hi <strong>${memberName}</strong>, here's what needs your attention today.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:16px">
          <tr>
            <td style="padding:12px 16px;border-right:1px solid #f3f4f6;text-align:center">
              <p style="margin:0;font-size:22px;font-weight:800;color:#2563eb">${dueTodayTasks.length}</p>
              <p style="margin:3px 0 0;font-size:11px;color:#6b7280;font-weight:500">Due Today</p>
            </td>
            <td style="padding:12px 16px;border-right:1px solid #f3f4f6;text-align:center">
              <p style="margin:0;font-size:22px;font-weight:800;color:#dc2626">${missedYesterdayTasks.length}</p>
              <p style="margin:3px 0 0;font-size:11px;color:#6b7280;font-weight:500">Missed Yesterday</p>
            </td>
            <td style="padding:12px 16px;border-right:1px solid #f3f4f6;text-align:center">
              <p style="margin:0;font-size:22px;font-weight:800;color:#475569">${mp.done}/${mp.total}</p>
              <p style="margin:3px 0 0;font-size:11px;color:#6b7280;font-weight:500">Monthly Done</p>
            </td>
            <td style="padding:12px 16px;text-align:center">
              <p style="margin:0;font-size:22px;font-weight:800;color:#d97706">${pendingApprovals.length}</p>
              <p style="margin:3px 0 0;font-size:11px;color:#6b7280;font-weight:500">Approvals Pending</p>
            </td>
          </tr>
        </table>
      </div>

      <div style="padding:20px 32px;background:#f9fafb;border:1px solid #e5e7eb;border-top:0">
        ${section1}
        ${section2}
        ${section3}
        ${section4}
        <div style="margin-top:8px;text-align:center">
          <a href="${appUrl}/dashboard" style="display:inline-block;padding:11px 28px;background:#2563eb;color:#fff;border-radius:7px;text-decoration:none;font-size:13px;font-weight:600">
            Open My Dashboard →
          </a>
        </div>
      </div>

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

// ── Project Daily Digest ─────────────────────────────────────────────────

export interface ProjectDigestTask {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  progress: number
  start_date: string | null
  due_date: string | null
  dependency_task: string | null
  dependency_status: string | null
}

export interface ProjectDigestOwnerSummary {
  ownerName: string
  department: string
  total: number
  completed: number
  in_progress: number
  pending: number
  overdue: number
  progressPct: number
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

export function projectOwnerDigestEmailHtml(args: {
  ownerName: string
  projectName: string
  projectUrl: string
  department: string
  today: string
  summary: ProjectDigestOwnerSummary
  pendingToday: ProjectDigestTask[]
  upcoming: ProjectDigestTask[]   // overdue first (highlighted), then by due date asc, capped at 10
}) {
  const { ownerName, projectName, projectUrl, department, today, summary, pendingToday, upcoming } = args

  const statBox = (label: string, value: number | string, color = '#111827') => `
    <td style="padding:14px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;text-align:center;width:25%">
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">${label}</div>
      <div style="font-size:22px;font-weight:700;color:${color};margin-top:4px">${value}</div>
    </td>
  `

  const sectionTitle = (title: string, count: number) => `
    <h3 style="margin:24px 0 4px;font-size:14px;color:#111827;font-weight:600">${title} <span style="color:#9ca3af;font-weight:400">(${count})</span></h3>
  `

  const ownerTaskRow = (t: ProjectDigestTask) => {
    const overdue = t.status !== 'completed' && !!t.due_date && t.due_date < today
    const daysLate = overdue && t.due_date
      ? Math.floor((Date.parse(today + 'T00:00:00Z') - Date.parse(t.due_date + 'T00:00:00Z')) / 86400000)
      : 0
    const rowBg = overdue ? 'background:#fef2f2' : ''
    const titleColor = overdue ? '#b91c1c' : '#111827'
    return `
      <tr style="${rowBg}">
        <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;font-size:13px;color:${titleColor};font-weight:${overdue ? '600' : '400'}">${overdue ? '⚠ ' : ''}${escapeHtml(t.title)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap">${priorityBadge(t.priority)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;color:${overdue ? '#b91c1c' : '#374151'};white-space:nowrap">
          ${t.due_date ? fmtDate(t.due_date) : '—'}${overdue ? ` <span style="color:#b91c1c;font-weight:600">(${daysLate}d late)</span>` : ''}
        </td>
      </tr>
    `
  }

  return `
    <div style="font-family:sans-serif;max-width:680px;margin:auto;padding:32px;background:#ffffff;color:#111827">
      <p style="margin:0;color:#6b7280;font-size:13px">${fmtDate(today)} · ${escapeHtml(department)} daily digest</p>
      <h1 style="margin:6px 0 4px;font-size:22px;color:#111827"><a href="${projectUrl}" style="color:#111827;text-decoration:none">${escapeHtml(projectName)}</a></h1>
      <p style="margin:16px 0 0;color:#374151;font-size:14px">Hi ${escapeHtml(ownerName)},</p>

      <p style="margin:20px 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:600">Your ${escapeHtml(department)} tasks</p>
      <table style="width:100%;border-spacing:8px;margin-left:-8px">
        <tr>
          ${statBox('Total', summary.total)}
          ${statBox('Completed', summary.completed, '#047857')}
          ${statBox('Pending', summary.pending, '#b45309')}
          ${statBox('Progress', `${summary.progressPct}%`, '#2563eb')}
        </tr>
      </table>
      <div style="height:6px;background:#e5e7eb;border-radius:9999px;overflow:hidden;margin-top:12px">
        <div style="height:6px;background:#2563eb;width:${summary.progressPct}%"></div>
      </div>

      ${sectionTitle('Pending today', pendingToday.length)}
      ${pendingToday.length === 0 ? `<p style="color:#9ca3af;font-size:13px;margin:4px 0">Nothing due today.</p>` : `
        <table style="width:100%;border-collapse:collapse;margin-top:8px">
          <tbody>${pendingToday.map(ownerTaskRow).join('')}</tbody>
        </table>
      `}

      ${sectionTitle('Upcoming tasks', upcoming.length)}
      ${upcoming.length === 0 ? `<p style="color:#9ca3af;font-size:13px;margin:4px 0">No upcoming tasks.</p>` : `
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280">Overdue rows highlighted; then sorted by due date.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:8px">
          <tbody>${upcoming.map(ownerTaskRow).join('')}</tbody>
        </table>
      `}

      <div style="margin-top:28px">
        <a href="${projectUrl}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px">View all my tasks →</a>
      </div>
      <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
        Daily digest at 08:00 IST. Admin can turn this off in Project Settings.
      </p>
    </div>
  `
}

// One project, one email — sent to each admin per active project.
export interface AdminDigestTaskRow {
  title: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  due_date: string | null
  ownerName: string
  department: string
}

export interface AdminProjectDigestData {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  total: number
  completed: number
  pending: number
  progressPct: number
  owners: ProjectDigestOwnerSummary[]
  dueToday: AdminDigestTaskRow[]
  dueThisWeek: AdminDigestTaskRow[]
  topPending: AdminDigestTaskRow[]
}

function ownerProgressBar(pct: number) {
  return `
    <div style="display:inline-block;vertical-align:middle;width:160px;height:6px;background:#e5e7eb;border-radius:9999px;overflow:hidden">
      <div style="height:6px;background:#2563eb;width:${pct}%"></div>
    </div>
  `
}

function tinyPriorityBadge(p: string) {
  const colors: Record<string, string> = {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#2563eb',
    low: '#6b7280',
  }
  return `<span style="font-size:11px;font-weight:600;color:${colors[p] ?? '#6b7280'};text-transform:capitalize">${p}</span>`
}

function rowList(items: AdminDigestTaskRow[]) {
  return `
    <table style="width:100%;border-collapse:collapse;margin-top:8px">
      <tbody>
        ${items.map(t => `
          <tr>
            <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827">${escapeHtml(t.title)}</td>
            <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap">${t.due_date ? fmtDate(t.due_date) : ''}</td>
            <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;white-space:nowrap">${tinyPriorityBadge(t.priority)}</td>
            <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;white-space:nowrap">${escapeHtml(t.ownerName)} <span style="color:#9ca3af">·</span> ${escapeHtml(t.department)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

export function adminProjectDigestEmailHtml(args: {
  adminName: string
  today: string
  appUrl: string
  project: AdminProjectDigestData
}) {
  const { adminName, today, appUrl, project: p } = args

  const statBox = (label: string, value: number | string, color = '#111827') => `
    <td style="padding:14px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;text-align:center;width:25%">
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">${label}</div>
      <div style="font-size:22px;font-weight:700;color:${color};margin-top:4px">${value}</div>
    </td>
  `

  const sectionTitle = (title: string, count: number) => `
    <h3 style="margin:24px 0 4px;font-size:14px;color:#111827;font-weight:600">${title} <span style="color:#9ca3af;font-weight:400">(${count})</span></h3>
  `

  return `
    <div style="font-family:sans-serif;max-width:760px;margin:auto;padding:32px;background:#ffffff;color:#111827">
      <p style="margin:0;color:#6b7280;font-size:13px">${fmtDate(today)} · Daily project digest</p>
      <h1 style="margin:6px 0 4px;font-size:22px;color:#111827"><a href="${appUrl}/projects/${p.id}" style="color:#111827;text-decoration:none">${escapeHtml(p.name)}</a></h1>
      <p style="margin:0;color:#6b7280;font-size:12px">${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}</p>
      <p style="margin:16px 0 0;color:#374151;font-size:14px">Hi ${escapeHtml(adminName)},</p>

      <table style="width:100%;border-spacing:8px;margin:16px 0 0;margin-left:-8px">
        <tr>
          ${statBox('Total tasks', p.total)}
          ${statBox('Completed', p.completed, '#047857')}
          ${statBox('Pending', p.pending, '#b45309')}
          ${statBox('Progress', `${p.progressPct}%`, '#2563eb')}
        </tr>
      </table>

      <div style="height:6px;background:#e5e7eb;border-radius:9999px;overflow:hidden;margin-top:12px">
        <div style="height:6px;background:#2563eb;width:${p.progressPct}%"></div>
      </div>

      ${sectionTitle('Progress by owner', p.owners.length)}
      ${p.owners.length === 0 ? `<p style="color:#9ca3af;font-size:13px">No owners assigned yet.</p>` : `
        <table style="width:100%;border-collapse:collapse">
          <tbody>
            ${p.owners.map(o => `
              <tr>
                <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827;width:30%">
                  <strong>${escapeHtml(o.ownerName)}</strong>
                  <div style="color:#6b7280;font-size:12px;margin-top:1px">${escapeHtml(o.department)}</div>
                </td>
                <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6">${ownerProgressBar(o.progressPct)}</td>
                <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;white-space:nowrap">${o.progressPct}%</td>
                <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap">${o.completed}/${o.total} done</td>
                <td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;font-size:12px;color:${o.overdue > 0 ? '#b91c1c' : '#9ca3af'};font-weight:${o.overdue > 0 ? '600' : '400'};white-space:nowrap">${o.overdue} overdue</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}

      ${sectionTitle('Pending today', p.dueToday.length)}
      ${p.dueToday.length === 0 ? `<p style="color:#9ca3af;font-size:13px;margin:4px 0">Nothing due today.</p>` : rowList(p.dueToday)}

      ${sectionTitle('Pending this week', p.dueThisWeek.length)}
      ${p.dueThisWeek.length === 0 ? `<p style="color:#9ca3af;font-size:13px;margin:4px 0">Nothing else due this week.</p>` : rowList(p.dueThisWeek)}

      ${sectionTitle('Top 5 pending tasks', p.topPending.length)}
      ${p.topPending.length === 0 ? `<p style="color:#9ca3af;font-size:13px;margin:4px 0">All caught up — no pending tasks.</p>` : `
        <table style="width:100%;border-collapse:collapse;margin-top:8px">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Task</th>
              <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Status</th>
              <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Priority</th>
              <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Due</th>
              <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Owner</th>
            </tr>
          </thead>
          <tbody>
            ${p.topPending.map(t => `
              <tr>
                <td style="padding:8px 8px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827">${escapeHtml(t.title)}</td>
                <td style="padding:8px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;text-transform:capitalize">${t.status.replace('_', ' ')}</td>
                <td style="padding:8px 8px;border-bottom:1px solid #f3f4f6">${tinyPriorityBadge(t.priority)}</td>
                <td style="padding:8px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap">${t.due_date ? fmtDate(t.due_date) : '—'}</td>
                <td style="padding:8px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;white-space:nowrap">${escapeHtml(t.ownerName)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}

      <div style="margin-top:28px">
        <a href="${appUrl}/projects/${p.id}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px">Open project →</a>
      </div>
      <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
        Turn off this project's email from Project Settings if you don't want these any more.
      </p>
    </div>
  `
}
