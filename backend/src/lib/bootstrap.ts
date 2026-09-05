import { prisma } from "./prisma";
import { hashPassword } from "./password";

/**
 * Makes sure there is always a way into the admin dashboard.
 *
 * Why this exists: `npm run seed` is run through `tsx`, which was a
 * devDependency — and Railway prunes devDependencies from the production
 * image. So the seed command failed with "tsx: not found" and no admin account
 * was ever created. The login page then correctly reported "invalid email or
 * password", because there genuinely was no such account.
 *
 * This runs on every boot and needs nothing beyond the Prisma client and
 * bcryptjs, both of which are production dependencies. It is deliberately
 * conservative:
 *
 *   - It only CREATES an account when the staff table is completely empty.
 *     Once you have any staff at all, it does nothing.
 *   - It only RESETS a password when ADMIN_RESET_PASSWORD is explicitly set,
 *     and it shouts in the logs telling you to remove that variable.
 *
 * So it can't quietly resurrect an account you deliberately deleted, and it
 * can't be used to overwrite a password just by redeploying.
 */
export async function ensureAdminAccount(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? "admin@enzipackaging.co.ke")
    .toLowerCase()
    .trim();
  const name = process.env.ADMIN_NAME ?? "Enzi Admin";
  const resetTo = process.env.ADMIN_RESET_PASSWORD?.trim();

  let staffCount: number;
  try {
    staffCount = await prisma.staffUser.count();
  } catch (e) {
    // Almost always "table does not exist" — the schema hasn't been pushed.
    console.error("");
    console.error("  [enzi] Could not read the staff table.");
    console.error("  [enzi] If this is a fresh database, run:  npm run db:push");
    console.error("");
    return;
  }

  // --- explicit password reset via environment variable -------------------
  if (resetTo) {
    if (resetTo.length < 8) {
      console.error("  [enzi] ADMIN_RESET_PASSWORD is shorter than 8 characters — ignored.");
    } else {
      await prisma.staffUser.upsert({
        where: { email },
        create: {
          email,
          name,
          passwordHash: await hashPassword(resetTo),
          role: "SUPERADMIN",
          active: true,
        },
        update: {
          passwordHash: await hashPassword(resetTo),
          role: "SUPERADMIN",
          active: true,
          mustChangePassword: false,
        },
      });
      console.warn("");
      console.warn("  ****************************************************************");
      console.warn(`  [enzi] Password reset for ${email} via ADMIN_RESET_PASSWORD.`);
      console.warn("  [enzi] REMOVE that variable from Railway now — while it is set,");
      console.warn("  [enzi] the password resets on every single deploy.");
      console.warn("  ****************************************************************");
      console.warn("");
    }
    return;
  }

  // --- first-run bootstrap ------------------------------------------------
  if (staffCount > 0) return;

  const password = process.env.ADMIN_PASSWORD ?? "changeme123";
  await prisma.staffUser.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      role: "SUPERADMIN",
      active: true,
      // Force a change if they're landing on the well-known default.
      mustChangePassword: password === "changeme123",
    },
  });

  console.log("");
  console.log("  ================================================================");
  console.log("  [enzi] No staff accounts existed, so an owner account was created:");
  console.log("");
  console.log(`      Email:    ${email}`);
  console.log(`      Password: ${password}`);
  console.log("");
  if (password === "changeme123")
    console.log("  [enzi] That is the default password. Change it after signing in.");
  console.log("  ================================================================");
  console.log("");
}
