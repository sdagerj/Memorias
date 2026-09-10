/**
 * Corpus para fluidez semántica, con subcategorías.
 *
 * Las subcategorías cumplen dos funciones: reconocer si una palabra pertenece
 * a la categoría pedida y decidir si dos palabras seguidas forman racimo.
 *
 * El corpus está en español de Colombia e incluye términos de uso local
 * (chigüiro, curí, borojó, lulo, guanábana). Nunca estará completo, y por eso
 * la aplicación deja las palabras desconocidas en revisión manual en vez de
 * descartarlas.
 */

export interface Categoria {
  id: string
  /** Consigna tal como se lee en voz alta. */
  consigna: string
  /** Subcategoría → palabras que pertenecen a ella. */
  grupos: Record<string, string[]>
}

export const CATEGORIAS: Categoria[] = [
  {
    id: 'animales',
    consigna: 'Nombres de animales',
    grupos: {
      mascotas: ['perro', 'gato', 'hámster', 'canario', 'periquito', 'conejo', 'curí', 'tortuga', 'pez dorado', 'loro'],
      granja: ['vaca', 'caballo', 'cerdo', 'gallina', 'gallo', 'oveja', 'cabra', 'pato', 'ganso', 'burro', 'mula', 'ternero', 'pavo'],
      selva: ['león', 'tigre', 'jaguar', 'mono', 'elefante', 'jirafa', 'cebra', 'hipopótamo', 'rinoceronte', 'pantera', 'gorila', 'chimpancé', 'leopardo', 'oso'],
      colombianos: ['chigüiro', 'danta', 'oso de anteojos', 'cóndor', 'tucán', 'perezoso', 'armadillo', 'ocelote', 'delfín rosado', 'manatí', 'venado', 'zorro', 'puma', 'nutria'],
      aves: ['águila', 'halcón', 'paloma', 'gorrión', 'colibrí', 'garza', 'flamenco', 'búho', 'lechuza', 'pelícano', 'avestruz', 'pingüino', 'gaviota', 'cuervo', 'golondrina'],
      marinos: ['tiburón', 'ballena', 'delfín', 'pulpo', 'calamar', 'medusa', 'cangrejo', 'langosta', 'camarón', 'atún', 'sardina', 'trucha', 'mojarra', 'foca', 'morsa', 'estrella de mar'],
      insectos: ['mosca', 'mosquito', 'abeja', 'avispa', 'hormiga', 'mariposa', 'escarabajo', 'grillo', 'saltamontes', 'libélula', 'cucaracha', 'araña', 'alacrán', 'luciérnaga'],
      reptiles: ['serpiente', 'lagarto', 'iguana', 'cocodrilo', 'caimán', 'camaleón', 'boa', 'anaconda', 'rana', 'sapo', 'salamandra'],
      roedores: ['ratón', 'rata', 'ardilla', 'castor', 'puercoespín', 'chinchilla', 'marmota'],
    },
  },
  {
    id: 'frutas',
    consigna: 'Nombres de frutas',
    grupos: {
      tropicales: ['mango', 'papaya', 'piña', 'maracuyá', 'guanábana', 'guayaba', 'lulo', 'borojó', 'zapote', 'níspero', 'tamarindo', 'chontaduro', 'anón', 'carambolo', 'granadilla', 'curuba', 'uchuva', 'pitahaya', 'mamoncillo', 'corozo'],
      citricos: ['naranja', 'mandarina', 'limón', 'lima', 'toronja', 'pomelo'],
      bosque: ['fresa', 'mora', 'frambuesa', 'arándano', 'agraz'],
      arbol: ['manzana', 'pera', 'durazno', 'ciruela', 'cereza', 'albaricoque', 'higo', 'membrillo', 'níspero japonés'],
      melones: ['sandía', 'melón', 'patilla'],
      otras: ['banano', 'plátano', 'uva', 'kiwi', 'coco', 'aguacate', 'granada', 'dátil', 'caqui'],
    },
  },
  {
    id: 'profesiones',
    consigna: 'Nombres de profesiones u oficios',
    grupos: {
      salud: ['médico', 'enfermero', 'odontólogo', 'psicólogo', 'psiquiatra', 'cirujano', 'pediatra', 'fisioterapeuta', 'nutricionista', 'veterinario', 'bacteriólogo', 'optómetra', 'neuropsicólogo', 'radiólogo'],
      educacion: ['profesor', 'maestro', 'rector', 'bibliotecario', 'investigador', 'pedagogo', 'tutor'],
      tecnicos: ['ingeniero', 'arquitecto', 'electricista', 'plomero', 'mecánico', 'soldador', 'carpintero', 'albañil', 'técnico', 'programador', 'topógrafo'],
      oficinas: ['contador', 'abogado', 'economista', 'administrador', 'gerente', 'secretario', 'auditor', 'analista', 'banquero', 'notario', 'actuario'],
      servicios: ['peluquero', 'panadero', 'cocinero', 'chef', 'mesero', 'taxista', 'conductor', 'cajero', 'vendedor', 'costurero', 'sastre', 'zapatero', 'barbero', 'jardinero', 'celador'],
      artes: ['pintor', 'músico', 'actor', 'escritor', 'periodista', 'fotógrafo', 'diseñador', 'bailarín', 'cantante', 'escultor', 'director'],
      seguridad: ['policía', 'bombero', 'soldado', 'militar', 'vigilante', 'detective', 'paramédico'],
      campo: ['agricultor', 'campesino', 'ganadero', 'pescador', 'minero', 'apicultor', 'cafetero'],
      aire: ['piloto', 'azafata', 'controlador aéreo', 'marinero', 'capitán'],
    },
  },
  {
    id: 'ciudades',
    consigna: 'Nombres de ciudades',
    grupos: {
      colombia: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Pereira', 'Manizales', 'Armenia', 'Ibagué', 'Cúcuta', 'Villavicencio', 'Santa Marta', 'Pasto', 'Neiva', 'Popayán', 'Montería', 'Tunja', 'Valledupar', 'Sincelejo', 'Riohacha', 'Quibdó', 'Florencia', 'Yopal', 'Leticia', 'Buenaventura', 'Palmira', 'Tuluá', 'Girardot', 'Sogamoso', 'Duitama', 'Zipaquirá', 'Chía', 'Facatativá'],
      america: ['Lima', 'Quito', 'Caracas', 'Buenos Aires', 'Santiago', 'Montevideo', 'Asunción', 'La Paz', 'Brasilia', 'São Paulo', 'Río de Janeiro', 'Ciudad de México', 'Guadalajara', 'Monterrey', 'La Habana', 'Panamá', 'San José', 'Managua', 'Tegucigalpa', 'Guatemala', 'Nueva York', 'Chicago', 'Miami', 'Los Ángeles', 'Toronto', 'Montreal', 'Boston', 'Houston', 'Seattle', 'Washington'],
      europa: ['Madrid', 'Barcelona', 'Sevilla', 'Valencia', 'Bilbao', 'París', 'Lyon', 'Marsella', 'Roma', 'Milán', 'Venecia', 'Nápoles', 'Turín', 'Lisboa', 'Oporto', 'Londres', 'Berlín', 'Múnich', 'Ámsterdam', 'Bruselas', 'Viena', 'Praga', 'Varsovia', 'Estocolmo', 'Oslo', 'Copenhague', 'Dublín', 'Atenas', 'Zúrich', 'Ginebra', 'Moscú'],
      asia: ['Tokio', 'Pekín', 'Shanghái', 'Seúl', 'Bangkok', 'Singapur', 'Yakarta', 'Manila', 'Bombay', 'Delhi', 'Dubái', 'Estambul', 'Jerusalén', 'Teherán', 'Hong Kong', 'Katmandú'],
      africa: ['El Cairo', 'Nairobi', 'Ciudad del Cabo', 'Johannesburgo', 'Marrakech', 'Casablanca', 'Túnez', 'Argel', 'Lagos', 'Adís Abeba', 'Dakar'],
      oceania: ['Sídney', 'Melbourne', 'Canberra', 'Auckland', 'Wellington', 'Brisbane', 'Perth'],
    },
  },
  {
    id: 'instrumentos',
    consigna: 'Nombres de instrumentos musicales',
    grupos: {
      cuerda: ['guitarra', 'tiple', 'bandola', 'requinto', 'violín', 'viola', 'violonchelo', 'contrabajo', 'arpa', 'bajo', 'mandolina', 'banjo', 'ukelele', 'laúd', 'cuatro'],
      viento: ['flauta', 'clarinete', 'saxofón', 'trompeta', 'trombón', 'tuba', 'oboe', 'fagot', 'corno', 'gaita', 'quena', 'zampoña', 'armónica', 'flautín'],
      percusion: ['tambor', 'batería', 'timbal', 'bongó', 'conga', 'tambora', 'llamador', 'alegre', 'maracas', 'guacharaca', 'güiro', 'pandereta', 'triángulo', 'xilófono', 'marimba', 'platillos', 'cajón', 'claves'],
      teclado: ['piano', 'órgano', 'acordeón', 'clavecín', 'sintetizador', 'melódica'],
    },
  },
  {
    id: 'herramientas',
    consigna: 'Nombres de herramientas',
    grupos: {
      golpe: ['martillo', 'mazo', 'almádena', 'cincel', 'punzón', 'formón'],
      corte: ['serrucho', 'sierra', 'segueta', 'tijeras', 'cuchillo', 'cortadora', 'guadaña', 'machete', 'hacha', 'cúter', 'cizalla'],
      apriete: ['destornillador', 'llave inglesa', 'llave de tubo', 'alicate', 'pinza', 'tenaza', 'prensa', 'gato'],
      medida: ['metro', 'cinta métrica', 'nivel', 'escuadra', 'calibrador', 'plomada', 'compás', 'regla'],
      electricas: ['taladro', 'pulidora', 'lijadora', 'caladora', 'soldador', 'esmeril', 'compresor', 'atornillador'],
      jardin: ['pala', 'azadón', 'rastrillo', 'carretilla', 'podadora', 'manguera', 'regadera', 'pico', 'barra'],
      otras: ['clavo', 'tornillo', 'brocha', 'rodillo', 'espátula', 'llana', 'balde', 'escalera', 'linterna', 'lima'],
    },
  },
]

/** Índice de palabra normalizada → subcategoría, por categoría. */
export type IndiceCategoria = Map<string, string>
