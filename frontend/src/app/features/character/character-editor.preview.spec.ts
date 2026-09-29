import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'character-editor.component.ts'), 'utf-8');

describe('editor de personaje: vista previa y resumen', () => {
  it('la etapa dibuja la hoja del personaje elegido y cae a la figura clásica', () => {
    expect(source).toContain('@if (previewStyle(); as frame) {');
    expect(source).toContain('<span class="ce-sheet" role="img" [attr.aria-label]="\'Vista previa de \' + castLabel()" [ngStyle]="frame"></span>');
    expect(source).toContain('readonly preview = computed(() => editorPreview(this.avatar(), this.view()));');
  });

  it('el resumen describe la elección real', () => {
    expect(source).toContain('<li><span>Personaje</span><strong>{{ castLabel() }}</strong></li>');
  });

  it('sin faltas de ortografía en las etiquetas', () => {
    for (const wrong of ['>Genero<', '"Genero"', '>Expresion<', '"Expresion"', '>Proximamente<', 'expresion ${']) {
      expect(source).not.toContain(wrong);
    }
  });
});
