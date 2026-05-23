import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getAuthUser } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Generates the bulk-task-template.xlsx with three sheets:
 *   1. "Tasks"        — header row + sample rows (this is the sheet to fill in)
 *   2. "Instructions" — how to use the template, column meanings, rules
 *   3. "Reference"    — valid values for the constrained fields
 *
 * Generated on the fly so changes here are reflected in every download with no
 * static file to keep in sync. Cached for 1h by the browser; toggle Cache-Control
 * to `no-store` if you want users to re-pull immediately after edits.
 */
export async function GET() {
  // Require auth — the Reference tab now embeds active member names.
  const { error: authError } = await getAuthUser()
  if (authError) return authError

  // Active members (full names) — these are the legal values for "Dependency Owner".
  const admin = createAdminClient()
  const { data: memberRows } = await admin
    .from('profiles')
    .select('full_name')
    .eq('is_active', true)
    .order('full_name')
  const activeMemberNames = (memberRows ?? [])
    .map(m => m.full_name?.trim())
    .filter((s): s is string => !!s && s.length > 0)

  // Pick a couple of real names to seed the sample rows so the template "just works".
  const sampleOwner1 = activeMemberNames[0] ?? 'Member Name'
  const sampleOwner2 = activeMemberNames[1] ?? sampleOwner1
  const samplePair = activeMemberNames.length >= 2
    ? `${activeMemberNames[0]}, ${activeMemberNames[1]}`
    : sampleOwner1

  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Tasks ──────────────────────────────────────────────────────────
  const headers = [
    'Title', 'Description', 'Status', 'Priority', 'Progress',
    'Start Date', 'Due Date',
    'Dependency Task', 'Dependency Details', 'Dependency Status', 'Dependency Owner',
    'Final Comments',
  ]
  const sampleRows: (string | number)[][] = [
    [
      'Header design',
      'Build the responsive site header with sticky navigation',
      'In Progress', 'High', 40, '6/1/2026', '6/15/2026',
      'Brand guidelines sign-off',
      'Need final logo + colour tokens before final pass',
      'In Review', sampleOwner1,
      'Awaiting brand sign-off; once approved, can wrap in a day.',
    ],
    [
      'Footer revamp',
      'Replace legacy footer with the new component',
      'Pending', 'Medium', 0, '6/10/2026', '6/20/2026',
      '', '', '', '', '',
    ],
    [
      'Homepage hero animation',
      'Implement scroll-triggered hero section',
      'Pending', 'High', 0, '6/12/2026', '6/22/2026',
      'Hero copy approval',
      'Awaiting final hero copy from content team',
      'Pending', sampleOwner2,
      'Blocked until content team finalises copy.',
    ],
    [
      'SEO audit fixes',
      'Apply remediations from the Q2 SEO audit',
      'Completed', 'Medium', 100, '5/20/2026', '5/30/2026',
      '', '', '', '', 'Done — all audit items addressed.',
    ],
    [
      'Form validation refactor',
      'Move all forms to react-hook-form + zod',
      'In Progress', 'Critical', 65, '5/28/2026', '6/10/2026',
      'API error contract',
      'Backend needs to standardise validation error payload',
      'In Progress', samplePair,
      'Frontend pieces done; integration paused on backend contract.',
    ],
    [
      'Sitemap & robots.txt',
      'Generate and ship the production sitemap and robots',
      'Pending', 'Low', 0, '6/15/2026', '6/25/2026',
      '', '', '', '', '',
    ],
  ]
  const tasksSheet = XLSX.utils.aoa_to_sheet([headers, ...sampleRows])
  // Column widths roughly matched to content length
  tasksSheet['!cols'] = [
    { wch: 28 }, // Title
    { wch: 60 }, // Description
    { wch: 13 }, // Status
    { wch: 10 }, // Priority
    { wch: 10 }, // Progress
    { wch: 12 }, // Start Date
    { wch: 12 }, // Due Date
    { wch: 26 }, // Dependency Task
    { wch: 50 }, // Dependency Details
    { wch: 18 }, // Dependency Status
    { wch: 20 }, // Dependency Owner
    { wch: 60 }, // Final Comments
  ]
  XLSX.utils.book_append_sheet(wb, tasksSheet, 'Tasks')

  // ── Sheet 2: Instructions ───────────────────────────────────────────────────
  // Mirrors the column order of the Tasks sheet and the Reference sheet so a
  // user filling in row N can scan straight down the same column letter.
  const instructions: (string | number)[][] = [
    ['BULK TASK UPLOAD — HOW TO USE THIS TEMPLATE'],
    [''],
    ['1. Open the "Tasks" sheet (first tab).'],
    ['2. Replace the sample rows with your own. Keep the header row in row 1 unchanged.'],
    ['3. Save the file as .xlsx (or export to .csv) and upload via "Bulk Upload Tasks" in the project page.'],
    [''],
    ['IMPORTANT'],
    ['• Only the "Title" column is required. Every other column is optional.'],
    ['• Dates can be MM/DD/YYYY (US) or YYYY-MM-DD. Excel date cells are also accepted.'],
    ['• Progress must be a whole number between 0 and 100.'],
    ['• If a row has any Dependency fields filled, "Dependency Task" must be set.'],
    ['• "Dependency Owner" accepts an active user\'s full name OR a comma-separated list of names. See the Reference tab for the full list.'],
    ['• Empty rows are skipped. Rows missing the Title will be flagged in the preview.'],
    [''],

    ['INSTRUCTIONS PER COLUMN'],
    ['Field',                              'Required?', 'What to enter',                                                                                                  'If left blank'],

    ['A. Title',                           'Yes',       'A short task name (preferably under 80 chars). This is how the row appears in the upload preview.',              'Row is skipped and shown as invalid in the preview.'],
    ['B. Description',                     'No',        'Free-text details / context. Newlines are preserved.',                                                            'No description on the imported task.'],
    ['C. Status',                          'No',        'One of: Pending / In Progress / Completed (see Reference tab for synonyms).',                                     'Defaults to Pending.'],
    ['D. Priority',                        'No',        'One of: Low / Medium / High / Critical.',                                                                         'Defaults to Medium.'],
    ['E. Progress',                        'No',        'Whole number 0 to 100.',                                                                                          'Treated as 0. Auto-set to 100 if Status = Completed.'],
    ['F. Start Date',                      'No',        'When work begins. MM/DD/YYYY or YYYY-MM-DD or an Excel date cell.',                                               'No start date set.'],
    ['G. Due Date',                        'No (rec.)', 'Deadline. Same date formats as Start Date. Recommended for reporting.',                                           'Task is un-dated; reports treat it as having no deadline.'],
    ['H. Dependency Task',                 'See note',  'Name of the upstream/blocking task. Required if ANY of I, J, or K below is filled.',                              'No dependency recorded on the task.'],
    ['I. Dependency Details',              'No',        'Why the dependency blocks. Free-text. Only meaningful if H is set.',                                              'No detail; the dependency exists but with no extra context.'],
    ['J. Dependency Status',               'No',        'One of: Pending / In Progress / In Review / Completed / Blocked.',                                                'Defaults to Pending. Only meaningful if H is set.'],
    ['K. Dependency Owner',                'No',        'Full name(s) of an active user. Single name or comma-separated for joint ownership. See Reference tab for the live list of valid names.', 'No owner attached. Unmatched names are flagged in the preview.'],
    ['L. Final Comments',                  'No',        'Wrap-up note added when the task closes. Often filled in when Status = Completed.',                               'No closing note on the imported task.'],
    [''],

    ['NEED MORE DETAIL?'],
    ['• The "Reference" tab lists every accepted value, synonym, and example for each column.'],
    ['• Need a plaintext version? Use the "CSV" template from the same modal — same columns, no extra tabs.'],
  ]
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions)
  instructionsSheet['!cols'] = [
    { wch: 28 }, // Field
    { wch: 10 }, // Required?
    { wch: 90 }, // What to enter
    { wch: 60 }, // If left blank
  ]
  XLSX.utils.book_append_sheet(wb, instructionsSheet, 'Instructions')

  // ── Sheet 3: Reference ──────────────────────────────────────────────────────
  // One section per column, in the same order they appear in the Tasks sheet.
  // Free-text columns get example values; constrained columns list accepted values.
  const reference: (string | number)[][] = [
    ['REFERENCE — Accepted values and examples for every column'],
    ['Use this tab when filling in the Tasks sheet. Sections appear in the same column order.'],
    [''],

    ['─── A. TITLE  (required, free text) ───'],
    ['Guidance',  'Notes'],
    ['Short',     'Aim for under 80 characters. Title is the row identifier in the preview.'],
    ['Action verb', 'Start with a verb where natural — "Build homepage hero", "Refactor login flow".'],
    ['Unique',    'Two rows can share a title, but unique titles make dependencies easier to reference.'],
    ['Examples',  ''],
    ['',          'Header design'],
    ['',          'Homepage hero animation'],
    ['',          'SEO audit fixes'],
    [''],

    ['─── B. DESCRIPTION  (optional, free text) ───'],
    ['Guidance',  'Notes'],
    ['Multi-line', 'Newlines are preserved on import. Use them for sub-bullets or context.'],
    ['Length',    'No hard cap, but the preview truncates very long values for readability.'],
    ['Examples',  ''],
    ['',          'Build the responsive site header with sticky navigation'],
    ['',          'Move all forms to react-hook-form + zod'],
    [''],

    ['─── C. STATUS  (optional enum, defaults to "Pending") ───'],
    ['Value',          'Notes / Synonyms accepted on import'],
    ['Pending',        'Default. Synonyms: Not Started, To Do, Open, Backlog.'],
    ['In Progress',    'Work is underway. Synonyms: WIP, In-Progress, Working, Doing.'],
    ['Completed',      'Done. Synonyms: Done, Closed, Finished, Shipped.'],
    [''],

    ['─── D. PRIORITY  (optional enum, defaults to "Medium") ───'],
    ['Value',          'Notes'],
    ['Low',            'Nice-to-have / low impact.'],
    ['Medium',         'Default if left blank.'],
    ['High',           'Important and time-sensitive.'],
    ['Critical',       'Highest urgency — blocks releases or revenue.'],
    [''],

    ['─── E. PROGRESS  (optional integer, 0–100) ───'],
    ['Value',          'Notes'],
    ['0',              'Not started. Use with Status = Pending.'],
    ['1 to 99',        'In flight. Whole numbers only. Decimals are rounded down.'],
    ['100',            'Fully done. Auto-set if Status = Completed and Progress is blank.'],
    ['Blank',          'Treated as 0.'],
    [''],

    ['─── F. START DATE  (optional, date) ───'],
    ['Format',         'Example'],
    ['US slash',       '6/15/2026'],
    ['ISO',            '2026-06-15'],
    ['Excel date cell','Any cell formatted as a date in Excel works.'],
    ['Blank',          'No start date set — the task can begin immediately.'],
    ['Rule',           'Must be on or before Due Date if both are set.'],
    [''],

    ['─── G. DUE DATE  (optional, date — recommended) ───'],
    ['Format',         'Example'],
    ['US slash',       '6/30/2026'],
    ['ISO',            '2026-06-30'],
    ['Excel date cell','Any cell formatted as a date in Excel works.'],
    ['Blank',          'No deadline shown on the task row. Reporting will treat it as un-dated.'],
    [''],

    ['─── H. DEPENDENCY TASK  (optional, free text) ───'],
    ['Guidance',  'Notes'],
    ['Format',    'Plain task name. Doesn\'t need to exactly match another row\'s Title.'],
    ['When to use', 'Whenever this task is blocked or waiting on another piece of work.'],
    ['Rule',      'If ANY of columns I, J, or K is filled, column H must also be filled.'],
    ['Examples',  ''],
    ['',          'Brand guidelines sign-off'],
    ['',          'API error contract'],
    ['',          'Hero copy approval'],
    [''],

    ['─── I. DEPENDENCY DETAILS  (optional, free text) ───'],
    ['Guidance',  'Notes'],
    ['Purpose',   'Explain what you\'re waiting for and why it blocks.'],
    ['Examples',  ''],
    ['',          'Need final logo + colour tokens before final pass'],
    ['',          'Backend needs to standardise validation error payload'],
    ['',          'Awaiting final hero copy from content team'],
    [''],

    ['─── J. DEPENDENCY STATUS  (optional enum) ───'],
    ['Value',          'Notes'],
    ['Pending',        'Hasn\'t started.'],
    ['In Progress',    'Owner is working on it.'],
    ['In Review',      'Awaiting review/sign-off.'],
    ['Completed',      'Done — no longer blocking.'],
    ['Blocked',        'The dependency itself is blocked.'],
    [''],

    ['─── K. DEPENDENCY OWNER  (optional, matches an active user\'s full name) ───'],
    ['Format',         'Notes'],
    ['Single',         `One active user's full name — e.g. "${sampleOwner1}".`],
    ['Multiple',       `Comma-separated for joint ownership — e.g. "${samplePair}".`],
    ['Match rule',     'Case-insensitive. Exact match preferred; startsWith and contains are used as fallbacks.'],
    ['Unmatched',      'Names that don\'t match any active user are flagged in the preview so you can fix them before importing.'],
    [''],
    ['Active user names — accepted values'],
    ['#',              'Full name'],
    ...activeMemberNames.map((n, i) => [String(i + 1), n] as (string | number)[]),
    [''],
    ['Tip',            'This list is generated live from the database at download time. Re-download the template if a new member joins.'],
    [''],

    ['─── L. FINAL COMMENTS  (optional, free text) ───'],
    ['Guidance',  'Notes'],
    ['When to use', 'Wrap-up note. Often filled in when Status = Completed.'],
    ['Examples',  ''],
    ['',          'Done — all audit items addressed.'],
    ['',          'Awaiting brand sign-off; once approved, can wrap in a day.'],
    ['',          'Frontend pieces done; integration paused on backend contract.'],
  ]
  const referenceSheet = XLSX.utils.aoa_to_sheet(reference)
  referenceSheet['!cols'] = [{ wch: 18 }, { wch: 80 }]
  XLSX.utils.book_append_sheet(wb, referenceSheet, 'Reference')

  // ── Serialize and return ────────────────────────────────────────────────────
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="bulk-task-template.xlsx"',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
