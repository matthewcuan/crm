export const STATUSES = [
  "SAVED",
  "APPLIED",
  "MESSAGED",
  "FOLLOWED_UP",
  "SCREEN",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "CLOSED",
] as const;
export type Status = (typeof STATUSES)[number];

export const CONTACT_TYPES = [
  "RECRUITER",
  "HIRING_MANAGER",
  "ENGINEER",
  "ALUMNI",
  "OTHER",
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const CHANNELS = ["LINKEDIN", "EMAIL", "OTHER"] as const;
export type Channel = (typeof CHANNELS)[number];

export type Direction = "SENT" | "RECEIVED";

export interface Application {
  id: string;
  company: string;
  role: string;
  jobUrl?: string;
  jobText?: string;
  location?: string;
  seniority?: string;
  salary?: string;
  source?: string; // greenhouse / lever / linkedin / referral / ...
  keySkills?: string[];
  status: Status;
  resumeId?: string; // which resume version this application uses
  notes?: string;
  dateSaved: string; // ISO datetime
  dateApplied?: string; // ISO datetime
}

export interface Contact {
  id: string;
  applicationId: string;
  name: string;
  type: ContactType;
  linkedinUrl?: string;
  email?: string;
  notes?: string;
}

export interface Interaction {
  id: string;
  applicationId: string;
  contactId?: string;
  contactName?: string; // denormalized for the dashboard / reminder email
  channel: Channel;
  direction: Direction;
  body: string;
  sentAt: string; // ISO datetime
  nextFollowUpAt?: string; // YYYY-MM-DD — while set, drives Due Today + reminders
  outcome?: string; // no-reply / apply-online / referral / screen / ...
}

export interface Resume {
  id: string;
  label: string; // e.g. "Backend", "Security/PKI", "Full-stack"
  fileName?: string;
  rawText: string;
  skills: string[];
  summary?: string;
  isDefault: boolean;
  createdAt: string; // ISO datetime
}

export interface ApplicationBundle {
  application: Application;
  contacts: Contact[];
  interactions: Interaction[];
}

export interface DueFollowUp {
  interaction: Interaction;
  application: Application | null;
}
