pragma circom 2.0.0;

/*
 * TrustBox CreditScore Circuit
 * ─────────────────────────────
 * Proves a credit score falls within a band WITHOUT revealing the actual score.
 *
 * Private inputs:  score (300–850), salt (random blinding factor)
 * Public outputs:  scoreHash, scoreBand
 *
 * Score bands:
 *   1 = Poor      (300–579)
 *   2 = Fair      (580–669)
 *   3 = Good      (670–739)
 *   4 = Excellent (740–850)
 *
 * The circuit proves:
 *   1. score is in range [300, 850]
 *   2. scoreHash = Poseidon(score, salt)
 *   3. scoreBand is correctly derived from score
 */

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template CreditScore() {
    // ── Private inputs ────────────────────────────────────────
    signal input score;   // actual score (300–850) — never revealed
    signal input salt;    // random blinding factor

    // ── Public outputs ────────────────────────────────────────
    signal output scoreHash;  // Poseidon(score, salt) — commitment
    signal output scoreBand;  // 1=Poor, 2=Fair, 3=Good, 4=Excellent

    // ── 1. Range check: 300 ≤ score ≤ 850 ────────────────────
    component gte300 = GreaterEqThan(10);  // 10 bits covers 0–1023
    gte300.in[0] <== score;
    gte300.in[1] <== 300;
    gte300.out === 1;

    component lte850 = LessEqThan(10);
    lte850.in[0] <== score;
    lte850.in[1] <== 850;
    lte850.out === 1;

    // ── 2. Compute score commitment ───────────────────────────
    component hasher = Poseidon(2);
    hasher.inputs[0] <== score;
    hasher.inputs[1] <== salt;
    scoreHash <== hasher.out;

    // ── 3. Derive score band ──────────────────────────────────
    // Band 4: score >= 740
    component gte740 = GreaterEqThan(10);
    gte740.in[0] <== score;
    gte740.in[1] <== 740;

    // Band 3: score >= 670
    component gte670 = GreaterEqThan(10);
    gte670.in[0] <== score;
    gte670.in[1] <== 670;

    // Band 2: score >= 580
    component gte580 = GreaterEqThan(10);
    gte580.in[0] <== score;
    gte580.in[1] <== 580;

    // scoreBand = 1 + (score>=580) + (score>=670) + (score>=740)
    scoreBand <== 1 + gte580.out + gte670.out + gte740.out;
}

component main { public [scoreHash, scoreBand] } = CreditScore();
