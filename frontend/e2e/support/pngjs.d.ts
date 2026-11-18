// Tipos mínimos de `pngjs` para las pruebas e2e que comparan capturas píxel a píxel (el paquete no trae los suyos).
declare module 'pngjs' {
  export interface ImagenPng {
    width: number;
    height: number;
    data: Buffer;
  }
  export const PNG: {
    sync: {
      read(buffer: Buffer): ImagenPng;
      write(png: ImagenPng): Buffer;
    };
  };
}
