export function allowedEmailDomain() {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? "insidesuccess.com")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function csvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined) {
  const domain = allowedEmailDomain();

  if (!email || !domain) {
    return false;
  }

  return email.toLowerCase().endsWith(`@${domain}`);
}

export function isAllowedHostedDomain(hostedDomain: string | null | undefined) {
  const domain = allowedEmailDomain();

  if (!hostedDomain || !domain) {
    return false;
  }

  return hostedDomain.toLowerCase() === domain;
}

export function adminEmails() {
  return csvEnv("CPL_ADMIN_EMAILS");
}

export function isAdminEmail(email: string | null | undefined) {
  if (!isAllowedEmail(email)) {
    return false;
  }

  const normalizedEmail = (email ?? "").toLowerCase();
  const admins = adminEmails();

  if (admins.length === 0) {
    return true;
  }

  return admins.includes(normalizedEmail);
}

export function roleForEmail(email: string | null | undefined) {
  if (isAdminEmail(email)) {
    return "admin";
  }

  if (isAllowedEmail(email)) {
    return "viewer";
  }

  return "none";
}
