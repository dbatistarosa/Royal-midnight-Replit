import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import bookingsRouter from "./bookings";
import vehiclesRouter from "./vehicles";
import driversRouter from "./drivers";
import usersRouter from "./users";
import quoteRouter from "./quote";
import adminRouter from "./admin";
import addressesRouter from "./addresses";
import reviewsRouter from "./reviews";
import supportRouter from "./support";
import notificationsRouter from "./notifications";
import promosRouter from "./promos";
import pricingRouter from "./pricing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(bookingsRouter);
router.use(vehiclesRouter);
router.use(driversRouter);
router.use(usersRouter);
router.use(quoteRouter);
router.use(adminRouter);
router.use(addressesRouter);
router.use(reviewsRouter);
router.use(supportRouter);
router.use(notificationsRouter);
router.use(promosRouter);
router.use(pricingRouter);

export default router;
