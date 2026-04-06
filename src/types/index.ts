// ==================== Personas ====================
export interface Persona {
  personaId: string;
  name: string;
  personality: string;
  bodyRefUrls: string[];
  faceRefUrls: string[];
  igSources: string[];
  sourceRotation: "round-robin" | "random";
  lastSourceIndex: number;
  active: boolean;
  languages: string[];
}

// ==================== Content Calendar ====================
export type ContentStatus =
  | "draft"
  | "generating"
  | "ready"
  | "scheduled"
  | "published"
  | "failed";

export type ContentType = "image" | "video" | "carousel";
export type Platform = "instagram" | "tiktok" | "twitter";

export interface CalendarEntry {
  rowId: string;
  date: string;
  platform: Platform;
  contentType: ContentType;
  persona: string;
  caption: string;
  hashtags: string;
  mediaUrls: string[];
  status: ContentStatus;
  blotatoPostId: string;
  notes: string;
}

// ==================== Generation Log ====================
export type GenerationMode =
  | "ig-replicator"
  | "free-form"
  | "carousel"
  | "video";

export type QCStatus = "passed" | "failed-retry" | "failed-flagged" | "pending" | "rejected";

export interface GenerationLogEntry {
  genId: string;
  timestamp: string;
  mode: GenerationMode;
  persona: string;
  sourceIgUrl: string;
  basicPrompt: string;
  expandedPrompt: string;
  model: string;
  taskId: string;
  qcStatus: QCStatus;
  qcAttempts: number;
  finalResultUrls: string[];
  caption: string;
  carouselGroupId: string;
  calendarRowId: string;
}

// ==================== QC Trials ====================
export interface QCTrial {
  trialId: string;
  genId: string;
  attemptNumber: number;
  timestamp: string;
  imageUrl: string;
  qcResult: "pass" | "fail";
  issuesFound: string;
  adjustedPrompt: string;
}

// ==================== IG Sources ====================
export interface IGSource {
  profileUrl: string;
  personaId: string;
  lastScraped: string;
  postsScraped: number;
  active: boolean;
  notes: string;
}

// ==================== Scraped Posts ====================
export interface ScrapedPostEntry {
  postId: string;
  sourceUrl: string;
  personaId: string;
  thumbnailUrl: string;
  mediaUrls: string[];
  caption: string;
  type: "image" | "video" | "carousel";
  likes: number;
  scrapedAt: string;
  used: boolean;
}

// ==================== API Types ====================
export interface GenerateImageRequest {
  prompt: string;
  persona: string;
  mode: GenerationMode;
  promptImageUrl?: string;
  aspectRatio?: string;
  sourceIgUrl?: string;
}

export interface GenerateVideoRequest {
  imageUrl: string;
  prompt?: string;
  persona: string;
}

export interface TaskStatus {
  taskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  resultUrl?: string;
  error?: string;
  progress?: number;
}

export interface PublishRequest {
  mediaUrls: string[];
  caption: string;
  hashtags: string;
  platform: Platform;
  scheduledTime?: string;
}
