import Link from "next/link";
import { auth, signOut } from "@/auth";
import { isAdminEmail } from "@/lib/auth-access";

const navItems = [
  { href: "/", label: "Dashboard" },
];

const adminNavItems = [
  { href: "/funnels", label: "Funnel Mapping" },
  { href: "/settings", label: "Settings" },
  { href: "/phase1", label: "System Checks" },
];

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "User";

  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export async function AppNav() {
  const session = await auth();
  const user = session?.user;
  const isAdmin = isAdminEmail(user?.email);

  async function signOutUser() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <nav className="app-nav" aria-label="Creative Performance Library sections">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          {item.label}
        </Link>
      ))}
      {isAdmin
        ? adminNavItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))
        : null}
      {user?.email ? (
        <div className="nav-user">
          <div className="nav-avatar" aria-hidden="true">
            {user.image ? (
              <img src={user.image} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span>{initials(user.name, user.email)}</span>
            )}
          </div>
          <div className="nav-user-copy">
            <strong>{user.name || user.email}</strong>
            {user.name ? <span>{user.email}</span> : null}
          </div>
          <form action={signOutUser}>
            <button
              type="submit"
              className="nav-signout"
              aria-label="Sign out"
              title="Sign out"
            >
              <span aria-hidden="true">&#x21AA;</span>
              <span>Sign out</span>
            </button>
          </form>
        </div>
      ) : null}
    </nav>
  );
}
