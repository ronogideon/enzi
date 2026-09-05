/**
 * Emergency access recovery. Run from the Railway shell when nobody can sign
 * in to the admin dashboard:
 *
 *   ADMIN_EMAIL=you@enzipackaging.co.ke ADMIN_PASSWORD='new-password' \
 *     npx tsx prisma/reset-admin.ts
 *
 * Creates the account if it doesn't exist, resets the password if it does, and
 * always leaves it active with the SUPERADMIN role.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@enzipackaging.co.ke").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!password || password.length < 8) {
    console.error("Set ADMIN_PASSWORD to at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const staff = await prisma.staffUser.upsert({
    where: { email },
    create: {
      email,
      name: process.env.ADMIN_NAME ?? "Enzi Admin",
      passwordHash,
      role: "SUPERADMIN",
      active: true,
    },
    update: { passwordHash, role: "SUPERADMIN", active: true, mustChangePassword: false },
  });

  console.log(`Access restored for ${staff.email} (${staff.role}).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
