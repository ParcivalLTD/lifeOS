import { domainEnum } from "@/db/schema";

export type Domain = (typeof domainEnum.enumValues)[number];

export const DOMAINS = domainEnum.enumValues;

/** Static class names so Tailwind can see them (7px square domain dots). */
export const DOMAIN_DOT_CLASS: Record<Domain, string> = {
  personal: "bg-domain-personal",
  academic: "bg-domain-academic",
  work: "bg-domain-work",
  finance: "bg-domain-finance",
  gym: "bg-domain-gym",
  health: "bg-domain-health",
};

export const isDomain = (v: string): v is Domain =>
  (DOMAINS as readonly string[]).includes(v);
