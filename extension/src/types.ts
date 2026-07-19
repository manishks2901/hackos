export interface Resource {
  id: string;
  type:
    | "problem_statement"
    | "doc"
    | "link"
    | "sponsor_api"
    | "faq"
    | "judging_criteria"
    | "submission_guidelines";
  title: string;
  content: string | null;
  url: string | null;
  version: number;
  updatedAt: string;
}

export interface SponsorRef {
  name: string;
  tier: string;
  brandColor: string;
  url: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: "normal" | "high";
  category?: string;
  sponsor?: SponsorRef | null;
  createdAt: string;
}

export interface Sponsor {
  id: string;
  name: string;
  tier: string;
  brandColor: string;
  tagline: string | null;
  url: string | null;
  /** Optional remote logo. Backward compatible — sync passes through whatever the API returns. */
  logoUrl?: string;
}

export interface TimelineItem {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
}

export interface EventInfo {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  members: Array<{ id: string; name: string }>;
  isMine: boolean;
  hasSubmission: boolean;
}

export interface Mentor {
  id: string;
  name: string;
}

export interface Submission {
  id: string;
  repoUrl: string;
  submittedAt: string;
  teamName: string;
}

export interface EventCache {
  event: EventInfo;
  resources: Resource[];
  announcements: Announcement[];
  timeline: TimelineItem[];
  teams?: Team[];
  mentors?: Mentor[];
  sponsors?: Sponsor[];
  mySubmission?: Submission | null;
  readAnnouncements?: string[];
  lastSyncAt: string | null;
}
