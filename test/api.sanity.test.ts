/* test/api.sanity.test.ts
   Basic sanity tests for route structure and validation.
   Does NOT require deployed contracts or external APIs.
   Run: npx hardhat test test/api.sanity.test.ts (with node testenv)
   ─────────────────────────────────────────────────────────────── */

import { describe, it } from "mocha";
import { expect }        from "chai";
import { z }             from "zod";
import { VerifySchema, AuditSchema, IntentParseSchema, ScoreSchema } from "../src/middleware/validate";

describe("Validation Schemas", () => {

  it("VerifySchema accepts valid verify body", () => {
    const result = VerifySchema.safeParse({
      walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      agentName:     "TestBot",
      model:         "gpt-4o",
      operator:      "Acme Corp",
      capabilities:  "web_search,code_exec",
      environment:   "production",
    });
    expect(result.success).to.be.true;
  });

  it("VerifySchema rejects missing walletAddress", () => {
    const result = VerifySchema.safeParse({
      agentName: "TestBot",
      model:     "gpt-4o",
      operator:  "Acme",
      capabilities: "search",
      environment: "staging",
    });
    expect(result.success).to.be.false;
  });

  it("AuditSchema accepts valid audit body", () => {
    const result = AuditSchema.safeParse({
      walletAddress:   "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      contractName:    "MyToken",
      contractAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      chain:           "Ethereum",
    });
    expect(result.success).to.be.true;
  });

  it("IntentParseSchema accepts valid intent categories", () => {
    for (const category of ["Travel Booking", "Portfolio Rebalance", "Contributor Tip"] as const) {
      const result = IntentParseSchema.safeParse({
        walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        nlText:        "do something useful",
        category,
      });
      expect(result.success, `category: ${category}`).to.be.true;
    }
  });

  it("IntentParseSchema rejects unknown category", () => {
    const result = IntentParseSchema.safeParse({
      walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      nlText:        "do something",
      category:      "Unknown Category",
    });
    expect(result.success).to.be.false;
  });

  it("IntentParseSchema rejects nlText that is too short", () => {
    const result = IntentParseSchema.safeParse({
      walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      nlText:        "hi",
      category:      "Travel Booking",
    });
    expect(result.success).to.be.false;
  });
});
