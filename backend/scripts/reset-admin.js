/**
 * Emergency admin access recovery.
 *
 * Plain CommonJS on purpose: it needs nothing but @prisma/client and bcryptjs,
 * which are production dependencies, so it works in Railway's pruned runtime
 * image where tsx and ts-node are not guaranteed to exist.
 *
 *   ADMIN_EMAIL=you@enzipackaging.co.ke ADMIN_PASSWORD='new-password' \
 *     npm run reset-admin
 *
 * Creates the account if missing, resets the password if it exists, and always
 * leaves it active with the SUPERADMIN role.
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@enzipackaging.co.ke")
    .toLowerCase()
    .trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Enzi Admin";

  if (!password || password.length < 8) {
    console.error("");
    console.error("  Set ADMIN_PASSWORD to at least 8 characters. For example:");
    console.error("");
    console.error("    ADMIN_EMAIL=you@enzipackaging.co.ke \\");
    console.error("      ADMIN_PASSWORD='choose-something-strong' npm run reset-admin");
    console.error("");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const staff = await prisma.staffUser.upsert({
    where: { email },
    create: { email, name, passwordHash, role: "SUPERADMIN", active: true },
    update: {
      passwordHash,
      role: "SUPERADMIN",
      active: true,
      mustChangePassword: false,
    },
  });

  console.log("");
  console.log("  Access restored.");
  console.log(`    Email: ${staff.email}`);
  console.log(`    Role:  ${staff.role}`);
  console.log("");
  console.log("  Sign in with the password you just set.");
  console.log("");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("");
    if (e && typeof e.code === "string" && e.code.startsWith("P1")) {
      console.error("  Can't reach the database. Check DATABASE_URL.");
    } else if (e && e.message && /does not exist/i.test(e.message)) {
      console.error("  The staff table doesn't exist yet. Run:  npm run db:push");
    } else {
      console.error(e);
    }
    console.error("");
    await prisma.$disconnect();
    process.exit(1);
  });
