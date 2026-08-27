/**
 * Clinic slug helpers. Shared with the client so the registration form can show the
 * patient-facing URL live as the clinic name is typed — no `server-only` import here.
 */

const RESERVED = new Set([
  // Would collide with real routes, or with paths we may want later.
  "portal",
  "api",
  "admin",
  "login",
  "register",
  "s",
  "t",
  "c",
  "www",
  "app",
  "static",
  "public",
  "_next",
]);

/** "Dr. Meera's Clinic!" → "dr-meeras-clinic" */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      // Strip combining marks so accented characters degrade to their base letter
      // rather than vanishing entirely.
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "")
  );
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug);
}

/** 3–48 chars, lowercase alphanumeric and single hyphens, not reserved. */
export function validateSlug(slug: string): string | null {
  if (slug.length < 3) return "Clinic ID must be at least 3 characters.";
  if (slug.length > 48) return "Clinic ID is too long.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "Clinic ID may use lowercase letters, numbers and single hyphens only.";
  }
  if (isReservedSlug(slug)) return "That clinic ID is reserved. Please choose another.";
  return null;
}
