"""Las decisiones de un caso, como las ve el juego, para la prueba de que el cuadro de diálogo cabe (bloque I1).

Lee el documento DSL del caso y, por cada diálogo del mapa que lleva a una decisión, escribe el estado de diálogo que
recibe el panel (`DialogueState` de `simulation.model.ts`): quien habla, sus líneas y las elecciones con el texto del
mapa (el que el juego pone en las fichas). Para medir el peor caso, toda elección con herramienta sale como «aún no
tienes esta herramienta» y todas llevan el aviso de «puedes conocer más».

    python tools/escenarios/decisiones_para_prueba.py [--caso RUTA] [--destino RUTA]
"""
import argparse
import json
import os

RAIZ = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
CASO = os.path.join('backend_django', 'apps', 'simulation', 'data', 'cases', 'SIM-VBG-002.dsl.json')
DESTINO = os.path.join(RAIZ, 'frontend', 'captura-i1', 'decisiones-sim-vbg-002.json')
AVISO = 'Puedes conocer más antes de responder.'


def decisiones(doc):
    salida = []
    for escena in doc['x-siep']['escenas']:
        claves = {o['clave'] for o in escena.get('opciones', [])}
        for g in escena.get('mapa', {}).get('dialogos', []):
            elecciones = sorted(g.get('elecciones', []), key=lambda c: c.get('orden', 0))
            if not any(c.get('opcion') in claves for c in elecciones):
                continue
            salida.append(dict(
                key=f"prueba-{escena['clave']}-{g['clave']}",
                speakerName=g['hablante'],
                portraitKey=g.get('retrato'),
                emotion=g.get('emocion') or 'neutral',
                lines=[dict(order=l['orden'], speakerName=l['hablante'], text=l['texto'], emotion=l.get('emocion') or 'neutral')
                       for l in sorted(g.get('lineas', []), key=lambda l: l['orden'])],
                choices=[dict(key=c['clave'], text=c['texto'],
                              decisionOptionId=(i + 1) if c.get('opcion') else None,
                              requiredToolCode=c.get('herramientaRequerida'), effect={},
                              toolMissing=bool(c.get('herramientaRequerida')))
                         for i, c in enumerate(elecciones)],
                notice=AVISO,
            ))
    return salida


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--caso', default=os.path.normpath(os.path.join(RAIZ, '..', 'k1', CASO)))
    ap.add_argument('--destino', default=DESTINO)
    a = ap.parse_args()
    with open(a.caso, encoding='utf-8') as f:
        doc = json.load(f)
    lista = decisiones(doc)
    with open(a.destino, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(dict(caso=doc['caso']['id'], decisiones=lista), f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(len(lista), 'decisiones ->', a.destino)


if __name__ == '__main__':
    main()
