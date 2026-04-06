import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bookingsRouter from "./bookings";
import vehiclesRouter from "./vehicles";
import driversRouter from "./drivers";
import usersRouter from "./users";
import quoteRouter from "./quote";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bookingsRouter);
router.use(vehiclesRouter);
router.use(driversRouter);
router.use(usersRouter);
router.use(quoteRouter);
router.use(adminRouter);

export default router;
