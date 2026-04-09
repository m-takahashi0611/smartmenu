import { describe, it, expect } from "vitest";
import { verifySmtpConnection } from "./mailer";

describe("SMTP Connection", () => {
  it("should connect to SMTP server successfully", async () => {
    const result = await verifySmtpConnection();
    expect(result).toBe(true);
  }, 15000);
});
