import { describe, it, expect } from 'vitest';
import {
  parseFightConfig, DEFAULT_FIGHT_CONFIG, STAMINA_PRESETS, staminaByName,
  MAX_STAMINA, JUMP_COST, HEAVY_COST,
} from './constants';

describe('parseFightConfig', () => {
  it('empty / quick-match settings give the default ruleset (legacy values)', () => {
    const c = parseFightConfig('');
    expect(c.roundSeconds).toBe(60);
    expect(c.maxHp).toBe(100);
    expect(c.roundsToWin).toBe(2);
    expect(c.maxRounds).toBe(3);
    expect(c.staminaName).toBe('normal');
    expect(c.stamina.enabled).toBe(true);
  });

  it('DEFAULT_FIGHT_CONFIG normal preset mirrors the legacy stamina constants (no drift)', () => {
    expect(DEFAULT_FIGHT_CONFIG.stamina.max).toBe(MAX_STAMINA);
    expect(DEFAULT_FIGHT_CONFIG.stamina.jumpCost).toBe(JUMP_COST);
    expect(DEFAULT_FIGHT_CONFIG.stamina.heavyCost).toBe(HEAVY_COST);
  });

  it('parses a full settings string', () => {
    const c = parseFightConfig('t=99;hp=150;stam=hardcore;rw=3');
    expect(c.roundSeconds).toBe(99);
    expect(c.maxHp).toBe(150);
    expect(c.staminaName).toBe('hardcore');
    expect(c.stamina).toEqual(STAMINA_PRESETS.hardcore);
    expect(c.roundsToWin).toBe(3);
    expect(c.maxRounds).toBe(5); // Bo5
  });

  it('rounds-to-win maps to the best-of cap: Bo1=1, Bo3=3, Bo5=5', () => {
    expect(parseFightConfig('rw=1').maxRounds).toBe(1);
    expect(parseFightConfig('rw=2').maxRounds).toBe(3);
    expect(parseFightConfig('rw=3').maxRounds).toBe(5);
  });

  it('t=0 means no time limit', () => {
    expect(parseFightConfig('t=0;hp=100;stam=normal;rw=2').roundSeconds).toBe(0);
  });

  it('the off preset disables the stamina system', () => {
    const c = parseFightConfig('stam=off');
    expect(c.staminaName).toBe('off');
    expect(c.stamina.enabled).toBe(false);
  });

  it('unknown / garbage stamina names fall back to normal', () => {
    expect(parseFightConfig('stam=bogus').staminaName).toBe('normal');
    expect(parseFightConfig('stam=').staminaName).toBe('normal');
  });

  it('is order-independent and tolerant of whitespace / unknown keys', () => {
    const c = parseFightConfig('rw=3 ; foo=bar ; hp=200 ; t=30 ; stam=casual');
    expect(c.roundSeconds).toBe(30);
    expect(c.maxHp).toBe(200);
    expect(c.staminaName).toBe('casual');
    expect(c.roundsToWin).toBe(3);
  });

  it('clamps out-of-range and non-numeric values to safe bounds', () => {
    const big = parseFightConfig('t=99999;hp=99999;rw=99');
    expect(big.roundSeconds).toBe(600);
    expect(big.maxHp).toBe(1000);
    expect(big.roundsToWin).toBe(5);
    const junk = parseFightConfig('t=abc;hp=;rw=NaN');
    expect(junk.roundSeconds).toBe(60); // default
    expect(junk.maxHp).toBe(100);       // default
    expect(junk.roundsToWin).toBe(2);   // default
  });

  it('staminaByName resolves presets case-insensitively, defaulting to normal', () => {
    expect(staminaByName('HARDCORE')).toEqual(STAMINA_PRESETS.hardcore);
    expect(staminaByName('nope')).toEqual(STAMINA_PRESETS.normal);
    expect(staminaByName('')).toEqual(STAMINA_PRESETS.normal);
  });
});
