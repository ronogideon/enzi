import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes";
import { staffRouter } from "./modules/staff/staff.routes";
import { productsRouter } from "./modules/products/products.routes";
import { mediaRouter } from "./modules/media/media.routes";
import { ordersRouter } from "./modules/orders/orders.routes";
import { paymentsRouter } from "./modules/payments/payments.routes";
import { stockRouter } from "./modules/stock/stock.routes";
import { statsRouter } from "./modules/stats/stats.routes";
import { smsRouter } from "./modules/sms/sms.routes";
import { settingsRouter } from "./modules/settings/settings.routes";
import {
  categoriesRouter,
  deliveryRouter,
  promotionsRouter,
  customersRouter,
  reviewsRouter,
  blogRouter,
  faqRouter,
} from "./modules/content.routes";

export const api = Router();

api.use("/auth", authRouter);
api.use("/staff", staffRouter);
api.use("/products", productsRouter);
api.use("/media", mediaRouter);
api.use("/categories", categoriesRouter);
api.use("/delivery-methods", deliveryRouter);
api.use("/orders", ordersRouter);
api.use("/payments", paymentsRouter);
api.use("/promotions", promotionsRouter);
api.use("/customers", customersRouter);
api.use("/stock", stockRouter);
api.use("/sms", smsRouter);
api.use("/stats", statsRouter);
api.use("/reviews", reviewsRouter);
api.use("/blog", blogRouter);
api.use("/faqs", faqRouter);
api.use("/settings", settingsRouter);
