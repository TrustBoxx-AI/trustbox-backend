
import * as dotenv from "dotenv";
dotenv.config();

import { ethers }    from "ethers";
import { loadAbi }   from "../../src/config/chains";

async function main() {
  const pk         = process.env.DEPLOYER_PRIVATE_KEY;
  const registryAddr = process.env.AUDIT_REGISTRY_ADDR;
  const rpcUrl     = process.env.AVALANCHE_FUJI_RPC ?? "https://api.avax-test.network/ext/bc/C/rpc";

  if (!pk || !registryAddr) {
    console.error("❌  DEPLOYER_PRIVATE_KEY and AUDIT_REGISTRY_ADDR must be set in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
  const signer   = new ethers.Wallet(pk, provider);
  const abi      = loadAbi("AuditRegistry");

  const registry = new ethers.Contract(registryAddr, abi, signer);

  const signerAddress = await signer.getAddress();
  console.log("═══════════════════════════════════════════════════════");
  console.log("  TrustBox — Add Authorised Auditor");
  console.log(`  Registry:  ${registryAddr}`);
  console.log(`  Auditor:   ${signerAddress}  (deployer / backend signer)`);
  console.log("═══════════════════════════════════════════════════════\n");

  // Check if already authorised
  let alreadyAuthorised = false;
  try {
    alreadyAuthorised = await registry.authorisedAuditors(signerAddress);
  } catch {
    // Function may not be a public mapping getter — proceed anyway
  }

  if (alreadyAuthorised) {
    console.log("  ✅ Already authorised — nothing to do.");
    return;
  }

  console.log("  Adding auditor...");
  const tx      = await registry.addAuditor(signerAddress);
  const receipt = await tx.wait(1);

  console.log(`  ✅ Auditor added!`);
  console.log(`  tx:          ${receipt.hash}`);
  console.log(`  Snowtrace:   https://testnet.snowtrace.io/tx/${receipt.hash}`);
  console.log("\n  /api/audit will now successfully anchor reports on-chain.\n");
  console.log("═══════════════════════════════════════════════════════");
}

main().catch(err => {
  console.error("❌  Failed:", err.message);
  process.exit(1);
});
