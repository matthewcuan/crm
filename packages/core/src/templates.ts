export interface MessageTemplate {
  key: string;
  label: string;
  description: string;
  /** Reference structure/tone the LLM personalizes — [brackets] mark fill-ins. */
  body: string;
}

export const TEMPLATES: MessageTemplate[] = [
  {
    key: "RECRUITER_INTRO",
    label: "Recruiter intro",
    description: "First touch to the recruiter attached to a role",
    body: `Hi [Name], I saw the [Role] opening at [Company] and wanted to reach out directly. My background is in [2-4 skills that overlap with the role]. I applied online as well, but wanted to ask whether this role is still active and if my background looks aligned with what the team is looking for.`,
  },
  {
    key: "ENGINEER_INTRO",
    label: "Engineer / hiring manager intro",
    description: "First touch to someone on the team — ask about fit, not a referral",
    body: `Hi [Name], I came across the [Role] role on the [Team/Product] team and thought it looked closely aligned with my background. I've worked on [2-4 relevant skills/projects]. I was curious whether this role is still active and whether you think this background would be relevant to the team.`,
  },
  {
    key: "REFERRAL_ASK",
    label: "Referral ask (after positive reply)",
    description: "Only after they respond positively to the intro",
    body: `Thanks, I appreciate the context. I applied online already. Would you be comfortable referring me or pointing me to the recruiter/hiring manager for the role?`,
  },
  {
    key: "FOLLOW_UP",
    label: "Follow-up (4-7 days)",
    description: "One follow-up only — do not over-message",
    body: `Hi [Name], just following up on this. I'm still interested in the [Role] role and think my background in [2-3 skills] could be a strong match. I'd appreciate any guidance if the role is still active.`,
  },
];
