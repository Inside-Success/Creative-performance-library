import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import {
  allowedEmailDomain,
  isAllowedEmail,
  isAllowedHostedDomain,
} from "@/lib/auth-access";

type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  hd?: string;
};

function googleProfile(profile: unknown): GoogleProfile {
  return profile && typeof profile === "object" ? (profile as GoogleProfile) : {};
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          hd: allowedEmailDomain(),
        },
      },
    }),
  ],
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider !== "google") {
        return false;
      }

      const google = googleProfile(profile);
      const hostedDomainAllowed = google.hd
        ? isAllowedHostedDomain(google.hd)
        : true;

      return (
        google.email_verified === true &&
        isAllowedEmail(google.email) &&
        hostedDomainAllowed
      );
    },
  },
});
