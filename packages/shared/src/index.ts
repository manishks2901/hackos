import { z } from "zod";

// ============ object storage ============
export * from "./storage.js";

// ============ roles ============

export const ROLES = ["organizer", "mentor", "participant"] as const;
export type Role = (typeof ROLES)[number];

// ============ auth ============

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(80),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type SigninInput = z.infer<typeof signinSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

// ============ events ============

export const createHackathonSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(4000).optional(),
  venue: z.string().max(300).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});
export type CreateHackathonInput = z.infer<typeof createHackathonSchema>;

export const redeemInviteSchema = z.object({
  code: z.string().min(4).max(64),
});

export const updateHackathonSchema = createHackathonSchema.partial();

export const createInviteSchema = z.object({
  role: z.enum(["organizer", "mentor", "participant"]).default("participant"),
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
});

export interface Hackathon {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  venue: string | null;
  startsAt: string | null;
  endsAt: string | null;
  role?: Role;
}

// ============ content ============

export const RESOURCE_TYPES = [
  "problem_statement",
  "doc",
  "link",
  "sponsor_api",
  "faq",
  "judging_criteria",
  "submission_guidelines",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const createResourceSchema = z.object({
  type: z.enum(RESOURCE_TYPES),
  title: z.string().min(1).max(200),
  content: z.string().max(200_000).optional(),
  url: z.string().url().optional(),
});
export type CreateResourceInput = z.infer<typeof createResourceSchema>;

export const updateResourceSchema = createResourceSchema.partial();

export const ANNOUNCEMENT_CATEGORIES = [
  "general",
  "deadline",
  "schedule",
  "food",
  "workshop",
  "prize",
  "tech",
] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
  priority: z.enum(["normal", "high"]).default("normal"),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).default("general"),
  sponsorId: z.string().uuid().nullable().optional(),
});

export const SPONSOR_TIERS = ["platinum", "gold", "silver", "partner"] as const;

export const createSponsorSchema = z.object({
  name: z.string().min(1).max(80),
  tier: z.enum(SPONSOR_TIERS).default("gold"),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#7c6cff"),
  tagline: z.string().max(200).optional(),
  url: z.string().url().optional(),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const createTimelineItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
});
export type CreateTimelineItemInput = z.infer<typeof createTimelineItemSchema>;

export const createIntegrationSchema = z.object({
  kind: z.enum(["discord", "telegram"]),
  config: z.record(z.string(), z.unknown()).default({}),
});

export interface TimelineItem {
  id: string;
  hackathonId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
}

export interface Resource {
  id: string;
  hackathonId: string;
  type: ResourceType;
  title: string;
  content: string | null;
  url: string | null;
  version: number;
  updatedAt: string;
}

export interface Announcement {
  id: string;
  hackathonId: string;
  title: string;
  body: string;
  priority: "normal" | "high";
  createdAt: string;
}

// ============ realtime events (gateway <-> extension) ============

export type RealtimeEvent =
  | { type: "announcement.created"; payload: Announcement }
  | { type: "resource.updated"; payload: { resourceId: string; version: number } }
  | { type: "deadline.changed"; payload: { timelineItemId: string; startsAt: string } };

export interface RealtimeEnvelope {
  hackathonId: string;
  event: RealtimeEvent;
  ts: string;
}
