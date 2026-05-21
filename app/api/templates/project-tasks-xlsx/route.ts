import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', 'templates', 'bulk-task-template.xlsx')
  const file = await readFile(filePath)

  return new NextResponse(file, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="bulk-task-template.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
