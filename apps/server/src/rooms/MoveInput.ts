import { schema, t, type SchemaType } from "@colyseus/schema";

/** Colyseus 0.18 input channel; wire axes are restricted to int8, then sanitized. */
export const MoveInput = schema({
  moveX: t.int8<-1 | 0 | 1>().default(0),
  moveY: t.int8<-1 | 0 | 1>().default(0),
  dash: t.boolean().default(false)
});
export type MoveInput = SchemaType<typeof MoveInput>;
