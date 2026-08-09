import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import { signToken } from "../../lib/jwt";
import { HttpError } from "../../middleware/error";
import { normalizePhone, isValidKePhone } from "../../lib/phone";

export const authRouter = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

// ---- staff ----
authRouter.post(
  "/staff/login",
  wrap(async (req, res) => {
    const { email, password } = z
      .object({ email: z.string().email(), password: z.string() })
      .parse(req.body);
    const staff = await prisma.staffUser.findUnique({ where: { email } });
    if (!staff || !staff.active)
      throw new HttpError(401, "Invalid credentials");
    if (!(await verifyPassword(password, staff.passwordHash)))
      throw new HttpError(401, "Invalid credentials");
    await prisma.staffUser.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date() },
    });
    const token = signToken({ sub: staff.id, role: staff.role, kind: "staff" });
    res.json({
      token,
      staff: { id: staff.id, name: staff.name, role: staff.role },
    });
  })
);

// ---- customer ----
authRouter.post(
  "/customer/register",
  wrap(async (req, res) => {
    const body = z
      .object({
        phone: z.string(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        password: z.string().min(6),
      })
      .parse(req.body);
    const phone = normalizePhone(body.phone);
    if (!isValidKePhone(phone)) throw new HttpError(400, "Invalid phone");
    const customer = await prisma.customer.upsert({
      where: { phone },
      create: {
        phone,
        name: body.name,
        email: body.email,
        passwordHash: await hashPassword(body.password),
      },
      update: {
        name: body.name ?? undefined,
        email: body.email ?? undefined,
        passwordHash: await hashPassword(body.password),
      },
    });
    const token = signToken({
      sub: customer.id,
      phone: customer.phone,
      kind: "customer",
    });
    res.json({ token, customer: { id: customer.id, phone: customer.phone } });
  })
);

authRouter.post(
  "/customer/login",
  wrap(async (req, res) => {
    const body = z
      .object({ phone: z.string(), password: z.string() })
      .parse(req.body);
    const phone = normalizePhone(body.phone);
    const customer = await prisma.customer.findUnique({ where: { phone } });
    if (!customer?.passwordHash)
      throw new HttpError(401, "Invalid credentials");
    if (!(await verifyPassword(body.password, customer.passwordHash)))
      throw new HttpError(401, "Invalid credentials");
    const token = signToken({
      sub: customer.id,
      phone: customer.phone,
      kind: "customer",
    });
    res.json({ token, customer: { id: customer.id, phone: customer.phone } });
  })
);
