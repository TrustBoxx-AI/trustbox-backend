#!/bin/bash
# compile-zk.sh — TrustBox
# Compiles CreditScore.circom and generates all ZK artifacts.
# Run once from your trustbox-backend root directory.
# Output goes to ./zk/ (matches env.ts ZK_*_PATH defaults)
# ─────────────────────────────────────────────────────────────
set -e

echo "╔══════════════════════════════════════════╗"
echo "║  TrustBox — ZK Circuit Compile           ║"
echo "╚══════════════════════════════════════════╝"

# ── 0. Check dependencies ─────────────────────────────────────
if ! command -v circom &> /dev/null; then
  echo "Installing circom..."
  curl -s https://raw.githubusercontent.com/iden3/circom/master/install.sh | bash
  export PATH=$PATH:$HOME/.cargo/bin
fi

if ! command -v snarkjs &> /dev/null; then
  echo "Installing snarkjs..."
  npm install -g snarkjs
fi

# ── 1. Install circomlib ──────────────────────────────────────
if [ ! -d "node_modules/circomlib" ]; then
  echo "Installing circomlib..."
  npm install circomlib
fi

# ── 2. Create output directory ────────────────────────────────
mkdir -p zk

# ── 3. Compile circuit ────────────────────────────────────────
echo ""
echo "▶ Compiling CreditScore.circom..."
circom circuits/CreditScore.circom \
  --r1cs --wasm --sym \
  -o zk/

echo "✓ Circuit compiled"
echo "  → zk/CreditScore.r1cs"
echo "  → zk/CreditScore_js/CreditScore.wasm"

# ── 4. Powers of Tau ceremony (fresh, ~30s) ───────────────────
echo ""
echo "▶ Running Powers of Tau ceremony (2^14 constraints max)..."
snarkjs powersoftau new bn128 14 zk/pot14_0.ptau -v
snarkjs powersoftau contribute zk/pot14_0.ptau zk/pot14_1.ptau \
  --name="TrustBox Initial" -v -e="$(openssl rand -hex 32)"
snarkjs powersoftau prepare phase2 zk/pot14_1.ptau zk/pot14_final.ptau -v
echo "✓ Powers of Tau complete"

# ── 5. Groth16 trusted setup ──────────────────────────────────
echo ""
echo "▶ Groth16 setup..."
snarkjs groth16 setup zk/CreditScore.r1cs zk/pot14_final.ptau zk/CreditScore_0.zkey
snarkjs zkey contribute zk/CreditScore_0.zkey zk/CreditScore_final.zkey \
  --name="TrustBox Phase2" -v -e="$(openssl rand -hex 32)"
echo "✓ Trusted setup complete"

# ── 6. Export verification key ────────────────────────────────
echo ""
echo "▶ Exporting verification key..."
snarkjs zkey export verificationkey zk/CreditScore_final.zkey zk/verification_key.json
echo "✓ Verification key exported → zk/verification_key.json"

# ── 7. Sanity check ───────────────────────────────────────────
echo ""
echo "▶ Sanity check — generating test proof..."
cat > /tmp/input.json << 'EOF'
{
  "score": "710",
  "salt":  "12345678901234567890"
}
EOF

snarkjs groth16 fullprove \
  /tmp/input.json \
  zk/CreditScore_js/CreditScore.wasm \
  zk/CreditScore_final.zkey \
  /tmp/proof.json \
  /tmp/public.json

echo "Test proof public signals:"
cat /tmp/public.json

snarkjs groth16 verify \
  zk/verification_key.json \
  /tmp/public.json \
  /tmp/proof.json

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✓ ZK circuit ready!                     ║"
echo "╠══════════════════════════════════════════╣"
echo "║  zk/CreditScore_js/CreditScore.wasm      ║"
echo "║  zk/CreditScore_final.zkey               ║"
echo "║  zk/verification_key.json                ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Next: git add zk/ && git commit -m 'feat: ZK circuit artifacts' && git push"