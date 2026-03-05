#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# TrustBox — ZK Credit Score Circuit Compiler
# Run from project root: bash zk/compile.sh
#
# Prerequisites:
#   npm install -g circom snarkjs
#   npm install circomlib
# ─────────────────────────────────────────────────────────────────────────────

set -e

ZK_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$ZK_DIR/build"
PTAU_FILE="$ZK_DIR/powersOfTau28_hez_final_12.ptau"

mkdir -p "$BUILD_DIR"

echo "═══════════════════════════════════════════════════"
echo "  TrustBox — ZK Circuit Compilation"
echo "═══════════════════════════════════════════════════"

# ── 1. Download powers of tau (if needed) ────────────────────
if [ ! -f "$PTAU_FILE" ]; then
  echo ""
  echo "📥 Downloading Powers of Tau (Hermez, 12)..."
  curl -L -o "$PTAU_FILE" \
    "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau"
  echo "  ✅ Downloaded"
fi

# ── 2. Compile circuit ────────────────────────────────────────
echo ""
echo "⚙️  Compiling CreditScore.circom..."
circom "$ZK_DIR/CreditScore.circom" \
  --r1cs \
  --wasm \
  --sym \
  --output "$BUILD_DIR"
echo "  ✅ Circuit compiled"

# ── 3. Generate zkey (Groth16 trusted setup) ─────────────────
echo ""
echo "🔑 Running trusted setup..."
snarkjs groth16 setup \
  "$BUILD_DIR/CreditScore.r1cs" \
  "$PTAU_FILE" \
  "$BUILD_DIR/CreditScore_0000.zkey"

echo ""
echo "📝 Contributing to ceremony (dev randomness)..."
echo "trustbox-dev-entropy-$(date +%s)" | \
  snarkjs zkey contribute \
    "$BUILD_DIR/CreditScore_0000.zkey" \
    "$BUILD_DIR/CreditScore_final.zkey" \
    --name="TrustBox Dev" -v

# ── 4. Export verification key ────────────────────────────────
echo ""
echo "📤 Exporting verification key..."
snarkjs zkey export verificationkey \
  "$BUILD_DIR/CreditScore_final.zkey" \
  "$BUILD_DIR/verification_key.json"
echo "  ✅ Verification key exported"

# ── 5. Copy outputs to expected paths ────────────────────────
echo ""
echo "📁 Copying to project paths..."

# Backend expects these paths (from config/env.ts)
cp "$BUILD_DIR/CreditScore_js/CreditScore.wasm" "$ZK_DIR/../zk/CreditScore_js/CreditScore.wasm" 2>/dev/null || \
  (mkdir -p "$ZK_DIR/../zk/CreditScore_js" && cp "$BUILD_DIR/CreditScore_js/CreditScore.wasm" "$ZK_DIR/../zk/CreditScore_js/CreditScore.wasm")

cp "$BUILD_DIR/CreditScore_final.zkey"  "$ZK_DIR/../zk/CreditScore_final.zkey"
cp "$BUILD_DIR/verification_key.json"   "$ZK_DIR/../zk/verification_key.json"

echo "  ✅ Files copied to zk/"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ ZK circuit ready!"
echo "  Files:"
echo "    zk/CreditScore_js/CreditScore.wasm"
echo "    zk/CreditScore_final.zkey"
echo "    zk/verification_key.json"
echo ""
echo "  Update .env:"
echo "    ZK_WASM_PATH=./zk/CreditScore_js/CreditScore.wasm"
echo "    ZK_ZKEY_PATH=./zk/CreditScore_final.zkey"
echo "    ZK_VKEY_PATH=./zk/verification_key.json"
echo "═══════════════════════════════════════════════════"