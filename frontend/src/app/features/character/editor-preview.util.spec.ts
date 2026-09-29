import { defaultAvatar } from './avatar-config.util';
import { editorPreview, sheetFrameStyle, SheetPreview } from './editor-preview.util';

function withCast(castId: string | undefined) {
  return { ...defaultAvatar(), castId };
}

describe('editorPreview', () => {
  it('sin personaje del elenco usa la figura modular', () => {
    expect(editorPreview(withCast(undefined), 'front')).toEqual({ kind: 'modular' });
  });

  it('un castId desconocido cae a la figura modular', () => {
    expect(editorPreview(withCast('no-existe'), 'front')).toEqual({ kind: 'modular' });
  });

  it('un personaje v1 usa su hoja idle a escala 4 y filas reales por dirección', () => {
    const front = editorPreview(withCast('valentina'), 'front') as SheetPreview;
    expect(front).toMatchObject({
      kind: 'sheet', url: '/assets/characters/v1/valentina/base/idle.png',
      cols: 4, rows: 4, col: 0, row: 0, frameWidth: 48, frameHeight: 72, scale: 4, flipX: false,
    });
    expect((editorPreview(withCast('valentina'), 'left') as SheetPreview).row).toBe(1);
    expect((editorPreview(withCast('valentina'), 'right') as SheetPreview).row).toBe(2);
    expect((editorPreview(withCast('valentina'), 'left') as SheetPreview).flipX).toBe(false);
  });

  it('un personaje horneado sin v1 usa su hoja a escala 1 y espeja la izquierda', () => {
    const front = editorPreview(withCast('samuel'), 'front') as SheetPreview;
    expect(front).toMatchObject({
      kind: 'sheet', url: '/assets/characters/cast/samuel.png',
      cols: 3, rows: 3, col: 0, row: 0, frameWidth: 128, frameHeight: 192, scale: 1, flipX: false,
    });
    expect(editorPreview(withCast('samuel'), 'left')).toMatchObject({ row: 1, flipX: true });
    expect(editorPreview(withCast('samuel'), 'right')).toMatchObject({ row: 1, flipX: false });
  });
});

describe('sheetFrameStyle', () => {
  it('posiciona el cuadro en píxeles enteros', () => {
    const left = editorPreview(withCast('valentina'), 'left') as SheetPreview;
    expect(sheetFrameStyle(left)).toEqual({
      width: '192px',
      height: '288px',
      'background-image': "url('/assets/characters/v1/valentina/base/idle.png')",
      'background-size': '768px 1152px',
      'background-position': '0px -288px',
      transform: 'none',
    });
  });

  it('espeja con scaleX cuando corresponde', () => {
    const left = editorPreview(withCast('samuel'), 'left') as SheetPreview;
    expect(sheetFrameStyle(left)['transform']).toBe('scaleX(-1)');
    expect(sheetFrameStyle(left)['background-position']).toBe('0px -192px');
  });
});
