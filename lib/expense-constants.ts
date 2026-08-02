// Shared constants for the expenses module.
//
// Deliberately free of any server-only import (no Supabase client, no zod) so
// client components and route handlers can both use it — which is the point:
// the renewal threshold must mean the same thing in the dashboard banner, the
// subscriptions table and the weekly email, or the three will quietly disagree.

// A renewal within this many days counts as urgent: red highlighting on screen
// and the alert block in the email.
export const RENEWAL_URGENT_DAYS = 30

// How far ahead the renewals card and the email's "coming up" section look.
// Wider than the urgent band so there is planning visibility beyond what is
// already demanding attention.
export const RENEWAL_HORIZON_DAYS = 60

// The public report's path, in one place. The settings panel shows this URL for
// copying and the email links to it, so if the two ever disagree the copy button
// hands out a dead link — which is exactly what happened before this existed.
// Sits outside /expenses on purpose: that segment is behind the auth redirect.
export const publicReportPath = (token: string) => `/expense-report/${token}`
