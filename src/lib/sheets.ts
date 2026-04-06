import { google } from "googleapis";
import type {
  Persona,
  CalendarEntry,
  GenerationLogEntry,
  QCTrial,
  IGSource,
  ScrapedPostEntry,
} from "@/types";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!;

// ==================== Generic Helpers ====================

async function readSheet(range: string): Promise<string[][]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  return (res.data.values as string[][]) || [];
}

async function appendRow(sheet: string, values: string[]): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheet}!A:A`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

async function updateCell(
  sheet: string,
  cell: string,
  value: string
): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheet}!${cell}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

async function updateRow(
  sheet: string,
  rowIndex: number,
  values: string[]
): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheet}!A${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

// ==================== Personas ====================

export async function getPersonas(): Promise<Persona[]> {
  const rows = await readSheet("Personas!A2:J");
  return rows.map((r) => ({
    personaId: r[0] || "",
    name: r[1] || "",
    personality: r[2] || "",
    bodyRefUrls: (r[3] || "").split(",").filter(Boolean),
    faceRefUrls: (r[4] || "").split(",").filter(Boolean),
    igSources: (r[5] || "").split(",").filter(Boolean),
    sourceRotation: (r[6] as "round-robin" | "random") || "round-robin",
    lastSourceIndex: parseInt(r[7] || "0", 10),
    active: r[8] !== "FALSE",
    languages: (r[9] || "english").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  }));
}

export async function getPersonaById(
  personaId: string
): Promise<Persona | null> {
  const personas = await getPersonas();
  return personas.find((p) => p.personaId === personaId) || null;
}

export async function updatePersonaSourceIndex(
  personaId: string,
  newIndex: number
): Promise<void> {
  const rows = await readSheet("Personas!A2:A");
  const rowIdx = rows.findIndex((r) => r[0] === personaId);
  if (rowIdx >= 0) {
    await updateCell("Personas", `H${rowIdx + 2}`, String(newIndex));
  }
}

// ==================== Content Calendar ====================

export async function getCalendar(): Promise<CalendarEntry[]> {
  const rows = await readSheet("Content Calendar!A2:K");
  return rows.map((r) => ({
    rowId: r[0] || "",
    date: r[1] || "",
    platform: (r[2] || "instagram") as CalendarEntry["platform"],
    contentType: (r[3] || "image") as CalendarEntry["contentType"],
    persona: r[4] || "",
    caption: r[5] || "",
    hashtags: r[6] || "",
    mediaUrls: (r[7] || "").split(",").filter(Boolean),
    status: (r[8] || "draft") as CalendarEntry["status"],
    blotatoPostId: r[9] || "",
    notes: r[10] || "",
  }));
}

export async function getScheduledAndPublished(): Promise<CalendarEntry[]> {
  const all = await getCalendar();
  return all.filter(
    (e) => e.status === "scheduled" || e.status === "published"
  );
}

export async function appendCalendarEntry(
  entry: Omit<CalendarEntry, "rowId">
): Promise<string> {
  const rows = await readSheet("Content Calendar!A2:A");
  const nextId = String(rows.length + 1);
  await appendRow("Content Calendar", [
    nextId,
    entry.date,
    entry.platform,
    entry.contentType,
    entry.persona,
    entry.caption,
    entry.hashtags,
    entry.mediaUrls.join(","),
    entry.status,
    entry.blotatoPostId,
    entry.notes,
  ]);
  return nextId;
}

export async function updateCalendarEntry(
  rowId: string,
  updates: Partial<CalendarEntry>
): Promise<void> {
  const rows = await readSheet("Content Calendar!A2:K");
  const rowIdx = rows.findIndex((r) => r[0] === rowId);
  if (rowIdx < 0) return;

  const current = rows[rowIdx];
  const updated = [
    current[0],
    updates.date ?? current[1],
    updates.platform ?? current[2],
    updates.contentType ?? current[3],
    updates.persona ?? current[4],
    updates.caption ?? current[5],
    updates.hashtags ?? current[6],
    updates.mediaUrls ? updates.mediaUrls.join(",") : current[7],
    updates.status ?? current[8],
    updates.blotatoPostId ?? current[9],
    updates.notes ?? current[10],
  ];
  await updateRow("Content Calendar", rowIdx + 2, updated);
}

// ==================== Generation Log ====================

export async function getGenerationLog(): Promise<GenerationLogEntry[]> {
  const rows = await readSheet("Generation Log!A2:O");
  return rows.map((r) => ({
    genId: r[0] || "",
    timestamp: r[1] || "",
    mode: (r[2] || "free-form") as GenerationLogEntry["mode"],
    persona: r[3] || "",
    sourceIgUrl: r[4] || "",
    basicPrompt: r[5] || "",
    expandedPrompt: r[6] || "",
    model: r[7] || "",
    taskId: r[8] || "",
    qcStatus: (r[9] || "pending") as GenerationLogEntry["qcStatus"],
    qcAttempts: parseInt(r[10] || "0", 10),
    finalResultUrls: (r[11] || "").split(",").filter(Boolean),
    caption: r[12] || "",
    carouselGroupId: r[13] || "",
    calendarRowId: r[14] || "",
  }));
}

export async function appendGenerationLog(
  entry: Omit<GenerationLogEntry, "genId">
): Promise<string> {
  const rows = await readSheet("Generation Log!A2:A");
  const nextId = String(rows.length + 1);
  await appendRow("Generation Log", [
    nextId,
    entry.timestamp,
    entry.mode,
    entry.persona,
    entry.sourceIgUrl,
    entry.basicPrompt,
    entry.expandedPrompt,
    entry.model,
    entry.taskId,
    entry.qcStatus,
    String(entry.qcAttempts),
    entry.finalResultUrls.join(","),
    entry.caption,
    entry.carouselGroupId,
    entry.calendarRowId,
  ]);
  return nextId;
}

export async function updateGenerationLog(
  genId: string,
  updates: Partial<GenerationLogEntry>
): Promise<void> {
  const rows = await readSheet("Generation Log!A2:O");
  const rowIdx = rows.findIndex((r) => r[0] === genId);
  if (rowIdx < 0) return;

  const current = rows[rowIdx];
  const updated = [
    current[0],
    updates.timestamp ?? current[1],
    updates.mode ?? current[2],
    updates.persona ?? current[3],
    updates.sourceIgUrl ?? current[4],
    updates.basicPrompt ?? current[5],
    updates.expandedPrompt ?? current[6],
    updates.model ?? current[7],
    updates.taskId ?? current[8],
    updates.qcStatus ?? current[9],
    updates.qcAttempts != null ? String(updates.qcAttempts) : current[10],
    updates.finalResultUrls
      ? updates.finalResultUrls.join(",")
      : current[11],
    updates.caption ?? current[12],
    updates.carouselGroupId ?? current[13],
    updates.calendarRowId ?? current[14],
  ];
  await updateRow("Generation Log", rowIdx + 2, updated);
}

export async function findGenerationByTaskId(
  taskId: string
): Promise<{ entry: GenerationLogEntry; rowIndex: number } | null> {
  const rows = await readSheet("Generation Log!A2:O");
  const rowIdx = rows.findIndex((r) => r[8] === taskId);
  if (rowIdx < 0) return null;
  const r = rows[rowIdx];
  return {
    entry: {
      genId: r[0],
      timestamp: r[1],
      mode: r[2] as GenerationLogEntry["mode"],
      persona: r[3],
      sourceIgUrl: r[4],
      basicPrompt: r[5],
      expandedPrompt: r[6],
      model: r[7],
      taskId: r[8],
      qcStatus: r[9] as GenerationLogEntry["qcStatus"],
      qcAttempts: parseInt(r[10] || "0", 10),
      finalResultUrls: (r[11] || "").split(",").filter(Boolean),
      caption: r[12] || "",
      carouselGroupId: r[13] || "",
      calendarRowId: r[14] || "",
    },
    rowIndex: rowIdx + 2,
  };
}

// ==================== QC Trials ====================

export async function appendQCTrial(
  trial: Omit<QCTrial, "trialId">
): Promise<string> {
  const rows = await readSheet("QC Trials!A2:A");
  const nextId = String(rows.length + 1);
  await appendRow("QC Trials", [
    nextId,
    trial.genId,
    String(trial.attemptNumber),
    trial.timestamp,
    trial.imageUrl,
    trial.qcResult,
    trial.issuesFound,
    trial.adjustedPrompt,
  ]);
  return nextId;
}

export async function getQCTrialsByGenId(genId: string): Promise<QCTrial[]> {
  const rows = await readSheet("QC Trials!A2:H");
  return rows
    .filter((r) => r[1] === genId)
    .map((r) => ({
      trialId: r[0],
      genId: r[1],
      attemptNumber: parseInt(r[2] || "1", 10),
      timestamp: r[3],
      imageUrl: r[4],
      qcResult: r[5] as "pass" | "fail",
      issuesFound: r[6] || "",
      adjustedPrompt: r[7] || "",
    }));
}

// ==================== IG Sources ====================

function parsePersonaIds(raw: string): string[] {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getIGSources(): Promise<IGSource[]> {
  const rows = await readSheet("IG Sources!A2:F");
  return rows.map((r) => ({
    profileUrl: r[0] || "",
    personaIds: parsePersonaIds(r[1] || ""),
    lastScraped: r[2] || "",
    postsScraped: parseInt(r[3] || "0", 10),
    active: r[4] !== "FALSE",
    notes: r[5] || "",
  }));
}

export async function getIGSourcesByPersona(
  personaId: string
): Promise<IGSource[]> {
  const sources = await getIGSources();
  return sources.filter(
    (s) => s.personaIds.includes(personaId) && s.active
  );
}

export async function appendIGSource(source: IGSource): Promise<void> {
  await appendRow("IG Sources", [
    source.profileUrl,
    source.personaIds.join(","),
    source.lastScraped,
    String(source.postsScraped),
    source.active ? "TRUE" : "FALSE",
    source.notes,
  ]);
}

export async function getIGSourceByUrl(
  profileUrl: string
): Promise<{ source: IGSource; rowIndex: number } | null> {
  const rows = await readSheet("IG Sources!A2:F");
  const rowIdx = rows.findIndex((r) => r[0] === profileUrl);
  if (rowIdx < 0) return null;
  const r = rows[rowIdx];
  return {
    source: {
      profileUrl: r[0] || "",
      personaIds: parsePersonaIds(r[1] || ""),
      lastScraped: r[2] || "",
      postsScraped: parseInt(r[3] || "0", 10),
      active: r[4] !== "FALSE",
      notes: r[5] || "",
    },
    rowIndex: rowIdx + 2,
  };
}

export async function updateIGSourceLastScraped(
  profileUrl: string,
  timestamp: string,
  newPostsCount: number
): Promise<void> {
  const existing = await getIGSourceByUrl(profileUrl);
  if (existing) {
    const totalPosts = existing.source.postsScraped + newPostsCount;
    await updateCell("IG Sources", `C${existing.rowIndex}`, timestamp);
    await updateCell("IG Sources", `D${existing.rowIndex}`, String(totalPosts));
  }
}

// ==================== Scraped Posts ====================

export async function getScrapedPosts(
  personaId?: string
): Promise<ScrapedPostEntry[]> {
  const rows = await readSheet("Scraped Posts!A2:J");
  const posts = rows.map((r) => ({
    postId: r[0] || "",
    sourceUrl: r[1] || "",
    personaId: r[2] || "",
    thumbnailUrl: r[3] || "",
    mediaUrls: (r[4] || "").split(",").filter(Boolean),
    caption: r[5] || "",
    type: (r[6] || "image") as ScrapedPostEntry["type"],
    likes: parseInt(r[7] || "0", 10),
    scrapedAt: r[8] || "",
    used: r[9] === "TRUE",
  }));
  if (personaId) {
    return posts.filter((p) => p.personaId === personaId);
  }
  return posts;
}

export async function appendScrapedPosts(
  posts: Omit<ScrapedPostEntry, "postId">[]
): Promise<string[]> {
  const existing = await readSheet("Scraped Posts!A2:A");
  const ids: string[] = [];
  for (let i = 0; i < posts.length; i++) {
    const nextId = String(existing.length + i + 1);
    ids.push(nextId);
    await appendRow("Scraped Posts", [
      nextId,
      posts[i].sourceUrl,
      posts[i].personaId,
      posts[i].thumbnailUrl,
      posts[i].mediaUrls.join(","),
      posts[i].caption,
      posts[i].type,
      String(posts[i].likes),
      posts[i].scrapedAt,
      posts[i].used ? "TRUE" : "FALSE",
    ]);
  }
  return ids;
}

export async function markScrapedPostUsed(postId: string): Promise<void> {
  const rows = await readSheet("Scraped Posts!A2:A");
  const rowIdx = rows.findIndex((r) => r[0] === postId);
  if (rowIdx >= 0) {
    await updateCell("Scraped Posts", `J${rowIdx + 2}`, "TRUE");
  }
}
