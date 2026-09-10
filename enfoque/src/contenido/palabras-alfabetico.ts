/**
 * Palabras para el ejercicio de ordenamiento alfabético.
 *
 * Criterios: sustantivos concretos, de dos o tres sílabas, frecuentes y sin
 * ambigüedad al oírlos. Se evitan palabras que suenen parecido entre sí
 * (`baso`/`vaso`), porque un error de escucha se registraría como error de
 * ordenamiento. Se evitan también las que empiezan por letras poco usadas.
 */

export const PALABRAS_ALFABETICO: readonly string[] = [
  'árbol', 'agua', 'anillo', 'avión', 'abrigo',
  'barco', 'botella', 'bosque', 'bandeja', 'bombillo',
  'casa', 'camino', 'cuchara', 'cortina', 'campana',
  'dedo', 'ducha', 'dinero', 'diamante',
  'escoba', 'espejo', 'escalera', 'estufa',
  'fuego', 'flor', 'fresa', 'fábrica', 'frasco',
  'gato', 'gorra', 'guitarra', 'granja',
  'hoja', 'harina', 'hospital', 'hormiga',
  'iglesia', 'isla', 'imán',
  'jardín', 'jabón', 'jarra', 'joya',
  'lápiz', 'libro', 'llave', 'lámpara', 'leche',
  'mesa', 'mano', 'martillo', 'montaña', 'mochila',
  'nube', 'nido', 'naranja', 'nevera',
  'ojo', 'olla', 'oso', 'oficina',
  'pan', 'perro', 'puerta', 'piedra', 'plato',
  'queso', 'quiosco',
  'reloj', 'río', 'rueda', 'radio',
  'silla', 'sombrero', 'semilla', 'sartén',
  'techo', 'tijera', 'tren', 'taza', 'toalla',
  'uva', 'uña',
  'vaso', 'vela', 'violín', 'valija', 'ventana',
  'zapato', 'zorro', 'zanahoria',
]
