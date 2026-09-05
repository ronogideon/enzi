import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// KES -> cents
const c = (kes: number) => kes * 100;

async function main() {
  // ---- admin ----
  // The password can be overridden at seed time so production never has to go
  // through a known default:  ADMIN_PASSWORD='...' npm run seed
  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@enzipackaging.co.ke").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "changeme123";

  await prisma.staffUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: process.env.ADMIN_NAME ?? "Enzi Admin",
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "SUPERADMIN",
      mustChangePassword: adminPassword === "changeme123",
    },
  });

  // ---- categories (from the live site) ----
  const categories = [
    "Bubble Mailer",
    "Kraft Bags",
    "Organza / Mesh Bags",
    "Polymailer",
    "Stickers",
  ];
  const catMap: Record<string, string> = {};
  let pos = 0;
  for (const name of categories) {
    const cat = await prisma.category.upsert({
      where: { slug: slug(name) },
      update: {},
      create: { name, slug: slug(name), position: pos++ },
    });
    catMap[name] = cat.id;
  }

  // ---- sample products (mirrors catalogue seen in screenshots) ----
  const products = [
    { name: "Bubble Mailer Purple A5", cat: "Bubble Mailer", retail: 35, wholesale: 28, stock: 500 },
    { name: "Bubble Mailer Black A5", cat: "Bubble Mailer", retail: 35, wholesale: 28, stock: 500 },
    { name: "Clear Self Sealing Bags", cat: "Polymailer", retail: 15, wholesale: 10, stock: 1000, featured: true },
    { name: "White Polymailer Packaging Bags", cat: "Polymailer", retail: 35, wholesale: 25, stock: 800, featured: true },
    { name: "Purple Polymailer Packaging Bags", cat: "Polymailer", retail: 35, wholesale: 25, stock: 800, featured: true },
    { name: "Pink Polymailer Packaging Bags-Bio", cat: "Polymailer", retail: 35, wholesale: 25, stock: 800, featured: true },
    { name: "Black Polymailer Packaging Bags", cat: "Polymailer", retail: 35, wholesale: 25, stock: 800, featured: true },
    { name: "Organza Mesh Bags", cat: "Organza / Mesh Bags", retail: 50, wholesale: 40, stock: 300 },
    { name: "Kraft Paper Bag Medium", cat: "Kraft Bags", retail: 45, wholesale: 35, stock: 400 },
    { name: "Thank You Sticker Roll", cat: "Stickers", retail: 300, wholesale: 240, stock: 120 },
  ];

  for (const p of products) {
    const s = slug(p.name);
    await prisma.product.upsert({
      where: { slug: s },
      update: {},
      create: {
        name: p.name,
        slug: s,
        categoryId: catMap[p.cat],
        retailPrice: c(p.retail),
        wholesalePrice: c(p.wholesale),
        retailMinQty: 10, // retail floor — the rule that was broken before
        wholesaleMinQty: 100,
        stockQty: p.stock,
        featured: p.featured ?? false,
      },
    });
  }

  // ---- delivery methods (POD rules baked in) ----
  const methods = [
    { name: "In-store Pickup", type: "STORE_PICKUP", baseCost: 0, podAllowed: true },
    { name: "Nairobi Delivery", type: "DELIVERY", baseCost: 300, podAllowed: true },
    { name: "Parcel (Matatu)", type: "PARCEL", baseCost: 250, podAllowed: false },
    { name: "Pickup Mtaani", type: "PICKUP_MTAANI", baseCost: 150, podAllowed: false },
  ] as const;
  let mpos = 0;
  for (const m of methods) {
    const existing = await prisma.deliveryMethod.findFirst({
      where: { name: m.name },
    });
    if (!existing) {
      await prisma.deliveryMethod.create({
        data: { ...m, position: mpos++ },
      });
    }
  }

  // ---- FAQs ----
  const faqs = [
    { q: "Do you offer wholesale pricing?", a: "Yes. Wholesale rates apply at higher minimum quantities — contact us or select the wholesale tier at checkout." },
    { q: "What areas do you deliver to?", a: "We deliver within Nairobi, and countrywide via Parcel (Matatu) and Pickup Mtaani." },
  ];
  let fpos = 0;
  for (const f of faqs) {
    const existing = await prisma.faq.findFirst({ where: { question: f.q } });
    if (!existing)
      await prisma.faq.create({
        data: { question: f.q, answer: f.a, position: fpos++ },
      });
  }

  console.log("");
  console.log("  Seed complete.");
  console.log(`  Admin login: ${adminEmail} / ${adminPassword}`);
  if (adminPassword === "changeme123")
    console.log("  ^ default password — change it on first sign-in.");
  console.log("");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
