import {
  doorTarget, setDoorTarget, doorEntry, setDoorEntry,
  cameraZoom, setCameraZoom, backgroundImage, setBackgroundImage,
} from './room-edit.util';

describe('room-edit.util', () => {
  it('door target get/set', () => {
    expect(doorTarget(null)).toBe('');
    expect(doorTarget({ targetNodeKey: 'sala-2' })).toBe('sala-2');
    expect(setDoorTarget({}, 'sala-3')).toEqual({ targetNodeKey: 'sala-3' });
    expect(setDoorTarget({ entryX: 5 }, 'sala-3')).toEqual({ entryX: 5, targetNodeKey: 'sala-3' });
  });

  it('door entry get/set', () => {
    expect(doorEntry({ entryX: 10, entryY: 20 })).toEqual([10, 20]);
    expect(doorEntry(null)).toEqual([0, 0]);
    expect(setDoorEntry({ targetNodeKey: 's' }, 4, 8)).toEqual({ targetNodeKey: 's', entryX: 4, entryY: 8 });
  });

  it('camera zoom get/set clamps 0.25..4', () => {
    expect(cameraZoom(null)).toBe(1);
    expect(cameraZoom({ cameraZoom: 2 })).toBe(2);
    expect(setCameraZoom({}, 1.5)).toEqual({ cameraZoom: 1.5 });
    expect(setCameraZoom({}, 99)).toEqual({ cameraZoom: 4 });
    expect(setCameraZoom({}, 0)).toEqual({ cameraZoom: 0.25 });
  });

  it('background image get/set', () => {
    expect(backgroundImage(null)).toBe('');
    expect(backgroundImage({ backgroundImage: 'a.png' })).toBe('a.png');
    expect(setBackgroundImage({ cameraZoom: 2 }, 'b.png')).toEqual({ cameraZoom: 2, backgroundImage: 'b.png' });
    expect(setBackgroundImage({ backgroundImage: 'b.png' }, '')).toEqual({});
  });
});
