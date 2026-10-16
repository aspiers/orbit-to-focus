import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../../src/store.ts';
import { reverse, stepSpeed, togglePause } from '../../src/time.ts';

const speed = () => settings.get().speed;

describe('time controls', () => {
  beforeEach(() => settings.set({ speed: 600, lastSpeed: 60 }));

  it('steps through the speed list and stops at its ends', () => {
    stepSpeed(1); expect(speed()).toBe(3600);
    stepSpeed(-1); stepSpeed(-1); expect(speed()).toBe(60);
    for (let i = 0; i < 10; i++) stepSpeed(-1);
    expect(speed()).toBe(1);
    for (let i = 0; i < 10; i++) stepSpeed(1);
    expect(speed()).toBe(604800);
  });

  it('snaps a speed between list entries onto the list', () => {
    settings.set({ speed: 1000 });
    stepSpeed(1); expect(speed()).toBe(21600);
  });

  it('keeps the direction while stepping', () => {
    reverse(); expect(speed()).toBe(-600);
    stepSpeed(1); expect(speed()).toBe(-3600);
    stepSpeed(-1); expect(speed()).toBe(-600);
  });

  it('pauses and resumes at the same speed and direction', () => {
    reverse();
    togglePause(); expect(settings.get()).toMatchObject({ speed: 0, lastSpeed: -600 });
    togglePause(); expect(speed()).toBe(-600);
  });

  it('reverses while paused without starting time', () => {
    togglePause(); reverse();
    expect(settings.get()).toMatchObject({ speed: 0, lastSpeed: -600 });
    togglePause(); expect(speed()).toBe(-600);
  });

  it('steps from paused starting at the last speed', () => {
    togglePause(); stepSpeed(1);
    expect(speed()).toBe(3600);
  });
});
