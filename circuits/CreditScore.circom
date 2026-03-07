pragma circom 2.1.6;

/*
  CreditScore.circom — TrustBox
  ─────────────────────────────────────────────────────────────
  Proves a private credit score falls within a public band
  WITHOUT revealing the actual score.

  Private inputs:
    score  — actual credit score (300–850)
    salt   — random blinding factor

  Public outputs (publicSignals):
    [0] scoreHash  — Poseidon(score, salt) binds prover to score
    [1] scoreBand  — 1=Poor | 2=Fair | 3=Good | 4=Excellent

  Band ranges:
    1  Poor        300–579
    2  Fair        580–669
    3  Good        670–739
    4  Excellent   740–850
*/

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template InRange(n) {
    signal input  x;
    signal input  lo;
    signal input  hi;
    signal output out;

    component gteLo = GreaterEqThan(n);
    gteLo.in[0] <== x;
    gteLo.in[1] <== lo;

    component lteHi = LessEqThan(n);
    lteHi.in[0] <== x;
    lteHi.in[1] <== hi;

    out <== gteLo.out * lteHi.out;
}

template CreditScore() {
    // Private
    signal input score;
    signal input salt;

    // Public
    signal output scoreHash;
    signal output scoreBand;

    // 1. Poseidon commitment
    component hasher = Poseidon(2);
    hasher.inputs[0] <== score;
    hasher.inputs[1] <== salt;
    scoreHash <== hasher.out;

    // 2. Score must be 300–850
    component validRange = InRange(10);
    validRange.x  <== score;
    validRange.lo <== 300;
    validRange.hi <== 850;
    validRange.out === 1;

    // 3. Band membership checks
    component isPoor = InRange(10);
    isPoor.x  <== score; isPoor.lo <== 300; isPoor.hi <== 579;

    component isFair = InRange(10);
    isFair.x  <== score; isFair.lo <== 580; isFair.hi <== 669;

    component isGood = InRange(10);
    isGood.x  <== score; isGood.lo <== 670; isGood.hi <== 739;

    component isExcellent = InRange(10);
    isExcellent.x  <== score; isExcellent.lo <== 740; isExcellent.hi <== 850;

    // 4. scoreBand = 1*poor + 2*fair + 3*good + 4*excellent
    scoreBand <== 1 * isPoor.out
                + 2 * isFair.out
                + 3 * isGood.out
                + 4 * isExcellent.out;

    // 5. Band must resolve to 1–4
    component bandValid = InRange(4);
    bandValid.x  <== scoreBand;
    bandValid.lo <== 1;
    bandValid.hi <== 4;
    bandValid.out === 1;
}

component main { public [scoreHash, scoreBand] } = CreditScore();
