/**
 * Shows which staff accounts exist, so you can tell "wrong password" apart from
 * "no account at all" without guessing. Never prints password hashes.
 *
 *   npm run whoami
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const staff = await prisma.staffUser.findMany({
    select: {
      email: true, name: true, role: true, active: true,
      lastLoginAt: true, createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("");
  if (staff.length === 0) {
    console.log("  No staff accounts exist in this database.");
    console.log("  That is why signing in fails. Create one with:");
    console.log("");
    console.log("    ADMIN_EMAIL=you@enzipackaging.co.ke \\");
    console.log("      ADMIN_PASSWORD='choose-something-strong' npm run reset-admin");
    console.log("");
    return;
  }

  console.log(`  ${staff.length} staff account(s):`);
  console.log("");
  for (const s of staff) {
    console.log(
      `    ${s.active ? "active  " : "disabled"}  ${s.role.padEnd(10)}  ${s.email}` +
        `  (${s.name})`
    );
    console.log(
      `              last sign-in: ${
        s.lastLoginAt ? s.lastLoginAt.toISOString() : "never"
      }`
    );
  }
  console.log("");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e && e.message ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
