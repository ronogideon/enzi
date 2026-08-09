import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export interface StaffTokenPayload {
  sub: string;
  role: string;
  kind: "staff";
}
export interface CustomerTokenPayload {
  sub: string;
  phone: string;
  kind: "customer";
}
export type TokenPayload = StaffTokenPayload | CustomerTokenPayload;

export function signToken(payload: TokenPayload): string {
  const opts: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.jwtSecret, opts);
}
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret) as TokenPayload;
}
