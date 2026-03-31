import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { familyRouter } from "./routers/family";
import { fridgeRouter } from "./routers/fridge";
import { storeRouter } from "./routers/store";
import { menuRouter } from "./routers/menu";
import { shoppingRouter } from "./routers/shopping";
import { adminRouter } from "./routers/admin";
import { lineRouter } from "./routers/line";
import { lineAuthRouter } from "./routers/lineAuth";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  family: familyRouter,
  fridge: fridgeRouter,
  store: storeRouter,
  menu: menuRouter,
  shopping: shoppingRouter,
  admin: adminRouter,
  line: lineRouter,
  lineAuth: lineAuthRouter,
});

export type AppRouter = typeof appRouter;
